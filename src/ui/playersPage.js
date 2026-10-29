// Home screen "Players" page: leaderboard (play time, goals, wins), search, and a profile view with
// the player's match history. Website build only (the data lives in Supabase).
import { playersAvailable, topPlayers, playerById, playerMatches, formatPlaytime, SORTS, loadBadges, badgeOf } from '../net/players.js';
import { bannerCard, badgePill } from './playerCard.js';
import { iconSvg } from './icons.js';
import { item } from '../meta/items.js';
import { tierOf } from '../meta/rank.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

function when(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? `Today ${pad(d.getHours())}:${pad(d.getMinutes())}` : `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export class PlayersPage {
  constructor(game) {
    this.game = game;
    this.body = $('playersBody');
    this.sort = 'playtime';
    this.search = '';
    this.rows = null;
    this.error = '';
    this.viewing = null; // { profile, matches } when a profile is open
    this.loadToken = 0;
  }

  shown() {
    this.viewing = null;
    this.load();
  }

  async load() {
    if (!playersAvailable()) {
      this.render();
      return;
    }
    const token = ++this.loadToken;
    this.loading = true;
    this.render();
    try {
      const [rows] = await Promise.all([topPlayers(this.sort, this.search), loadBadges()]);
      if (token !== this.loadToken) return;
      this.rows = rows;
      this.error = '';
    } catch (e) {
      if (token !== this.loadToken) return;
      this.error = 'Could not load the players. Check your internet and try again.';
    }
    this.loading = false;
    this.render();
  }

  async open(id) {
    const token = ++this.loadToken;
    this.viewing = { loading: true };
    this.render();
    try {
      const [profile, matches] = await Promise.all([playerById(id), playerMatches(id), loadBadges()]);
      if (token !== this.loadToken) return;
      this.viewing = profile ? { profile, matches } : { error: 'That player was not found.' };
    } catch (e) {
      if (token !== this.loadToken) return;
      this.viewing = { error: 'Could not load this profile. Try again.' };
    }
    this.render();
  }

  btn(text, cls, fn) {
    const b = el('button', cls, text);
    b.type = 'button';
    b.addEventListener('click', this.game.home.click(fn));
    return b;
  }

  get myId() {
    const acc = this.game.account;
    return acc.mode === 'online' && acc.online ? acc.online.id : null;
  }

  render() {
    const body = this.body;
    const searchIn = body.querySelector('#playerSearch');
    const hadFocus = document.activeElement === searchIn;
    body.textContent = '';
    if (!playersAvailable()) {
      body.appendChild(el('p', 'page-note', 'The leaderboard and player profiles are on the game website. Players need an online profile there to show up.'));
      return;
    }
    if (this.viewing) {
      this.renderProfile(body);
      return;
    }
    // Sort tabs and search.
    const top = el('div', 'players-top');
    const seg = el('div', 'seg');
    for (const [key, s] of Object.entries(SORTS)) {
      seg.appendChild(this.btn(s.label, key === this.sort ? 'on' : '', () => {
        this.sort = key;
        this.load();
      }));
    }
    const search = el('input', 'player-search');
    search.id = 'playerSearch';
    search.placeholder = 'Search name';
    search.maxLength = 16;
    search.spellcheck = false;
    search.autocomplete = 'off';
    search.setAttribute('aria-label', 'Search players by name');
    search.value = this.search;
    search.addEventListener('keydown', (e) => e.stopPropagation());
    search.addEventListener('input', () => {
      this.search = search.value;
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => this.load(), 300);
    });
    top.append(seg, search);
    body.appendChild(top);
    if (hadFocus) {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
    }

    if (this.error) {
      body.appendChild(el('p', 'page-note', this.error));
      return;
    }
    if (!this.rows) {
      body.appendChild(el('p', 'page-note', 'Loading...'));
      return;
    }
    if (!this.rows.length) {
      body.appendChild(el('p', 'page-note', this.search ? 'Nobody with that name.' : 'No players yet. Create an online profile to be the first.'));
      return;
    }
    const list = el('div', 'board');
    const me = this.myId;
    this.rows.forEach((r, i) => {
      const row = el('button', `board-row${r.id === me ? ' me' : ''}`);
      row.type = 'button';
      const rank = el('span', `board-rank${i < 3 ? ` top${i + 1}` : ''}`, String(i + 1));
      const ic = el('span', 'board-icon');
      ic.innerHTML = iconSvg(item('icon', r.icon) ? r.icon : 'ball');
      const who = el('span', 'board-who');
      const nameLine = el('span', 'board-name');
      nameLine.appendChild(el('b', '', r.name || 'PLAYER'));
      const pill = badgePill(badgeOf(r.id));
      if (pill) nameLine.appendChild(pill);
      who.append(nameLine, el('small', '', `LVL ${r.level || 1} · ${(item('title', r.title) || { name: 'Rookie' }).name.toUpperCase()}`));
      const sortDef = SORTS[this.sort];
      let valEl;
      if (sortDef.rating) {
        const rv = Number(r[sortDef.col]) || 1000;
        const t = tierOf(rv);
        valEl = el('span', 'board-val tier');
        valEl.style.setProperty('--tier', t.color);
        valEl.append(el('b', '', String(rv)), el('small', '', t.name));
      } else {
        valEl = el('span', 'board-val', this.sort === 'playtime' ? formatPlaytime(r.playtime) : String(this.sort === 'goals' ? r.goals : r.wins));
      }
      row.append(rank, ic, who, valEl);
      row.title = `Open ${r.name || 'PLAYER'}'s profile`;
      row.addEventListener('click', this.game.home.click(() => this.open(r.id)));
      list.appendChild(row);
    });
    body.appendChild(list);
    if (!me) body.appendChild(el('p', 'page-note', 'You are not on the list: log in with an online profile to join it.'));
  }

  renderProfile(body) {
    const v = this.viewing;
    body.appendChild(this.btn('Back to the list', 'small-btn', () => {
      this.viewing = null;
      this.loadToken++;
      this.render();
    }));
    if (v.loading) {
      body.appendChild(el('p', 'page-note', 'Loading...'));
      return;
    }
    if (v.error) {
      body.appendChild(el('p', 'page-note', v.error));
      return;
    }
    const p = v.profile;
    body.appendChild(bannerCard({ name: p.name, title: p.title, icon: p.icon, banner: p.banner, level: p.level, badge: badgeOf(p.id) }, 'big'));
    const stats = el('div', 'pstats');
    const winRate = p.matches ? `${Math.round((p.wins / p.matches) * 100)}%` : '-';
    for (const [label, value] of [['Matches', p.matches], ['Wins', p.wins], ['Win rate', winRate], ['Goals', p.goals], ['Play time', formatPlaytime(p.playtime)]]) {
      const s = el('div', 'pstat');
      s.append(el('b', '', String(value)), el('small', '', label));
      stats.appendChild(s);
    }
    body.appendChild(stats);
    const rr = el('div', 'rating-row');
    for (const m of ['1v1', '2v2', '3v3']) {
      const v = Number(p[`elo_${m}`]) || 1000;
      const t = tierOf(v);
      const c = el('span', 'rating-chip');
      c.style.setProperty('--tier', t.color);
      c.append(el('small', '', `Rank ${m}`), el('b', '', String(v)), el('i', '', t.name));
      rr.appendChild(c);
    }
    body.appendChild(rr);
    const head = el('span', 'field-label', 'Match history');
    body.appendChild(head);
    if (!v.matches.length) {
      body.appendChild(el('p', 'page-note', 'No matches yet. Matches against bots and online matches show up here.'));
      return;
    }
    const list = el('div', 'history');
    for (const m of v.matches) {
      const res = m.draw ? 'D' : m.won ? 'W' : 'L';
      const row = el('div', `hist-row ${res === 'W' ? 'won' : res === 'L' ? 'lost' : 'draw'}`);
      row.appendChild(el('span', 'hist-res', res));
      const mid = el('div', 'hist-mid');
      const score = el('b', '', `${m.score_us} - ${m.score_them}`);
      const elo = m.ranked && Number.isFinite(m.elo_change) ? ` · Ranked ${m.elo_change >= 0 ? '+' : ''}${m.elo_change}` : '';
      const tags = el('small', '', `${m.mode} · ${m.online ? 'Online' : 'Bots'}${m.team ? ' · Orange' : ' · Blue'}${m.mvp ? ' · MVP' : ''}${elo}`);
      mid.append(score, tags);
      const line = el('span', 'hist-stats', `${m.goals} G · ${m.assists} A · ${m.saves} S · ${m.points} pts`);
      row.append(mid, line, el('span', 'hist-when', when(m.played_at)));
      list.appendChild(row);
    }
    body.appendChild(list);
  }
}
