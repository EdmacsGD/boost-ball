// Online match logic inside the game: who drives which car, what the host shares, how the other
// players' cars and the host's ball are put into this page's physics.
//
// Own car: simulated here, shared as state. Other players' cars: set every tick to their last shared
// state, moved forward by how old it is (so they collide with you and the ball where they really are).
// Ball: the host's physics decides. Other pages run the ball too (so your own touches react at once)
// and are pulled back to the host's ball as each update arrives.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { UU } from '../util/math.js';
import { encodeCar, decodeCar, encodeBall, decodeBall } from './codec.js';

// Quick chat: number keys 1-6 in online matches. Only the index travels, so nobody can send text.
export const QUICK_CHAT = ['Nice shot!', 'What a save!', 'Great pass!', 'Thanks!', 'Sorry!', 'gg'];

const G = CONFIG.physics.gravityZ * UU; // m/s^2, negative
const PHASES = { countdown: 'cd', play: 'pl', goal: 'gl', replay: 'rp', ended: 'en' };
const v0 = new THREE.Vector3();
const v1 = new THREE.Vector3();
const q0 = new THREE.Quaternion();
const q1 = new THREE.Quaternion();
const qi = new THREE.Quaternion();
// Visual smoothing: when a new update moves a remote car, the model eases from where it was drawn
// to the new spot over about this many seconds (the physics body jumps at once, for collisions).
const SMOOTH = 0.1;
const SNAP_DIST = 3; // farther than this (kickoff, respawn, demo) the model jumps too

export class NetPlay {
  constructor(game, online, isHost) {
    this.game = game;
    this.online = online;
    this.isHost = isHost;
    this.ep = 0; // kickoff number
    this.goals = 0; // goals seen (host: scored)
    this.goal = null; // host: last goal info for the snapshot
    this.ko = null; // host: kickoff spawns per slot
    this.ack = {}; // host: peer -> last time stamp heard (for round-trip times)
    this.rtt = 0.12; // seconds, smoothed
    this.lastSnapAt = 0;
    this.ball = null; // client: { s, at, applied }
    this.myTouchAt = -1e9;
    this.demos = 0; // times our car was demolished (shared so others can show it)
    this.demoBy = -1;
    this.dmSeen = new Map(); // peer -> demo count seen
    this.clockOff = new Map(); // sender -> smallest (arrival - send time) seen, in ms
    this.qc = null; // our last quick chat [number, message index]
    this.qcSent = []; // times of our recent messages (spam limit)
    this.qcSeen = new Map(); // peer -> last quick chat number shown
  }

  // Local time a message was sent, from the sender's time stamp. Arrival times jitter by tens of ms
  // (a car at 20 m/s moves 0.6 m in 30 ms), the sender's stamp does not. The smallest arrival minus
  // stamp seen is the clock difference plus the fastest trip; it may creep up slowly for clock drift.
  sentAt(key, at, ts) {
    if (!Number.isFinite(ts) || !Number.isFinite(at)) return at;
    const off = at - ts;
    let o = this.clockOff.get(key);
    if (o === undefined || off < o) o = off;
    else o += Math.min(off - o, 200) * 0.01;
    this.clockOff.set(key, o);
    return ts + o;
  }

  get client() {
    return !this.isHost;
  }

  oneWay() {
    return Math.min(0.25, this.rtt / 2);
  }

  // ------------------------------------------------------------------ outgoing
  outgoing() {
    const g = this.game;
    const me = g.player;
    const patch = { car: encodeCar(me.car), ts: Date.now(), rtt: Math.round(this.rtt * 1000) };
    if (this.qc) patch.qc = this.qc;
    if (this.client) {
      patch.dm = [this.demos, this.demoBy];
      return patch;
    }
    const bots = {};
    g.players.forEach((p, i) => {
      if (p.bot) bots[i] = encodeCar(p.car);
    });
    patch.s = {
      ph: PHASES[g.state] || 'pl',
      ep: this.ep,
      t: Math.round(g.stateTime * 100) / 100,
      clock: Math.round(g.clock * 10) / 10,
      ot: g.overtime ? 1 : 0,
      sc: [g.score[0], g.score[1]],
      ball: encodeBall(g.sim.ball),
      bots,
      g: this.goal,
      st: g.players.map((p) => [p.stats.score, p.stats.goals, p.stats.assists, p.stats.saves, p.stats.shots, p.stats.demos]),
      ko: this.ko,
      ack: this.ack,
    };
    return patch;
  }

  // ------------------------------------------------------------------ incoming
  // A player's own car (or the host's car), from their presence. `at`: local clock when it changed.
  peerCar(peer, pr, at) {
    const g = this.game;
    const p = g.players.find((x) => x.remote === peer);
    if (!p || p.netAt === at) return;
    const s = decodeCar(pr.car);
    if (!s) return;
    p.net = s;
    p.netAt = at;
    p.netT = this.sentAt(peer, at, Number(pr.ts));
    p.netLead = Math.min(0.25, (Number(pr.rtt) || 120) / 2000);
    if (this.isHost && Number.isFinite(pr.ts)) this.ack[peer] = pr.ts;
    // Quick chat from this player.
    if (Array.isArray(pr.qc)) {
      const n = Number(pr.qc[0]) || 0;
      const idx = Number(pr.qc[1]);
      if (n > (this.qcSeen.get(peer) || 0) && QUICK_CHAT[idx]) {
        this.qcSeen.set(peer, n);
        g.hud.chat(p.name, p.team, QUICK_CHAT[idx]);
      }
    }
    // Their car was demolished: credit the attacker (host keeps the stats).
    if (Array.isArray(pr.dm)) {
      const n = Number(pr.dm[0]) || 0;
      const seen = this.dmSeen.get(peer) || 0;
      if (n > seen) {
        this.dmSeen.set(peer, n);
        p.demoBy = Number(pr.dm[1]);
        if (this.isHost) {
          const attacker = g.players[p.demoBy];
          if (attacker) g.award(attacker, 'DEMOLITION', 25, 'demos');
        }
      }
    }
  }

  // Client: the host's share (ball, bots, phase, score, clock, stats).
  hostSnapshot(s, at, ts) {
    if (!s || typeof s !== 'object' || at === this.lastSnapAt) return;
    this.lastSnapAt = at;
    const g = this.game;
    const me = this.online.myMatchPeer;
    if (s.ack && me && Number.isFinite(s.ack[me])) {
      const r = (Date.now() - s.ack[me]) / 1000 - 1 / 60; // minus about half the host's send interval
      if (r > 0 && r < 2) this.rtt += (r - this.rtt) * 0.2;
    }
    const b = decodeBall(s.ball);
    if (b) this.ball = { s: b, at, applied: false };
    if (s.bots && typeof s.bots === 'object') {
      for (const [k, arr] of Object.entries(s.bots)) {
        const p = g.players[Number(k)];
        if (!p || p === g.player) continue;
        const st = decodeCar(arr);
        if (st) {
          p.net = st;
          p.netAt = at;
          p.netT = this.sentAt('host', at, Number(ts));
          p.netLead = this.oneWay();
        }
      }
    }
    if (Array.isArray(s.st)) {
      s.st.forEach((row, i) => {
        const p = g.players[i];
        if (!p || !Array.isArray(row)) return;
        const n = row.map((v) => (Number.isFinite(v) ? v : 0));
        p.stats = { score: n[0], goals: n[1], assists: n[2], saves: n[3], shots: n[4], demos: n[5] };
      });
    }
    if (Array.isArray(s.sc)) {
      const a = Number(s.sc[0]) || 0;
      const c = Number(s.sc[1]) || 0;
      if (a !== g.score[0] || c !== g.score[1]) {
        g.score = [a, c];
        g.hud.setScore(a, c);
      }
    }
    if (Number.isFinite(s.clock)) g.clock = s.clock;
    g.overtime = !!s.ot;
    this.ko = Array.isArray(s.ko) ? s.ko : null;
    // A new goal: show it here.
    if (s.g && Number.isFinite(s.g.n) && s.g.n > this.goals) {
      this.goals = s.g.n;
      if (g.state === 'play' || g.state === 'countdown') g.onGoal(s.g.team === 1 ? 1 : 0, { scorer: s.g.sc, assist: s.g.as, kmh: s.g.kmh });
    }
    this.followPhase(s);
  }

  followPhase(s) {
    const g = this.game;
    const ep = Number(s.ep) || 0;
    if (ep !== this.ep && (s.ph === 'cd' || s.ph === 'pl')) {
      this.ep = ep;
      this.kickoff(s);
      return;
    }
    if (s.ph === 'pl' && g.state === 'countdown' && g.stateTime < 2.4) {
      g.hud.countdown(null);
      g.enterState('play');
    } else if (s.ph === 'rp' && g.state === 'goal') {
      if (g.goalInfo && g.replay.frames.length > 60) g.enterState('replay');
    } else if (s.ph === 'en' && g.state !== 'ended') {
      g.matchOver = true;
      g.hud.replay(false);
      g.enterState('ended');
    }
  }

  // Client: a new kickoff. Our car goes to the spawn the host picked for our slot.
  kickoff(s) {
    const g = this.game;
    g.kickoffSetup();
    const idx = g.players.indexOf(g.player);
    const k = this.ko && Array.isArray(this.ko[idx]) ? this.ko[idx].map(Number) : null;
    if (k && k.every(Number.isFinite)) {
      g.player.car.place(v0.set(k[0] / 100, k[1] / 100, k[2] / 100), k[3] / 1000, CONFIG.game.spawnBoost);
      g.player.prevPos.copy(g.player.car.pos);
      g.player.prevQuat.copy(g.player.car.quat);
      g.sim.pw.syncQueries();
    }
    if (s.ph === 'pl') {
      g.enterState('play');
    } else {
      g.enterState('countdown');
      g.stateTime = Math.max(0, Math.min(2.9, Number(s.t) || 0));
    }
    g.cameraRig.snap();
  }

  // Host: after its own kickoff layout, remember every slot's spawn for the other pages.
  hostKickoff() {
    const g = this.game;
    this.ep += 1;
    this.ko = g.players.map((p) => [
      Math.round(p.car.pos.x * 100), Math.round(p.car.pos.y * 100), Math.round(p.car.pos.z * 100),
      Math.round(Math.atan2(p.car.fwd.z, p.car.fwd.x) * 1000),
    ]);
  }

  // Host: a goal happened; share who scored.
  hostGoal(team, sp, ap, kmh) {
    const g = this.game;
    this.goals += 1;
    this.goal = { n: this.goals, team, sc: sp ? g.players.indexOf(sp) : -1, as: ap ? g.players.indexOf(ap) : -1, kmh };
  }

  // ------------------------------------------------------------------ every physics tick
  beforeStep() {
    const g = this.game;
    const now = performance.now();
    for (const p of g.players) {
      if (!p.car.netDriven || !p.net) continue;
      this.drive(p, now);
    }
    if (this.client) this.correctBall(now);
  }

  // Put a remote car where its last shared state says it is now.
  drive(p, now) {
    const car = p.car;
    const s = p.net;
    const age = Math.min(0.35, Math.max(0, (Date.now() - (p.netT || p.netAt)) / 1000) + (p.netLead || 0));
    // A new update: remember where the model was, to ease it over (see SMOOTH).
    const fresh = p.drivenAt !== p.netAt;
    if (fresh) {
      p.drivenAt = p.netAt;
      if (!p.visErr) {
        p.visErr = new THREE.Vector3();
        p.visErrQ = new THREE.Quaternion();
        p.visOld = new THREE.Vector3();
        p.visOldQ = new THREE.Quaternion();
      }
      p.visOld.copy(car.pos).add(p.visErr);
      p.visOldQ.copy(p.visErrQ).multiply(car.quat);
    }
    if (s.demoed) {
      if (!car.isDemoed) {
        car.demolish();
        this.game.onRemoteDemo(p);
      }
      return;
    }
    if (car.isDemoed) {
      car.place(v0.fromArray(s.p), 0, 100);
      car.isDemoed = false;
      this.game.onRemoteRespawn(p);
    }
    const air = !s.ground;
    const pos = v0.fromArray(s.p).addScaledVector(v1.fromArray(s.v), age);
    if (air) pos.y += 0.5 * G * age * age;
    pos.y = Math.max(pos.y, 0.05);
    const vy = s.v[1] + (air ? G * age : 0);
    q0.fromArray(s.q);
    const w = v1.fromArray(s.w);
    const wl = w.length();
    if (wl > 1e-4) {
      q1.setFromAxisAngle(w.divideScalar(wl), wl * age);
      q0.premultiply(q1);
    }
    car.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
    car.body.setRotation({ x: q0.x, y: q0.y, z: q0.z, w: q0.w }, true);
    car.body.setLinvel({ x: s.v[0], y: vy, z: s.v[2] }, true);
    car.body.setAngvel({ x: s.w[0], y: s.w[1], z: s.w[2] }, true);
    car.readState();
    if (fresh) {
      // Offset = old drawn pose minus new physics pose; it fades out in smoothVisual().
      p.visErr.copy(p.visOld).sub(car.pos);
      if (p.visErr.length() > SNAP_DIST) {
        p.visErr.set(0, 0, 0);
        p.visErrQ.identity();
      } else {
        p.visErrQ.copy(p.visOldQ).multiply(qi.copy(car.quat).invert());
      }
    }
    const c = car.controls;
    c.reset();
    c.throttle = s.throttle;
    c.steer = s.steer;
    c.boost = s.boosting;
    car.boost = 100;
  }

  // Client: pull our ball toward the host's (moved forward by its age). Right after we touched it
  // ourselves, trust our own ball for a moment, since the host's update is older than our touch.
  correctBall(now) {
    const nb = this.ball;
    if (!nb || nb.applied) return;
    nb.applied = true;
    const g = this.game;
    const ball = g.sim.ball;
    if (!nb.s.on || g.ballHidden) return;
    const age = Math.min(0.4, Math.max(0, (Date.now() - nb.at) / 1000) + this.oneWay());
    const tp = v0.fromArray(nb.s.p).addScaledVector(v1.fromArray(nb.s.v), age);
    tp.y += 0.5 * G * age * age;
    const R = ball.radius;
    const tv = v1.fromArray(nb.s.v);
    tv.y += G * age;
    if (tp.y < R) {
      tp.y = R;
      tv.y = Math.abs(tv.y) * 0.6;
    }
    const err = tp.distanceTo(ball.pos);
    const mine = Date.now() - this.myTouchAt < (this.rtt * 1000 + 150);
    // Move the ball without touching its rotation (a reset rotation would make the skin jump).
    const set = (pos, vel) => {
      ball.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
      ball.body.setLinvel({ x: vel.x, y: vel.y, z: vel.z }, true);
      ball.body.setAngvel({ x: nb.s.w[0], y: nb.s.w[1], z: nb.s.w[2] }, true);
      ball.readState();
    };
    if (err > 4 || (!mine && err > 1.5)) {
      set(tp, tv);
      g.prevBallPos.copy(ball.pos);
    } else if (!mine && err > 0.02) {
      set(ball.pos.clone().lerp(tp, 0.35), ball.vel.clone().lerp(tv, 0.6));
    }
  }

  // Every rendered frame: draw remote cars at physics pose + a fading offset, so an update that moves
  // a car eases it there instead of making it jump.
  smoothVisual(p, dt) {
    if (!p.visErr || !p.car.netDriven) return;
    const k = Math.exp(-dt / SMOOTH);
    p.visErr.multiplyScalar(k);
    p.visErrQ.slerp(qi.identity(), 1 - k);
    p.renderPos.add(p.visErr);
    p.renderQuat.premultiply(p.visErrQ);
  }

  // Our quick chat: at most 3 messages every 5 seconds.
  say(idx) {
    if (!QUICK_CHAT[idx]) return false;
    const now = Date.now();
    this.qcSent = this.qcSent.filter((t) => now - t < 5000);
    if (this.qcSent.length >= 3) return false;
    this.qcSent.push(now);
    this.qc = [((this.qc && this.qc[0]) || 0) + 1, idx];
    const me = this.game.player;
    this.game.hud.chat(me.name, me.team, QUICK_CHAT[idx]);
    return true;
  }

  myTouch() {
    this.myTouchAt = Date.now();
  }

  myDemo(attackerIndex) {
    this.demos += 1;
    this.demoBy = attackerIndex;
  }
}
