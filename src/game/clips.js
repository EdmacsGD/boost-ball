// Clips: save moments during a match with Ctrl+Q, cut and post them from the end screen, and watch
// everyone's clips in the Clips feed (scroll for the next one, like, comment).
//
// A clip is not a video. It is the match recording (every car and the ball, 30 times a second) for
// that stretch, plus each car's looks, and the game plays it back in 3D. That keeps a 30 s 3v3 clip
// around 100 KB instead of several MB, and it always looks as good as the viewer's graphics setting.
import { CONFIG } from '../config.js';
import { DESIGNS } from '../render/carDesigns.js';
import { THEMES } from '../render/arenaThemes.js';
import { MatchRecorder } from './replay.js';
import { iconSvg } from '../ui/icons.js';
import * as api from '../net/clipsApi.js';

const MIN_LEN = 1;
const MAX_LEN = 30;
const MAX_MARKS = 20;
const AFTER = 1.5; // seconds kept after the Ctrl+Q press (the follow-through, the explosion)

// ------------------------------------------------------------------ codec
// Each recorded number is stored as a 16-bit integer with a fixed scale for its slot:
// positions in 2 cm steps, rotations in 1/32000, time in milliseconds from the clip start.
const HEAD = 11;
const CAR_F = 10;
function scales(nCars) {
  const s = [1000, 1, 1, 50, 50, 50, 32000, 32000, 32000, 32000, 1];
  for (let i = 0; i < nCars; i++) s.push(50, 50, 50, 32000, 32000, 32000, 32000, 1, 10000, 1000);
  return s;
}

function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(text) {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

// Cut [t0, t1] out of a MatchRecorder into the text stored in the database.
export async function packClip(rec, t0, t1, meta) {
  const i0 = rec.indexAt(t0);
  const i1 = rec.indexAt(t1);
  const n = Math.max(0, i1 - i0 + 1);
  const stride = rec.stride;
  const sc = scales(rec.ids.length);
  const q = new Int16Array(n * stride);
  const base = rec.data[i0 * stride];
  for (let f = 0; f < n; f++) {
    const o = (i0 + f) * stride;
    for (let k = 0; k < stride; k++) {
      let v = rec.data[o + k];
      if (k === 0) v -= base;
      q[f * stride + k] = Math.max(-32767, Math.min(32767, Math.round(v * sc[k])));
    }
  }
  const full = { ...meta, v: 1, frames: n, goals: rec.goals.filter((g) => g.t >= t0 && g.t <= t1).map((g) => ({ ...g, t: g.t - base })) };
  const json = new TextEncoder().encode(JSON.stringify(full));
  const pad = json.length % 2;
  const bytes = new Uint8Array(4 + json.length + pad + q.byteLength);
  new DataView(bytes.buffer).setUint32(0, json.length, true);
  bytes.set(json, 4);
  bytes.set(new Uint8Array(q.buffer), 4 + json.length + pad);
  if (typeof CompressionStream === 'function') return `g1:${toB64(await pipe(bytes, new CompressionStream('gzip')))}`;
  return `r1:${toB64(bytes)}`;
}

// Text from the database back into { meta, data, count, stride } (car ids are filled in later).
export async function unpackClip(text) {
  const kind = text.slice(0, 3);
  let bytes = fromB64(text.slice(3));
  if (kind === 'g1:') bytes = await pipe(bytes, new DecompressionStream('gzip'));
  else if (kind !== 'r1:') throw new Error('Unknown clip format');
  const len = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true);
  const meta = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + len)));
  const off = 4 + len + (len % 2);
  const nCars = meta.cars.length;
  const stride = HEAD + nCars * CAR_F;
  const q = new Int16Array(bytes.buffer.slice(bytes.byteOffset + off, bytes.byteOffset + off + meta.frames * stride * 2));
  const sc = scales(nCars);
  const data = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) data[i] = q[i] / sc[i % stride];
  return { meta, data, count: meta.frames, stride };
}

// A recording for clip playback: a MatchRecorder holding the decoded frames under new car ids.
function recorderFor(clip, carIds) {
  const r = new MatchRecorder(carIds);
  r.data = clip.data;
  r.count = clip.count;
  r.goals = clip.meta.goals || [];
  return r;
}

// A stretch [a, b] of a recording, in the shape the theater plays.
class RangeView {
  constructor(rec, a, b) {
    this.rec = rec;
    this.start = a;
    this.end = b;
    this.count = rec.count;
    this.goals = rec.goals.filter((g) => g.t >= a && g.t <= b);
  }

  sample(t) {
    return this.rec.sample(Math.max(this.start, Math.min(this.end, t)));
  }
}

// ------------------------------------------------------------------ small helpers
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const button = (cls, text, fn, title) => {
  const b = el('button', cls, text);
  b.type = 'button';
  if (title) b.title = title;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    fn(b);
    b.blur();
  });
  return b;
};
const icon = (name) => {
  const i = el('i', 'clip-ic');
  i.innerHTML = name === 'chat'
    ? '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" aria-hidden="true"><path d="M4 3h16a2 2 0 012 2v11a2 2 0 01-2 2H9l-5 4v-4a2 2 0 01-2-2V5a2 2 0 012-2z"/></svg>'
    : name === 'cam'
      ? '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" aria-hidden="true"><path d="M3 7h3l2-3h8l2 3h3a1 1 0 011 1v11a1 1 0 01-1 1H3a1 1 0 01-1-1V8a1 1 0 011-1zm9 3a4 4 0 100 8 4 4 0 000-8z"/></svg>'
      : name === 'trash'
        ? '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" aria-hidden="true"><path d="M9 2h6l1 2h5v2H3V4h5zM5 8h14l-1.2 14H6.2z"/></svg>'
        : iconSvg(name);
  return i;
};
function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
const arenaName = (id) => (id ? id.charAt(0).toUpperCase() + id.slice(1) : '');
const fmt = (sec) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.floor(Math.max(0, sec) % 60)).padStart(2, '0')}`;

// ------------------------------------------------------------------ the studio
export class ClipStudio {
  constructor(game) {
    this.game = game;
    this.active = null; // 'edit' | 'feed' | null
    this.root = null;
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    const btn = document.getElementById('clipsBtn');
    if (btn) btn.addEventListener('click', () => this.openEditor());
  }

  // ------------------------------------------------ Ctrl+Q during a match
  onKey(e) {
    if (e.ctrlKey && !e.altKey && !e.metaKey && e.code === 'KeyQ') {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) this.mark();
      return;
    }
    if (!this.active) return;
    const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (this.commentsOpen) this.closeComments();
      else if (this.active === 'edit') this.closeEditor();
      else this.closeFeed();
      return;
    }
    if (typing) return;
    if (this.active === 'feed') {
      if (e.code === 'ArrowDown' || e.code === 'KeyS' || e.code === 'PageDown') this.step(1);
      else if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'PageUp') this.step(-1);
      else if (e.code === 'KeyL') this.toggleLike();
      else if (e.code === 'KeyC') this.toggleComments();
      else return;
      e.preventDefault();
      e.stopPropagation();
    }
  }

  mark() {
    const g = this.game;
    const rec = g.matchRec;
    const live = rec && rec.count > 0 && ['play', 'goal', 'replay', 'countdown'].includes(g.state);
    if (!live) return;
    if (g.endlessOn) {
      g.hud.popup('CLIPS: NOT IN THE SKY FIELD');
      return;
    }
    if (g.clipMarks.length >= MAX_MARKS) {
      g.hud.popup(`CLIPS FULL (${MAX_MARKS})`);
      return;
    }
    g.clipMarks.push(rec.end);
    this.repin();
    g.hud.popup(g.mode === 'free' ? `CLIP SAVED (${g.clipMarks.length}) · ESC TO EDIT` : `CLIP SAVED (${g.clipMarks.length})`);
    g.audio.play?.('click');
  }

  refreshResultsButton() {
    const b = document.getElementById('clipsBtn');
    if (!b) return;
    const n = (this.game.clipMarks || []).length;
    b.hidden = !n || !this.game.lastMatch;
    b.textContent = `Your clips (${n})`;
  }

  // Free play: the clips are edited from the pause menu (there is no end screen).
  refreshPauseButton() {
    const b = document.getElementById('pauseClipsBtn');
    if (!b) return;
    const g = this.game;
    if (!this.pauseHooked) {
      this.pauseHooked = true;
      b.addEventListener('click', () => {
        g.setPaused(false);
        this.openEditor();
      });
    }
    const n = this.liveMarks().length;
    b.hidden = !(g.mode === 'free' && !g.np && n);
    b.textContent = `Your clips (${n})`;
  }

  // Stop whatever is open (used when a match or menu takes over).
  closeAll() {
    if (this.active === 'edit') this.closeEditor();
    else if (this.active === 'feed') this.closeFeed();
  }

  mount(cls) {
    if (this.root) this.root.remove();
    this.root = el('div', `clip-ui ${cls}`);
    document.getElementById('results').parentElement.appendChild(this.root);
    return this.root;
  }

  unmount() {
    if (this.offFeed) this.offFeed();
    this.offFeed = null;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.root) this.root.remove();
    this.root = null;
    this.commentsOpen = false;
  }

  canPost() {
    const a = this.game.account;
    return api.clipsSupported() && a.signedIn && a.online && a.online.id;
  }

  // ------------------------------------------------ editor
  // The recording the clips come from: the finished match on the end screen, or the rolling
  // free play recording.
  source() {
    const g = this.game;
    return g.state === 'ended' || (this.active === 'edit' && this.fromEnd) ? g.lastMatch : g.matchRec;
  }

  // Marks still inside the recording (free play only keeps the last minute).
  liveMarks() {
    const g = this.game;
    const rec = g.state === 'ended' ? g.lastMatch : g.matchRec;
    if (!rec || !rec.count) return [];
    g.clipMarks = (g.clipMarks || []).filter((m) => m > rec.start + 1);
    return g.clipMarks;
  }

  openEditor() {
    const g = this.game;
    this.fromEnd = g.state === 'ended';
    const src = this.source();
    if (!src || !this.liveMarks().length) return;
    document.getElementById('results').hidden = true;
    this.active = 'edit';
    this.sel = g.clipMarks.length - 1; // the newest
    this.cam = g.players.indexOf(g.player);
    if (!this.trims || this.trims.rec !== src) this.trims = { rec: src, map: new Map() };
    if (!this.posted || this.posted.rec !== src) this.posted = { rec: src, set: new Set() };
    this.buildEditor();
    this.selectMark(this.sel);
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      this.drawPlayhead();
    };
    this.raf = requestAnimationFrame(tick);
  }

  // The stretch of recording the trim strip shows for a mark: up to 30 s before it, 5 s after.
  windowFor(m) {
    const src = this.source();
    return [Math.max(src.start, m - MAX_LEN), Math.min(src.end, m + 5)];
  }

  range() {
    const m = this.game.clipMarks[this.sel];
    let r = this.trims.map.get(m);
    if (!r) {
      const [wa, wb] = this.windowFor(m);
      const b = Math.min(wb, m + AFTER);
      r = [Math.max(wa, b - 10), b];
      this.trims.map.set(m, r);
    }
    return r;
  }

  selectMark(i) {
    this.sel = i;
    this.status.textContent = '';
    const [a, b] = this.range();
    this.view = new RangeView(this.source(), a, b);
    const th = this.game.theater;
    if (this.game.state === 'theater' && th.clipRec) th.swapClip(this.view, this.camKey());
    else th.openClip(this.view, this.camKey());
    this.drawStrip();
    this.refreshEditor();
  }

  camKey() {
    return this.cam >= 0 ? this.cam : 'ball';
  }

  buildEditor() {
    const g = this.game;
    const root = this.mount('clip-editor');
    const panel = el('div', 'clip-panel');
    const head = el('div', 'clip-head');
    head.append(el('h3', '', 'Your clips'), el('span', 'clip-help', 'Saved with Ctrl+Q. Drag the ends of the strip to trim, then post.'));
    this.markRow = el('div', 'clip-chips');
    // Trim strip: the ball's speed over time (spikes are hits), the kept part between two handles.
    const trim = el('div', 'trim');
    this.track = el('div', 'trim-track');
    this.canvas = el('canvas', 'trim-bars');
    this.shadeL = el('div', 'trim-shade');
    this.shadeR = el('div', 'trim-shade');
    this.selBox = el('div', 'trim-sel');
    this.hA = el('div', 'trim-h a');
    this.hB = el('div', 'trim-h b');
    for (const [h, label] of [[this.hA, 'Clip start'], [this.hB, 'Clip end']]) {
      h.tabIndex = 0;
      h.setAttribute('role', 'slider');
      h.setAttribute('aria-label', label);
      h.appendChild(el('i'));
    }
    this.playhead = el('div', 'trim-play');
    this.markTick = el('div', 'trim-mark');
    this.track.append(this.canvas, this.shadeL, this.shadeR, this.selBox, this.markTick, this.playhead, this.hA, this.hB);
    this.trimInfo = el('div', 'trim-info');
    trim.append(this.track, this.trimInfo);
    this.bindTrim();
    const camRow = el('div', 'clip-chips');
    camRow.appendChild(el('span', 'clip-label', 'Camera'));
    const me = g.players.indexOf(g.player);
    this.camBtns = [[me, 'Your car'], [-1, 'Ball']].map(([v, text]) => {
      const b = button('small-btn', text, () => {
        this.cam = v;
        g.theater.cam = this.camKey();
        g.cameraRig.snap();
        this.refreshEditor();
      });
      camRow.appendChild(b);
      return [v, b];
    });
    const postRow = el('div', 'clip-post');
    this.title = el('input');
    this.title.type = 'text';
    this.title.maxLength = 60;
    this.title.placeholder = 'Title (optional)';
    this.title.setAttribute('aria-label', 'Clip title');
    this.postBtn = button('primary', 'Post clip', () => this.post());
    postRow.append(this.title, this.postBtn);
    this.status = el('p', 'clip-status', '');
    const foot = el('div', 'clip-chips');
    foot.append(
      button('small-btn', 'Remove this clip', () => this.removeMark()),
      button('small-btn', this.fromEnd ? 'Back to results' : 'Back to free play', () => this.closeEditor(), 'Esc'),
    );
    panel.append(head, this.markRow, trim, camRow, postRow, this.status, foot);
    root.appendChild(panel);
  }

  // Drag the handles (or the kept part) with the mouse or a finger; arrow keys nudge a handle.
  bindTrim() {
    const tAt = (x) => {
      const r = this.track.getBoundingClientRect();
      const [wa, wb] = this.windowFor(this.game.clipMarks[this.sel]);
      return wa + Math.max(0, Math.min(1, (x - r.left) / r.width)) * (wb - wa);
    };
    const th = this.game.theater;
    let drag = null;
    const apply = (a, b, show) => {
      const m = this.game.clipMarks[this.sel];
      const [wa, wb] = this.windowFor(m);
      a = Math.max(wa, a);
      b = Math.min(wb, b);
      this.trims.map.set(m, [a, b]);
      this.view.start = a;
      this.view.end = b;
      this.view.goals = this.view.rec.goals.filter((g) => g.t >= a && g.t <= b);
      // While dragging, show the frame under the handle (like a phone's video trimmer).
      th.playing = false;
      th.t = show;
      this.game.effects.clear();
      this.layoutStrip();
    };
    const start = (e, kind) => {
      e.preventDefault();
      e.stopPropagation();
      const [a, b] = this.range();
      drag = { kind, a, b, t0: tAt(e.clientX), id: e.pointerId };
      this.track.setPointerCapture?.(e.pointerId);
      this.track.classList.add('dragging');
    };
    this.hA.addEventListener('pointerdown', (e) => start(e, 'a'));
    this.hB.addEventListener('pointerdown', (e) => start(e, 'b'));
    this.selBox.addEventListener('pointerdown', (e) => start(e, 'move'));
    this.track.addEventListener('pointerdown', (e) => {
      // A tap outside the kept part moves the nearer handle there.
      if (drag) return;
      const t = tAt(e.clientX);
      const [a, b] = this.range();
      start(e, Math.abs(t - a) < Math.abs(t - b) ? 'a' : 'b');
      this.track.dispatchEvent(new PointerEvent('pointermove', { clientX: e.clientX, pointerId: e.pointerId }));
    });
    this.track.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const t = tAt(e.clientX);
      if (drag.kind === 'a') {
        const a = Math.min(t, drag.b - MIN_LEN);
        apply(Math.max(a, drag.b - MAX_LEN), drag.b, Math.max(a, drag.b - MAX_LEN));
      } else if (drag.kind === 'b') {
        const b = Math.max(t, drag.a + MIN_LEN);
        apply(drag.a, Math.min(b, drag.a + MAX_LEN), Math.min(b, drag.a + MAX_LEN) - 0.05);
      } else {
        const [wa, wb] = this.windowFor(this.game.clipMarks[this.sel]);
        const len = drag.b - drag.a;
        const a = Math.max(wa, Math.min(wb - len, drag.a + (t - drag.t0)));
        apply(a, a + len, a);
      }
    });
    const end = () => {
      if (!drag) return;
      drag = null;
      this.track.classList.remove('dragging');
      th.seek(this.view.start);
      th.playing = true;
    };
    this.track.addEventListener('pointerup', end);
    this.track.addEventListener('pointercancel', end);
    for (const [h, kind] of [[this.hA, 'a'], [this.hB, 'b']]) {
      h.addEventListener('keydown', (e) => {
        if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return;
        e.preventDefault();
        e.stopPropagation();
        const d = (e.code === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 0.1);
        const [a, b] = this.range();
        if (kind === 'a') apply(Math.max(b - MAX_LEN, Math.min(b - MIN_LEN, a + d)), b, a + d);
        else apply(a, Math.min(a + MAX_LEN, Math.max(a + MIN_LEN, b + d)), b + d - 0.05);
        clearTimeout(this.keyTimer);
        this.keyTimer = setTimeout(end, 500);
        drag = drag || { kind };
      });
    }
  }

  // Ball speed bars for the window, so hits and shots are easy to find on the strip.
  drawStrip() {
    const c = this.canvas;
    const w = Math.max(1, Math.round(this.track.clientWidth || 320));
    const h = Math.max(1, Math.round(this.track.clientHeight || 44));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = w * dpr;
    c.height = h * dpr;
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const src = this.source();
    const [wa, wb] = this.windowFor(this.game.clipMarks[this.sel]);
    const bars = Math.max(10, Math.floor(w / 4));
    ctx.fillStyle = 'rgba(160, 196, 255, 0.55)';
    for (let i = 0; i < bars; i++) {
      const t = wa + ((i + 0.5) / bars) * (wb - wa);
      const s = src.sample(t);
      if (!s) continue;
      const v = s.a.ball.v;
      const sp = Math.hypot(v[0], v[1], v[2]);
      const bh = Math.max(2, Math.min(1, sp / 40) * (h - 8));
      ctx.fillRect(i * (w / bars) + 0.5, h - 4 - bh, Math.max(1, w / bars - 1.5), bh);
    }
    // Goals.
    ctx.fillStyle = '#ffd166';
    for (const gl of src.goals) {
      if (gl.t < wa || gl.t > wb) continue;
      const x = ((gl.t - wa) / (wb - wa)) * w;
      ctx.fillRect(x - 1, 0, 2, h);
    }
    this.layoutStrip();
  }

  layoutStrip() {
    const m = this.game.clipMarks[this.sel];
    const [wa, wb] = this.windowFor(m);
    const [a, b] = this.range();
    const pct = (t) => `${(((t - wa) / Math.max(0.01, wb - wa)) * 100).toFixed(3)}%`;
    this.selBox.style.left = pct(a);
    this.selBox.style.right = `${(100 - parseFloat(pct(b))).toFixed(3)}%`;
    this.shadeL.style.left = '0';
    this.shadeL.style.width = pct(a);
    this.shadeR.style.left = pct(b);
    this.shadeR.style.right = '0';
    this.hA.style.left = pct(a);
    this.hB.style.left = pct(b);
    this.markTick.style.left = pct(m);
    this.hA.setAttribute('aria-valuetext', `${(a - wa).toFixed(1)} s`);
    this.hB.setAttribute('aria-valuetext', `${(b - wa).toFixed(1)} s`);
    const src = this.source();
    this.trimInfo.replaceChildren(
      el('span', '', `${fmt(a - src.start)} to ${fmt(b - src.start)}`),
      el('b', '', `${(b - a).toFixed(1)} s`),
    );
  }

  drawPlayhead() {
    if (this.active !== 'edit' || !this.playhead) return;
    const [wa, wb] = this.windowFor(this.game.clipMarks[this.sel]);
    const t = this.game.theater.t;
    this.playhead.style.left = `${(((t - wa) / Math.max(0.01, wb - wa)) * 100).toFixed(3)}%`;
  }

  refreshEditor() {
    if (this.active !== 'edit' || !this.root) return;
    const g = this.game;
    const src = this.source();
    this.markRow.replaceChildren(el('span', 'clip-label', 'Clip'));
    g.clipMarks.forEach((m, i) => {
      const done = this.posted.set.has(m);
      const b = button(`small-btn${i === this.sel ? ' on' : ''}`, `${i + 1} · ${fmt(m - src.start)}${done ? ' · posted' : ''}`, () => this.selectMark(i));
      this.markRow.appendChild(b);
    });
    for (const [v, b] of this.camBtns) b.classList.toggle('on', v === this.cam);
    const done = this.posted.set.has(g.clipMarks[this.sel]);
    this.postBtn.disabled = !!this.posting || done;
    this.postBtn.textContent = done ? 'Posted' : this.posting ? 'Posting...' : 'Post clip';
  }

  // Free play's rolling recording keeps everything from 30 s before the oldest saved clip.
  repin() {
    const g = this.game;
    const rec = g.matchRec;
    if (!rec || !rec.keep) return;
    rec.pin = g.clipMarks.length ? Math.min(...g.clipMarks) - MAX_LEN : undefined;
  }

  removeMark() {
    const g = this.game;
    g.clipMarks.splice(this.sel, 1);
    this.repin();
    if (!g.clipMarks.length) {
      this.closeEditor();
      return;
    }
    this.selectMark(Math.min(this.sel, g.clipMarks.length - 1));
  }

  closeEditor() {
    const g = this.game;
    this.unmount();
    this.active = null;
    if (g.state === 'theater') {
      if (this.fromEnd) {
        g.theater.close();
      } else {
        // Back to free play where it was (the car has not moved; the physics waited).
        g.enterState('play');
        g.cameraRig.snap();
      }
    }
    this.refreshResultsButton();
  }

  clipMeta() {
    const g = this.game;
    return {
      mode: g.mode,
      arena: g.stadium ? g.stadium.arenaId : 'aurora',
      ball: g.ballModel ? g.ballModel.skin : 'standard',
      me: g.players.indexOf(g.player),
      cam: this.cam >= 0 ? 'me' : 'ball',
      cars: g.players.map((p) => ({
        team: p.team, name: p.name, carId: p.carId, accent: p.accent, number: p.number,
        look: p.look || {}, explosion: p.explosion,
      })),
    };
  }

  async post() {
    const g = this.game;
    if (this.posting) return;
    if (!api.clipsSupported()) {
      this.status.textContent = 'Posting clips works on the website: edmacsgd.github.io/boost-ball';
      return;
    }
    if (!this.canPost()) {
      this.status.replaceChildren(el('span', '', 'Log in to post clips. '), button('small-btn', 'Log in', () => {
        this.closeEditor();
        g.showLogin();
      }));
      return;
    }
    const mark = g.clipMarks[this.sel];
    const [a, b] = this.range();
    this.posting = true;
    this.status.textContent = '';
    this.refreshEditor();
    try {
      const data = await packClip(this.source(), a, b, this.clipMeta());
      await api.postClip({
        author: g.account.online.id,
        title: this.title.value.trim().slice(0, 60),
        mode: String(g.mode || '').slice(0, 8),
        arena: g.stadium ? g.stadium.arenaId : '',
        duration: Math.max(0.5, Math.min(31, b - a)),
        data,
      });
      this.posted.set.add(mark);
      this.status.textContent = 'Posted. Find it in Clips on the main menu.';
      this.title.value = '';
    } catch (e) {
      this.status.textContent = `Could not post: ${e.message}`;
    }
    this.posting = false;
    this.refreshEditor();
  }

  // ------------------------------------------------ feed
  openFeed() {
    const g = this.game;
    this.active = 'feed';
    this.sort = this.sort || 'new';
    this.items = [];
    this.index = 0;
    this.liked = new Set();
    this.cache = new Map();
    this.done = false;
    this.loading = false;
    this.staged = false;
    this.buildFeed();
    g.home.hide();
    if (!api.clipsSupported()) {
      this.message('Clips work on the website version of the game: edmacsgd.github.io/boost-ball');
      return;
    }
    this.message('Loading clips...');
    this.loadMore().then(() => this.show(0));
  }

  buildFeed() {
    const root = this.mount('clip-feed');
    const top = el('div', 'feed-top');
    this.tabs = ['new', 'top'].map((s) => button(`small-btn${this.sort === s ? ' on' : ''}`, s === 'new' ? 'New' : 'Top this week', () => this.setSort(s)));
    top.append(el('b', 'feed-title', 'CLIPS'), ...this.tabs, button('small-btn feed-close', 'Back', () => this.closeFeed(), 'Esc'));
    this.info = el('div', 'feed-info');
    this.side = el('div', 'feed-side');
    this.likeBtn = button('feed-act', '', () => this.toggleLike(), 'Like (L)');
    this.likeBtn.append(icon('heart'), el('span', '', '0'));
    this.comBtn = button('feed-act', '', () => this.toggleComments(), 'Comments (C)');
    this.comBtn.append(icon('chat'), el('span', '', '0'));
    this.camBtn = button('feed-act', '', () => this.toggleCam(), 'Switch camera');
    this.camBtn.append(icon('cam'), el('span', '', 'Car'));
    this.repBtn = button('feed-act', '', () => this.report(), 'Report this clip');
    this.repBtn.append(icon('flag'), el('span', '', 'Report'));
    this.delBtn = button('feed-act', '', () => this.removeClip(), 'Delete this clip');
    this.delBtn.append(icon('trash'), el('span', '', 'Delete'));
    const nav = el('div', 'feed-nav');
    nav.append(button('feed-arrow', 'Up', () => this.step(-1), 'Previous (Up arrow)'), button('feed-arrow', 'Down', () => this.step(1), 'Next (Down arrow)'));
    this.side.append(nav, this.likeBtn, this.comBtn, this.camBtn, this.repBtn, this.delBtn);
    this.msg = el('div', 'feed-msg');
    this.msg.hidden = true;
    this.drawer = el('div', 'feed-comments');
    this.drawer.hidden = true;
    this.counter = el('span', 'feed-count', '');
    top.appendChild(this.counter);
    root.append(top, this.info, this.side, this.msg, this.drawer);
    // Mouse wheel and swipes move through the feed. The feed layer lets clicks through to the
    // game, so these listen on the window while the feed is open.
    let wheelLock = 0;
    const onWheel = (e) => {
      if (this.active !== 'feed' || (e.target.closest && e.target.closest('.feed-comments'))) return;
      e.preventDefault();
      const now = performance.now();
      if (now < wheelLock || Math.abs(e.deltaY) < 12) return;
      wheelLock = now + 450;
      this.step(e.deltaY > 0 ? 1 : -1);
    };
    let y0 = null;
    const onTouchStart = (e) => {
      y0 = this.active === 'feed' && !(e.target.closest && e.target.closest('.feed-comments, button, input')) ? e.touches[0].clientY : null;
    };
    const onTouchEnd = (e) => {
      if (y0 === null) return;
      const dy = e.changedTouches[0].clientY - y0;
      y0 = null;
      if (Math.abs(dy) > 50) this.step(dy < 0 ? 1 : -1);
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    this.offFeed = () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }

  message(text) {
    this.msg.textContent = text;
    this.msg.hidden = !text;
    const empty = !this.items.length;
    this.root.classList.toggle('empty', empty && this.game.state !== 'theater');
    this.side.hidden = empty;
    this.info.hidden = empty;
  }

  setSort(s) {
    if (this.sort === s) return;
    this.sort = s;
    for (const b of this.tabs) b.classList.toggle('on', b.textContent === (s === 'new' ? 'New' : 'Top this week'));
    this.items = [];
    this.index = 0;
    this.done = false;
    this.closeComments();
    this.loadMore().then(() => this.show(0));
  }

  async loadMore() {
    if (this.loading || this.done) return;
    this.loading = true;
    try {
      const rows = await api.listClips(this.sort, this.items.length, 10);
      if (rows.length < 10) this.done = true;
      const known = new Set(this.items.map((r) => r.id));
      this.items.push(...rows.filter((r) => !known.has(r.id)));
      if (this.canPost()) {
        const s = await api.likedSet(this.game.account.online.id, rows.map((r) => r.id)).catch(() => new Set());
        for (const id of s) this.liked.add(id);
      }
    } catch (e) {
      this.message(`Could not load clips: ${e.message}`);
    }
    this.loading = false;
  }

  async fetchClip(row) {
    if (!this.cache.has(row.id)) this.cache.set(row.id, api.clipData(row.id).then(unpackClip));
    return this.cache.get(row.id);
  }

  step(d) {
    if (!this.items.length) return;
    const i = this.index + d;
    if (i < 0) return;
    if (i >= this.items.length) {
      if (this.done) return;
      this.loadMore().then(() => {
        if (i < this.items.length) this.show(i);
      });
      return;
    }
    this.show(i);
  }

  async show(i) {
    if (this.active !== 'feed') return;
    if (!this.items.length) {
      this.message(this.loading ? 'Loading...' : 'No clips yet. Press Ctrl+Q in a match to save a moment, then post it from the end screen.');
      return;
    }
    this.index = i;
    const row = this.items[i];
    this.closeComments();
    this.renderInfo();
    this.message('Loading clip...');
    const token = (this.showToken = (this.showToken || 0) + 1);
    let clip;
    try {
      clip = await this.fetchClip(row);
    } catch (e) {
      this.cache.delete(row.id);
      if (token === this.showToken) this.message(`Could not load this clip: ${e.message}`);
      return;
    }
    if (token !== this.showToken || this.active !== 'feed') return;
    this.message('');
    this.playClip(clip);
    // Get the next ones ready.
    for (const r of this.items.slice(i + 1, i + 3)) this.fetchClip(r).catch(() => {});
    if (i >= this.items.length - 3) this.loadMore();
  }

  // Put the clip's cars, ball and arena into the scene and play it.
  playClip(clip) {
    const g = this.game;
    const m = clip.meta;
    g.clearPlayers();
    if (!this.staged) {
      // Same stage setup as starting a match: the arena scene, not the garage studio.
      this.staged = true;
      g.setEndlessWorld(false);
      g.showroom.setStage('studio');
      g.renderer.setView(g.renderer.scene, g.renderer.camera);
      g.applyViewLook(false);
    }
    if (m.arena && THEMES[m.arena]) g.buildArena(m.arena);
    for (const c of m.cars) {
      const carId = DESIGNS[c.carId] ? c.carId : 'strider';
      const p = g.addPlayer(c.team ? 1 : 0, String(c.name || '').slice(0, 16), false, c.number || 0, carId, c.accent ?? 0xffffff, c.look || {});
      p.bot = null;
      p.explosion = c.explosion;
    }
    g.player = g.players[m.me] || g.players[0];
    g.ballModel?.setSkin(m.ball || 'standard');
    g.sim.freezeCars = true;
    const rec = recorderFor(clip, g.players.map((p) => p.car.id));
    this.feedCam = m.cam === 'ball' || !(m.me >= 0) ? 'ball' : m.me;
    if (g.state === 'theater' && g.theater.clipRec) g.theater.swapClip(rec, this.feedCam);
    else g.theater.openClip(rec, this.feedCam);
    this.renderInfo();
  }

  toggleCam() {
    const row = this.items[this.index];
    if (!row) return;
    const g = this.game;
    const me = g.players.indexOf(g.player);
    this.feedCam = this.feedCam === 'ball' ? Math.max(0, me) : 'ball';
    g.theater.cam = this.feedCam;
    g.cameraRig.snap();
    this.renderInfo();
  }

  isMine(row) {
    const a = this.game.account;
    return !!(a.online && row.author === a.online.id);
  }

  renderInfo() {
    const row = this.items[this.index];
    if (!row) return;
    this.counter.textContent = `${this.index + 1} / ${this.items.length}${this.done ? '' : '+'}`;
    const by = el('b', 'feed-author', row.author_name || 'Player');
    const title = el('p', 'feed-cliptitle', row.title || '');
    title.hidden = !row.title;
    const sub = el('small', '', [row.mode ? row.mode.toUpperCase() : '', arenaName(row.arena), `${Math.round(row.duration)} s`, ago(row.created_at)].filter(Boolean).join('  ·  '));
    this.info.replaceChildren(by, title, sub);
    const liked = this.liked.has(row.id);
    this.likeBtn.classList.toggle('on', liked);
    this.likeBtn.querySelector('span').textContent = String(row.like_count);
    this.comBtn.querySelector('span').textContent = String(row.comment_count);
    this.camBtn.querySelector('span').textContent = this.feedCam === 'ball' ? 'Ball' : 'Car';
    const owner = this.game.account.badge === 'owner';
    this.delBtn.hidden = !(this.isMine(row) || owner);
    this.repBtn.hidden = this.isMine(row);
  }

  needLogin(what) {
    if (this.canPost()) return false;
    this.message(`Log in to ${what}.`);
    setTimeout(() => {
      if (this.msg && this.msg.textContent === `Log in to ${what}.`) this.message('');
    }, 2200);
    return true;
  }

  async toggleLike() {
    const row = this.items[this.index];
    if (!row || this.needLogin('like clips')) return;
    const on = !this.liked.has(row.id);
    // Show it right away; undo if the server says no.
    if (on) this.liked.add(row.id);
    else this.liked.delete(row.id);
    row.like_count = Math.max(0, row.like_count + (on ? 1 : -1));
    this.renderInfo();
    try {
      await api.setLike(this.game.account.online.id, row.id, on);
    } catch (e) {
      if (on) this.liked.delete(row.id);
      else this.liked.add(row.id);
      row.like_count = Math.max(0, row.like_count + (on ? -1 : 1));
      this.renderInfo();
    }
  }

  async report() {
    const row = this.items[this.index];
    if (!row || this.needLogin('report clips')) return;
    if (this.confirmReport !== row.id) {
      this.confirmReport = row.id;
      this.repBtn.querySelector('span').textContent = 'Sure?';
      return;
    }
    this.confirmReport = null;
    try {
      await api.reportClip(this.game.account.online.id, row.id);
      this.repBtn.querySelector('span').textContent = 'Reported';
    } catch (e) {
      this.repBtn.querySelector('span').textContent = 'Failed';
    }
  }

  async removeClip() {
    const row = this.items[this.index];
    if (!row) return;
    if (this.confirmDelete !== row.id) {
      this.confirmDelete = row.id;
      this.delBtn.querySelector('span').textContent = 'Sure?';
      return;
    }
    this.confirmDelete = null;
    try {
      await api.deleteClip(row.id);
      this.items.splice(this.index, 1);
      this.show(Math.min(this.index, this.items.length - 1));
      if (!this.items.length) this.show(0);
    } catch (e) {
      this.delBtn.querySelector('span').textContent = 'Failed';
    }
  }

  // ------------------------------------------------ comments drawer
  toggleComments() {
    if (this.commentsOpen) this.closeComments();
    else this.openComments();
  }

  closeComments() {
    this.commentsOpen = false;
    if (this.drawer) this.drawer.hidden = true;
  }

  async openComments() {
    const row = this.items[this.index];
    if (!row) return;
    this.commentsOpen = true;
    const d = this.drawer;
    d.hidden = false;
    const list = el('div', 'com-list');
    list.appendChild(el('p', 'com-empty', 'Loading...'));
    const form = el('form', 'com-form');
    const input = el('input');
    input.type = 'text';
    input.maxLength = 200;
    input.placeholder = this.canPost() ? 'Add a comment' : 'Log in to comment';
    input.disabled = !this.canPost();
    input.setAttribute('aria-label', 'Comment');
    input.addEventListener('keydown', (e) => e.stopPropagation());
    const send = el('button', 'small-btn', 'Send');
    send.type = 'submit';
    send.disabled = input.disabled;
    form.append(input, send);
    d.replaceChildren(el('div', 'com-head', 'Comments'), list, form);
    const draw = (rows) => {
      list.replaceChildren();
      if (!rows.length) list.appendChild(el('p', 'com-empty', 'No comments yet.'));
      const owner = this.game.account.badge === 'owner';
      for (const c of rows) {
        const item = el('div', 'com');
        const top = el('div', 'com-top');
        top.append(el('b', '', c.author_name || 'Player'), el('small', '', ago(c.created_at)));
        const mine = this.game.account.online && c.author === this.game.account.online.id;
        if (mine || owner || this.isMine(row)) {
          top.appendChild(button('com-del', 'Delete', async () => {
            try {
              await api.deleteComment(c.id);
              rows.splice(rows.indexOf(c), 1);
              row.comment_count = Math.max(0, row.comment_count - 1);
              draw(rows);
              this.renderInfo();
            } catch (e) {
              /* keep it */
            }
          }));
        }
        item.append(top, el('p', '', c.body));
        list.appendChild(item);
      }
      list.scrollTop = list.scrollHeight;
    };
    let rows = [];
    try {
      rows = await api.listComments(row.id);
      if (this.items[this.index] !== row || !this.commentsOpen) return;
      draw(rows);
    } catch (e) {
      list.replaceChildren(el('p', 'com-empty', `Could not load comments: ${e.message}`));
    }
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = input.value.trim();
      if (!body || send.disabled) return;
      send.disabled = true;
      try {
        const c = await api.addComment(this.game.account.online.id, row.id, body);
        rows.push(c);
        row.comment_count++;
        input.value = '';
        draw(rows);
        this.renderInfo();
      } catch (err) {
        input.placeholder = err.message.includes('limit') ? 'Slow down a little' : 'Could not send';
      }
      send.disabled = false;
      input.focus();
    });
  }

  closeFeed() {
    const g = this.game;
    this.showToken = (this.showToken || 0) + 1;
    this.unmount();
    this.active = null;
    g.buildArena(g.settings.arena || 'aurora');
    g.home.page = 'main';
    g.enterHome();
  }
}
