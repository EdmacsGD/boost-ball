// Physics checks against reference numbers from the original game (RLBot wiki, RocketSim, community measurements).
// Run with: node tests/physics.test.mjs
import * as THREE from 'three';
import { initPhysics } from '../src/physics/world.js';
import { Simulation } from '../src/physics/sim.js';
import { UU, rl } from '../src/util/math.js';

await initPhysics();

const results = [];
const check = (name, value, expect, tol, unit = '') => {
  const ok = Math.abs(value - expect) <= tol;
  results.push({ name, value: +value.toFixed(3), expect, tol, ok, unit });
};

function freshSim() {
  const sim = new Simulation();
  sim.goalDetection = false;
  return sim;
}

function settle(sim, car, seconds = 1) {
  for (let i = 0; i < seconds * 120; i++) {
    car.controls.reset();
    sim.step();
  }
}

// 1. Rest height
{
  const sim = freshSim();
  const car = sim.addCar(0);
  car.place(rl(0, -1000, 17), Math.PI / 2);
  sim.ball.place(rl(0, 4000, 92));
  settle(sim, car, 2);
  check('rest height (uu)', car.pos.y / UU, 17.01, 1.5);
  const pitchDeg = Math.asin(car.fwd.y) * 180 / Math.PI;
  check('rest pitch (deg)', pitchDeg, 0, 2);
}

// 2. Throttle acceleration
{
  const sim = freshSim();
  const car = sim.addCar(0);
  car.place(rl(0, -4000, 17), Math.PI / 2);
  sim.ball.place(rl(3000, 4000, 92));
  settle(sim, car, 1);
  let t1400 = null;
  let v1 = 0;
  for (let i = 0; i < 120 * 5; i++) {
    car.controls.reset();
    car.controls.throttle = 1;
    sim.step();
    const v = car.vel.length() / UU;
    if (i === 119) v1 = v;
    if (t1400 === null && v >= 1390) t1400 = (i + 1) / 120;
  }
  check('throttle speed at 1s (uu/s)', v1, 1555.6 * (1 - Math.exp(-1.0286)), 60);
  check('time to 1390 uu/s (s)', t1400 ?? 99, Math.log(1555.6 / (1555.6 - 1390)) / 1.0286, 0.25);
  check('max throttle speed (uu/s)', car.vel.length() / UU, 1410, 15);
}

// 3. Boost to supersonic
{
  const sim = freshSim();
  const car = sim.addCar(0);
  car.place(rl(-500, -4500, 17), Math.PI / 2); // lane with no boost pads
  sim.ball.place(rl(3000, 4000, 92));
  settle(sim, car, 1);
  car.boost = 100;
  let tSS = null;
  let used = 0;
  for (let i = 0; i < 120 * 4; i++) {
    car.controls.reset();
    car.controls.throttle = 1;
    car.controls.boost = true;
    const b0 = car.boost;
    sim.step();
    used += b0 - car.boost;
    if (tSS === null && car.isSupersonic) tSS = (i + 1) / 120;
  }
  // Analytic: accel = 991.67 + 1600(1 - 0.9v/1400) until 1400, then 991.67 + small.
  check('time to supersonic from rest (s)', tSS ?? 99, 1.63, 0.2);
  check('max speed (uu/s)', car.vel.length() / UU, 2300, 5);
  check('boost used in 3s', Math.min(used, 100), 100, 1);
}

// 4. Single jump height
function jumpTest(holdTicks, second) {
  const sim = freshSim();
  const car = sim.addCar(0);
  car.place(rl(0, -1000, 17), Math.PI / 2);
  sim.ball.place(rl(3000, 4000, 92));
  settle(sim, car, 1);
  const z0 = car.pos.y / UU;
  let maxZ = z0;
  let tMax = 0;
  for (let i = 0; i < 120 * 3; i++) {
    car.controls.reset();
    car.controls.jump = i < holdTicks || (second && i >= holdTicks + 2 && i < holdTicks + 4);
    sim.step();
    const z = car.pos.y / UU;
    if (z > maxZ) { maxZ = z; tMax = (i + 1) / 120; }
  }
  return { gain: maxZ - z0, tMax };
}
{
  const full = jumpTest(24, false);
  // RocketSim's jump model (0.62 scale on the first 3 ticks, sticky force while wheels touch) gives ~215.
  check('full single jump height gain (uu)', full.gain, 215, 12);
  const minimal = jumpTest(1, false);
  check('tap jump height gain (uu)', minimal.gain, 90, 25);
  const dbl = jumpTest(24, true);
  check('double jump height gain (uu)', dbl.gain, 470, 25);
}

// 5. Ball bounce
{
  const sim = freshSim();
  sim.ball.place(rl(0, 0, 1000));
  let phase = 0;
  let peak = 0;
  let lastVy = 0;
  for (let i = 0; i < 120 * 12; i++) {
    sim.step();
    const vy = sim.ball.vel.y;
    if (phase === 0 && lastVy < 0 && vy > 0) phase = 1;
    if (phase === 1) {
      peak = Math.max(peak, sim.ball.pos.y / UU);
      if (lastVy > 0 && vy <= 0) phase = 2;
    }
    lastVy = vy;
  }
  // Drop from 1000 (center), radius 91.25: fall 908.75; bounce height ~0.36 * 908.75 + radius (drag lowers slightly).
  check('ball first bounce apex (uu)', peak, 0.36 * 908.75 + 91.25, 30);
  check('ball rest height (uu)', sim.ball.pos.y / UU, 91.25, 3);
}

// 6. Turning radius at ~1000 uu/s (no boost, steady state)
{
  const sim = freshSim();
  const car = sim.addCar(0);
  car.place(rl(0, -2000, 17), Math.PI / 2);
  sim.ball.place(rl(3500, 4000, 92));
  settle(sim, car, 0.5);
  // Reach 1000 uu/s.
  let i = 0;
  while (car.vel.length() / UU < 1000 && i++ < 600) {
    car.controls.reset();
    car.controls.throttle = 1;
    sim.step();
  }
  // Hold speed approximately with throttle modulation, full steer; curvature = yaw rate / speed.
  let kSum = 0, vSum = 0, nS = 0;
  for (let k = 0; k < 240; k++) {
    car.controls.reset();
    const v = car.vel.length() / UU;
    car.controls.throttle = v < 1000 ? 1 : 0.02;
    car.controls.steer = 1;
    sim.step();
    if (k > 120) { kSum += Math.abs(car.angVel.y) / (car.vel.length() / UU); vSum += car.vel.length() / UU; nS++; }
  }
  const vAvg = vSum / nS;
  results.push({ name: 'turn: avg speed during test (uu/s)', value: +vAvg.toFixed(1), expect: 1000, tol: 80, ok: Math.abs(vAvg - 1000) < 80 });
  check('turn curvature at 1000 uu/s (1/10000 uu)', (kSum / nS) * 10000, 23.5, 3);
}

// 7. Forward dodge from standstill
{
  const sim = freshSim();
  const car = sim.addCar(0);
  car.place(rl(0, -2000, 17), Math.PI / 2);
  sim.ball.place(rl(3500, 4000, 92));
  settle(sim, car, 1);
  let maxH = 0;
  for (let i = 0; i < 120 * 1.5; i++) {
    car.controls.reset();
    car.controls.jump = i < 3 || (i >= 12 && i < 14);
    if (i >= 12) car.controls.pitch = -1;
    sim.step();
    if (i === 20) maxH = Math.hypot(car.vel.x, car.vel.z) / UU;
  }
  check('forward dodge horizontal speed (uu/s)', maxH, 500, 30);
}

// 8. Car-ball hit at max throttle speed
{
  const sim = freshSim();
  const car = sim.addCar(0);
  car.place(rl(0, -3000, 17), Math.PI / 2);
  sim.ball.place(rl(0, 0, 91.25));
  settle(sim, car, 0.5);
  let ballSpeed = 0;
  let carSpeedAtHit = 0;
  let hit = false;
  for (let i = 0; i < 120 * 4; i++) {
    car.controls.reset();
    car.controls.throttle = 1;
    sim.step();
    const e = sim.events.find((ev) => ev.type === 'ballHit');
    if (!hit && e) { hit = i; carSpeedAtHit = e.strength; }
    if (hit && i === hit + 3) ballSpeed = sim.ball.vel.length() / UU;
  }
  // Inelastic share (car 180, ball 30) plus the extra hit push (0.65..0.55 of the closing speed).
  const k = carSpeedAtHit < 500 ? 0.65 : 0.65 - 0.1 * (carSpeedAtHit - 500) / 1800;
  const expected = carSpeedAtHit * (180 / 210) + carSpeedAtHit * k;
  check('ball speed after head-on hit (uu/s)', ballSpeed, expected, 180);
}

// 9. Wall driving: drive into the side wall at speed and keep throttle; car should climb and stick
{
  const sim = freshSim();
  const car = sim.addCar(0);
  car.place(rl(2500, 0, 17), 0); // facing +x toward the side wall at x=4096
  sim.ball.place(rl(-3000, 4000, 92));
  settle(sim, car, 0.3);
  let maxHeight = 0;
  let wheelsOnWall = 0;
  for (let i = 0; i < 120 * 3; i++) {
    car.controls.reset();
    car.controls.throttle = 1;
    car.controls.boost = true;
    sim.step();
    maxHeight = Math.max(maxHeight, car.pos.y / UU);
    if (car.pos.y / UU > 600 && car.numWheelsInContact >= 3) wheelsOnWall++;
  }
  results.push({ name: 'wall climb max height (uu)', value: +maxHeight.toFixed(0), expect: '>1000', ok: maxHeight > 1000 });
  results.push({ name: 'ticks on wall above 600uu with wheels down', value: wheelsOnWall, expect: '>60', ok: wheelsOnWall > 60 });
}

// 10. Goal detection
{
  const sim = new Simulation();
  sim.ball.place(rl(0, 4000, 300), new THREE.Vector3(0, 0, 3000 * UU));
  let goal = -1;
  for (let i = 0; i < 240 && goal < 0; i++) {
    sim.step();
    if (sim.goalScored >= 0) goal = sim.goalScored;
  }
  results.push({ name: 'shot into orange goal scores for blue', value: goal, expect: 0, ok: goal === 0 });
}


// 12. Flip reset: wheels on the ball refresh the flip
{
  const sim = freshSim();
  const car = sim.addCar(0);
  sim.ball.place(rl(0, 0, 1200));
  // Upside down car whose wheels press on the ball from below.
  car.place(rl(0, 0, 1200 - 91.25 + 1), Math.PI / 2);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI).multiply(car.quat);
  car.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
  car.readState();
  sim.pw.syncQueries();
  car.hasJumped = true; car.hasFlipped = true; car.isOnGround = false; car.jumpTime = 1.0;
  car.controls.reset();
  sim.step();
  results.push({ name: 'flip reset on ball (wheels in contact)', value: car.numWheelsInContact, expect: '>=3', ok: car.numWheelsInContact >= 3 });
  results.push({ name: 'flip reset restores flip', value: car.hasFlipOrJump() && !car.hasFlipped, expect: true, ok: car.hasFlipOrJump() && !car.hasFlipped });
  results.push({ name: 'flip reset is flagged', value: car.gotFlipReset, expect: true, ok: car.gotFlipReset === true });
  // Leaving the ball keeps the reset available; driving off a ramp without jumping does not count.
  car.body.setTranslation({ x: 10, y: 8, z: 10 }, true);
  car.readState();
  sim.pw.syncQueries();
  sim.step();
  results.push({ name: 'flip reset available after leaving ball', value: car.hasFlipReset(), expect: true, ok: car.hasFlipReset() === true });
  const car2 = sim.addCar(1);
  car2.place(rl(2000, 0, 17), 0);
  sim.pw.syncQueries();
  for (let i = 0; i < 5; i++) sim.step();
  car2.body.setTranslation({ x: 20, y: 6, z: 0 }, true);
  car2.readState();
  sim.pw.syncQueries();
  sim.step();
  results.push({ name: 'no false flip reset when airborne without ball', value: car2.hasFlipReset(), expect: false, ok: car2.hasFlipReset() === false });
}

// 13. Demolition and bump
{
  const sim = freshSim();
  const a = sim.addCar(0);
  const b = sim.addCar(1);
  a.place(rl(0, -2000, 17), Math.PI / 2);
  b.place(rl(0, -1200, 17), 0); // side-on target
  sim.ball.place(rl(3500, 4000, 92));
  settle(sim, a, 0.2);
  a.body.setLinvel({ x: 0, y: 0, z: 2250 * UU }, true);
  a.isSupersonic = true; a.supersonicTime = 0.05;
  let demo = false;
  for (let i = 0; i < 90 && !demo; i++) {
    a.controls.reset(); a.controls.boost = true; a.boost = 100;
    b.controls.reset();
    sim.step();
    if (sim.events.some((e) => e.type === 'demo')) demo = true;
  }
  results.push({ name: 'supersonic front hit demolishes', value: demo, expect: true, ok: demo });

  const sim2 = freshSim();
  const c = sim2.addCar(0);
  const d = sim2.addCar(1);
  c.place(rl(0, -2000, 17), Math.PI / 2);
  d.place(rl(0, -1300, 17), 0);
  sim2.ball.place(rl(3500, 4000, 92));
  for (let i = 0; i < 24; i++) { c.controls.reset(); d.controls.reset(); sim2.step(); }
  c.body.setLinvel({ x: 0, y: 0, z: 1400 * UU }, true);
  let bump = null;
  for (let i = 0; i < 90 && !bump; i++) {
    c.controls.reset(); c.controls.throttle = 1;
    d.controls.reset();
    sim2.step();
    bump = sim2.events.find((e) => e.type === 'bump') || null;
  }
  for (let i = 0; i < 2; i++) sim2.step();
  results.push({ name: 'subsonic front hit bumps', value: !!bump, expect: true, ok: !!bump });
  check('bumped car speed at 1400 hit (uu/s)', d.vel.length() / UU, 1100 + 200, 350);
}

// 14. Auto-flip off the roof
{
  const sim = freshSim();
  const car = sim.addCar(0);
  car.place(rl(0, -1000, 60), Math.PI / 2);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI).multiply(car.quat);
  car.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
  sim.ball.place(rl(3500, 4000, 92));
  for (let i = 0; i < 120; i++) { car.controls.reset(); sim.step(); }
  const before = car.up.y;
  for (let i = 0; i < 180; i++) { car.controls.reset(); car.controls.jump = i < 2; sim.step(); }
  results.push({ name: 'roof up before auto-flip (up.y)', value: +before.toFixed(2), expect: '<-0.7', ok: before < -0.7 });
  results.push({ name: 'upright after auto-flip (up.y)', value: +car.up.y.toFixed(2), expect: '>0.9', ok: car.up.y > 0.9 });
}

// 15. Powerslide turns tighter
{
  const turnRate = (hb) => {
    const sim = freshSim();
    const car = sim.addCar(0);
    car.place(rl(0, -2000, 17), Math.PI / 2);
    sim.ball.place(rl(3500, 4000, 92));
    for (let i = 0; i < 30; i++) { car.controls.reset(); sim.step(); }
    car.body.setLinvel({ x: 0, y: 0, z: 1200 * UU }, true);
    let yaw = 0;
    for (let i = 0; i < 60; i++) { car.controls.reset(); car.controls.throttle = 1; car.controls.steer = 1; car.controls.handbrake = hb; sim.step(); yaw += Math.abs(car.angVel.y) / 120; }
    return yaw;
  };
  const normal = turnRate(false);
  const slide = turnRate(true);
  results.push({ name: 'yaw in 0.5s: normal vs powerslide (rad)', value: `${normal.toFixed(2)} vs ${slide.toFixed(2)}`, expect: 'slide > normal', ok: slide > normal });
}

// 14. Every hitbox class rests level near spawn height, reaches the same top speed and jumps the same.
{
  const { CONFIG } = await import('../src/config.js');
  for (const key of Object.keys(CONFIG.hitboxes)) {
    const sim = freshSim();
    const car = sim.addCar(0, key);
    car.place(rl(0, -3000, 17), Math.PI / 2);
    sim.ball.place(rl(3000, 4000, 92));
    sim.pw.syncQueries();
    settle(sim, car, 2);
    const rest = car.pos.y / UU;
    const pitch = Math.asin(car.fwd.y) * 180 / Math.PI;
    const okRest = rest > 10 && rest < 24 && Math.abs(pitch) < 3 && car.numWheelsInContact === 4;
    results.push({ name: `${key}: rest height (uu) / pitch (deg)`, value: `${rest.toFixed(1)} / ${pitch.toFixed(2)}`, expect: '10..24, |pitch|<3, 4 wheels', ok: okRest });
    for (let i = 0; i < 360; i++) { car.controls.reset(); car.controls.throttle = 1; sim.step(); }
    const v = car.vel.length() / UU;
    results.push({ name: `${key}: throttle speed after 3 s (uu/s)`, value: +v.toFixed(0), expect: '1380..1420', ok: v > 1380 && v < 1420 });
    const sim2 = freshSim();
    const c2 = sim2.addCar(0, key);
    c2.place(rl(0, -3000, 17), Math.PI / 2);
    settle(sim2, c2, 1);
    const z0 = c2.pos.y;
    let maxZ = z0;
    for (let i = 0; i < 150; i++) { c2.controls.reset(); c2.controls.jump = i < 30; sim2.step(); maxZ = Math.max(maxZ, c2.pos.y); }
    const gain = (maxZ - z0) / UU;
    results.push({ name: `${key}: full jump height (uu)`, value: +gain.toFixed(0), expect: '195..235', ok: gain > 195 && gain < 235 });
  }
}

// 11. Performance
{
  const sim = freshSim();
  for (let t = 0; t < 6; t++) {
    const car = sim.addCar(t % 2);
    car.place(rl(-2000 + t * 800, (t % 2 ? 1 : -1) * 2000, 17), t % 2 ? -Math.PI / 2 : Math.PI / 2);
  }
  const t0 = performance.now();
  for (let i = 0; i < 1200; i++) {
    for (const car of sim.cars) { car.controls.reset(); car.controls.throttle = 1; car.controls.steer = Math.sin(i / 50); }
    sim.step();
  }
  const ms = (performance.now() - t0) / 1200;
  results.push({ name: 'ms per tick (6 cars)', value: +ms.toFixed(3), expect: '<1.5', ok: ms < 1.5 });
}

let pass = 0;
for (const r of results) {
  if (r.ok) pass++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}: ${r.value} (expect ${r.expect}${r.tol !== undefined ? ' +-' + r.tol : ''})`);
}
console.log(`\n${pass}/${results.length} passed`);
