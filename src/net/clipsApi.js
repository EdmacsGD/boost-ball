// Clips on the website's Supabase project (tables in supabase/006_clips.sql). Watching works for
// everyone; posting, liking, commenting and reporting need a login (the database checks it).
import { backendKind, supabase } from './backend.js';

export const clipsSupported = () => backendKind() === 'supabase';

const COLS = 'id,author,author_name,title,mode,arena,duration,like_count,comment_count,created_at';

async function run(q) {
  // A hung connection shows an error instead of loading forever.
  const res = await Promise.race([q, new Promise((r) => setTimeout(() => r({ error: { message: 'no answer from the server (check your connection)' } }), 15000))]);
  const { data, error } = res;
  if (error) throw new Error(error.message || 'Request failed');
  return data;
}

// sort 'new' (newest first) or 'top' (most liked this week).
export async function listClips(sort = 'new', offset = 0, limit = 10) {
  const sb = await supabase();
  let q = sb.from('clips').select(COLS).eq('hidden', false);
  if (sort === 'top') {
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
