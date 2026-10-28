import * as THREE from 'three';
import { initPhysics } from '../src/physics/world.js';
import { Simulation } from '../src/physics/sim.js';
import { UU, rl } from '../src/util/math.js';
await initPhysics();
for (const mode of ['none', 'propagate', 'zeroStep']) {
  const sim = new Simulation();
  sim.goalDetection = false;
  const car = sim.addCar(0);
  sim.ball.place(rl(0, 0, 1200));
  car.place(rl(0, 0, 1200 - 91.25 + 1), Math.PI / 2);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI).multiply(car.quat);
  car.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
  car.readState();
  if (mode === 'propagate') sim.pw.world.propagateModifiedBodyPositionsToColliders();
  if (mode === 'zeroStep') { const dt = sim.pw.world.timestep; sim.pw.world.timestep = 0; sim.pw.world.step(); sim.pw.world.timestep = dt; }
  car.hasJumped = true; car.hasFlipped = true; car.isOnGround = false;
  car.controls.reset();
  sim.step();
  console.log(mode, 'wheels', car.numWheelsInContact, 'hasFlipped', car.hasFlipped, 'up', car.up.toArray().map(v=>v.toFixed(2)).join(','), 'ballY', (sim.ball.pos.y/UU).toFixed(1));
}
