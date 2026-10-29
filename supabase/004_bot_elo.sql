-- STATUS: not applied to the database yet (waiting for approval in Supabase).
-- Bot matches change the rating too, at half weight (K = 16 instead of 32), against a fixed bot
-- rating per difficulty: Easy 800, Medium 1000, Hard 1250. Elo math keeps farming slow: at 1200,
-- a win against Easy bots gives +1, against Hard bots +9.
alter table private.tickets add column if not exists diff text not null default 'medium'
  check (diff in ('easy', 'medium', 'hard'));

drop function if exists public.bb_start_match(text);
create or replace function public.bb_start_match(p_mode text, p_diff text default 'medium')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  t uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_mode not in ('1v1', '2v2', '3v3') then raise exception 'bad mode'; end if;
  if coalesce(p_diff, 'medium') not in ('easy', 'medium', 'hard') then raise exception 'bad difficulty'; end if;
  delete from private.tickets where player_id = uid;
  insert into private.tickets (player_id, mode, diff) values (uid, p_mode, coalesce(p_diff, 'medium')) returning id into t;
  return t;
end;
$$;

create or replace function public.bb_finish_match(p_ticket uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  t private.tickets;
  secs int;
  s public.player_stats;
  us int; them int;
  mine int; bot int; e numeric; sres numeric; d int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  delete from private.tickets where id = p_ticket and player_id = uid returning * into t;
  if t.id is null then raise exception 'unknown match'; end if;
  secs := extract(epoch from now() - t.created_at)::int;
  if secs < 285 then raise exception 'match too short'; end if;
  us := least(greatest(coalesce((p->>'score_us')::int, 0), 0), 30);
  them := least(greatest(coalesce((p->>'score_them')::int, 0), 0), 30);
  insert into public.player_stats (id) values (uid) on conflict (id) do nothing;
  select * into s from public.player_stats where id = uid for update;
  mine := private.elo_of(s, t.mode);
  bot := case t.diff when 'easy' then 800 when 'hard' then 1250 else 1000 end;
  e := 1 / (1 + power(10, (bot - mine)::numeric / 400));
  sres := case when us > them then 1 when us = them then 0.5 else 0 end;
  d := round(16 * (sres - e));
  update public.player_stats set
    elo_1v1 = elo_1v1 + (case when t.mode = '1v1' then d else 0 end),
    elo_2v2 = elo_2v2 + (case when t.mode = '2v2' then d else 0 end),
    elo_3v3 = elo_3v3 + (case when t.mode = '3v3' then d else 0 end)
  where id = uid;
  perform private.apply_result(uid, t.mode, coalesce((p->>'team')::int, 0), us, them,
    p, coalesce((p->>'mvp')::boolean, false), false, false, d, secs);
  select * into s from public.player_stats where id = uid;
  return to_jsonb(s) || jsonb_build_object('elo_before', mine, 'elo_after', mine + d);
end;
$$;

revoke all on function public.bb_start_match(text, text), public.bb_finish_match(uuid, jsonb) from public, anon;
grant execute on function public.bb_start_match(text, text), public.bb_finish_match(uuid, jsonb) to authenticated;
