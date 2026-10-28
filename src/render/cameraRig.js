// Chase camera with ball cam, modeled on the original game's camera settings (FOV, distance, height,
// angle, stiffness, transition speed), plus cinematic shots for goals and replays.
//
// The play camera is a boom arm around the car. An aim direction is smoothed with a critically damped
// spring; the camera sits `distance` behind and `height` above the car in the aim's frame and looks
// along the aim, tilted by `angle`. The boom is rebuilt from the car's current position every frame,
// so the car keeps its spot on screen however far the aim lags behind.
//
// Ball cam follows how the original behaves (observed behavior; its exact formulas are not public):
// - The aim turns to put the ball straight ahead of the car. Ball behind the car: the camera swings
//   round in front of it.
// - The horizon stays level, also with the car on a wall. Car cam rolls with the wall instead.
// - The view pitches up by only a small share of the ball's height angle, so a high ball rides up the
//   frame. If it would sit too high, the boom swings down under the car (the camera drops and looks
//   up), as far as the floor and the car's spot on screen allow. A ball below the car is looked down
//   at fully.
// - Toggling eases between car cam and ball cam over 0.5 / transitionSpeed seconds.
// - One deliberate difference: with the ball almost straight above the car (a dribble), the aim eases
//   onto the car's heading. The original flips the camera back and forth there.
// The pitch share, the screen limits for car and ball, and the turn rates follow measurements of the
// original's camera published by the RLViewer fan project (github.com/picccassso/RLViewer).
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { UU, clamp, smoothstep } from '../util/math.js';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const DEG = Math.PI / 180;

const BALL_PITCH_SHARE = 0.15; // share of an upward ball angle that tilts the view
const MAX_BALL_ELEV = 80 * DEG;
const MIN_BALL_ELEV = -55 * DEG;
const OVERHEAD_DIST = 2.0; // m: below this horizontal ball distance the aim eases onto the car heading
const BALL_SCREEN_LIMIT = 0.3; // ball kept at most this far above screen center (share of half height)
const CAR_SCREEN_LIMIT = 0.8; // car kept inside this share of the half width and half height
const MAX_ORBIT = 70 * DEG; // furthest the boom swings under the car
const BALL_RATE = 14; // ball cam aim pace (1/s); eases to half with the ball close to the car
const BALL_EASE_DIST = 2.5; // m
const BALL_MAX_TURN = 600 * DEG; // rad/s
const CAR_MAX_TURN = 720 * DEG;
const SPIN_UP = 0.15; // s to build up to the max turn rate
const UP_RATE = 8; // how fast the roll reference follows (1/s)
const SURFACE_RATE = 6; // car cam: how fast it aligns to a wall (1/s)
const MIN_CAM_HEIGHT = 0.3; // m above the floor or floor ramp
const BOOM_MIN_SHARE = 0.25; // shortest boom (share of its length) when the car is up a wall or in the air
const SPEED_FOLLOW = 2.5; // pace at which the camera's sense of the car's speed follows (1/s)
const TOP_SPEED = 23; // m/s

const A = CONFIG.arena;
const EX = A.extentX * UU;
const EZ = A.extentY * UU;
const CP = A.cornerPlane * UU;
const RF = A.floorRampRadius * UU;
const GW = A.goalHalfWidth * UU;
const TAPER = A.goalRampTaper * UU;

// Height of the floor or floor ramp under (x, z); null outside the walls.
// Sky Field: the floor is flat everywhere (no arena ramps, nothing to stay inside).
let flatFloor = false;
export function setFlatFloor(on) {
  flatFloor = on;
}

export function floorHeightAt(x, z) {
  if (flatFloor) return 0;
  const ax = Math.abs(x);
  const az = Math.abs(z);
  const dSide = EX - ax;
  const dBack = EZ - az;
  const dCorner = (CP - ax - az) / Math.SQRT2;
  const d = Math.min(dSide, dBack, dCorner);
  if (d < 0) return null;
  let rf = RF;
  if (dBack <= Math.min(dSide, dCorner)) {
    // The ramp tapers away between the goal posts.
    const t = clamp((ax - GW) / TAPER, 0, 1);
    rf *= t * t * (3 - 2 * t);
  }
  if (d >= rf) return 0;
  const k = rf - d;
  return rf - Math.sqrt(Math.max(0, rf * rf - k * k));
}

// Scratch vectors (each helper uses its own set).
const v0 = new THREE.Vector3();
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const m4 = new THREE.Matrix4();
const qTmp = new THREE.Quaternion();
const sAxis = new THREE.Vector3();
const t0 = new THREE.Vector3();
const t1 = new THREE.Vector3();
const t2 = new THREE.Vector3();
const t3 = new THREE.Vector3();
const t4 = new THREE.Vector3();
const t5 = new THREE.Vector3();
const t6 = new THREE.Vector3();
const t7 = new THREE.Vector3();
const a0 = new THREE.Vector3();
const a1 = new THREE.Vector3();
const a2 = new THREE.Vector3();
const a3 = new THREE.Vector3();
const a4 = new THREE.Vector3();
const p0 = new THREE.Vector3();
const p1 = new THREE.Vector3();
const p2 = new THREE.Vector3();
const p3 = new THREE.Vector3();
const p4 = new THREE.Vector3();

// Turns unit vector a toward unit vector b by share t of the angle between them, into out (out may be
// a, not b). Opposite vectors turn about `fallback` (made perpendicular to a).
function slerpDir(out, a, b, t, fallback) {
  const dot = clamp(a.dot(b), -1, 1);
  sAxis.crossVectors(a, b);
  const len = sAxis.length();
  if (len < 1e-6) {
    if (dot > 0 || t <= 0) return out.copy(a);
    sAxis.copy(fallback).addScaledVector(a, -fallback.dot(a));
    if (sAxis.lengthSq() < 1e-8) sAxis.set(a.y, a.z, a.x).addScaledVector(a, -(a.y * a.x + a.z * a.y + a.x * a.z));
    sAxis.normalize();
  } else {
    sAxis.divideScalar(len);
  }
  const ang = Math.atan2(len, dot);
  return out.copy(a).applyAxisAngle(sAxis, ang * t);
}

// Exact critically damped spring step for a number: state {x, v} toward target at pace `rate`
// (trails a steadily moving target like exponential smoothing at that rate).
function springScalar(state, target, rate, dt) {
  const w = 2 * rate;
  const e = Math.exp(-w * dt);
  const x = state.x - target;
  const k = (state.v + w * x) * dt;
  state.x = target + (x + k) * e;
  state.v = (state.v - w * k) * e;
}

// One critically damped step of an angle offset x (current minus target, rad) toward 0, never turning
// faster than maxTurn rad/s and building up to that speed over SPIN_UP seconds, so a big swing (ball
// popping over the car) eases in and out. Slowing down is not limited. state.v: rate of x (rad/s).
// Returns the new offset. Exact for any frame rate.
function springAngle(state, x, rate, maxTurn, dt) {
  const w = 2 * rate;
  const e = Math.exp(-w * dt);
  const k = (state.v + w * x) * dt;
  let next = (x + k) * e;
  let v = (state.v - w * k) * e;
  const step = next - x;
  const accel = maxTurn / SPIN_UP;
  const base = Math.sign(step) === Math.sign(state.v) ? Math.abs(state.v) : 0;
  const maxStep = Math.min(maxTurn * dt, base * dt + 0.5 * accel * dt * dt);
  if (Math.abs(step) > maxStep) {
    next = x + Math.sign(step) * maxStep;
    v = Math.sign(step) * Math.min(maxTurn, base + accel * dt);
  }
  state.v = v;
  return next;
}

// Signed angle from unit vector a to unit vector b around axis n (both perpendicular to n).
function signedAngle(a, b, n) {
  sAxis.crossVectors(a, b);
  return Math.atan2(sAxis.dot(n), a.dot(b));
}

// How far angle a lies outside [-lim, lim], signed; 0 inside.
function excess(a, lim) {
  if (a > lim) return a - lim;
  if (a < -lim) return a + lim;
  return 0;
}

export class CameraRig {
  constructor(camera, castArenaRay) {
    this.camera = camera;
    this.castArenaRay = castArenaRay; // (origin, dir, maxDist) -> distance or null
    this.settings = { ...CONFIG.camera };
    this.ballCam = true;
    this.mode = 'play'; // play | other (goal, replay and menu shots)
    this.pos = new THREE.Vector3(0, 6, -20);
    this.look = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.shakeOffset = new THREE.Vector3();
    this.t = 0;
    this.orbitAngle = 0;
    this.initialized = false;

    // Play camera state.
    this.blend = 1; // 0 = car cam, 1 = ball cam (linear; eased where used)
    // The aim is kept as a heading around a roll reference plus a pitch, so the camera swings round
    // level (a ball passing overhead turns it sideways, never over the top).
    this.aimUp = new THREE.Vector3(0, 1, 0); // roll reference: world up, or the wall in car cam
    this.heading = new THREE.Vector3(1, 0, 0); // aim heading, perpendicular to aimUp
    this.yaw = { v: 0 }; // heading turn rate (rad/s)
    this.pitch = 0; // aim pitch above the heading (rad)
    this.pitchS = { v: 0 };
    this.aim = new THREE.Vector3(1, 0, 0); // aim direction (from heading and pitch)
    this.camUp = new THREE.Vector3(0, 1, 0); // aim up (perpendicular to the aim)
    this.carHeading = new THREE.Vector3(1, 0, 0); // level heading of the car, held through tumbles
    this.surface = 0; // car cam: 0..1 aligned to the wall the car drives on
    this.orbit = 0; // boom swing under the car (rad)
    this.speed = { x: 0, v: 0 }; // the camera's sense of the car's speed (m/s) and its rate (m/s^2)
    this.ballDist = 99; // horizontal car-ball distance last frame (m)
    this.lastPivot = new THREE.Vector3();
    // Placement output: camera position, view forward / up / right, floor swing (rad).
    this.P = { pos: new THREE.Vector3(), vF: new THREE.Vector3(), vU: new THREE.Vector3(), vR: new THREE.Vector3(), off: new THREE.Vector3(), swing: 0 };
    this.debug = {};
  }

  snap() {
    this.initialized = false;
  }

  // Floating origin moved the world by -d: move the camera with it so nothing jumps.
  shift(d) {
    this.pos.sub(d);
    this.look.sub(d);
    this.lastPivot.sub(d);
    this.P.pos.sub(d);
  }

  // Normal play. car: { pos, vel, fwd, up, numWheelsInContact }; ballPos: ball center or null.
  updatePlay(dt, car, ballPos) {
    const s = this.settings;
    if (this.mode !== 'play') {
      this.mode = 'play';
      this.initialized = false;
    }
    // A teleport (reset, respawn) cuts instead of swinging across the field.
    if (this.initialized && this.lastPivot.distanceToSquared(car.pos) > 36) this.initialized = false;
    this.lastPivot.copy(car.pos);
    const snap = !this.initialized;
    dt = Math.max(dt, 1e-4);

    // Ball cam blend, eased in and out.
    const wantBall = this.ballCam && !!ballPos;
    if (snap) {
      this.blend = wantBall ? 1 : 0;
    } else {
      const step = (dt * Math.max(0.2, s.transitionSpeed)) / 0.5;
      this.blend = wantBall ? Math.min(1, this.blend + step) : Math.max(0, this.blend - step);
    }
    const w = this.blend * this.blend * (3 - 2 * this.blend);

    this.trackHeading(dt, car, snap);

    // Car cam target: level behind the car, or along the wall it drives on.
    const onSurface = car.numWheelsInContact >= 3;
    const surfTarget = onSurface ? smoothstep(0, 1, (0.9 - car.up.y) / 0.5) : 0;
    this.surface = snap ? surfTarget : this.surface + (surfTarget - this.surface) * (1 - Math.exp(-dt * SURFACE_RATE));
    const carU = slerpDir(t1, WORLD_UP, car.up, this.surface, car.fwd);
    const carH = slerpDir(t0, this.carHeading, car.fwd, this.surface, WORLD_UP);

    // Ball cam target: heading toward the ball, a small share of an upward ball angle, all of a
    // downward one. With the ball almost overhead the heading eases onto the car's.
    let ballH = null;
    let ballPitch = 0;
    if (ballPos) {
      const d = t2.subVectors(ballPos, car.pos);
      const hd = Math.hypot(d.x, d.z);
      this.ballDist = hd;
      const elev = clamp(Math.atan2(d.y, hd), MIN_BALL_ELEV, MAX_BALL_ELEV);
      const k = smoothstep(0, OVERHEAD_DIST, hd);
      ballH = t3.copy(this.carHeading).multiplyScalar(1 - k);
      if (hd > 1e-4) {
        ballH.x += (d.x / hd) * k;
        ballH.z += (d.z / hd) * k;
      }
      ballH.y = 0;
      if (ballH.lengthSq() < 1e-6) ballH.set(this.heading.x, 0, this.heading.z);
      if (ballH.lengthSq() < 1e-6) ballH.copy(this.carHeading);
      ballH.normalize();
      ballPitch = elev > 0 ? elev * BALL_PITCH_SHARE : elev;
    }

    // Blend the two targets: roll reference, heading (by angle around it) and pitch.
    const bw = ballH ? w : 0;
    const tU = slerpDir(t6, carU, WORLD_UP, bw, car.fwd);
    const tH = this.inPlane(t5, carH, tU, this.heading);
    if (ballH) {
      const bh = this.inPlane(t4, ballH, tU, tH);
      tH.applyAxisAngle(tU, signedAngle(tH, bh, tU) * bw);
    }
    const tPitch = ballPitch * bw;

    // Smooth: car cam nearly rigid, ball cam a little looser, slower with the ball close to the car.
    const stiff = clamp(s.stiffness, 0, 1);
    const carRate = 12 + 12 * stiff;
    const ballRate = BALL_RATE * clamp(this.ballDist / BALL_EASE_DIST, 0.5, 1);
    const rate = carRate + (ballRate - carRate) * w;
    const maxTurn = CAR_MAX_TURN + (BALL_MAX_TURN - CAR_MAX_TURN) * w;
    if (snap) {
      this.aimUp.copy(tU);
      this.heading.copy(tH);
      this.yaw.v = 0;
      this.pitch = tPitch;
      this.pitchS.v = 0;
    } else {
      slerpDir(this.aimUp, this.aimUp, tU, 1 - Math.exp(-dt * UP_RATE), this.heading);
      this.inPlane(this.heading, this.heading, this.aimUp, tH);
      const th = this.inPlane(t7, tH, this.aimUp, this.heading);
      // Offset of the heading from its target. Near a half turn keep turning the way we already are.
      let x = signedAngle(th, this.heading, this.aimUp);
      if (Math.abs(x) > Math.PI - 0.35 && Math.abs(this.yaw.v) > 0.3 && Math.sign(this.yaw.v) === Math.sign(x)) x -= 2 * Math.PI * Math.sign(x);
      const nx = springAngle(this.yaw, x, rate, maxTurn, dt);
      this.heading.copy(th).applyAxisAngle(this.aimUp, nx);
      this.pitch = tPitch + springAngle(this.pitchS, this.pitch - tPitch, rate, maxTurn, dt);
    }
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    this.aim.copy(this.heading).multiplyScalar(cp).addScaledVector(this.aimUp, sp);
    this.camUp.copy(this.heading).multiplyScalar(-sp).addScaledVector(this.aimUp, cp);

    // Stiffness: the boom stretches with speed, and a little more while the car speeds up.
    const speed = car.vel.length();
    if (snap) {
      this.speed.x = speed;
      this.speed.v = 0;
    } else {
      springScalar(this.speed, speed, SPEED_FOLLOW, dt);
    }
    const loose = 1 - stiff;
    const stretch = 1 + loose * (0.25 * clamp(this.speed.x / TOP_SPEED, 0, 1) + clamp(this.speed.v * 0.012, -0.08, 0.15));
    const boom = s.distance * UU * stretch;
    const height = s.height * UU;
    const angle = s.angle * DEG;
    // How far the car is off the floor: up a wall or in the air the boom may shorten near the floor.
    const floorBelow = floorHeightAt(car.pos.x, car.pos.z) ?? 0;
    const raised = smoothstep(0, 1, (car.pos.y - floorBelow - 0.6) / 1.9);

    // Orbit: swing the boom under the car when the ball would sit too high on screen. Measured on the
    // aim the camera is turning to, so a swing toward a ball behind does not dip and climb back out.
    let targetOrbit = 0;
    let maxOrbit = MAX_ORBIT;
    if (ballPos && w > 0) {
      const tF = t4.copy(tH).multiplyScalar(Math.cos(tPitch)).addScaledVector(tU, Math.sin(tPitch));
      const tUp = t7.copy(tH).multiplyScalar(-Math.sin(tPitch)).addScaledVector(tU, Math.cos(tPitch));
      const tanV = Math.tan((this.camera.fov * DEG) / 2);
      const limit = Math.atan(BALL_SCREEN_LIMIT * tanV);
      const ballAngle = (o) => {
        this.place(car.pos, tF, tUp, w, o, boom, height, raised, angle);
        this.frameCar(car.pos);
        const P = this.P;
        const b = p4.subVectors(ballPos, P.pos);
        const ahead = b.dot(P.vF);
        if (ahead <= 0) return -1; // behind the view (mid-toggle): looking up would not help
        P.vR.crossVectors(P.vF, P.vU).normalize();
        // Height angle above the view's horizontal plane, so a ball off to the side does not count as high.
        return Math.atan2(b.dot(P.vU), Math.hypot(ahead, b.dot(P.vR)));
      };
      if (ballAngle(0) > limit) {
        // Up a wall or in the air, stop where even the shortest boom would reach the floor.
        if (raised > 0) {
          const blocked = (o) => this.place(car.pos, tF, tUp, w, o, boom, height, raised, angle).swing > 1e-3;
          if (blocked(MAX_ORBIT)) {
            let free = 0;
            let hit = MAX_ORBIT;
            for (let i = 0; i < 12; i++) {
              const mid = (free + hit) / 2;
              if (blocked(mid)) hit = mid;
              else free = mid;
            }
            maxOrbit = free + (MAX_ORBIT - free) * (1 - raised);
          }
        }
        if (ballAngle(maxOrbit) > limit) {
          targetOrbit = maxOrbit;
        } else {
          let lo = 0;
          let hi = maxOrbit;
          for (let i = 0; i < 12; i++) {
            const mid = (lo + hi) / 2;
            if (ballAngle(mid) > limit) lo = mid;
            else hi = mid;
          }
          targetOrbit = hi;
        }
      }
    }
    const tgt = w * targetOrbit;
    this.orbit = snap ? tgt : this.orbit + (tgt - this.orbit) * (1 - Math.exp(-rate * dt));
    // The floor stops the swing at once instead of easing into it.
    this.orbit = Math.min(this.orbit, w * maxOrbit);

    const P = this.place(car.pos, this.aim, this.camUp, w, this.orbit, boom, height, raised, angle);
    this.frameCar(car.pos);
    this.pos.copy(P.pos);
    this.look.copy(P.pos).add(P.vF);
    this.up.copy(P.vU);
    this.debug = { blend: w, orbit: this.orbit, raised, stretch, swing: P.swing, rate };
    this.initialized = true;
    this.apply();
  }

  // Level heading of the car. Follows the nose while the car is upright or driving on a surface; mid-air
  // tumbles (flips, rolls) would swing it wildly, so it is held and drifts toward the direction of travel.
  trackHeading(dt, car, snap) {
    const onSurface = car.numWheelsInContact >= 3;
    const flat = v0.set(car.fwd.x, 0, car.fwd.z);
    const tumbling = !onSurface && car.up.y < 0.7;
    if ((snap || !tumbling) && flat.lengthSq() > 0.09) {
      this.carHeading.copy(flat.normalize());
      return;
    }
    const travel = v1.set(car.vel.x, 0, car.vel.z);
    if (travel.lengthSq() > 16) slerpDir(this.carHeading, this.carHeading, travel.normalize(), 1 - Math.exp(-dt * 2.5), WORLD_UP);
  }

  // out = v projected onto the plane perpendicular to unit n and normalized (out may be v). Falls back
  // to `fallback` projected the same way when v is (nearly) along n.
  inPlane(out, v, n, fallback) {
    const x = v.x - n.x * v.dot(n);
    const y = v.y - n.y * v.dot(n);
    const z = v.z - n.z * v.dot(n);
    if (x * x + y * y + z * z > 1e-6) return out.set(x, y, z).normalize();
    out.copy(fallback).addScaledVector(n, -fallback.dot(n));
    if (out.lengthSq() < 1e-6) out.set(n.y, n.z, n.x).addScaledVector(n, -(n.y * n.x + n.z * n.y + n.x * n.z));
    return out.normalize();
  }

  // Places the camera on the boom. F/U: aim forward and up (perpendicular). `share` of an upward aim
  // tilts the view instead of swinging the boom (ball cam keeps its height for high balls). `orbit`
  // swings boom and view up together around the car. The floor shortens the boom (car raised) and then
  // swings it up. Walls and the ceiling don't stop it: they are see-through from outside.
  place(pivot, F, U, share, orbit, boom, height, raised, angle) {
    const P = this.P;
    const R = P.vR.crossVectors(F, U).normalize();
    const upPitch = Math.max(0, Math.asin(clamp(F.y, -1, 1)));
    const tilt = orbit - upPitch * share;
    const bF = p0.copy(F).applyAxisAngle(R, tilt);
    const bU = p1.copy(U).applyAxisAngle(R, tilt);
    const off = P.off.copy(bF).multiplyScalar(-boom).addScaledVector(bU, height);
    let swing = 0;
    if (this.belowFloor(pivot, off)) {
      if (raised > 0) {
        const shortest = 1 - (1 - BOOM_MIN_SHARE) * raised;
        let lo = shortest;
        let hi = 1;
        if (!this.belowFloor(pivot, p2.copy(off).multiplyScalar(shortest))) {
          for (let i = 0; i < 12; i++) {
            const mid = (lo + hi) / 2;
            if (this.belowFloor(pivot, p2.copy(off).multiplyScalar(mid))) hi = mid;
            else lo = mid;
          }
        }
        off.multiplyScalar(lo);
      }
      if (this.belowFloor(pivot, off)) {
        // Swing the boom about the aim's right axis, whichever way lifts the camera.
        const dir = p2.crossVectors(R, off).y > 0 ? 1 : -1;
        let lo = 0;
        let hi = Math.PI / 2;
        for (let i = 0; i < 12; i++) {
          const mid = (lo + hi) / 2;
          if (this.belowFloor(pivot, p2.copy(off).applyAxisAngle(R, dir * mid))) lo = mid;
          else hi = mid;
        }
        off.applyAxisAngle(R, dir * hi);
        swing = hi;
        // Still under (boom pointing straight down): lift it.
        const h = floorHeightAt(pivot.x + off.x, pivot.z + off.z) ?? 0;
        off.y = Math.max(off.y, h + MIN_CAM_HEIGHT - pivot.y);
      }
    }
    P.pos.copy(pivot).add(off);
    P.vF.copy(F).applyAxisAngle(R, orbit + angle);
    P.vU.copy(U).applyAxisAngle(R, orbit + angle);
    P.swing = swing;
    return P;
  }

  belowFloor(pivot, off) {
    const h = floorHeightAt(pivot.x + off.x, pivot.z + off.z) ?? 0;
    return pivot.y + off.y < h + MIN_CAM_HEIGHT;
  }

  // Turns the placed view just enough to keep the car inside CAR_SCREEN_LIMIT of the frame (the floor
  // swing or a steep look up at the ball could push it out). Pitch first, then yaw, then pitch again.
  frameCar(pivot) {
    const P = this.P;
    const tanV = Math.tan((this.camera.fov * DEG) / 2);
    const limV = Math.atan(CAR_SCREEN_LIMIT * tanV);
    const limH = Math.atan(CAR_SCREEN_LIMIT * tanV * this.camera.aspect);
    const d = p3.subVectors(pivot, P.pos);
    const fixPitch = () => {
      P.vR.crossVectors(P.vF, P.vU).normalize();
      const ex = excess(Math.atan2(d.dot(P.vU), d.dot(P.vF)), limV);
      if (ex) {
        P.vF.applyAxisAngle(P.vR, ex);
        P.vU.applyAxisAngle(P.vR, ex);
      }
    };
    fixPitch();
    P.vR.crossVectors(P.vF, P.vU).normalize();
    const ey = excess(Math.atan2(d.dot(P.vR), d.dot(P.vF)), limH);
    if (ey) {
      P.vF.applyAxisAngle(P.vU, -ey);
      fixPitch();
    }
  }

  clampToFloor(p) {
    const h = floorHeightAt(p.x, p.z);
    p.y = Math.max(p.y, (h ?? 0) + MIN_CAM_HEIGHT);
  }

  keepInside(pivot) {
    if (!this.castArenaRay) return;
    const dir = v0.subVectors(this.pos, pivot);
    const len = dir.length();
    if (len < 1e-4) return;
    dir.divideScalar(len);
    const hit = this.castArenaRay(pivot, dir, len + 0.35);
    if (hit !== null && hit < len + 0.35) {
      this.pos.copy(pivot).addScaledVector(dir, Math.max(0.3, hit - 0.35));
    }
  }

  // Cinematic: slowly orbit a point (goal celebrations, pre-match).
  updateOrbit(dt, center, radius, height, speed = 0.15) {
    this.mode = 'other';
    this.orbitAngle += dt * speed;
    const desired = v0.set(center.x + Math.cos(this.orbitAngle) * radius, center.y + height, center.z + Math.sin(this.orbitAngle) * radius);
    if (!this.initialized) this.pos.copy(desired);
    else this.pos.lerp(desired, 1 - Math.exp(-dt * 2));
    this.look.lerp(center, this.initialized ? 1 - Math.exp(-dt * 3) : 1);
    this.up.copy(WORLD_UP);
    this.initialized = true;
    this.apply();
  }

  // Follow the ball from behind its travel direction (replays).
  updateFollow(dt, target, vel, back = 9, height = 3.5) {
    this.mode = 'other';
    const dir = v0.copy(vel);
    dir.y = 0;
    if (dir.lengthSq() < 0.5) dir.set(0, 0, 1);
    dir.normalize();
    const desired = v1.copy(target).addScaledVector(dir, -back);
    desired.y = Math.max(target.y + height, 1.5);
    if (!this.initialized) this.pos.copy(desired);
    else this.pos.lerp(desired, 1 - Math.exp(-dt * 2.5));
    this.keepInside(v2.copy(target));
    this.look.lerp(target, this.initialized ? 1 - Math.exp(-dt * 6) : 1);
    this.up.copy(WORLD_UP);
    this.initialized = true;
    this.apply();
  }

  // Fixed position looking at a target.
  updateFixed(dt, pos, target, rate = 4) {
    this.mode = 'other';
    if (!this.initialized) {
      this.pos.copy(pos);
      this.look.copy(target);
    } else {
      this.pos.lerp(pos, 1 - Math.exp(-dt * rate));
      this.look.lerp(target, 1 - Math.exp(-dt * rate * 1.5));
    }
    this.up.copy(WORLD_UP);
    this.initialized = true;
    this.apply();
  }

  apply(shake = this.shake || 0) {
    this.t += 1 / 60;
    const cam = this.camera;
    cam.position.copy(this.pos);
    if (shake > 0) {
      const a = shake * 0.12;
      this.shakeOffset.set(
        (Math.sin(this.t * 61.3) + Math.sin(this.t * 37.1)) * a,
        (Math.sin(this.t * 47.7) + Math.sin(this.t * 29.3)) * a,
        (Math.sin(this.t * 53.9) + Math.sin(this.t * 31.7)) * a,
      );
      cam.position.add(this.shakeOffset);
    }
    m4.lookAt(cam.position, this.look, this.up);
    qTmp.setFromRotationMatrix(m4);
    cam.quaternion.copy(qTmp);
  }
}
