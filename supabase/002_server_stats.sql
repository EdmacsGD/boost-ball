-- Boost Ball: stats, achievement items and ranked ratings are decided by the database, not by the
-- player's browser. Players can only change their stats through the functions below, which check
-- every result (time played, per-match caps, both sides of an online match agreeing).

create schema if not exists private;

-- ---------------------------------------------------------------- lifetime stats (server owned)
create table if not exists public.player_stats (
  id uuid primary key references auth.users (id) on delete cascade,
  matches int not null default 0, wins int not null default 0, goals int not null default 0,
  mvps int not null default 0, saves int not null default 0, demos int not null default 0,
  assists int not null default 0, shots int not null default 0, hattricks int not null default 0,
  wins_1v1 int not null default 0, wins_2v2 int not null default 0, wins_3v3 int not null default 0,
  playtime int not null default 0, xp int not null default 0,
  elo_1v1 int not null default 1000, elo_2v2 int not null default 1000, elo_3v3 int not null default 1000,
  ranked_1v1 int not null default 0, ranked_2v2 int not null default 0, ranked_3v3 int not null default 0,
  playtime_at timestamptz, updated_at timestamptz not null default now()
);
alter table public.player_stats enable row level security;
create policy "player_stats: everyone can read" on public.player_stats for select using (true);
-- No insert/update/delete policies: only the security definer functions below write here.

alter table public.profiles add column if not exists elo_1v1 int not null default 1000;
alter table public.profiles add column if not exists elo_2v2 int not null default 1000;
alter table public.profiles add column if not exists elo_3v3 int not null default 1000;

alter table public.matches add column if not exists ranked boolean not null default false;
alter table public.matches add column if not exists elo_change int;
drop policy if exists "matches: add your own" on public.matches;

-- Seed from what players already had (two early accounts), then the server owns it.
insert into public.player_stats (id, matches, wins, goals, mvps, saves, demos, assists, hattricks,
  wins_1v1, wins_2v2, wins_3v3, playtime, xp)
select p.id, coalesce(p.matches, 0), coalesce(p.wins, 0), coalesce(p.goals, 0),
  coalesce((p.data->>'mvps')::int, 0), coalesce((p.data->'tot'->>'saves')::int, 0),
  coalesce((p.data->'tot'->>'demos')::int, 0), coalesce((p.data->'tot'->>'assists')::int, 0),
  coalesce((p.data->'tot'->>'hattricks')::int, 0),
  coalesce((p.data->'winsByMode'->>'1v1')::int, 0), coalesce((p.data->'winsByMode'->>'2v2')::int, 0),
  coalesce((p.data->'winsByMode'->>'3v3')::int, 0), coalesce(p.playtime, 0), coalesce((p.data->>'xp')::int, 0)
from public.profiles p
on conflict (id) do nothing;

-- ---------------------------------------------------------------- achievement items
-- Same list as src/meta/items.js (unlock). Returns the item keys the stats have earned.
create or replace function private.earned_items(s public.player_stats)
returns text[] language sql immutable set search_path = '' as $$
  select array_remove(array[
    case when s.wins_1v1 >= 50 then 'car:titan' end,
    case when s.goals >= 500 then 'car:phantom' end,
    case when s.wins >= 100 then 'car:monarch' end,
    case when s.saves >= 150 then 'explosion:eclipse' end,
    case when s.demos >= 100 then 'explosion:thunderdome' end,
    case when s.playtime >= 36000 then 'boost:afterburner' end,
    case when s.mvps >= 50 then 'ball:champion' end,
    case when s.wins_2v2 >= 25 then 'paint:molten' end,
    case when s.wins_3v3 >= 25 then 'finish:spectrum' end,
    case when s.assists >= 100 then 'decal:hexcore' end,
    case when s.xp >= 11400 then 'icon:trophy' end,
    case when s.matches >= 250 then 'banner:halloffame' end,
    case when s.wins >= 50 then 'title:champion' end,
    case when s.goals >= 250 then 'title:goalhunter' end,
    case when s.hattricks >= 10 then 'anthem:hattrick' end
  ], null);
$$;

create or replace function private.all_achievement_items()
returns text[] language sql immutable set search_path = '' as $$
  select array['car:titan','car:phantom','car:monarch','explosion:eclipse','explosion:thunderdome',
    'boost:afterburner','ball:champion','paint:molten','finish:spectrum','decal:hexcore','icon:trophy',
    'banner:halloffame','title:champion','title:goalhunter','anthem:hattrick'];
$$;

-- Every save of a profile: stats columns and the stats inside `data` come from player_stats, and
-- achievement items not earned are removed from what the player owns and wears.
create or replace function private.profiles_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  s public.player_stats;
  earned text[];
  owned jsonb;
  lo jsonb;
  defaults jsonb := '{"car":"strider","paint":"team","finish":"gloss","decal":"default","boost":"standard",
    "ball":"standard","explosion":"classic","icon":"ball","banner":"default","title":"rookie","anthem":"kickoff"}';
  slot text;
  cat text;
begin
  insert into public.player_stats (id) values (new.id) on conflict (id) do nothing;
  select * into s from public.player_stats where id = new.id;
  earned := private.earned_items(s);
  new.level := 1 + s.xp / 600;
  new.matches := s.matches;
  new.wins := s.wins;
  new.goals := s.goals;
  new.playtime := s.playtime;
  new.elo_1v1 := s.elo_1v1;
  new.elo_2v2 := s.elo_2v2;
  new.elo_3v3 := s.elo_3v3;
  if new.data is not null and jsonb_typeof(new.data) = 'object' then
    select coalesce(jsonb_agg(k), '[]'::jsonb) into owned
    from jsonb_array_elements_text(coalesce(new.data->'owned', '[]'::jsonb)) as k
    where not (k = any (private.all_achievement_items())) or k = any (earned);
    lo := coalesce(new.data->'loadout', '{}'::jsonb);
    -- Loadout slot name = item category, except nothing differs today.
    for slot in select jsonb_object_keys(defaults) loop
      cat := slot;
      if (cat || ':' || coalesce(lo->>slot, '')) = any (private.all_achievement_items())
         and not ((cat || ':' || (lo->>slot)) = any (earned)) then
        lo := jsonb_set(lo, array[slot], defaults->slot);
      end if;
    end loop;
    new.data := new.data || jsonb_build_object(
      'owned', owned, 'loadout', lo,
      'xp', s.xp, 'matches', s.matches, 'wins', s.wins, 'goals', s.goals, 'mvps', s.mvps, 'playtime', s.playtime,
      'winsByMode', jsonb_build_object('1v1', s.wins_1v1, '2v2', s.wins_2v2, '3v3', s.wins_3v3),
      'tot', jsonb_build_object('saves', s.saves, 'demos', s.demos, 'assists', s.assists, 'hattricks', s.hattricks),
      'elo', jsonb_build_object('1v1', s.elo_1v1, '2v2', s.elo_2v2, '3v3', s.elo_3v3));
    new.icon := lo->>'icon';
    new.banner := lo->>'banner';
    new.title := lo->>'title';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before insert or update on public.profiles
  for each row execute function private.profiles_guard();

-- Re-save every profile through the guard once, so the columns match player_stats.
update public.profiles set updated_at = updated_at;

-- ---------------------------------------------------------------- applying one match result
-- p: { goals, assists, saves, shots, demos, score }. Caps keep one fake result from mattering much.
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
  pts int := least(greatest(coalesce((p->>'score')::int, 0), 0), 3000);
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

-- ---------------------------------------------------------------- matches against bots
create table if not exists private.tickets (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references auth.users (id) on delete cascade,
  mode text not null check (mode in ('1v1', '2v2', '3v3')),
  created_at timestamptz not null default now()
);

-- Called when a match against bots starts. Only one open match per player.
create or replace function public.bb_start_match(p_mode text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  t uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_mode not in ('1v1', '2v2', '3v3') then raise exception 'bad mode'; end if;
  delete from private.tickets where player_id = uid;
  insert into private.tickets (player_id, mode) values (uid, p_mode) returning id into t;
  return t;
end;
$$;

-- Called at the end. A match lasts at least 5 minutes of clock, so a result sooner than 285 s
-- after the start is refused. Returns the new lifetime stats.
create or replace function public.bb_finish_match(p_ticket uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  t private.tickets;
  secs int;
  s public.player_stats;
begin
  if uid is null then raise exception 'not signed in'; end if;
  delete from private.tickets where id = p_ticket and player_id = uid returning * into t;
  if t.id is null then raise exception 'unknown match'; end if;
  secs := extract(epoch from now() - t.created_at)::int;
  if secs < 285 then raise exception 'match too short'; end if;
  perform private.apply_result(uid, t.mode, coalesce((p->>'team')::int, 0), coalesce((p->>'score_us')::int, 0), coalesce((p->>'score_them')::int, 0),
    p, coalesce((p->>'mvp')::boolean, false), false, false, null, secs);
  select * into s from public.player_stats where id = uid;
  return to_jsonb(s);
end;
$$;

-- Play time: at most the real time since the last call (plus 5 s), and at most 2 minutes per call.
create or replace function public.bb_add_playtime(p_seconds int)
returns int language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  s public.player_stats;
  allowed int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  insert into public.player_stats (id) values (uid) on conflict (id) do nothing;
  select * into s from public.player_stats where id = uid for update;
  allowed := least(greatest(coalesce(p_seconds, 0), 0), 120,
    case when s.playtime_at is null then 35 else extract(epoch from now() - s.playtime_at)::int + 5 end);
  update public.player_stats set playtime = playtime + allowed, playtime_at = now(), updated_at = now() where id = uid
    returning playtime into allowed;
  update public.profiles set updated_at = now() where id = uid;
  return allowed;
end;
$$;

-- ---------------------------------------------------------------- ranked online matches
create table if not exists public.online_matches (
  id uuid primary key default gen_random_uuid(),
  host uuid not null references auth.users (id) on delete cascade,
  mode text not null check (mode in ('1v1', '2v2', '3v3')),
  players jsonb not null, -- [{ "id": uuid, "team": 0|1 }] as the host started it
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  void boolean not null default false,
  score_b int, score_o int
);
create table if not exists public.online_players (
  match_id uuid not null references public.online_matches (id) on delete cascade,
  player_id uuid not null references auth.users (id) on delete cascade,
  team smallint not null check (team in (0, 1)),
  joined_at timestamptz not null default now(),
  report jsonb, reported_at timestamptz,
  elo_before int, elo_after int,
  primary key (match_id, player_id)
);
create index if not exists online_players_player_idx on public.online_players (player_id);
create index if not exists online_matches_open_idx on public.online_matches (created_at) where finalized_at is null;
create index if not exists online_matches_host_idx on public.online_matches (host);
alter table public.online_matches enable row level security;
alter table public.online_players enable row level security;
create policy "online_matches: everyone can read" on public.online_matches for select using (true);
create policy "online_players: everyone can read" on public.online_players for select using (true);

create or replace function private.elo_of(s public.player_stats, p_mode text)
returns int language sql immutable set search_path = '' as $$
  select case p_mode when '1v1' then s.elo_1v1 when '2v2' then s.elo_2v2 else s.elo_3v3 end;
$$;

-- Ends a ranked match: the score most reports agree on decides it (a tie between different
-- scores voids the match). Players who never reported (left) count as a loss.
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
begin
  select * into m from public.online_matches where id = p_match for update;
  if m.id is null or m.finalized_at is not null then return; end if;
  select (report->>'score_b')::int as b, (report->>'score_o')::int as o, count(*) as n into best
    from public.online_players where match_id = p_match and report is not null
    group by 1, 2 order by n desc limit 1;
  select count(*) into second_n from (
    select 1 from public.online_players where match_id = p_match and report is not null
    group by (report->>'score_b')::int, (report->>'score_o')::int having count(*) = best.n) x;
  if best.n is null or second_n > 1
     or not exists (select 1 from public.online_players where match_id = p_match and team = 0)
     or not exists (select 1 from public.online_players where match_id = p_match and team = 1) then
    update public.online_matches set finalized_at = now(), void = true where id = p_match;
    return;
  end if;
  secs := extract(epoch from now() - m.created_at)::int;
  select avg(private.elo_of(ps, m.mode)) into rb from public.online_players op
    join public.player_stats ps on ps.id = op.player_id where op.match_id = p_match and op.team = 0;
  select avg(private.elo_of(ps, m.mode)) into ra from public.online_players op
    join public.player_stats ps on ps.id = op.player_id where op.match_id = p_match and op.team = 1;
  for r in select * from public.online_players where match_id = p_match loop
    select * into s from public.player_stats where id = r.player_id for update;
    if r.team = 0 then e := 1 / (1 + power(10, (ra - rb) / 400)); else e := 1 / (1 + power(10, (rb - ra) / 400)); end if;
    if r.report is null then sres := 0;
    elsif best.b = best.o then sres := 0.5;
    elsif (r.team = 0) = (best.b > best.o) then sres := 1;
    else sres := 0; end if;
    d := round(32 * (sres - e));
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
    if r.report is not null then
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

-- Finish ranked matches of this player that have waited long enough for the missing reports.
create or replace function private.sweep_online(uid uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select distinct m.id from public.online_matches m join public.online_players op on op.match_id = m.id
    where m.finalized_at is null and op.player_id = uid
      and exists (select 1 from public.online_players x where x.match_id = m.id and x.reported_at < now() - interval '90 seconds')
  loop
    perform private.finalize_online(r.id);
  end loop;
  -- Matches nobody ever reported (everyone left): void after two hours.
  update public.online_matches set finalized_at = now(), void = true
    where finalized_at is null and created_at < now() - interval '2 hours';
end;
$$;

-- Host, when a ranked match starts: the players by account and team. Returns the match id.
create or replace function public.bb_online_create(p_mode text, p_players jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  per int := case p_mode when '1v1' then 1 when '2v2' then 2 when '3v3' then 3 else 0 end;
  n int; n0 int; n1 int; ids int;
  mid uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if per = 0 or jsonb_typeof(p_players) <> 'array' then raise exception 'bad match'; end if;
  select count(*), count(*) filter (where (x->>'team')::int = 0), count(*) filter (where (x->>'team')::int = 1),
    count(distinct x->>'id')
    into n, n0, n1, ids from jsonb_array_elements(p_players) x;
  if n < 2 or n0 < 1 or n1 < 1 or n0 > per or n1 > per or ids <> n or n0 + n1 <> n then raise exception 'bad players'; end if;
  if not exists (select 1 from jsonb_array_elements(p_players) x where x->>'id' = uid::text) then raise exception 'host must play'; end if;
  perform private.sweep_online(uid);
  insert into public.online_matches (host, mode, players) values (uid, p_mode, p_players) returning id into mid;
  return mid;
end;
$$;

-- Each player (host too) when the match starts. Only players the host listed, within 2 minutes.
create or replace function public.bb_online_join(p_match uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  m public.online_matches;
  t int;
  s public.player_stats;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into m from public.online_matches where id = p_match;
  if m.id is null or m.finalized_at is not null or m.created_at < now() - interval '2 minutes' then raise exception 'match closed'; end if;
  select (x->>'team')::int into t from jsonb_array_elements(m.players) x where x->>'id' = uid::text;
  if t is null then raise exception 'not in this match'; end if;
  insert into public.player_stats (id) values (uid) on conflict (id) do nothing;
  insert into public.online_players (match_id, player_id, team) values (p_match, uid, t) on conflict do nothing;
  select * into s from public.player_stats where id = uid;
  return jsonb_build_object('team', t, 'elo', private.elo_of(s, m.mode));
end;
$$;

-- Each player at the end: the final score and their own stats. Returns the result once it is final:
-- { final, void, elo_before, elo_after, stats } (final false while waiting for the other reports).
create or replace function public.bb_online_report(p_match uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  m public.online_matches;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into m from public.online_matches where id = p_match;
  if m.id is null then raise exception 'unknown match'; end if;
  if m.created_at > now() - interval '285 seconds' then raise exception 'match too short'; end if;
  update public.online_players set report = jsonb_build_object(
      'score_b', least(greatest(coalesce((p->>'score_b')::int, 0), 0), 30),
      'score_o', least(greatest(coalesce((p->>'score_o')::int, 0), 0), 30),
      'goals', p->'goals', 'assists', p->'assists', 'saves', p->'saves', 'shots', p->'shots',
      'demos', p->'demos', 'score', p->'score', 'mvp', p->'mvp'),
    reported_at = now()
  where match_id = p_match and player_id = uid and report is null and m.finalized_at is null;
  if not exists (select 1 from public.online_players where match_id = p_match and report is null) then
    perform private.finalize_online(p_match);
  end if;
  return public.bb_online_result(p_match);
end;
$$;

-- Result for this player (also finishes the match if the others had 90 s to report).
create or replace function public.bb_online_result(p_match uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  m public.online_matches;
  op public.online_players;
  s public.player_stats;
begin
  if uid is null then raise exception 'not signed in'; end if;
  perform private.sweep_online(uid);
  select * into m from public.online_matches where id = p_match;
  select * into op from public.online_players where match_id = p_match and player_id = uid;
  select * into s from public.player_stats where id = uid;
  return jsonb_build_object('final', m.finalized_at is not null, 'void', m.void,
    'elo_before', op.elo_before, 'elo_after', op.elo_after, 'stats', to_jsonb(s));
end;
$$;

-- Only signed-in players may call the public functions; helpers are not callable at all.
revoke all on function public.bb_start_match(text), public.bb_finish_match(uuid, jsonb), public.bb_add_playtime(int),
  public.bb_online_create(text, jsonb), public.bb_online_join(uuid), public.bb_online_report(uuid, jsonb),
  public.bb_online_result(uuid) from public, anon;
grant execute on function public.bb_start_match(text), public.bb_finish_match(uuid, jsonb), public.bb_add_playtime(int),
  public.bb_online_create(text, jsonb), public.bb_online_join(uuid), public.bb_online_report(uuid, jsonb),
  public.bb_online_result(uuid) to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on schema private from public, anon, authenticated;
