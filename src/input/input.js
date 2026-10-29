// Keyboard, mouse and gamepad input mapped to car controls.
//
// Keyboard and mouse use rebindable actions (two slots each, see ACTIONS). Mouse buttons are stored as
// 'Mouse0' (left), 'Mouse1' (middle) and 'Mouse2' (right). Esc always pauses, so a bad binding can't
// lock anyone out of the menu.
// Gamepad (fixed layout; PlayStation names in brackets): left stick, RT [R2] throttle, LT [L2] reverse,
// A [Cross] jump, B [Circle] boost, X [Square] powerslide / air roll, LB/RB [L1/R1] air roll left/right,
// Y [Triangle] camera, Back [Create] reset, Start [Options] pause. In menus: D-pad or left stick moves,
// A [Cross] selects, B [Circle] goes back. Works with PS5 DualSense, PS4, Xbox and most other pads.

export const ACTIONS = [
  { id: 'forward', label: 'Forward / nose down', keys: ['KeyW', 'ArrowUp'], pad: 'RT, left stick' },
  { id: 'back', label: 'Reverse / nose up', keys: ['KeyS', 'ArrowDown'], pad: 'LT, left stick' },
  { id: 'left', label: 'Steer left', keys: ['KeyA', 'ArrowLeft'], pad: 'Left stick' },
  { id: 'right', label: 'Steer right', keys: ['KeyD', 'ArrowRight'], pad: 'Left stick' },
  { id: 'jump', label: 'Jump / flip', keys: ['Space', 'Mouse2'], pad: 'A' },
  { id: 'boost', label: 'Boost', keys: ['ShiftLeft', 'Mouse0'], pad: 'B' },
  { id: 'powerslide', label: 'Powerslide', keys: ['KeyX', ''], pad: 'X' },
  { id: 'airRoll', label: 'Air roll (hold: steer keys roll)', keys: ['KeyX', ''], pad: 'X' },
  { id: 'rollLeft', label: 'Air roll left', keys: ['KeyQ', ''], pad: 'LB' },
  { id: 'rollRight', label: 'Air roll right', keys: ['KeyE', ''], pad: 'RB' },
  { id: 'ballCam', label: 'Ball cam', keys: ['KeyC', ''], pad: 'Y' },
  { id: 'unlimited', label: 'Unlimited boost', keys: ['KeyB', ''], pad: '' },
  { id: 'freeCam', label: 'Free camera (free play)', keys: ['KeyV', ''], pad: 'R3' },
  { id: 'reset', label: 'Reset (free play only)', keys: ['KeyR', ''], pad: 'Back' },
  { id: 'pause', label: 'Pause (Esc always works)', keys: ['KeyP', ''], pad: 'Start' },
  { id: 'fullscreen', label: 'Fullscreen', keys: ['KeyF', ''], pad: '' },
  { id: 'practice1', label: 'Free play: ball on hood', keys: ['Digit1', 'Numpad1'], pad: '' },
  { id: 'practice2', label: 'Free play: ball in front', keys: ['Digit2', 'Numpad2'], pad: '' },
  { id: 'practice3', label: 'Free play: shoot ball at you', keys: ['Digit3', 'Numpad3'], pad: '' },
  { id: 'practice4', label: 'Free play: ball straight up', keys: ['Digit4', 'Numpad4'], pad: '' },
];

export function defaultBindings() {
  const b = {};
  for (const a of ACTIONS) b[a.id] = [...a.keys];
  return b;
}

// Short display name for a key code.
export function keyName(code) {
  if (!code) return '';
  const fixed = {
    Mouse0: 'Left mouse', Mouse1: 'Middle mouse', Mouse2: 'Right mouse', Space: 'Space',
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    ShiftLeft: 'L Shift', ShiftRight: 'R Shift', ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl',
    AltLeft: 'L Alt', AltRight: 'R Alt', MetaLeft: 'L Meta', MetaRight: 'R Meta', CapsLock: 'Caps',
    Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
    Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  };
  if (fixed[code]) return fixed[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

export class Input {
  constructor(target = window) {
    this.keys = new Set(); // held codes (keys and mouse buttons)
    this.pressed = new Set(); // pressed since last poll (edge)
    this.bindings = defaultBindings();
    this.boundCodes = new Set();
    this.setBindings(this.bindings);
    this.captureFn = null; // set while the controls menu waits for a key
    this.gamepadIndex = null;
    this.padType = null; // 'ps' | 'xbox' | 'generic'
    this.padState = null; // { b: [17 pressed], v: [17 values], lx, ly, rx, ry } read once per frame
    this.lastPad = {};
    this.padPressed = new Set();
    this.padRepeat = {}; // menu direction auto-repeat timers
    this.padCallbacks = [];
    this.rumbleOn = true;
    this.enabled = true;
    this.anyInputCallbacks = [];
    const press = (code) => {
      if (!this.keys.has(code)) this.pressed.add(code);
      this.keys.add(code);
      this.fireAny();
    };
    target.addEventListener('keydown', (e) => {
      if (this.captureFn) {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) this.captureFn(e.code);
        return;
      }
      const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA');
      if (!typing && (this.boundCodes.has(e.code) || e.code === 'Tab')) e.preventDefault();
      if (e.repeat) return;
      press(e.code);
    });
    target.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.keys.clear());
    target.addEventListener('mousedown', (e) => {
      if (this.captureFn) {
        // The click on a binding button starts the capture; later clicks bind that mouse button.
        if (e.target && e.target.closest && e.target.closest('.bindBtn.waiting')) return;
        // Clicking another control (a menu button, another key box) cancels instead of binding.
        if (e.target && e.target.closest && e.target.closest('button, input, select, a')) {
          this.captureFn(null);
          return;
        }
        e.preventDefault();
        this.captureFn(`Mouse${e.button}`);
        return;
      }
      if (e.target && e.target.closest && e.target.closest('button, input, select, label, .menu')) return;
      press(`Mouse${e.button}`);
    });
    target.addEventListener('mouseup', (e) => {
      this.keys.delete(`Mouse${e.button}`);
    });
    target.addEventListener('contextmenu', (e) => {
      if (e.target && e.target.tagName === 'CANVAS') e.preventDefault();
    });
    // Browsers only show a controller after one of its buttons is pressed.
    window.addEventListener('gamepadconnected', (e) => {
      this.gamepadIndex = e.gamepad.index;
      this.padType = padTypeOf(e.gamepad.id);
      for (const fn of this.padCallbacks) fn(true, this.padType, e.gamepad.id);
      this.fireAny();
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      if (this.gamepadIndex !== e.gamepad.index) return;
      this.gamepadIndex = null;
      this.padState = null;
      for (const fn of this.padCallbacks) fn(false, this.padType, e.gamepad.id);
    });
  }

  onPadChange(fn) {
    this.padCallbacks.push(fn);
  }

  // bindings: { actionId: [code, code] }. Missing actions get their defaults.
  setBindings(bindings) {
    const def = defaultBindings();
    this.bindings = {};
    for (const a of ACTIONS) {
      const v = bindings && Array.isArray(bindings[a.id]) ? bindings[a.id] : def[a.id];
      this.bindings[a.id] = [v[0] || '', v[1] || ''];
    }
    this.boundCodes = new Set(Object.values(this.bindings).flat().filter(Boolean));
  }

  // Calls fn(code) with the next key or mouse button, once. Escape cancels (fn gets null).
  captureNext(fn) {
    this.keys.clear();
    this.captureFn = (code) => {
      this.captureFn = null;
      this.pressed.clear();
      fn(code === 'Escape' ? null : code);
    };
  }

  cancelCapture() {
    this.captureFn = null;
  }

  onAnyInput(fn) {
    this.anyInputCallbacks.push(fn);
  }

  fireAny() {
    for (const fn of this.anyInputCallbacks) fn();
  }

  held(action) {
    const b = this.bindings[action];
    return !!(b && ((b[0] && this.keys.has(b[0])) || (b[1] && this.keys.has(b[1]))));
  }

  // Edge-triggered: true once per press of any key bound to the action.
  consumeAction(action) {
    const b = this.bindings[action];
    if (!b) return false;
    let hit = false;
    for (const code of b) {
      if (code && this.pressed.has(code)) {
        this.pressed.delete(code);
        hit = true;
      }
    }
    return hit;
  }

  // Edge-triggered raw key (menu keys that are not rebindable: Escape, Enter).
  consume(code) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  consumePad(name) {
    if (this.padPressed.has(name)) {
      this.padPressed.delete(name);
      return true;
    }
    return false;
  }

  clearEdges() {
    this.pressed.clear();
    this.padPressed.clear();
  }

  pad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    let gp = this.gamepadIndex !== null ? pads[this.gamepadIndex] : null;
    if (!gp || !gp.connected) {
      // The remembered slot can be empty after a reconnect: take any connected pad.
      gp = null;
      for (const p of pads) {
        if (p && p.connected) {
          gp = p;
          this.gamepadIndex = p.index;
          this.padType = padTypeOf(p.id);
          break;
        }
      }
    }
    return gp;
  }

  // Read the controller once per frame (also outside matches, for the menus) and record button
  // presses as edges. Names: a b x y lb rb lt rt back start l3 r3 up down left right home touch.
  pollPad(dt = 1 / 60) {
    const gp = this.pad();
    if (!gp) {
      this.padState = null;
      return;
    }
    const st = normalizePad(gp);
    this.padState = st;
    const names = ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'back', 'start', 'l3', 'r3', 'up', 'down', 'left', 'right', 'home', 'touch'];
    for (let i = 0; i < names.length; i++) {
      const now = st.b[i];
      if (now && !this.lastPad[names[i]]) {
        this.padPressed.add(names[i]);
        this.fireAny();
      }
      this.lastPad[names[i]] = now;
    }
    // Menu directions from the D-pad or the left stick, repeating while held.
    const dirs = {
      navUp: st.b[12] || st.ly < -0.55,
      navDown: st.b[13] || st.ly > 0.55,
      navLeft: st.b[14] || st.lx < -0.55,
      navRight: st.b[15] || st.lx > 0.55,
    };
    for (const [n, held] of Object.entries(dirs)) {
      if (!held) {
        this.padRepeat[n] = null;
        continue;
      }
      if (this.padRepeat[n] === null || this.padRepeat[n] === undefined) {
        this.padPressed.add(n);
        this.padRepeat[n] = 0.38;
      } else {
        this.padRepeat[n] -= dt;
        if (this.padRepeat[n] <= 0) {
          this.padPressed.add(n);
          this.padRepeat[n] = 0.11;
        }
      }
    }
  }

  // Vibration (strong = big left motor, weak = small right motor, 0..1). Silently does nothing where
  // the browser or controller does not support it.
  rumble(strong, weak, ms) {
    if (!this.rumbleOn) return;
    const gp = this.pad();
    const act = gp && gp.vibrationActuator;
    if (!act || !act.playEffect) return;
    if (act.effects && !act.effects.includes('dual-rumble')) return;
    try {
      const r = act.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) });
      if (r && r.catch) r.catch(() => {});
    } catch (e) {
      // Not supported here.
    }
  }

  // Fill a Controls object for the player's car.
  read(controls) {
    const h = (a) => this.held(a);
    const fwd = (h('forward') ? 1 : 0) - (h('back') ? 1 : 0);
    const side = (h('right') ? 1 : 0) - (h('left') ? 1 : 0);
    const airRoll = h('airRoll');
    const rollKeys = (h('rollRight') ? 1 : 0) - (h('rollLeft') ? 1 : 0);
    controls.throttle = fwd;
    controls.steer = side;
    controls.pitch = -fwd; // forward = nose down
    // Holding air roll turns the steer keys into air roll left / right (like the roll keys).
    controls.yaw = airRoll ? 0 : side;
    controls.roll = airRoll ? side || rollKeys : rollKeys;
    controls.jump = h('jump');
    controls.boost = h('boost');
    controls.handbrake = h('powerslide');

    const st = this.padState;
    if (st) {
      const dz = (v) => (Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88);
      const lx = dz(st.lx);
      const ly = dz(st.ly);
      const b = (i) => st.b[i];
      const padThrottle = st.v[7] - st.v[6];
      const padRoll = b(2);
      if (Math.abs(padThrottle) > 0.02 || Math.abs(lx) > 0 || Math.abs(ly) > 0 || b(0) || b(1) || b(2) || b(4) || b(5)) {
        controls.throttle = Math.abs(padThrottle) > 0.02 ? padThrottle : controls.throttle;
        controls.steer = lx || controls.steer;
        controls.pitch = ly ? ly : controls.pitch; // stick down = nose up
        controls.yaw = padRoll ? 0 : lx || controls.yaw;
        const bumpers = (b(5) ? 1 : 0) - (b(4) ? 1 : 0);
        controls.roll = padRoll ? lx : bumpers || controls.roll;
        controls.jump = controls.jump || b(0);
        controls.boost = controls.boost || b(1);
        controls.handbrake = controls.handbrake || padRoll;
      }
    }
    if (!this.enabled) controls.reset();
    return controls;
  }
}

export function padTypeOf(id = '') {
  if (/054c|dualsense|dualshock|playstation|wireless controller/i.test(id)) return 'ps';
  if (/045e|xbox|xinput/i.test(id)) return 'xbox';
  return 'generic';
}

// Buttons in the standard order (0 bottom face, 1 right face, 2 left face, 3 top face, 4/5 bumpers,
// 6/7 triggers, 8 back/create, 9 start/options, 10/11 stick clicks, 12-15 D-pad, 16 home/PS,
// 17 touchpad) and the two sticks.
function normalizePad(gp) {
  const b = new Array(18).fill(false);
  const v = new Array(18).fill(0);
  const get = (i) => gp.buttons[i];
  if (gp.mapping === 'standard' || !/054c|dualsense|dualshock|wireless controller/i.test(gp.id)) {
    for (let i = 0; i < 18; i++) {
      const btn = get(i);
      if (!btn) continue;
      b[i] = !!btn.pressed;
      v[i] = btn.value || (btn.pressed ? 1 : 0);
    }
    return { b, v, lx: gp.axes[0] || 0, ly: gp.axes[1] || 0, rx: gp.axes[2] || 0, ry: gp.axes[3] || 0 };
  }
  // Sony pads without the standard mapping (some Linux / Firefox setups) report a raw order:
  // square, cross, circle, triangle, L1, R1, L2, R2, create, options, L3, R3, PS, touchpad, and the
  // triggers on axes 3 and 4 with the right stick on axes 2 and 5. Best effort: setups differ.
  const raw = (i) => !!(get(i) && get(i).pressed);
  const order = [1, 2, 0, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  order.forEach((ri, si) => {
    b[si] = raw(ri);
    v[si] = b[si] ? 1 : 0;
  });
  const trig = (ax) => (gp.axes[ax] === undefined ? 0 : (gp.axes[ax] + 1) / 2);
  v[6] = Math.max(v[6], trig(3));
  v[7] = Math.max(v[7], trig(4));
  b[6] = b[6] || v[6] > 0.5;
  b[7] = b[7] || v[7] > 0.5;
  b[16] = raw(12);
  b[17] = raw(13);
  // D-pad often arrives as a hat axis (axes 6/7) on raw mappings.
  const hx = gp.axes[6] || 0;
  const hy = gp.axes[7] || 0;
  b[12] = hy < -0.5;
  b[13] = hy > 0.5;
  b[14] = hx < -0.5;
  b[15] = hx > 0.5;
  return { b, v, lx: gp.axes[0] || 0, ly: gp.axes[1] || 0, rx: gp.axes[2] || 0, ry: gp.axes[5] || 0 };
}

// Button names for the connected pad type.
const PS_NAMES = { A: 'Cross', B: 'Circle', X: 'Square', Y: 'Triangle', LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2', Back: 'Create', Start: 'Options' };
export function padLabel(text, type) {
  if (type !== 'ps' || !text) return text;
  return text.replace(/\b(A|B|X|Y|LB|RB|LT|RT|Back|Start)\b/g, (m) => PS_NAMES[m] || m);
}
