import { initPhysics } from '../src/physics/world.js';
import { Simulation } from '../src/physics/sim.js';
import { UU, rl } from '../src/util/math.js';
await initPhysics();
for (const pd of [0.002, 0.02, 0.05, 0.1, 0.2]) {
  const sim = new Simulation();
  sim.pw.world.integrationParameters.normalizedPredictionDistance = pd;
  sim.goalDetection = false;
  const car = sim.addCar(0);
  car.place(rl(0, -3000, 17), Math.PI / 2);
  sim.ball.place(rl(0, 0, 91.25));
  for (let i = 0; i < 60; i++) { car.controls.reset(); sim.step(); }
  let minD = 0, hits = [];
  for (let i = 0; i < 345; i++) {
    car.controls.reset(); car.controls.throttle = 1;
    sim.step();
    sim.pw.world.contactPair(car.collider, sim.ball.collider, (m) => {
      for (let k = 0; k < m.numContacts(); k++) minD = Math.min(minD, m.contactDist(k));
    });
    for (const e of sim.events) if (e.type === 'ballHit') hits.push(Math.round(e.strength));
  }
  // ball bounce check
  const s2 = new Simulation(); s2.pw.world.integrationParameters.normalizedPredictionDistance = pd;
  s2.ball.place(rl(0, 0, 1000));
  let peak = 0, phase = 0, lv = 0;
  for (let i = 0; i < 720; i++) { s2.step(); const vy = s2.ball.vel.y; if (phase===0 && lv<0 && vy>0) phase=1; if (phase===1){peak=Math.max(peak,s2.ball.pos.y/UU); if(lv>0&&vy<=0) phase=2;} lv=vy; }
  console.log('pred', pd, 'min contact dist (cm)', (minD*100).toFixed(2), 'hits', hits.join(','), 'ball speed', (sim.ball.vel.length()/UU).toFixed(0), 'bounce apex', peak.toFixed(0));
}
