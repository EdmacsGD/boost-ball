import * as THREE from 'three';

// 1 Unreal unit = 1 cm. The game world runs in meters.
export const UU = 0.01;

// The original's coordinates are (x, y, z) with z up and +y toward the orange goal.
// Three.js uses y up. Swapping y and z keeps left/right the same as the original (no mirroring).
export function rl(x, y, z, out = new THREE.Vector3()) {
  return out.set(x * UU, z * UU, y * UU);
}

// Piecewise linear curve, same behavior as RocketSim's LinearPieceCurve (clamped at both ends).
export class Curve {
  constructor(points) {
    this.x = points.map((p) => p[0]);
    this.y = points.map((p) => p[1]);
  }
  get(v) {
    const { x, y } = this;
    if (x.length === 0) return 1;
    if (v <= x[0]) return y[0];
    for (let i = 1; i < x.length; i++) {
      if (x[i] > v) {
        const t = (v - x[i - 1]) / (x[i] - x[i - 1]);
        return y[i - 1] + (y[i] - y[i - 1]) * t;
      }
    }
    return y[y.length - 1];
  }
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));

// Frame-rate independent exponential approach for vectors.
export function dampVec(v, target, lambda, dt) {
  const t = 1 - Math.exp(-lambda * dt);
  v.x += (target.x - v.x) * t;
  v.y += (target.y - v.y) * t;
  v.z += (target.z - v.z) * t;
  return v;
}

// Small seeded RNG so the stadium looks the same every load.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Wrap an angle to [-PI, PI].
export function wrapAngle(a) {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}
