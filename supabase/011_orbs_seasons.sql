-- Orbs, monthly ranked seasons, the season pass and the orb shop. Everything that gives or
-- spends orbs runs here; the page only shows the numbers. Item prices and pass rewards come from
-- src/meta/economy.js (tools/gen_economy_sql.mjs writes 011_economy_data.sql).

-- Player state -------------------------------------------------------------------------------
alter table public.player_stats
  add column if not exists orbs int not null default 0,
  add column if not exists season text not null default to_char(now() at time zone 'utc', 'YYYY-MM'),
  add column if not exists pass_season text not null default to_char(now() at time zone 'utc', 'YYYY-MM'),
  add column if not exists pass_xp int not null default 0,
  add column if not exists pass_premium boolean not null default false,
  add column if not exists orb_play int not null default 0, -- 15-minute blocks already paid
  add column if not exists clip_orbs_day date,
  add column if not exists clip_orbs_today int not null default 0;

create table if not exists public.orb_log (
  id bigserial primary key,
  player uuid not null references auth.users (id) on delete cascade,
  amount int not null,
  reason text not null,
  at timestamptz not null default now()
);
create index if not exists orb_log_player_idx on public.orb_log (player, at desc);
alter table public.orb_log enable row level security;
drop policy if exists orb_log_own on public.orb_log;
create policy orb_log_own on public.orb_log for select to authenticated using (player = (select auth.uid()));

-- Items the server handed out (shop and pass). Only these can sit in profiles.data.owned for
-- shop and pass items: the profile guard removes any the page adds itself.
create table if not exists public.owned_items (
  player uuid not null references auth.users (id) on delete cascade,
  item text not null,
  source text not null,
  at timestamptz not null default now(),
  primary key (player, item)
);
alter table public.owned_items enable row level security;
drop policy if exists owned_items_own on public.owned_items;
create policy owned_items_own on public.owned_items for select to authenticated using (player = (select auth.uid()));

create table if not exists public.shop_items (
  item text primary key,
  price int not null,
  for_sale boolean not null default true
);
alter table public.shop_items enable row level security;
drop policy if exists shop_items_read on public.shop_items;
create policy shop_items_read on public.shop_items for select to anon, authenticated using (true);

create table if not exists public.pass_rewards (
  tier int not null,
  track text not null check (track in ('free', 'premium')),
  theme text not null default 'any',
  item text,
  orbs int,
  primary key (tier, track, theme)
);
alter table public.pass_rewards enable row level security;
drop policy if exists pass_rewards_read on public.pass_rewards;
create policy pass_rewards_read on public.pass_rewards for select to anon, authenticated using (true);

create table if not exists public.pass_claims (
  player uuid not null references auth.users (id) on delete cascade,
  season text not null,
  tier int not null,
  track text not null,
  at timestamptz not null default now(),
  primary key (player, season, tier, track)
);
alter table public.pass_claims enable row level security;
drop policy if exists pass_claims_own on public.pass_claims;
create policy pass_claims_own on public.pass_claims for select to authenticated using (player = (select auth.uid()));

-- Final rank of each mode at the end of every season a player played ranked.
create table if not exists public.season_results (
  player uuid not null references auth.users (id) on delete cascade,
  season text not null,
  mode text not null,
  elo int not null,
  ranked int not null,
  primary key (player, season, mode)
);
alter table public.season_results enable row level security;
drop policy if exists season_results_read on public.season_results;
create policy season_results_read on public.season_results for select to anon, authenticated using (true);

-- One like gives orbs once per person and clip (liking again after unliking gives nothing).
create table if not exists private.like_paid (
  clip_id uuid not null,
  user_id uuid not null,
  primary key (clip_id, user_id)
);

-- Helpers ------------------------------------------------------------------------------------
create or replace function private.cur_season() returns text language sql stable set search_path = '' as $$
  select to_char(now() at time zone 'utc', 'YYYY-MM');
$$;

create or replace function private.season_theme(p text) returns text language sql immutable set search_path = '' as $$
  select case when substr(p, 6, 2)::int in (12, 1, 2) then 'winter' else 'any' end;
$$;

create or replace function private.grant_orbs(uid uuid, amount int, why text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if amount is null or amount = 0 then return; end if;
  update public.player_stats set orbs = greatest(0, orbs + amount), updated_at = now() where id = uid;
  insert into public.orb_log (player, amount, reason) values (uid, amount, why);
end;
$$;

-- New month: the ranked season ends. Final ranks are saved, Rank moves halfway back to 1000 and
-- the ranked match counts start over (so the season leaderboards start empty). The pass resets.
create or replace function private.ensure_season(uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.player_stats;
  cur text := private.cur_season();
begin
  select * into s from public.player_stats where id = uid for update;
  if s.id is null then return; end if;
  if s.season <> cur then
    insert into public.season_results (player, season, mode, elo, ranked)
      select uid, s.season, m.mode, m.elo, m.n from (values ('1v1', s.elo_1v1, s.ranked_1v1), ('2v2', s.elo_2v2, s.ranked_2v2), ('3v3', s.elo_3v3, s.ranked_3v3)) as m(mode, elo, n)
      where m.n > 0
      on conflict do nothing;
    update public.player_stats set
      elo_1v1 = 1000 + (elo_1v1 - 1000) / 2, elo_2v2 = 1000 + (elo_2v2 - 1000) / 2, elo_3v3 = 1000 + (elo_3v3 - 1000) / 2,
      ranked_1v1 = 0, ranked_2v2 = 0, ranked_3v3 = 0, season = cur
    where id = uid;
  end if;
  if s.pass_season <> cur then
    update public.player_stats set pass_season = cur, pass_xp = 0, pass_premium = false where id = uid;
  end if;
end;
$$;

-- Match results: orbs for goals and saves, and pass XP (the same XP the match gave).
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
  xp_gain int;
begin
  insert into public.player_stats (id) values (uid) on conflict (id) do nothing;
  perform private.ensure_season(uid);
  xp_gain := pts + (case when won then 200 when draw then 100 else 50 end);
  update public.player_stats set
    matches = matches + 1,
    wins = wins + (case when won then 1 else 0 end),
    goals = goals + g, assists = assists + a, saves = saves + sv, shots = shots + sh, demos = demos + dm,
    mvps = mvps + (case when m then 1 else 0 end),
    hattricks = hattricks + (case when g >= 3 then 1 else 0 end),
    wins_1v1 = wins_1v1 + (case when won and p_mode = '1v1' then 1 else 0 end),
    wins_2v2 = wins_2v2 + (case when won and p_mode = '2v2' then 1 else 0 end),
    wins_3v3 = wins_3v3 + (case when won and p_mode = '3v3' then 1 else 0 end),
    xp = xp + xp_gain,
    pass_xp = pass_xp + xp_gain,
    updated_at = now()
  where id = uid;
  perform private.grant_orbs(uid, 5 * least(g, 10) + 3 * least(sv, 10), 'match');
  insert into public.matches (player_id, mode, online, team, won, draw, mvp, score_us, score_them,
    goals, assists, saves, shots, demos, points, seconds, ranked, elo_change)
  values (uid, p_mode, is_online, case when p_team = 1 then 1 else 0 end, won, draw, m, us, them, g, a, sv, sh, dm, pts,
    least(greatest(seconds, 0), 7200), is_ranked, elo_change);
  update public.profiles set updated_at = now() where id = uid;
end;
$$;

-- Play time: 25 orbs for every 15 minutes (the server already limits how fast play time grows).
create or replace function public.bb_add_playtime(p_seconds integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  s public.player_stats;
  allowed int;
  blocks int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  insert into public.player_stats (id) values (uid) on conflict (id) do nothing;
  perform private.ensure_season(uid);
  select * into s from public.player_stats where id = uid for update;
  allowed := least(greatest(coalesce(p_seconds, 0), 0), 120,
    case when s.playtime_at is null then 35 else extract(epoch from now() - s.playtime_at)::int + 5 end);
  update public.player_stats set playtime = playtime + allowed, playtime_at = now(), updated_at = now() where id = uid
    returning playtime into allowed;
  blocks := allowed / 900;
  if blocks > s.orb_play then
    perform private.grant_orbs(uid, 25 * least(blocks - s.orb_play, 4), 'playtime');
    update public.player_stats set orb_play = blocks where id = uid;
  end if;
  update public.profiles set updated_at = now() where id = uid;
  return allowed;
end;
$$;

-- Clips: orbs for the author, at most 150 a day.
create or replace function private.clip_orbs(author uuid, amount int, why text) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.player_stats; give int;
begin
  insert into public.player_stats (id) values (author) on conflict (id) do nothing;
  select * into s from public.player_stats where id = author for update;
  if s.clip_orbs_day is distinct from current_date then
    update public.player_stats set clip_orbs_day = current_date, clip_orbs_today = 0 where id = author;
    s.clip_orbs_today := 0;
  end if;
  give := least(amount, 150 - s.clip_orbs_today);
  if give > 0 then
    update public.player_stats set clip_orbs_today = clip_orbs_today + give where id = author;
    perform private.grant_orbs(author, give, why);
  end if;
end;
$$;

create or replace function public.bb_view_clip(p_clip uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); added int := 0; who uuid;
begin
  select author into who from public.clips where id = p_clip and not hidden;
  if who is null then return 0; end if;
  if me is not null then
    insert into public.clip_views (clip_id, viewer) values (p_clip, me) on conflict do nothing;
    get diagnostics added = row_count;
  else
    insert into public.clip_views (clip_id, viewer) values (p_clip, null)
      on conflict (clip_id, day) where viewer is null do update set n = public.clip_views.n + 1 where public.clip_views.n < 300;
    get diagnostics added = row_count;
  end if;
  if added > 0 then
    perform set_config('bb.counting', 'views', true);
    update public.clips set view_count = view_count + 1 where id = p_clip;
    perform set_config('bb.counting', '', true);
    -- Signed-in viewers only, and never your own views.
    if me is not null and me <> who then perform private.clip_orbs(who, 1, 'clip view'); end if;
  end if;
  return (select view_count from public.clips where id = p_clip);
end $$;

create or replace function private.like_orbs() returns trigger
language plpgsql security definer set search_path = '' as $$
declare who uuid;
begin
  select author into who from public.clips where id = new.clip_id;
  if who is null or who = new.user_id then return null; end if;
  insert into private.like_paid (clip_id, user_id) values (new.clip_id, new.user_id) on conflict do nothing;
  if found then perform private.clip_orbs(who, 3, 'clip like'); end if;
  return null;
end;
$$;
drop trigger if exists clip_like_orbs on public.clip_likes;
create trigger clip_like_orbs after insert on public.clip_likes for each row execute function private.like_orbs();

-- Spending -----------------------------------------------------------------------------------
-- Add a server-given item to the profile's owned list (the guard keeps it because it is in owned_items).
create or replace function private.give_item(uid uuid, p_item text, why text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.owned_items (player, item, source) values (uid, p_item, why) on conflict do nothing;
  update public.profiles set data = jsonb_set(coalesce(data, '{}'::jsonb), '{owned}',
      (select coalesce(jsonb_agg(distinct k), '[]'::jsonb) from (
        select jsonb_array_elements_text(coalesce(data->'owned', '[]'::jsonb)) as k union select p_item) x)),
    updated_at = now()
  where id = uid;
end;
$$;

create or replace function public.bb_buy(p_item text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); it public.shop_items; s public.player_stats;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into it from public.shop_items where item = p_item and for_sale;
  if it.item is null then raise exception 'not for sale'; end if;
  if exists (select 1 from public.owned_items where player = uid and item = p_item) then raise exception 'already owned'; end if;
  insert into public.player_stats (id) values (uid) on conflict (id) do nothing;
  select * into s from public.player_stats where id = uid for update;
  if s.orbs < it.price then raise exception 'not enough orbs'; end if;
  perform private.grant_orbs(uid, -it.price, 'shop ' || p_item);
  perform private.give_item(uid, p_item, 'shop');
  return public.bb_economy();
end;
$$;

create or replace function public.bb_pass_buy()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); s public.player_stats;
begin
  if uid is null then raise exception 'not signed in'; end if;
  insert into public.player_stats (id) values (uid) on conflict (id) do nothing;
  perform private.ensure_season(uid);
  select * into s from public.player_stats where id = uid for update;
  if s.pass_premium then raise exception 'already premium'; end if;
  if s.orbs < 1500 then raise exception 'not enough orbs'; end if;
  perform private.grant_orbs(uid, -1500, 'premium pass ' || s.pass_season);
  update public.player_stats set pass_premium = true where id = uid;
  return public.bb_economy();
end;
$$;

create or replace function public.bb_pass_claim(p_tier int, p_track text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); s public.player_stats; r public.pass_rewards; th text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  insert into public.player_stats (id) values (uid) on conflict (id) do nothing;
  perform private.ensure_season(uid);
  select * into s from public.player_stats where id = uid for update;
  if p_tier < 1 or p_tier > 30 or s.pass_xp < p_tier * 800 then raise exception 'tier not reached'; end if;
  if p_track = 'premium' and not s.pass_premium then raise exception 'premium pass needed'; end if;
  th := private.season_theme(s.pass_season);
  select * into r from public.pass_rewards where tier = p_tier and track = p_track and theme = th;
  if r.tier is null then select * into r from public.pass_rewards where tier = p_tier and track = p_track and theme = 'any'; end if;
  if r.tier is null then raise exception 'no reward'; end if;
  insert into public.pass_claims (player, season, tier, track) values (uid, s.pass_season, p_tier, p_track) on conflict do nothing;
  if not found then raise exception 'already claimed'; end if;
  if r.orbs is not null then perform private.grant_orbs(uid, r.orbs, 'pass tier ' || p_tier); end if;
  if r.item is not null then perform private.give_item(uid, r.item, 'pass'); end if;
  return public.bb_economy();
end;
$$;

-- Everything the page shows: orbs, season, pass progress and claims, owned shop items.
create or replace function public.bb_economy()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); s public.player_stats;
begin
  if uid is null then return null; end if;
  insert into public.player_stats (id) values (uid) on conflict (id) do nothing;
  perform private.ensure_season(uid);
  select * into s from public.player_stats where id = uid;
  return jsonb_build_object(
    'orbs', s.orbs, 'season', s.season, 'pass_xp', s.pass_xp, 'premium', s.pass_premium,
    'claims', (select coalesce(jsonb_agg(c.track || ':' || c.tier), '[]'::jsonb) from public.pass_claims c where c.player = uid and c.season = s.pass_season),
    'owned', (select coalesce(jsonb_agg(o.item), '[]'::jsonb) from public.owned_items o where o.player = uid),
    'clip_today', case when s.clip_orbs_day = current_date then s.clip_orbs_today else 0 end,
    'next_play', 900 - s.playtime % 900,
    'last', (select coalesce(jsonb_agg(jsonb_build_object('amount', l.amount, 'reason', l.reason, 'at', l.at) order by l.at desc), '[]'::jsonb)
      from (select * from public.orb_log where player = uid order by at desc limit 8) l));
end;
$$;

revoke all on function public.bb_buy(text), public.bb_pass_buy(), public.bb_pass_claim(int, text), public.bb_economy() from public, anon;
grant execute on function public.bb_buy(text), public.bb_pass_buy(), public.bb_pass_claim(int, text), public.bb_economy() to authenticated;

-- The profile guard: shop and pass items stay owned only when the server gave them.
create or replace function private.server_items() returns text[] language sql stable set search_path = '' as $$
  select coalesce(array_agg(item), '{}') from public.shop_items;
$$;

create or replace function private.profiles_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  s public.player_stats;
  earned text[];
  locked text[];
  owned jsonb;
  lo jsonb;
  defaults jsonb := '{"car":"strider","paint":"team","finish":"gloss","decal":"default","boost":"standard",
    "ball":"standard","explosion":"classic","icon":"ball","banner":"default","title":"rookie","anthem":"kickoff","topper":"none"}';
  slot text;
  cat text;
begin
  insert into public.player_stats (id) values (new.id) on conflict (id) do nothing;
  select * into s from public.player_stats where id = new.id;
  earned := private.earned_items(s) || coalesce((select array_agg(item) from public.owned_items where player = new.id), '{}');
  locked := private.all_achievement_items() || private.server_items();
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
    where not (k = any (locked)) or k = any (earned);
    lo := coalesce(new.data->'loadout', '{}'::jsonb);
    for slot in select jsonb_object_keys(defaults) loop
      cat := slot;
      if (cat || ':' || coalesce(lo->>slot, '')) = any (locked)
         and not ((cat || ':' || (lo->>slot)) = any (earned)) then
        lo := jsonb_set(lo, array[slot], defaults->slot);
      end if;
    end loop;
    new.data := new.data || jsonb_build_object(
      'owned', owned, 'loadout', lo,
      'xp', s.xp, 'matches', s.matches, 'wins', s.wins, 'goals', s.goals, 'mvps', s.mvps, 'playtime', s.playtime,
      'winsByMode', jsonb_build_object('1v1', s.wins_1v1, '2v2', s.wins_2v2, '3v3', s.wins_3v3),
      'tot', jsonb_build_object('saves', s.saves, 'demos', s.demos, 'assists', s.assists, 'hattricks', s.hattricks),
      'elo', jsonb_build_object('1v1', s.elo_1v1, '2v2', s.elo_2v2, '3v3', s.elo_3v3),
      'orbs', s.orbs, 'season', s.season,
      'top1', case when s.top1 then 1 else 0 end);
    new.icon := lo->>'icon';
    new.banner := lo->>'banner';
    new.title := lo->>'title';
  end if;
  return new;
end;
$$;

-- Existing players: pay for the play time they already have (25 per 15 minutes, at most 1000),
-- and start the first season now.
do $$
declare r record;
begin
  for r in select id, playtime from public.player_stats where orb_play = 0 and playtime >= 900 loop
    perform private.grant_orbs(r.id, least(1000, 25 * (r.playtime / 900)), 'welcome: play time so far');
    update public.player_stats set orb_play = r.playtime / 900 where id = r.id;
  end loop;
end $$;
