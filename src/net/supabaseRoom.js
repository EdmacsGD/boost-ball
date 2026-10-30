import { P2P } from './p2p.js';

// The claude.ai "room" calls the game uses (presence, onPeers, peers, join, connected), built on
// Supabase Realtime for the website build.
//
// Supabase splits what claude.ai's presence does in one: Presence (who is here, slow: the free plan
// allows 20 presence messages a second for the whole project) and Broadcast (fast messages). So the
// fields that change every frame (car, s, ts, rtt, dm) go out as one broadcast each send, and the
// rest (name, role, look, lobby info) as presence, sent at most twice a second.
const FAST = new Set(['car', 's', 'ts', 'rtt', 'dm', 'qc']);
// Fast messages through Supabase when a pair has no direct connection. Every message counts once
// when sent and once per player it reaches, so n players sending r times a second use n * n * r of
// the project's 100 a second: keep the whole match near 80.
const RELAY_BUDGET = 80;

function randomPeer() {
  return 'p' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

class SbRoom {
  constructor(sb, topic, me, uid, direct = false) {
    this.sb = sb;
    this.seq = 0; // number on our fast messages (a message arrives twice when both routes carry it)
    this.seqSeen = new Map(); // peer -> newest number seen
    this.lastRelay = 0;
    this.p2p = direct ? new P2P(me, (to, m) => this.sendSignal(to, m), (from, text) => this.onDirect(from, text)) : null;
    this.topic = topic;
    this.me = me;
    this.uid = uid;
    this.my = {};
    this.pres = new Map(); // peer -> { presence, at, uid }
    this.fast = new Map(); // peer -> { data, at }
    this.cache = new Map(); // peer -> frozen Peer object
    this.listeners = new Set();
    this.connListeners = new Set();
    this.isConnected = false;
    this.pending = { joined: [], left: [], updated: [] };
    this.scheduled = false;
    this.trackTimer = null;
    this.lastTrack = 0;
    this.lowDirty = false;
    this.ch = null;
  }

  open() {
    const ch = this.sb.channel(this.topic, { config: { presence: { key: this.me }, broadcast: { self: false, ack: false } } });
    this.ch = ch;
    ch.on('presence', { event: 'sync' }, () => this.onSync());
    ch.on('broadcast', { event: 'f' }, (msg) => this.onFast(msg && msg.payload));
    if (this.p2p) {
      ch.on('broadcast', { event: 'sig' }, (msg) => {
        const m = msg && msg.payload;
        if (m && m.to === this.me && typeof m.from === 'string') this.p2p.onSignal(m.from, m.m);
      });
    }
    return new Promise((resolve, reject) => {
      let done = false;
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.setConn(true);
          this.trackNow();
          if (!done) {
            done = true;
            resolve(this);
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.setConn(false);
          if (!done) {
            done = true;
            reject(new Error(status));
          }
        }
      });
    });
  }

  setConn(on) {
    if (this.isConnected === on) return;
    this.isConnected = on;
    for (const fn of this.connListeners) fn(on);
  }

  // ---- incoming
  onSync() {
    const state = this.ch.presenceState();
    const seen = new Set();
    for (const [key, metas] of Object.entries(state)) {
      if (!Array.isArray(metas) || !metas.length) continue;
      const meta = metas[metas.length - 1] || {};
      seen.add(key);
      if (key === this.me) continue;
      const prev = this.pres.get(key);
      const data = meta.d && typeof meta.d === 'object' ? meta.d : {};
      if (!prev || JSON.stringify(prev.presence) !== JSON.stringify(data)) {
        this.pres.set(key, { presence: data, at: Date.now(), uid: typeof meta.uid === 'string' ? meta.uid : null });
        this.cache.delete(key);
        this.mark(prev ? 'updated' : 'joined', key);
      }
    }
    for (const key of [...this.pres.keys()]) {
      if (!seen.has(key)) {
        const obj = this.peerObj(key);
        this.pres.delete(key);
        this.fast.delete(key);
        this.cache.delete(key);
        this.pending.left.push(obj);
        this.schedule();
      }
    }
    if (this.p2p) this.p2p.sync([...seen]);
  }

  sendSignal(to, m) {
    if (!this.ch) return;
    this.ch.send({ type: 'broadcast', event: 'sig', payload: { from: this.me, to, m } }).catch(() => {});
  }

  onDirect(from, text) {
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch (e) {
      return;
    }
    if (payload && payload.p === from) this.onFast(payload);
  }

  // How many of the other players we reach directly.
  netStatus() {
    const others = [...this.pres.keys()];
    const direct = this.p2p ? others.filter((k) => this.p2p.isOpen(k)).length : 0;
    return { direct, total: others.length };
  }

  onFast(payload) {
    if (!payload || typeof payload.p !== 'string' || payload.p === this.me || !payload.d || typeof payload.d !== 'object') return;
    const n = Number(payload.n);
    if (Number.isFinite(n)) {
      const seen = this.seqSeen.get(payload.p);
      // Older than what we have (it came the slow way). A much smaller number: the page reloaded.
      if (seen !== undefined && n <= seen && seen - n < 1e6) return;
      this.seqSeen.set(payload.p, n);
    }
    this.fast.set(payload.p, { data: payload.d, at: Date.now() });
    this.cache.delete(payload.p);
    if (this.pres.has(payload.p)) this.mark('updated', payload.p);
  }

  mark(kind, key) {
    this.pending[kind].push(key);
    this.schedule();
  }

  schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    setTimeout(() => {
      this.scheduled = false;
      const peers = this.peers();
      const toObj = (k) => (typeof k === 'string' ? peers.find((p) => p.peer === k) : k);
      const change = {
        peers,
        joined: this.pending.joined.map(toObj).filter(Boolean),
        left: this.pending.left.filter(Boolean),
        updated: [...new Set(this.pending.updated)].map(toObj).filter(Boolean),
      };
      this.pending = { joined: [], left: [], updated: [] };
      for (const fn of this.listeners) fn(change);
    }, 0);
  }

  peerObj(key) {
    if (this.cache.has(key)) return this.cache.get(key);
    const isMe = key === this.me;
    const p = isMe ? { presence: this.my, at: this.myAt || Date.now(), uid: this.uid } : this.pres.get(key);
    if (!p) return null;
    const f = isMe ? null : this.fast.get(key);
    const obj = Object.freeze({
      peer: key,
      by: p.uid || null,
      isMe,
      sameTab: isMe,
      kind: 'viewer',
      guest: false,
      presence: Object.freeze({ ...p.presence, ...(f ? f.data : {}) }),
      updatedAt: Math.max(p.at, f ? f.at : 0),
    });
    this.cache.set(key, obj);
    return obj;
  }

  // ---- the room calls
  peers() {
    const keys = [this.me, ...this.pres.keys()];
    return Object.freeze(keys.map((k) => this.peerObj(k)).filter(Boolean));
  }

  onPeers(fn) {
    this.listeners.add(fn);
    setTimeout(() => {
      const peers = this.peers();
      fn({ peers, joined: peers, left: [], updated: [] });
    }, 0);
    return () => this.listeners.delete(fn);
  }

  connected() {
    return this.isConnected;
  }

  onConnection(fn) {
    this.connListeners.add(fn);
    setTimeout(() => fn(this.isConnected), 0);
    return () => this.connListeners.delete(fn);
  }

  async presence(patch) {
    const fast = {};
    let anyFast = false;
    for (const [k, v] of Object.entries(patch || {})) {
      if (v === null) delete this.my[k];
      else this.my[k] = v;
      if (FAST.has(k)) {
        if (v !== null) {
          fast[k] = v;
          anyFast = true;
        }
      } else {
        this.lowDirty = true;
      }
    }
    this.myAt = Date.now();
    this.cache.delete(this.me);
    if (anyFast) this.sendFast();
    if (this.lowDirty) this.scheduleTrack();
    this.mark('updated', this.me);
  }

  // Our fast fields: straight to every player we have a direct channel to; through Supabase (at a
  // lower rate) only if someone is left over.
  sendFast() {
    const d = {};
    for (const [k, v] of Object.entries(this.my)) if (FAST.has(k)) d[k] = v;
    this.seq += 1;
    const payload = { p: this.me, d, n: this.seq };
    const reached = this.p2p ? this.p2p.send(JSON.stringify(payload)) : new Set();
    const others = [...this.pres.keys()];
    if (!others.some((k) => !reached.has(k)) || !this.isConnected) return;
    const n = others.length + 1;
    const hz = Math.max(2, Math.min(20, RELAY_BUDGET / (n * n)));
    const now = Date.now();
    if (now - this.lastRelay < 1000 / hz - 8) return;
    this.lastRelay = now;
    this.ch.send({ type: 'broadcast', event: 'f', payload }).catch(() => {});
  }

  scheduleTrack() {
    if (this.trackTimer) return;
    const wait = Math.max(50, 500 - (Date.now() - this.lastTrack));
    this.trackTimer = setTimeout(() => {
      this.trackTimer = null;
      this.trackNow();
    }, wait);
  }

  trackNow() {
    if (!this.ch || !this.isConnected) return;
    this.lowDirty = false;
    this.lastTrack = Date.now();
    const low = {};
    for (const [k, v] of Object.entries(this.my)) if (!FAST.has(k)) low[k] = v;
    this.ch.track({ d: low, uid: this.uid || null }).catch(() => {});
  }

  emit() {
    return Promise.resolve();
  }

  on() {
    return () => {};
  }

  async leave() {
    clearTimeout(this.trackTimer);
    this.listeners.clear();
    if (this.p2p) this.p2p.close();
    try {
      await this.ch.untrack();
    } catch (e) {
      // Ignore.
    }
    try {
      await this.sb.removeChannel(this.ch);
    } catch (e) {
      // Ignore.
    }
    this.setConn(false);
  }
}

// The lobby room, with join(name) for match rooms, like claude.ai's room capability.
// `uid`: the account id, or a function returning it (read again for every match room, since the
// player may log in after the page loaded).
export async function createSupabaseRoom(sb, uid) {
  const me = randomPeer();
  const uidNow = () => (typeof uid === 'function' ? uid() : uid) || null;
  const lobby = new SbRoom(sb, 'bb-lobby', me, uidNow());
  await lobby.open();
  lobby.join = async (name) => {
    const r = new SbRoom(sb, `bb-m-${name}`, me, uidNow(), true);
    r.sendHz = 30; // direct channels; the Supabase fallback picks its own lower rate
    await r.open();
    return r;
  };
  lobby.sendHz = 12;
  lobby.kind = 'supabase';
  return lobby;
}
