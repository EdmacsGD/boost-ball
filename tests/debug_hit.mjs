import * as THREE from 'three';
import { initPhysics } from '../src/physics/world.js';
import { Simulation } from '../src/physics/sim.js';
import { UU, rl } from '../src/util/math.js';
await initPhysics();
const iters = Number(process.argv[2] || 8);
const sim = new Simulation();
sim.pw.world.numSolverIterations = iters;
sim.goalDetection = false;
const car = sim.addCar(0);
car.place(rl(0, -400, 17), Math.PI / 2);
sim.ball.place(rl(0, 0, 91.25));
for (let i = 0; i < 30; i++) { car.controls.reset(); sim.step(); }
// Give the car a fixed velocity toward the ball.
const speed = 1400 * UU;
car.body.setLinvel({ x: 0, y: 0, z: speed }, true);
for (let i = 0; i < 40; i++) {
  car.controls.reset();
  car.controls.throttle = 0;
  const pre = sim.ball.vel.clone();
  // replicate step but log the post-solver velocity
  sim.step();
  const hit = sim.events.find(e => e.type === 'ballHit');
  const post = sim.ball.vel.clone();
  if (hit || post.length() > 0.01) {
    console.log(i, 'ball v (uu/s)', (post.length()/UU).toFixed(0), 'car v', (car.vel.length()/UU).toFixed(0), hit ? 'HIT strength ' + hit.strength.toFixed(0) : '', 'cache', (sim.ball.velImpulseCache.length()/UU).toFixed(0));
  }
}
