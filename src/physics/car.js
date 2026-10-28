// Car physics, ported from RocketSim's Car.cpp and btVehicleRL.cpp (MIT, ZealanL).
// The car is one rigid box (the hitbox) held up by four raycast wheels. Wheels are not physical
// objects: each tick a ray goes down from every wheel mount, and a spring/damper pushes the body up.
// Tire grip is computed per wheel from how much it slides sideways. This is how the original works,
// and it is why cars drive up walls and flip so predictably.
//
// Local frame (meters): +x forward, +y up, +z right.
// RocketSim's frame is mirrored (x forward, y right, z up with right-handed math), so every rotation
// below was converted by meaning (nose up, roll right) rather than by copying axis signs.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { UU, Curve, clamp, sign } from '../util/math.js';
import { R, COLLIDER_GROUPS } from './world.js';

const V = CONFIG.vehicle;
const CC = CONFIG.car;
const BOOST = CONFIG.boost;
const JUMP = CONFIG.jump;
const FLIP = CONFIG.flip;
const AIR = CONFIG.air;
const P = CONFIG.physics;
const MASS = P.carMass;
const DT = 1 / CONFIG.game.tickRate;
const TICK_SCALE = DT / (1 / 120);

const curve = {
  steer: new Curve(V.steerAngleCurve),
  powerslideSteer: new Curve(V.powerslideSteerAngleCurve),
  driveTorque: new Curve(V.driveSpeedTorqueCurve),
  nonSticky: new Curve(V.nonStickyFrictionCurve),
  lat: new Curve(V.latFrictionCurve),
  long: new Curve([]),
  hbLat: new Curve(V.handbrakeLatFrictionCurve),
  hbLong: new Curve(V.handbrakeLongFrictionCurve),
};

// Scratch vectors (no allocations in the tick loop).
const t0 = new THREE.Vector3();
const t1 = new THREE.Vector3();
const t2 = new THREE.Vector3();
const t3 = new THREE.Vector3();
const t4 = new THREE.Vector3();
const tq = new THREE.Quaternion();
const s1 = new THREE.Vector3(); // reserved for the impulse helpers below
const s2 = new THREE.Vector3();
const sq = new THREE.Quaternion();
const rayOrigin = { x: 0, y: 0, z: 0 };
const rayDir = { x: 0, y: 0, z: 0 };

export class Controls {
  constructor() {
    this.throttle = 0;
    this.steer = 0;
    this.pitch = 0;
    this.yaw = 0;
    this.roll = 0;
    this.jump = false;
    this.boost = false;
    this.handbrake = false;
  }
  copy(o) {
    this.throttle = o.throttle; this.steer = o.steer; this.pitch = o.pitch; this.yaw = o.yaw; this.roll = o.roll;
    this.jump = o.jump; this.boost = o.boost; this.handbrake = o.handbrake;
    return this;
  }
  reset() {
    this.throttle = this.steer = this.pitch = this.yaw = this.roll = 0;
    this.jump = this.boost = this.handbrake = false;
    return this;
  }
}

class Wheel {
  constructor(front, rightSide, hb) {
    const w = front ? hb.frontWheel : hb.backWheel;
    this.front = front;
    this.rightSide = rightSide;
    this.radius = w.radius * UU;
    this.restLength = (w.suspensionRest - V.maxSuspensionTravel) * UU;
    this.travel = V.maxSuspensionTravel * UU;
    this.connection = new THREE.Vector3(w.offset[0] * UU, w.offset[2] * UU, (rightSide ? 1 : -1) * w.offset[1] * UU);
    this.forceScale = front ? V.suspensionForceScaleFront : V.suspensionForceScaleBack;
    this.steerAngle = 0;
    this.hardPoint = new THREE.Vector3();
    this.contactPoint = new THREE.Vector3();
    this.contactNormal = new THREE.Vector3(0, 1, 0);
    this.inContact = false;
    this.inContactWithWorld = false;
    this.groundBody = null; // non-null when touching a dynamic body (ball or car)
    this.suspensionLength = this.restLength + this.travel;
    this.suspRelVel = 0;
    this.clippedInv = 1;
    this.extraPushback = 0;
    this.latFriction = 1;
    this.longFriction = 1;
    this.engineForce = 0;
    this.brake = 0;
    this.impulse = new THREE.Vector3();
    this.spin = 0; // visual wheel rotation angle
  }
}

export class CarPhysics {
  // hitbox: one of CONFIG.hitboxes (defaults to the standard shape).
  constructor(pw, { id, team, hitbox = CC }) {
    this.pw = pw;
    this.id = id;
    this.team = team;
    this.hitbox = hitbox;
    const hs = hitbox.hitboxSize;
    const ho = hitbox.hitboxOffset;
    this.halfExtents = new THREE.Vector3((hs[0] / 2) * UU, (hs[2] / 2) * UU, (hs[1] / 2) * UU);
    this.hitboxOffset = new THREE.Vector3(ho[0] * UU, ho[2] * UU, ho[1] * UU);
    const lx = hs[0] * UU;
    const ly = hs[2] * UU;
    const lz = hs[1] * UU;
    // Box inertia of the hitbox, centered on the car origin (as in RocketSim).
    this.inertia = new THREE.Vector3((MASS / 12) * (ly * ly + lz * lz), (MASS / 12) * (lx * lx + lz * lz), (MASS / 12) * (lx * lx + ly * ly));
    this.invInertia = new THREE.Vector3(1 / this.inertia.x, 1 / this.inertia.y, 1 / this.inertia.z);

    const world = pw.world;
    const bd = R.RigidBodyDesc.dynamic()
      .setAdditionalMassProperties(MASS, { x: 0, y: 0, z: 0 }, { x: this.inertia.x, y: this.inertia.y, z: this.inertia.z }, { x: 0, y: 0, z: 0, w: 1 })
      .setCanSleep(false)
      .setCcdEnabled(true);
    this.body = world.createRigidBody(bd);
    const he = this.halfExtents;
    const off = this.hitboxOffset;
    this.collider = world.createCollider(
      R.ColliderDesc.cuboid(he.x, he.y, he.z)
        .setTranslation(off.x, off.y, off.z)
        .setDensity(0)
        .setFriction(P.carBallFriction)
        .setFrictionCombineRule(R.CoefficientCombineRule.Min)
        .setRestitution(P.carBallRestitution)
        .setRestitutionCombineRule(R.CoefficientCombineRule.Min)
        .setCollisionGroups(COLLIDER_GROUPS.car)
        .setSolverGroups(COLLIDER_GROUPS.car),
      this.body,
    );
    this.ccCollider = world.createCollider(
      R.ColliderDesc.cuboid(he.x, he.y, he.z)
        .setTranslation(off.x, off.y, off.z)
        .setDensity(0)
        .setFriction(P.carCarFriction)
        .setFrictionCombineRule(R.CoefficientCombineRule.Average)
        .setRestitution(P.carCarRestitution)
        .setRestitutionCombineRule(R.CoefficientCombineRule.Average)
        .setCollisionGroups(COLLIDER_GROUPS.carcar)
        .setSolverGroups(COLLIDER_GROUPS.carcar),
      this.body,
    );

    // Wheel order matches RocketSim: front-right, front-left, back-right, back-left.
    this.wheels = [new Wheel(true, true, hitbox), new Wheel(true, false, hitbox), new Wheel(false, true, hitbox), new Wheel(false, false, hitbox)];

    // Cached kinematic state, refreshed from Rapier each tick.
    this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.vel = new THREE.Vector3();
    this.angVel = new THREE.Vector3();
    this.fwd = new THREE.Vector3(1, 0, 0);
    this.up = new THREE.Vector3(0, 1, 0);
    this.right = new THREE.Vector3(0, 0, 1);
    this.force = new THREE.Vector3(); // accumulated this tick, integrated with the step
    this.angAccel = new THREE.Vector3();
    this.velImpulseCache = new THREE.Vector3(); // bumps, applied after the step

    this.controls = new Controls();
    this.lastControls = new Controls();
    this.infiniteBoost = false;
    this.resetState();
  }

  resetState() {
    this.isOnGround = true;
    this.gotFlipReset = false;
    this.numWheelsInContact = 4;
    this.hasJumped = false;
    this.hasDoubleJumped = false;
    this.hasFlipped = false;
    this.flipRoll = 0; // dodge direction, right component
    this.flipPitch = 0; // dodge direction, forward component
    this.jumpTime = 0;
    this.flipTime = 0;
    this.isFlipping = false;
    this.isJumping = false;
    this.airTime = 0;
    this.airTimeSinceJump = 0;
    this.boost = CONFIG.game.spawnBoost;
    this.timeSinceBoosted = 0;
    this.isBoosting = false;
    this.boostingTime = 0;
    this.isSupersonic = false;
    this.supersonicTime = 0;
    this.handbrakeVal = 0;
    this.isAutoFlipping = false;
    this.autoFlipTimer = 0;
    this.autoFlipTorqueScale = 0;
    this.worldContact = { hasContact: false, normal: new THREE.Vector3(0, 1, 0) };
    this.carContact = { otherCarId: -1, cooldownTimer: 0 };
    this.isDemoed = false;
    this.demoRespawnTimer = 0;
    this.lastExtraHitTick = -10;
    this.velImpulseCache.set(0, 0, 0);
    this.forwardSpeed = 0;
    this.events = [];
    for (const w of this.wheels) {
      w.suspensionLength = w.restLength;
      w.inContact = false;
      w.latFriction = 1;
      w.longFriction = 1;
      w.engineForce = 0;
      w.brake = 0;
      w.steerAngle = 0;
    }
  }

  // Place the car. pos in meters (three axes), yaw around +y (0 = facing +x).
  place(pos, yawRad, boost = CONFIG.game.spawnBoost) {
    this.resetState();
    this.boost = boost;
    // Facing direction in world: (cos yaw, 0, sin yaw) in three axes where the RL yaw is measured in the x-y plane.
    tq.setFromAxisAngle(t0.set(0, 1, 0), -yawRad);
    this.body.setEnabled(true);
    this.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
    this.body.setRotation({ x: tq.x, y: tq.y, z: tq.z, w: tq.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.readState();
  }

  readState() {
    const b = this.body;
    const p = b.translation();
    const q = b.rotation();
    const v = b.linvel();
    const w = b.angvel();
    this.pos.set(p.x, p.y, p.z);
    this.quat.set(q.x, q.y, q.z, q.w);
    this.vel.set(v.x, v.y, v.z);
    this.angVel.set(w.x, w.y, w.z);
    this.fwd.set(1, 0, 0).applyQuaternion(this.quat);
    this.up.set(0, 1, 0).applyQuaternion(this.quat);
    this.right.set(0, 0, 1).applyQuaternion(this.quat);
  }

  writeVelocities() {
    this.body.setLinvel({ x: this.vel.x, y: this.vel.y, z: this.vel.z }, true);
    this.body.setAngvel({ x: this.angVel.x, y: this.angVel.y, z: this.angVel.z }, true);
  }

  // World-space inverse inertia applied to a vector (out = I^-1 * v).
  applyInvInertia(v, out) {
    sq.copy(this.quat).invert();
    out.copy(v).applyQuaternion(sq);
    out.x *= this.invInertia.x;
    out.y *= this.invInertia.y;
    out.z *= this.invInertia.z;
    return out.applyQuaternion(this.quat);
  }

  // Impulse denominator for a unit direction n at offset r from the center of mass.
  impulseDenominator(r, n) {
    s1.crossVectors(r, n);
    this.applyInvInertia(s1, s2);
    return 1 / MASS + s1.dot(s2);
  }

  applyImpulseAt(impulse, r) {
    this.vel.addScaledVector(impulse, 1 / MASS);
    s1.crossVectors(r, impulse);
    this.applyInvInertia(s1, s2);
    this.angVel.add(s2);
  }

  velocityAt(r, out) {
    return out.crossVectors(this.angVel, r).add(this.vel);
  }

  // ---------------------------------------------------------------- tick, part 1 (before the step)
  preTick(tick) {
    this.events.length = 0;
    if (this.isDemoed) {
      this.demoRespawnTimer = Math.max(this.demoRespawnTimer - DT, 0);
      return;
    }
    this.readState();
    this.force.set(0, 0, 0);
    this.angAccel.set(0, 0, 0);
    const c = this.controls;

    // Vehicle update, first half: wheel rays and friction impulses (uses last tick's wheel settings).
    for (const w of this.wheels) this.rayCast(w);
    this.calcFrictionImpulses();

    const jumpPressed = c.jump && !this.lastControls.jump;
    let n = 0;
    for (const w of this.wheels) if (w.inContact) n++;
    const wasOnGround = this.isOnGround;
    this.numWheelsInContact = n;
    this.isOnGround = n >= 3;
    if (this.isOnGround && !wasOnGround && this.airTime > 0.1) this.events.push({ type: 'land', speed: -this.vel.dot(this.up) });
    // Flip reset: wheels land on the ball (or a car) mid-air after the jump was used, which refreshes it.
    if (this.isOnGround) {
      let onWorld = false;
      for (const w of this.wheels) if (w.inContactWithWorld) onWorld = true;
      if (onWorld) this.gotFlipReset = false;
      else if (!wasOnGround && (this.hasJumped || this.hasFlipped || this.hasDoubleJumped || this.airTime > 0.3)) {
        this.gotFlipReset = true;
        this.events.push({ type: 'flipReset' });
      }
    }

    const forwardSpeed = this.vel.dot(this.fwd);
    this.forwardSpeed = forwardSpeed;
    this.updateWheels(n, forwardSpeed / UU);

    if (n < 3) this.updateAirTorque(n === 0);
    else this.isFlipping = false;

    this.updateJump(jumpPressed);
    this.updateAutoFlip(jumpPressed);
    this.updateDoubleJumpOrFlip(jumpPressed, forwardSpeed / UU);

    if (c.throttle && ((n > 0 && n < 4) || this.worldContact.hasContact)) this.updateAutoRoll(n);
    this.worldContact.hasContact = false;

    // Vehicle update, second half: suspension and friction impulses.
    this.updateSuspension();
    this.applyFrictionImpulses();

    this.updateBoost();

    // Integrate this tick's forces into velocity (gravity is added by Rapier).
    this.vel.addScaledVector(this.force, DT / MASS);
    this.angVel.addScaledVector(this.angAccel, DT);
    this.writeVelocities();
    void tick;
  }

  rayCast(w) {
    w.hardPoint.copy(w.connection).applyQuaternion(this.quat).add(this.pos);
    w.inContact = false;
    w.inContactWithWorld = false;
    w.groundBody = null;
    const rayLen = w.restLength + w.travel + w.radius - V.suspensionSubtraction * UU;
    rayOrigin.x = w.hardPoint.x; rayOrigin.y = w.hardPoint.y; rayOrigin.z = w.hardPoint.z;
    rayDir.x = -this.up.x; rayDir.y = -this.up.y; rayDir.z = -this.up.z;
    const hit = this.pw.castRay(rayOrigin, rayDir, rayLen, COLLIDER_GROUPS.wheelRay, this.body);
    if (hit) {
      const toi = hit.timeOfImpact;
      w.contactPoint.copy(w.hardPoint).addScaledVector(this.up, -toi);
      w.contactNormal.set(hit.normal.x, hit.normal.y, hit.normal.z);
      // Rays that start inside the ball report a zero normal; use the car's up in that case.
      if (w.contactNormal.lengthSq() < 0.5) w.contactNormal.copy(this.up);
      w.inContact = true;
      const isStatic = hit.collider.handle === this.pw.arenaHandle;
      w.inContactWithWorld = isStatic;
      w.groundBody = isStatic ? null : hit.collider.parent();

      const traceLen = t0.subVectors(w.hardPoint, w.contactPoint).dot(this.up);
      w.suspensionLength = clamp(traceLen - w.radius, w.restLength - w.travel, w.restLength + w.travel);

      const denom = w.contactNormal.dot(this.up);
      t1.subVectors(w.contactPoint, this.pos);
      this.velocityAt(t1, t2);
      const projVel = w.contactNormal.dot(t2);
      if (denom > 0.1) {
        w.suspRelVel = projVel / denom;
        w.clippedInv = 1 / denom;
      } else {
        w.suspRelVel = 0;
        w.clippedInv = 10;
      }

      w.extraPushback = 0;
      if (isStatic) {
        // Hard stop when the suspension bottoms out (Bullet's resolveSingleCollision with erp 0.2).
        const thresh = w.restLength + w.radius - V.suspensionSubtraction * UU;
        if (traceLen < thresh) {
          const dist = traceLen - thresh;
          const relVel = w.contactNormal.dot(t2);
          const posErr = (0.2 * -dist) / DT;
          const velErr = -relVel;
          const denomImp = this.impulseDenominator(t1, w.contactNormal);
          const imp = Math.max(0, (posErr + velErr) / denomImp);
          w.extraPushback = imp / this.wheels.length;
        }
      }
    } else {
      w.suspensionLength = w.restLength + w.travel;
      w.suspRelVel = 0;
      w.contactNormal.copy(this.up);
      w.clippedInv = 1;
      w.extraPushback = 0;
    }
  }

  wheelAxes(w, outFwd, outRight) {
    const s = Math.sin(w.steerAngle);
    const co = Math.cos(w.steerAngle);
    outFwd.copy(this.fwd).multiplyScalar(co).addScaledVector(this.right, s);
    outRight.copy(this.right).multiplyScalar(co).addScaledVector(this.fwd, -s);
  }

  calcFrictionImpulses() {
    const frictionScale = MASS / 3;
    for (const w of this.wheels) {
      w.impulse.set(0, 0, 0);
      if (!w.inContact) continue;
      const nrm = w.contactNormal;
      this.wheelAxes(w, t0, t1); // t1 = steered right axis
      const axle = t1.addScaledVector(nrm, -t1.dot(nrm));
      if (axle.lengthSq() < 1e-9) continue;
      axle.normalize();
      const longDir = t2.crossVectors(nrm, axle).normalize(); // wheel forward along the surface

      const rel = t3.subVectors(w.contactPoint, this.pos);
      const vCar = t4.crossVectors(this.angVel, rel).add(this.vel);
      let groundVelX = 0, groundVelY = 0, groundVelZ = 0;
      let groundDen = 0;
      if (w.groundBody) {
        const gv = w.groundBody.velocityAtPoint({ x: w.contactPoint.x, y: w.contactPoint.y, z: w.contactPoint.z });
        groundVelX = gv.x; groundVelY = gv.y; groundVelZ = gv.z;
        groundDen = w.groundBody.invMass();
      }
      const relX = vCar.x - groundVelX;
      const relY = vCar.y - groundVelY;
      const relZ = vCar.z - groundVelZ;
      const relLat = relX * axle.x + relY * axle.y + relZ * axle.z;
      const den = this.impulseDenominator(rel, axle) + groundDen;
      const sideImpulse = (-V.sideFrictionDamping * relLat) / den;

      let rolling = 0;
      if (w.engineForce === 0) {
        if (w.brake) {
          const relLong = relX * longDir.x + relY * longDir.y + relZ * longDir.z;
          rolling = clamp(-relLong * V.rollingFrictionMagic, -w.brake, w.brake);
        }
      } else {
        rolling = w.engineForce / frictionScale;
      }
      w.impulse.copy(longDir).multiplyScalar(rolling * w.longFriction * frictionScale)
        .addScaledVector(axle, sideImpulse * w.latFriction * frictionScale);
    }
  }

  updateSuspension() {
    for (const w of this.wheels) {
      if (!w.inContact) continue;
      let force = (w.restLength - w.suspensionLength) * V.suspensionStiffness * w.clippedInv;
      const dampScale = w.suspRelVel < 0 ? V.dampingCompression : V.dampingRelaxation;
      force -= dampScale * w.suspRelVel;
      force *= w.forceScale;
      if (force < 0) force = 0;
      const mag = force * DT + w.extraPushback;
      if (mag === 0) continue;
      t0.copy(w.contactNormal).multiplyScalar(mag);
      t1.subVectors(w.contactPoint, this.pos);
      this.applyImpulseAt(t0, t1);
    }
  }

  applyFrictionImpulses() {
    for (const w of this.wheels) {
      if (w.impulse.lengthSq() === 0) continue;
      // Applied at the height of the center of mass so tire grip never pitches or rolls the car.
      t1.subVectors(w.contactPoint, this.pos);
      t1.addScaledVector(this.up, -this.up.dot(t1));
      t0.copy(w.impulse).multiplyScalar(DT);
      this.applyImpulseAt(t0, t1);
    }
  }

  updateWheels(numWheelsInContact, forwardSpeedUU) {
    const c = this.controls;
    const absFwd = Math.abs(forwardSpeedUU);
    let worldContact = false;
    for (const w of this.wheels) worldContact = worldContact || w.inContactWithWorld;

    this.handbrakeVal += (c.handbrake ? V.powerslideRiseRate : -V.powerslideFallRate) * DT;
    this.handbrakeVal = clamp(this.handbrakeVal, 0, 1);

    let realThrottle = c.throttle;
    let realBrake = 0;
    if (c.boost && this.boost > 0) realThrottle = 1;

    let driveSpeedScale = curve.driveTorque.get(absFwd);
    let engineThrottle = realThrottle;
    if (!c.handbrake) {
      if (Math.abs(realThrottle) >= V.throttleDeadzone) {
        if (absFwd > V.stoppingForwardVel && sign(realThrottle) !== sign(forwardSpeedUU)) {
          realBrake = 1;
          if (absFwd > V.brakingNoThrottleSpeedThresh) engineThrottle = 0;
        }
      } else {
        engineThrottle = 0;
        realBrake = absFwd < V.stoppingForwardVel ? 1 : V.coastingBrakeFactor;
      }
    }
    if (numWheelsInContact < 3) driveSpeedScale /= 4;
    const engineForce = engineThrottle * (V.throttleTorque * MASS * UU) * driveSpeedScale;
    const brakeForce = realBrake * (V.brakeTorque * MASS * UU);
    for (const w of this.wheels) {
      w.engineForce = engineForce;
      w.brake = brakeForce;
    }

    let steerAngle = curve.steer.get(absFwd);
    if (this.handbrakeVal) steerAngle += (curve.powerslideSteer.get(absFwd) - steerAngle) * this.handbrakeVal;
    steerAngle *= c.steer;
    this.wheels[0].steerAngle = steerAngle;
    this.wheels[1].steerAngle = steerAngle;

    for (const w of this.wheels) {
      if (!w.inContact) continue;
      this.wheelAxes(w, t0, t1); // t0 steered forward, t1 steered right (lateral)
      const latDir = t1;
      const longDir = t2.crossVectors(w.contactNormal, latDir); // forward along the surface
      t3.subVectors(w.hardPoint, this.pos);
      const vel = t4.crossVectors(this.angVel, t3).add(this.vel);
      let input = 0;
      const baseFriction = Math.abs(vel.dot(latDir)) / UU;
      if (baseFriction > 5) input = baseFriction / (Math.abs(vel.dot(longDir)) / UU + baseFriction);
      let lat = curve.lat.get(input);
      let long = curve.long.get(input);
      if (this.handbrakeVal) {
        const hb = this.handbrakeVal;
        lat *= (curve.hbLat.get(input) - 1) * hb + 1;
        long *= (curve.hbLong.get(input) - 1) * hb + 1;
      } else {
        long = 1;
      }
      if (realThrottle === 0) {
        const s = curve.nonSticky.get(w.contactNormal.y);
        lat *= s;
        long *= s;
      }
      w.latFriction = lat;
      w.longFriction = long;
    }

    // Sticky force: pulls the car into whatever surface its wheels touch (this is what lets it drive on walls).
    if (worldContact) {
      const upDir = this.upwardsFromWheelContacts(t0);
      const fullStick = realThrottle !== 0 || absFwd > V.stoppingForwardVel;
      let scale = 0.5;
      if (fullStick) scale += 1 - Math.abs(upDir.y);
      this.force.addScaledVector(upDir, -scale * Math.abs(P.gravityZ) * UU * MASS);
    }
    this.realThrottle = realThrottle;
  }

  upwardsFromWheelContacts(out) {
    out.set(0, 0, 0);
    let any = false;
    for (const w of this.wheels) {
      if (w.inContact) {
        out.add(w.contactNormal);
        any = true;
      }
    }
    if (!any || out.lengthSq() < 1e-9) return out.copy(this.up);
    return out.normalize();
  }

  updateBoost() {
    const c = this.controls;
    if (this.boost > 0) {
      if (this.isBoosting) this.isBoosting = c.boost || this.boostingTime < BOOST.minTime;
      else if (c.boost) this.isBoosting = true;
    } else {
      this.isBoosting = false;
    }
    if (this.isBoosting) this.boostingTime += DT;
    else this.boostingTime = 0;
    if (this.isBoosting) {
      if (!this.infiniteBoost) this.boost = Math.max(this.boost - BOOST.usedPerSecond * DT, 0);
      const accel = (this.isOnGround ? BOOST.accelGround : BOOST.accelAir) * UU;
      this.force.addScaledVector(this.fwd, accel * MASS);
      this.timeSinceBoosted = 0;
    } else {
      this.timeSinceBoosted += DT;
    }
    if (this.infiniteBoost) this.boost = BOOST.max;
    this.boost = Math.min(this.boost, BOOST.max);
  }

  updateJump(jumpPressed) {
    const c = this.controls;
    if (this.isOnGround && !this.isJumping) {
      if (this.hasJumped && this.jumpTime < JUMP.minTime + JUMP.resetTimePad) {
        // Still leaving the ground after a minimum-length jump; keep the jump state.
      } else {
        this.hasJumped = false;
        this.jumpTime = 0;
      }
    }
    if (this.isJumping) {
      this.isJumping = this.jumpTime < JUMP.minTime || (c.jump && this.jumpTime < JUMP.maxTime);
    } else if (this.isOnGround && jumpPressed) {
      this.isJumping = true;
      this.jumpTime = 0;
      this.vel.addScaledVector(this.up, JUMP.immediateForce * UU);
      this.events.push({ type: 'jump' });
    }
    if (this.isJumping) {
      this.hasJumped = true;
      let accel = JUMP.accel * UU;
      if (this.jumpTime < JUMP.minTime) accel *= JUMP.preMinAccelScale;
      this.force.addScaledVector(this.up, accel * MASS);
    }
    if (this.isJumping || this.hasJumped) this.jumpTime += DT;
  }

  updateAirTorque(updateAirControl) {
    const c = this.controls;
    let doAirControl = false;
    if (this.isFlipping) this.isFlipping = this.hasFlipped && this.flipTime < FLIP.torqueTime;

    if (this.isFlipping) {
      if (this.flipRoll !== 0 || this.flipPitch !== 0) {
        // Flip cancel: holding the stick against a front/back flip stops its rotation.
        let pitchScale = 1;
        if (this.flipPitch !== 0 && c.pitch !== 0 && sign(this.flipPitch) === sign(c.pitch)) {
          pitchScale = 1 - Math.min(Math.abs(c.pitch), 1);
          doAirControl = true;
        }
        const rollAcc = this.flipRoll * FLIP.torqueX;
        const pitchAcc = -this.flipPitch * pitchScale * FLIP.torqueY;
        this.angAccel.addScaledVector(this.fwd, rollAcc).addScaledVector(this.right, pitchAcc);
      } else {
        doAirControl = true; // stall
      }
    } else {
      doAirControl = true;
    }

    doAirControl = doAirControl && !this.isAutoFlipping && updateAirControl;
    if (doAirControl) {
      let pitchTorqueScale = 1;
      t0.set(0, 0, 0);
      if (c.pitch || c.yaw || c.roll) {
        if (this.isFlipping) pitchTorqueScale = 0;
        else if (this.hasFlipped && this.flipTime < FLIP.torqueTime + FLIP.pitchlockExtraTime) pitchTorqueScale = 0;
        t0.addScaledVector(this.right, c.pitch * pitchTorqueScale * AIR.torque.pitch);
        t0.addScaledVector(this.up, -c.yaw * AIR.torque.yaw);
        t0.addScaledVector(this.fwd, c.roll * AIR.torque.roll);
      }
      const w = this.angVel;
      const dampPitch = this.right.dot(w) * AIR.damping.pitch * (1 - Math.abs(c.pitch * pitchTorqueScale));
      const dampYaw = -this.up.dot(w) * AIR.damping.yaw * (1 - Math.abs(c.yaw));
      const dampRoll = this.fwd.dot(w) * AIR.damping.roll;
      t0.addScaledVector(this.right, -dampPitch);
      t0.addScaledVector(this.up, dampYaw); // -(-up * dampYaw)
      t0.addScaledVector(this.fwd, -dampRoll);
      this.angAccel.addScaledVector(t0, AIR.torqueScale);
    }
    if (c.throttle !== 0) this.force.addScaledVector(this.fwd, c.throttle * V.throttleAirAccel * UU * MASS);
  }

  updateDoubleJumpOrFlip(jumpPressed, forwardSpeedUU) {
    const c = this.controls;
    if (this.isOnGround) {
      this.hasDoubleJumped = false;
      this.hasFlipped = false;
      this.airTime = 0;
      this.airTimeSinceJump = 0;
      this.flipTime = 0;
    } else {
      this.airTime += DT;
      if (this.hasJumped && !this.isJumping) this.airTimeSinceJump += DT;
      else this.airTimeSinceJump = 0;

      if (jumpPressed && this.airTimeSinceJump < JUMP.doubleJumpMaxDelay) {
        const inputMag = Math.abs(c.yaw) + Math.abs(c.pitch) + Math.abs(c.roll);
        const isFlipInput = inputMag >= CC.dodgeDeadzone;
        let canUse = !this.hasDoubleJumped && !this.hasFlipped;
        if (this.isAutoFlipping) canUse = false;
        if (canUse) {
          if (isFlipInput) {
            this.flipTime = 0;
            this.hasFlipped = true;
            this.isFlipping = true;
            const ratio = Math.abs(forwardSpeedUU) / P.carMaxSpeed;
            let df = -c.pitch; // forward component
            let dr = c.yaw + c.roll; // right component
            if (Math.abs(dr) < 0.1 && Math.abs(df) < 0.1) {
              df = 0;
              dr = 0;
            } else {
              const len = Math.hypot(df, dr);
              df /= len;
              dr /= len;
            }
            this.flipRoll = dr / TICK_SCALE;
            this.flipPitch = df / TICK_SCALE;
            if (Math.abs(df) < 0.1) df = 0;
            if (Math.abs(dr) < 0.1) dr = 0;
            if (df !== 0 || dr !== 0) {
              const backwards = Math.abs(forwardSpeedUU) < 100 ? df < 0 : (df >= 0) !== (forwardSpeedUU >= 0);
              let vx = df * FLIP.initialVelScale;
              let vy = dr * FLIP.initialVelScale;
              const maxScaleX = backwards ? FLIP.backwardImpulseMaxSpeedScale : FLIP.forwardImpulseMaxSpeedScale;
              vx *= (maxScaleX - 1) * ratio + 1;
              vy *= (FLIP.sideImpulseMaxSpeedScale - 1) * ratio + 1;
              if (backwards) vx *= FLIP.backwardImpulseScaleX;
              const f2 = t0.set(this.fwd.x, 0, this.fwd.z);
              if (f2.lengthSq() < 1e-9) f2.set(1, 0, 0);
              f2.normalize();
              const r2 = t1.set(-f2.z, 0, f2.x); // forward x up in this frame
              this.vel.addScaledVector(f2, vx * UU).addScaledVector(r2, vy * UU);
            }
            this.events.push({ type: 'flip', forward: df, right: dr });
          } else {
            this.vel.addScaledVector(this.up, JUMP.immediateForce * UU);
            this.hasDoubleJumped = true;
            this.events.push({ type: 'doubleJump' });
          }
        }
      }
    }

    if (this.isFlipping) {
      this.flipTime += DT;
      if (this.flipTime <= FLIP.torqueTime) {
        if (this.flipTime >= FLIP.zDampStart && (this.vel.y < 0 || this.flipTime < FLIP.zDampEnd)) {
          this.vel.y *= Math.pow(1 - FLIP.zDamp120, TICK_SCALE);
        }
      }
    } else if (this.hasFlipped) {
      this.flipTime += DT;
    }
  }

  // Roll angle around the forward axis: 0 upright, positive = rolled right, +-PI = on the roof.
  rollAngle() {
    return Math.atan2(-this.right.y, this.up.y);
  }

  updateAutoFlip(jumpPressed) {
    const A = CONFIG.autoflip;
    if (jumpPressed && this.worldContact.hasContact && this.worldContact.normal.y > A.normZThresh) {
      const roll = this.rollAngle();
      const absRoll = Math.abs(roll);
      if (absRoll > A.rollThresh) {
        this.autoFlipTimer = A.time * (absRoll / Math.PI);
        this.autoFlipTorqueScale = roll > 0 ? 1 : -1;
        this.isAutoFlipping = true;
        this.vel.addScaledVector(this.up, -A.impulse * UU);
      }
    }
    if (this.isAutoFlipping) {
      if (this.autoFlipTimer <= 0) {
        this.isAutoFlipping = false;
        this.autoFlipTimer = 0;
      } else {
        // Roll back toward upright the short way.
        this.angVel.addScaledVector(this.fwd, -A.torque * this.autoFlipTorqueScale * DT);
        this.autoFlipTimer -= DT;
      }
    }
  }

  updateAutoRoll(numWheelsInContact) {
    const A = CONFIG.autoroll;
    const groundUp = numWheelsInContact > 0 ? this.upwardsFromWheelContacts(t0) : t0.copy(this.worldContact.normal);
    const crossRight = t1.crossVectors(this.fwd, groundUp);
    const crossForward = t2.crossVectors(groundUp, crossRight);
    const rightFactor = 1 - clamp(this.right.dot(crossRight), 0, 1);
    const forwardFactor = 1 - clamp(this.fwd.dot(crossForward), 0, 1);
    const rollDir = this.right.dot(groundUp) >= 0 ? 1 : -1;
    const pitchDir = this.fwd.dot(groundUp) >= 0 ? -1 : 1;
    this.force.addScaledVector(groundUp, -A.force * UU * MASS);
    this.angAccel.addScaledVector(this.fwd, rollDir * rightFactor * A.torque);
    this.angAccel.addScaledVector(this.right, pitchDir * forwardFactor * A.torque);
  }

  // ---------------------------------------------------------------- tick, part 2 (after the step)
  postTick() {
    if (this.isDemoed) return;
    this.readState();
    const speedUU = this.vel.length() / UU;
    if (this.isSupersonic && this.supersonicTime < P.supersonicMaintainTime) {
      this.isSupersonic = speedUU >= P.supersonicMaintainMin;
    } else {
      this.isSupersonic = speedUU >= P.supersonicStart;
    }
    this.supersonicTime = this.isSupersonic ? this.supersonicTime + DT : 0;
    if (this.carContact.cooldownTimer > 0) this.carContact.cooldownTimer = Math.max(this.carContact.cooldownTimer - DT, 0);
    this.lastControls.copy(this.controls);
  }

  finishTick() {
    if (this.isDemoed) return;
    if (this.velImpulseCache.lengthSq() > 0) {
      this.vel.add(this.velImpulseCache);
      this.velImpulseCache.set(0, 0, 0);
    }
    const maxV = P.carMaxSpeed * UU;
    if (this.vel.lengthSq() > maxV * maxV) this.vel.setLength(maxV);
    if (this.angVel.lengthSq() > P.carMaxAngSpeed * P.carMaxAngSpeed) this.angVel.setLength(P.carMaxAngSpeed);
    this.writeVelocities();
  }

  demolish() {
    this.isDemoed = true;
    this.demoRespawnTimer = CONFIG.bump.demoRespawnTime;
    this.body.setEnabled(false);
  }

  // Convenience for gameplay code.
  get speed() {
    return this.vel.length();
  }

  hasFlipOrJump() {
    return this.isOnGround || (!this.hasFlipped && !this.hasDoubleJumped && this.airTimeSinceJump < JUMP.doubleJumpMaxDelay);
  }

  hasFlipReset() {
    return !this.isOnGround && this.gotFlipReset && this.hasFlipOrJump() && !this.hasJumped;
  }
}
