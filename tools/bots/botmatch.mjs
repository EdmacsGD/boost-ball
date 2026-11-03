// Bot-vs-bot matches without rendering, to tune the AI. Usage: node tests/botmatch.mjs [mode] [diffBlue] [diffOrange] [minutes]
import { initPhysics } from '../../src/physics/world.js';
import { Simulation } from '../../src/physics/sim.js';
import { Bot } from '../../src/game/bot.js';
import { teamRole } from '../../src/game/roles.js';
import { UU } from '../../src/util/math.js';

await initPhysics();
const mode = process.argv[2] || '1v1';
const dB = process.argv[3] || 'medium';
const dO = process.argv[4] || 'medium';
const minutes = Number(process.argv[5] || 2);
const per = mode === '3v3' ? 3 : mode === '2v2' ? 2 : 1;
import { CONFIG } from '../../src/config.js';
if (process.env.OVR_BLUE) CONFIG.bots.custom_b = { ...CONFIG.bots[dB], ...JSON.parse(process.env.OVR_BLUE) };
const sim = new Simulation();
// Same role picking as the game (with each car's bot, so rotation works). HUMAN=1: blue car 0
// counts as a person (its teammates treat it like one), to measure how bots play next to you.
const botOfCar = (c) => { const b = bots.find((x) => x.car === c); return b && !(process.env.HUMAN && b.car === bots[0].car) ? b : null; };
const game = { sim, roleFor: (bot) => teamRole(sim.cars, bot.car, sim.ball.pos, botOfCar, sim.tick / 120) };
const bots = [];
// MIXED=1 gives every bot a different hitbox, like a real match.
const hbKeys = Object.keys(CONFIG.hitboxes);
let n = 0;
for (let t = 0; t < 2; t++) for (let i = 0; i < per; i++) {
  const car = sim.addCar(t, process.env.MIXED ? hbKeys[(n++) % hbKeys.length] : 'standard');
  bots.push(new Bot(car, game, t === 0 ? (process.env.OVR_BLUE ? 'custom_b' : dB) : dO));
}
const COMMIT = new Set(['attack', 'clear', 'save', 'aerial']);
const team = { double: [0, 0], emptyNet: [0, 0], humanCrowd: 0, own: [0, 0] };
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
  // Teamwork: two teammates both going for the ball close to it; nobody home while the ball is
  // in our third; (HUMAN) a bot teammate crowding the 'person' while they go for it.
  for (let t = 0; t < 2; t++) {
    const mine = bots.filter((b) => b.car.team === t && !b.car.isDemoed);
    const near = mine.filter((b) => COMMIT.has(b.state) && b.car.pos.distanceTo(sim.ball.pos) < 15);
    if (near.length >= 2) team.double[t]++;
    const dir = t === 0 ? 1 : -1, gz = -dir * 51.2;
    if (Math.abs(sim.ball.pos.z - gz) < 34 && !mine.some((b) => Math.abs(b.car.pos.z - gz) < 20 && Math.abs(b.car.pos.x) < 15)) {
      team.emptyNet[t]++;
      if (process.env.DIAG) { const k = mine.map((b) => b.role + ':' + b.state).sort().join(','); team.enWhy = team.enWhy || new Map(); team.enWhy.set(k, (team.enWhy.get(k) || 0) + 1); }
    }
  }
  if (process.env.HUMAN) {
    const h = bots[0];
    if (COMMIT.has(h.state) && h.car.pos.distanceTo(sim.ball.pos) < 15) {
      for (const b of bots) if (b !== h && b.car.team === 0 && COMMIT.has(b.state) && b.car.pos.distanceTo(sim.ball.pos) < 15) team.humanCrowd++;
    }
  }
  stats.maxBall = Math.max(stats.maxBall, sim.ball.vel.length() / UU);
  for (const b of bots) {
    const c = b.car;
    stats.states.set(b.state, (stats.states.get(b.state) || 0) + 1);
    if (c.isDemoed) continue;
    if (c.vel.length() < 1) stuckTimer.set(c.id, (stuckTimer.get(c.id) || 0) + 1); else stuckTimer.set(c.id, 0);
    if ((stuckTimer.get(c.id) || 0) === 240) {
      stats.stuck.set(c.id, (stats.stuck.get(c.id) || 0) + 1);
      if (process.env.DIAG) console.log(`  stuck: car ${c.id} t=${(tick / 120).toFixed(0)}s pos=${c.pos.toArray().map((v) => v.toFixed(1))} up.y=${c.up.y.toFixed(2)} wheels=${c.numWheelsInContact} state=${b.state} role=${b.role} target=${b.target.toArray().map((v) => v.toFixed(1))} ball=${sim.ball.pos.toArray().map((v) => v.toFixed(1))}`);
    }
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
    if (lt && lt.team !== sim.goalScored) team.own[lt.team]++;
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
const sec = (n) => (n / 120).toFixed(0) + 's';
console.log(`teamwork: double commits ${team.double.map(sec).join(' / ')} | empty net with ball in own third ${team.emptyNet.map(sec).join(' / ')} | own goals ${team.own.join(' / ')}${process.env.HUMAN ? ' | crowding the person ' + sec(team.humanCrowd) : ''}`);
if (team.enWhy) console.log('empty net by states:', [...team.enWhy.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${sec(v)}`).join(' | '));
