// Which online service this copy of the game uses:
// - 'claude': opened as a claude.ai artifact (profiles in the artifact database, play over its room)
// - 'supabase': the website build with a Supabase project configured (backend-config.js)
// - null: offline (guest profiles only, no online play)
import { SUPABASE } from './backend-config.js';

export function backendKind() {
  if (typeof window !== 'undefined' && window.claude && typeof window.claude.use === 'function') return 'claude';
  if (SUPABASE.url && SUPABASE.anonKey) return 'supabase';
  return null;
}

let client = null;
export async function supabase() {
  // Tests run against a stand-in client (the real servers are not reachable from the test machine).
  if (typeof window !== 'undefined' && window.__fakeSupabase) return window.__fakeSupabase;
  if (!client) {
    const { createClient } = await import('@supabase/supabase-js');
    client = createClient(SUPABASE.url, SUPABASE.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 40 } },
    });
  }
  return client;
}
