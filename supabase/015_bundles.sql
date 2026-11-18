-- Bundles: a car and a goal explosion, the bigger ones with more (data from src/meta/economy.js,
-- made by tools/gen_bundles_sql.mjs). You pay for the items you do not have yet, with the
-- bundle's discount, rounded down to 50 orbs. Winter bundles sell only in December to February.
create table if not exists public.bundles (
  id text primary key,
  name text not null,
  theme text not null default 'any',
  off numeric not null check (off > 0 and off <= 1)
);
create table if not exists public.bundle_items (
  bundle text not null references public.bundles (id) on delete cascade,
  item text not null,
  value int not null check (value > 0),
  primary key (bundle, item)
);
alter table public.bundles enable row level security;
alter table public.bundle_items enable row level security;
drop policy if exists "bundles are public" on public.bundles;
create policy "bundles are public" on public.bundles for select to anon, authenticated using (true);
drop policy if exists "bundle items are public" on public.bundle_items;
create policy "bundle items are public" on public.bundle_items for select to anon, authenticated using (true);

-- Owned: given by the server, or in the saved profile (Sport Drops are counted there).
create or replace function private.owns_item(uid uuid, p_item text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.owned_items where player = uid and item = p_item)
      or exists (select 1 from public.profiles where id = uid and coalesce(data->'owned', '[]'::jsonb) ? p_item);
$$;

create or replace function public.bb_buy_bundle(p_bundle text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); b public.bundles; s public.player_stats; worth int := 0; price int; r record;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into b from public.bundles where id = p_bundle;
  if b.id is null then raise exception 'not for sale'; end if;
  if b.theme <> 'any' and private.season_theme(to_char(now() at time zone 'utc', 'YYYY-MM')) <> b.theme then
    raise exception 'not for sale this month';
  end if;
  for r in select item, value from public.bundle_items where bundle = b.id loop
    if not private.owns_item(uid, r.item) then worth := worth + r.value; end if;
  end loop;
  if worth = 0 then raise exception 'already owned'; end if;
  price := greatest(50, floor(worth * b.off / 50)::int * 50);
  insert into public.player_stats (id) values (uid) on conflict (id) do nothing;
  select * into s from public.player_stats where id = uid for update;
  if s.orbs < price then raise exception 'not enough orbs'; end if;
  perform private.grant_orbs(uid, -price, 'bundle ' || b.id);
  for r in select item from public.bundle_items where bundle = b.id loop
    perform private.give_item(uid, r.item, 'bundle ' || b.id);
  end loop;
  return public.bb_economy();
end;
$$;
revoke all on function public.bb_buy_bundle(text) from public, anon;
grant execute on function public.bb_buy_bundle(text) to authenticated;
revoke all on function private.owns_item(uuid, text) from public, anon, authenticated;

delete from public.bundle_items;
delete from public.bundles;
insert into public.bundles (id, name, theme, off) values
  ('street', 'Street Pack', 'any', 0.8),
  ('knight', 'Knight Pack', 'any', 0.75),
  ('reef', 'Deep Sea Pack', 'any', 0.75),
  ('blaze', 'Blaze Pack', 'any', 0.7),
  ('frostbite', 'Frostbite Pack', 'winter', 0.7),
  ('cosmos', 'Cosmos Pack', 'any', 0.65);
insert into public.bundle_items (bundle, item, value) values
  ('street', 'car:ranger', 200),
  ('street', 'explosion:tsunami', 200),
  ('knight', 'car:halberd', 900),
  ('knight', 'explosion:portal', 900),
  ('knight', 'boost:royal', 450),
  ('reef', 'car:skiff', 900),
  ('reef', 'explosion:kraken', 1800),
  ('reef', 'boost:ocean', 200),
  ('blaze', 'car:brawler', 450),
  ('blaze', 'explosion:phoenix', 900),
  ('blaze', 'boost:inferno', 900),
  ('blaze', 'topper:viking', 900),
  ('frostbite', 'car:quokka', 450),
  ('frostbite', 'explosion:aurora', 900),
  ('frostbite', 'boost:arctic', 450),
  ('frostbite', 'ball:ice', 450),
  ('frostbite', 'topper:antlers', 450),
  ('cosmos', 'car:pulse', 1800),
  ('cosmos', 'explosion:bigbang', 1800),
  ('cosmos', 'boost:hyperspace', 1800),
  ('cosmos', 'ball:planet', 450),
  ('cosmos', 'topper:crown', 1800);
