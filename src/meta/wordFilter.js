// Bad word filter for names, clip titles, text on clips and comments. The same lists and rules
// run in the database (supabase/007_social.sql, generated from this file by tools/gen_filter_sql.mjs),
// so the game only shows the message early; the server is what actually refuses.
//
// How it matches:
//  - text is lowercased, number/symbol look-alikes become letters (h1tl3r -> hitler, $ -> s, @ -> a)
//  - ANYWHERE words are found inside a word, with repeated letters ("fuuuck") and when spelled out
//    one letter at a time ("f u c k", "h.i.t.l.e.r"). Words are not glued together first, so normal
//    phrases like "push it" do not turn into a match. Only words never part of normal words go here.
//  - WORDS are only matched as whole words, because they hide inside normal ones
//    ("class", "peacock", "grape", "Scunthorpe" stay allowed).
export const ANYWHERE = [
  // swearing
  'fuck', 'fuk', 'fck', 'fvck', 'phuck', 'motherf', 'shit', 'bitch', 'biatch', 'bastard', 'asshole', 'arsehole', 'wanker', 'bollock', 'jizz', 'dickhead', 'cocksuck', 'blowjob', 'handjob', 'dildo', 'porn', 'hentai', 'whore', 'slut', 'pussies',
  // slurs
  'nigger', 'nigga', 'niga', 'faggot', 'fagot', 'retarded', 'tranny', 'chink', 'spastic',
  // hate and dictators
  'hitler', 'hitla', 'stalin', 'nazi', 'siegheil', 'heilhit', 'holocaust', 'mussolini', 'polpot', 'binladen', 'kukluxklan', 'auschwitz', 'goebbels', 'himmler', 'swastika', 'hakenkreuz',
  // Norwegian
  'fitte', 'fittetryne', 'pikk', 'kuksuger', 'jaevla', 'javla',
];
export const WORDS = [
  'ass', 'arse', 'cunt', 'cunts', 'dick', 'dicks', 'cock', 'cocks', 'cum', 'sex', 'sexy', 'tits', 'titties', 'boobs', 'penis', 'vagina', 'rape', 'raped', 'raping', 'rapist', 'twat', 'fag', 'fags', 'retard', 'pussy', 'heil', 'kkk', 'isis', 'nsfw', 'nude', 'nudes', 'naked', 'horny', 'hore', 'kuk', 'neger', 'faen', 'sieg heil', 'white power',
];
// Number-only codes used by hate groups (checked on the original text).
export const CODES = ['1488', '14/88', '14 88'];

// Look-alike characters and accents, mapped one to one (the database uses the same two strings
// with translate(), so both sides read text the same way). Then æ becomes "ae".
export const FROM = '0123456789@$!|€+àáâãäåāèéêëēìíîïīòóôõöøōùúûüūçñýÿ';
export const TO = 'oizeasgtbgasiietaaaaaaaeeeeeiiiiiooooooouuuuucnyy';

function normalize(text) {
  let s = '';
  for (const ch of String(text || '').toLowerCase()) {
    const i = FROM.indexOf(ch);
    s += i >= 0 ? TO[i] : ch;
  }
  return s.replace(/æ/g, 'ae');
}

// "fuck" -> /f+u+c+k+/: each letter may repeat ("fuuuck"), none may be left out ("Niger" is fine).
const RE = new Map();
const pattern = (w) => {
  if (!RE.has(w)) RE.set(w, new RegExp(w.split('').map((c) => `${c}+`).join('')));
  return RE.get(w);
};
const exact = (w) => new RegExp(`^${pattern(w).source}$`);

// Returns the offending word (for the message), or null when the text is fine.
export function badWord(text) {
  const raw = String(text || '').toLowerCase();
  for (const c of CODES) if (raw.includes(c)) return c;
  const n = normalize(text);
  const tokens = n.split(/[^a-z]+/).filter(Boolean);
  // Letters spelled out one at a time ("f u c k", "h.i.t.l.e.r") count as one word.
  const cands = [...tokens];
  let run = '';
  for (const t of tokens) {
    if (t.length === 1) run += t;
    else {
      if (run.length > 1) cands.push(run);
      run = '';
    }
  }
  if (run.length > 1) cands.push(run);
  for (const w of ANYWHERE) {
    const re = pattern(w);
    for (const c of cands) if (re.test(c)) return w;
  }
  const spaced = ` ${tokens.join(' ')} `;
  for (const w of WORDS) {
    if (w.includes(' ')) {
      if (spaced.includes(` ${w} `)) return w;
      continue;
    }
    const re = exact(w);
    for (const c of cands) if (re.test(c)) return w;
  }
  return null;
}

export const isClean = (text) => !badWord(text);

export const FILTER_MESSAGE = 'That has a word that is not allowed in Boost Ball. Try something else.';
