// Writes the shop and pass tables for supabase/011_orbs_seasons.sql from src/meta/economy.js.
// Run: node tools/gen_economy_sql.mjs > supabase/011_economy_data.sql
import { SHOP, PRICE, PASS_ONLY, PASS_REWARDS } from '../src/meta/economy.js';
const q = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const out = [];
out.push('delete from public.shop_items;');
out.push(`insert into public.shop_items (item, price, for_sale) values\n  ${[...SHOP.map(([k, r]) => `(${q(k)}, ${PRICE[r]}, true)`), ...PASS_ONLY.map((k) => `(${q(k)}, 0, false)`)].join(',\n  ')};`);
out.push('delete from public.pass_rewards;');
out.push(`insert into public.pass_rewards (tier, track, theme, item, orbs) values\n  ${PASS_REWARDS.map((r) => `(${r.tier}, ${q(r.track)}, ${q(r.theme)}, ${q(r.item)}, ${r.orbs ?? 'null'})`).join(',\n  ')};`);
console.log(out.join('\n'));
