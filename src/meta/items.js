// Every cosmetic item in the game. Starter items everyone owns; the rest come from Sport Drops.
// Rarity decides how often a drop gives an item. All designs and names are original.

export const RARITY = {
  common: { name: 'Common', color: '#9fb2c8', weight: 55 },
  rare: { name: 'Rare', color: '#4aa3ff', weight: 28 },
  epic: { name: 'Epic', color: '#b46bff', weight: 13 },
  legendary: { name: 'Legendary', color: '#ffb020', weight: 4 },
};

export const CATEGORIES = [
  { id: 'car', name: 'Cars', slot: 'car' },
  { id: 'paint', name: 'Paint colors', slot: 'paint' },
  { id: 'finish', name: 'Paint finishes', slot: 'finish' },
  { id: 'decal', name: 'Decals', slot: 'decal' },
  { id: 'boost', name: 'Boosts', slot: 'boost' },
  { id: 'ball', name: 'Ball skins', slot: 'ball' },
  { id: 'explosion', name: 'Goal explosions', slot: 'explosion' },
  { id: 'icon', name: 'Player icons', slot: 'icon' },
  { id: 'banner', name: 'Banners', slot: 'banner' },
  { id: 'title', name: 'Titles', slot: 'title' },
  { id: 'anthem', name: 'Anthems', slot: 'anthem' },
];

const STARTER_CARS = ['strider', 'bulldog', 'viper', 'hornet', 'manta', 'comet', 'blitz', 'rhino', 'scorpion', 'bento'];
const STARTER_EXPLOSIONS = ['classic', 'fireworks', 'supernova', 'shockwave', 'inferno', 'frost', 'lightning', 'blackhole', 'confetti', 'geyser', 'rainbow', 'voxel', 'starburst', 'meteor', 'vortex'];

const list = [];
const add = (cat, id, name, rarity, data = {}, starter = false) => list.push({ cat, id, name, rarity, starter, ...data });

// Cars: id matches the design id in carDesigns.js.
for (const id of STARTER_CARS) add('car', id, id, 'common', {}, true);
add('car', 'jolt', 'Jolt', 'common');
add('car', 'falcon', 'Falcon', 'rare');
add('car', 'brick', 'Brick', 'rare');
add('car', 'stingray', 'Stingray', 'epic');
add('car', 'tempest', 'Tempest', 'epic');
add('car', 'orbit', 'Orbit', 'legendary');

// Goal explosions: id matches goalExplosions.js.
for (const id of STARTER_EXPLOSIONS) add('explosion', id, id, 'common', {}, true);
add('explosion', 'bubbles', 'Bubbles', 'common');
add('explosion', 'petals', 'Petals', 'common');
add('explosion', 'cometshower', 'Comet Shower', 'rare');
add('explosion', 'heartbeat', 'Heartbeat', 'rare');
add('explosion', 'phoenix', 'Phoenix', 'epic');
add('explosion', 'galaxy', 'Galaxy', 'legendary');

// Boosts: flame colors (hot core, middle, tail) and particle colors.
add('boost', 'standard', 'Standard', 'common', { hot: 0xfff2d8, mid: 0xff8c26, tail: 0xe62e0d, spark: 0xffbf59 }, true);
add('boost', 'ice', 'Ice', 'common', { hot: 0xf2fbff, mid: 0x5fd8ff, tail: 0x1a6cff, spark: 0xbff0ff });
add('boost', 'toxic', 'Toxic', 'common', { hot: 0xf4ffd8, mid: 0x7dff3a, tail: 0x139a2e, spark: 0xc8ff7a });
add('boost', 'crimson', 'Crimson', 'rare', { hot: 0xffe0e0, mid: 0xff2d4a, tail: 0x7a0010, spark: 0xff7a8a });
add('boost', 'royal', 'Royal', 'rare', { hot: 0xf3e8ff, mid: 0x9b5cff, tail: 0x3a12a8, spark: 0xd2b2ff });
add('boost', 'plasma', 'Plasma', 'rare', { hot: 0xfff0fb, mid: 0xff4fd8, tail: 0x2a6bff, spark: 0xff9cf0 });
add('boost', 'gold', 'Gold Rush', 'epic', { hot: 0xffffff, mid: 0xffd04a, tail: 0xb87a10, spark: 0xffe28a });
add('boost', 'shadow', 'Shadow', 'epic', { hot: 0xd8c8ff, mid: 0x4a1a8a, tail: 0x0a0414, spark: 0x8a5cff, dark: true });
add('boost', 'prism', 'Prism', 'legendary', { hot: 0xffffff, mid: 0xff4040, tail: 0x4040ff, spark: 0xffffff, rainbow: true });

// Ball skins (textures.js makeBallTextures).
add('ball', 'standard', 'Standard', 'common', {}, true);
add('ball', 'beach', 'Beach', 'common');
add('ball', 'eight', 'Eight', 'common');
add('ball', 'midnight', 'Midnight', 'rare');
add('ball', 'globe', 'Globe', 'rare');
add('ball', 'lava', 'Lava', 'epic');
add('ball', 'golden', 'Golden', 'epic');
add('ball', 'disco', 'Disco', 'legendary');

// Paint colors: the body shade for each team (blue team, orange team). Glow parts keep the team color.
add('paint', 'team', 'Team', 'common', { colors: null }, true);
add('paint', 'deep', 'Deep', 'common', { colors: [0x0b2f7a, 0x8a1a0e] });
add('paint', 'bright', 'Bright', 'common', { colors: [0x4cb4ff, 0xffc21a] });
add('paint', 'teal', 'Teal', 'rare', { colors: [0x0fa3a3, 0xff9a1a] });
add('paint', 'royal', 'Royal', 'rare', { colors: [0x5a2ad6, 0xd61a3c] });
add('paint', 'frost', 'Frost', 'epic', { colors: [0xcfe6ff, 0xffd9c2] });
add('paint', 'shadow', 'Shadow', 'epic', { colors: [0x10182c, 0x2a1408] });

// Paint finishes: material settings plus an optional texture pattern.
add('finish', 'gloss', 'Gloss', 'common', { mat: { roughness: 0.32, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.06 } }, true);
add('finish', 'matte', 'Matte', 'common', { mat: { roughness: 0.78, metalness: 0.05, clearcoat: 0, clearcoatRoughness: 1 } });
add('finish', 'metallic', 'Metallic', 'common', { mat: { roughness: 0.24, metalness: 0.8, clearcoat: 1, clearcoatRoughness: 0.08 } });
add('finish', 'carbon', 'Carbon Weave', 'rare', { mat: { roughness: 0.38, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1 }, pattern: 'carbon' });
add('finish', 'pearl', 'Pearl', 'rare', { mat: { roughness: 0.28, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 1, iridescenceIOR: 1.6 } });
add('finish', 'glitter', 'Glitter', 'epic', { mat: { roughness: 0.3, metalness: 0.65, clearcoat: 1, clearcoatRoughness: 0.08 }, pattern: 'glitter' });
add('finish', 'chrome', 'Chrome', 'legendary', { mat: { roughness: 0.06, metalness: 1, clearcoat: 1, clearcoatRoughness: 0.03 } });

// Decals: livery styles drawn in the accent color (textures.js makeLiveryTexture).
add('decal', 'default', 'Default', 'common', {}, true);
add('decal', 'checker', 'Checker', 'common');
add('decal', 'stars', 'Stars', 'common');
add('decal', 'camo', 'Camo', 'common');
add('decal', 'flames', 'Flames', 'rare');
add('decal', 'tiger', 'Tiger', 'rare');
add('decal', 'lightning', 'Lightning', 'epic');
add('decal', 'circuit', 'Circuit', 'epic');

// Player icons (drawn as SVG, see icons.js).
add('icon', 'ball', 'Ball', 'common', {}, true);
add('icon', 'star', 'Star', 'common');
add('icon', 'bolt', 'Bolt', 'common');
add('icon', 'flame', 'Flame', 'rare');
add('icon', 'rocket', 'Rocket', 'rare');
add('icon', 'shield', 'Shield', 'rare');
add('icon', 'wings', 'Wings', 'epic');
add('icon', 'crown', 'Crown', 'legendary');

// Banners (CSS backgrounds for the player card).
add('banner', 'default', 'Default', 'common', { css: 'linear-gradient(90deg, rgba(8, 13, 24, 0.92), rgba(8, 13, 24, 0.72))' }, true);
add('banner', 'carbon', 'Carbon', 'common', { css: 'repeating-linear-gradient(45deg, #15181e 0 6px, #0c0e12 6px 12px)' });
add('banner', 'ice', 'Glacier', 'common', { css: 'linear-gradient(120deg, #0d3550, #2f8fc0 55%, #bfe8ff)' });
add('banner', 'sunset', 'Sunset', 'rare', { css: 'linear-gradient(100deg, #3a0f4a, #c2304a 50%, #ff9a3a)' });
add('banner', 'aurora', 'Aurora', 'rare', { css: 'linear-gradient(100deg, #06121f, #0e6b5a 40%, #3a2a8a 75%, #06121f)' });
add('banner', 'grid', 'Neon Grid', 'epic', { css: 'linear-gradient(rgba(255, 79, 216, 0.35) 1px, transparent 1px) 0 0 / 14px 14px, linear-gradient(90deg, rgba(95, 240, 255, 0.35) 1px, transparent 1px) 0 0 / 14px 14px, linear-gradient(180deg, #14061f, #2a0a3a)' });
add('banner', 'lava', 'Lava', 'epic', { css: 'radial-gradient(circle at 20% 80%, #ffb020 0, transparent 30%), radial-gradient(circle at 75% 30%, #ff4a1a 0, transparent 35%), linear-gradient(90deg, #2a0804, #5a1206)' });
add('banner', 'galaxy', 'Galaxy', 'legendary', { css: 'radial-gradient(1px 1px at 20% 30%, #fff, transparent), radial-gradient(1px 1px at 60% 70%, #fff, transparent), radial-gradient(1.5px 1.5px at 80% 20%, #fff, transparent), radial-gradient(1px 1px at 40% 85%, #fff, transparent), radial-gradient(ellipse at 70% 50%, rgba(180, 80, 255, 0.55), transparent 60%), linear-gradient(90deg, #05030f, #160a3a)' });

// Titles: text shown under your name.
add('title', 'rookie', 'Rookie', 'common', {}, true);
add('title', 'boostjunkie', 'Boost Junkie', 'common');
add('title', 'wallcrawler', 'Wall Crawler', 'common');
add('title', 'goalmachine', 'Goal Machine', 'rare');
add('title', 'flipwizard', 'Flip Wizard', 'rare');
add('title', 'nightdriver', 'Night Driver', 'rare');
add('title', 'aerialace', 'Aerial Ace', 'epic');
add('title', 'legend', 'Legend', 'legendary');

// Anthems: the tune that plays when you score (audio/anthems.js). Uploaded songs are not items;
// they live in the browser and are equipped as 'custom:<id>'.
add('anthem', 'none', 'None', 'common', {}, true);
add('anthem', 'kickoff', 'Kickoff Fanfare', 'common', {}, true);
add('anthem', 'neon', 'Neon Drive', 'common');
add('anthem', 'chip', 'Chip Champion', 'common');
add('anthem', 'drumline', 'Drumline', 'common');
add('anthem', 'bassdrop', 'Bass Drop', 'rare');
add('anthem', 'victory', 'Victory Lap', 'rare');
add('anthem', 'midnight', 'Midnight Run', 'epic');
add('anthem', 'overdrive', 'Overdrive', 'epic');
add('anthem', 'golden', 'Golden Hour', 'legendary');

export const ITEMS = list;

// Item key: "cat:id" (ids repeat across categories).
export const key = (cat, id) => `${cat}:${id}`;
const byKey = new Map(list.map((it) => [key(it.cat, it.id), it]));
export const item = (cat, id) => byKey.get(key(cat, id)) || null;
export const itemsIn = (cat) => list.filter((it) => it.cat === cat);
export const isCustomAnthem = (id) => typeof id === 'string' && /^custom:[a-z0-9]{1,24}$/.test(id);
export const DROP_ITEMS = list.filter((it) => !it.starter);

export const DEFAULT_LOADOUT = {
  car: 'strider', accent: 'white', paint: 'team', finish: 'gloss', decal: 'default',
  boost: 'standard', ball: 'standard', explosion: 'classic', icon: 'ball', banner: 'default', title: 'rookie', anthem: 'kickoff',
};

// Pick a drop item: rarity by weight, then a random item of that rarity you don't own yet.
// Returns null when everything is owned.
export function rollDrop(owned, rand = Math.random) {
  const left = DROP_ITEMS.filter((it) => !owned.has(key(it.cat, it.id)));
  if (!left.length) return null;
  const rarities = Object.keys(RARITY).filter((r) => left.some((it) => it.rarity === r));
  const total = rarities.reduce((s, r) => s + RARITY[r].weight, 0);
  let x = rand() * total;
  let pick = rarities[rarities.length - 1];
  for (const r of rarities) {
    x -= RARITY[r].weight;
    if (x <= 0) {
      pick = r;
      break;
    }
  }
  const pool = left.filter((it) => it.rarity === pick);
  return pool[Math.floor(rand() * pool.length)];
}
