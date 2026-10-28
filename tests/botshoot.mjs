// Single bot, no opponent: how quickly and how often does it score from random setups?
import * as THREE from 'three';
import { initPhysics } from '../src/physics/world.js';
import { Simulation } from '../src/physics/sim.js';
import { Bot } from '../src/game/bot.js';
import { teamRole } from '../src/game/roles.js';
import { rl, UU, mulberry32 } from '../src/util/math.js';
import { CONFIG } from '../src/config.js';
await initPhysics();
const diff = process.argv[2] || 'hard';
const N = Number(process.argv[3] || 12);
const verbose = process.argv.includes('-v');
if (process.env.OVR) CONFIG.bots[diff] = { ...CONFIG.bots[diff], ...JSON.parse(process.env.OVR) };
const rand = mulberry32(42);
let scored = 0, own = 0, totalT = 0, touchesTot = 0;
for (let trial = 0; trial < N; trial++) {
  const sim = new Simulation();
  const game = { sim, roleFor: () => 'attacker' };
  const car = sim.addCar(0);
  const bot = new Bot(car, game, diff);
  const bx = (rand() - 0.5) * 6000, by = (rand() - 0.3) * 6000;
  const cx = (rand() - 0.5) * 6000, cy = by - 2000 - rand() * 3000;
  car.place(rl(cx, Math.max(-4800, cy), 17), rand() * Math.PI * 2);
  sim.ball.place(rl(bx, by, 93), new THREE.Vector3((rand() - 0.5) * 8, rand() * 6, (rand() - 0.5) * 8));
  sim.pw.syncQueries();
  let t = 0, result = 'timeout', touches = 0;
  for (let tick = 0; tick < 120 * 20; tick++) {
    bot.think(1 / 120, false);
    sim.step();
    for (const e of sim.events) if (e.type === 'ballHit') {
      bot.onTouch();
      touches++;
      if (verbose) console.log(`   hit t=${(tick/120).toFixed(2)} str=${e.strength.toFixed(0)} ballvel=${sim.ball.vel.toArray().map(v=>(v/UU).toFixed(0))} carstate=${bot.state} dodge=${!!bot.dodge}`);
    }
    if (process.env.TRACE == trial && tick % 60 === 0) console.log(`    t=${(tick/120).toFixed(1)} state=${bot.state} car=${car.pos.toArray().map(v=>(v/UU).toFixed(0))} v=${(car.vel.length()/UU).toFixed(0)} target=${bot.target.toArray().map(v=>(v/UU).toFixed(0))} tspd=${(bot.targetSpeed/UU).toFixed(0)} ball=${sim.ball.pos.toArray().map(v=>(v/UU).toFixed(0))} up=${car.up.y.toFixed(2)} wheels=${car.numWheelsInContact} dodge=${!!bot.dodge} aer=${!!bot.aerial}`);
    if (sim.goalScored >= 0) { result = sim.goalScored === 0 ? 'GOAL' : 'OWN'; t = tick / 120; break; }
  }
  touchesTot += touches;
  if (result === 'GOAL') { scored++; totalT += t; }
  if (result === 'OWN') own++;
  if (verbose || result !== 'GOAL') console.log(`trial ${trial}: ${result} ${t.toFixed(1)}s touches=${touches} ball=(${bx.toFixed(0)},${by.toFixed(0)}) car=(${cx.toFixed(0)},${cy.toFixed(0)}) final ball=${sim.ball.pos.toArray().map(v=>(v/UU).toFixed(0))}`);
}
console.log(`${diff}: scored ${scored}/${N}, own ${own}, avg time ${(totalT / Math.max(1, scored)).toFixed(1)}s, touches/trial ${(touchesTot / N).toFixed(1)}`);
