// Match replay: watch the whole match again from the end screen. The cars and ball are drawn from
// the match recording (game.matchRec); the physics does not run. Cameras: free (fly anywhere),
// follow the ball, or ride behind any player. Controls:
//   K play / pause, J back 10 s, L forward 10 s, , and . slower / faster, C next camera,
//   Esc back to the results. In the free camera WASD moves and the mouse looks (as in free play).
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { lerpPose } from './replay.js';

const SPEEDS = [0.25, 0.5, 1, 2, 4];
const v0 = new THREE.Vector3();
const v1 = new THREE.Vector3();
const q0 = new THREE.Quaternion();

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

function fmt(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class Theater {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.playing = true;
    this.speed = 2; // index into SPEEDS
    this.cam = 'free'; // 'free' | 'ball' | player index
    this.ui = null;
    this.lastScore = null;
    window.addEventListener('keydown', (e) => {
      if (this.game.state !== 'theater') return;
      const k = e.code;
      let used = true;
      if (k === 'Escape') this.close();
      else if (k === 'KeyK') this.toggle();
      else if (k === 'KeyJ') this.seek(this.t - 10);
      else if (k === 'KeyL') this.seek(this.t + 10);
      else if (k === 'Comma') this.setSpeed(this.speed - 1);
      else if (k === 'Period') this.setSpeed(this.speed + 1);
      else if (k === 'KeyC') this.nextCam();
      else used = false;
      if (used) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  }

  get rec() {
    return this.game.lastMatch;
  }

  available() {
    const r = this.rec;
    return !!(r && r.count > 30 && this.game.players.length);
  }

  open() {
    if (!this.available()) return;
    const g = this.game;
    document.getElementById('results').hidden = true;
    this.t = this.rec.start;
    this.playing = true;
    this.exploded = new Set();
    g.effects.clear();
    if (g.audio.ready) g.audio.silenceEngines();
    g.enterState('theater');
    g.hud.showHud(true);
    document.body.classList.add('theater');
    g.hud.set('clock', 'REPLAY', (v) => { g.hud.el.clock.textContent = v; });
    this.buildUi();
    this.setCam('free');
  }

  // Remove the replay controls (also when the game leaves the replay some other way).
  teardown() {
    const g = this.game;
    if (g.freeCam.active) g.freeCam.stop();
    document.body.classList.remove('theater');
    if (this.ui) this.ui.remove();
    this.ui = null;
    g.effects.clear();
  }

  close() {
    const g = this.game;
    this.teardown();
    g.state = 'ended';
    g.stateTime = 0;
    g.hud.setScore(g.score[0], g.score[1]);
    document.getElementById('results').hidden = false;
  }

  toggle() {
    this.playing = !this.playing;
    if (this.playing && this.t >= this.rec.end) this.seek(this.rec.start);
    this.refreshUi();
  }

  seek(t) {
    const r = this.rec;
    this.t = Math.max(r.start, Math.min(r.end, t));
    // Explosions only for goals reached by playing forward from here.
    this.exploded = new Set(r.goals.filter((gl) => gl.t < this.t).map((gl) => gl.t));
    this.game.effects.clear();
    this.refreshUi();
  }

  setSpeed(i) {
    this.speed = Math.max(0, Math.min(SPEEDS.length - 1, i));
    this.refreshUi();
  }

  camList() {
    return ['free', 'ball', ...this.game.players.map((p, i) => i)];
  }

  nextCam() {
    const list = this.camList();
    this.setCam(list[(list.indexOf(this.cam) + 1) % list.length]);
  }

  setCam(c) {
    const g = this.game;
    this.cam = c;
    if (c === 'free') {
      if (!g.freeCam.active) {
        // Start high over the side of the field, looking at the middle.
        g.cameraRig.pos.set(-38, 22, 0);
        g.cameraRig.look.set(0, 2, 0);
        g.cameraRig.apply(0);
        g.renderer.camera.position.set(-38, 22, 0);
        g.renderer.camera.lookAt(0, 2, 0);
        g.freeCam.start();
      }
    } else if (g.freeCam.active) {
      g.freeCam.stop();
    }
    g.cameraRig.snap();
    this.refreshUi();
  }

  // Each frame: move the playback time and fire goal explosions as they are reached.
  update(dt) {
    const r = this.rec;
    if (!r) return;
    if (this.playing) {
      this.t += dt * SPEEDS[this.speed];
      if (this.t >= r.end) {
        this.t = r.end;
        this.playing = false;
        this.refreshUi();
      }
    }
    for (const gl of r.goals) {
      if (!this.exploded.has(gl.t) && this.t >= gl.t && this.t < gl.t + 1.5) {
        this.exploded.add(gl.t);
        this.game.effects.goalExplosion(v0.fromArray(gl.pos), CONFIG.teams[gl.team].color, true, gl.explosion);
      }
    }
    const s = this.sample();
    if (s) {
      const sc = s.a.score;
      const key = `${sc[0]}-${sc[1]}`;
      if (key !== this.lastScore) {
        this.lastScore = key;
        this.game.hud.setScore(sc[0], sc[1]);
      }
    }
    this.tickUi();
  }

  sample() {
    return this.rec ? this.rec.sample(this.t) : null;
  }

  // Camera for the non-free views.
  camera(dt, rig) {
    const s = this.sample();
    if (!s) return;
    const ballPos = v0;
    lerpPose(s.a.ball, s.b.ball, s.k, ballPos, q0);
    if (this.cam === 'ball') {
      rig.updateFollow(dt, ballPos, v1.fromArray(s.a.ball.v), 12, 4);
      return;
    }
    const p = this.game.players[this.cam];
    if (!p) return;
    const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(p.renderQuat);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(p.renderQuat);
    const a = s.a.cars.find((c) => c.id === p.car.id);
    rig.updatePlay(dt, { pos: p.renderPos, vel: v1.fromArray(a ? a.v : [0, 0, 0]), fwd, up, numWheelsInContact: a && a.ground ? 4 : 0 }, s.a.ball.on ? ballPos : null);
  }

  // ------------------------------------------------------------------ controls bar
  buildUi() {
    if (this.ui) this.ui.remove();
    const g = this.game;
    const r = this.rec;
    const bar = el('div', 'theater-bar');
    const top = el('div', 'theater-top');
    const btn = (text, fn, title) => {
      const b = el('button', 'small-btn', text);
      b.type = 'button';
      if (title) b.title = title;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
        b.blur();
      });
      return b;
    };
    this.playBtn = btn('Pause', () => this.toggle(), 'Play / pause (K)');
    top.append(
      btn('-10 s', () => this.seek(this.t - 10), 'Back 10 seconds (J)'),
      this.playBtn,
      btn('+10 s', () => this.seek(this.t + 10), 'Forward 10 seconds (L)'),
    );
    this.speedBtn = btn('1x', () => this.setSpeed(this.speed + 1 >= SPEEDS.length ? 0 : this.speed + 1), 'Speed (, and .)');
    this.camBtn = btn('Free camera', () => this.nextCam(), 'Next camera (C)');
    this.timeLabel = el('span', 'theater-time', '0:00');
    top.append(this.speedBtn, this.camBtn, this.timeLabel, btn('Exit', () => this.close(), 'Back to the results (Esc)'));
    // Timeline with goal markers.
    const line = el('div', 'theater-line');
    const range = el('input');
    range.type = 'range';
    range.min = '0';
    range.max = '1000';
    range.step = '1';
    range.value = '0';
    range.setAttribute('aria-label', 'Match time');
    range.addEventListener('input', () => this.seek(r.start + (Number(range.value) / 1000) * (r.end - r.start)));
    range.addEventListener('keydown', (e) => e.stopPropagation());
    this.range = range;
    line.appendChild(range);
    for (const gl of r.goals) {
      const m = el('i', `goal-mark ${gl.team ? 'orange' : 'blue'}`);
      m.style.left = `${((gl.t - r.start) / Math.max(1, r.end - r.start)) * 100}%`;
      m.title = `${gl.name || CONFIG.teams[gl.team].name} scored`;
      line.appendChild(m);
    }
    const help = el('p', 'theater-help', 'K play/pause · J / L 10 s · , / . speed · C camera · Free camera: WASD move, mouse look, Space / X up and down');
    bar.append(top, line, help);
    document.getElementById('hud').appendChild(bar);
    this.ui = bar;
    this.refreshUi();
    g.hud.hint('');
  }

  refreshUi() {
    if (!this.ui) return;
    this.playBtn.textContent = this.playing ? 'Pause' : 'Play';
    this.speedBtn.textContent = `${SPEEDS[this.speed]}x`;
    const g = this.game;
    let name = 'Free camera';
    if (this.cam === 'ball') name = 'Ball camera';
    else if (typeof this.cam === 'number') name = `Follow ${g.players[this.cam] ? g.players[this.cam].name : '?'}`;
    this.camBtn.textContent = name;
    this.tickUi();
  }

  tickUi() {
    if (!this.ui) return;
    const r = this.rec;
    const span = Math.max(1, r.end - r.start);
    if (document.activeElement !== this.range) this.range.value = String(Math.round(((this.t - r.start) / span) * 1000));
    this.timeLabel.textContent = `${fmt(this.t - r.start)} / ${fmt(span)}`;
  }
}
