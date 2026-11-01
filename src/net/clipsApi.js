// Clips on the website's Supabase project (tables in supabase/006_clips.sql). Watching works for
// everyone; posting, liking, commenting and reporting need a login (the database checks it).
import { backendKind, supabase } from './backend.js';

export const clipsSupported = () => backendKind() === 'supabase';

const COLS = 'id,author,author_name,title,mode,arena,duration,like_count,comment_count,view_count,overlays,created_at';

async function run(q) {
  // A hung connection shows an error instead of loading forever.
  const res = await Promise.race([q, new Promise((r) => setTimeout(() => r({ error: { message: 'no answer from the server (check your connection)' } }), 15000))]);
  const { data, error } = res;
  if (error) throw new Error(error.message || 'Request failed');
  return data;
}

// sort 'new' (newest first), 'top' (most liked this week) or 'views' (most watched).
// author: one player's clips (or a list of players, for the people you follow).
// search: words in the title or the player's name.
export async function listClips(sort = 'new', offset = 0, limit = 10, author = null, search = '') {
  const sb = await supabase();
  let q = sb.from('clips').select(COLS).eq('hidden', false);
  if (Array.isArray(author)) {
    if (!author.length) return [];
    q = q.in('author', author.slice(0, 200));
  } else if (author) {
    q = q.eq('author', author);
  }
  const s = String(search || '').replace(/[%_,().*\\]/g, ' ').trim().slice(0, 40);
  if (s) q = q.or(`title.ilike.%${s}%,author_name.ilike.%${s}%`);
  if (sort === 'views') {
    q = q.order('view_count', { ascending: false }).order('created_at', { ascending: false });
  } else if (sort === 'top') {
    q = q.gte('created_at', new Date(Date.now() - 7 * 864e5).toISOString())
      .order('like_count', { ascending: false }).order('created_at', { ascending: false });
  } else {
    q = q.order('created_at', { ascending: false });
  }
  return run(q.range(offset, offset + limit - 1));
}

export async function clipData(id) {
  const sb = await supabase();
  const row = await run(sb.from('clips').select('data').eq('id', id).maybeSingle());
  if (!row) throw new Error('Clip not found');
  return row.data;
}

export async function postClip(row) {
  const sb = await supabase();
  return run(sb.from('clips').insert(row).select(COLS).single());
}

export async function deleteClip(id) {
  const sb = await supabase();
  return run(sb.from('clips').delete().eq('id', id));
}

export async function likedSet(userId, ids) {
  if (!userId || !ids.length) return new Set();
  const sb = await supabase();
  const rows = await run(sb.from('clip_likes').select('clip_id').eq('user_id', userId).in('clip_id', ids));
  return new Set(rows.map((r) => r.clip_id));
}

export async function setLike(userId, id, on) {
  const sb = await supabase();
  if (on) {
    const { error } = await sb.from('clip_likes').insert({ clip_id: id, user_id: userId });
    if (error && error.code !== '23505') throw new Error(error.message); // 23505: already liked
  } else {
    await run(sb.from('clip_likes').delete().eq('clip_id', id).eq('user_id', userId));
  }
}

export async function listComments(id) {
  const sb = await supabase();
  return run(sb.from('clip_comments').select('id,author,author_name,body,created_at').eq('clip_id', id)
    .order('created_at', { ascending: true }).limit(200));
}

export async function addComment(userId, id, body) {
  const sb = await supabase();
  return run(sb.from('clip_comments').insert({ clip_id: id, author: userId, body }).select('id,author,author_name,body,created_at').single());
}

export async function deleteComment(cid) {
  const sb = await supabase();
  return run(sb.from('clip_comments').delete().eq('id', cid));
}

export async function reportClip(userId, id) {
  const sb = await supabase();
  const { error } = await sb.from('clip_reports').insert({ clip_id: id, user_id: userId });
  if (error && error.code !== '23505') throw new Error(error.message);
}

// A view: counted once per signed-in player per clip per day (the server decides). Returns views.
export async function viewClip(id) {
  const sb = await supabase();
  const { data, error } = await sb.rpc('bb_view_clip', { p_clip: id });
  if (error) throw new Error(error.message);
  return data;
}

// ---------------------------------------------------------------- follows
export async function myFollowing(userId) {
  if (!userId) return [];
  const sb = await supabase();
  const rows = await run(sb.from('follows').select('followee').eq('follower', userId).limit(500));
  return rows.map((r) => r.followee);
}

export async function setFollow(userId, who, on) {
  const sb = await supabase();
  if (on) {
    const { error } = await sb.from('follows').insert({ follower: userId, followee: who });
    if (error && error.code !== '23505') throw new Error(error.message);
  } else {
    await run(sb.from('follows').delete().eq('follower', userId).eq('followee', who));
  }
}

export async function followerCount(who) {
  const sb = await supabase();
  const { count, error } = await sb.from('follows').select('followee', { count: 'exact', head: true }).eq('followee', who);
  if (error) throw new Error(error.message);
  return count || 0;
}

// ---------------------------------------------------------------- Studio
export async function studio() {
  const sb = await supabase();
  const { data, error } = await sb.rpc('bb_studio');
  if (error) throw new Error(error.message);
  return data;
}

// ---------------------------------------------------------------- pictures for stickers
// blob: an image already made small (see shrinkPicture in clips.js). Returns its public address.
export async function uploadPicture(userId, blob) {
  const sb = await supabase();
  const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/jpeg' ? 'jpg' : 'webp';
  const path = `${userId}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from('clip-pictures').upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw new Error(error.message);
  return sb.storage.from('clip-pictures').getPublicUrl(path).data.publicUrl;
}
