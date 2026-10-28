// Online play over the claude.ai artifact "room": everyone who has the game open right now.
//
// Everything travels as presence (one small object per player that the platform shares about 30
// times a second); no event topics, so every invited player can send without special rights.
//
// - Lobby (the shared room): who is online, open matches, the quick-play queue.
// - Match (a named room "bb-<code>"): the host runs the match. Each player simulates their own car
//   and shares its state; the host simulates the ball and the bots, keeps the score and the clock,
//   and shares them. So your own car always reacts at once, and the ball is the same for everyone.
//
// Nothing here is trusted: names and looks are display data, checked against the catalog on use.
import { encodeLook } from './codec.js';
import { backendKind, supabase } from './backend.js';
import { createSupabaseRoom } from './supabaseRoom.js';

const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
export const SEND_HZ = 30;
const QUEUE_WAIT_MS = 8000; // with 2+ waiting, start without a full lobby after this long
const AUTO_START_MS = 10000; // queue matches start this long after creation even if someone never came

export const perTeamOf = (mode) => (mode === '3v3' ? 3 : mode === '2v2' ? 2 : 1);
export const cleanCode = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6);
const cleanText = (s, n = 16) => String(s || '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯]/g, '').slice(0, n);
const MODES = ['1v1', '2v2', '3v3'];

export class Online {
  constructor(game) {
    this.game = game;
    this.available = false;
    this.connected = false;
    this.room = null;
    this.user = null;
    this.status = 'idle'; // idle | browsing | queue | hosting | joining | match
    this.queueMode = '1v1';
    this.queueSince = 0;
    this.match = null; // NamedRoom
    this.code = null;
    this.role = null; // 'host' | 'client'
    this.mode = '1v1';
    this.lobbyPeers = [];
    this.matchPeers = [];
    this.hostPeer = null;
    this.order = []; // host: human peers in join order
    this.want = new Map(); // host: peer -> wanted team
    this.started = false;
    this.createdAt = 0;
    this.inv = [];
    this.listeners = new Set();
    this.sendAcc = 0;
    this.joinTimer = null;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  changed() {
    for (const fn of this.listeners) fn(this);
  }

  async init() {
    const kind = backendKind();
    this.kind = kind;
    if (!kind) return;
    try {
      let room = null;
      if (kind === 'claude') {
        const c = window.claude;
        const [r, user] = await Promise.all([c.use('room'), c.use('user')]);
        room = r;
        this.user = user;
        try {
          this.uid = user ? await user.id() : null;
        } catch (e) {
          this.uid = null;
        }
      } else {
        const sb = await supabase();
        const { data } = await sb.auth.getSession();
        this.uid = data && data.session ? data.session.user.id : null;
        room = await createSupabaseRoom(sb, this.uid);
      }
      if (!room) return;
      this.attach(room);
    } catch (e) {
      this.available = false;
      this.error = 'Could not connect to the game server.';
      this.changed();
    }
  }

  attach(room) {
    this.room = room;
    this.available = true;
    room.onPeers((ch) => {
      this.lobbyPeers = ch.peers;
      this.checkQueue();
      this.changed();
    }, () => {
      this.available = false;
      this.changed();
    });
    room.onConnection((on) => {
      this.connected = on;
      this.changed();
    });
    this.changed();
  }

  get myLobbyPeer() {
    return this.lobbyPeers.find((p) => p.sameTab)?.peer || null;
  }

  // ------------------------------------------------------------------ lobby
  lobbyPresence(extra = {}) {
    if (!this.room) return;
    const acc = this.game.account;
    const base = { bb: 1, name: acc.data.name, title: acc.loadout.title, icon: acc.loadout.icon, lvl: acc.level(), status: this.status };
    const patch = { ...base, code: null, mode: null, n: null, max: null, open: null, inv: null, qm: null, qt: null, ...extra };
    // Send only real changes: our own presence change comes back as a peers update, and re-sending
    // from that handler would loop forever.
    const key = JSON.stringify(patch);
    if (key === this.lastLobbyKey) return;
    this.lastLobbyKey = key;
    this.room.presence(patch).catch(() => {});
  }

  setBrowsing(on) {
    if (this.status === 'idle' && on) {
      this.status = 'browsing';
      this.lobbyPresence();
    } else if (this.status === 'browsing' && !on) {
      this.status = 'idle';
      this.lobbyPresence();
    }
  }

  // Players online (lobby room) who have the game's online page open or are playing.
  onlinePlayers() {
    return this.lobbyPeers.filter((p) => p.presence && p.presence.bb === 1 && p.presence.status && p.presence.status !== 'idle');
  }

  openMatches() {
    return this.lobbyPeers
      .filter((p) => !p.sameTab && p.presence && p.presence.bb === 1 && p.presence.status === 'hosting' && p.presence.open && MODES.includes(p.presence.mode))
      .map((p) => ({ peer: p.peer, code: cleanCode(p.presence.code), mode: p.presence.mode, n: Number(p.presence.n) || 1, max: Number(p.presence.max) || 2, host: cleanText(p.presence.name) || 'PLAYER', guest: p.guest }))
      .filter((m) => m.code.length >= 4 && m.n < m.max);
  }

  // ------------------------------------------------------------------ quick play queue
  startQueue(mode) {
    if (!this.available || this.match) return;
    this.queueMode = MODES.includes(mode) ? mode : '1v1';
    this.queueSince = Date.now();
    this.status = 'queue';
    this.lobbyPresence({ qm: this.queueMode, qt: this.queueSince });
    this.changed();
    clearInterval(this.queueTimer);
    this.queueTimer = setInterval(() => this.checkQueue(), 1000);
  }

  cancelQueue() {
    clearInterval(this.queueTimer);
    if (this.status !== 'queue') return;
    this.status = 'browsing';
    this.lobbyPresence();
    this.changed();
  }

  queued(mode) {
    return this.lobbyPeers
      .filter((p) => p.presence && p.presence.bb === 1 && p.presence.status === 'queue' && p.presence.qm === mode)
      .sort((a, b) => (Number(a.presence.qt) - Number(b.presence.qt)) || (a.peer < b.peer ? -1 : 1));
  }

  // Everyone runs the same rule on the same list: the one waiting longest hosts and invites the next
  // ones; the others join when they see their own label in a host's invite list.
  checkQueue() {
    if (this.status !== 'queue') return;
    const me = this.myLobbyPeer;
    if (!me) return;
    const inviter = this.lobbyPeers.find((p) => !p.sameTab && p.presence && p.presence.status === 'hosting' && Array.isArray(p.presence.inv) && p.presence.inv.includes(me));
    if (inviter) {
      clearInterval(this.queueTimer);
      this.join(cleanCode(inviter.presence.code));
      return;
    }
    const q = this.queued(this.queueMode);
    if (!q.length || !q[0].sameTab) return;
    const need = perTeamOf(this.queueMode) * 2;
    const waited = Date.now() - this.queueSince;
    if (q.length >= need || (q.length >= 2 && waited > QUEUE_WAIT_MS)) {
      clearInterval(this.queueTimer);
      const inv = q.slice(1, need).map((p) => p.peer);
      this.host(this.queueMode, { inv, auto: true });
    }
  }

  // ------------------------------------------------------------------ match room
  newCode() {
    let s = '';
    for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return s;
  }

  async host(mode, { inv = [], auto = false } = {}) {
    if (!this.available) return false;
    await this.leave(true);
    this.mode = MODES.includes(mode) ? mode : '1v1';
    this.role = 'host';
    this.code = this.newCode();
    this.inv = inv;
    this.auto = auto;
    this.started = false;
    this.order = [];
    this.want.clear();
    this.createdAt = Date.now();
    const ok = await this.enterRoom();
    if (!ok) return false;
    this.status = 'hosting';
    this.updateHostLobby();
    this.changed();
    return true;
  }

  async join(code) {
    code = cleanCode(code);
    if (!this.available || code.length < 4) return false;
    await this.leave(true);
    this.role = 'client';
    this.code = code;
    this.started = false;
    this.status = 'joining';
    this.changed();
    const ok = await this.enterRoom();
    if (!ok) return false;
    this.lobbyPresence({ code: this.code });
    // No host answering within a few seconds: wrong code or the match is gone.
    clearTimeout(this.joinTimer);
    this.joinTimer = setTimeout(() => {
      if (this.role === 'client' && !this.hostPeer) {
        this.game.toast('No match with that code');
        this.leave();
      }
    }, 7000);
    return true;
  }

  async enterRoom() {
    this.lastMatchKey = null;
    try {
      this.match = await this.room.join(`bb-${this.code}`);
    } catch (e) {
      this.game.toast('Could not join the match room');
      this.match = null;
      this.role = null;
      this.status = 'browsing';
      this.changed();
      return false;
    }
    const acc = this.game.account;
    this.myLook = encodeLook(acc.loadout, this.game.accentHex());
    this.match.presence({ role: this.role === 'host' ? 'host' : 'player', name: acc.data.name, look: this.myLook, want: null, car: null, m: null, s: null }).catch(() => {});
    this.match.onPeers((ch) => this.onMatchPeers(ch), () => this.lostRoom());
    return true;
  }

  lostRoom() {
    if (!this.match) return;
    this.game.toast('Lost the connection to the match');
    this.leave();
  }

  // Leave the match room (quiet: no toast, used before hosting or joining another).
  async leave(quiet = false) {
    clearTimeout(this.joinTimer);
    clearInterval(this.queueTimer);
    const wasIn = this.started;
    const r = this.match;
    this.match = null;
    this.matchPeers = [];
    this.hostPeer = null;
    this.role = null;
    this.code = null;
    this.started = false;
    this.order = [];
    if (r) {
      try {
        await r.leave();
      } catch (e) {
        // Already gone.
      }
    }
    if (this.status !== 'idle') this.status = 'browsing';
    this.lobbyPresence();
    if (wasIn && !quiet) this.game.onOnlineEnded();
    this.changed();
  }

  get myMatchPeer() {
    return this.matchPeers.find((p) => p.sameTab)?.peer || null;
  }

  onMatchPeers(ch) {
    this.matchPeers = ch.peers;
    const host = ch.peers.find((p) => !p.sameTab && p.presence && p.presence.role === 'host');
    if (this.role === 'client') {
      if (host) this.hostPeer = host.peer;
      if (this.hostPeer && ch.left.some((p) => p.peer === this.hostPeer)) {
        this.game.toast('The host left the match');
        this.leave();
        return;
      }
      if (host) this.onHostPresence(host.presence, host.updatedAt);
    } else if (this.role === 'host') {
      this.hostPeer = this.myMatchPeer;
      const humans = ch.peers.filter((p) => p.presence && (p.presence.role === 'player' || p.sameTab));
      // Keep join order; drop leavers; add newcomers while the lobby is open and has room.
      this.order = this.order.filter((peer) => humans.some((p) => p.peer === peer));
      const max = perTeamOf(this.mode) * 2;
      for (const p of humans) {
        if (!this.order.includes(p.peer) && (p.sameTab || (!this.started && this.order.length < max))) {
          if (p.sameTab) this.order.unshift(p.peer);
          else this.order.push(p.peer);
        }
        const w = p.presence && p.presence.want;
        if (w === 0 || w === 1) this.want.set(p.peer, w);
      }
      for (const p of ch.left) this.game.onOnlinePeerLeft(p.peer);
      this.updateHostLobby();
      if (this.auto && !this.started) {
        const allIn = this.inv.every((peer) => humans.some((p) => p.peer === peer)); // peer labels are the same in every room
        if ((allIn && humans.length >= 2) || (Date.now() - this.createdAt > AUTO_START_MS && humans.length >= 2)) this.start();
      }
    }
    this.changed();
  }

  // Team list for the host's lobby: humans in join order, each on the team they want if it has room.
  teams() {
    const per = perTeamOf(this.mode);
    const t = [[], []];
    for (const peer of this.order) {
      const w = this.want.get(peer);
      const pick = w === 0 || w === 1 ? w : (t[0].length <= t[1].length ? 0 : 1);
      if (t[pick].length < per) t[pick].push(peer);
      else if (t[1 - pick].length < per) t[1 - pick].push(peer);
    }
    return t;
  }

  peerInfo(peer) {
    const p = this.matchPeers.find((x) => x.peer === peer);
    const pr = (p && p.presence) || {};
    return { name: cleanText(pr.name) || 'PLAYER', look: pr.look && typeof pr.look === 'object' ? pr.look : {}, me: !!(p && p.sameTab), guest: !!(p && p.guest) };
  }

  updateHostLobby() {
    if (this.role !== 'host' || !this.match) return;
    const max = perTeamOf(this.mode) * 2;
    this.lobbyPresence({ code: this.code, mode: this.mode, n: this.order.length, max, open: !this.auto && !this.started && this.order.length < max, inv: this.inv.length ? this.inv : null });
    if (!this.started) {
      const m = { mode: this.mode, ph: 'lobby', teams: this.teams(), arena: this.game.settings.arena };
      const key = JSON.stringify(m);
      if (key !== this.lastMatchKey) {
        this.lastMatchKey = key;
        this.match.presence({ m }).catch(() => {});
      }
    }
  }

  wantTeam(team) {
    if (!this.match) return;
    if (this.role === 'host') {
      this.want.set(this.myMatchPeer, team);
      this.updateHostLobby();
    } else {
      this.match.presence({ want: team }).catch(() => {});
    }
    this.changed();
  }

  // Host: freeze the line-up and start. Slots: team 0 then team 1, humans first, bots fill.
  start() {
    if (this.role !== 'host' || this.started || !this.match) return;
    const per = perTeamOf(this.mode);
    const t = this.teams();
    const slots = [];
    let bot = 0;
    for (const team of [0, 1]) {
      for (let i = 0; i < per; i++) {
        const peer = t[team][i];
        if (peer) slots.push({ team, peer, ...this.peerInfo(peer) });
        else slots.push({ team, peer: null, bot: bot++ });
      }
    }
    this.started = true;
    this.status = 'match';
    this.slotsWire = slots.map((s) => [s.team, s.peer || '', s.peer ? 0 : 1]);
    this.match.presence({ m: { mode: this.mode, ph: 'game', arena: this.game.settings.arena, slots: this.slotsWire, seed: Math.floor(Math.random() * 1e9) } }).catch(() => {});
    this.updateHostLobby();
    this.game.startOnlineMatch(this.buildSlots(this.slotsWire), this.game.settings.arena, this.mode, true);
    this.changed();
  }

  buildSlots(wire) {
    return wire.map(([team, peer, isBot], i) => (isBot || !peer ? { team: team ? 1 : 0, peer: null, bot: true, index: i } : { team: team ? 1 : 0, peer, index: i, ...this.peerInfo(peer) }));
  }

  // Client: follow what the host says.
  onHostPresence(pr, at) {
    const m = pr && pr.m;
    if (!m || typeof m !== 'object') return;
    if (MODES.includes(m.mode)) this.mode = m.mode;
    if (m.ph === 'game' && !this.started && Array.isArray(m.slots)) {
      const me = this.myMatchPeer;
      const wire = m.slots.filter((s) => Array.isArray(s)).slice(0, 6);
      if (!wire.some((s) => s[1] === me)) {
        this.game.toast('That match already started');
        this.leave();
        return;
      }
      this.started = true;
      this.status = 'match';
      clearTimeout(this.joinTimer);
      this.game.startOnlineMatch(this.buildSlots(wire), typeof m.arena === 'string' ? m.arena : 'aurora', this.mode, false);
    }
    if (this.started && pr.s) this.game.onHostSnapshot(pr.s, at);
  }

  // Every frame: send our part about 30 times a second.
  update(dt) {
    if (!this.match || !this.started) return;
    this.sendAcc += dt;
    if (this.sendAcc < 1 / (this.room.sendHz || SEND_HZ)) return;
    this.sendAcc = 0;
    const patch = this.game.netOutgoing();
    if (patch) this.match.presence(patch).catch(() => {});
    // Clients: read every player's car from their presence.
    for (const p of this.matchPeers) {
      if (p.sameTab || !p.presence) continue;
      if (p.presence.car) this.game.onPeerCar(p.peer, p.presence, p.updatedAt);
    }
  }
}
