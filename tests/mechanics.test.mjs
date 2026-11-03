// Mechanics players use in the original game: they must work here too.
// Run with: node tests/mechanics.test.mjs
import { initPhysics } from '../src/physics/world.js';
import { Simulation } from '../src/physics/sim.js';
import { UU, rl } from '../src/util/math.js';

await initPhysics();
const results = [];
const check = (name, value, ok, note = '') => results.push({ name, value, ok, note });
function fresh() { const s = new Simulation(); s.goalDetection = false; return s; }
function run(sim, car, n, fn) { for (let i = 0; i < n; i++) { car.controls.reset(); fn && fn(i); sim.step(); } }
const speed = (car) => car.vel.length() / UU;
const hspeed = (car) => Math.hypot(car.vel.x, car.vel.z) / UU;

// 1. Wavedash: a short hop, nose up a little, dodge forward just before the wheels touch.
{
  const sim = fresh(); const car = sim.addCar(0);
  car.place(rl(0, -4000, 17), Math.PI / 2); sim.ball.place(rl(3000, 4000, 92));
  run(sim, car, 60);
  run(sim, car, 120, () => { car.controls.throttle = 1; });
  // Coast to a steady ~1000 uu/s.
  let guard = 0; while (speed(car) > 1000 && guard++ < 600) run(sim, car, 1);
  const before = hspeed(car);
  let dodged = false, t = 0;
  for (let i = 0; i < 240; i++) {
    car.controls.reset();
    car.controls.throttle = 1;
    if (i < 3) car.controls.jump = true;
    if (i >= 3 && i < 20) car.controls.pitch = 1; // nose up slightly
    const h = car.pos.y / UU;
    if (!dodged && i > 20 && car.vel.y < 0 && h < 30) { car.controls.jump = true; car.controls.pitch = -1; dodged = true; t = i; }
    sim.step();
  }
  const after = hspeed(car);
  check('wavedash speed gain (uu/s)', Math.round(after - before), dodged && after - before > 250, `before ${before.toFixed(0)}, after ${after.toFixed(0)}`);
}

// 2. Dribble: ball on the roof, throttle kept under it (like a player does): it stays up there.
{
  const sim = fresh(); const car = sim.addCar(0);
  car.place(rl(0, -3000, 17), Math.PI / 2);
  run(sim, car, 60);
  sim.ball.place(rl(car.pos.x / UU, car.pos.z / UU, 187));
  let onRoof = 0;
  run(sim, car, 480, () => {
    const d = sim.ball.pos.clone().sub(car.pos);
    const along = d.dot(car.fwd) / UU;
    car.controls.throttle = Math.max(-1, Math.min(1, 0.2 + along * 0.02 + (sim.ball.vel.dot(car.fwd) - car.vel.dot(car.fwd)) / UU * 0.01));
    if (sim.ball.pos.y / UU > 120 && Math.abs(along) < 60) onRoof++;
  });
  check('dribble: ticks the ball stays on the roof (of 480)', onRoof, onRoof > 400);
}

// 3. Half-flip: back dodge, cancel with forward, air roll over: facing the other way, speed kept.
{
  const sim = fresh(); const car = sim.addCar(0);
  car.place(rl(0, 0, 17), Math.PI / 2); sim.ball.place(rl(3000, 4000, 92));
  run(sim, car, 60);
  run(sim, car, 70, () => { car.controls.throttle = -1; });
  const fwd0 = car.fwd.clone();
  run(sim, car, 160, (i) => {
    const c = car.controls; c.throttle = 1;
    if (i < 3) c.jump = true;
    if (i >= 8 && i < 11) { c.jump = true; c.pitch = 1; }
    else if (i >= 11 && i < 22) c.pitch = 1;
    else if (i >= 22 && i < 90) { c.pitch = -1; c.roll = 1; }
  });
  const facing = car.fwd.dot(fwd0);
  const v = -car.vel.dot(fwd0) / UU;
  check('half-flip: facing after (dot with start, want < -0.9)', +facing.toFixed(2), facing < -0.9 && car.numWheelsInContact >= 3);
  check('half-flip: speed kept (uu/s, want > 900)', Math.round(v), v > 900);
}

// 4. Ceiling: arena height like the original (2044 uu).
{
  const sim = fresh(); const car = sim.addCar(0);
  car.place(rl(0, 0, 17), Math.PI / 2); sim.ball.place(rl(0, 0, 1500));
  let top = 0;
  run(sim, car, 600, () => { top = Math.max(top, sim.ball.pos.y / UU); });
  sim.ball.place(rl(0, 0, 1900)); sim.ball.body.setLinvel({ x: 0, y: 3000 * UU, z: 0 }, true);
  top = 0; run(sim, car, 120, () => { top = Math.max(top, sim.ball.pos.y / UU); });
  check('ceiling: highest ball center (uu, want 2044 - 91 +-15)', Math.round(top), Math.abs(top - (2044 - 91.25)) < 15);
}

let failed = 0;
for (const r of results) { console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}: ${r.value}${r.note ? '  (' + r.note + ')' : ''}`); if (!r.ok) failed++; }
console.log(failed ? `${failed} mechanics checks failed` : 'all mechanics checks passed');
process.exitCode = failed ? 1 : 0;
