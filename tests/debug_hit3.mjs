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
for (let i = 0; i < 336; i++) {
  car.controls.reset(); car.controls.throttle = 1;
  sim.step();
  if (i >= 327) {
    const info = [];
    sim.pw.world.contactPair(car.collider, sim.ball.collider, (m, flipped) => {
      for (let k = 0; k < m.numContacts(); k++) info.push(`d=${m.contactDist(k).toFixed(4)} imp=${m.contactImpulse(k).toFixed(2)}`);
      const n = m.normal(); info.push(`n=${n.x.toFixed(2)},${n.y.toFixed(2)},${n.z.toFixed(2)} flipped=${flipped} solver=${m.numSolverContacts()}`);
    });
    const gap = (sim.ball.pos.z - car.pos.z) / UU;
    console.log(i, 'gapZ', gap.toFixed(1), 'ballY', (sim.ball.pos.y/UU).toFixed(1), info.join(' | '), sim.events.map(e=>e.type).join(','));
  }
}
