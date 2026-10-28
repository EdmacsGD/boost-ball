import './ui/style.css';
import { Game } from './game/game.js';

const fill = document.getElementById('ldFill');
const text = document.getElementById('ldText');
const loading = document.getElementById('loading');

function progress(f, label) {
  fill.style.width = `${Math.round(f * 100)}%`;
  text.textContent = label;
}

// The physics engine is WebAssembly. Some hosts forbid compiling it; detect that up front
// with an empty module so the player gets a clear message instead of a stuck loading bar.
function wasmAllowed() {
  try {
    new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

async function start(restored = {}) {
  if (typeof WebAssembly === 'undefined' || !wasmAllowed()) {
    text.textContent = 'This page blocks WebAssembly, which the physics needs. Download the game file and open it in Chrome.';
    fill.style.background = '#ff5a5f';
    fill.style.width = '100%';
    return;
  }
  try {
    const game = new Game(document.getElementById('view'), progress, restored);
    window.__game = game;
    await game.init();
    loading.classList.add('done');
    setTimeout(() => loading.remove(), 700);
    // Keep settings when the page is republished while open.
    window.claude?.hot?.snapshot?.(() => ({ settings: game.settings }));
  } catch (err) {
    console.error(err);
    text.textContent = 'Could not start: ' + (err && err.message ? err.message : err);
    fill.style.background = '#ff5a5f';
  }
}

if (window.claude?.hot?.ready) window.claude.hot.ready(start);
else start(window.claude?.hot?.data ?? {});
