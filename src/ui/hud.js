// DOM heads-up display: score, clock, boost gauge, banners, popups, feed, menus.
const $ = (id) => document.getElementById(id);
const ARC = 2 * Math.PI * 78 * 0.75;

export class HUD {
  constructor() {
    this.el = {
      scoreBlue: $('scoreBlue'), scoreOrange: $('scoreOrange'), clock: $('clock'), clockBox: document.querySelector('.clock'),
      otLabel: $('otLabel'), feed: $('feed'), boost: $('boost'), boostArc: $('boostArc'), boostNum: $('boostNum'),
      boostLabel: $('boostLabel'), speedNum: $('speedNum'), speed: document.querySelector('.speed'),
      chipCam: $('chipCam'), chipInf: $('chipInf'), chipFlip: $('chipFlip'), chipFps: $('chipFps'),
      countdown: $('countdown'), banner: $('banner'), bannerMain: $('bannerMain'), bannerSub: $('bannerSub'), bannerExtra: $('bannerExtra'),
      popups: $('popups'), replayTag: $('replayTag'), hint: $('hint'), hud: $('hud'),
    };
    this.last = {};
    this.bannerTimer = 0;
    // Tick marks around the gauge (270 degrees).
    const svg = this.el.boost.querySelector('svg');
    const ns = 'http://www.w3.org/2000/svg';
    for (let i = 0; i <= 30; i++) {
      const a = (i / 30) * 1.5 * Math.PI;
      const major = i % 5 === 0;
      const r0 = major ? 86 : 88;
      const r1 = 92;
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', 100 + Math.cos(a) * r0);
      line.setAttribute('y1', 100 + Math.sin(a) * r0);
      line.setAttribute('x2', 100 + Math.cos(a) * r1);
      line.setAttribute('y2', 100 + Math.sin(a) * r1);
      line.setAttribute('stroke', major ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.22)');
      line.setAttribute('stroke-width', major ? '2.2' : '1.4');
      svg.appendChild(line);
    }
    svg.querySelector('.ring-ticks')?.remove();
  }

  set(key, value, fn) {
    if (this.last[key] === value) return;
    this.last[key] = value;
    fn(value);
  }

  setScore(blue, orange, bump) {
    this.set('sb', blue, (v) => {
      this.el.scoreBlue.textContent = v;
      if (bump === 0) this.bump(this.el.scoreBlue);
    });
    this.set('so', orange, (v) => {
      this.el.scoreOrange.textContent = v;
      if (bump === 1) this.bump(this.el.scoreOrange);
    });
  }

  bump(el) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  setClock(seconds, overtime) {
    const s = Math.max(0, Math.ceil(seconds - 1e-6));
    const text = overtime ? `+${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.set('clock', text, (v) => { this.el.clock.textContent = v; });
    this.set('ot', overtime, (v) => {
      this.el.otLabel.hidden = !v;
      this.el.clockBox.classList.toggle('overtime', v);
    });
    this.set('low', !overtime && seconds <= 30 && seconds > 0, (v) => this.el.clockBox.classList.toggle('low', v));
  }

  setBoost(amount, infinite) {
    const v = Math.round(amount);
    this.set('boost', v, (val) => {
      this.el.boostArc.style.strokeDasharray = `${(ARC * val) / 100} 490`;
      this.el.boostNum.textContent = infinite ? 'MAX' : val;
      this.el.boost.classList.toggle('empty', val <= 0);
    });
    this.set('inf', infinite, (val) => {
      this.el.boost.classList.toggle('inf', val);
      this.el.boostNum.textContent = val ? 'MAX' : Math.round(amount);
      this.el.boostLabel.textContent = val ? 'UNLIMITED' : 'BOOST';
      this.el.chipInf.hidden = !val;
    });
  }

  setSpeed(ms, supersonic) {
    const kmh = Math.round(ms * 3.6);
    this.set('spd', kmh, (v) => { this.el.speedNum.textContent = v; });
    this.set('ss', supersonic, (v) => this.el.speed.classList.toggle('on', v));
  }

  setChips({ ballCam, flip, fps }) {
    this.set('cam', ballCam, (v) => {
      this.el.chipCam.textContent = v ? 'BALL CAM' : 'CAR CAM';
      this.el.chipCam.classList.toggle('on', v);
    });
    this.set('flip', flip, (v) => {
      this.el.chipFlip.hidden = !v;
      this.el.chipFlip.textContent = v === 'reset' ? 'FLIP RESET' : 'FLIP READY';
      this.el.chipFlip.className = 'chip flip';
    });
    if (fps !== null && fps !== undefined) {
      this.el.chipFps.hidden = false;
      this.set('fps', fps, (v) => { this.el.chipFps.textContent = `${v} FPS`; });
    } else {
      this.set('fpsOff', true, () => { this.el.chipFps.hidden = true; });
    }
  }

  countdown(text) {
    const el = this.el.countdown;
    if (text === null) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.textContent = text;
    el.classList.toggle('go', text === 'GO!');
    el.classList.remove('tick');
    void el.offsetWidth;
    el.classList.add('tick');
  }

  banner(main, sub, teamCss, seconds = 2.6, extra = '') {
    const el = this.el.banner;
    el.hidden = false;
    el.style.setProperty('--team', teamCss);
    this.el.bannerMain.textContent = main;
    this.el.bannerSub.textContent = sub || '';
    this.el.bannerExtra.hidden = !extra;
    this.el.bannerExtra.textContent = extra;
    for (const child of el.children) {
      child.style.animation = 'none';
      void child.offsetWidth;
      child.style.animation = '';
    }
    this.bannerTimer = seconds;
  }

  popup(text, points) {
    const el = document.createElement('div');
    el.className = 'pop';
    el.textContent = text;
    if (points) {
      const s = document.createElement('small');
      s.textContent = `+${points}`;
      el.appendChild(s);
    }
    this.el.popups.appendChild(el);
    while (this.el.popups.children.length > 4) this.el.popups.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 1700);
    setTimeout(() => el.remove(), 2150);
  }

  feed(parts) {
    const li = document.createElement('li');
    for (const p of parts) {
      if (typeof p === 'string') {
        const s = document.createElement('span');
        s.className = 'what';
        s.textContent = p;
        li.appendChild(s);
      } else {
        const b = document.createElement('b');
        b.className = p.team === 0 ? 'blue' : 'orange';
        b.textContent = p.name;
        li.appendChild(b);
      }
    }
    this.el.feed.appendChild(li);
    while (this.el.feed.children.length > 5) this.el.feed.firstChild.remove();
    setTimeout(() => li.classList.add('out'), 5000);
    setTimeout(() => li.remove(), 5600);
  }

  replay(on) {
    this.el.replayTag.hidden = !on;
    // '' (inherit) rather than 'visible': a visible child would show through a hidden HUD.
    this.el.boost.style.visibility = on ? 'hidden' : '';
  }

  hint(text) {
    this.el.hint.hidden = !text;
    if (text) this.el.hint.textContent = text;
  }

  showHud(on) {
    this.el.hud.style.visibility = on ? 'visible' : 'hidden';
  }

  update(dt) {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el.banner.hidden = true;
    }
  }
}
