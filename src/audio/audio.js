// Procedural sound with the Web Audio API. Every sound is synthesized; no audio files.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.volume = 0.8;
    this.engines = new Map();
  }

  // Must be called from a user gesture (browsers block audio before that).
  init() {
    if (this.ready) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(comp);
    // White and pink-ish noise buffers.
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      b[i] = last * 3.5;
    }
    this.startCrowd();
    this.ready = true;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  noiseSource(buffer = this.noise, loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = loop;
    if (!loop) s.playbackRate.value = 0.9 + Math.random() * 0.2;
    return s;
  }

  out(pan = 0, gain = 1) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    if (pan !== 0 && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      p.connect(this.master);
    } else {
      g.connect(this.master);
    }
    return g;
  }

  // ------------------------------------------------------------ crowd bed
  startCrowd() {
    const ctx = this.ctx;
    const src = this.noiseSource(this.noise, true);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.6;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    const g = ctx.createGain();
    g.gain.value = 0.045;
    src.connect(bp).connect(lp).connect(g).connect(this.master);
    src.start();
    // Slow swell so it breathes.
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.13;
    lfoGain.gain.value = 0.015;
    lfo.connect(lfoGain).connect(g.gain);
    lfo.start();
    this.crowdGain = g;
    this.crowdFilter = bp;
  }

  cheer(amount = 1, duration = 4) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = this.noiseSource(this.noise, true);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.32 * amount, t + 0.35);
    g.gain.setTargetAtTime(0.12 * amount, t + 1.2, 0.8);
    g.gain.setTargetAtTime(0, t + duration, 0.9);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + duration + 4);
    // Whistles and shouts on top: short chirps.
    for (let i = 0; i < 6 * amount; i++) {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      const st = t + 0.2 + Math.random() * 1.6;
      o.type = 'sine';
      const f = 1800 + Math.random() * 1400;
      o.frequency.setValueAtTime(f, st);
      o.frequency.linearRampToValueAtTime(f * (1.1 + Math.random() * 0.3), st + 0.25);
      og.gain.setValueAtTime(0, st);
      og.gain.linearRampToValueAtTime(0.02, st + 0.03);
      og.gain.linearRampToValueAtTime(0, st + 0.3);
      o.connect(og).connect(this.master);
      o.start(st);
      o.stop(st + 0.35);
    }
  }

  // ------------------------------------------------------------ engine and boost loops
  engine(id) {
    if (!this.ready) return null;
    let e = this.engines.get(id);
    if (e) return e;
    const ctx = this.ctx;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o2.type = 'square';
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    lp.Q.value = 2;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(x * 2.2);
    }
    shaper.curve = curve;
    const g = ctx.createGain();
    g.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(shaper).connect(g);
    if (pan) g.connect(pan).connect(this.master);
    else g.connect(this.master);
    o1.start();
    o2.start();
    // Boost: rumble plus hiss.
    const bn = this.noiseSource(this.noise, true);
    const bbp = ctx.createBiquadFilter();
    bbp.type = 'bandpass';
    bbp.frequency.value = 1200;
    bbp.Q.value = 0.7;
    const bRumble = this.noiseSource(this.brown, true);
    const bg = ctx.createGain();
    bg.gain.value = 0;
    bn.connect(bbp).connect(bg);
    bRumble.connect(bg);
    if (pan) bg.connect(pan);
    else bg.connect(this.master);
    bn.start();
    bRumble.start();
    e = { o1, o2, lp, g, bg, bbp, pan, boost: 0 };
    this.engines.set(id, e);
    return e;
  }

  updateEngine(id, { speed, throttle, boosting, onGround, pan = 0, volume = 1, supersonic }) {
    const e = this.engine(id);
    if (!e) return;
    const t = this.ctx.currentTime;
    // Fake gears: pitch rises and drops as speed climbs.
    const sp = Math.min(speed, 23);
    const gear = Math.min(3, Math.floor(sp / 6.5));
    const inGear = (sp - gear * 6.5) / 6.5;
    const rpm = 0.25 + 0.55 * inGear + gear * 0.06 + Math.abs(throttle) * 0.12 + (onGround ? 0 : 0.15);
    const f = 38 + rpm * 70;
    e.o1.frequency.setTargetAtTime(f, t, 0.05);
    e.o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    e.lp.frequency.setTargetAtTime(350 + rpm * 1400 + Math.abs(throttle) * 300, t, 0.06);
    const vol = (0.035 + Math.abs(throttle) * 0.03 + Math.min(sp, 14) * 0.002) * volume;
    e.g.gain.setTargetAtTime(vol, t, 0.08);
    e.bg.gain.setTargetAtTime(boosting ? 0.08 * volume * (supersonic ? 1.25 : 1) : 0, t, boosting ? 0.02 : 0.08);
    e.bbp.frequency.setTargetAtTime(supersonic ? 1700 : 1200, t, 0.1);
    if (e.pan) e.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.05);
  }

  stopEngine(id) {
    const e = this.engines.get(id);
    if (!e) return;
    const t = this.ctx.currentTime;
    e.g.gain.setTargetAtTime(0, t, 0.05);
    e.bg.gain.setTargetAtTime(0, t, 0.05);
  }

  silenceEngines() {
    for (const id of this.engines.keys()) this.stopEngine(id);
  }

  // ------------------------------------------------------------ one-shots
  thump(freq, dur, gain, pan = 0) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * 0.4), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out(pan));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  burst(type, freq, q, dur, gain, pan = 0, buffer = this.noise) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const s = this.noiseSource(buffer);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.out(pan));
    s.start(t);
    s.stop(t + dur + 0.05);
  }

  tone(type, f0, f1, dur, gain, delay = 0, pan = 0) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out(pan));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(name, opts = {}) {
    if (!this.ready) return;
    const pan = opts.pan || 0;
    const vol = opts.volume === undefined ? 1 : opts.volume;
    switch (name) {
      case 'ballHit': {
        const k = Math.min(1, (opts.strength || 1000) / 3500);
        this.thump(120 + k * 40, 0.25 + k * 0.2, (0.25 + k * 0.5) * vol, pan);
        this.burst('highpass', 1800, 0.7, 0.07 + k * 0.08, (0.12 + k * 0.3) * vol, pan);
        if (k > 0.5) this.tone('triangle', 900, 700, 0.18, 0.06 * k * vol, 0, pan);
        break;
      }
      case 'bounce': {
        const k = Math.min(1, (opts.strength || 5) / 25);
        this.thump(80, 0.18, (0.08 + k * 0.25) * vol, pan);
        this.burst('lowpass', 400, 1, 0.1, 0.08 * k * vol, pan);
        break;
      }
      case 'jump':
        this.burst('bandpass', 500, 1.2, 0.18, 0.12 * vol, pan);
        this.thump(70, 0.12, 0.08 * vol, pan);
        break;
      case 'flip':
        this.burst('bandpass', 900, 0.8, 0.25, 0.1 * vol, pan);
        break;
      case 'land':
        this.thump(60, 0.15, Math.min(0.25, 0.05 + (opts.strength || 3) * 0.02) * vol, pan);
        break;
      case 'pad':
        this.tone('sine', 660, 1320, 0.09, 0.05 * vol, 0, pan);
        break;
      case 'padBig':
        this.tone('sine', 520, 780, 0.08, 0.07 * vol, 0, pan);
        this.tone('sine', 780, 1170, 0.1, 0.07 * vol, 0.07, pan);
        this.tone('sine', 1040, 1560, 0.14, 0.06 * vol, 0.14, pan);
        break;
      case 'bump':
        this.thump(55, 0.25, 0.35 * vol, pan);
        this.burst('lowpass', 900, 0.8, 0.2, 0.2 * vol, pan);
        break;
      case 'demo':
        this.explosion(0.7 * vol, pan);
        break;
      case 'goal':
        this.explosion(1.0 * vol, pan);
        this.horn(0.35);
        this.cheer(1.2, 5);
        break;
      case 'supersonic':
        this.burst('bandpass', 2400, 0.6, 0.6, 0.06 * vol, pan);
        break;
      case 'count':
        this.tone('sine', 640, 640, 0.22, 0.12);
        this.tone('triangle', 1280, 1280, 0.12, 0.03);
        break;
      case 'go':
        this.tone('sine', 960, 960, 0.5, 0.14);
        this.tone('triangle', 1920, 1920, 0.3, 0.04);
        break;
      case 'click':
        this.tone('square', 1400, 900, 0.04, 0.03);
        break;
      case 'flipReset': {
        // A crisp mechanical "click-clack" (like a latch snapping shut), then a short bright ping.
        const ctx = this.ctx;
        for (const [dt, f, g] of [[0, 5200, 0.55], [0.055, 3600, 0.45]]) {
          const t = ctx.currentTime + dt;
          const src = this.noiseSource();
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = f;
          bp.Q.value = 2.5;
          const gn = ctx.createGain();
          gn.gain.setValueAtTime(g * vol, t);
          gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
          src.connect(bp).connect(gn).connect(this.out(pan));
          src.start(t);
          src.stop(t + 0.05);
          this.tone('square', 2400, 1800, 0.012, 0.05 * vol, dt, pan);
        }
        this.tone('sine', 1760, 2640, 0.12, 0.09 * vol, 0.1, pan);
        this.tone('sine', 2640, 2640, 0.18, 0.05 * vol, 0.16, pan);
        break;
      }
      case 'whistle':
        this.tone('sine', 2400, 2600, 0.5, 0.06);
        this.tone('sine', 2420, 2620, 0.5, 0.04, 0.55);
        break;
      case 'scrape':
        this.burst('bandpass', 3000, 2, 0.12, 0.05 * vol, pan);
        break;
      default:
        break;
    }
  }

  explosion(gain, pan) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const s = this.noiseSource(this.brown);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2200, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 1.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9 * gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    s.connect(lp).connect(g).connect(this.out(pan));
    s.start(t);
    s.stop(t + 2.3);
    this.thump(70, 1.1, 0.9 * gain, pan);
    this.burst('highpass', 2500, 0.5, 0.3, 0.35 * gain, pan);
  }

  horn(gain) {
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.1;
    for (const f of [130.8, 196, 261.6, 329.6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const vib = ctx.createOscillator();
      const vg = ctx.createGain();
      vib.frequency.value = 5.5;
      vg.gain.value = f * 0.006;
      vib.connect(vg).connect(o.frequency);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1600;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain * 0.12, t + 0.08);
      g.gain.setValueAtTime(gain * 0.12, t + 1.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);
      o.connect(lp).connect(g).connect(this.master);
      o.start(t);
      vib.start(t);
      o.stop(t + 2.1);
      vib.stop(t + 2.1);
    }
  }

  // ------------------------------------------------------------ music clips (anthems)
  // Plays an AudioBuffer once. Returns { stop(fade), setGain(v), ended } or null.
  playBuffer(buffer, gain = 1) {
    if (!this.ready || !buffer) return null;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.03);
    src.connect(g).connect(this.master);
    src.start(t);
    const h = {
      ended: false,
      stop: (fade = 0.6) => {
        if (h.ended) return;
        h.ended = true;
        const n = ctx.currentTime;
        g.gain.cancelScheduledValues(n);
        g.gain.setValueAtTime(g.gain.value, n);
        g.gain.linearRampToValueAtTime(0, n + Math.max(0.02, fade));
        try {
          src.stop(n + Math.max(0.02, fade) + 0.05);
        } catch (e) {
          // Already stopped.
        }
      },
      setGain: (v) => {
        if (!h.ended) g.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
      },
    };
    src.onended = () => { h.ended = true; };
    return h;
  }
}
