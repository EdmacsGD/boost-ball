// Player account: name, record, level, inventory, loadout, quests and unopened Sport Drops.
//
// Two places to keep it:
// - online: the claude.ai artifact database, in this viewer's private folder (data/users/<id>/profile).
//   Only works when the game is opened from its claude.ai link by someone signed in who may save
//   there (the owner, or people given edit access). The claude.ai sign-in is the login.
// - guest: this browser's local storage. Works everywhere, offline file included.
import { UNLOCK_ITEMS, DEFAULT_LOADOUT, CATEGORIES, item, key, rollDrop, isCustomAnthem } from './items.js';
import { fillQuests, newQuest, questInfo, questText } from './quests.js';
import { backendKind, supabase } from '../net/backend.js';

const GUEST_KEY = 'boostball.guest.v1';
export const XP_PER_LEVEL = 600;
const WELCOME_DROPS = 3;

function freshData(name) {
  return {
    v: 1,
    name: name || 'PLAYER',
    created: Date.now(),
    xp: 0,
    matches: 0,
    wins: 0,
    goals: 0,
    mvps: 0,
    playtime: 0, // seconds played (matches, training, Sky Field)
    winsByMode: { '1v1': 0, '2v2': 0, '3v3': 0 },
    tot: { saves: 0, demos: 0, assists: 0, hattricks: 0 }, // lifetime match totals for achievement items
    elo: { '1v1': 1000, '2v2': 1000, '3v3': 1000 }, // ranked rating per mode (website; set by the server)
    top1: 0, // 1 once this player has been #1 on a leaderboard (website; set by the server, never taken back)
    drops: WELCOME_DROPS,
    opened: 0,
    owned: [],
    loadout: { ...DEFAULT_LOADOUT },
    quests: fillQuests([]),
  };
}

// Keep only known fields with sane types (saved data can be old or edited by hand).
function clean(d) {
  const f = freshData(d && d.name);
  if (!d || typeof d !== 'object') return f;
  const num = (v, def = 0) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : def);
  const out = {
    ...f,
    name: String(d.name || f.name).slice(0, 16),
    created: num(d.created, f.created),
    xp: num(d.xp), matches: num(d.matches), wins: num(d.wins), goals: num(d.goals), mvps: num(d.mvps), playtime: num(d.playtime),
    drops: num(d.drops, WELCOME_DROPS), opened: num(d.opened),
    winsByMode: Object.fromEntries(Object.keys(f.winsByMode).map((m) => [m, num(d.winsByMode && d.winsByMode[m])])),
    tot: Object.fromEntries(Object.keys(f.tot).map((k) => [k, num(d.tot && d.tot[k])])),
    elo: Object.fromEntries(Object.keys(f.elo).map((m) => [m, num(d.elo && d.elo[m], 1000)])),
    top1: d.top1 ? 1 : 0,
    owned: Array.isArray(d.owned) ? d.owned.filter((k) => typeof k === 'string').slice(0, 500) : [],
    loadout: { ...DEFAULT_LOADOUT },
    quests: fillQuests(Array.isArray(d.quests) ? d.quests.filter((q) => q && typeof q.type === 'string').map((q) => ({ id: String(q.id || ''), type: q.type, goal: num(q.goal, 1) || 1, progress: num(q.progress), drops: num(q.drops, 1) || 1 })) : []),
  };
  const owned = new Set(out.owned);
  if (d.loadout && typeof d.loadout === 'object') {
    for (const c of CATEGORIES) {
      const id = d.loadout[c.slot];
      const it = typeof id === 'string' ? item(c.id, id) : null;
      if (it && (it.starter || owned.has(key(c.id, id)))) out.loadout[c.slot] = id;
    }
    if (typeof d.loadout.accent === 'string') out.loadout.accent = d.loadout.accent;
    if (isCustomAnthem(d.loadout.anthem)) out.loadout.anthem = d.loadout.anthem;
  }
  return out;
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
}

export class Account {
  constructor() {
    this.mode = null; // null (not chosen) | 'guest' | 'online'
    this.online = null; // { db, user, id } when this view can keep an online account
    this.remote = null; // the online account's data when one exists
    this.data = clean(null);
    this.listeners = [];
    this.saveTimer = null;
    this.writing = null;
    this.dirty = false;
    this.saveError = '';
  }

  onChange(fn) {
    this.listeners.push(fn);
  }

  changed() {
    for (const fn of this.listeners) fn(this);
  }

  // Look for an online account: on claude.ai, the signed-in viewer's private database folder; on the
  // website, the Supabase login and its row in the profiles table.
  async detect() {
    this.online = null;
    this.remote = null;
    this.backend = backendKind();
    if (this.backend === 'supabase') return this.detectSupabase();
    const c = typeof window !== 'undefined' ? window.claude : null;
    if (!c || typeof c.use !== 'function') return null;
    try {
      const [user, db] = await withTimeout(Promise.all([c.use("user"), c.use("db")]), 12000) || [];
      if (!user || !db) return null;
      const id = await withTimeout(user.id(), 5000);
      if (!id) return null;
      this.online = { user, db, id, ref: db.doc(`data/users/${id}/profile`) };
      const snap = await withTimeout(this.online.ref.get(), 8000);
      if (snap && snap.exists) this.remote = clean(snap.data());
      return this.online;
    } catch (e) {
      this.online = null;
      return null;
    }
  }

  async detectSupabase() {
    this.signedIn = false;
    this.badge = null;
    this.email = '';
    try {
      const sb = await supabase();
      const { data } = await withTimeout(sb.auth.getSession(), 8000) || {};
      const u = data && data.session ? data.session.user : null;
      if (!u) return null;
      this.signedIn = true;
      this.email = u.email || '';
      const ref = {
        get: async () => {
          const { data: row, error } = await sb.from('profiles').select('data').eq('id', u.id).maybeSingle();
          if (error) throw error;
          return { exists: !!row, data: () => (row ? row.data : null) };
        },
        set: async (d) => {
          const lo = d.loadout || {};
          const { error } = await sb.from('profiles').upsert({
            // Stats columns are filled in by the database from player_stats (sending them does nothing).
            id: u.id, name: String(d.name || '').slice(0, 16), data: d, updated_at: new Date().toISOString(),
            icon: lo.icon || null, banner: lo.banner || null, title: lo.title || null,
          });
          if (error) throw error;
        },
      };
      // Stats, achievement items and ratings only change through these server functions, which
      // check each result (see supabase/002_server_stats.sql). The profile row's stats are copies.
      const rpc = async (fn, args) => {
        const res = await withTimeout(sb.rpc(fn, args), 15000);
        if (!res) throw new Error('timeout');
        if (res.error) throw res.error;
        return res.data;
      };
      this.online = { id: u.id, ref, rpc, server: true };
      // Our own badge (owner, tester), if the admin gave us one.
      try {
        const { data: b } = await sb.from('badges').select('badge').eq('player_id', u.id).maybeSingle();
        this.badge = b && b.badge ? b.badge : null;
      } catch (e) {
        this.badge = null;
      }
      const snap = await withTimeout(ref.get(), 8000);
      if (snap && snap.exists) this.remote = clean(snap.data());
      return this.online;
    } catch (e) {
      this.online = null;
      return null;
    }
  }

  // Website login with email and password. Returns { ok, confirm, error }.
  async signIn(email, password) {
    const sb = await supabase();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  async signUp(email, password) {
    const sb = await supabase();
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) return { ok: false, error: error.message };
    return { ok: true, confirm: !data.session };
  }

  async signOut() {
    this.flush();
    try {
      const sb = await supabase();
      await sb.auth.signOut();
    } catch (e) {
      // Ignore.
    }
    this.online = null;
    this.remote = null;
    this.signedIn = false;
    this.mode = null;
    this.changed();
  }

  // Guest progress from this browser. `legacy` carries the record kept before accounts existed.
  useGuest(legacy = null) {
    let d = null;
    try {
      const raw = localStorage.getItem(GUEST_KEY);
      if (raw) d = JSON.parse(raw);
    } catch (e) {
      d = null;
    }
    if (!d && legacy) {
      d = { ...legacy, loadout: { ...DEFAULT_LOADOUT, ...(legacy.loadout || {}) } };
    }
    this.data = clean(d);
    this.mode = 'guest';
    this.saveNow();
    this.changed();
  }

  loginOnline() {
    if (!this.online || !this.remote) return false;
    this.data = clean(this.remote);
    this.mode = 'online';
    this.changed();
    return true;
  }

  // New online account. `carry` copies the guest progress into it.
  async createOnline(name, carry) {
    if (!this.online) throw new Error('Online accounts need a login.');
    let base = null;
    if (carry) {
      try {
        base = JSON.parse(localStorage.getItem(GUEST_KEY) || 'null');
      } catch (e) {
        base = null;
      }
    }
    const d = clean(base ? { ...base, name } : freshData(name));
    d.name = cleanName(name);
    d.created = Date.now();
    await this.online.ref.set(d); // throws when this viewer may not save here
    this.remote = d;
    this.data = d;
    this.mode = 'online';
    this.changed();
  }

  logout() {
    this.flush();
    this.mode = null;
    this.changed();
  }

  // ------------------------------------------------------------------ saving
  save() {
    if (!this.mode) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 1200);
  }

  flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveNow();
    }
  }

  async saveNow() {
    this.saveTimer = null;
    if (this.mode === 'guest') {
      try {
        localStorage.setItem(GUEST_KEY, JSON.stringify(this.data));
      } catch (e) {
        // Storage blocked: progress lasts for this visit only.
      }
      return;
    }
    if (this.mode !== 'online' || !this.online) return;
    // One write at a time; a change during a write is saved right after it.
    if (this.writing) {
      this.dirty = true;
      return;
    }
    this.writing = this.online.ref.set(JSON.parse(JSON.stringify(this.data)));
    try {
      await this.writing;
      this.remote = this.data;
      this.saveError = '';
    } catch (e) {
      this.saveError = e && e.code === 'invalid_argument' ? 'Your account cannot be saved from this view.' : 'Could not save. Will retry.';
      this.changed();
    }
    this.writing = null;
    if (this.dirty) {
      this.dirty = false;
      this.save();
    }
  }

  // ------------------------------------------------------------------ inventory and loadout
  ownedSet() {
    return new Set(this.data.owned);
  }

  owns(cat, id) {
    const it = item(cat, id);
    return !!it && (it.starter || this.data.owned.includes(key(cat, id)));
  }

  get loadout() {
    return this.data.loadout;
  }

  equip(slot, id) {
    const cat = CATEGORIES.find((c) => c.slot === slot);
    if (slot === 'accent') this.data.loadout.accent = id;
    else if (slot === 'anthem' && isCustomAnthem(id)) this.data.loadout.anthem = id;
    else if (!cat || !this.owns(cat.id, id)) return false;
    else this.data.loadout[slot] = id;
    this.save();
    this.changed();
    return true;
  }

  setName(name) {
    this.data.name = cleanName(name);
    this.save();
    this.changed();
  }

  level() {
    return 1 + Math.floor(this.data.xp / XP_PER_LEVEL);
  }

  // ------------------------------------------------------------------ progress
  // Adds XP; every new level gives a Sport Drop. Returns the number of levels gained.
  addXp(n) {
    const before = this.level();
    this.data.xp += Math.max(0, Math.round(n));
    const gained = this.level() - before;
    if (gained > 0) this.data.drops += gained;
    return gained;
  }

  // A counted action (goal, save, pad pickup...). free: happened in free play.
  // Returns the quests it finished (their drops are already added).
  event(type, n = 1, { free = false } = {}) {
    if (!this.mode) return [];
    const done = [];
    let touched = false;
    this.data.quests = this.data.quests.map((q) => {
      if (q.type !== type || q.progress >= q.goal) return q;
      if (free && questInfo(q).matchOnly) return q;
      touched = true;
      const progress = Math.min(q.goal, q.progress + n);
      if (progress >= q.goal) {
        this.data.drops += q.drops;
        done.push({ ...q, progress, text: questText(q) });
        return null;
      }
      return { ...q, progress };
    });
    // Finished quests are replaced right away.
    const kept = this.data.quests.filter(Boolean);
    while (kept.length < 3) kept.push(newQuest(kept));
    this.data.quests = kept;
    if (touched) {
      this.save();
      this.changed();
    }
    return done;
  }

  // Seconds of play; saved every 30 s while playing (and at the end of every match).
  addPlaytime(dt) {
    if (!this.mode || !(dt > 0)) return;
    const step = Math.min(dt, 0.25);
    this.data.playtime = (this.data.playtime || 0) + step;
    this.playUnsent = (this.playUnsent || 0) + step;
    const now = Date.now();
    if (!this.lastPlaySave) this.lastPlaySave = now;
    if (now - this.lastPlaySave > 30000) {
      this.lastPlaySave = now;
      if (this.serverStats) {
        // The server adds at most the real time since our last report.
        const sec = Math.round(this.playUnsent);
        this.playUnsent = 0;
        this.online.rpc('bb_add_playtime', { p_seconds: sec }).then((total) => {
          if (Number.isFinite(total)) this.data.playtime = total;
          this.checkUnlocks();
        }).catch(() => {});
      } else {
        this.playUnsent = 0;
        this.checkUnlocks();
      }
      this.save();
    }
  }

  // Lifetime stat used by achievement items (items.js `unlock.stat`).
  stat(name) {
    const d = this.data;
    switch (name) {
      case 'wins1v1': return d.winsByMode['1v1'] || 0;
      case 'wins2v2': return d.winsByMode['2v2'] || 0;
      case 'wins3v3': return d.winsByMode['3v3'] || 0;
      case 'hours': return Math.floor((d.playtime || 0) / 3600);
      case 'level': return this.level();
      case 'goals': case 'wins': case 'matches': case 'mvps': return d[name] || 0;
      case 'top1': return d.top1 ? 1 : 0;
      default: return (d.tot && d.tot[name]) || 0;
    }
  }

  // Gives every achievement item whose goal is reached. Returns the new ones and tells onUnlock.
  checkUnlocks() {
    if (!this.mode) return [];
    const got = [];
    for (const it of UNLOCK_ITEMS) {
      const k = key(it.cat, it.id);
      if (this.data.owned.includes(k) || this.stat(it.unlock.stat) < it.unlock.goal) continue;
      this.data.owned.push(k);
      got.push(it);
    }
    if (got.length) {
      this.save();
      this.changed();
      if (this.onUnlock) this.onUnlock(got);
    }
    return got;
  }

  // ------------------------------------------------------------------ server-checked stats (website)
  get serverStats() {
    return this.mode === 'online' && !!(this.online && this.online.server);
  }

  rating(mode) {
    return (this.data.elo && this.data.elo[mode]) || 1000;
  }

  // Stats from the server replace ours. New levels give drops here, like addXp.
  applyServerStats(st) {
    if (!st || typeof st !== 'object') return 0;
    const d = this.data;
    const n = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0);
    const before = this.level();
    Object.assign(d, { xp: n(st.xp), matches: n(st.matches), wins: n(st.wins), goals: n(st.goals), mvps: n(st.mvps), playtime: n(st.playtime) });
    d.winsByMode = { '1v1': n(st.wins_1v1), '2v2': n(st.wins_2v2), '3v3': n(st.wins_3v3) };
    d.tot = { saves: n(st.saves), demos: n(st.demos), assists: n(st.assists), hattricks: n(st.hattricks) };
    d.elo = { '1v1': n(st.elo_1v1) || 1000, '2v2': n(st.elo_2v2) || 1000, '3v3': n(st.elo_3v3) || 1000 };
    d.top1 = st.top1 ? 1 : 0;
    const gained = Math.max(0, this.level() - before);
    if (gained) d.drops += gained;
    this.checkUnlocks();
    this.save();
    this.changed();
    return gained;
  }

  // A match against bots starts: the server notes the time (a result sooner than a match lasts is refused).
  // `diff`: bot difficulty, which sets the bots' rating (Easy 800, Medium 1000, Hard 1250, Ultra 1500).
  startMatch(mode, diff = 'medium') {
    this.ticket = null;
    if (!this.serverStats) return;
    const p_diff = ['easy', 'medium', 'hard', 'ultra'].includes(diff) ? diff : 'medium';
    this.ticket = this.online.rpc('bb_start_match', { p_mode: mode, p_diff }).catch(() => null);
  }

  // Ranked online match (host): register the players by account. Returns the match id.
  rankedCreate(mode, players) {
    return this.online.rpc('bb_online_create', { p_mode: mode, p_players: players });
  }

  rankedJoin(id) {
    return this.online.rpc('bb_online_join', { p_match: id });
  }

  // Report the result, then wait (up to about 100 s) for the other players' reports.
  async rankedReport(id, report) {
    let r = await this.online.rpc('bb_online_report', { p_match: id, p: report });
    for (let i = 0; i < 20 && r && !r.final; i++) {
      await new Promise((res) => setTimeout(res, 5000));
      r = await this.online.rpc('bb_online_result', { p_match: id });
    }
    return r;
  }

  // End of a match (bots or online). Returns { xp, levels, quests }. `history`: details for the
  // online match history ({ mode, online, team, scoreUs, scoreThem, assists, saves, shots, demos, seconds }).
  recordMatch({ won, draw, goals, mvp, score, history = null, ranked = null }) {
    if (this.serverStats) return this.recordOnServer({ won, draw, goals, mvp, score, history, ranked });
    const d = this.data;
    d.matches += 1;
    if (won) d.wins += 1;
    d.goals += goals;
    if (mvp) d.mvps += 1;
    if (history) {
      const n = (v) => Math.max(0, Math.min(99, Math.round(Number(v) || 0)));
      if (won && d.winsByMode[history.mode] !== undefined) d.winsByMode[history.mode] += 1;
      d.tot.saves += n(history.saves);
      d.tot.demos += n(history.demos);
      d.tot.assists += n(history.assists);
      if (goals >= 3) d.tot.hattricks += 1;
    }
    const xp = score + (won ? 200 : draw ? 100 : 50);
    const levels = this.addXp(xp);
    const quests = [...this.event('matches', 1), ...(won ? this.event('wins', 1) : []), ...(mvp ? this.event('mvp', 1) : [])];
    const unlocked = this.checkUnlocks();
    this.save();
    this.changed();
    return { xp, levels, quests, unlocked };
  }

  // Website account: quests count here, everything else is decided by the server. `server` resolves
  // to { stats, levels, elo: [before, after] | null, void, error } once the server has the result.
  recordOnServer({ won, draw, goals, mvp, score, history, ranked }) {
    const xp = score + (won ? 200 : draw ? 100 : 50);
    const quests = [...this.event('matches', 1), ...(won ? this.event('wins', 1) : []), ...(mvp ? this.event('mvp', 1) : [])];
    const h = history || {};
    const report = {
      goals, assists: h.assists || 0, saves: h.saves || 0, shots: h.shots || 0, demos: h.demos || 0, score, mvp: !!mvp,
      team: h.team ? 1 : 0, score_us: h.scoreUs || 0, score_them: h.scoreThem || 0,
    };
    let server;
    if (ranked) {
      // Score as blue - orange, so every player's report can be compared.
      const blue = h.team ? report.score_them : report.score_us;
      const orange = h.team ? report.score_us : report.score_them;
      server = this.rankedReport(ranked, { ...report, score_b: blue, score_o: orange }).then((r) => {
        const levels = this.applyServerStats(r && r.stats);
        const elo = r && r.final && !r.void && Number.isFinite(r.elo_after) ? [r.elo_before, r.elo_after] : null;
        return { levels, elo, void: !!(r && r.void), waiting: !!(r && !r.final) };
      });
    } else if (this.ticket && !h.online) {
      const ticket = this.ticket;
      this.ticket = null;
      server = ticket.then((t) => {
        if (!t) throw new Error('no ticket');
        return this.online.rpc('bb_finish_match', { p_ticket: t, p: report });
      }).then((st) => ({
        levels: this.applyServerStats(st),
        elo: st && Number.isFinite(st.elo_after) ? [st.elo_before, st.elo_after] : null,
      }));
    } else {
      server = Promise.reject(new Error(h.online ? 'not ranked' : 'no ticket'));
    }
    server = server.catch((e) => ({ error: String((e && e.message) || e) }));
    this.save();
    this.changed();
    return { xp, levels: 0, quests, unlocked: [], server };
  }

  // Opens one Sport Drop. Returns { item } or { item: null, xp } when everything is owned.
  openDrop() {
    if (this.data.drops <= 0) return null;
    this.data.drops -= 1;
    this.data.opened += 1;
    const it = rollDrop(this.ownedSet());
    let result;
    if (it) {
      this.data.owned.push(key(it.cat, it.id));
      result = { item: it };
    } else {
      const xp = 300;
      this.addXp(xp);
      result = { item: null, xp };
    }
    this.save();
    this.changed();
    return result;
  }
}

export function cleanName(name) {
  return String(name || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16).toUpperCase() || 'PLAYER';
}
