// Ring buffer of recent world states, for goal replays.
import * as THREE from 'three';

export class ReplayBuffer {
  constructor(seconds = 8, rate = 60) {
    this.max = Math.ceil(seconds * rate);
    this.interval = 1 / rate;
    this.frames = [];
    this.acc = 0;
  }

  clear() {
    this.frames.length = 0;
    this.acc = 0;
  }

  record(dt, time, sim) {
    this.acc += dt;
    if (this.acc < this.interval) return;
    this.acc -= this.interval;
    const b = sim.ball;
    this.frames.push({
      t: time,
      ball: { p: b.pos.toArray(), q: b.quat.toArray(), v: b.vel.toArray(), on: b.body.isEnabled() },
      cars: sim.cars.map((c) => ({
        id: c.id,
        p: c.pos.toArray(),
        q: c.quat.toArray(),
        v: c.vel.toArray(),
        boosting: c.isBoosting,
        ss: c.isSupersonic,
        demoed: c.isDemoed,
        steer: c.wheels[0].steerAngle,
        susp: c.wheels.map((w) => w.suspensionLength),
        ground: c.numWheelsInContact >= 3,
        fwdSpeed: c.forwardSpeed,
      })),
      pads: sim.pads.map((p) => p.active),
    });
    if (this.frames.length > this.max) this.frames.shift();
  }

  get start() {
    return this.frames.length ? this.frames[0].t : 0;
  }

  get end() {
    return this.frames.length ? this.frames[this.frames.length - 1].t : 0;
  }

  // Interpolated sample at absolute time t.
  sample(t) {
    const f = this.frames;
    if (!f.length) return null;
    if (t <= f[0].t) return { a: f[0], b: f[0], k: 0 };
    if (t >= f[f.length - 1].t) return { a: f[f.length - 1], b: f[f.length - 1], k: 0 };
    let lo = 0;
    let hi = f.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (f[mid].t <= t) lo = mid;
      else hi = mid;
    }
    const a = f[lo];
    const b = f[hi];
    return { a, b, k: (t - a.t) / (b.t - a.t || 1) };
  }
}

const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();

export function lerpPose(a, b, k, outPos, outQuat) {
  outPos.set(a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k, a.p[2] + (b.p[2] - a.p[2]) * k);
  qa.fromArray(a.q);
  qb.fromArray(b.q);
  outQuat.slerpQuaternions(qa, qb, k);
}
