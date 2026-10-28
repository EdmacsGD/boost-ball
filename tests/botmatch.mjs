// Bot-vs-bot matches without rendering, to tune the AI. Usage: node tests/botmatch.mjs [mode] [diffBlue] [diffOrange] [minutes]
import { initPhysics } from '../src/physics/world.js';
import { Simulation } from '../src/physics/sim.js';
import { Bot } from '../src/game/bot.js';
import { teamRole } from '../src/game/roles.js';
import { UU } from '../src/util/math.js';

await initPhysics();
const mode = process.argv[2] || '1v1';
const dB = process.argv[3] || 'medium';
const dO = process.argv[4] || 'medium';
const minutes = Number(process.argv[5] || 2);
const per = mode === '3v3' ? 3 : mode === '2v2' ? 2 : 1;
import { CONFIG } from '../src/config.js';
if (process.env.OVR_BLUE) CONFIG.bots.custom_b = { ...CONFIG.bots[dB], ...JSON.parse(process.env.OVR_BLUE) };
const sim = new Simulation();
const game = { sim, roleFor: (bot) => teamRole(sim.cars, bot.car, sim.ball.pos) };
const bots = [];
// MIXED=1 gives every bot a different hitbox, like a real match.
const hbKeys = Object.keys(CONFIG.hitboxes);
let n = 0;
for (let t = 0; t < 2; t++) for (let i = 0; i < per; i++) {
  const car = sim.addCar(t, process.env.MIXED ? hbKeys[(n++) % hbKeys.length] : 'standard');
  bots.push(new Bot(car, game, t === 0 ? (process.env.OVR_BLUE ? 'custom_b' : dB) : dO));
}
const stats = { goals: [0, 0], touches: new Map(), stuck: new Map(), wall: new Map(), air: new Map(), states: new Map(), demos: 0, kickoffTimes: [], maxBall: 0 };
let kickoffTouched = false;
let kickoffStart = 0;
const TICK = 1 / 120;
const total = minutes * 60 * 120;
sim.setupKickoff();
let stuckTimer = new Map();
let wait = 0;
for (let tick = 0; tick < total; tick++) {
  if (wait > 0) {
    wait--;
    if (wait === 0) { sim.ball.body.setEnabled(true); sim.setupKickoff(); kickoffTouched = false; kickoffStart = tick; }
    continue;
  }
  for (const b of bots) b.think(TICK, !kickoffTouched);
  sim.step();
  for (const e of sim.events) {
    if (e.type === 'ballHit') {
      for (const b of bots) if (b.car.id === e.carId) b.onTouch();
      stats.touches.set(e.carId, (stats.touches.get(e.carId) || 0) + 1);
      if (!kickoffTouched) { kickoffTouched = true; stats.kickoffTimes.push((tick - kickoffStart) / 120); }
    }
    if (e.type === 'demo') stats.demos++;
  }
  stats.maxBall = Math.max(stats.maxBall, sim.ball.vel.length() / UU);
  for (const b of bots) {
    const c = b.car;
    stats.states.set(b.state, (stats.states.get(b.state) || 0) + 1);
    if (c.isDemoed) continue;
    if (c.vel.length() < 1) stuckTimer.set(c.id, (stuckTimer.get(c.id) || 0) + 1); else stuckTimer.set(c.id, 0);
    if ((stuckTimer.get(c.id) || 0) === 240) stats.stuck.set(c.id, (stats.stuck.get(c.id) || 0) + 1);
    if (c.isOnGround && c.up.y < 0.5) stats.wall.set(c.id, (stats.wall.get(c.id) || 0) + 1);
    if (!c.isOnGround) {
      stats.air.set(c.id, (stats.air.get(c.id) || 0) + 1);
      c._airRun = (c._airRun || 0) + 1;
      if (c._airRun === 600) console.log(`  long air: car ${c.id} t=${(tick/120).toFixed(0)}s pos=${c.pos.toArray().map(v=>v.toFixed(1))} up=${c.up.toArray().map(v=>v.toFixed(2))} wheels=${c.numWheelsInContact} v=${c.vel.length().toFixed(1)} state=${b.state} dodge=${!!b.dodge} aerial=${!!b.aerial} world=${c.worldContact.hasContact}`);
    } else c._airRun = 0;
  }
  if (sim.goalScored >= 0) {
    stats.goals[sim.goalScored]++;
    const lt = sim.lastTouch;
    stats.goalLog = stats.goalLog || [];
    stats.goalLog.push(`${sim.goalScored === 0 ? 'B' : 'O'}${lt ? (lt.team === sim.goalScored ? '' : '(own by ' + lt.carId + ')') : '(no touch)'}@${(tick / 120).toFixed(0)}s`);
    sim.ball.body.setEnabled(false);
    wait = 120;
  }
}
const fmt = (m) => [...m.entries()].map(([k, v]) => `${k}:${typeof v === 'number' && v > 1000 ? (v / 120).toFixed(0) + 's' : v}`).join(' ');
console.log(`${mode} blue(${dB}) vs orange(${dO}) over ${minutes} min`);
console.log('goals', stats.goals.join(' - '), '| demos', stats.demos, '| max ball speed', stats.maxBall.toFixed(0));
console.log('touches', fmt(stats.touches), '| goals:', (stats.goalLog || []).join(' '));
console.log('stuck events (4s still)', fmt(stats.stuck));
console.log('wall ticks', fmt(stats.wall), '| air ticks', fmt(stats.air));
console.log('kickoff first-touch times', stats.kickoffTimes.map((t) => t.toFixed(2)).join(' '));
console.log('states', [...stats.states.entries()].map(([k, v]) => `${k}:${(v / 120 / bots.length).toFixed(0)}s`).join(' '));
