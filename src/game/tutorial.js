// Tutorial: a short guided free play for new players. Each step shows what to press (with the
// player's own key bindings, or controller buttons when a pad is connected) and finishes by itself
// when the player does it. New players get it offered on a welcome card before the login screen.
import * as THREE from 'three';
import { ACTIONS, keyName, padLabel } from '../input/input.js';

const WELCOME_KEY = 'boostball.welcomed.v1';
const v0 = new THREE.Vector3();

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

function store(get, value) {
  try {
    if (get) return localStorage.getItem(WELCOME_KEY);
    localStorage.setItem(WELCOME_KEY, value);
  } catch (e) {
    // Storage can be blocked; then the welcome card shows again next time, which is harmless.
  }
  return null;
}

export class Tutorial {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.step = 0;
    this.doneAt = 0; // seconds since the current step was finished (0 = not yet)
    this.fromWelcome = false;
    this.ui = null;
    this.steps = this.makeSteps();
    this.hitStep = this.steps.findIndex((s) => s.event === 'ballHit');
  }

  // New player: never saw the welcome card, has no guest save and no website login in this browser.
  isNewPlayer() {
    try {
      if (store(true)) return false;
      if (localStorage.getItem('boostball.guest.v1')) return false;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || '';
        if (k.startsWith('sb-') && k.includes('auth')) return false;
      }
    } catch (e) {
      return false;
    }
    return true;
  }

  markWelcomed() {
    store(false, '1');
  }

  // Label for an action: the controller button when a pad is in use, else the first bound key.
  key(action) {
    const inp = this.game.input;
    const a = ACTIONS.find((x) => x.id === action);
    if (inp.padState && a && a.pad) return padLabel(a.pad.split(',')[0].trim(), inp.padType);
    const codes = (inp.bindings && inp.bindings[action]) || (a ? a.keys : []);
    return keyName(codes.find(Boolean) || '') || '?';
  }

  makeSteps() {
    const k = (a) => this.key(a);
    return [
      {
        title: 'Drive',
        text: () => `Hold ${k('forward')} to drive forward and ${k('back')} to brake and reverse. Drive 40 meters.`,
        setup: (g) => this.placeCar(g, 0, -20, Math.PI / 2),
        goal: 40,
        progress: (g, s) => {
          s.dist = (s.dist || 0) + g.player.car.vel.length() * this.dt * (g.player.car.isOnGround ? 1 : 0);
          return s.dist;
        },
      },
      {
        title: 'Steer',
        text: () => `Steer with ${k('left')} and ${k('right')} while you drive. Turn all the way around once.`,
        goal: Math.PI * 2,
        progress: (g, s) => {
          const f = g.player.car.fwd;
          const yaw = Math.atan2(f.z, f.x);
          if (s.yaw !== undefined) {
            let d = yaw - s.yaw;
            if (d > Math.PI) d -= Math.PI * 2;
            if (d < -Math.PI) d += Math.PI * 2;
            s.turn = (s.turn || 0) + Math.abs(d);
          }
          s.yaw = yaw;
          return s.turn || 0;
        },
      },
      {
        title: 'Boost',
        text: () => `Hold ${k('boost')} to boost. The meter in the corner shows how much you have. Reach 75 km/h.`,
        setup: (g) => {
          g.player.car.boost = 100;
        },
        goal: 75,
        progress: (g) => g.player.car.vel.length() * 3.6,
        unit: 'km/h',
      },
      {
        title: 'Boost pads',
        text: () => 'Drive over a glowing pad on the floor to fill your boost back up. Small pads give a little, the big corner pads give a full tank.',
        setup: (g) => {
          g.player.car.boost = 10;
        },
        event: 'pad',
      },
      {
        title: 'Jump',
        text: () => `Press ${k('jump')} to jump. Press it again in the air for a second jump.`,
        event: 'jump',
      },
      {
        title: 'Flip',
        text: () => `Jump, then press ${k('jump')} again while holding ${k('forward')}. Your car flips forward and gets a burst of speed. Flips are how you hit the ball hard.`,
        event: 'flip',
      },
      {
        title: 'Ball cam',
        text: () => `Press ${k('ballCam')} to switch the camera between the ball and straight ahead. Ball cam keeps the ball in view, which helps you find it.`,
        setup: (g) => {
          this.ballCamStart = g.cameraRig.ballCam;
        },
        check: (g) => g.cameraRig.ballCam !== this.ballCamStart,
      },
      {
        title: 'Hit the ball',
        text: () => 'Drive into the ball. Hit it with the front of your car to aim it where your nose points.',
        setup: (g) => {
          this.placeCar(g, 0, -14, Math.PI / 2);
          this.placeBall(g, 0, 1, -2);
        },
        event: 'ballHit',
      },
      {
        title: 'Score a goal',
        text: () => 'Push the ball into the orange goal. Boost and flip into it for a harder shot.',
        setup: (g) => {
          this.placeCar(g, 0, 18, Math.PI / 2);
          this.placeBall(g, 0, 1, 30);
          this.score0 = g.score[0] + g.score[1];
        },
        check: (g) => g.score[0] + g.score[1] > this.score0,
      },
      {
        title: 'You are ready',
        text: () => `Play a quick match against bots next, then try online. In free play, keys 1 to 4 set up practice shots, and ${k('reset')} puts your car back.`,
        final: true,
      },
    ];
  }

  placeCar(g, x, z, yaw) {
    const c = g.player.car;
    c.place(v0.set(x, 0.2, z), yaw, Math.max(c.boost, 33));
    g.player.prevPos.copy(c.pos);
    g.player.prevQuat.copy(c.quat);
    g.sim.pw.syncQueries?.();
    g.cameraRig.snap();
  }

  placeBall(g, x, y, z) {
    g.sim.ball.place(v0.set(x, y + g.sim.ball.radius, z), new THREE.Vector3());
    g.prevBallPos?.copy(g.sim.ball.pos);
  }

  // ------------------------------------------------------------------ start / stop
  start(fromWelcome = false) {
    const g = this.game;
    this.fromWelcome = fromWelcome;
    this.markWelcomed();
    g.startFreePlay();
    this.active = true;
    this.step = 0;
    this.state = {};
    this.doneAt = 0;
    this.buildUi();
    this.enterStep();
  }

  stop(finished = false) {
    if (!this.active) return;
    this.active = false;
    if (this.ui) this.ui.remove();
    this.ui = null;
    const g = this.game;
    if (this.fromWelcome) {
      this.fromWelcome = false;
      // New players log in (or stay a guest) after the tutorial, not before.
      setTimeout(() => {
        if (g.state === 'home') g.login.show();
      }, 300);
    }
  }

  enterStep() {
    const g = this.game;
    const s = this.steps[this.step];
    this.state = {};
    this.doneAt = 0;
    this.hit = false;
    if (s.setup && g.state !== 'home') s.setup(g);
    this.refresh();
  }

  next() {
    if (!this.active) return;
    if (this.step >= this.steps.length - 1) {
      this.finish();
      return;
    }
    this.step += 1;
    this.enterStep();
  }

  finish() {
    const g = this.game;
    this.stop(true);
    g.toast('Tutorial done. Have fun!');
    g.enterHome();
  }

  // From game.handleEvents: things the player did this tick.
  onEvent(type, p) {
    if (!this.active || !p || !p.isPlayer) return;
    const s = this.steps[this.step];
    if (s.event === type) this.hit = true;
  }

  // Every frame.
  update(dt) {
    const g = this.game;
    if (!this.active) return;
    this.dt = dt;
    if (g.state === 'home' || g.mode !== 'free') {
      this.stop(false);
      return;
    }
    const s = this.steps[this.step];
    if (this.doneAt) {
      this.doneAt += dt;
      if (this.doneAt > 1.3) this.next();
      return;
    }
    if (s.final) return;
    if (g.state !== 'play' && g.state !== 'goal') return;
    // Until the ball steps, the ball waits by the side wall so it cannot cause a goal and a replay.
    if (this.step < this.hitStep) this.placeBall(g, -34, 0, 0);
    let done = false;
    if (s.event) done = this.hit;
    else if (s.check) done = s.check(g);
    else if (s.progress) {
      const v = s.progress(g, this.state);
      this.setBar(Math.min(1, v / s.goal), s.unit ? `${Math.round(v)} / ${s.goal} ${s.unit}` : '');
      done = v >= s.goal;
    }
    if (done) {
      this.doneAt = 1e-6;
      this.setBar(1, '');
      this.ui.classList.add('done');
      this.title.textContent = 'NICE!';
      g.audio.play('padBig');
    }
  }

  // ------------------------------------------------------------------ the panel
  buildUi() {
    if (this.ui) this.ui.remove();
    const box = el('div', 'tut');
    this.count = el('span', 'tut-count');
    this.title = el('b', 'tut-title');
    this.text = el('p', 'tut-text');
    const bar = el('div', 'tut-bar');
    this.fill = el('i');
    bar.appendChild(this.fill);
    this.barText = el('small', 'tut-bar-text');
    const row = el('div', 'tut-row');
    const btn = (label, fn) => {
      const b = el('button', 'small-btn', label);
      b.type = 'button';
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
        b.blur();
      });
      return b;
    };
    this.skipBtn = btn('Skip step', () => this.next());
    row.append(this.skipBtn, btn('Exit tutorial', () => {
      this.stop(false);
      this.game.enterHome();
    }));
    box.append(this.count, this.title, this.text, bar, this.barText, row);
    document.getElementById('hud').appendChild(box);
    this.ui = box;
    this.barEl = bar;
  }

  refresh() {
    if (!this.ui) return;
    const s = this.steps[this.step];
    this.ui.classList.remove('done');
    this.count.textContent = `TUTORIAL ${this.step + 1} / ${this.steps.length}`;
    this.title.textContent = s.title.toUpperCase();
    this.text.textContent = s.text();
    const showBar = !!s.progress;
    this.barEl.hidden = !showBar;
    this.barText.hidden = !showBar;
    this.setBar(0, '');
    this.skipBtn.textContent = s.final ? 'Finish' : 'Skip step';
  }

  setBar(k, text) {
    if (!this.fill) return;
    this.fill.style.width = `${Math.round(k * 100)}%`;
    this.barText.textContent = text;
  }
}
