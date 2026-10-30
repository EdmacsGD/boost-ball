// Headless simulation: arena, ball, cars and boost pads, stepped at 120 Hz.
// Tick order follows RocketSim's Arena::Step so the game behaves like the original:
// car pre-tick -> physics step -> contact rules (ball hits, bumps, demos) -> post-tick -> pads -> goal check.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { UU, Curve, rl } from '../util/math.js';
import { PhysicsWorld } from './world.js';
import { BallPhysics } from './ball.js';
import { CarPhysics } from './car.js';

const DT = 1 / CONFIG.game.tickRate;
const HIT = CONFIG.ballHit;
const BUMP = CONFIG.bump;
const PADS = CONFIG.boostPads;
const hitCurve = new Curve(HIT.factorCurve);
const bumpGround = new Curve(BUMP.groundCurve);
const bumpAir = new Curve(BUMP.airCurve);
const bumpUp = new Curve(BUMP.upwardCurve);
const TOUCH_DIST = 0.01; // meters; contacts closer than this count as touching

const v0 = new THREE.Vector3();
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const lp = new THREE.Vector3();

class BoostPad {
  constructor(def, big, index) {
    this.index = index;
    this.big = big;
    this.pos = rl(def[0], def[1], def[2]);
    const rad = (big ? PADS.boxRadBig : PADS.boxRadSmall) * UU;
    this.boxMin = new THREE.Vector3(this.pos.x - rad, this.pos.y, this.pos.z - rad);
    this.boxMax = new THREE.Vector3(this.pos.x + rad, this.pos.y + PADS.boxHeight * UU, this.pos.z + rad);
    this.cylRad = (big ? PADS.cylRadBig : PADS.cylRadSmall) * UU;
    this.cylHeight = PADS.cylHeight * UU;
    this.cooldown = 0;
    this.active = true;
    this.lockedCar = null;
    this.prevLockedCarId = -1;
  }
}

export class Simulation {
  constructor() {
    this.pw = new PhysicsWorld();
    this.ball = new BallPhysics(this.pw);
    this.cars = [];
    this.pads = [
      ...PADS.big.map((d, i) => new BoostPad(d, true, i)),
      ...PADS.small.map((d, i) => new BoostPad(d, false, PADS.big.length + i)),
    ];
    this.tick = 0;
    this.events = [];
    this.nextCarId = 0;
    this.goalScored = -1; // team that scored this tick, or -1
    this.freezeCars = false; // kickoff countdown: cars cannot move
    this.goalDetection = true;
    this.padsEnabled = true; // off in the endless Sky Field (there are no pads there)
    this.lastTouch = null; // { carId, team, tick, speed }
    this.touchState = new Map(); // carId -> touching ball last tick
    this.ballSnapPos = new THREE.Vector3();
    this.ballSnapVel = new THREE.Vector3();
  }

  addCar(team, hitboxKey = 'standard') {
    const hitbox = CONFIG.hitboxes[hitboxKey] || CONFIG.hitboxes.standard;
    const car = new CarPhysics(this.pw, { id: this.nextCarId++, team, hitbox });
    car.hitboxKey = hitboxKey;
    this.cars.push(car);
    return car;
  }

  removeCar(car) {
    this.pw.world.removeRigidBody(car.body);
    this.cars = this.cars.filter((c) => c !== car);
  }

  // Kickoff layout: random spawn slots, mirrored for orange so both teams get the same kickoff.
  setupKickoff(rand = Math.random) {
    const spawns = CONFIG.spawns.kickoff;
    const order = [0, 1, 2, 3, 4];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    // The original fills corners first in bigger matches; prefer slot order that spreads cars out.
    const blue = this.cars.filter((c) => c.team === 0);
    const orange = this.cars.filter((c) => c.team === 1);
    const n = Math.max(blue.length, orange.length);
    const chosen = n <= 1 ? [order[0]] : n === 2 ? (rand() < 0.5 ? [0, 1] : [2, 3]) : [0, 1, 4];
    const place = (car, slot, mirror) => {
      const s = spawns[slot];
      const x = mirror ? -s[0] : s[0];
      const y = mirror ? -s[1] : s[1];
      const yaw = mirror ? s[2] + Math.PI : s[2];
      car.place(rl(x, y, CONFIG.car.spawnRestZ), yaw, CONFIG.game.spawnBoost);
    };
    blue.forEach((c, i) => place(c, chosen[i % chosen.length], false));
    orange.forEach((c, i) => place(c, chosen[i % chosen.length], true));
    this.ball.place(new THREE.Vector3(0, this.ball.radius + 0.0001, 0));
    for (const pad of this.pads) {
      pad.cooldown = 0;
      pad.active = true;
      pad.prevLockedCarId = -1;
    }
    this.lastTouch = null;
    this.touchState.clear();
    this.pw.syncQueries();
  }

  respawnCar(car) {
    const list = CONFIG.spawns.respawn;
    const s = list[Math.floor(Math.random() * list.length)];
    const mirror = car.team === 1;
    const x = mirror ? -s[0] : s[0];
    const y = mirror ? -s[1] : s[1];
    const yaw = mirror ? s[2] + Math.PI : s[2];
    car.place(rl(x, y, CONFIG.car.respawnZ), yaw, CONFIG.game.spawnBoost);
    this.events.push({ type: 'respawn', carId: car.id });
    this.needsSync = true;
  }

  // Curved floor-to-wall ramps: the suspension cannot take a 2.56 m bend at speed, so it compressed
  // fully and turned speed into heat; driving up or down a wall the car slowed in the bend and sped up
  // after it. While the wheels ride the curve, the car now keeps the speed that gravity, boost and a
  // little rolling loss allow. Hits (ball, cars) are left alone.
  rampAssist(car) {
    if (car.isDemoed || car.netDriven || !car.snapVel) return;
    const prev = car.snapVel.length();
    if (prev < 4 || car.numWheelsInContact < 3) return;
    let onCurve = false;
    for (const w of car.wheels) {
      if (!w.inContact) continue;
      const ny = Math.abs(w.contactNormal.y);
      if (ny > 0.06 && ny < 0.985) onCurve = true;
    }
    if (!onCurve) return;
    for (const e of this.events) if (e.carId === car.id && (e.type === 'ballHit' || e.type === 'bump' || e.type === 'demo')) return;
    car.readState();
    const now = car.vel.length();
    if (now < 0.1) return;
    const dir = v0.copy(car.snapVel).divideScalar(prev);
    let accel = -Math.abs(CONFIG.physics.gravityZ) * UU * dir.y; // gravity along the motion
    if (car.isBoosting && car.boost > 0) accel += CONFIG.boost.accelGround * UU * Math.max(0, car.fwd.dot(dir));
    accel -= 0.6; // allowed rolling loss (m/s^2)
    const max = CONFIG.physics.carMaxSpeed ? CONFIG.physics.carMaxSpeed * UU : 23;
    const floor = Math.min(max, prev + accel * DT);
    if (now >= floor) return;
    const k = floor / now;
    car.body.setLinvel({ x: car.vel.x * k, y: car.vel.y * k, z: car.vel.z * k }, true);
    car.readState();
  }

  step() {
    this.events.length = 0;
    this.goalScored = -1;

    for (const car of this.cars) {
      if (car.isDemoed && car.demoRespawnTimer <= 0 && !car.netDriven) this.respawnCar(car);
    }
    if (this.needsSync) {
      this.pw.syncQueries();
      this.needsSync = false;
    }
    for (const car of this.cars) {
      if (this.freezeCars) {
        car.controls.throttle = car.controls.steer = car.controls.pitch = car.controls.yaw = car.controls.roll = 0;
        car.controls.jump = car.controls.boost = car.controls.handbrake = false;
      }
      car.preTick(this.tick);
      for (const e of car.events) this.events.push({ ...e, carId: car.id });
    }
    for (const pad of this.pads) {
      if (pad.cooldown > 0) pad.cooldown = Math.max(pad.cooldown - DT, 0);
      pad.active = pad.cooldown === 0;
      pad.lockedCar = null;
    }

    // Snapshot of velocities used by the contact rules (the original reads them before solving).
    this.ball.readState();
    this.ballSnapPos.copy(this.ball.pos);
    this.ballSnapVel.copy(this.ball.vel);
    for (const car of this.cars) {
      car.snapPos = (car.snapPos || new THREE.Vector3()).copy(car.pos);
      car.snapVel = (car.snapVel || new THREE.Vector3()).copy(car.vel);
    }

    if (this.freezeCars) {
      for (const car of this.cars) if (!car.isDemoed) car.body.setLinvel({ x: 0, y: car.vel.y, z: 0 }, true);
    }

    this.pw.step();

    this.handleBallContacts();
    this.handleCarContacts();
    this.handleWorldContacts();
    for (const car of this.cars) this.rampAssist(car);

    for (const car of this.cars) {
      car.postTick();
      car.finishTick();
      if (!car.isDemoed && this.padsEnabled) for (const pad of this.pads) this.checkPad(pad, car);
    }
    for (const pad of this.pads) {
      if (pad.lockedCar) {
        const car = pad.lockedCar;
        if (pad.active) {
          const amount = pad.big ? PADS.amountBig : PADS.amountSmall;
          const before = car.boost;
          car.boost = Math.min(car.boost + amount, CONFIG.boost.max);
          pad.active = false;
          pad.cooldown = pad.big ? PADS.cooldownBig : PADS.cooldownSmall;
          this.events.push({ type: 'pad', carId: car.id, pad: pad.index, big: pad.big, gained: car.boost - before });
        }
        pad.prevLockedCarId = car.id;
      } else {
        pad.prevLockedCarId = -1;
      }
    }

    const preVel = v3.copy(this.ball.vel);
    this.ball.finishTick();
    // Ball bounce events (for sound and dust): a big velocity change without a car touch.
    const dv = v0.subVectors(this.ball.vel, preVel).length();
    if (dv > 2 && !this.ballTouchedThisTick) this.events.push({ type: 'ballBounce', strength: dv });

    if (this.goalDetection) {
      const threshold = (CONFIG.arena.goalScoreThresholdY + CONFIG.physics.ballRadius) * UU;
      if (Math.abs(this.ball.pos.z) > threshold) {
        this.goalScored = this.ball.pos.z > 0 ? 0 : 1;
        this.events.push({ type: 'goal', team: this.goalScored });
      }
    }
    this.tick++;
  }

  // Collects touching contact points between two colliders. Returns count; fills out normal (from c2 to c1).
  touching(c1, c2, outNormal, onPoint) {
    let count = 0;
    this.pw.world.contactPair(c1, c2, (manifold, flipped) => {
      const n = manifold.numContacts();
      for (let i = 0; i < n; i++) {
        // Touching, or a predicted contact the solver had to push on during this step.
        if (manifold.contactDist(i) > TOUCH_DIST && !(manifold.contactImpulse(i) > 0)) continue;
        count++;
        if (outNormal) {
          const nn = manifold.normal();
          // Manifold normal points from its first collider to its second.
          const s = flipped ? 1 : -1;
          outNormal.set(nn.x * s, nn.y * s, nn.z * s);
        }
        if (onPoint) {
          const p1 = flipped ? manifold.localContactPoint2(i) : manifold.localContactPoint1(i);
          const p2 = flipped ? manifold.localContactPoint1(i) : manifold.localContactPoint2(i);
          onPoint(p1, p2);
        }
      }
    });
    return count;
  }

  handleBallContacts() {
    const ball = this.ball;
    this.ballTouchedThisTick = false;
    for (const car of this.cars) {
      if (car.isDemoed) continue;
      const touching = this.touching(car.collider, ball.collider, null, null) > 0;
      const wasTouching = this.touchState.get(car.id) || false;
      this.touchState.set(car.id, touching);
      if (!touching) continue;
      this.ballTouchedThisTick = true;
      // The original adds an extra push on every touch, at most every other tick.
      if (this.tick > car.lastExtraHitTick + 1 || car.lastExtraHitTick > this.tick) {
        car.lastExtraHitTick = this.tick;
        const relPos = v0.subVectors(this.ballSnapPos, car.snapPos);
        const relVel = v1.subVectors(this.ballSnapVel, car.snapVel);
        const relSpeedUU = Math.min(relVel.length() / UU, HIT.maxDeltaVel);
        if (relSpeedUU > 0) {
          // Flatten the vertical part of the hit direction, and soften the part along the car's nose.
          const hitDir = v2.set(relPos.x, relPos.y * HIT.zScale, relPos.z).normalize();
          const fwdAdj = hitDir.dot(car.fwd) * (1 - HIT.forwardScale);
          hitDir.addScaledVector(car.fwd, -fwdAdj).normalize();
          const added = hitDir.multiplyScalar(relSpeedUU * hitCurve.get(relSpeedUU) * UU);
          ball.velImpulseCache.add(added);
          if (!wasTouching || relSpeedUU > 300) {
            this.events.push({
              type: 'ballHit', carId: car.id, team: car.team, strength: relSpeedUU,
              pos: ball.pos.clone(), firstTouch: !wasTouching,
            });
          }
        }
      }
      this.lastTouch = { carId: car.id, team: car.team, tick: this.tick };
    }
  }

  handleCarContacts() {
    const cars = this.cars;
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i];
        const b = cars[j];
        if (a.isDemoed || b.isDemoed) continue;
        let maxA = -Infinity;
        let maxB = -Infinity;
        const n = this.touching(a.ccCollider, b.ccCollider, null, (pa, pb) => {
          // Contact points come in each collider's local space; shift to the car origin.
          maxA = Math.max(maxA, pa.x + a.hitboxOffset.x);
          maxB = Math.max(maxB, pb.x + b.hitboxOffset.x);
        });
        if (n === 0) continue;
        this.bumpCheck(a, b, maxA);
        if (!b.isDemoed && !a.isDemoed) this.bumpCheck(b, a, maxB);
      }
    }
  }

  bumpCheck(car, other, localFwd) {
    // Online: another player's car is moved by their own page, so only that page bumps or demolishes it.
    if (other.netDriven) return;
    if (car.carContact.otherCarId === other.id && car.carContact.cooldownTimer > 0) return;
    const delta = v0.subVectors(other.snapPos, car.snapPos);
    if (car.snapVel.dot(delta) <= 0) return;
    const velDir = v1.copy(car.snapVel).normalize();
    const dirTo = v2.copy(delta).normalize();
    const speedTowards = car.snapVel.dot(dirTo);
    const otherAway = other.snapVel.dot(velDir);
    if (speedTowards <= otherAway) return;
    if (localFwd / UU <= BUMP.minForwardDist) return; // must hit with the front bumper
    const speedUU = speedTowards / UU;
    const isDemo = car.isSupersonic && car.team !== other.team;
    if (isDemo) {
      other.demolish();
      this.events.push({ type: 'demo', carId: car.id, victimId: other.id, pos: other.pos.clone(), vel: other.snapVel.clone() });
    } else {
      const base = (other.isOnGround ? bumpGround : bumpAir).get(speedUU);
      const upDir = other.isOnGround ? lp.copy(other.up) : lp.set(0, 1, 0);
      const imp = v3.copy(velDir).multiplyScalar(base).addScaledVector(upDir, bumpUp.get(speedUU));
      other.velImpulseCache.addScaledVector(imp, UU);
      this.events.push({ type: 'bump', carId: car.id, victimId: other.id, strength: speedUU, pos: other.pos.clone() });
    }
    car.carContact.otherCarId = other.id;
    car.carContact.cooldownTimer = BUMP.cooldown;
  }

  handleWorldContacts() {
    const arena = this.pw.arenaCollider;
    for (const car of this.cars) {
      if (car.isDemoed) continue;
      const n = this.touching(car.collider, arena, v0, null);
      if (n > 0) {
        car.worldContact.hasContact = true;
        car.worldContact.normal.copy(v0).normalize();
        car.bodyScrapeTick = this.tick;
      }
    }
  }

  checkPad(pad, car) {
    const p = car.pos;
    let colliding = false;
    if (pad.prevLockedCarId === car.id) {
      // Car hitbox AABB against the pad box.
      const he = car.halfExtents;
      const c = v0.copy(car.hitboxOffset).applyQuaternion(car.quat).add(p);
      const ex = Math.abs(car.fwd.x) * he.x + Math.abs(car.up.x) * he.y + Math.abs(car.right.x) * he.z;
      const ey = Math.abs(car.fwd.y) * he.x + Math.abs(car.up.y) * he.y + Math.abs(car.right.y) * he.z;
      const ez = Math.abs(car.fwd.z) * he.x + Math.abs(car.up.z) * he.y + Math.abs(car.right.z) * he.z;
      colliding = c.x + ex > pad.boxMin.x && c.x - ex < pad.boxMax.x &&
        c.y + ey > pad.boxMin.y && c.y - ey < pad.boxMax.y &&
        c.z + ez > pad.boxMin.z && c.z - ez < pad.boxMax.z;
    } else {
      const dx = p.x - pad.pos.x;
      const dz = p.z - pad.pos.z;
      if (dx * dx + dz * dz < pad.cylRad * pad.cylRad) colliding = Math.abs(p.y - pad.pos.y) < pad.cylHeight;
    }
    if (colliding) pad.lockedCar = car;
  }

  // Lightweight state copy for replays.
  snapshot() {
    return {
      ball: { p: this.ball.pos.toArray(), q: this.ball.quat.toArray(), v: this.ball.vel.toArray() },
      cars: this.cars.map((c) => ({
        id: c.id, p: c.pos.toArray(), q: c.quat.toArray(), v: c.vel.toArray(),
        boosting: c.isBoosting, demoed: c.isDemoed, ss: c.isSupersonic,
        steer: c.wheels[0].steerAngle, wheels: c.wheels.map((w) => w.suspensionLength),
      })),
      pads: this.pads.map((p) => p.active),
    };
  }
}
