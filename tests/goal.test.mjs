// Rounded goal checks: shots into every part of the goal score and the ball never leaves the goal
// box; balls rolling into the rounded edges ride up them; the mouth has no lip.
// Run with: node tests/goal.test.mjs
import * as THREE from 'three';
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
// RL units (x across, y toward orange goal, z up) for the ball.
const ballUU = () => ({ x: sim.ball.pos.x / UU, y: sim.ball.pos.z / UU, z: sim.ball.pos.y / UU });

function shoot(from, vel, seconds, detect = false) {
  sim.goalDetection = detect;
  sim.goalScored = -1;
  sim.ball.place(rl(...from), rl(...vel));
  let scored = false;
  let max = { x: 0, y: 0, z: 0 }; // over the frames the ball is inside the goal
  let min = { z: Infinity };
  for (let i = 0; i < seconds * 120; i++) {
    sim.step();
    if (sim.goalScored >= 0) scored = true;
    const b = ballUU();
    if (b.y < A.extentY + R) continue; // only while the ball is in the goal
    max = { x: Math.max(max.x, Math.abs(b.x)), y: Math.max(max.y, b.y), z: Math.max(max.z, b.z) };
    min.z = Math.min(min.z, b.z);
  }
  return { scored, max, min, end: ballUU() };
}

// 1. Shots at every corner, edge and the middle of the back: all score and stay inside.
const gw = A.goalHalfWidth;
const gh = A.goalHeight;
const Y1 = A.extentY + A.goalDepth;
const targets = [
  ['bottom left corner', -gw, 0], ['bottom right corner', gw, 0], ['top left corner', -gw, gh], ['top right corner', gw, gh],
  ['middle', 0, gh / 2], ['left side', -gw, gh / 2], ['roof', 0, gh], ['floor', 0, 0],
];
for (const [name, tx, tz] of targets) {
  const from = [tx * 0.4, 3600, 300];
  const to = [tx, Y1, tz];
  const d = to.map((v, i) => v - from[i]);
  const len = Math.hypot(...d);
  const speed = 3000; // uu/s, a hard shot
  const vel = d.map((v) => (v / len) * speed);
  vel[2] += 120; // a little lift against gravity over the distance
  const r = shoot(from, vel, 1.5, true);
  check(`shot ${name}: scores`, r.scored);
  const box = shoot(from, vel, 3, false);
  const inside = box.max.y <= Y1 - R + 6 && box.max.x <= gw - R + 6 && box.max.z <= gh - R + 6 && box.min.z >= R - 6;
  check(`shot ${name}: ball stays in the goal box`, inside, `max |x| ${box.max.x.toFixed(0)}, max y ${box.max.y.toFixed(0)}, z ${box.min.z.toFixed(0)}..${box.max.z.toFixed(0)}`);
}

// 2. Rolling sideways into the bottom edge: the ball rides up the curve (a flat corner would stop it at z = R).
{
  const r = shoot([0, 5700, R + 1], [1800, 0, 0], 1.2, false);
  check('rolling into the bottom edge rides up the curve', r.max.z > R + 40, `max z ${r.max.z.toFixed(0)} (rest ${R})`);
}

// 3. Rolling straight in along a post: no lip at the mouth. Compared with the same roll down the
// middle, the ball keeps its speed past the line.
{
  const speedPast = (x) => {
    sim.goalDetection = false;
    sim.ball.place(rl(x, 4400, R + 0.5), rl(0, 1400, 0));
    for (let i = 0; i < 240; i++) {
      sim.step();
      if (ballUU().y > A.extentY + 150) return sim.ball.vel.length() / UU;
    }
    return 0;
  };
  const mid = speedPast(0);
  const post = speedPast(gw - R - 5);
  check('rolling in along the post: no lip at the mouth', post > mid - 40, `${post.toFixed(0)} uu/s along the post, ${mid.toFixed(0)} down the middle`);
}

// 4. A ball rolled gently at the back corner from inside comes back out along the curve.
{
  const r = shoot([gw - 400, 5600, R + 1], [600, 600, 0], 2, false);
  check('back corner: ball stays in and rolls back out', r.max.y <= Y1 - R + 6 && r.end.y < Y1 - R - 5, `end y ${r.end.y.toFixed(0)}`);
}

let pass = 0;
for (const r of results) {
  if (r.ok) pass++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
}
console.log(`\n${pass}/${results.length} passed`);
if (pass !== results.length) process.exitCode = 1;
