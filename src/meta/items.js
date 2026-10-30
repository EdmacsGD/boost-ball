// Every cosmetic item in the game. Starter items everyone owns; most of the rest come from Sport Drops.
// Rarity decides how often a drop gives an item. All designs and names are original.
// Achievement items (`unlock`) never drop: you earn them by reaching a lifetime stat in matches.

export const RARITY = {
  common: { name: 'Common', color: '#9fb2c8', weight: 55 },
  rare: { name: 'Rare', color: '#4aa3ff', weight: 28 },
  epic: { name: 'Epic', color: '#b46bff', weight: 13 },
  legendary: { name: 'Legendary', color: '#ffb020', weight: 4 },
  exclusive: { name: 'Achievement', color: '#ff4f6d', weight: 0 },
};

// Lifetime stats that achievement items need. `stat` is read by Account.stat().
const U = (stat, goal, text) => ({ unlock: { stat, goal, text } });

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
const add = (cat, id, name, rarity, data = {}, starter = false) => list.push({ cat, id, name, rarity: data.unlock ? 'exclusive' : rarity, starter, ...data });

// Cars: id matches the design id in carDesigns.js.
for (const id of STARTER_CARS) add('car', id, id, 'common', {}, true);
add('car', 'jolt', 'Jolt', 'common');
add('car', 'falcon', 'Falcon', 'rare');
add('car', 'brick', 'Brick', 'rare');
add('car', 'stingray', 'Stingray', 'epic');
add('car', 'tempest', 'Tempest', 'epic');
add('car', 'orbit', 'Orbit', 'legendary');
add('car', 'boxer', 'Boxer', 'common');
add('car', 'buzz', 'Buzz', 'rare');
add('car', 'lancer', 'Lancer', 'epic');
add('car', 'titan', 'Titan', '', U('wins1v1', 50, 'Win 50 1v1 matches'));
add('car', 'phantom', 'Phantom', '', U('goals', 500, 'Score 500 goals in matches'));
add('car', 'monarch', 'Monarch', '', U('wins', 100, 'Win 100 matches'));
add('car', 'hotshot', 'Hotshot', '', U('top1', 1, 'Be #1 on a Players leaderboard (website)'));
add('car', 'hauler', 'Hauler', 'common');
add('car', 'breeze', 'Breeze', 'common');
add('car', 'gravel', 'Gravel', 'common');
add('car', 'doorstop', 'Doorstop', 'common');
add('car', 'glider', 'Glider', 'rare');
add('car', 'pocket', 'Pocket', 'rare');
add('car', 'enforcer', 'Enforcer', 'rare');
add('car', 'stomper', 'Stomper', 'epic');
add('car', 'afterglow', 'Afterglow', 'epic');
add('car', 'nova', 'Nova', 'legendary');

// Goal explosions: id matches goalExplosions.js.
for (const id of STARTER_EXPLOSIONS) add('explosion', id, id, 'common', {}, true);
add('explosion', 'bubbles', 'Bubbles', 'common');
add('explosion', 'petals', 'Petals', 'common');
add('explosion', 'cometshower', 'Comet Shower', 'rare');
add('explosion', 'heartbeat', 'Heartbeat', 'rare');
add('explosion', 'phoenix', 'Phoenix', 'epic');
add('explosion', 'galaxy', 'Galaxy', 'legendary');
add('explosion', 'aurora', 'Aurora', 'epic');
add('explosion', 'eclipse', 'Eclipse', '', U('saves', 150, 'Make 150 saves in matches'));
add('explosion', 'thunderdome', 'Thunderdome', '', U('demos', 100, 'Demolish 100 cars in matches'));
add('explosion', 'tsunami', 'Tsunami', 'common');
add('explosion', 'popcorn', 'Popcorn', 'common');
add('explosion', 'balloons', 'Balloons', 'common');
add('explosion', 'pinball', 'Pinball', 'common');
add('explosion', 'glitch', 'Glitch', 'rare');
add('explosion', 'quake', 'Quake', 'rare');
add('explosion', 'solarflare', 'Solar Flare', 'rare');
add('explosion', 'warp', 'Warp Speed', 'epic');
add('explosion', 'portal', 'Portal', 'epic');
add('explosion', 'bigbang', 'Big Bang', 'legendary');

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
add('boost', 'afterburner', 'Afterburner', '', { hot: 0xffffff, mid: 0x5ad8ff, tail: 0xff5a1a, spark: 0xffe0a0, ...U('hours', 10, 'Play for 10 hours') });
add('boost', 'ember', 'Ember', 'common', { hot: 0xfff0c8, mid: 0xff6a1a, tail: 0x5a1004, spark: 0xffa040 });
add('boost', 'mint', 'Mint', 'common', { hot: 0xeafff6, mid: 0x3affb4, tail: 0x0a7a5a, spark: 0xa8ffe0 });
add('boost', 'bubblegum', 'Bubblegum', 'common', { hot: 0xfff0f8, mid: 0xff7ac8, tail: 0xb02a7a, spark: 0xffc0e4 });
add('boost', 'ocean', 'Ocean', 'common', { hot: 0xe8fbff, mid: 0x1ab0c8, tail: 0x0a2a7a, spark: 0x7ae8ff });
add('boost', 'sunrise', 'Sunrise', 'rare', { hot: 0xfffbe0, mid: 0xffb020, tail: 0xff2a6a, spark: 0xffe080 });
add('boost', 'venom', 'Venom', 'rare', { hot: 0xf8ffe0, mid: 0xb4ff1a, tail: 0x4a0a6a, spark: 0xe0ff7a });
add('boost', 'arctic', 'Arctic', 'rare', { hot: 0xffffff, mid: 0xbfe8ff, tail: 0x7a8aa0, spark: 0xffffff });
add('boost', 'cosmic', 'Cosmic', 'epic', { hot: 0xffffff, mid: 0x6a4aff, tail: 0x1a0a4a, spark: 0xffe0ff, dark: true });
add('boost', 'inferno', 'Hellfire', 'epic', { hot: 0xffffe0, mid: 0xff3a0a, tail: 0x1a0402, spark: 0xffc040, dark: true });
add('boost', 'hyperspace', 'Hyperspace', 'legendary', { hot: 0xffffff, mid: 0x40ffe0, tail: 0xff40d0, spark: 0xffffff, rainbow: true });

// Ball skins (textures.js makeBallTextures).
add('ball', 'standard', 'Standard', 'common', {}, true);
add('ball', 'beach', 'Beach', 'common');
add('ball', 'eight', 'Eight', 'common');
add('ball', 'midnight', 'Midnight', 'rare');
add('ball', 'globe', 'Globe', 'rare');
add('ball', 'lava', 'Lava', 'epic');
add('ball', 'golden', 'Golden', 'epic');
add('ball', 'disco', 'Disco', 'legendary');
add('ball', 'champion', 'Champion', '', U('mvps', 50, 'Be the MVP 50 times'));
add('ball', 'tennis', 'Fuzzball', 'common');
add('ball', 'watermelon', 'Melon', 'common');
add('ball', 'checker', 'Checkmate', 'common');
add('ball', 'camo', 'Camo', 'common');
add('ball', 'neon', 'Neon Seams', 'rare');
add('ball', 'planet', 'Ringed Planet', 'rare');
add('ball', 'ice', 'Ice Core', 'rare');
add('ball', 'circuit', 'Circuit', 'epic');
add('ball', 'eyeball', 'Eyeball', 'epic');
add('ball', 'sun', 'Mini Sun', 'legendary');

// Paint colors: the body shade for each team (blue team, orange team). Glow parts keep the team color.
add('paint', 'team', 'Team', 'common', { colors: null }, true);
add('paint', 'deep', 'Deep', 'common', { colors: [0x0b2f7a, 0x8a1a0e] });
add('paint', 'bright', 'Bright', 'common', { colors: [0x4cb4ff, 0xffc21a] });
add('paint', 'teal', 'Teal', 'rare', { colors: [0x0fa3a3, 0xff9a1a] });
add('paint', 'royal', 'Royal', 'rare', { colors: [0x5a2ad6, 0xd61a3c] });
add('paint', 'frost', 'Frost', 'epic', { colors: [0xcfe6ff, 0xffd9c2] });
add('paint', 'shadow', 'Shadow', 'epic', { colors: [0x10182c, 0x2a1408] });
add('paint', 'molten', 'Molten', '', { colors: [0x1a0a3a, 0x3a0a04], ...U('wins2v2', 25, 'Win 25 2v2 matches') });
add('paint', 'forest', 'Forest', 'common', { colors: [0x1f5a3a, 0x5a4a1a] });
add('paint', 'sky', 'Sky', 'common', { colors: [0x7ac0ff, 0xffb07a] });
add('paint', 'slate', 'Slate', 'common', { colors: [0x3a4658, 0x584a3a] });
add('paint', 'sand', 'Sand', 'common', { colors: [0xb8a47a, 0xd8b47a] });
add('paint', 'mint', 'Mint', 'rare', { colors: [0x6ae0c0, 0xffe07a] });
add('paint', 'cherry', 'Cherry', 'rare', { colors: [0x4a1ac0, 0xc01a2a] });
add('paint', 'lime', 'Lime', 'rare', { colors: [0x1ac06a, 0xb4e01a] });
add('paint', 'pink', 'Hot Pink', 'epic', { colors: [0xe01a9a, 0xff4a7a] });
add('paint', 'snow', 'Snow', 'epic', { colors: [0xf4f8ff, 0xfff4ec] });
add('paint', 'void', 'Void', 'legendary', { colors: [0x050508, 0x080505] });

// Paint finishes: material settings plus an optional texture pattern.
add('finish', 'gloss', 'Gloss', 'common', { mat: { roughness: 0.32, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.06 } }, true);
add('finish', 'matte', 'Matte', 'common', { mat: { roughness: 0.78, metalness: 0.05, clearcoat: 0, clearcoatRoughness: 1 } });
add('finish', 'metallic', 'Metallic', 'common', { mat: { roughness: 0.24, metalness: 0.8, clearcoat: 1, clearcoatRoughness: 0.08 } });
add('finish', 'carbon', 'Carbon Weave', 'rare', { mat: { roughness: 0.38, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1 }, pattern: 'carbon' });
add('finish', 'pearl', 'Pearl', 'rare', { mat: { roughness: 0.28, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 1, iridescenceIOR: 1.6 } });
add('finish', 'glitter', 'Glitter', 'epic', { mat: { roughness: 0.3, metalness: 0.65, clearcoat: 1, clearcoatRoughness: 0.08 }, pattern: 'glitter' });
add('finish', 'chrome', 'Chrome', 'legendary', { mat: { roughness: 0.06, metalness: 1, clearcoat: 1, clearcoatRoughness: 0.03 } });
add('finish', 'spectrum', 'Spectrum Chrome', '', { mat: { roughness: 0.08, metalness: 1, clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 1, iridescenceIOR: 1.9 }, ...U('wins3v3', 25, 'Win 25 3v3 matches') });
add('finish', 'satin', 'Satin', 'common', { mat: { roughness: 0.5, metalness: 0.3, clearcoat: 0.4, clearcoatRoughness: 0.4 } });
add('finish', 'rubber', 'Rubber', 'common', { mat: { roughness: 0.95, metalness: 0, clearcoat: 0, clearcoatRoughness: 1 } });
add('finish', 'brushed', 'Brushed Metal', 'common', { mat: { roughness: 0.34, metalness: 0.9, clearcoat: 0.3, clearcoatRoughness: 0.3 }, pattern: 'brushed' });
add('finish', 'candy', 'Candy', 'common', { mat: { roughness: 0.15, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.02 } });
add('finish', 'hexmesh', 'Hex Mesh', 'rare', { mat: { roughness: 0.4, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.1 }, pattern: 'hexmesh' });
add('finish', 'scales', 'Dragon Scales', 'rare', { mat: { roughness: 0.3, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.08 }, pattern: 'scales' });
add('finish', 'frosted', 'Frosted', 'rare', { mat: { roughness: 0.62, metalness: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.6, iridescence: 0.4, iridescenceIOR: 1.3 } });
add('finish', 'oilslick', 'Oil Slick', 'epic', { mat: { roughness: 0.2, metalness: 0.7, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 1, iridescenceIOR: 2.2 } });
add('finish', 'stripes', 'Pinstripe', 'epic', { mat: { roughness: 0.28, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.06 }, pattern: 'pinstripe' });
add('finish', 'gold', 'Gold Leaf', 'legendary', { mat: { roughness: 0.12, metalness: 1, clearcoat: 1, clearcoatRoughness: 0.04 }, pattern: 'goldleaf' });

// Decals: livery styles drawn in the accent color (textures.js makeLiveryTexture).
add('decal', 'default', 'Default', 'common', {}, true);
add('decal', 'checker', 'Checker', 'common');
add('decal', 'stars', 'Stars', 'common');
add('decal', 'camo', 'Camo', 'common');
add('decal', 'flames', 'Flames', 'rare');
add('decal', 'tiger', 'Tiger', 'rare');
add('decal', 'lightning', 'Lightning', 'epic');
add('decal', 'circuit', 'Circuit', 'epic');
add('decal', 'hexcore', 'Hex Core', '', U('assists', 100, 'Get 100 assists in matches'));
add('decal', 'dots', 'Polka', 'common');
add('decal', 'racing', 'Racing Stripes', 'common');
add('decal', 'waves', 'Waves', 'common');
add('decal', 'zebra', 'Zebra', 'common');
add('decal', 'splatter', 'Splatter', 'rare');
add('decal', 'arrows', 'Arrows', 'rare');
add('decal', 'shark', 'Shark Teeth', 'rare');
add('decal', 'galaxy', 'Nebula', 'epic');
add('decal', 'barcode', 'Barcode', 'epic');
add('decal', 'dragon', 'Dragon', 'legendary');

// Player icons (drawn as SVG, see icons.js).
add('icon', 'ball', 'Ball', 'common', {}, true);
add('icon', 'star', 'Star', 'common');
add('icon', 'bolt', 'Bolt', 'common');
add('icon', 'flame', 'Flame', 'rare');
add('icon', 'rocket', 'Rocket', 'rare');
add('icon', 'shield', 'Shield', 'rare');
add('icon', 'wings', 'Wings', 'epic');
add('icon', 'crown', 'Crown', 'legendary');
add('icon', 'trophy', 'Trophy', '', U('level', 20, 'Reach level 20'));
add('icon', 'heart', 'Heart', 'common');
add('icon', 'skull', 'Skull', 'common');
add('icon', 'wheel', 'Wheel', 'common');
add('icon', 'target', 'Target', 'common');
add('icon', 'diamond', 'Diamond', 'rare');
add('icon', 'snowflake', 'Snowflake', 'rare');
add('icon', 'paw', 'Paw', 'rare');
add('icon', 'ghost', 'Ghost', 'epic');
add('icon', 'flag', 'Finish Flag', 'epic');
add('icon', 'galaxy', 'Planet', 'legendary');

// Banners (CSS backgrounds for the player card).
add('banner', 'default', 'Default', 'common', { css: 'linear-gradient(90deg, rgba(8, 13, 24, 0.92), rgba(8, 13, 24, 0.72))' }, true);
add('banner', 'carbon', 'Carbon', 'common', { css: 'repeating-linear-gradient(45deg, #15181e 0 6px, #0c0e12 6px 12px)' });
add('banner', 'ice', 'Glacier', 'common', { css: 'linear-gradient(120deg, #0d3550, #2f8fc0 55%, #bfe8ff)' });
add('banner', 'sunset', 'Sunset', 'rare', { css: 'linear-gradient(100deg, #3a0f4a, #c2304a 50%, #ff9a3a)' });
add('banner', 'aurora', 'Aurora', 'rare', { css: 'linear-gradient(100deg, #06121f, #0e6b5a 40%, #3a2a8a 75%, #06121f)' });
add('banner', 'grid', 'Neon Grid', 'epic', { css: 'linear-gradient(rgba(255, 79, 216, 0.35) 1px, transparent 1px) 0 0 / 14px 14px, linear-gradient(90deg, rgba(95, 240, 255, 0.35) 1px, transparent 1px) 0 0 / 14px 14px, linear-gradient(180deg, #14061f, #2a0a3a)' });
add('banner', 'lava', 'Lava', 'epic', { css: 'radial-gradient(circle at 20% 80%, #ffb020 0, transparent 30%), radial-gradient(circle at 75% 30%, #ff4a1a 0, transparent 35%), linear-gradient(90deg, #2a0804, #5a1206)' });
add('banner', 'galaxy', 'Galaxy', 'legendary', { css: 'radial-gradient(1px 1px at 20% 30%, #fff, transparent), radial-gradient(1px 1px at 60% 70%, #fff, transparent), radial-gradient(1.5px 1.5px at 80% 20%, #fff, transparent), radial-gradient(1px 1px at 40% 85%, #fff, transparent), radial-gradient(ellipse at 70% 50%, rgba(180, 80, 255, 0.55), transparent 60%), linear-gradient(90deg, #05030f, #160a3a)' });
add('banner', 'halloffame', 'Hall of Fame', '', { css: 'repeating-linear-gradient(90deg, rgba(255, 210, 120, 0.18) 0 2px, transparent 2px 22px), radial-gradient(ellipse at 50% 120%, rgba(255, 200, 80, 0.55), transparent 60%), linear-gradient(90deg, #1a1204, #3a2608 50%, #1a1204)', ...U('matches', 250, 'Play 250 matches') });
add('banner', 'forest', 'Pine Forest', 'common', { css: 'linear-gradient(100deg, #0a1a10, #1a4a2a 55%, #3a7a4a)' });
add('banner', 'ocean', 'Deep Sea', 'common', { css: 'radial-gradient(ellipse at 80% 120%, rgba(60, 200, 255, 0.4), transparent 60%), linear-gradient(180deg, #04182a, #0a3a5a)' });
add('banner', 'stripes', 'Racing Stripes', 'common', { css: 'linear-gradient(90deg, transparent 0 62%, rgba(255, 255, 255, 0.85) 62% 66%, transparent 66% 70%, rgba(255, 255, 255, 0.85) 70% 74%, transparent 74%), linear-gradient(90deg, #101318, #1e2430)' });
add('banner', 'dots', 'Polka', 'common', { css: 'radial-gradient(circle, rgba(255, 255, 255, 0.18) 2.5px, transparent 3px) 0 0 / 14px 14px, linear-gradient(90deg, #2a1a3a, #1a2a4a)' });
add('banner', 'checker', 'Finish Line', 'rare', { css: 'repeating-conic-gradient(#f2f2f2 0 25%, #111 0 50%) 100% 0 / 16px 16px, linear-gradient(#000, #000)' });
add('banner', 'sunrise', 'Sunrise', 'rare', { css: 'radial-gradient(circle at 80% 110%, #ffe08a 0, #ff8a3a 22%, transparent 45%), linear-gradient(180deg, #1a2a5a, #c24a6a)' });
add('banner', 'toxic', 'Toxic', 'rare', { css: 'repeating-linear-gradient(-45deg, rgba(0, 0, 0, 0.35) 0 10px, transparent 10px 20px), linear-gradient(90deg, #2a3a04, #7ac01a)' });
add('banner', 'circuit', 'Circuit Board', 'epic', { css: 'linear-gradient(90deg, rgba(90, 255, 160, 0.35) 2px, transparent 2px) 0 0 / 28px 100%, linear-gradient(rgba(90, 255, 160, 0.35) 2px, transparent 2px) 0 6px / 100% 18px, radial-gradient(circle, #5affa0 2px, transparent 3px) 0 0 / 28px 18px, linear-gradient(90deg, #031a10, #063a20)' });
add('banner', 'inferno', 'Inferno', 'epic', { css: 'radial-gradient(ellipse at 30% 140%, #ffd04a 0, #ff5a1a 30%, transparent 60%), radial-gradient(ellipse at 80% 150%, #ff8a2a 0, transparent 50%), linear-gradient(180deg, #120402, #4a0a04)' });
add('banner', 'prism', 'Prism', 'legendary', { css: 'linear-gradient(100deg, rgba(255, 60, 60, 0.6), rgba(255, 200, 40, 0.6), rgba(60, 255, 120, 0.6), rgba(40, 160, 255, 0.6), rgba(200, 60, 255, 0.6)), linear-gradient(90deg, #0a0a14, #1a1a2a)' });

// Titles: text shown under your name.
add('title', 'rookie', 'Rookie', 'common', {}, true);
add('title', 'boostjunkie', 'Boost Junkie', 'common');
add('title', 'wallcrawler', 'Wall Crawler', 'common');
add('title', 'goalmachine', 'Goal Machine', 'rare');
add('title', 'flipwizard', 'Flip Wizard', 'rare');
add('title', 'nightdriver', 'Night Driver', 'rare');
add('title', 'aerialace', 'Aerial Ace', 'epic');
add('title', 'legend', 'Legend', 'legendary');
add('title', 'champion', 'Champion', '', U('wins', 50, 'Win 50 matches'));
add('title', 'goalhunter', 'Goal Hunter', '', U('goals', 250, 'Score 250 goals in matches'));
add('title', 'benchwarmer', 'Bench Warmer', 'common');
add('title', 'turtle', 'Turtle Mode', 'common');
add('title', 'kickoffking', 'Kickoff King', 'common');
add('title', 'demolisher', 'Demolisher', 'common');
add('title', 'brickwall', 'Brick Wall', 'rare');
add('title', 'airborne', 'Airborne', 'rare');
add('title', 'speeddemon', 'Speed Demon', 'rare');
add('title', 'ceilingshot', 'Ceiling Shot', 'epic');
add('title', 'mastermind', 'Mastermind', 'epic');
add('title', 'unstoppable', 'Unstoppable', 'legendary');

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
add('anthem', 'hattrick', 'Hat Trick Heroes', '', U('hattricks', 10, 'Score 10 hat tricks'));
add('anthem', 'sunny', 'Sunny Side', 'common');
add('anthem', 'garage', 'Garage Jam', 'common');
add('anthem', 'arcade', 'Arcade Hero', 'common');
add('anthem', 'bounce', 'Bounce', 'common');
add('anthem', 'tidal', 'Tidal Wave', 'rare');
add('anthem', 'stomp', 'Stadium Stomp', 'rare');
add('anthem', 'starlight', 'Starlight', 'rare');
add('anthem', 'thunder', 'Thunder Road', 'epic');
add('anthem', 'boss', 'Final Boss', 'epic');
add('anthem', 'legacy', 'Legacy', 'legendary');

export const ITEMS = list;

// Item key: "cat:id" (ids repeat across categories).
export const key = (cat, id) => `${cat}:${id}`;
const byKey = new Map(list.map((it) => [key(it.cat, it.id), it]));
export const item = (cat, id) => byKey.get(key(cat, id)) || null;
export const itemsIn = (cat) => list.filter((it) => it.cat === cat);
export const isCustomAnthem = (id) => typeof id === 'string' && /^custom:[a-z0-9]{1,24}$/.test(id);
export const DROP_ITEMS = list.filter((it) => !it.starter && !it.unlock);
export const UNLOCK_ITEMS = list.filter((it) => it.unlock);
// Bots and random picks use only items anyone can get, so achievement items stay special.
export const isExclusive = (cat, id) => !!(item(cat, id) || {}).unlock;

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
