import { initPhysics } from '../src/physics/world.js';
import { Simulation } from '../src/physics/sim.js';
import { UU, rl } from '../src/util/math.js';
await initPhysics();
const sim = new Simulation();
sim.goalDetection = false;
const car = sim.addCar(0);
car.place(rl(0, -3000, 17), Math.PI / 2);
sim.ball.place(rl(0, 0, 91.25));
for (let i = 0; i < 60; i++) { car.controls.reset(); sim.step(); }
let hitTick = -1;
for (let i = 0; i < 480; i++) {
  car.controls.reset(); car.controls.throttle = 1;
  sim.step();
  const e = sim.events.find((ev) => ev.type === 'ballHit');
  if (e && hitTick < 0) hitTick = i;
  if (hitTick >= 0 && i <= hitTick + 6) {
    console.log(i, 'car', (car.vel.length()/UU).toFixed(0), 'carY', (car.pos.y/UU).toFixed(1), 'pitch', car.fwd.y.toFixed(3), 'ball', (sim.ball.vel.length()/UU).toFixed(0), 'ballv', sim.ball.vel.toArray().map(v=>(v/UU).toFixed(0)).join(','), e ? 'HIT ' + e.strength.toFixed(0) : '');
  }
}
