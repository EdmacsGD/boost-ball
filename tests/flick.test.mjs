// Flick checks: ball on the roof, then the inputs for a musty flick and a front flick.
// Run with: node tests/flick.test.mjs
import * as THREE from 'three';
import { initPhysics } from '../src/physics/world.js';
import { Simulation } from '../src/physics/sim.js';
import { UU, rl } from '../src/util/math.js';

await initPhysics();
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });
const sim = new Simulation();
sim.goalDetection = false;
const car = sim.addCar(0);

// Dribble setup: car driving at `speed` uu/s with the ball resting on its roof.
// Then: hold jump `jumpTicks`, hold `tilt` (pitch) for `tiltTicks`, dodge with `flip` pitch.
// Returns the ball's forward and upward speed (uu/s) 0.4 s later.
function flick({ speed = 500, jumpTicks, tilt, tiltTicks, flip }) {
  car.place(rl(0, -2000, 17), Math.PI / 2, 100);
  sim.ball.place(rl(0, 3000, 93));
  sim.pw.syncQueries();
  for (let i = 0; i < 40; i++) { car.controls.reset(); sim.step(); }
  const p = new THREE.Vector3(car.hitboxOffset.x + 0.1, car.hitboxOffset.y + car.halfExtents.y + sim.ball.radius + 0.03, 0).applyQuaternion(car.quat).add(car.pos);
  const v = car.fwd.clone().multiplyScalar(speed * UU);
  car.body.setLinvel({ x: v.x, y: v.y, z: v.z }, true);
  sim.ball.place(p, v.clone());
  car.readState();
  for (let i = 0; i < 30; i++) { car.controls.reset(); car.controls.throttle = 0.05; sim.step(); }
  const fwd0 = car.fwd.clone().setY(0).normalize();
  const c = car.controls;
  const step = (fn) => { c.reset(); fn(c); sim.step(); };
  for (let i = 0; i < jumpTicks; i++) step((k) => { k.jump = true; });
  for (let i = 0; i < tiltTicks; i++) step((k) => { k.pitch = tilt; });
  step((k) => { k.pitch = flip; k.jump = true; });
  for (let i = 0; i < 48; i++) step(() => {});
  const bv = sim.ball.vel.clone().divideScalar(UU);
  return { fwd: bv.dot(fwd0), up: bv.y };
}

// Musty: full jump, nose down for about half a second, then a backflip. The nose swings up into the
// ball from below. Checked over a range of tilt times, so it is not a one-tick trick.
{
  const tiltRange = [54, 60, 66, 72, 78];
  const speeds = tiltRange.map((t) => flick({ jumpTicks: 24, tilt: -1, tiltTicks: t, flip: 1 }).fwd);
  const baseline = flick({ jumpTicks: 24, tilt: -1, tiltTicks: 30, flip: 1 }).fwd; // flip too early: no hit
  check('musty flick launches the ball forward', Math.max(...speeds) > 1800, `best ${Math.max(...speeds).toFixed(0)} uu/s`);
  check('musty window: 0.45-0.65 s of nose down all work', Math.min(...speeds) > 1100, speeds.map((s) => s.toFixed(0)).join(', '));
  check('flipping too early misses (it takes the tilt)', baseline < 900, `${baseline.toFixed(0)} uu/s`);
}

// Front flick: jump, short nose up, then a front flip.
{
  const r = flick({ jumpTicks: 24, tilt: 1, tiltTicks: 3, flip: -1 });
  check('front flick launches the ball forward', r.fwd > 1300, `${r.fwd.toFixed(0)} uu/s forward, ${r.up.toFixed(0)} up`);
}

let pass = 0;
for (const r of results) {
  if (r.ok) pass++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
}
console.log(`\n${pass}/${results.length} passed`);
if (pass !== results.length) process.exitCode = 1;
