// Writes the bundle table for supabase/015_bundles.sql from src/meta/economy.js.
// Run: node tools/gen_bundles_sql.mjs
import { BUNDLES, PRICE } from '../src/meta/economy.js';
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const rows = BUNDLES.map((b) => `(${q(b.id)}, ${q(b.name)}, ${q(b.theme || 'any')}, ${b.off})`);
const items = BUNDLES.flatMap((b) => b.items.map(([k, r]) => `(${q(b.id)}, ${q(k)}, ${PRICE[r]})`));
console.log(`delete from public.bundle_items;\ndelete from public.bundles;
insert into public.bundles (id, name, theme, off) values\n  ${rows.join(',\n  ')};
insert into public.bundle_items (bundle, item, value) values\n  ${items.join(',\n  ')};`);
