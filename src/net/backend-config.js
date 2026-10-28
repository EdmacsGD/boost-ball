// Website build: the Supabase project the game talks to for profiles and online play.
// The publishable key is meant to be public: it only allows what the database rules allow
// (each player can read and change only their own profile row).
// Inside claude.ai the game uses claude.ai instead; with both empty the website is offline-only.
export const SUPABASE = {
  url: 'https://wfsinljudtgjkzrulsdo.supabase.co',
  anonKey: 'sb_publishable_J3vF64Nds4ve9Hq5xpW_vA_TTlbtgxP',
};
