// Everyone's public profile stats and match history (website build, Supabase).
import { backendKind, supabase } from './backend.js';

export const playersAvailable = () => backendKind() === 'supabase';

const COLS = 'id,name,level,matches,wins,goals,playtime,icon,banner,title,updated_at';
export const SORTS = {
  playtime: { label: 'Play time', col: 'playtime' },
  goals: { label: 'Goals', col: 'goals' },
  wins: { label: 'Wins', col: 'wins' },
};

// Top players by a stat, optionally only names containing `search`.
export async function topPlayers(sort = 'playtime', search = '', limit = 100) {
  const sb = await supabase();
  const col = (SORTS[sort] || SORTS.playtime).col;
  let q = sb.from('profiles').select(COLS).order(col, { ascending: false }).order('updated_at', { ascending: false }).limit(limit);
  const s = String(search || '').trim().replace(/[%_,()\\]/g, '').slice(0, 16);
  if (s) q = q.ilike('name', `%${s}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// Badges (owner, tester) by player id. Only the project admin can hand them out (see the badges
// table rules), so a badge cannot be copied by taking someone's name.
export const BADGES = { owner: 'Owner', tester: 'Tester' };
let badgeCache = null;
export async function loadBadges(force = false) {
  if (badgeCache && !force) return badgeCache;
  try {
    const sb = await supabase();
    const { data, error } = await sb.from('badges').select('player_id,badge');
    if (error) throw error;
    badgeCache = new Map((data || []).filter((r) => BADGES[r.badge]).map((r) => [r.player_id, r.badge]));
  } catch (e) {
    badgeCache = badgeCache || new Map();
  }
  return badgeCache;
}
export const badgeOf = (id) => (badgeCache && id ? badgeCache.get(id) || null : null);

export async function playerById(id) {
  const sb = await supabase();
  const { data, error } = await sb.from('profiles').select(COLS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function playerMatches(id, limit = 25) {
  const sb = await supabase();
  const { data, error } = await sb.from('matches').select('*').eq('player_id', id).order('played_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

export function formatPlaytime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min`;
  return `${s} s`;
}
