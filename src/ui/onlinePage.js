// Home screen "Online" page: quick play queue, create / join a match by code, open matches, and the
// match lobby (teams, start, leave). Draws from the Online state and redraws on every change.
import { perTeamOf, cleanCode } from '../net/online.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const MODES = ['1v1', '2v2', '3v3'];

export class OnlinePage {
  constructor(game) {
    this.game = game;
    this.mode = '1v1';
    this.codeDraft = '';
    this.body = $('onlineBody');
    game.online.onChange(() => this.render());
    game.account.onChange(() => this.render());
    setInterval(() => {
      const o = game.online;
      if (this.visible && (o.status === 'queue' || o.status === 'joining')) this.render();
    }, 1000);
  }

  get visible() {
    const h = this.game.home;
    return h.page === 'online' && !h.el.hidden;
  }

  shown(on) {
    this.game.online.setBrowsing(on);
    if (on) this.render();
  }

  btn(text, cls, fn) {
    const b = el('button', cls, text);
    b.type = 'button';
    b.addEventListener('click', this.game.home.click(fn));
    return b;
  }

  field(label) {
    const f = el('div', 'field');
    f.appendChild(el('span', 'field-label', label));
    return f;
  }

  render() {
    if (!this.visible) return;
    const g = this.game;
    const o = g.online;
    const body = this.body;
    // Keep a half-typed join code across redraws.
    const codeIn = body.querySelector('#joinCode');
    if (codeIn) this.codeDraft = codeIn.value;
    const focusCode = document.activeElement === codeIn;
    body.textContent = '';

    if (!o.available) {
      let text = 'Online play is not available in this copy of the game (the offline file). Open the website or the claude.ai link instead.';
      if (o.kind === 'claude') text = 'Online play works when the game is opened from its claude.ai link while you are signed in. Other players need the link too: share the game with them from the Share menu (they need at least "can interact" access).';
      if (o.kind === 'supabase') text = o.error || 'Connecting to the game server...';
      body.appendChild(el('p', 'page-note', text));
      return;
    }
    const allowed = g.account.mode === 'online' || g.testMode;
    if (!allowed) {
      body.appendChild(el('p', 'page-note', 'You need an online profile to play against other players. Your name, car, boost and title are what they see.'));
      body.appendChild(this.btn('Log in or create a profile', 'kick', () => g.showLogin()));
      return;
    }
    const status = el('p', 'online-status');
    const others = o.onlinePlayers().filter((p) => !p.sameTab).length;
    status.textContent = `${o.connected ? 'Connected' : 'Connecting...'} · ${others} other player${others === 1 ? '' : 's'} online`;
    body.appendChild(status);

    if (o.match) {
      this.renderMatchLobby(body);
      return;
    }

    // Mode for quick play and new matches.
    const fm = this.field('Mode');
    const seg = el('div', 'seg');
    for (const m of MODES) {
      const b = this.btn(m, m === this.mode ? 'on' : '', () => {
        this.mode = m;
        this.render();
      });
      seg.appendChild(b);
    }
    fm.appendChild(seg);
    fm.appendChild(el('span', 'field-note', 'Empty places are filled with bots.'));
    body.appendChild(fm);

    // Quick play.
    const fq = this.field('Quick play');
    if (o.status === 'queue') {
      const secs = Math.floor((Date.now() - o.queueSince) / 1000);
      const waiting = o.queued(o.queueMode).length;
      fq.appendChild(el('p', 'queue-line', `Searching ${o.queueMode} · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} · ${waiting} waiting`));
      fq.appendChild(this.btn('Cancel', '', () => o.cancelQueue()));
    } else {
      fq.appendChild(this.btn(`Find a ${this.mode} match`, 'kick', () => o.startQueue(this.mode)));
    }
    body.appendChild(fq);

    // Private match.
    const fp = this.field('Play with friends');
    const row = el('div', 'online-row');
    row.appendChild(this.btn(`Create ${this.mode} match`, '', () => o.host(this.mode)));
    const inp = el('input', 'code-input');
    inp.id = 'joinCode';
    inp.placeholder = 'Code';
    inp.maxLength = 6;
    inp.spellcheck = false;
    inp.autocomplete = 'off';
    inp.setAttribute('aria-label', 'Match code');
    inp.value = this.codeDraft;
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') o.join(inp.value);
    });
    row.appendChild(inp);
    row.appendChild(this.btn('Join', '', () => o.join(inp.value)));
    fp.appendChild(row);
    body.appendChild(fp);
    if (focusCode) inp.focus();

    if (o.status === 'joining') body.appendChild(el('p', 'page-note', `Joining ${o.code}...`));

    // Open matches.
    const fl = this.field('Open matches');
    const list = o.openMatches();
    if (!list.length) fl.appendChild(el('p', 'page-note', 'No open matches right now. Create one, or use quick play.'));
    for (const m of list) {
      const card = el('div', 'match-card');
      const t = el('div', 'match-text');
      t.append(el('b', '', `${m.host}'s ${m.mode}`), el('small', '', `${m.n}/${m.max} players · code ${m.code}`));
      card.append(t, this.btn('Join', '', () => o.join(m.code)));
      fl.appendChild(card);
    }
    body.appendChild(fl);
  }

  renderMatchLobby(body) {
    const g = this.game;
    const o = g.online;
    const head = el('div', 'lobby-head');
    const code = el('div', 'lobby-code');
    code.append(el('small', '', 'Match code'), el('b', '', (o.code || '').toUpperCase()));
    head.appendChild(code);
    head.appendChild(el('span', 'lobby-mode', `${o.mode} · ${o.role === 'host' ? 'you are the host' : 'waiting for the host to start'}`));
    body.appendChild(head);
    if (o.started) {
      body.appendChild(el('p', 'page-note', 'The match is running.'));
      return;
    }
    const teams = this.teamsView();
    const per = perTeamOf(o.mode);
    const cols = el('div', 'lobby-teams');
    ['Blue', 'Orange'].forEach((label, team) => {
      const col = el('div', `lobby-team ${team ? 'orange' : 'blue'}`);
      col.appendChild(el('span', 'field-label', label));
      for (let i = 0; i < per; i++) {
        const p = teams[team][i];
        const row = el('div', `lobby-slot${p ? '' : ' bot'}${p && p.me ? ' me' : ''}`);
        row.textContent = p ? `${p.name}${p.me ? ' (you)' : ''}` : 'Bot';
        col.appendChild(row);
      }
      if (!teams[team].some((p) => p.me) && teams[team].length < per) col.appendChild(this.btn(`Join ${label}`, 'small-btn', () => o.wantTeam(team)));
      cols.appendChild(col);
    });
    body.appendChild(cols);
    const humans = teams[0].length + teams[1].length;
    const btns = el('div', 'online-row');
    if (o.role === 'host') {
      const start = this.btn(humans >= 2 ? 'Start match' : 'Waiting for players...', 'kick', () => o.start());
      start.disabled = humans < 2;
      btns.appendChild(start);
    }
    btns.appendChild(this.btn('Leave', '', () => o.leave()));
    body.appendChild(btns);
    body.appendChild(el('p', 'page-note', o.kind === 'supabase' ? 'Send the code to a friend. They open the game website, log in, pick Online, and type it in.' : 'Send the code to a friend. They open the game from the same claude.ai link, pick Online, and type it in.'));
  }

  // Teams as names: the host computes them; everyone else reads the host's list.
  teamsView() {
    const o = this.game.online;
    let t = [[], []];
    if (o.role === 'host') t = o.teams();
    else {
      const host = o.matchPeers.find((p) => p.peer === o.hostPeer);
      const m = host && host.presence && host.presence.m;
      if (m && Array.isArray(m.teams)) t = [0, 1].map((i) => (Array.isArray(m.teams[i]) ? m.teams[i].filter((x) => typeof x === 'string').slice(0, 3) : []));
    }
    return t.map((list) => list.map((peer) => o.peerInfo(peer)));
  }
}

export { cleanCode };
