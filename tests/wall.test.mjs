// Ball on the walls: a ball rolling into the side wall rides up it and stays on it (no hopping off
// the curved ramp). Run with: node tests/wall.test.mjs
import { initPhysics } from '../src/physics/world.js';
import { Simulation } from '../src/physics/sim.js';
import { CONFIG } from '../src/config.js';
import { UU, rl } from '../src/util/math.js';

await initPhysics();
const A = CONFIG.arena;
const R = CONFIG.physics.ballRadius;
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });
const sim = new Simulation();
sim.goalDetection = false;

function touchingShell() {
  let t = false;
  sim.pw.world.contactPair(sim.ball.collider, sim.pw.arenaCollider, (m) => {
    if (m.numContacts() > 0 && m.contactDist(0) < 2 * UU) t = true;
  });
  return t;
}

// Roll at the +x side wall; measure from the moment the ball reaches the wall until it is back
// below 200 uu: how much of that time it touches the wall, and how far it drifts off it.
for (const [vx, vy] of [[1800, 0], [2400, 0], [1500, 1500], [2000, 800]]) {
  sim.ball.place(rl(2000, -1000, R + 0.5), rl(vx, vy, 0));
  let onWall = 0, upTicks = 0, maxGap = 0, maxZ = 0, started = false;
  for (let i = 0; i < 480; i++) {
    sim.step();
    const x = sim.ball.pos.x / UU;
    const z = sim.ball.pos.y / UU;
    if (z > 300) started = true;
    if (!started) continue;
    if (z < 200) break;
    upTicks++;
    if (touchingShell()) onWall++;
    maxGap = Math.max(maxGap, A.extentX - R - x);
    maxZ = Math.max(maxZ, z);
  }
  const share = onWall / Math.max(1, upTicks);
  check(`roll at the wall (${vx}, ${vy}) uu/s: stays on the wall`, share > 0.9 && maxGap < 25, `on the wall ${(share * 100).toFixed(0)}% of ${(upTicks / 120).toFixed(2)} s, max gap ${maxGap.toFixed(0)} uu, up to ${maxZ.toFixed(0)} uu`);
}

// Car through the floor-to-wall curve with boost: it should lose about what gravity takes (climbing
// ~2.4 m costs ~0.8 m/s at 20 m/s), not brake in the bend.
{
  const THREE = await import('three');
  const s2 = new Simulation();
  s2.goalDetection = false;
  const car = s2.addCar(0, 'standard');
  s2.setupKickoff();
  car.place(new THREE.Vector3(25, 0.2, 0), 0, 100);
  car.body.setLinvel({ x: 12, y: 0, z: 0 }, true);
  car.readState();
  let before = 0;
  let minV = 99;
  for (let i = 0; i < 200; i++) {
    car.controls.reset();
    car.controls.throttle = 1;
    car.controls.boost = true;
    s2.step();
    if (car.pos.x < 38.5 && car.pos.y < 0.3) before = car.vel.length();
    if (car.pos.x >= 38.5 && car.pos.y < 3) minV = Math.min(minV, car.vel.length());
  }
  check('car boosting up the wall keeps its speed in the curve', before - minV < 1.3, `${before.toFixed(1)} -> lowest ${minV.toFixed(1)} m/s`);
}

// Without boost at top speed, and rolling back down: the bend itself takes almost nothing beyond
// gravity (before the fix it took about 65 J/kg going up, about 3 m/s, and 15 J/kg coming down).
{
  const THREE = await import('three');
  const g = Math.abs(CONFIG.physics.gravityZ) * UU;
  const WX = CONFIG.arena.extentX * UU;
  const run = (setup, control, stop) => {
    const s3 = new Simulation();
    s3.goalDetection = false;
    const car = s3.addCar(0, 'standard');
    s3.setupKickoff();
    setup(car, THREE);
    let pv = null;
    let ph = null;
    let loss = 0;
    const st = { phase: 'up', maxH: 0 };
    for (let i = 0; i < 900; i++) {
      car.controls.reset();
      control(car, st);
      s3.step();
      const v = car.vel.length();
      const h = car.pos.y;
      st.maxH = Math.max(st.maxH, h);
      if (pv !== null && car.numWheelsInContact >= 3 && h > 0.21 && h < 2.6 && st.phase !== 'skip') loss += -(0.5 * (v * v - pv * pv) + g * (h - ph));
      pv = v;
      ph = h;
      if (stop(car, st)) break;
    }
    return loss;
  };
  const up = run((car, T) => { car.place(new T.Vector3(WX - 12, 0.2, -6), 0, 100); car.body.setLinvel({ x: 22, y: 0, z: 0 }, true); car.readState(); },
    (car) => { car.controls.throttle = 1; }, (car) => car.pos.y > 4);
  check('no boost at 22 m/s: the bend takes almost no speed beyond gravity', up < 10, `${up.toFixed(1)} J/kg`);
  const down = run((car, T) => { car.place(new T.Vector3(WX - 12, 0.2, 0), 0, 100); car.body.setLinvel({ x: 16, y: 0, z: 0 }, true); car.readState(); },
    (car, st) => {
      car.controls.throttle = st.phase === 'up' && car.pos.y < 5 ? 1 : 0;
      if (st.phase === 'up' && car.pos.y > 1 && car.vel.y < -0.05) st.phase = 'down';
    },
    (car, st) => st.phase === 'down' && car.pos.y < 0.22);
  check('rolling back down the wall: the bend takes almost nothing', down < 5, `${down.toFixed(1)} J/kg (going up and down)`);
}

// The car must really move as fast as its speed says, all the way through the bend. (The velocity
// alone hid a stall: the position crawled at 5% of the speed while the velocity stayed at the top.)
{
  let worst = 1, lostMax = 0, where = '';
  for (const hb of Object.keys(CONFIG.hitboxes)) for (const ang of [0, 30]) for (const boost of [false, true]) {
    const sim = new Simulation(); sim.goalDetection = false; const car = sim.addCar(0, hb);
    car.place(rl(4096 - 3400, -1000, 17), ang * Math.PI / 180); sim.ball.place(rl(-3000, 4000, 92));
    for (let i = 0; i < 60; i++) { car.controls.reset(); sim.step(); }
    const prev = car.pos.clone(); let lost = 0;
    for (let i = 0; i < 480; i++) {
      car.controls.reset(); car.controls.throttle = 1; car.controls.boost = boost; if (boost) car.boost = 100;
      prev.copy(car.pos); sim.step();
      const v = car.vel.length(), moved = car.pos.distanceTo(prev) * 120;
      if (4096 - car.pos.x / UU < 350 && car.pos.y / UU < 600 && v > 3) {
        if (moved / v < worst) { worst = moved / v; where = `${hb}, ${ang} deg, ${boost ? 'boost' : 'no boost'}`; }
        lost += Math.max(0, v - moved) / 120 / UU;
      }
    }
    lostMax = Math.max(lostMax, lost);
  }
  check('through the bend the car really moves as fast as its speed (all hitboxes)', worst > 0.6 && lostMax < 90, `slowest tick ${(worst * 100).toFixed(0)}% of the shown speed (${where}), most distance lost ${lostMax.toFixed(0)} uu`);
}

let pass = 0;
for (const r of results) {
  if (r.ok) pass++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
}
console.log(`\n${pass}/${results.length} passed`);
if (pass !== results.length) process.exitCode = 1;
