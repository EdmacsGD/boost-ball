// Bot vs bot matches (not part of npm test). Usage: node tests/botduel.mjs ultra hard [minutes] [mode]
import { initPhysics } from '../src/physics/world.js';
import { Simulation } from '../src/physics/sim.js';
import { Bot } from '../src/game/bot.js';
import { CONFIG } from '../src/config.js';

await initPhysics();
const [A = 'ultra', B = 'hard', minutes = '5', mode = '1v1'] = process.argv.slice(2);
const per = mode === '3v3' ? 3 : mode === '2v2' ? 2 : 1;
const sim = new Simulation();
const game = { sim };
const bots = [];
for (let t = 0; t < 2; t++) for (let i = 0; i < per; i++) {
  const car = sim.addCar(t, 'standard');
  const spec = t === 0 ? A : B;
  const [base, json] = spec.split('+');
  const bot = new Bot(car, game, base);
  if (json) bot.d = { ...bot.d, ...JSON.parse(json) };
  if (bot.d.infiniteBoost) car.infiniteBoost = true;
  bots.push(bot);
}
const score = [0, 0];
let kickoffTouched = false;
const kickoff = () => {
  sim.setupKickoff();
  for (const b of bots) { b.state = 'kickoff'; b.dodge = null; b.aerial = null; if (b.d.infiniteBoost) b.car.infiniteBoost = true; }
  kickoffTouched = false;
};
kickoff();
sim.goalDetection = true;
const ticks = Number(minutes) * 60 * 120;
for (let i = 0; i < ticks; i++) {
  for (const b of bots) b.think(1 / 120, !kickoffTouched);
  sim.step();
  for (const e of sim.events) {
    if (e.type === 'ballHit') {
      kickoffTouched = true;
      const b = bots.find((x) => x.car.id === e.carId);
      if (b && b.onTouch) b.onTouch();
    }
  }
  if (sim.goalScored >= 0) {
    score[sim.goalScored]++;
    kickoff();
  }
}
console.log(`${mode} ${minutes} min: ${A} (blue) ${score[0]} - ${score[1]} ${B} (orange)`);
