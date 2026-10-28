// Cheap ball path prediction for bots and shot/save detection.
// Gravity, drag and bounces off the floor, walls and ceiling as flat planes (good enough for decisions).
import { CONFIG } from '../config.js';
import { UU } from '../util/math.js';

const R = CONFIG.physics.ballRadius * UU;
const G = CONFIG.physics.gravityZ * UU;
const X = CONFIG.arena.extentX * UU;
const Z = CONFIG.arena.extentY * UU;
const H = CONFIG.arena.height * UU;
const GW = CONFIG.arena.goalHalfWidth * UU;
const GH = CONFIG.arena.goalHeight * UU;
const DRAG = 1 - CONFIG.physics.ballDrag;

// Returns an array of {t, x, y, z, vx, vy, vz}. step in seconds.
export function predictBall(pos, vel, seconds = 4, step = 1 / 30) {
  let x = pos.x, y = pos.y, z = pos.z;
  let vx = vel.x, vy = vel.y, vz = vel.z;
  const out = [];
  const damp = Math.pow(DRAG, step);
  for (let t = step; t <= seconds + 1e-6; t += step) {
    vy += G * step;
    vx *= damp; vy *= damp; vz *= damp;
    x += vx * step; y += vy * step; z += vz * step;
    if (y < R) {
      y = R;
      if (vy < -1.5) {
        // Bounce: lose 40% of the vertical speed and a little horizontal speed to friction.
        vy = -vy * 0.6;
        vx *= 0.94;
        vz *= 0.94;
      } else if (vy < 0) {
        vy = 0; // rolling
      }
    }
    if (y > H - R) { y = H - R; if (vy > 0) vy = -vy * 0.6; }
    if (x > X - R) { x = X - R; if (vx > 0) vx = -vx * 0.6; }
    if (x < -X + R) { x = -X + R; if (vx < 0) vx = -vx * 0.6; }
    const inGoalMouth = Math.abs(x) < GW - R * 0.5 && y < GH - R * 0.3;
    if (!inGoalMouth) {
      if (z > Z - R) { z = Z - R; if (vz > 0) vz = -vz * 0.6; }
      if (z < -Z + R) { z = -Z + R; if (vz < 0) vz = -vz * 0.6; }
    }
    out.push({ t, x, y, z, vx, vy, vz });
    if (Math.abs(z) > Z + R) break; // entered a goal
  }
  return out;
}

// Which goal (0 = blue's goal at -z, 1 = orange's at +z) the ball enters within the horizon, or -1.
export function goalBound(path) {
  for (const p of path) {
    if (p.z > Z + R * 0.5 && Math.abs(p.x) < GW && p.y < GH) return 1;
    if (p.z < -Z - R * 0.5 && Math.abs(p.x) < GW && p.y < GH) return 0;
  }
  return -1;
}
