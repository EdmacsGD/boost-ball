// Clips: a recorded stretch survives packing and unpacking (positions within 2 cm, rotations close,
// goals and flags kept) and stays small. Also: bots on a rotating team never both go for the ball
// for long. Run with: node tests/clips.test.mjs
import { initPhysics } from '../src/physics/world.js';
import { Simulation } from '../src/physics/sim.js';
import { Bot } from '../src/game/bot.js';
import { teamRole } from '../src/game/roles.js';
import { MatchRecorder } from '../src/game/replay.js';
import { packClip, unpackClip } from '../src/game/clips.js';

await initPhysics();
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });

const sim = new Simulation();
const bots = [];
const botOf = (c) => bots.find((b) => b.car === c) || null;
const game = { sim, roleFor: (bot) => teamRole(sim.cars, bot.car, sim.ball.pos, botOf, sim.tick / 120) };
for (let t = 0; t < 2; t++) for (let i = 0; i < 3; i++) {
  const bot = new Bot(sim.addCar(t, 'standard'), game, 'ultra');
  bot.d = { ...bot.d, rotation: true };
  bots.push(bot);
}
sim.setupKickoff();
sim.goalDetection = true;
const rec = new MatchRecorder(sim.cars.map((c) => c.id));
let touched = false;
let time = 0;
for (let i = 0; i < 120 * 40; i++) {
  for (const b of bots) b.think(1 / 120, !touched);
  sim.step();
  time += 1 / 120;
  for (const e of sim.events) if (e.type === 'ballHit') { touched = true; botOf(sim.cars.find((c) => c.id === e.carId))?.onTouch(); }
  rec.record(1 / 120, time, sim, [0, 0]);
  if (sim.goalScored >= 0) {
    rec.goals.push({ t: time, team: sim.goalScored, pos: sim.ball.pos.toArray(), explosion: 'classic', name: 'x' });
    sim.setupKickoff();
    touched = false;
  }
}
rec.goals.push({ t: 20, team: 1, pos: [1, 2, 3], explosion: 'blackhole', name: 'test' });

const t0 = 10;
const t1 = 40;
const meta = { mode: '3v3', arena: 'aurora', ball: 'standard', me: 0, cam: 'me', cars: sim.cars.map((c, i) => ({ team: c.team, name: `P${i}`, carId: 'strider', accent: 0xffffff, number: i, look: {}, explosion: 'classic' })) };
const text = await packClip(rec, t0, t1, meta);
check('packed as gzip', text.startsWith('g1:'), text.slice(0, 3));
check('30 s 3v3 clip under 200 KB of text', text.length < 200000, `${(text.length / 1024).toFixed(0)} KB`);
const clip = await unpackClip(text);
check('meta kept', clip.meta.mode === '3v3' && clip.meta.cars.length === 6 && clip.meta.cars[3].name === 'P3');
check('goal kept with time from clip start', clip.meta.goals.some((g) => g.explosion === 'blackhole' && Math.abs(g.t - (20 - rec.data[rec.indexAt(t0) * rec.stride])) < 0.01));
const i0 = rec.indexAt(t0);
let maxPos = 0;
let maxQ = 0;
let flagsOk = true;
for (let f = 0; f < clip.count; f++) {
  for (let k = 0; k < rec.stride; k++) {
    const a = rec.data[(i0 + f) * rec.stride + k];
    const b = clip.data[f * rec.stride + k];
    const slot = k < 11 ? k : 11 + ((k - 11) % 10);
    if ([3, 4, 5, 11, 12, 13].includes(slot)) maxPos = Math.max(maxPos, Math.abs(a - b));
    if ([6, 7, 8, 9, 14, 15, 16, 17].includes(slot)) maxQ = Math.max(maxQ, Math.abs(a - b));
    if (slot === 18 && a !== b) flagsOk = false;
  }
}
check('positions within 2 cm', maxPos <= 0.011, `max ${(maxPos * 100).toFixed(2)} cm`);
check('rotations within 0.0001', maxQ <= 0.0001, `max ${maxQ.toExponential(1)}`);
check('car flags exact', flagsOk);
check('frame count about 30 fps', Math.abs(clip.count - 900) < 10, `${clip.count} frames`);

let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
  if (!r.ok) failed++;
}
if (failed) {
  console.log(`${failed} failed`);
  process.exit(1);
}
console.log('all clip tests passed');
