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

// ------------------------------------------------------------------ whole-match recording
// Every car, the ball and the score, 30 times a second, for watching the match again afterwards
// (about 2.5 MB for a 6-car match). Frames are packed in a growing Float32Array:
// header [t, scoreBlue, scoreOrange, ball x y z, ball qx qy qz qw, ball shown]
// then per car [x y z, qx qy qz qw, flags, steer, forward speed]
// flags: 1 boosting, 2 supersonic, 4 demolished, 8 wheels down.
const HEAD = 11;
const CAR_F = 10;
export class MatchRecorder {
  constructor(carIds, rate = 30) {
    this.ids = carIds.slice();
    this.stride = HEAD + carIds.length * CAR_F;
    this.interval = 1 / rate;
    this.data = new Float32Array(this.stride * 2048);
    this.count = 0;
    this.acc = 0;
    this.goals = []; // { t, team, pos: [x, y, z], explosion, name }
  }

  record(dt, time, sim, score) {
    this.acc += dt;
    if (this.acc < this.interval && this.count > 0) return;
    this.acc = 0;
    if ((this.count + 1) * this.stride > this.data.length) {
      const bigger = new Float32Array(this.data.length * 2);
      bigger.set(this.data);
      this.data = bigger;
    }
    const d = this.data;
    let o = this.count * this.stride;
    const b = sim.ball;
    d[o++] = time;
    d[o++] = score[0];
    d[o++] = score[1];
    d[o++] = b.pos.x; d[o++] = b.pos.y; d[o++] = b.pos.z;
    d[o++] = b.quat.x; d[o++] = b.quat.y; d[o++] = b.quat.z; d[o++] = b.quat.w;
    d[o++] = b.body.isEnabled() ? 1 : 0;
    for (const id of this.ids) {
      const c = sim.cars.find((x) => x.id === id);
      if (!c) {
        o += CAR_F;
        continue;
      }
      d[o++] = c.pos.x; d[o++] = c.pos.y; d[o++] = c.pos.z;
      d[o++] = c.quat.x; d[o++] = c.quat.y; d[o++] = c.quat.z; d[o++] = c.quat.w;
      d[o++] = (c.isBoosting ? 1 : 0) | (c.isSupersonic ? 2 : 0) | (c.isDemoed ? 4 : 0) | (c.numWheelsInContact >= 3 ? 8 : 0);
      d[o++] = c.wheels[0].steerAngle;
      d[o++] = c.forwardSpeed;
    }
    this.count++;
  }

  addGoal(g) {
    this.goals.push({ t: g.time, team: g.team, pos: g.pos.toArray(), explosion: g.explosion, name: g.scorer ? g.scorer.name : null });
  }

  get start() {
    return this.count ? this.data[0] : 0;
  }

  get end() {
    return this.count ? this.data[(this.count - 1) * this.stride] : 0;
  }

  // Frame index at or before time t.
  indexAt(t) {
    const s = this.stride;
    let lo = 0;
    let hi = this.count - 1;
    if (hi < 0) return -1;
    if (t <= this.data[0]) return 0;
    if (t >= this.data[hi * s]) return hi;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.data[mid * s] <= t) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  // A frame in the same shape as ReplayBuffer frames, so the drawing code is shared.
  frame(i) {
    const d = this.data;
    const s = this.stride;
    const o = i * s;
    const n = Math.min(this.count - 1, i + 1) * s;
    const dt = Math.max(1e-3, d[n] - d[o]);
    const vel = (a, b) => [(d[b] - d[a]) / dt, (d[b + 1] - d[a + 1]) / dt, (d[b + 2] - d[a + 2]) / dt];
    const cars = this.ids.map((id, k) => {
      const c = o + HEAD + k * CAR_F;
      const f = d[c + 7];
      return {
        id,
        p: [d[c], d[c + 1], d[c + 2]],
        q: [d[c + 3], d[c + 4], d[c + 5], d[c + 6]],
        v: vel(c, n + HEAD + k * CAR_F),
        boosting: !!(f & 1), ss: !!(f & 2), demoed: !!(f & 4), ground: !!(f & 8),
        steer: d[c + 8], fwdSpeed: d[c + 9], susp: null,
      };
    });
    return {
      t: d[o],
      score: [d[o + 1], d[o + 2]],
      ball: { p: [d[o + 3], d[o + 4], d[o + 5]], q: [d[o + 6], d[o + 7], d[o + 8], d[o + 9]], v: vel(o + 3, n + 3), on: d[o + 10] > 0.5 },
      cars,
    };
  }

  sample(t) {
    const i = this.indexAt(t);
    if (i < 0) return null;
    const a = this.frame(i);
    const j = Math.min(this.count - 1, i + 1);
    const b = j === i ? a : this.frame(j);
    return { a, b, k: j === i ? 0 : Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t || 1))) };
  }
}
