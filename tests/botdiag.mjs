import { initPhysics } from '../src/physics/world.js';
import { Simulation } from '../src/physics/sim.js';
import { Bot } from '../src/game/bot.js';
import { teamRole } from '../src/game/roles.js';
import { UU } from '../src/util/math.js';
await initPhysics();
const sim = new Simulation();
const game = { sim, roleFor: (bot) => teamRole(sim.cars, bot.car, sim.ball.pos) };
const bots = [new Bot(sim.addCar(0), game, 'hard'), new Bot(sim.addCar(1), game, 'easy')];
sim.setupKickoff();
let kick = false;
let airRun = 0;
for (let tick = 0; tick < 120 * 180; tick++) {
  for (const b of bots) b.think(1 / 120, !kick);
  sim.step();
  if (sim.events.some((e) => e.type === 'ballHit')) kick = true;
  if (sim.goalScored >= 0) { sim.setupKickoff(); kick = false; }
  const c = bots[1].car;
  if (!c.isOnGround) airRun++; else airRun = 0;
  if (airRun > 0 && airRun % 240 === 0) {
    console.log(`t=${(tick/120).toFixed(1)} easy airborne ${(airRun/120).toFixed(0)}s pos=${c.pos.toArray().map(v=>v.toFixed(1))} up=${c.up.toArray().map(v=>v.toFixed(2))} wheels=${c.numWheelsInContact} vel=${c.vel.length().toFixed(1)} state=${bots[1].state} dodge=${!!bots[1].dodge} aerial=${!!bots[1].aerial} world=${c.worldContact.hasContact}`);
  }
}
