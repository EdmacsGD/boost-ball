-- Toppers sold in the shop can also come from Sport Drops, so the profile guard no longer strips
-- them. Only cars from the shop and the pass-only toppers stay server-given.
alter table public.shop_items add column if not exists locked boolean not null default true;
update public.shop_items set locked = false
  where item like 'topper:%' and item not in ('topper:icecrown', 'topper:snowdrift', 'topper:halo', 'topper:sunglasses');
create or replace function private.server_items() returns text[] language sql stable set search_path = '' as $$
  select coalesce(array_agg(item), '{}') from public.shop_items where locked;
$$;
