// Game modes: rules you can change for bot matches and free play (online and ranked stay normal).
// Each option is [id, label, value]. Presets set several at once.
import { setLivePhysics, BASE } from '../physics/live.js';
import { CONFIG } from '../config.js';
import { UU } from '../util/math.js';

export const MUTATORS = {
  ball: { label: 'Ball size', opts: [['normal', 'Normal', 1], ['small', 'Small', 0.7], ['big', 'Big', 1.45], ['giant', 'Giant', 2]] },
  gravity: { label: 'Gravity', opts: [['normal', 'Normal', 1], ['low', 'Low', 0.55], ['moon', 'Moon', 0.3], ['heavy', 'Heavy', 1.5]] },
  bounce: { label: 'Bounce', opts: [['normal', 'Normal', null], ['bouncy', 'Bouncy', 0.92], ['dead', 'Dead', 0.25]] },
  boost: { label: 'Boost', opts: [['normal', 'Normal'], ['unlimited', 'Unlimited'], ['off', 'Off']] },
  speed: { label: 'Game speed', opts: [['normal', 'Normal', 1], ['slow', 'Slow-mo', 0.7], ['fast', 'Fast', 1.25]] },
  clock: { label: 'Match length', opts: [['normal', '5 min', 300], ['short', '3 min', 180], ['long', '10 min', 600]] },
};

export const PRESETS = [
  { id: 'standard', name: 'Standard', blurb: 'The normal rules.', set: {} },
  { id: 'moonball', name: 'Moon Ball', blurb: 'Low gravity and a big ball. Long aerials, slow bounces.', set: { gravity: 'moon', ball: 'big' } },
  { id: 'beachball', name: 'Beach Ball', blurb: 'A giant, bouncy ball.', set: { ball: 'giant', bounce: 'bouncy' } },
  { id: 'turbo', name: 'Turbo', blurb: 'Unlimited boost and a faster game.', set: { boost: 'unlimited', speed: 'fast' } },
  { id: 'pinball', name: 'Pinball', blurb: 'A small ball that bounces off everything.', set: { ball: 'small', bounce: 'bouncy' } },
  { id: 'grounded', name: 'Grounded', blurb: 'No boost, heavy gravity. Pure ground play.', set: { boost: 'off', gravity: 'heavy' } },
];

export const DEFAULT_MUTATORS = Object.fromEntries(Object.keys(MUTATORS).map((k) => [k, 'normal']));

export function cleanMutators(m) {
  const out = { ...DEFAULT_MUTATORS };
  if (m && typeof m === 'object') for (const k of Object.keys(MUTATORS)) if (MUTATORS[k].opts.some((o) => o[0] === m[k])) out[k] = m[k];
  return out;
}

export const isStandard = (m) => Object.keys(MUTATORS).every((k) => !m || m[k] === 'normal');
const val = (k, id) => (MUTATORS[k].opts.find((o) => o[0] === id) || MUTATORS[k].opts[0])[2];

export function presetOf(m) {
  for (const p of PRESETS) if (Object.keys(MUTATORS).every((k) => (p.set[k] || 'normal') === m[k])) return p;
  return null;
}

// Short text for the HUD and match tiles, e.g. "Moon Ball" or "Giant ball, Low gravity".
export function describe(m) {
  if (isStandard(m)) return '';
  const p = presetOf(m);
  if (p) return p.name;
  return Object.keys(MUTATORS).filter((k) => m[k] !== 'normal').map((k) => `${MUTATORS[k].opts.find((o) => o[0] === m[k])[1]} ${MUTATORS[k].label.toLowerCase()}`).join(', ');
}

// Apply to a running simulation (call before kickoff). Physics: gravity, ball size and bounce.
export function applyMutators(game, m) {
  m = cleanMutators(m);
  game.mutators = m;
  setLivePhysics({ gravity: val('gravity', m.gravity), ball: val('ball', m.ball), bounce: val('bounce', m.bounce) });
  const sim = game.sim;
  sim.pw.world.gravity = { x: 0, y: CONFIG.physics.gravityZ * UU, z: 0 };
  sim.ball.setShape(CONFIG.physics.ballRadius * UU, CONFIG.physics.ballRestitution);
  game.ballModel?.setRadius(sim.ball.radius);
  sim.padsEnabled = m.boost !== 'off' && !game.skyField;
  sim.boostRule = m.boost;
  game.timeScale = val('speed', m.speed);
  game.matchLength = val('clock', m.clock);
  return m;
}

// Back to the normal rules (online matches, home screen).
export function resetMutators(game) {
  return applyMutators(game, DEFAULT_MUTATORS);
}

export { BASE };
