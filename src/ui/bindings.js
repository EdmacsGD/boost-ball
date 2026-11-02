// Controls menu: every keyboard / mouse action has two key boxes and a controller box. Click a key box,
// then press a key or a mouse button (click empty space in the panel) to bind it. Click a controller
// box, then press a button on the controller. Esc cancels, Backspace clears the box.
import { ACTIONS, keyName, defaultBindings, defaultPadBindings, PAD_FIXED, padButtonName } from '../input/input.js';

export function setupBindings(input, onChange) {
  const rows = document.getElementById('bindRows');
  const hint = document.getElementById('bindHint');
  const HINT = 'Click a box, then press a key, mouse button or controller button. Esc cancels, Backspace clears.';
  let padWaiting = null;
  let waiting = null;

  const render = () => {
    rows.textContent = '';
    const counts = new Map();
    for (const codes of Object.values(input.bindings)) for (const c of codes) if (c) counts.set(c, (counts.get(c) || 0) + 1);
    const padCounts = new Map();
    for (const i of Object.values(input.padBindings)) if (i >= 0) padCounts.set(i, (padCounts.get(i) || 0) + 1);
    for (const a of ACTIONS) {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.textContent = a.label;
      tr.appendChild(th);
      for (let slot = 0; slot < 2; slot++) {
        const td = document.createElement('td');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'bindBtn';
        const code = input.bindings[a.id][slot];
        b.textContent = code ? keyName(code) : '-';
        if (!code) b.classList.add('empty');
        // Shared keys are allowed (powerslide and air roll share X by default); mark them so it's visible.
        if (code && counts.get(code) > 1) b.classList.add('shared');
        if (waiting && waiting.id === a.id && waiting.slot === slot) {
          b.classList.add('waiting');
          b.textContent = 'Press a key';
        }
        b.addEventListener('click', () => start(a.id, slot));
        td.appendChild(b);
        tr.appendChild(td);
      }
      // Controller box (steering stays on the left stick).
      const pad = document.createElement('td');
      if (PAD_FIXED[a.id]) {
        pad.textContent = PAD_FIXED[a.id];
        pad.className = 'pad-fixed';
      } else {
        const pb = document.createElement('button');
        pb.type = 'button';
        pb.className = 'bindBtn padBtn';
        const idx = input.padBindings[a.id];
        pb.textContent = padButtonName(idx, input.padType);
        if (!(idx >= 0)) pb.classList.add('empty');
        if (idx >= 0 && padCounts.get(idx) > 1) pb.classList.add('shared');
        if (padWaiting === a.id) {
          pb.classList.add('waiting');
          pb.textContent = 'Press a button';
        }
        pb.addEventListener('click', () => startPad(a.id));
        pad.appendChild(pb);
      }
      tr.appendChild(pad);
      rows.appendChild(tr);
    }
  };

  const start = (id, slot) => {
    if (padWaiting) {
      padWaiting = null;
      input.padCaptureFn = null;
    }
    waiting = { id, slot };
    hint.textContent = 'Press a key or mouse button now. Esc cancels, Backspace clears.';
    render();
    input.captureNext((code) => {
      const w = waiting;
      waiting = null;
      hint.textContent = HINT;
      if (code && w) {
        const b = { ...input.bindings, [w.id]: [...input.bindings[w.id]] };
        b[w.id][w.slot] = code === 'Backspace' ? '' : code;
        input.setBindings(b);
        onChange(input.bindings, input.padBindings);
      }
      render();
    });
  };

  // Controller: wait for a button. Esc (or Backspace to clear) on the keyboard also works.
  const startPad = (id) => {
    input.cancelCapture();
    input.cancelPadCapture();
    waiting = null;
    padWaiting = id;
    hint.textContent = input.padState ? 'Press a button on the controller now. Esc cancels, Backspace clears.' : 'Connect a controller and press a button on it. Esc cancels.';
    render();
    const finish = (i, clear = false) => {
      if (padWaiting !== id) return;
      padWaiting = null;
      input.cancelCapture();
      input.padCaptureFn = null;
      hint.textContent = HINT;
      if (i !== null || clear) {
        input.setPadBindings({ ...input.padBindings, [id]: clear ? -1 : i });
        onChange(input.bindings, input.padBindings);
      }
      render();
    };
    input.capturePad((i) => finish(i));
    input.captureNext((code) => finish(null, code === 'Backspace'));
  };

  document.getElementById('bindReset').addEventListener('click', () => {
    input.cancelCapture();
    input.padCaptureFn = null;
    waiting = null;
    padWaiting = null;
    hint.textContent = HINT;
    input.setBindings(defaultBindings());
    input.setPadBindings(defaultPadBindings());
    onChange(input.bindings, input.padBindings);
    render();
  });
  hint.textContent = HINT;
  render();
  return render;
}
