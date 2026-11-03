-- Fair play.
-- 1. Bot matches get their own rating (bot_elo_*). The public Rank columns (elo_*) move only in
--    online matches against people, and the Rank leaderboards list only players with ranked matches.
-- 2. A bot match gives at most 300 points of XP (plus the win/draw bonus), and only the first 20
--    bot matches in 24 hours count at all. The client sends the score, so these caps are what keep
--    a faked score from topping the leaderboards.
-- 3. Online: the same opponents again and again in 24 hours give less and less Rank.
-- 4. Online: a host who leaves a ranked match takes a loss; the match is void for everyone else.

alter table public.player_stats
  add column if not exists bot_elo_1v1 int not null default 1000,
  add column if not exists bot_elo_2v2 int not null default 1000,
  add column if not exists bot_elo_3v3 int not null default 1000;

-- Ratings so far mixed bots and people. Keep them as the bot rating, and reset the public Rank of
-- modes the player never played ranked online (that Rank came from bots alone).
update public.player_stats set
  bot_elo_1v1 = elo_1v1, bot_elo_2v2 = elo_2v2, bot_elo_3v3 = elo_3v3,
  elo_1v1 = case when ranked_1v1 = 0 then 1000 else elo_1v1 end,
  elo_2v2 = case when ranked_2v2 = 0 then 1000 else elo_2v2 end,
  elo_3v3 = case when ranked_3v3 = 0 then 1000 else elo_3v3 end;

-- Ranked match counts on the public profile, for the Rank leaderboards.
alter table public.profiles
  add column if not exists ranked_1v1 int not null default 0,
  add column if not exists ranked_2v2 int not null default 0,
  add column if not exists ranked_3v3 int not null default 0;

create or replace function private.profiles_ranked()
returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.player_stats;
begin
  select * into s from public.player_stats where id = new.id;
  new.ranked_1v1 := coalesce(s.ranked_1v1, 0);
  new.ranked_2v2 := coalesce(s.ranked_2v2, 0);
  new.ranked_3v3 := coalesce(s.ranked_3v3, 0);
  new.elo_1v1 := coalesce(s.elo_1v1, 1000);
  new.elo_2v2 := coalesce(s.elo_2v2, 1000);
  new.elo_3v3 := coalesce(s.elo_3v3, 1000);
  return new;
end;
$$;
drop trigger if exists profiles_ranked on public.profiles;
-- Runs after profiles_guard (triggers fire in name order).
create trigger profiles_ranked before insert or update on public.profiles
  for each row execute function private.profiles_ranked();
update public.profiles set updated_at = updated_at;

-- XP cap for bot matches (is_online = false).
create or replace function private.apply_result(uid uuid, p_mode text, p_team int, team_us int, team_them int,
  p jsonb, mvp boolean, is_online boolean, is_ranked boolean, elo_change int, seconds int)
returns void language plpgsql security definer set search_path = '' as $$
declare
  us int := least(greatest(team_us, 0), 30);
  them int := least(greatest(team_them, 0), 30);
  won boolean := us > them;
  draw boolean := us = them;
  g int := least(greatest(coalesce((p->>'goals')::int, 0), 0), us, 20);
  a int := least(greatest(coalesce((p->>'assists')::int, 0), 0), us, 20);
  sv int := least(greatest(coalesce((p->>'saves')::int, 0), 0), 40);
  sh int := least(greatest(coalesce((p->>'shots')::int, 0), 0), 80);
  dm int := least(greatest(coalesce((p->>'demos')::int, 0), 0), 40);
  pts int := least(greatest(coalesce((p->>'score')::int, 0), 0), case when is_online then 3000 else 300 end);
  m boolean := coalesce(mvp, false) and won;
begin
  insert into public.player_stats (id) values (uid) on conflict (id) do nothing;
  update public.player_stats set
    matches = matches + 1,
    wins = wins + (case when won then 1 else 0 end),
    goals = goals + g, assists = assists + a, saves = saves + sv, shots = shots + sh, demos = demos + dm,
    mvps = mvps + (case when m then 1 else 0 end),
    hattricks = hattricks + (case when g >= 3 then 1 else 0 end),
    wins_1v1 = wins_1v1 + (case when won and p_mode = '1v1' then 1 else 0 end),
    wins_2v2 = wins_2v2 + (case when won and p_mode = '2v2' then 1 else 0 end),
    wins_3v3 = wins_3v3 + (case when won and p_mode = '3v3' then 1 else 0 end),
    xp = xp + pts + (case when won then 200 when draw then 100 else 50 end),
    updated_at = now()
  where id = uid;
  insert into public.matches (player_id, mode, online, team, won, draw, mvp, score_us, score_them,
    goals, assists, saves, shots, demos, points, seconds, ranked, elo_change)
  values (uid, p_mode, is_online, case when p_team = 1 then 1 else 0 end, won, draw, m, us, them, g, a, sv, sh, dm, pts,
    least(greatest(seconds, 0), 7200), is_ranked, elo_change);
  update public.profiles set updated_at = now() where id = uid;
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
  today int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  delete from private.tickets where id = p_ticket and player_id = uid returning * into t;
  if t.id is null then raise exception 'unknown match'; end if;
  secs := extract(epoch from now() - t.created_at)::int;
  if secs < 285 then raise exception 'match too short'; end if;
  insert into public.player_stats (id) values (uid) on conflict (id) do nothing;
  select count(*) into today from public.matches
    where player_id = uid and not online and played_at > now() - interval '24 hours';
  if today >= 20 then
    select * into s from public.player_stats where id = uid;
    return to_jsonb(s) || jsonb_build_object('capped', true);
  end if;
  us := least(greatest(coalesce((p->>'score_us')::int, 0), 0), 30);
  them := least(greatest(coalesce((p->>'score_them')::int, 0), 0), 30);
  select * into s from public.player_stats where id = uid for update;
  mine := case t.mode when '1v1' then s.bot_elo_1v1 when '2v2' then s.bot_elo_2v2 else s.bot_elo_3v3 end;
  bot := case t.diff when 'easy' then 800 when 'hard' then 1250 when 'ultra' then 1500 else 1000 end;
  e := 1 / (1 + power(10, (bot - mine)::numeric / 400));
  sres := case when us > them then 1 when us = them then 0.5 else 0 end;
  d := round(16 * (sres - e));
  update public.player_stats set
    bot_elo_1v1 = bot_elo_1v1 + (case when t.mode = '1v1' then d else 0 end),
    bot_elo_2v2 = bot_elo_2v2 + (case when t.mode = '2v2' then d else 0 end),
    bot_elo_3v3 = bot_elo_3v3 + (case when t.mode = '3v3' then d else 0 end)
  where id = uid;
  perform private.apply_result(uid, t.mode, coalesce((p->>'team')::int, 0), us, them,
    p, coalesce((p->>'mvp')::boolean, false), false, false, d, secs);
  select * into s from public.player_stats where id = uid;
  return to_jsonb(s) || jsonb_build_object('elo_before', mine, 'elo_after', mine + d, 'bot_rating', true,
    'left_today', 19 - today);
end;
$$;

-- Ranked online. Reports with {"abandon": true} come from players who saw the host leave.
create or replace function private.finalize_online(p_match uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  m public.online_matches;
  best record;
  second_n int;
  r record;
  ra numeric; rb numeric;
  e numeric; sres numeric; d int;
  s public.player_stats;
  secs int;
  hrow public.online_players;
  repeats int;
begin
  select * into m from public.online_matches where id = p_match for update;
  if m.id is null or m.finalized_at is not null then return; end if;
  select avg(private.elo_of(ps, m.mode)) into rb from public.online_players op
    join public.player_stats ps on ps.id = op.player_id where op.match_id = p_match and op.team = 0;
  select avg(private.elo_of(ps, m.mode)) into ra from public.online_players op
    join public.player_stats ps on ps.id = op.player_id where op.match_id = p_match and op.team = 1;

  -- The host left: a loss for the host only, void for everyone else.
  select * into hrow from public.online_players where match_id = p_match and player_id = m.host;
  if hrow.player_id is not null and hrow.report is null
     and exists (select 1 from public.online_players where match_id = p_match and report ? 'abandon') then
    if ra is not null and rb is not null then
      select * into s from public.player_stats where id = m.host for update;
      if hrow.team = 0 then e := 1 / (1 + power(10, (ra - rb) / 400)); else e := 1 / (1 + power(10, (rb - ra) / 400)); end if;
      d := round(32 * (0 - e));
      update public.player_stats set
        elo_1v1 = elo_1v1 + (case when m.mode = '1v1' then d else 0 end),
        elo_2v2 = elo_2v2 + (case when m.mode = '2v2' then d else 0 end),
        elo_3v3 = elo_3v3 + (case when m.mode = '3v3' then d else 0 end),
        ranked_1v1 = ranked_1v1 + (case when m.mode = '1v1' then 1 else 0 end),
        ranked_2v2 = ranked_2v2 + (case when m.mode = '2v2' then 1 else 0 end),
        ranked_3v3 = ranked_3v3 + (case when m.mode = '3v3' then 1 else 0 end),
        matches = matches + 1, updated_at = now()
      where id = m.host;
      update public.online_players set elo_before = private.elo_of(s, m.mode), elo_after = private.elo_of(s, m.mode) + d
        where match_id = p_match and player_id = m.host;
      update public.profiles set updated_at = now() where id = m.host;
    end if;
    update public.online_matches set finalized_at = now(), void = true where id = p_match;
    return;
  end if;

  select (report->>'score_b')::int as b, (report->>'score_o')::int as o, count(*) as n into best
    from public.online_players where match_id = p_match and report is not null and not (report ? 'abandon')
    group by 1, 2 order by n desc limit 1;
  select count(*) into second_n from (
    select 1 from public.online_players where match_id = p_match and report is not null and not (report ? 'abandon')
    group by (report->>'score_b')::int, (report->>'score_o')::int having count(*) = best.n) x;
  if best.n is null or second_n > 1
     or not exists (select 1 from public.online_players where match_id = p_match and team = 0)
     or not exists (select 1 from public.online_players where match_id = p_match and team = 1) then
    update public.online_matches set finalized_at = now(), void = true where id = p_match;
    return;
  end if;
  secs := extract(epoch from now() - m.created_at)::int;
  for r in select * from public.online_players where match_id = p_match loop
    select * into s from public.player_stats where id = r.player_id for update;
    if r.team = 0 then e := 1 / (1 + power(10, (ra - rb) / 400)); else e := 1 / (1 + power(10, (rb - ra) / 400)); end if;
    if r.report is null or r.report ? 'abandon' then sres := 0;
    elsif best.b = best.o then sres := 0.5;
    elsif (r.team = 0) = (best.b > best.o) then sres := 1;
    else sres := 0; end if;
    -- Earlier counted matches in 24 hours against any of today's opponents: the first 3 count in
    -- full, then each one more counts half as much as the one before.
    select count(distinct a.match_id) into repeats
      from public.online_players a
      join public.online_players b on b.match_id = a.match_id and b.team <> a.team
      join public.online_matches m2 on m2.id = a.match_id
      where a.player_id = r.player_id and a.match_id <> p_match
        and m2.finalized_at > now() - interval '24 hours' and not m2.void
        and b.player_id in (select o.player_id from public.online_players o where o.match_id = p_match and o.team <> r.team);
    d := round(32 * (sres - e) * power(0.5, greatest(repeats - 2, 0)));
    update public.player_stats set
      elo_1v1 = elo_1v1 + (case when m.mode = '1v1' then d else 0 end),
      elo_2v2 = elo_2v2 + (case when m.mode = '2v2' then d else 0 end),
      elo_3v3 = elo_3v3 + (case when m.mode = '3v3' then d else 0 end),
      ranked_1v1 = ranked_1v1 + (case when m.mode = '1v1' then 1 else 0 end),
      ranked_2v2 = ranked_2v2 + (case when m.mode = '2v2' then 1 else 0 end),
      ranked_3v3 = ranked_3v3 + (case when m.mode = '3v3' then 1 else 0 end),
      updated_at = now()
    where id = r.player_id;
    update public.online_players set elo_before = private.elo_of(s, m.mode), elo_after = private.elo_of(s, m.mode) + d
      where match_id = p_match and player_id = r.player_id;
    if r.report is not null and not (r.report ? 'abandon') then
      perform private.apply_result(r.player_id, m.mode, r.team,
        case when r.team = 0 then best.b else best.o end, case when r.team = 0 then best.o else best.b end,
        r.report, coalesce((r.report->>'mvp')::boolean, false), true, true, d, secs);
    else
      update public.player_stats set matches = matches + 1 where id = r.player_id;
      update public.profiles set updated_at = now() where id = r.player_id;
    end if;
  end loop;
  update public.online_matches set finalized_at = now(), score_b = best.b, score_o = best.o where id = p_match;
end;
$$;

-- A player saw the host leave a ranked match. No minimum length: the host can leave at any time.
create or replace function public.bb_online_abandon(p_match uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  m public.online_matches;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into m from public.online_matches where id = p_match;
  if m.id is null then raise exception 'unknown match'; end if;
  if m.host = uid then raise exception 'host cannot abandon'; end if;
  update public.online_players set report = jsonb_build_object('abandon', true), reported_at = now()
    where match_id = p_match and player_id = uid and report is null and m.finalized_at is null;
  -- Everyone except the host has spoken: settle now.
  if not exists (select 1 from public.online_players where match_id = p_match and report is null and player_id <> m.host) then
    perform private.finalize_online(p_match);
  end if;
  return public.bb_online_result(p_match);
end;
$$;
revoke all on function public.bb_online_abandon(uuid) from public, anon;
grant execute on function public.bb_online_abandon(uuid) to authenticated;
