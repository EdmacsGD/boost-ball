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

let pass = 0;
for (const r of results) {
  if (r.ok) pass++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
}
console.log(`\n${pass}/${results.length} passed`);
if (pass !== results.length) process.exitCode = 1;
