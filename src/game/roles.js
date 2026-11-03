// Team roles for bots: the car that can reach the ball soonest attacks, the next supports,
// and in 3v3 the last one hangs back near goal.
//
// With rotation on (bot.d.rotation), the choice works like a real team's rotation:
//  - a car already committed to a hit keeps the ball (no two cars going for it at once),
//  - the current attacker keeps the role unless a teammate is clearly better (no flip-flopping),
//  - the car that just touched the ball rotates out if a teammate is ready to follow up,
//  - bots leave the ball to a human teammate who is about as close.
import { CONFIG } from '../config.js';
import { UU } from '../util/math.js';

const COMMIT_STATES = new Set(['attack', 'clear', 'save', 'aerial']);

export function teamRole(cars, car, ballPos, botOf = null, now = 0) {
  const mates = cars.filter((c) => c.team === car.team && !c.isDemoed);
  if (mates.length <= 1) return 'attacker';
  const dir = car.team === 0 ? 1 : -1;
  const ownZ = -dir * CONFIG.arena.extentY * UU;
  const me = botOf ? botOf(car) : null;
  const rotation = !!(me && me.d && me.d.rotation);
  const scored = mates.map((c) => {
    const d = c.pos.distanceTo(ballPos);
    // Cars ahead of the ball (wrong side) are much slower to make a useful touch.
    const ahead = (c.pos.z - ballPos.z) * dir > 2 ? 1.2 : 0;
    let s = d / Math.max(8, c.vel.length()) + ahead;
    if (rotation) {
      const b = botOf(c);
      if (!b) {
        s -= 0.6; // a person on the team: let them have it (0.3 still crowded them)
      } else {
        if (b.dodge || b.aerial || (COMMIT_STATES.has(b.state) && now < b.commitUntil + 0.25)) s -= me.d.rotCommit ?? 0.5;
        if (b.role === 'attacker') s -= me.d.rotHold ?? 0.25;
        // Just hit it: rotate out and let the next car follow up.
        if (now - (b.lastTouchT ?? -9) < 1.0 && (c.pos.z - ballPos.z) * dir > -6) s += me.d.rotTouch ?? (mates.length >= 3 ? 0.4 : 0.8);
      }
    }
    return { c, s };
  }).sort((a, b) => a.s - b.s);
  const idx = scored.findIndex((x) => x.c === car);
  if (idx === 0) return 'attacker';
  if (mates.length === 3 && idx === 2) return (rotation && me.d.rot3 !== false) || Math.abs(car.pos.z - ownZ) < 60 ? 'goalie' : 'support';
  return 'support';
}
