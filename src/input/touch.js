// Phone and tablet controls: a joystick that appears where the left thumb touches (drive and steer
// on the ground, pitch and turn in the air) and buttons on the right (jump, boost, drift / air roll,
// ball cam), plus pause and fullscreen. They show while you play with touch and hide again as soon
// as a key is pressed, so a laptop with a touch screen still plays normally with the keyboard.
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const RADIUS = 58; // px the knob can move from the center
const DEAD = 0.14;

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.on = false; // touch mode (last input was a touch)
    this.state = { x: 0, y: 0, jump: false, boost: false, drift: false, active: false };
    this.input.touch = this.state;
    this.stick = null; // { id, ox, oy }
    this.held = new Map(); // pointerId -> button name
    this.build();
    window.addEventListener('touchstart', () => this.setMode(true), { passive: true, capture: true });
    window.addEventListener('keydown', () => this.setMode(false), true);
    // A mouse click (not a touch) also leaves touch mode.
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') this.setMode(false);
    }, true);
  }

  setMode(on) {
    if (this.on === on) return;
    this.on = on;
    document.body.classList.toggle('touch', on);
    if (!on) this.release();
  }

  build() {
    const root = el('div', 'touch-ui');
    root.id = 'touchUi';
    root.hidden = true;
    // Left: joystick area.
    this.zone = el('div', 'touch-zone');
    this.base = el('div', 'touch-stick');
    this.knob = el('div', 'touch-knob');
    this.base.appendChild(this.knob);
    this.base.hidden = true;
    this.zone.appendChild(this.base);
    this.zone.appendChild(el('span', 'touch-zone-hint', 'Drag to drive'));
    // Right: action buttons.
    const pad = el('div', 'touch-pad');
    const mk = (name, label, cls) => {
      const b = el('div', `touch-btn ${cls}`, label);
      b.dataset.btn = name;
      b.setAttribute('role', 'button');
      b.setAttribute('aria-label', label);
      return b;
    };
    this.btns = {
      jump: mk('jump', 'JUMP', 'tb-jump'),
      boost: mk('boost', 'BOOST', 'tb-boost'),
      drift: mk('drift', 'DRIFT', 'tb-drift'),
      cam: mk('cam', 'BALL CAM', 'tb-cam'),
    };
    pad.append(...Object.values(this.btns));
    // Top: pause and fullscreen.
    const top = el('div', 'touch-top');
    this.pauseBtn = el('button', 'touch-small', 'Pause');
    this.pauseBtn.type = 'button';
    this.pauseBtn.addEventListener('click', () => this.game.setPaused(true));
    this.fullBtn = el('button', 'touch-small', 'Fullscreen');
    this.fullBtn.type = 'button';
    this.fullBtn.addEventListener('click', () => this.game.toggleFullscreen());
    top.append(this.pauseBtn, this.fullBtn);
    // Phones held upright: ask to turn sideways (the field is wide).
    this.rotate = el('div', 'touch-rotate', 'Turn your phone sideways to play');
    root.append(this.zone, pad, top, this.rotate);
    document.getElementById('app').appendChild(root);
    this.root = root;

    this.zone.addEventListener('pointerdown', (e) => this.stickDown(e));
    pad.addEventListener('pointerdown', (e) => this.btnDown(e));
    const move = (e) => this.stickMove(e);
    const up = (e) => this.pointerUp(e);
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
    root.addEventListener('lostpointercapture', up);
    // No page scrolling, zooming or long-press menus while playing.
    root.addEventListener('touchstart', (e) => {
      // Real buttons (pause, fullscreen) still need their tap to become a click.
      if (!e.target.closest('button')) e.preventDefault();
    }, { passive: false });
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  stickDown(e) {
    if (this.stick) return;
    e.preventDefault();
    this.zone.setPointerCapture?.(e.pointerId);
    const r = this.root.getBoundingClientRect();
    this.stick = { id: e.pointerId, ox: e.clientX - r.left, oy: e.clientY - r.top };
    this.base.style.left = `${this.stick.ox}px`;
    this.base.style.top = `${this.stick.oy}px`;
    this.base.hidden = false;
    this.zone.classList.add('used');
    this.stickMove(e);
  }

  stickMove(e) {
    if (!this.stick || e.pointerId !== this.stick.id) return;
    const r = this.root.getBoundingClientRect();
    let dx = e.clientX - r.left - this.stick.ox;
    let dy = e.clientY - r.top - this.stick.oy;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx *= RADIUS / len;
      dy *= RADIUS / len;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const dz = (v) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));
    this.state.x = dz(dx / RADIUS);
    this.state.y = dz(dy / RADIUS);
  }

  btnDown(e) {
    const b = e.target.closest('.touch-btn');
    if (!b) return;
    e.preventDefault();
    b.setPointerCapture?.(e.pointerId);
    const name = b.dataset.btn;
    this.held.set(e.pointerId, name);
    b.classList.add('down');
    if (name === 'cam') {
      this.game.cameraRig.ballCam = !this.game.cameraRig.ballCam;
      this.syncCam();
      return;
    }
    if (name === 'jump' && this.game.state === 'replay') this.game.skipReplayByTouch?.();
    this.state[name] = true;
  }

  pointerUp(e) {
    if (this.stick && e.pointerId === this.stick.id) {
      this.stick = null;
      this.state.x = 0;
      this.state.y = 0;
      this.base.hidden = true;
      this.knob.style.transform = '';
    }
    const name = this.held.get(e.pointerId);
    if (name) {
      this.held.delete(e.pointerId);
      if (![...this.held.values()].includes(name)) {
        if (name in this.state) this.state[name] = false;
        this.btns[name]?.classList.remove('down');
      }
    }
  }

  release() {
    this.stick = null;
    this.held.clear();
    Object.assign(this.state, { x: 0, y: 0, jump: false, boost: false, drift: false });
    this.base.hidden = true;
    for (const b of Object.values(this.btns)) b.classList.remove('down');
  }

  syncCam() {
    this.btns.cam.classList.toggle('on', !!this.game.cameraRig.ballCam);
  }

  // Each frame: show the controls only in a match or free play while in touch mode.
  update() {
    const g = this.game;
    const playing = ['play', 'countdown', 'goal', 'replay'].includes(g.state) && !g.paused && !g.freeCam.active;
    const show = this.on && playing;
    if (this.root.hidden === show) {
      this.root.hidden = !show;
      if (!show) this.release();
      this.syncCam();
    }
    this.state.active = show;
    this.fullBtn.hidden = !document.fullscreenEnabled;
    this.fullBtn.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
  }
}
