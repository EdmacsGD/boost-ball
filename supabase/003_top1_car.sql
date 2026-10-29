-- Hotshot car: earned by being #1 on any Players leaderboard (play time, goals, wins, rank 1v1/2v2/3v3).
-- Once earned it stays, even after dropping to #2. Only a clear #1 counts (no ties), and ratings must
-- be above the 1000 start.
alter table public.player_stats add column if not exists top1 boolean not null default false;

create or replace function private.mark_top1()
returns void language plpgsql security definer set search_path = '' as $$
declare
  col text;
  base int;
  leader uuid;
begin
  foreach col in array array['playtime', 'goals', 'wins', 'elo_1v1', 'elo_2v2', 'elo_3v3'] loop
    base := case when col like 'elo_%' then 1000 else 0 end;
    execute format(
      'select s.id from public.player_stats s join public.profiles p on p.id = s.id
         where s.%1$I > $1 and s.%1$I = (select max(x.%1$I) from public.player_stats x join public.profiles y on y.id = x.id)
         and (select count(*) from public.player_stats x join public.profiles y on y.id = x.id
              where x.%1$I = (select max(z.%1$I) from public.player_stats z join public.profiles w on w.id = z.id)) = 1
         limit 1', col)
      into leader using base;
    if leader is not null then
      update public.player_stats set top1 = true where id = leader and not top1;
      if found then update public.profiles set updated_at = now() where id = leader; end if;
    end if;
  end loop;
end;
$$;

create or replace function private.earned_items(s public.player_stats)
returns text[] language sql immutable set search_path = '' as $$
  select array_remove(array[
    case when s.wins_1v1 >= 50 then 'car:titan' end,
    case when s.goals >= 500 then 'car:phantom' end,
    case when s.wins >= 100 then 'car:monarch' end,
    case when s.top1 then 'car:hotshot' end,
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
  select array['car:titan','car:phantom','car:monarch','car:hotshot','explosion:eclipse','explosion:thunderdome',
    'boost:afterburner','ball:champion','paint:molten','finish:spectrum','decal:hexcore','icon:trophy',
    'banner:halloffame','title:champion','title:goalhunter','anthem:hattrick'];
$$;

-- Profiles carry top1 in their data too (the game reads it).
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
      'elo', jsonb_build_object('1v1', s.elo_1v1, '2v2', s.elo_2v2, '3v3', s.elo_3v3),
      'top1', case when s.top1 then 1 else 0 end);
    new.icon := lo->>'icon';
    new.banner := lo->>'banner';
    new.title := lo->>'title';
  end if;
  return new;
end;
$$;

-- After any stats change, the current #1 of each board is marked. Statement level, and skipped when
-- the change came from mark_top1 itself.
create or replace function private.player_stats_top1()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  perform private.mark_top1();
  return null;
end;
$$;
drop trigger if exists player_stats_top1 on public.player_stats;
create trigger player_stats_top1 after insert or update on public.player_stats
  for each statement execute function private.player_stats_top1();

revoke all on all functions in schema private from public, anon, authenticated;

-- Mark whoever leads right now.
select private.mark_top1();
update public.profiles set updated_at = updated_at;
