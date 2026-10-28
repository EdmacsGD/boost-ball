// Garage: your own anthems. Upload a song, pick the part to play (3-12 s), name it, save it in this
// browser. Draws into the garage body when the Anthem tab is open.
import { decodeSong, cutClip, loudestStart, peaks, CLIP_MIN, CLIP_MAX, CLIP_DEFAULT } from '../audio/anthems.js';
import { MAX_UPLOADS, MAX_FILE_MB, newClipId } from '../meta/anthemStore.js';

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const clock = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

export function eqSwatch() {
  const sw = el('span', 'swatchy eq');
  for (let i = 0; i < 4; i++) sw.appendChild(el('i'));
  return sw;
}

export class AnthemUploads {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.loaded = false;
    this.editing = null; // { id|null, name, blob, song, start, length, peaks }
    this.message = '';
    this.confirmDelete = false;
    this.file = document.createElement('input');
    this.file.type = 'file';
    this.file.accept = 'audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm';
    this.file.hidden = true;
    document.body.appendChild(this.file);
    this.file.addEventListener('change', () => {
      const f = this.file.files && this.file.files[0];
      this.file.value = '';
      if (f) this.openFile(f);
    });
  }

  get store() {
    return this.game.anthemStore;
  }

  // Reload the list of uploads, then redraw the garage if it is showing anthems.
  async load() {
    this.list = await this.store.list();
    this.loaded = true;
    this.redraw();
  }

  redraw() {
    const h = this.game.home;
    if (h.page === 'garage' && h.gtab === 'anthem') h.renderGarage();
  }

  name(id) {
    const rec = this.list.find((r) => `custom:${r.id}` === id);
    return rec ? rec.name : null;
  }

  say(text) {
    this.message = text;
    this.redraw();
  }

  // ------------------------------------------------------------------ editing
  async openFile(file) {
    this.game.audio.init();
    if (this.list.length >= MAX_UPLOADS) return this.say(`You can keep ${MAX_UPLOADS} songs. Delete one first.`);
    if (file.size > MAX_FILE_MB * 1024 * 1024) return this.say(`That file is ${(file.size / 1048576).toFixed(0)} MB. The limit is ${MAX_FILE_MB} MB.`);
    this.say(`Reading ${file.name}...`);
    let song;
    try {
      song = await decodeSong(await file.arrayBuffer());
    } catch (e) {
      return this.say('Could not read that file. Try an MP3, WAV, OGG or M4A song.');
    }
    if (song.duration < CLIP_MIN) return this.say(`That sound is ${song.duration.toFixed(1)} s. It needs to be at least ${CLIP_MIN} s long.`);
    const length = Math.min(CLIP_DEFAULT, song.duration);
    this.editing = {
      id: null,
      name: file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim().slice(0, 24) || 'My anthem',
      blob: file,
      song,
      start: loudestStart(song, length),
      length,
      peaks: peaks(song, 600),
    };
    this.confirmDelete = false;
    this.message = 'Picked the loudest part. Drag the sliders or click the wave to move it.';
    this.scrollTo = true;
    this.redraw();
  }

  async edit(rec) {
    this.game.audio.init();
    this.say('Loading...');
    try {
      const song = await decodeSong(await rec.blob.arrayBuffer());
      this.editing = { id: rec.id, name: rec.name, blob: rec.blob, song, start: rec.start, length: rec.length, peaks: peaks(song, 600) };
      this.confirmDelete = false;
      this.message = '';
      this.scrollTo = true;
    } catch (e) {
      this.message = 'Could not load that song from browser storage.';
    }
    this.redraw();
  }

  preview() {
    const e = this.editing;
    if (!e) return;
    this.game.audio.init();
    this.game.anthems.playBuffer(cutClip(e.song, e.start, e.length));
  }

  async save() {
    const e = this.editing;
    if (!e) return;
    const id = e.id || newClipId();
    const old = this.list.find((r) => r.id === id);
    const rec = { id, name: e.name.trim().slice(0, 24) || 'My anthem', blob: e.blob, start: e.start, length: e.length, created: old ? old.created : Date.now() };
    let note = '';
    try {
      await this.store.put(rec);
      navigator.storage?.persist?.().catch(() => {});
    } catch (err) {
      note = ' Browser storage is full or blocked, so it is kept for this visit only.';
    }
    if (!this.store.persistent) note = ' This browser blocks storage here, so it is kept for this visit only.';
    this.game.anthems.forget(`custom:${id}`);
    this.game.anthems.stop(0.2);
    this.editing = null;
    this.message = `Saved "${rec.name}" and equipped it.${note}`;
    this.list = await this.store.list();
    this.game.equip('anthem', `custom:${id}`);
    this.redraw();
  }

  async remove() {
    const e = this.editing;
    if (!e || !e.id) return;
    if (!this.confirmDelete) {
      this.confirmDelete = true;
      this.redraw();
      return;
    }
    const cid = `custom:${e.id}`;
    await this.store.remove(e.id);
    this.game.anthems.forget(cid);
    this.game.anthems.stop(0.2);
    this.editing = null;
    this.confirmDelete = false;
    this.message = `Deleted "${e.name}".`;
    this.list = await this.store.list();
    if (this.game.account.loadout.anthem === cid) this.game.equip('anthem', 'kickoff');
    this.redraw();
  }

  cancel() {
    this.editing = null;
    this.message = '';
    this.game.anthems.stop(0.2);
    this.redraw();
  }

  // ------------------------------------------------------------------ drawing
  render(body) {
    if (!this.loaded) this.load();
    const g = this.game;
    const equipped = g.account.loadout.anthem;
    const f = el('div', 'field');
    f.appendChild(el('span', 'field-label', `Your songs ${this.list.length}/${MAX_UPLOADS}`));
    const grid = el('div', 'item-grid wide-cards');
    for (const rec of this.list) {
      const cid = `custom:${rec.id}`;
      const wrap = el('div', 'custom-cell');
      const b = el('button', 'item-card custom');
      b.type = 'button';
      if (equipped === cid) b.classList.add('on');
      b.appendChild(eqSwatch());
      const t = el('span', 'item-text');
      t.append(el('b', '', rec.name), el('small', '', `Your song · ${rec.length.toFixed(1)} s`));
      b.appendChild(t);
      b.addEventListener('click', g.home.click(() => {
        g.equip('anthem', cid);
        g.previewAnthem(cid);
      }));
      const ed = el('button', 'mini-btn', 'Edit');
      ed.type = 'button';
      ed.title = `Edit ${rec.name}`;
      ed.addEventListener('click', g.home.click(() => this.edit(rec)));
      wrap.append(b, ed);
      grid.appendChild(wrap);
    }
    const up = el('button', 'item-card upload');
    up.type = 'button';
    up.appendChild(el('span', 'plus', '+'));
    const ut = el('span', 'item-text');
    ut.append(el('b', '', 'Upload song'), el('small', '', 'MP3, WAV, OGG, M4A'));
    up.appendChild(ut);
    up.addEventListener('click', g.home.click(() => this.file.click()));
    grid.appendChild(up);
    f.appendChild(grid);
    if (equipped && equipped.startsWith('custom:') && this.loaded && !this.name(equipped)) {
      f.appendChild(el('p', 'note warn', 'Your equipped song was uploaded on another device or browser, so nothing plays here. Upload it here too, or pick another anthem.'));
    }
    if (this.message) f.appendChild(el('p', 'note', this.message));
    if (this.editing) {
      const box = this.editor();
      f.appendChild(box);
      if (this.scrollTo) {
        this.scrollTo = false;
        requestAnimationFrame(() => box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
      }
    }
    if (!this.editing) f.appendChild(el('p', 'note', 'Uploaded songs stay in this browser only. They are not sent anywhere.'));
    body.appendChild(f);
  }

  editor() {
    const e = this.editing;
    const box = el('div', 'anthem-editor');
    box.appendChild(el('span', 'field-label', e.id ? 'Edit your anthem' : 'Cut your anthem'));

    const nameIn = el('input', 'name-input');
    nameIn.type = 'text';
    nameIn.maxLength = 24;
    nameIn.value = e.name;
    nameIn.setAttribute('aria-label', 'Anthem name');
    nameIn.addEventListener('input', () => { e.name = nameIn.value; });
    nameIn.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter' || ev.key === 'Escape') nameIn.blur();
    });

    const canvas = el('canvas', 'wave');
    canvas.width = 600;
    canvas.height = 84;
    const dur = e.song.duration;
    const draw = () => {
      const c = canvas.getContext('2d');
      if (!c) return;
      const W = canvas.width;
      const H = canvas.height;
      c.clearRect(0, 0, W, H);
      const x0 = (e.start / dur) * W;
      const x1 = ((e.start + e.length) / dur) * W;
      c.fillStyle = 'rgba(255, 209, 102, 0.16)';
      c.fillRect(x0, 0, x1 - x0, H);
      for (let i = 0; i < W; i++) {
        const h = Math.max(1, e.peaks[i] * (H / 2 - 2));
        c.fillStyle = i >= x0 && i <= x1 ? '#ffd166' : 'rgba(141, 157, 179, 0.55)';
        c.fillRect(i, H / 2 - h, 1, h * 2);
      }
      c.fillStyle = '#ffd166';
      c.fillRect(x0, 0, 2, H);
      c.fillRect(x1 - 2, 0, 2, H);
    };

    const startOut = el('output');
    const lenOut = el('output');
    const startIn = el('input');
    startIn.type = 'range';
    startIn.min = '0';
    startIn.step = '0.1';
    startIn.setAttribute('aria-label', 'Clip start');
    const lenIn = el('input');
    lenIn.type = 'range';
    lenIn.min = String(CLIP_MIN);
    lenIn.max = String(Math.min(CLIP_MAX, Math.floor(dur * 2) / 2));
    lenIn.step = '0.5';
    lenIn.setAttribute('aria-label', 'Clip length');
    const sync = () => {
      e.start = Math.max(0, Math.min(dur - e.length, e.start));
      startIn.max = String(Math.max(0, dur - e.length).toFixed(1));
      startIn.value = String(e.start);
      lenIn.value = String(e.length);
      startOut.textContent = `${clock(e.start)} to ${clock(e.start + e.length)}`;
      lenOut.textContent = `${e.length.toFixed(1)} s`;
      draw();
    };
    startIn.addEventListener('input', () => { e.start = Number(startIn.value); sync(); });
    lenIn.addEventListener('input', () => { e.length = Number(lenIn.value); sync(); });
    startIn.addEventListener('change', () => this.preview());
    lenIn.addEventListener('change', () => this.preview());
    canvas.addEventListener('click', (ev) => {
      const r = canvas.getBoundingClientRect();
      e.start = ((ev.clientX - r.left) / r.width) * dur - e.length / 2;
      sync();
      this.preview();
    });

    const l1 = el('label', '', 'Part ');
    l1.appendChild(startOut);
    const l2 = el('label', '', 'Length ');
    l2.appendChild(lenOut);
    const btns = el('div', 'btns row anthem-btns');
    const mk = (text, cls, fn) => {
      const b = el('button', cls, text);
      b.type = 'button';
      b.addEventListener('click', this.game.home.click(fn));
      btns.appendChild(b);
      return b;
    };
    mk('Listen', '', () => this.preview());
    mk('Save', 'primary', () => this.save());
    mk('Cancel', '', () => this.cancel());
    if (e.id) mk(this.confirmDelete ? 'Click again to delete' : 'Delete', this.confirmDelete ? 'danger' : '', () => this.remove());

    box.append(nameIn, canvas, l1, startIn, l2, lenIn, btns);
    sync();
    return box;
  }
}
