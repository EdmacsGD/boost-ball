// Orbs, the shop and the season pass. The server (supabase/011_orbs_seasons.sql, made from this
// file by tools/gen_economy_sql.mjs) is what really counts orbs and hands out items; this file is
// the same numbers for the game to show.

// How you earn orbs (all counted on the server).
export const ORB_RULES = {
  perGoal: 5, // per goal in a counted match, up to 10 goals a match
  perSave: 3, // per save, up to 10 a match
  per15Min: 25, // every 15 minutes of play time
  perClipView: 1, // per signed-in viewer of your clip (not you)
  perClipLike: 3, // per like on your clip (once per person and clip)
  clipDailyCap: 150, // most orbs from clips in one day
};

export const PREMIUM_PASS_PRICE = 1500;
export const PASS_TIERS = 30;
export const PASS_XP_PER_TIER = 800; // match XP, about 50 matches for the whole pass

// Shop prices by rarity.
export const PRICE = { common: 200, rare: 450, epic: 900, legendary: 1800 };

// What the shop sells: "cat:id" -> rarity. Items marked `passOnly` are only in the pass.
export const SHOP = [
  ['car:ranger', 'common'], ['car:quokka', 'rare'], ['car:brawler', 'rare'], ['car:skiff', 'epic'], ['car:halberd', 'epic'], ['car:pulse', 'legendary'],
  ['topper:beanie', 'common'], ['topper:holiday', 'rare'], ['topper:antlers', 'rare'],
  ['topper:cap', 'common'], ['topper:cone', 'common'], ['topper:party', 'common'], ['topper:propeller', 'rare'],
  ['topper:tophat', 'rare'], ['topper:viking', 'epic'], ['topper:wizard', 'epic'], ['topper:crown', 'legendary'],
];
// Bundles: a car and a goal explosion, the bigger ones with more. The price is the shop value of
// the items you do not have yet, times `off`, rounded down to 50. Items you already own are free.
// `theme: 'winter'` bundles are only for sale in December to February.
export const BUNDLES = [
  { id: 'street', name: 'Street Pack', blurb: 'A first car and a splash to go with it.', off: 0.8,
    items: [['car:ranger', 'common'], ['explosion:tsunami', 'common']] },
  { id: 'knight', name: 'Knight Pack', blurb: 'Armor, a royal trail and a goal that opens a portal.', off: 0.75,
    items: [['car:halberd', 'epic'], ['explosion:portal', 'epic'], ['boost:royal', 'rare']] },
  { id: 'reef', name: 'Deep Sea Pack', blurb: 'Sail in, then let the Kraken out.', off: 0.75,
    items: [['car:skiff', 'epic'], ['explosion:kraken', 'legendary'], ['boost:ocean', 'common']] },
  { id: 'blaze', name: 'Blaze Pack', blurb: 'Fire on the car, fire in the goal.', off: 0.7,
    items: [['car:brawler', 'rare'], ['explosion:phoenix', 'epic'], ['boost:inferno', 'epic'], ['topper:viking', 'epic']] },
  { id: 'frostbite', name: 'Frostbite Pack', blurb: 'Winter only. Lights in the sky and ice everywhere.', off: 0.7, theme: 'winter',
    items: [['car:quokka', 'rare'], ['explosion:aurora', 'epic'], ['boost:arctic', 'rare'], ['ball:ice', 'rare'], ['topper:antlers', 'rare']] },
  { id: 'cosmos', name: 'Cosmos Pack', blurb: 'The biggest pack: four legendary items and a planet ball.', off: 0.65,
    items: [['car:pulse', 'legendary'], ['explosion:bigbang', 'legendary'], ['boost:hyperspace', 'legendary'], ['ball:planet', 'rare'], ['topper:crown', 'legendary']] },
];

// What a bundle costs you: `owns(k)` says if you already have item k.
export function bundlePrice(b, owns = () => false) {
  const full = b.items.reduce((n, [, r]) => n + PRICE[r], 0);
  const missing = b.items.filter(([k]) => !owns(k));
  const value = missing.reduce((n, [, r]) => n + PRICE[r], 0);
  const round = (v) => Math.max(50, Math.floor((v * b.off) / 50) * 50);
  return { full, price: missing.length ? round(value) : 0, worth: value, missing: missing.length, fullPrice: round(full) };
}

export const PASS_ONLY = ['topper:icecrown', 'topper:snowdrift', 'topper:halo', 'topper:sunglasses'];

// Season = one calendar month (UTC). Winter themes in December to February.
export function seasonKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
export function seasonEnd(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}
export function seasonTheme(key) {
  const m = Number(String(key).slice(5, 7));
  return m === 12 || m <= 2 ? 'winter' : 'any';
}
export function seasonName(key) {
  const [y, m] = String(key).split('-').map(Number);
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en', { month: 'long', timeZone: 'UTC' });
  return `${seasonTheme(key) === 'winter' ? 'Winter' : 'Season'} ${month} ${y}`;
}

// The pass: [tier, track, reward]. Reward is { item: 'cat:id' } or { orbs: n }.
// `winter` rewards replace `any` ones of the same tier and track in winter months.
const R = (tier, track, reward, theme = 'any') => ({ tier, track, theme, ...reward });
export const PASS_REWARDS = [
  // Free track: every second tier.
  R(2, 'free', { orbs: 50 }), R(4, 'free', { orbs: 50 }), R(6, 'free', { item: 'topper:cap' }), R(6, 'free', { item: 'topper:beanie' }, 'winter'),
  R(8, 'free', { orbs: 75 }), R(10, 'free', { orbs: 75 }), R(12, 'free', { item: 'topper:cone' }), R(14, 'free', { orbs: 100 }),
  R(16, 'free', { orbs: 100 }), R(18, 'free', { item: 'topper:party' }), R(20, 'free', { orbs: 125 }), R(22, 'free', { orbs: 125 }),
  R(24, 'free', { item: 'car:ranger' }), R(26, 'free', { orbs: 150 }), R(28, 'free', { orbs: 150 }), R(30, 'free', { item: 'topper:sunglasses' }),
  // Premium track: every tier.
  R(1, 'premium', { item: 'topper:tophat' }), R(1, 'premium', { item: 'topper:holiday' }, 'winter'),
  R(2, 'premium', { orbs: 50 }), R(3, 'premium', { item: 'topper:propeller' }), R(4, 'premium', { orbs: 50 }),
  R(5, 'premium', { item: 'topper:viking' }), R(5, 'premium', { item: 'topper:antlers' }, 'winter'),
  R(6, 'premium', { orbs: 50 }), R(7, 'premium', { orbs: 50 }), R(8, 'premium', { item: 'car:quokka' }), R(9, 'premium', { orbs: 50 }),
  R(10, 'premium', { item: 'topper:halo' }), R(10, 'premium', { item: 'topper:snowdrift' }, 'winter'),
  R(11, 'premium', { orbs: 50 }), R(12, 'premium', { orbs: 50 }), R(13, 'premium', { item: 'topper:wizard' }), R(14, 'premium', { orbs: 50 }),
  R(15, 'premium', { item: 'car:skiff' }), R(16, 'premium', { orbs: 50 }), R(17, 'premium', { orbs: 50 }), R(18, 'premium', { item: 'car:brawler' }),
  R(19, 'premium', { orbs: 50 }), R(20, 'premium', { item: 'car:halberd' }), R(21, 'premium', { orbs: 75 }), R(22, 'premium', { orbs: 75 }),
  R(23, 'premium', { orbs: 75 }), R(24, 'premium', { orbs: 75 }), R(25, 'premium', { item: 'car:pulse' }), R(26, 'premium', { orbs: 75 }),
  R(27, 'premium', { orbs: 75 }), R(28, 'premium', { orbs: 100 }), R(29, 'premium', { orbs: 100 }), R(30, 'premium', { item: 'topper:crown' }),
  R(30, 'premium', { item: 'topper:icecrown' }, 'winter'),
];

// Rewards for one season, with the theme applied.
export function passFor(key) {
  const theme = seasonTheme(key);
  const out = [];
  for (const r of PASS_REWARDS) {
    if (r.theme !== 'any' && r.theme !== theme) continue;
    if (r.theme === 'any' && theme !== 'any' && PASS_REWARDS.some((x) => x.theme === theme && x.tier === r.tier && x.track === r.track)) continue;
    out.push(r);
  }
  return out;
}

export const priceOf = (k) => {
  const row = SHOP.find((x) => x[0] === k);
  return row ? PRICE[row[1]] : null;
};
