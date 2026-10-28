// Team roles for bots: the car that can reach the ball soonest attacks, the next supports,
// and in 3v3 the last one hangs back near goal.
import { CONFIG } from '../config.js';
import { UU } from '../util/math.js';

export function teamRole(cars, car, ballPos) {
  const mates = cars.filter((c) => c.team === car.team && !c.isDemoed);
  if (mates.length <= 1) return 'attacker';
  const dir = car.team === 0 ? 1 : -1;
  const ownZ = -dir * CONFIG.arena.extentY * UU;
  const scored = mates.map((c) => {
    const d = c.pos.distanceTo(ballPos);
    // Cars ahead of the ball (wrong side) are much slower to make a useful touch.
    const ahead = (c.pos.z - ballPos.z) * dir > 2 ? 1.2 : 0;
    return { c, s: d / Math.max(8, c.vel.length()) + ahead };
  }).sort((a, b) => a.s - b.s);
  const idx = scored.findIndex((x) => x.c === car);
  if (idx === 0) return 'attacker';
  if (mates.length === 3 && idx === 2) return Math.abs(car.pos.z - ownZ) < 60 ? 'goalie' : 'support';
  return 'support';
}
