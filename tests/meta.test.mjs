// Account, Sport Drop and quest checks. Run with: node tests/meta.test.mjs
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const { Account } = await import('../src/meta/account.js');
const { ITEMS, DROP_ITEMS, RARITY, CATEGORIES, rollDrop, key } = await import('../src/meta/items.js');

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });

// Catalog: 5-10 drop items in every category, unique keys.
for (const c of CATEGORIES) {
  const n = DROP_ITEMS.filter((it) => it.cat === c.id).length;
  check(`catalog: ${c.name} has 5-10 drop items`, n >= 5 && n <= 10, `${n}`);
}
check('catalog: unique keys', new Set(ITEMS.map((it) => key(it.cat, it.id))).size === ITEMS.length);

// Odds: rarity shares over many rolls with nothing owned.
{
  const counts = {};
  for (let i = 0; i < 20000; i++) {
    const it = rollDrop(new Set());
    counts[it.rarity] = (counts[it.rarity] || 0) + 1;
  }
  const total = Object.values(RARITY).reduce((s, r) => s + r.weight, 0);
  let worst = 0;
  for (const [r, def] of Object.entries(RARITY)) worst = Math.max(worst, Math.abs(counts[r] / 20000 - def.weight / total));
  check('drops: rarity odds match weights (within 1.5%)', worst < 0.015, `max diff ${(worst * 100).toFixed(2)}%`);
}

// Guest account: welcome drops, no duplicates until everything is owned, then XP.
{
  const a = new Account();
  a.useGuest();
  check('guest: starts with 3 drops', a.data.drops === 3);
  a.data.drops = DROP_ITEMS.length + 2;
  const got = new Set();
  let dup = false;
  for (let i = 0; i < DROP_ITEMS.length; i++) {
    const r = a.openDrop();
    const k = key(r.item.cat, r.item.id);
    if (got.has(k)) dup = true;
    got.add(k);
  }
  check('drops: no duplicates', !dup && got.size === DROP_ITEMS.length, `${got.size}/${DROP_ITEMS.length}`);
  const xp0 = a.data.xp;
  const r = a.openDrop();
  check('drops: all owned gives XP', r.item === null && a.data.xp === xp0 + 300);
  check('equip: owned item works', a.equip('boost', 'prism') && a.loadout.boost === 'prism');
  a.flush();
  await new Promise((r2) => setTimeout(r2, 10));
  const b = new Account();
  b.useGuest();
  check('guest: progress saved in the browser', b.data.owned.length === DROP_ITEMS.length && b.loadout.boost === 'prism');
}

// Equip refuses items you don't own.
{
  store.clear();
  const a = new Account();
  a.useGuest();
  check('equip: locked item refused', !a.equip('car', 'orbit') && a.loadout.car === 'strider');
}

// Quests: progress, completion gives drops and a new quest, match-only rule in free play.
{
  store.clear();
  const a = new Account();
  a.useGuest();
  a.data.quests = [{ id: 'x', type: 'goals', goal: 2, progress: 0, drops: 1 }, { id: 'y', type: 'touches', goal: 3, progress: 0, drops: 1 }, { id: 'z', type: 'flipreset', goal: 1, progress: 0, drops: 2 }];
  const d0 = a.data.drops;
  a.event('goals', 1, { free: true });
  check('quests: match-only quest ignores free play', a.data.quests.find((q) => q.id === 'x').progress === 0);
  a.event('touches', 2, { free: true });
  const done = a.event('touches', 1, { free: true });
  check('quests: completes and pays out', done.length === 1 && a.data.drops === d0 + 1);
  check('quests: replaced, still three, no duplicate types', a.data.quests.length === 3 && new Set(a.data.quests.map((q) => q.type)).size === 3 && !a.data.quests.some((q) => q.id === 'y'));
  a.event('flipreset', 1);
  check('quests: two-drop quest', a.data.drops === d0 + 3);
}

// Levels: each new level gives a drop.
{
  store.clear();
  const a = new Account();
  a.useGuest();
  const d0 = a.data.drops;
  const r = a.recordMatch({ won: true, draw: false, goals: 2, mvp: true, score: 1100 });
  check('levels: 1300 XP = 2 levels = 2 drops (plus quest drops)', r.levels === 2 && a.data.drops >= d0 + 2 && a.level() === 3, `levels ${r.levels} drops ${a.data.drops - d0}`);
  check('record: match counted', a.data.matches === 1 && a.data.wins === 1 && a.data.goals === 2 && a.data.mvps === 1);
}

// Bad saved data is cleaned.
{
  store.clear();
  localStorage.setItem('boostball.guest.v1', JSON.stringify({ name: '<b>x</b>', xp: -5, drops: 'lots', owned: ['car:orbit', 5], loadout: { car: 'orbit', boost: 'nope' }, quests: 'x' }));
  const a = new Account();
  a.useGuest();
  check('clean: bad data fixed', a.data.xp === 0 && a.data.drops === 3 && a.data.owned.length === 1 && a.loadout.car === 'orbit' && a.loadout.boost === 'standard' && a.data.quests.length === 3);
}

let pass = 0;
for (const r of results) {
  if (r.ok) pass++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
}
console.log(`\n${pass}/${results.length} passed`);
if (pass !== results.length) process.exitCode = 1;
