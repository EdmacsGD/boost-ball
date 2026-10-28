// Player anthems: a short tune that plays when you score.
//
// Built-in anthems are written here as notes and rendered to audio once with an OfflineAudioContext
// (synthesized, no audio files, all melodies original). Uploaded anthems are a clip cut from the
// player's own song file (see anthemStore.js). Both end up as an AudioBuffer that the game plays.

// ------------------------------------------------------------------ the songs
// Each bar has 16 steps (sixteenth notes). Melody tokens: a scale degree (1 = root, 8 = octave up,
// 0 = the note below the root), '-' holds the previous note, '.' is a rest.
// chords: one scale degree per bar (a triad is built on it). end: the melody note on the final hit.
// Drum and bass rows: 'x' = hit (bass: chord root), 'o' = bass an octave up.
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

export const ANTHEMS = [
  {
    id: 'kickoff', name: 'Kickoff Fanfare', blurb: 'Brass and drums', bpm: 132, root: 60, scale: 'major', chords: [1, 6, 4, 5], end: 8,
    lead: 'brass', pad: 'strings', bass: 'saw',
    melody: ['1 - 3 - 5 - - - 8 - - - 5 - - -', '6 - - 6 5 - 3 - 1 - - - . . 5 -', '4 - 6 - 8 - - - 6 - 8 - 9 - - -', '7 - - - 5 - - - 7 - 8 - 9 - - -'],
    drums: { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' }, bassRow: 'x...x...x...x.o.', fill: true,
  },
  {
    id: 'neon', name: 'Neon Drive', blurb: 'Night-time synthwave', bpm: 112, root: 57, scale: 'minor', chords: [1, 6, 3, 7], end: 1,
    lead: 'saw', pad: 'strings', bass: 'saw',
    melody: ['5 - - 3 - - 1 - - - 3 - 4 - 3 -', '1 - - - . . 3 - 4 - 3 - 1 - 0 -', '5 - - 3 - - 5 - - - 6 - 5 - 3 -', '2 - - - 0 - - - 2 - 3 - 0 - - -'],
    drums: { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.' }, bassRow: 'x.o.x.o.x.o.x.o.',
  },
  {
    id: 'chip', name: 'Chip Champion', blurb: '8-bit victory tune', bpm: 150, root: 64, scale: 'major', chords: [1, 4, 1, 5], end: 8,
    lead: 'square', bass: 'chip', chip: true,
    melody: ['1 3 5 8 5 3 1 3 5 8 10 8 5 3 5 8', '4 6 8 11 8 6 4 6 8 11 8 6 8 - - -', '8 - 10 - 12 - 10 - 8 - 5 - 8 - 10 -', '9 - 7 - 5 - 7 - 9 - - - 12 - - -'],
    drums: { k: 'x.......x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' }, bassRow: 'x.x.x.x.x.x.x.x.',
  },
  {
    id: 'drumline', name: 'Drumline', blurb: 'Marching snares and horns', bpm: 120, root: 58, scale: 'major', chords: [1, 1, 4, 5], end: 8,
    lead: 'brass', bass: 'saw',
    melody: ['. . . . 1 - 1 - 1 - 3 - 5 - - -', '. . . . 5 - 5 - 5 - 6 - 5 - 3 -', '4 - - - 6 - - - 8 - - - 6 - - -', '5 - - - 7 - - - 9 - - - 7 - 9 -'],
    drums: { k: 'x.......x.......', s: 'x.xxx.x.x.xxx.x.', h: '' }, bassRow: 'x.......x.......', fill: true,
  },
  {
    id: 'bassdrop', name: 'Bass Drop', blurb: 'Half-time 808s and bells', bpm: 140, root: 53, scale: 'minor', chords: [1, 1, 6, 7], end: 8,
    lead: 'bell', bass: '808', pad: 'dark',
    melody: ['8 - - 7 - - 5 - - - - - 3 - 5 -', '8 - - 7 - - 5 - - - 10 - 8 - - -', '6 - - 5 - - 3 - - - - - 1 - 3 -', '7 - - 4 - - 2 - - - - - 7 - 9 -'],
    drums: { k: 'x......x..x.....', s: '........x.......', h: 'x.x.x.xxx.x.x.xx' }, bassRow: 'x......x..x.....',
  },
  {
    id: 'victory', name: 'Victory Lap', blurb: 'Fast punk guitars', bpm: 168, root: 62, scale: 'major', chords: [1, 4, 6, 5], end: 8,
    lead: 'saw', bass: 'saw', guitar: 'x.x.x.x.x.x.x.x.',
    melody: ['5 - 5 - 6 - 5 - 3 - - - 1 - - -', '4 - 4 - 6 - 8 - 6 - - - 4 - - -', '3 - 3 - 6 - 8 - 10 - - - 8 - - -', '7 - - - 9 - - - 7 - 5 - 7 - - -'],
    drums: { k: 'x.....x.x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' }, bassRow: 'x.x.x.x.x.x.x.x.', fill: true,
  },
  {
    id: 'midnight', name: 'Midnight Run', blurb: 'Dark arpeggios', bpm: 122, root: 50, scale: 'minor', chords: [1, 7, 6, 7], end: 8,
    lead: 'bell', leadOctave: 2, arp: true, pad: 'dark', bass: 'saw',
    melody: ['8 - - - - - - - 10 - - - 9 - - -', '7 - - - - - - - 9 - - - 11 - - -', '10 - - - - - - - 8 - - - 6 - - -', '7 - - - - - - - 9 - - - 11 - 9 -'],
    drums: { k: 'x...x...x...x...', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx' }, bassRow: 'x..x..x.x..x..x.',
  },
  {
    id: 'overdrive', name: 'Overdrive', blurb: 'Heavy rock riff', bpm: 132, root: 52, scale: 'minor', chords: [1, 1, 6, 7], end: 8,
    lead: 'guitar', bass: 'saw', guitar: 'x..x..x.x..x..x.',
    melody: ['1 - 1 3 - 1 4 - 3 - 1 - 0 - 1 -', '1 - 1 3 - 1 4 - 3 - 1 - 5 - 4 -', '6 - - - 5 - 3 - 1 - - - 3 - 5 -', '7 - - - 5 - 4 - 2 - - - 4 - 5 -'],
    drums: { k: 'x.x...x.x.x...x.', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' }, bassRow: 'x.x.x.x.x.x.x.x.', fill: true,
  },
  {
    id: 'golden', name: 'Golden Hour', blurb: 'Orchestra with timpani', bpm: 104, root: 55, scale: 'major', chords: [1, 5, 6, 4], end: 8,
    lead: 'brass', pad: 'strings', bass: 'sub', timpani: 'x.......x.......',
    melody: ['8 - - - - - 5 - 8 - 10 - 12 - - -', '12 - - - 11 - 10 - 9 - - - 7 - 5 -', '6 - - - 8 - 10 - 13 - - - 12 - 10 -', '11 - - - 10 - - - 8 - - - 6 - 7 -'],
    drums: { k: '', s: '', h: '' }, bassRow: 'x.......x.......', roll: true,
  },
];

export const anthemSpec = (id) => ANTHEMS.find((a) => a.id === id) || null;

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

function degreeToMidi(spec, deg, octave) {
  const sc = SCALES[spec.scale];
  const idx = deg - 1;
  const oct = Math.floor(idx / 7);
  return spec.root + 12 * (octave + oct) + sc[((idx % 7) + 7) % 7];
}

// ------------------------------------------------------------------ instruments
// Every instrument writes into `out` (a gain node) on the offline context.
function env(g, t, a, peak, d, sustain, end, r) {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setTargetAtTime(peak * sustain, t + a, d);
  g.gain.setValueAtTime(peak * sustain, end);
  g.gain.setTargetAtTime(0, end, r);
}

function osc(ctx, type, f, t, stop, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.detune.value = detune;
  o.start(t);
  o.stop(stop);
  return o;
}

function lowpass(ctx, f, q = 0.7) {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = f;
  lp.Q.value = q;
  return lp;
}

let curve = null;
function drive(ctx, amount) {
  const ws = ctx.createWaveShaper();
  if (!curve) {
    curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * amount);
    }
  }
  ws.curve = curve;
  return ws;
}

function leadNote(ctx, out, kind, t, f, dur, vel) {
  const end = t + dur;
  const stop = end + 0.6;
  const g = ctx.createGain();
  g.connect(out);
  switch (kind) {
    case 'brass': {
      const lp = lowpass(ctx, 700, 1.2);
      lp.frequency.setValueAtTime(500, t);
      lp.frequency.linearRampToValueAtTime(3200, t + 0.06);
      lp.frequency.setTargetAtTime(1600, t + 0.06, 0.2);
      lp.connect(g);
      for (const d of [-7, 7]) osc(ctx, 'sawtooth', f, t, stop, d).connect(lp);
      env(g, t, 0.035, 0.2 * vel, 0.25, 0.75, end, 0.06);
      break;
    }
    case 'saw': {
      const lp = lowpass(ctx, 2600, 2);
      lp.connect(g);
      for (const d of [-9, 0, 9]) osc(ctx, 'sawtooth', f, t, stop, d).connect(lp);
      env(g, t, 0.01, 0.13 * vel, 0.3, 0.7, end, 0.08);
      break;
    }
    case 'square': {
      osc(ctx, 'square', f, t, stop).connect(g);
      env(g, t, 0.002, 0.11 * vel, 0.1, 0.6, end - 0.01, 0.02);
      break;
    }
    case 'bell': {
      // Two-operator FM: a sine carrier bent by a sine at 3.5x with a falling depth.
      const car = osc(ctx, 'sine', f, t, end + 1.4);
      const mod = osc(ctx, 'sine', f * 3.5, t, end + 1.4);
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(f * 2.4, t);
      depth.gain.setTargetAtTime(f * 0.3, t, 0.25);
      mod.connect(depth).connect(car.frequency);
      car.connect(g);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.22 * vel, t + 0.004);
      g.gain.setTargetAtTime(0, t + 0.004, Math.max(0.25, dur * 0.6));
      break;
    }
    case 'guitar': {
      const lp = lowpass(ctx, 3400, 0.8);
      const pre = ctx.createGain();
      pre.gain.value = 1.4;
      pre.connect(drive(ctx, 6)).connect(lp).connect(g);
      osc(ctx, 'sawtooth', f, t, stop, -5).connect(pre);
      osc(ctx, 'square', f, t, stop, 5).connect(pre);
      env(g, t, 0.005, 0.12 * vel, 0.4, 0.8, end, 0.05);
      break;
    }
    case 'pluck':
    default: {
      const lp = lowpass(ctx, 4000, 3);
      lp.frequency.setValueAtTime(4200, t);
      lp.frequency.setTargetAtTime(350, t, 0.07);
      lp.connect(g);
      osc(ctx, 'sawtooth', f, t, stop).connect(lp);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.14 * vel, t + 0.003);
      g.gain.setTargetAtTime(0, t + 0.003, 0.12);
      break;
    }
  }
}

function padChord(ctx, out, kind, t, freqs, dur) {
  const g = ctx.createGain();
  const lp = lowpass(ctx, kind === 'dark' ? 900 : 2200, 0.5);
  lp.connect(g).connect(out);
  for (const f of freqs) for (const d of [-8, 8]) osc(ctx, 'sawtooth', f, t, t + dur + 0.8, d).connect(lp);
  env(g, t, 0.18, 0.045, 0.6, 0.85, t + dur, 0.2);
}

function bassNote(ctx, out, kind, t, f, dur) {
  const g = ctx.createGain();
  g.connect(out);
  const end = t + dur;
  if (kind === '808' || kind === 'sub') {
    const o = osc(ctx, 'sine', f * (kind === '808' ? 1.5 : 1), t, end + 0.6);
    if (kind === '808') o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    const sat = drive(ctx, 2.5);
    o.connect(sat).connect(g);
    env(g, t, 0.004, kind === '808' ? 0.5 : 0.36, 0.5, 0.75, end, 0.08);
    return;
  }
  if (kind === 'chip') {
    osc(ctx, 'triangle', f, t, end + 0.05).connect(g);
    env(g, t, 0.002, 0.3, 0.1, 0.9, end - 0.01, 0.01);
    return;
  }
  const lp = lowpass(ctx, 900, 1.5);
  lp.frequency.setValueAtTime(1400, t);
  lp.frequency.setTargetAtTime(500, t, 0.08);
  lp.connect(g);
  osc(ctx, 'sawtooth', f, t, end + 0.3).connect(lp);
  osc(ctx, 'sine', f / 2, t, end + 0.3).connect(g);
  env(g, t, 0.004, 0.2, 0.2, 0.7, end, 0.04);
}

function powerChord(ctx, out, t, f, dur) {
  const g = ctx.createGain();
  const lp = lowpass(ctx, 2600, 0.7);
  const pre = ctx.createGain();
  pre.gain.value = 1.2;
  pre.connect(drive(ctx, 6)).connect(lp).connect(g).connect(out);
  for (const m of [1, 1.4983, 2]) osc(ctx, 'sawtooth', f * m, t, t + dur + 0.2, (Math.random() - 0.5) * 10).connect(pre);
  env(g, t, 0.004, 0.07, 0.3, 0.6, t + dur, 0.03);
}

function noiseHit(ctx, out, noise, t, { type = 'highpass', freq = 7000, q = 0.7, dur = 0.05, gain = 0.1, decay } = {}) {
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.setTargetAtTime(0, t + 0.002, decay || dur / 3);
  s.connect(f).connect(g).connect(out);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur * 3 + 0.05);
}

function kick(ctx, out, t, gain = 0.9) {
  const o = osc(ctx, 'sine', 150, t, t + 0.5);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.setTargetAtTime(0, t + 0.01, 0.1);
  o.connect(g).connect(out);
}

function snare(ctx, out, noise, t, gain = 1, chip = false) {
  noiseHit(ctx, out, noise, t, { type: chip ? 'highpass' : 'bandpass', freq: chip ? 3000 : 1900, q: 0.6, dur: chip ? 0.08 : 0.18, gain: 0.42 * gain });
  if (!chip) {
    const o = osc(ctx, 'triangle', 190, t, t + 0.15);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25 * gain, t);
    g.gain.setTargetAtTime(0, t + 0.005, 0.04);
    o.connect(g).connect(out);
  }
}

function timpani(ctx, out, t, f, gain = 0.6) {
  const o = osc(ctx, 'sine', f * 1.08, t, t + 1.6);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.setTargetAtTime(0, t + 0.01, 0.4);
  o.connect(g).connect(out);
}

function impulse(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  return b;
}

// Scale to a target peak so every anthem plays at about the same loudness.
export function normalize(buf, peakTarget = 0.89, rmsTarget = 0.2, maxGain = 4) {
  let peak = 0;
  let sum = 0;
  let n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
      sum += d[i] * d[i];
    }
    n += d.length;
  }
  if (peak < 1e-5) return buf;
  const rms = Math.sqrt(sum / n);
  const gain = Math.min(maxGain, peakTarget / peak, rmsTarget / Math.max(rms, 1e-5));
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= gain;
  }
  return buf;
}

const RATE = 44100;
const BARS = 4;
const TAIL = 2.2;

export function anthemLength(spec) {
  return (BARS * 4 * 60) / spec.bpm + TAIL;
}

// Renders a built-in anthem to an AudioBuffer.
export async function renderAnthem(spec) {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const total = anthemLength(spec);
  const ctx = new OAC(2, Math.ceil(total * RATE), RATE);
  const step = 60 / spec.bpm / 4;
  const barDur = step * 16;
  const t0 = 0.05;

  const noise = ctx.createBuffer(1, RATE, RATE);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  const mix = ctx.createGain();
  mix.gain.value = 1;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.ratio.value = 3;
  mix.connect(comp).connect(ctx.destination);
  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx, spec.chip ? 0.6 : 1.8);
  const wet = ctx.createGain();
  wet.gain.value = spec.chip ? 0.08 : 0.2;
  verb.connect(wet).connect(mix);
  const bus = (gain, send = 0.6) => {
    const g = ctx.createGain();
    g.gain.value = gain;
    g.connect(mix);
    if (send) {
      const s = ctx.createGain();
      s.gain.value = send;
      g.connect(s).connect(verb);
    }
    return g;
  };
  const leadBus = bus(1, 0.7);
  const padBus = bus(1, 0.9);
  const bassBus = bus(1, 0);
  const drumBus = bus(1, 0.25);
  const gtrBus = bus(1, 0.3);

  const leadOct = spec.leadOctave ?? 1;
  const chordFreqs = (deg, oct = 0) => [0, 2, 4].map((k) => mtof(degreeToMidi(spec, deg + k, oct)));
  const bassFreq = (deg) => mtof(degreeToMidi(spec, deg, deg >= 5 ? -2 : -1));

  for (let bar = 0; bar < BARS; bar++) {
    const tb = t0 + bar * barDur;
    const deg = spec.chords[bar];
    // Melody.
    const toks = spec.melody[bar].split(/\s+/);
    for (let i = 0; i < 16; i++) {
      const tok = toks[i];
      if (tok === '-' || tok === '.' || tok === undefined) continue;
      let len = 1;
      while (i + len < 16 && toks[i + len] === '-') len++;
      leadNote(ctx, leadBus, spec.lead, tb + i * step, mtof(degreeToMidi(spec, Number(tok), leadOct)), len * step * 0.95, 1);
    }
    // Pad.
    if (spec.pad) padChord(ctx, padBus, spec.pad, tb, chordFreqs(deg), barDur * 0.98);
    // Arpeggio: chord tones up and down in sixteenths.
    if (spec.arp) {
      const tones = [...chordFreqs(deg, 1), mtof(degreeToMidi(spec, deg + 7, 1))];
      const order = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 3];
      for (let i = 0; i < 16; i++) leadNote(ctx, padBus, 'pluck', tb + i * step, tones[order[i]], step * 0.9, 0.55);
    }
    // Bass.
    const bf = bassFreq(deg);
    const brow = spec.bassRow;
    for (let i = 0; i < 16; i++) {
      const c = brow[i];
      if (c !== 'x' && c !== 'o') continue;
      let len = 1;
      while (i + len < 16 && brow[i + len] === '.') len++;
      bassNote(ctx, bassBus, spec.bass, tb + i * step, c === 'o' ? bf * 2 : bf, Math.min(len, 4) * step * 0.9);
    }
    // Guitar power chords.
    if (spec.guitar) {
      const gf = mtof(degreeToMidi(spec, deg, deg >= 5 ? -1 : 0));
      for (let i = 0; i < 16; i++) if (spec.guitar[i] === 'x') powerChord(ctx, gtrBus, tb + i * step, gf, step * 1.6);
    }
    // Drums.
    const d = spec.drums;
    const fillBar = bar === BARS - 1 && spec.fill;
    for (let i = 0; i < 16; i++) {
      const t = tb + i * step;
      if (d.k[i] === 'x') kick(ctx, drumBus, t);
      if (fillBar && i >= 12) snare(ctx, drumBus, noise, t, 0.6 + (i - 12) * 0.12, spec.chip);
      else if (d.s[i] === 'x') snare(ctx, drumBus, noise, t, 1, spec.chip);
      if (d.h[i] === 'x') noiseHit(ctx, drumBus, noise, t, { freq: spec.chip ? 9000 : 7500, dur: 0.04, gain: i % 4 === 0 ? 0.11 : 0.07 });
      if (spec.timpani && spec.timpani[i] === 'x') timpani(ctx, drumBus, t, mtof(degreeToMidi(spec, deg, -2)));
    }
    if (bar === 0 || bar === 2) noiseHit(ctx, drumBus, noise, tb, { freq: 4500, dur: 1.2, gain: spec.chip ? 0.08 : 0.14, decay: 0.45 });
    if (spec.roll && bar === BARS - 1) {
      for (let i = 8; i < 16; i++) timpani(ctx, drumBus, tb + i * step, mtof(degreeToMidi(spec, 5, -2)), 0.2 + (i - 8) * 0.05);
    }
  }

  // Final hit: everything on the root, ringing out.
  const tf = t0 + BARS * barDur;
  kick(ctx, drumBus, tf, 1);
  noiseHit(ctx, drumBus, noise, tf, { freq: 4000, dur: 2, gain: 0.2, decay: 0.7 });
  if (spec.timpani || spec.roll) timpani(ctx, drumBus, tf, mtof(degreeToMidi(spec, 1, -2)), 0.8);
  leadNote(ctx, leadBus, spec.lead, tf, mtof(degreeToMidi(spec, spec.end, leadOct)), 1.3, 1.1);
  padChord(ctx, padBus, spec.pad || 'strings', tf, chordFreqs(1), 1.4);
  bassNote(ctx, bassBus, spec.bass, tf, bassFreq(1), 1.3);
  if (spec.guitar) powerChord(ctx, gtrBus, tf, mtof(degreeToMidi(spec, 1, 0)), 1.4);

  const buf = await ctx.startRendering();
  return normalize(buf, 0.89, 0.22);
}

// ------------------------------------------------------------------ uploaded songs
export const CLIP_MIN = 3;
export const CLIP_MAX = 12;
export const CLIP_DEFAULT = 9;
const DECODE_RATE = 32000;

// Decodes a song file (ArrayBuffer). Rejects when the browser cannot read the format.
export async function decodeSong(arrayBuffer) {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const ctx = new OAC(2, DECODE_RATE, DECODE_RATE);
  return ctx.decodeAudioData(arrayBuffer.slice(0));
}

// The loudest stretch of the song (usually the chorus): a good default start for the clip.
export function loudestStart(buf, length) {
  const win = Math.max(1, Math.floor(buf.sampleRate * 0.5));
  const n = Math.floor(buf.length / win);
  const energy = new Float32Array(n);
  const d0 = buf.getChannelData(0);
  const d1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : d0;
  for (let w = 0; w < n; w++) {
    let s = 0;
    for (let i = w * win, e = i + win; i < e; i += 4) s += d0[i] * d0[i] + d1[i] * d1[i];
    energy[w] = s;
  }
  const span = Math.max(1, Math.round(length / 0.5));
  let best = 0;
  let bestSum = -1;
  let sum = 0;
  for (let w = 0; w < n; w++) {
    sum += energy[w];
    if (w >= span) sum -= energy[w - span];
    if (w >= span - 1 && sum > bestSum) {
      bestSum = sum;
      best = w - span + 1;
    }
  }
  return Math.max(0, Math.min(buf.duration - length, best * 0.5));
}

// Cuts [start, start + length] out of a decoded song, with short fades and even loudness.
export function cutClip(song, start, length) {
  const rate = song.sampleRate;
  const s0 = Math.max(0, Math.floor(start * rate));
  const len = Math.max(1, Math.min(song.length - s0, Math.floor(length * rate)));
  const channels = Math.min(2, song.numberOfChannels);
  const out = typeof AudioBuffer === 'function'
    ? new AudioBuffer({ numberOfChannels: channels, length: len, sampleRate: rate })
    : new (globalThis.OfflineAudioContext)(channels, len, rate).createBuffer(channels, len, rate);
  const fadeIn = Math.floor(rate * 0.04);
  const fadeOut = Math.floor(rate * Math.min(1, length * 0.15));
  for (let c = 0; c < channels; c++) {
    const src = song.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < len; i++) {
      let v = src[s0 + i];
      if (i < fadeIn) v *= i / fadeIn;
      const fromEnd = len - i;
      if (fromEnd < fadeOut) v *= fromEnd / fadeOut;
      dst[i] = v;
    }
  }
  return normalize(out, 0.92, 0.2, 3);
}

// Small summary of a song for drawing its waveform: peak per column.
export function peaks(buf, columns) {
  const d0 = buf.getChannelData(0);
  const d1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : d0;
  const per = Math.max(1, Math.floor(buf.length / columns));
  const out = new Float32Array(columns);
  for (let c = 0; c < columns; c++) {
    let p = 0;
    for (let i = c * per, e = Math.min(buf.length, i + per); i < e; i += 8) {
      const a = Math.max(Math.abs(d0[i]), Math.abs(d1[i]));
      if (a > p) p = a;
    }
    out[c] = p;
  }
  return out;
}

// ------------------------------------------------------------------ player
// Keeps rendered/decoded anthems and plays one at a time through the game's audio engine.
export class AnthemPlayer {
  constructor(audio, store) {
    this.audio = audio;
    this.store = store;
    this.cache = new Map(); // id -> Promise<AudioBuffer|null>
    this.current = null;
    this.volume = 0.8;
    this.token = 0;
  }

  // AudioBuffer for an anthem id ('kickoff', 'custom:abc'...). null for 'none' or a missing upload.
  buffer(id) {
    if (!id || id === 'none') return Promise.resolve(null);
    if (!this.cache.has(id)) {
      let p;
      if (id.startsWith('custom:')) {
        p = this.store.get(id.slice(7)).then(async (rec) => {
          if (!rec) return null;
          const song = await decodeSong(await rec.blob.arrayBuffer());
          return cutClip(song, rec.start, rec.length);
        });
      } else {
        const spec = anthemSpec(id);
        p = spec ? renderAnthem(spec) : Promise.resolve(null);
      }
      p = p.catch(() => null);
      this.cache.set(id, p);
    }
    return this.cache.get(id);
  }

  forget(id) {
    this.cache.delete(id);
  }

  // Plays an anthem. Resolves to true when it started.
  async play(id) {
    this.stop(0.15);
    const token = ++this.token;
    if (!this.audio.ready) return false;
    const buf = await this.buffer(id);
    if (!buf || token !== this.token) return false;
    this.current = this.audio.playBuffer(buf, this.volume);
    return !!this.current;
  }

  // Plays an already-made buffer (the upload editor's clip preview).
  playBuffer(buf) {
    this.stop(0.1);
    this.token++;
    if (!this.audio.ready || !buf) return false;
    this.current = this.audio.playBuffer(buf, this.volume);
    return true;
  }

  get playing() {
    return !!this.current && !this.current.ended;
  }

  stop(fade = 0.8) {
    this.token++;
    if (this.current) this.current.stop(fade);
    this.current = null;
  }

  setVolume(v) {
    this.volume = v;
    if (this.current) this.current.setGain(v);
  }
}
