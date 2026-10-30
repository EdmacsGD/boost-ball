// Bot driver. Each decision picks one plan (kickoff, attack, clear, save, rotate back, shadow, boost),
// then simple controllers drive the car: steering toward a target, flips into the ball, aerials and
// air recovery. Difficulty changes reaction time, aim, boost use, flips and aerials. Easy to Hard are
// beatable on purpose; Ultra adds corner shots, flip hits, speed flips and reading who reaches the ball first.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { UU, clamp } from '../util/math.js';
import { predictBall, goalBound } from './ballPredict.js';

const BALL_R = CONFIG.physics.ballRadius * UU;
const FIELD_Z = CONFIG.arena.extentY * UU;
const FIELD_X = CONFIG.arena.extentX * UU;
const GOAL_W = CONFIG.arena.goalHalfWidth * UU;
const G = Math.abs(CONFIG.physics.gravityZ) * UU;

const v0 = new THREE.Vector3();
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const qInv = new THREE.Quaternion();
const qT = new THREE.Quaternion();
const m3 = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

export class Bot {
  constructor(car, game, difficulty = 'medium') {
    this.car = car;
    this.game = game;
    this.setDifficulty(difficulty);
    this.state = 'kickoff';
    this.decisionTimer = 0;
    this.target = new THREE.Vector3();
    this.shotDir = new THREE.Vector3(0, 0, 1);
    this.targetSpeed = 23;
    this.dodge = null;
    this.aerial = null;
    this.stuckTime = 0;
    this.unstick = 0;
    this.aimError = 0;
    this.role = 'attacker';
    this.path = [];
    this.pathAge = 1;
    this.intercept = null;
    this.commitUntil = 0;
  }

  setDifficulty(name) {
    this.difficultyName = name;
    this.d = CONFIG.bots[name] || CONFIG.bots.medium;
  }

  get team() {
    return this.car.team;
  }

  get attackDir() {
    return this.car.team === 0 ? 1 : -1;
  }

  think(dt, kickoff) {
    const car = this.car;
    const c = car.controls;
    c.reset();
    if (car.isDemoed) return;
    const ball = this.game.sim.ball;
    this.pathAge += dt;
    if (this.pathAge > (this.d.predictEvery ?? 0.08)) {
      this.path = predictBall(ball.pos, ball.vel, this.d.predictAhead ?? 4, 1 / 30);
      this.pathAge = 0;
    }
    if (this.dodge) {
      this.runDodge(dt);
      return;
    }
    if (this.aerial) {
      this.runAerial(dt);
      return;
    }
    this.decisionTimer -= dt;
    if (this.decisionTimer <= 0) {
      this.decide(kickoff);
      this.decisionTimer = this.d.reaction * (0.7 + Math.random() * 0.6);
    }
    if (car.numWheelsInContact === 0 && !car.worldContact.hasContact) {
      this.recover();
      return;
    }
    if (car.numWheelsInContact < 3 && car.up.y < -0.3) {
      // On the roof: jump to auto-flip upright.
      c.jump = (this.game.sim.tick % 20) < 3;
      c.throttle = 1;
      return;
    }
    this.drive(dt);
  }

  // -------------------------------------------------------------- decisions
  decide(kickoff) {
    const car = this.car;
    const ball = this.game.sim.ball;
    const dir = this.attackDir;
    const ownGoalZ = -dir * FIELD_Z;
    const now = this.game.sim.tick / 120;
    if (kickoff) {
      this.state = 'kickoff';
      this.target.copy(ball.pos).setY(0);
      this.targetSpeed = 23;
      return;
    }
    this.role = this.game.roleFor ? this.game.roleFor(this) : 'attacker';
    const bound = goalBound(this.path);
    const threat = bound === this.team;
    const intercept = this.findIntercept();
    const ballDistToOwnGoal = Math.abs(ball.pos.z - ownGoalZ);
    const carDistToOwnGoal = Math.abs(car.pos.z - ownGoalZ);
    // Positive = we are between the ball and our own goal (the right side to hit from).
    const goalSide = (ball.pos.z - car.pos.z) * dir;

    // Keep the current plan for a moment unless something urgent changed (avoids dithering).
    const committed = now < this.commitUntil && intercept && (this.state === 'attack' || this.state === 'clear' || this.state === 'save');
    if (committed && !(threat && this.state === 'attack')) {
      this.intercept = intercept;
      return;
    }
    this.aimError = (Math.random() - 0.5) * this.d.aim;

    // 1. Ball heading into our goal.
    if (threat) {
      if (intercept && intercept.t < 3.2 && (goalSide > -1.5 || intercept.t < 0.9)) {
        this.plan('save', intercept);
        return;
      }
      this.setDefend(ball, ownGoalZ, dir, carDistToOwnGoal);
      return;
    }

    // 2. Wrong side of the ball and it is coming our way or already in our half: rotate back.
    if (goalSide < -2 && (ballDistToOwnGoal < 55 || ball.vel.z * dir < -5) && Math.random() < this.d.rotate + 0.15) {
      this.setDefend(ball, ownGoalZ, dir, carDistToOwnGoal);
      return;
    }

    // 3. Teammates.
    if (this.role === 'support') {
      this.state = 'shadow';
      const back = v1.set(0, 0, ownGoalZ).sub(ball.pos).setY(0).normalize();
      this.target.copy(ball.pos).addScaledVector(back, 20).setY(0);
      this.clampTarget(4);
      this.targetSpeed = 18;
      if (car.boost < 40) this.detourForBoost(18);
      return;
    }
    if (this.role === 'goalie') {
      this.setDefend(ball, ownGoalZ, dir, carDistToOwnGoal);
      return;
    }

    // 4. Low on boost with nothing urgent: grab a big pad nearby.
    if (car.boost < 25 && (!intercept || intercept.t > 2.2) && ballDistToOwnGoal > 30 && Math.random() < this.d.boostUse) {
      if (this.detourForBoost(32, true)) return;
    }

    // 4b. Reading the play (ultra): the opponent gets there clearly first and we are not goal-side,
    // so do not dive in from a bad angle. Get between the ball and our goal and wait for the hit.
    if (this.d.readPlay && intercept && ballDistToOwnGoal < 75) {
      const mine = this.reachTime(car, ball.pos);
      const theirs = this.opponentReach(ball);
      if (theirs + (this.d.readMargin ?? 0.25) < mine && goalSide < 4) {
        this.state = 'shadow';
        const back = v1.set(0, 0, ownGoalZ).sub(ball.pos).setY(0).normalize();
        this.target.copy(ball.pos).addScaledVector(back, Math.min(18, ballDistToOwnGoal * 0.45)).setY(0);
        this.clampTarget(4);
        this.targetSpeed = 23;
        return;
      }
    }

    // 5. Attack, or clear when the ball is in our third.
    if (intercept) {
      this.plan(ballDistToOwnGoal < 34 ? 'clear' : 'attack', intercept);
      return;
    }
    this.state = 'chase';
    this.target.copy(ball.pos).setY(0);
    this.targetSpeed = 20;
  }

  // Go back to the far post; once there, face the ball from in front of the goal.
  setDefend(ball, ownGoalZ, dir, carDistToOwnGoal) {
    const farPost = -Math.sign(ball.pos.x || 1) * GOAL_W * 0.6;
    if (carDistToOwnGoal > 14 || this.state !== 'defend') {
      this.state = carDistToOwnGoal > 14 ? 'retreat' : 'defend';
      this.target.set(farPost, 0, ownGoalZ + dir * 3);
    }
    if (this.state === 'defend' || carDistToOwnGoal <= 14) {
      this.state = 'defend';
      // Hold a spot between the ball and the goal center.
      const toBall = v1.set(ball.pos.x, 0, ball.pos.z - ownGoalZ).normalize();
      this.target.set(toBall.x * 6, 0, ownGoalZ + toBall.z * 6);
    }
    this.targetSpeed = 23;
  }

  plan(kind, intercept) {
    this.state = intercept.aerial ? 'aerial' : kind;
    this.planKind = kind;
    this.intercept = intercept;
    this.interceptStart = this.game.sim.tick / 120;
    this.commitUntil = this.interceptStart + 0.45;
    this.updateAttackTarget();
  }

  // Called by the game when this car touches the ball: re-plan right away.
  onTouch() {
    this.commitUntil = 0;
    this.decisionTimer = Math.min(this.decisionTimer, 0.05);
  }

  clampTarget(margin) {
    this.target.x = clamp(this.target.x, -FIELD_X + margin, FIELD_X - margin);
    this.target.z = clamp(this.target.z, -FIELD_Z + margin, FIELD_Z - margin);
    this.target.y = 0;
  }

  detourForBoost(maxDist, require = false) {
    const car = this.car;
    let best = null;
    let bd = Infinity;
    for (const pad of this.game.sim.pads) {
      if (!pad.active) continue;
      if (!pad.big && require) continue;
      const d = pad.pos.distanceTo(car.pos);
      if (d < bd && d < maxDist) {
        bd = d;
        best = pad;
      }
    }
    if (!best) return false;
    this.state = 'boost';
    this.target.set(best.pos.x, 0, best.pos.z);
    this.targetSpeed = 23;
    return true;
  }

  // Where should the ball go? Attack: at the goal. Clear/save: away from our goal toward a corner.
  shotDirection(p) {
    const dir = this.attackDir;
    if (this.planKind === 'clear' || this.planKind === 'save') {
      const sx = Math.sign(p.x || (Math.random() - 0.5)) * 0.9;
      return v2.set(sx, 0, dir).normalize();
    }
    let aimX = clamp(p.x * 0.25, -GOAL_W * 0.5, GOAL_W * 0.5) + this.aimError * 6;
    if (this.d.corners) {
      // Aim inside the post farther from the closest defender (or the far post if none is home).
      let keeper = null;
      let kd = Infinity;
      for (const c of this.game.sim.cars) {
        if (c.team === this.car.team || c.isDemoed) continue;
        const d = Math.abs(c.pos.z - dir * FIELD_Z);
        if (d < kd) { kd = d; keeper = c; }
      }
      const side = keeper && kd < 25 ? -Math.sign(keeper.pos.x || 1) : -Math.sign(p.x || 1);
      aimX = side * GOAL_W * 0.62;
    }
    return v2.set(aimX - p.x, 0, dir * (FIELD_Z + 2) - p.z).normalize();
  }

  // Curved approach: aim at a point behind the ball on the shot line. The offset shrinks as we close in,
  // so the car ends up driving through the ball in the shot direction.
  updateAttackTarget() {
    const car = this.car;
    const ip = this.intercept;
    const ball = this.game.sim.ball;
    const p = v1.set(ip.x, 0, ip.z);
    // Terminal guidance: close to a low ball, aim where it will be when we arrive, from the live state.
    const near = Math.hypot(ball.pos.x - car.pos.x, ball.pos.z - car.pos.z);
    if (near < 10 && ball.pos.y < 2.2) {
      const tArrive = near / Math.max(6, car.vel.length());
      p.set(ball.pos.x + ball.vel.x * tArrive, 0, ball.pos.z + ball.vel.z * tArrive);
    }
    const shot = this.shotDirection(p);
    this.shotDir.copy(shot);
    const toBall = v3.subVectors(p, car.pos).setY(0);
    const dist = toBall.length();
    const align = dist > 0.01 ? toBall.dot(shot) / dist : 1;
    if (align < -0.2 && dist < 25 && this.planKind === 'attack') {
      // Ahead of the ball: swing wide around it instead of pushing it backward.
      const side = Math.sign(car.pos.x - p.x || 1);
      this.target.copy(p).addScaledVector(shot, -6).add(v3.set(side * 5, 0, 0));
    } else {
      const offset = Math.min(dist * 0.42, 6.5) * (0.35 + 0.65 * Math.max(0, 1 - align));
      this.target.copy(p).addScaledVector(shot, -(BALL_R * 0.4 + offset));
    }
    this.clampTarget(1.5);
    const tLeft = Math.max(0.2, ip.t - (this.game.sim.tick / 120 - this.interceptStart));
    // Ground balls: go fast. Bouncing balls: time the arrival.
    this.targetSpeed = ip.y < 1.5 ? 23 : clamp(dist / tLeft + 2, 8, 23);
  }

  // Rough time for a car to reach the ball's ground spot (s), for reading who gets there first.
  reachTime(car, p) {
    const speed = Math.max(car.vel.length(), 4);
    const vmax = car.boost > 8 ? 22 : 14;
    const accel = car.boost > 8 ? 17 : 8;
    const dist = Math.max(0, Math.hypot(p.x - car.pos.x, p.z - car.pos.z) - 1.4);
    const tAcc = Math.max(0, (vmax - speed) / accel);
    const dAcc = speed * tAcc + 0.5 * accel * tAcc * tAcc;
    const t = dist <= dAcc ? (-speed + Math.sqrt(speed * speed + 2 * accel * dist)) / accel : tAcc + (dist - dAcc) / vmax;
    const toP = v0.set(p.x - car.pos.x, 0, p.z - car.pos.z).normalize();
    return t + (1 - toP.dot(v3.copy(car.fwd).setY(0).normalize())) * 0.45;
  }

  // Seconds the closest opponent needs to reach the ball (Infinity if none).
  opponentReach(ball) {
    let best = Infinity;
    for (const c of this.game.sim.cars) {
      if (c.team === this.car.team || c.isDemoed) continue;
      best = Math.min(best, this.reachTime(c, ball.pos));
    }
    return best;
  }

  // Earliest predicted ball position this car can reach in time.
  findIntercept() {
    const car = this.car;
    const speed = Math.max(car.vel.length(), 4);
    const boostAvail = car.boost > 8 && this.d.boostUse > 0.25;
    const vmax = boostAvail ? 22 : 14;
    const accel = boostAvail ? 17 : 8;
    for (const p of this.path) {
      const height = p.y;
      const groundReach = height < 1.75;
      const jumpReach = height < 3.3 && this.d.dodges > 0.3;
      const aerialReach = this.d.aerialHeight > 0 && car.boost > 25 && height >= 3.3 && height < this.d.aerialHeight;
      if (!groundReach && !jumpReach && !aerialReach) continue;
      if (Math.abs(p.z) > FIELD_Z) continue;
      const dist = Math.max(0, Math.hypot(p.x - car.pos.x, p.z - car.pos.z) - 1.4);
      const tAcc = Math.max(0, (vmax - speed) / accel);
      const dAcc = speed * tAcc + 0.5 * accel * tAcc * tAcc;
      const tReach = dist <= dAcc ? (-speed + Math.sqrt(speed * speed + 2 * accel * dist)) / accel : tAcc + (dist - dAcc) / vmax;
      // Turning around costs time.
      const toP = v0.set(p.x - car.pos.x, 0, p.z - car.pos.z).normalize();
      const facing = toP.dot(v3.copy(car.fwd).setY(0).normalize());
      const turn = (1 - facing) * 0.45;
      const extra = aerialReach && !jumpReach ? 0.35 + height / 8 : jumpReach && !groundReach ? 0.25 : 0;
      if (tReach + turn + extra <= p.t + 0.03) return { ...p, aerial: aerialReach && !jumpReach, jump: jumpReach && !groundReach };
    }
    return null;
  }

  // -------------------------------------------------------------- ground driving
  drive(dt) {
    const car = this.car;
    const c = car.controls;
    const ball = this.game.sim.ball;
    if (this.intercept && (this.state === 'attack' || this.state === 'clear' || this.state === 'save' || this.state === 'aerial')) this.updateAttackTarget();

    // Unstick: back up and turn for a moment.
    if (this.unstick > 0) {
      this.unstick -= dt;
      c.throttle = -1;
      c.steer = this.unstickSteer;
      return;
    }

    qInv.copy(car.quat).invert();
    const local = v0.subVectors(this.target, car.pos).applyQuaternion(qInv);
    const dist = Math.hypot(local.x, local.z);
    const angle = Math.atan2(local.z, local.x); // + = target to the right
    const fwdSpeed = car.forwardSpeed;
    const speed = car.vel.length();
    const yawRate = -car.angVel.dot(car.up);
    c.steer = clamp(angle * 3.5 - yawRate * 0.22, -1, 1);
    // Slow down when arriving at a stationary target (rotating back, goalie spots).
    let want = this.targetSpeed * this.d.maxSpeedUse;
    if (this.state === 'defend' || this.state === 'shadow') want = Math.min(want, 2 + dist * 1.4);
    if (this.state === 'defend' && dist < 2.5) {
      // In position: turn to face the ball.
      const bl = v3.subVectors(ball.pos, car.pos).applyQuaternion(qInv);
      const ba = Math.atan2(bl.z, bl.x);
      c.steer = clamp(ba * 3, -1, 1);
      c.throttle = Math.abs(ba) > 0.4 ? (Math.abs(ba) > 2 ? -0.6 : 0.4) : 0;
      return;
    }
    if (Math.abs(angle) > 2.0 && (dist < 7 || speed < 5) && fwdSpeed < 7) {
      // Target behind us and we are slow: reverse-turn instead of a wide loop.
      c.throttle = -1;
      c.steer = -Math.sign(angle);
    } else {
      c.throttle = speed < want ? 1 : speed > want + 3 ? -0.3 : 0.05;
    }
    if (Math.abs(angle) > 1.5 && fwdSpeed > 7 && car.isOnGround) c.handbrake = true;
    const aligned = Math.abs(angle) < 0.22;
    c.boost = aligned && speed < want - 0.5 && car.isOnGround && car.up.y > 0.6 && car.boost > 0 && Math.random() < this.d.boostUse + 0.1;

    if (this.state === 'kickoff') {
      c.throttle = 1;
      c.boost = car.boost > 0;
      const dBall = car.pos.distanceTo(ball.pos);
      if (dBall < 7.5 && Math.abs(angle) < 0.25 && this.d.dodges > 0.3) this.startDodge(1, clamp(angle * 2, -0.4, 0.4));
      return;
    }

    if ((this.state === 'attack' || this.state === 'clear' || this.state === 'save') && this.intercept) {
      const toBall = v1.subVectors(ball.pos, car.pos);
      const dBall = toBall.length();
      const hitDir = v3.copy(toBall).setY(0).normalize();
      const good = hitDir.dot(this.shotDir) > (this.state === 'attack' ? 0.55 : 0.2);
      const ballLocal = toBall.applyQuaternion(qInv);
      const ballAngle = Math.atan2(ballLocal.z, ballLocal.x);
      // Jump for a bouncing ball that is just out of reach.
      if (this.intercept.jump && dBall < 5 && ball.pos.y > 1.8 && Math.abs(ballAngle) < 0.3 && good && car.isOnGround) {
        this.startDodge(0, 0, true);
        return;
      }
      // Flip into the ball for a harder hit.
      if (dBall < 2.9 && ball.pos.y < 1.3 && Math.abs(ballAngle) < 0.28 && speed > 9 && good && car.isOnGround && Math.random() < (this.d.flipHit ?? this.d.dodges * 0.3)) {
        this.startDodge(1, clamp(ballAngle * 2.2, -0.6, 0.6));
        return;
      }
    }
    if (this.state === 'aerial' && this.intercept && car.isOnGround && car.boost > 25) {
      const ip = this.intercept;
      const l2 = v1.set(ip.x, ip.y, ip.z).sub(car.pos).applyQuaternion(qInv);
      const horiz = Math.hypot(l2.x, l2.z);
      const ang = Math.atan2(l2.z, l2.x);
      const tLeft = ip.t - (this.game.sim.tick / 120 - this.interceptStart);
      // Take off when facing it and the remaining time matches the climb.
      if (Math.abs(ang) < 0.3 && tLeft < 0.55 + ip.y / 7 && horiz < 4 + ip.y * 2) {
        this.aerial = { t: 0, arrive: Math.max(0.5, tLeft), jumped: false };
        return;
      }
    }

    // Speed flip: a long straight run without boost to spare goes faster with a front flip.
    if (this.d.speedFlips && car.isOnGround && car.up.y > 0.9 && Math.abs(angle) < 0.08 && dist > 28
      && fwdSpeed > 9 && fwdSpeed < 19 && (car.boost < 15 || !c.boost) && this.state !== 'defend' && this.state !== 'shadow') {
      const now = this.game.sim.tick / 120;
      if (now > (this.nextSpeedFlip || 0)) {
        this.nextSpeedFlip = now + 1.6;
        this.startDodge(1, 0);
        return;
      }
    }

    // Stuck detection.
    if (speed < 1.2 && Math.abs(c.throttle) > 0.5) {
      this.stuckTime += dt;
      if (this.stuckTime > 0.9) {
        this.stuckTime = 0;
        this.unstick = 0.8;
        this.unstickSteer = Math.random() < 0.5 ? -1 : 1;
        if (car.isOnGround && Math.random() < 0.5) this.startDodge(0, 0, true);
      }
    } else {
      this.stuckTime = 0;
    }
  }

  startDodge(forward, right, jumpOnly = false) {
    this.dodge = { phase: 0, t: 0, f: forward, r: right, jumpOnly };
  }

  runDodge(dt) {
    const c = this.car.controls;
    const d = this.dodge;
    d.t += dt;
    c.throttle = 1;
    c.boost = this.state === 'kickoff' && this.car.boost > 0;
    if (d.phase === 0) {
      c.jump = true;
      if (d.t > 0.08) { d.phase = 1; d.t = 0; }
    } else if (d.phase === 1) {
      c.jump = false;
      c.pitch = d.jumpOnly ? 0 : -0.3 * d.f;
      if (d.t > 0.05) {
        d.phase = d.jumpOnly ? 3 : 2;
        d.t = 0;
      }
    } else if (d.phase === 2) {
      c.jump = true;
      c.pitch = -d.f;
      c.yaw = d.r;
      if (d.t > 0.05) { d.phase = 3; d.t = 0; }
    } else {
      c.pitch = d.jumpOnly ? 0 : -d.f;
      c.yaw = d.jumpOnly ? 0 : d.r;
      if (d.t > (d.jumpOnly ? 0.35 : 0.7) || (this.car.isOnGround && d.t > 0.15)) this.dodge = null;
    }
  }

  // -------------------------------------------------------------- air control
  // PD controller toward a desired forward/up. Returns how well the nose is aligned (dot product).
  orient(fwd, up) {
    const car = this.car;
    const c = car.controls;
    const right = v2.crossVectors(fwd, up).normalize();
    const upOrtho = v3.crossVectors(right, fwd).normalize();
    m3.makeBasis(fwd, upOrtho, right);
    qT.setFromRotationMatrix(m3);
    qInv.copy(car.quat).invert();
    const qErr = qT.clone().premultiply(qInv);
    if (qErr.w < 0) { qErr.x = -qErr.x; qErr.y = -qErr.y; qErr.z = -qErr.z; qErr.w = -qErr.w; }
    const angle = 2 * Math.acos(clamp(qErr.w, -1, 1));
    const s = Math.sqrt(Math.max(1e-9, 1 - qErr.w * qErr.w));
    const ex = (qErr.x / s) * angle;
    const ey = (qErr.y / s) * angle;
    const ez = (qErr.z / s) * angle;
    const w = v0.copy(car.angVel).applyQuaternion(qInv);
    c.roll = clamp(ex * 3.0 - w.x * 0.45, -1, 1);
    c.pitch = clamp(ez * 4.0 - w.z * 0.85, -1, 1);
    c.yaw = clamp(-(ey * 4.0 - w.y * 0.85), -1, 1);
    return car.fwd.dot(fwd);
  }

  recover() {
    const car = this.car;
    const c = car.controls;
    const f = v1.copy(car.vel).setY(0);
    if (f.lengthSq() < 1) f.copy(car.fwd).setY(0);
    if (f.lengthSq() < 1e-4) f.set(1, 0, 0);
    f.normalize();
    // Near a wall, land facing along it and level with it; otherwise land flat.
    this.orient(f.clone(), UP);
    c.throttle = 1;
  }

  runAerial(dt) {
    const car = this.car;
    const c = car.controls;
    const a = this.aerial;
    a.t += dt;
    if (a.t < 0.18) c.jump = true;
    else if (a.t < 0.22) c.jump = false;
    else if (!a.jumped) {
      c.jump = true;
      a.jumped = true;
    }
    const tLeft = Math.max(0.08, a.arrive - a.t);
    const ball = this.game.sim.ball;
    const pp = this.path.find((p) => p.t >= tLeft) || null;
    const target = pp ? v1.set(pp.x, pp.y, pp.z) : v1.copy(ball.pos);
    // Aim slightly behind the ball so the hit goes toward the shot direction.
    target.addScaledVector(this.shotDir, -BALL_R * 0.8);
    const delta = v2.subVectors(target, car.pos).addScaledVector(car.vel, -tLeft);
    delta.y += 0.5 * G * tLeft * tLeft;
    const need = delta.length();
    const dir = delta.normalize().clone();
    const align = this.orient(dir, UP);
    c.boost = align > 0.82 && need > 0.5 && car.boost > 0;
    c.throttle = 1;
    if (car.pos.distanceTo(ball.pos) < BALL_R + 1.3 && car.hasFlipOrJump() && this.d.dodges > 0.6) {
      this.aerial = null;
      this.startDodge(1, 0);
      this.dodge.phase = 2;
      return;
    }
    if (a.t > a.arrive + 0.5 || (car.isOnGround && a.t > 0.4)) this.aerial = null;
  }
}
