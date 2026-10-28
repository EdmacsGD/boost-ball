// Compact number arrays for what travels between players (each presence object is capped at 4 KiB,
// sent about 30 times a second). Meters to centimeters, rotations to 1/10000.
const R = (v, k) => Math.round(v * k);

// Car: [px, py, pz, qx, qy, qz, qw, vx, vy, vz, wx, wy, wz, boost, flags, steer, throttle]
// flags: 1 boosting, 2 supersonic, 4 demoed, 8 wheels down (3+), 16 jump held
export function encodeCar(car) {
  const c = car.controls;
  const flags = (car.isBoosting ? 1 : 0) | (car.isSupersonic ? 2 : 0) | (car.isDemoed ? 4 : 0) | (car.numWheelsInContact >= 3 ? 8 : 0) | (c.jump ? 16 : 0);
  return [
    R(car.pos.x, 100), R(car.pos.y, 100), R(car.pos.z, 100),
    R(car.quat.x, 1e4), R(car.quat.y, 1e4), R(car.quat.z, 1e4), R(car.quat.w, 1e4),
    R(car.vel.x, 100), R(car.vel.y, 100), R(car.vel.z, 100),
    R(car.angVel.x, 100), R(car.angVel.y, 100), R(car.angVel.z, 100),
    Math.round(car.boost), flags, R(c.steer, 100), R(c.throttle, 100),
  ];
}

const num = (v) => (Number.isFinite(v) ? v : 0);

export function decodeCar(a) {
  if (!Array.isArray(a) || a.length < 17) return null;
  const n = a.map(num);
  const ql = Math.hypot(n[3], n[4], n[5], n[6]) || 1;
  return {
    p: [n[0] / 100, n[1] / 100, n[2] / 100],
    q: [n[3] / ql, n[4] / ql, n[5] / ql, n[6] / ql],
    v: [n[7] / 100, n[8] / 100, n[9] / 100],
    w: [n[10] / 100, n[11] / 100, n[12] / 100],
    boost: Math.max(0, Math.min(100, n[13])),
    boosting: !!(n[14] & 1),
    supersonic: !!(n[14] & 2),
    demoed: !!(n[14] & 4),
    ground: !!(n[14] & 8),
    jump: !!(n[14] & 16),
    steer: Math.max(-1, Math.min(1, n[15] / 100)),
    throttle: Math.max(-1, Math.min(1, n[16] / 100)),
  };
}

// Ball: [px, py, pz, vx, vy, vz, wx, wy, wz, on]
export function encodeBall(ball) {
  return [
    R(ball.pos.x, 100), R(ball.pos.y, 100), R(ball.pos.z, 100),
    R(ball.vel.x, 100), R(ball.vel.y, 100), R(ball.vel.z, 100),
    R(ball.angVel.x, 100), R(ball.angVel.y, 100), R(ball.angVel.z, 100),
    ball.body.isEnabled() ? 1 : 0,
  ];
}

export function decodeBall(a) {
  if (!Array.isArray(a) || a.length < 10) return null;
  const n = a.map(num);
  return { p: [n[0] / 100, n[1] / 100, n[2] / 100], v: [n[3] / 100, n[4] / 100, n[5] / 100], w: [n[6] / 100, n[7] / 100, n[8] / 100], on: !!n[9] };
}

// Look of a player's car, from their loadout (strings only; checked against the catalog on use).
export function encodeLook(lo, accentHex, level = 1) {
  return { icon: lo.icon, banner: lo.banner, lvl: level, car: lo.car, acc: accentHex, paint: lo.paint, finish: lo.finish, decal: lo.decal, boost: lo.boost, expl: lo.explosion, anthem: String(lo.anthem || '').startsWith('custom:') ? 'none' : lo.anthem, title: lo.title };
}
