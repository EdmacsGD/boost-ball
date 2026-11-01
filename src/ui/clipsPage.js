// Home screen "Clips" page: a grid of clips to pick from (search by player or title, views, likes),
// the For you list (players you follow come up more often), and Studio (numbers for your own clips).
// Picking a clip plays the list full screen in the feed (game.clips).
import * as api from '../net/clipsApi.js';
import { views, viewsText } from '../game/clips.js';
import { CONFIG } from '../config.js';
import { iconSvg } from './icons.js';

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
}

const TABS = [
  ['foryou', 'For you'],
  ['following', 'Following'],
  ['new', 'New'],
  ['top', 'Top this week'],
  ['views', 'Most viewed'],
  ['studio', 'Studio'],
];
const PAGE = 24;

export class ClipsPage {
  constructor(game) {
    this.game = game;
    this.body = document.getElementById('clipsBody');
    this.tab = 'foryou';
    this.search = '';
    this.items = [];
    this.done = false;
    this.token = 0;
    // The home screen is still being built here, so look it up on click.
    document.getElementById('clipsBack').addEventListener('click', (e) => game.home.click(() => game.home.setPage('main'))(e));
    document.getElementById('clipsFeedBtn').addEventListener('click', (e) => game.home.click(() => this.openFeedAll())(e));
  }

  // Feed: scroll through clips from the start (For you order: players you follow come up more).
  openFeedAll() {
    const st = { mixedFrom: 0 };
    this.studio.openFeed({
      title: 'CLIPS · FEED',
      loader: (offset) => this.fetch(offset, 'foryou', '', st),
      back: () => {
        this.game.home.setPage('clips');
        this.render(); // thumbnails made while watching
      },
    });
  }

  get studio() {
    return this.game.clips;
  }

  signedIn() {
    return this.studio.canPost();
  }

  shown() {
    this.load(true);
  }

  btn(text, cls, fn, title) {
    const b = el('button', cls, text);
    b.type = 'button';
    if (title) b.title = title;
    b.addEventListener('click', this.game.home.click(fn));
    return b;
  }

  // One page of the current list. For you mixes in more clips from players you follow:
  // two of theirs, then one from everyone, newest first.
  // tab/search/state default to what the page shows; the Feed button passes its own.
  async fetch(offset, tab = this.tab, s = this.search, state = this) {
    if (tab === 'following' || tab === 'foryou') {
      const fol = [...(await this.studio.loadFollowing())];
      if (tab === 'following') return api.listClips('new', offset, PAGE, fol, s);
      if (!fol.length || offset > 0) {
        // After the first page, For you goes on with everyone's clips.
        return api.listClips('new', offset ? offset - (state.mixedFrom || 0) : 0, PAGE, null, s);
      }
      const [mine, all] = await Promise.all([api.listClips('new', 0, PAGE, fol, s), api.listClips('new', 0, PAGE, null, s)]);
      const out = [];
      const seen = new Set();
      let i = 0;
      let j = 0;
      while (out.length < PAGE && (i < mine.length || j < all.length)) {
        for (let k = 0; k < 2 && i < mine.length; k++, i++) if (!seen.has(mine[i].id)) { seen.add(mine[i].id); out.push(mine[i]); }
        while (j < all.length && seen.has(all[j].id)) j++;
        if (j < all.length) { seen.add(all[j].id); out.push(all[j]); j++; }
      }
      // Later pages continue the plain list after the ones already shown from it.
      state.mixedFrom = out.length - j;
      return out;
    }
    return api.listClips(tab, offset, PAGE, null, s);
  }

  async load(reset) {
    if (!api.clipsSupported()) {
      this.render();
      return;
    }
    const token = ++this.token;
    if (reset) {
      this.items = [];
      this.done = false;
      this.error = '';
      this.mixedFrom = 0;
    }
    if (this.tab === 'studio') {
      this.loading = true;
      this.render();
      try {
        this.stats = this.signedIn() ? await api.studio() : null;
      } catch (e) {
        this.error = `Could not load your stats: ${e.message}`;
      }
      if (token !== this.token) return;
      this.loading = false;
      this.render();
      return;
    }
    this.loading = true;
    this.render();
    try {
      const rows = await this.fetch(this.items.length);
      if (token !== this.token) return;
      const known = new Set(this.items.map((r) => r.id));
      this.items.push(...rows.filter((r) => !known.has(r.id)));
      if (rows.length < PAGE) this.done = true;
    } catch (e) {
      if (token !== this.token) return;
      this.error = `Could not load clips: ${e.message}`;
    }
    this.loading = false;
    this.render();
  }

  play(i) {
    const list = this.items;
    const tab = TABS.find((t) => t[0] === this.tab)[1];
    this.studio.openFeed({
      title: this.search ? `CLIPS · "${this.search.toUpperCase()}"` : `CLIPS · ${tab.toUpperCase()}`,
      items: list,
      start: i,
      loader: this.done ? null : async (offset) => {
        const rows = await this.fetch(offset);
        const known = new Set(this.items.map((r) => r.id));
        this.items.push(...rows.filter((r) => !known.has(r.id)));
        return rows;
      },
      back: () => {
        this.game.home.setPage('clips');
        this.render();
      },
    });
  }

  render() {
    const body = this.body;
    const searchIn = body.querySelector('.clip-search');
    const hadFocus = document.activeElement === searchIn;
    body.textContent = '';
    if (!api.clipsSupported()) {
      body.appendChild(el('p', 'page-note', 'Clips work on the website version of the game: edmacsgd.github.io/boost-ball'));
      return;
    }
    const top = el('div', 'clips-top');
    const seg = el('div', 'seg');
    for (const [key, label] of TABS) {
      seg.appendChild(this.btn(label, key === this.tab ? 'on' : '', () => {
        this.tab = key;
        this.load(true);
      }));
    }
    top.appendChild(seg);
    if (this.tab !== 'studio') {
      const search = el('input', 'clip-search');
      search.type = 'search';
      search.placeholder = 'Search player or clip name';
      search.maxLength = 40;
      search.spellcheck = false;
      search.autocomplete = 'off';
      search.setAttribute('aria-label', 'Search clips by player or clip name');
      search.value = this.search;
      search.addEventListener('keydown', (e) => e.stopPropagation());
      search.addEventListener('input', () => {
        this.search = search.value.trim();
        clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => this.load(true), 300);
      });
      top.appendChild(search);
      if (hadFocus) {
        setTimeout(() => {
          search.focus();
          search.setSelectionRange(search.value.length, search.value.length);
        });
      }
    }
    body.appendChild(top);
    if (this.error) body.appendChild(el('p', 'page-note', this.error));
    if (this.tab === 'studio') {
      this.renderStudio(body);
      return;
    }
    if ((this.tab === 'following' || this.tab === 'foryou') && !this.signedIn() && this.tab === 'following') {
      body.appendChild(el('p', 'page-note', 'Log in to follow players. Their clips then show up here and more often in For you.'));
      return;
    }
    if (!this.items.length) {
      body.appendChild(el('p', 'page-note', this.loading ? 'Loading...' : this.search ? 'No clips match that.' : this.tab === 'following' ? 'No clips from players you follow yet. Press Follow on a clip to follow its player.' : 'No clips yet. Press Ctrl+Q in a game to save a moment, then post it.'));
      return;
    }
    const grid = el('div', 'clip-grid');
    this.items.forEach((c, i) => grid.appendChild(this.card(c, i)));
    body.appendChild(grid);
    if (!this.done) body.appendChild(this.btn(this.loading ? 'Loading...' : 'Show more', 'small-btn more-btn', () => this.load(false)));
  }

  card(c, i) {
    const card = el('button', 'clip-card');
    card.type = 'button';
    const arena = CONFIG.arenas.find((a) => a.id === c.arena);
    const sw = arena ? arena.swatch : ['#0b1430', '#2a86ff', '#ff8a2a'];
    const thumb = el('span', 'clip-thumb');
    thumb.style.background = `linear-gradient(135deg, ${sw[0]}, ${sw[1]} 60%, ${sw[2]})`;
    const pic = c.thumb || (this.studio.localThumbs && this.studio.localThumbs.get(c.id));
    if (pic) {
      const img = el('img', 'clip-thumb-img');
      img.src = pic;
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('error', () => img.remove());
      thumb.appendChild(img);
    }
    const play = el('i', 'clip-play');
    play.innerHTML = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
    thumb.append(play, el('span', 'clip-dur', `0:${String(Math.round(c.duration)).padStart(2, '0')}`), el('span', 'clip-mode', (c.mode || '').toUpperCase()));
    const sticker = (c.overlays || []).find((o) => o.k === 'emoji' || o.k === 'text');
    if (sticker && !pic) thumb.appendChild(el('span', 'clip-thumb-st', sticker.v));
    const info = el('span', 'clip-card-info');
    info.append(
      el('b', 'clip-card-title', c.title || 'Untitled clip'),
      el('span', 'clip-card-by', c.author_name || 'Player'),
      el('small', 'clip-card-meta', `${viewsText(c.view_count)} · ${ago(c.created_at)}`),
    );
    const likes = el('span', 'clip-card-likes');
    const h = el('i', 'pclip-ic');
    h.innerHTML = iconSvg('heart');
    likes.append(h, el('span', '', String(c.like_count)), el('span', 'clip-card-com', `${c.comment_count} comments`));
    info.appendChild(likes);
    card.append(thumb, info);
    card.title = `Watch ${c.title || 'this clip'}`;
    card.addEventListener('click', this.game.home.click(() => this.play(i)));
    return card;
  }

  // ------------------------------------------------------------------ Studio
  renderStudio(body) {
    if (!this.signedIn()) {
      body.appendChild(el('p', 'page-note', 'Log in to see the numbers for your clips.'));
      return;
    }
    const st = this.stats;
    if (!st) {
      body.appendChild(el('p', 'page-note', this.loading ? 'Loading...' : ''));
      return;
    }
    const clips = st.clips || [];
    const sum = (k) => clips.reduce((a, c) => a + (c[k] || 0), 0);
    const cards = el('div', 'studio-cards');
    for (const [label, value] of [['Views', views(sum('views'))], ['Likes', String(sum('likes'))], ['Comments', String(sum('comments'))], ['Followers', String(st.followers || 0)], ['Clips', String(clips.length)]]) {
      const c = el('div', 'studio-card');
      c.append(el('b', '', value), el('small', '', label));
      cards.appendChild(c);
    }
    body.appendChild(cards);
    // Views per day, last 14 days.
    body.appendChild(el('span', 'field-label', 'Views, last 14 days'));
    const byDay = new Map((st.daily || []).map((d) => [String(d.day).slice(0, 10), d.views]));
    const days = [];
    for (let k = 13; k >= 0; k--) {
      const d = new Date(Date.now() - k * 864e5);
      const key = d.toISOString().slice(0, 10);
      days.push({ key, label: k === 0 ? 'Today' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'numeric' }), v: byDay.get(key) || 0 });
    }
    const max = Math.max(1, ...days.map((d) => d.v));
    const chart = el('div', 'studio-chart');
    chart.setAttribute('role', 'img');
    chart.setAttribute('aria-label', `Views per day for the last 14 days, ${days.reduce((a, d) => a + d.v, 0)} in total`);
    for (const d of days) {
      const col = el('div', 'studio-col');
      const bar = el('i', 'studio-bar');
      bar.style.height = `${Math.max(2, (d.v / max) * 100)}%`;
      col.title = `${d.label}: ${d.v} views`;
      col.append(el('span', 'studio-val', d.v ? String(d.v) : ''), bar, el('small', '', d.label));
      chart.appendChild(col);
    }
    body.appendChild(chart);
    // Each clip.
    body.appendChild(el('span', 'field-label', 'Your clips'));
    if (!clips.length) {
      body.appendChild(el('p', 'page-note', 'You have not posted a clip yet. Press Ctrl+Q in a game to save a moment, then post it.'));
      return;
    }
    const table = el('div', 'studio-table');
    const head = el('div', 'studio-row head');
    for (const h of ['Clip', 'Views', 'Likes', 'Comments', 'Like rate', '']) head.appendChild(el('span', '', h));
    table.appendChild(head);
    clips.forEach((c) => {
      const row = el('div', 'studio-row');
      const name = el('span', 'studio-name');
      name.append(el('b', '', c.title || 'Untitled clip'), el('small', '', `${ago(c.created_at)} · ${Math.round(c.duration)} s${c.hidden ? ' · HIDDEN (reported)' : ''}`));
      const rate = c.views ? `${Math.round((c.likes / c.views) * 100)}%` : '-';
      row.append(name, el('span', 'num', views(c.views)), el('span', 'num', String(c.likes)), el('span', 'num', String(c.comments)), el('span', 'num', rate));
      row.appendChild(this.btn('Watch', 'small-btn', async () => {
        // The full rows (with stickers) of your visible clips.
        const me = this.game.account.online.id;
        const rows = await api.listClips('new', 0, 100, me).catch(() => []);
        const i = rows.findIndex((r) => r.id === c.id);
        if (i < 0) {
          this.game.toast('This clip is hidden after reports, so it cannot be played here.');
          return;
        }
        this.studio.openFeed({ title: 'CLIPS · STUDIO', items: rows, start: i, back: () => this.game.home.setPage('clips') });
      }));
      table.appendChild(row);
    });
    body.appendChild(table);
  }
}
