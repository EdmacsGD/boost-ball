import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { UU } from '../util/math.js';
import { R, COLLIDER_GROUPS } from './world.js';

const P = CONFIG.physics;

export class BallPhysics {
  constructor(pw) {
    this.pw = pw;
    this.radius = P.ballRadius * UU;
    // Rapier damping: v *= 1 / (1 + dt * c). Matching Bullet's v *= (1 - 0.03)^dt gives c = -ln(0.97).
    const drag = -Math.log(1 - P.ballDrag);
    const bd = R.RigidBodyDesc.dynamic()
      .setTranslation(0, this.radius, 0)
      .setLinearDamping(drag)
      .setAngularDamping(0)
      .setCanSleep(false)
      .setCcdEnabled(true);
    this.body = pw.world.createRigidBody(bd);
    this.collider = pw.world.createCollider(
      R.ColliderDesc.ball(this.radius)
        .setMass(P.ballMass)
        .setFriction(P.ballFriction)
        .setFrictionCombineRule(R.CoefficientCombineRule.Max)
        .setRestitution(P.ballRestitution)
        .setRestitutionCombineRule(R.CoefficientCombineRule.Min)
        .setCollisionGroups(COLLIDER_GROUPS.ball)
        .setSolverGroups(COLLIDER_GROUPS.ball),
      this.body,
    );
    this.pos = new THREE.Vector3(0, this.radius, 0);
    this.vel = new THREE.Vector3();
    this.angVel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.velImpulseCache = new THREE.Vector3();
  }

  place(pos, vel = { x: 0, y: 0, z: 0 }, angVel = { x: 0, y: 0, z: 0 }) {
    this.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
    this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    this.body.setLinvel({ x: vel.x, y: vel.y, z: vel.z }, true);
    this.body.setAngvel({ x: angVel.x, y: angVel.y, z: angVel.z }, true);
    this.velImpulseCache.set(0, 0, 0);
    this.readState();
  }

  readState() {
    const p = this.body.translation();
    const v = this.body.linvel();
    const w = this.body.angvel();
    const q = this.body.rotation();
    this.pos.set(p.x, p.y, p.z);
    this.vel.set(v.x, v.y, v.z);
    this.angVel.set(w.x, w.y, w.z);
    this.quat.set(q.x, q.y, q.z, q.w);
  }

  finishTick() {
    this.readState();
    if (this.velImpulseCache.lengthSq() > 0) {
      this.vel.add(this.velImpulseCache);
      this.velImpulseCache.set(0, 0, 0);
    }
    const maxV = P.ballMaxSpeed * UU;
    if (this.vel.lengthSq() > maxV * maxV) this.vel.setLength(maxV);
    if (this.angVel.lengthSq() > P.ballMaxAngSpeed * P.ballMaxAngSpeed) this.angVel.setLength(P.ballMaxAngSpeed);
    this.body.setLinvel({ x: this.vel.x, y: this.vel.y, z: this.vel.z }, true);
    this.body.setAngvel({ x: this.angVel.x, y: this.angVel.y, z: this.angVel.z }, true);
  }
}
