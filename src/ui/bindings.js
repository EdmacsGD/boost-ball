// Controls menu: every keyboard / mouse action has two key boxes. Click one, then press a key or a
// mouse button (click empty space in the panel) to bind it. Esc cancels, Backspace clears the box.
import { ACTIONS, keyName, defaultBindings, padLabel } from '../input/input.js';

export function setupBindings(input, onChange) {
  const rows = document.getElementById('bindRows');
  const hint = document.getElementById('bindHint');
  const HINT = 'Click a box, then press a key or mouse button. Esc cancels, Backspace clears.';
  let waiting = null;

  const render = () => {
    rows.textContent = '';
    const counts = new Map();
    for (const codes of Object.values(input.bindings)) for (const c of codes) if (c) counts.set(c, (counts.get(c) || 0) + 1);
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
      const pad = document.createElement('td');
      pad.textContent = padLabel(a.pad, input.padState || input.padType ? input.padType : null);
      tr.appendChild(pad);
      rows.appendChild(tr);
    }
  };

  const start = (id, slot) => {
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
        onChange(input.bindings);
      }
      render();
    });
  };

  document.getElementById('bindReset').addEventListener('click', () => {
    input.cancelCapture();
    waiting = null;
    hint.textContent = HINT;
    input.setBindings(defaultBindings());
    onChange(input.bindings);
    render();
  });
  hint.textContent = HINT;
  render();
  return render;
}
