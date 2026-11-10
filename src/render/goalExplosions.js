// Goal explosions: 15 styles to pick in the garage. Each one is built from the shared effect pieces in
// Effects (fireballs, flashes, rings, glow / smoke / streak particles, timed steps and small meshes),
// colored by the scoring team. All original designs.
import * as THREE from 'three';
import { env } from './screenFx.js';

const v = new THREE.Vector3();
const v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const WHITE = new THREE.Color(1, 1, 1);
const GOLD = new THREE.Color(1, 0.82, 0.35);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Random unit vector; `lift` biases it upward.
function randDir(out, lift = 0) {
  out.set(Math.random() - 0.5, Math.random() - 0.5 + lift, Math.random() - 0.5);
  if (out.lengthSq() < 1e-4) out.set(0, 1, 0);
  return out.normalize();
}

function palette(tc) {
  return { tc, hot: tc.clone().lerp(WHITE, 0.35), pale: tc.clone().lerp(WHITE, 0.7), deep: tc.clone().multiplyScalar(0.35) };
}

// Glow particles flying out in all directions.
function burst(fx, pos, n, s0, s1, life, size0, size1, c0, c1, { lift = 0, drag = 1.4, grav = 9, alpha = 1 } = {}) {
  const k = Math.round(n * fx.quality.particles);
  for (let i = 0; i < k; i++) {
    randDir(v, lift);
    const sp = rnd(s0, s1);
    const a = typeof c0 === 'function' ? c0() : c0;
    const b = typeof c1 === 'function' ? c1() : c1 || a;
    fx.glow.spawn(pos.x, pos.y, pos.z, v.x * sp, v.y * sp, v.z * sp, life * rnd(0.7, 1.3), size0, size1, a, b, alpha, drag, grav);
  }
}

function streakBurst(fx, pos, n, s0, s1, life, color, { lift = 0, drag = 1.2, grav = 9.8, len = 0.03 } = {}) {
  const k = Math.round(n * fx.quality.particles);
  for (let i = 0; i < k; i++) {
    randDir(v, lift);
    const sp = rnd(s0, s1);
    fx.streaks.spawn(pos.x, pos.y, pos.z, v.x * sp, v.y * sp, v.z * sp, life * rnd(0.6, 1.3), len, typeof color === 'function' ? color() : color, drag, grav);
  }
}

function smokeBurst(fx, pos, n, s0, s1, life, size0, size1, c0, c1, alpha, { lift = 0.3, drag = 1.1, grav = -0.7 } = {}) {
  const k = Math.round(n * fx.quality.particles);
  for (let i = 0; i < k; i++) {
    randDir(v, lift);
    const sp = rnd(s0, s1);
    fx.smoke.spawn(pos.x, pos.y, pos.z, v.x * sp, v.y * sp + 1.5, v.z * sp, life * rnd(0.7, 1.3), size0, size1, c0, c1, alpha, drag, grav);
  }
}

// Direction from the goal toward the field.
const fieldDir = (pos) => new THREE.Vector3(0, 0, -Math.sign(pos.z) || 1);
const CROSSBAR = 6.43; // goal height, m

function classic(fx, pos, tc) {
  const { hot, deep, pale } = palette(tc);
  fx.fireball(pos, tc, hot, 0.7, 6.5, 0.85, 'plasma', 1.2);
  fx.fireball(pos, hot, pale, 0.4, 3.0, 0.4, 'plasma', 0.6);
  fx.fireball(pos, tc, hot, 1.2, 9.0, 2.4, 'smoke', 1.6);
  fx.fireball(pos, tc, hot, 1.0, 16, 0.45, 'shell', 0);
  fx.ring(v2.set(pos.x, 0.06, pos.z), UP, 1.2, 21, 0.75, tc, 1, 0.93);
  fx.ring(pos, fieldDir(pos), 1.0, 12, 0.4, hot, 0.8, 0.9);
  burst(fx, pos, 380, 8, 34, 1.3, 0.5, 0.12, hot, deep, { lift: 0.15 });
  burst(fx, pos, 70, 4, 13, 0.85, 3.0, 6.0, tc, deep, { alpha: 0.16, drag: 3.5, grav: -1 });
  smokeBurst(fx, pos, 90, 3, 10, 3.1, 2.0, 6.5, fx.colors.smokeExpl, fx.colors.smokeDark, 0.55);
  burst(fx, pos, 200, 9, 24, 3.2, 0.13, 0.13, () => (Math.random() < 0.65 ? tc : WHITE), null, { lift: 1.2, drag: 1.8, grav: 3.5 });
  streakBurst(fx, pos, 260, 18, 58, 0.8, () => (Math.random() < 0.5 ? hot : fx.colors.spark), { lift: 0.1 });
  fx.flash(pos, 8, 0.18, WHITE);
  fx.flash(pos, 26, 0.8, tc);
  fx.shake = Math.max(fx.shake, 1.3);
}

function fireworks(fx, pos, tc) {
  const { hot, pale } = palette(tc);
  fx.flash(pos, 10, 0.25, hot);
  fx.ring(v2.set(pos.x, 0.06, pos.z), UP, 1, 10, 0.5, tc, 0.8, 0.9);
  smokeBurst(fx, pos, 30, 1, 4, 2, 1, 3.5, fx.colors.smokeLight, fx.colors.smokeDark, 0.35);
  const colors = [tc, GOLD, WHITE, pale];
  const dir = fieldDir(pos);
  for (let i = 0; i < 9; i++) {
    const t = rnd(0.45, 1.0);
    const vel = new THREE.Vector3(rnd(-7, 7), rnd(13, 19), rnd(-3, 3) + dir.z * rnd(2, 7));
    const start = pos.clone();
    const color = colors[i % colors.length];
    fx.later(i * 0.08, () => {
      // Rocket: a bright head plus its sparkling trail, no gravity so the burst point is known.
      fx.glow.spawn(start.x, start.y, start.z, vel.x, vel.y, vel.z, t, 0.45, 0.3, WHITE, color, 1, 0, 0);
      for (let k = 0; k < 14; k++) {
        const f = k / 14;
        fx.later(f * t, () => fx.glow.spawn(start.x + vel.x * f * t, start.y + vel.y * f * t, start.z + vel.z * f * t, rnd(-0.5, 0.5), rnd(-1, 0), rnd(-0.5, 0.5), 0.5, 0.2, 0.02, GOLD, color, 0.8, 1, 2));
      }
      fx.later(t, () => {
        const p = start.clone().addScaledVector(vel, t);
        burst(fx, p, 170, 7, 13, 1.6, 0.55, 0.1, color, color === WHITE ? GOLD : WHITE, { drag: 1.2, grav: 3.5 });
        streakBurst(fx, p, 40, 6, 12, 0.7, color, { grav: 4 });
        fx.flash(p, 11, 0.35, color);
        // Crackle a moment later.
        fx.later(0.5, () => burst(fx, p, 40, 2, 7, 0.35, 0.18, 0.02, WHITE, GOLD, { grav: 2 }));
      });
    });
  }
  fx.shake = Math.max(fx.shake, 0.5);
}

function supernova(fx, pos, tc) {
  const { hot, pale } = palette(tc);
  fx.flash(pos, 40, 0.5, WHITE);
  fx.flash(pos, 30, 1.6, tc);
  fx.fireball(pos, pale, WHITE, 0.5, 11, 1.1, 'plasma', 0);
  fx.fireball(pos, tc, hot, 1, 26, 0.7, 'shell', 0);
  fx.later(0.15, () => fx.fireball(pos, tc, pale, 1, 20, 0.9, 'shell', 0));
  fx.ring(pos, fieldDir(pos), 1, 30, 1.2, pale, 1, 0.96);
  fx.ring(pos, UP, 1, 26, 1.0, tc, 0.9, 0.95);
  fx.ring(pos, v.set(1, 0.4, 0).normalize().clone(), 1, 22, 1.1, hot, 0.8, 0.95);
  burst(fx, pos, 40, 1, 4, 2.2, 5, 11, tc, pale, { alpha: 0.12, drag: 2, grav: 0 });
  burst(fx, pos, 500, 2, 30, 2.4, 0.22, 0.05, () => (Math.random() < 0.5 ? WHITE : pale), tc, { drag: 2.2, grav: 0.4 });
  fx.shake = Math.max(fx.shake, 1.6);
}

function shockwave(fx, pos, tc) {
  const { hot, pale } = palette(tc);
  fx.fireball(pos, tc, hot, 0.5, 4, 0.5, 'plasma', 0.5);
  fx.flash(pos, 14, 0.3, pale);
  for (let i = 0; i < 4; i++) {
    fx.later(i * 0.14, () => {
      fx.ring(v2.set(pos.x, 0.07, pos.z), UP, 1, 18 + i * 6, 0.9, i % 2 ? pale : tc, 1, 0.9);
      fx.ring(pos, fieldDir(pos), 1, 10 + i * 4, 0.6, hot, 0.7, 0.88);
      fx.fireball(pos, tc, hot, 1, 10 + i * 5, 0.5, 'shell', 0);
      // Dust kicked up around the ground ring.
      const n = Math.round(30 * fx.quality.particles);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const r = 3 + i * 2;
        fx.smoke.spawn(pos.x + Math.cos(a) * r, 0.3, pos.z + Math.sin(a) * r, Math.cos(a) * 9, rnd(0.5, 2), Math.sin(a) * 9, rnd(0.8, 1.4), 1, 3.5, fx.colors.dust, fx.colors.smokeDark, 0.35, 2, -0.3);
      }
      fx.shake = Math.max(fx.shake, 1.2);
    });
  }
  streakBurst(fx, pos, 120, 20, 50, 0.5, WHITE, { lift: -0.1 });
}

function inferno(fx, pos, tc) {
  const fire = new THREE.Color(1, 0.42, 0.08).lerp(tc, 0.25);
  const core = new THREE.Color(1, 0.62, 0.22);
  for (let i = 0; i < 7; i++) {
    fx.later(i * 0.11, () => {
      const p = pos.clone().add(v.set(rnd(-1.5, 1.5), rnd(0, 1.5), rnd(-1.5, 1.5)));
      fx.fireball(p, fire, core, 0.6, rnd(3.5, 5.5), 1.1, 'plasma', rnd(5, 9));
      fx.fireball(p, fire, core, 1, rnd(5, 7), 2.6, 'smoke', rnd(3, 5));
      burst(fx, p, 60, 3, 9, 1.6, 0.4, 0.05, core, fire, { lift: 0.8, drag: 1, grav: -3 });
    });
  }
  burst(fx, pos, 300, 6, 22, 2.5, 0.22, 0.04, () => (Math.random() < 0.5 ? core : fire), fx.colors.ember, { lift: 0.6, drag: 1.1, grav: -1.5 });
  smokeBurst(fx, pos, 120, 2, 7, 4, 2, 7, fx.colors.smokeExpl, fx.colors.smokeDark, 0.6, { lift: 1, grav: -2 });
  fx.flash(pos, 24, 1.2, fire);
  fx.ring(v2.set(pos.x, 0.06, pos.z), UP, 1, 16, 0.8, fire, 0.9, 0.9);
  fx.shake = Math.max(fx.shake, 1.1);
}

function frost(fx, pos, tc) {
  const ice = new THREE.Color(0.7, 0.92, 1).lerp(tc, 0.2);
  const pale = new THREE.Color(0.92, 0.98, 1);
  fx.flash(pos, 22, 0.6, ice);
  fx.fireball(pos, ice, pale, 0.6, 7, 0.6, 'plasma', 0);
  fx.fireball(pos, ice, pale, 1, 15, 0.5, 'shell', 0);
  fx.ring(v2.set(pos.x, 0.06, pos.z), UP, 1, 20, 1.2, pale, 0.9, 0.93);
  streakBurst(fx, pos, 260, 14, 40, 0.9, () => (Math.random() < 0.5 ? pale : ice), { len: 0.05, grav: 6 });
  // Shards that hang a moment, then snow that drifts down for a few seconds.
  burst(fx, pos, 160, 4, 16, 1.8, 0.3, 0.08, pale, ice, { drag: 2.5, grav: 1 });
  const n = Math.round(400 * fx.quality.particles);
  for (let i = 0; i < n; i++) {
    const p = v.set(pos.x + rnd(-10, 10), pos.y + rnd(1, 9), pos.z + rnd(-10, 10) - Math.sign(pos.z) * 4);
    fx.glow.spawn(p.x, p.y, p.z, rnd(-0.6, 0.6), rnd(-1.2, -0.4), rnd(-0.6, 0.6), rnd(2.5, 4.5), 0.12, 0.1, WHITE, pale, 0.9, 0.6, 0.3);
  }
  smokeBurst(fx, pos, 70, 2, 7, 3, 2, 6, pale, ice, 0.3, { lift: 0.2, grav: 0.2 });
  fx.shake = Math.max(fx.shake, 0.9);
}

function lightning(fx, pos, tc) {
  const { hot, pale } = palette(tc);
  const bolt = (target) => {
    const top = target.clone().add(v.set(rnd(-6, 6), 20, rnd(-4, 4)));
    let prev = top.clone();
    const steps = 12;
    for (let s = 1; s <= steps; s++) {
      const f = s / steps;
      const p = top.clone().lerp(target, f);
      if (s < steps) p.add(v.set(rnd(-1.4, 1.4), rnd(-0.5, 0.5), rnd(-1.4, 1.4)));
      const dots = 7;
      for (let d = 0; d < dots; d++) {
        const q = prev.clone().lerp(p, d / dots);
        fx.glow.spawn(q.x, q.y, q.z, 0, 0, 0, rnd(0.14, 0.26), 0.75, 0.4, WHITE, pale, 1, 0, 0);
      }
      // A side branch now and then.
      if (Math.random() < 0.25) {
        const b = p.clone().add(v.set(rnd(-3, 3), rnd(-2, 0), rnd(-3, 3)));
        for (let d = 0; d < 6; d++) {
          const q = p.clone().lerp(b, d / 6);
          fx.glow.spawn(q.x, q.y, q.z, 0, 0, 0, 0.12, 0.3, 0.1, pale, tc, 0.9, 0, 0);
        }
      }
      prev = p;
    }
    fx.flash(target, 16, 0.18, pale);
    fx.flash(top, 10, 0.12, WHITE);
    streakBurst(fx, target, 60, 8, 24, 0.5, () => (Math.random() < 0.5 ? WHITE : hot));
  };
  for (let i = 0; i < 6; i++) {
    fx.later(i * rnd(0.1, 0.18), () => bolt(pos.clone().add(v2.set(rnd(-3, 3), rnd(-1, 1), rnd(-2, 2)))));
  }
  fx.fireball(pos, tc, hot, 0.5, 5, 0.6, 'plasma', 0.5);
  fx.ring(v2.set(pos.x, 0.06, pos.z), UP, 1, 18, 0.6, pale, 1, 0.94);
  fx.later(0.9, () => smokeBurst(fx, pos, 50, 1, 4, 2.5, 1.5, 5, fx.colors.smokeLight, fx.colors.smokeDark, 0.3));
  fx.shake = Math.max(fx.shake, 1.2);
}

// Black hole: a dark core opens, the whole arena is pulled into it and spirals away until only the
// void is left, then everything is thrown back out in one blast. The full-screen part is in SCREEN.
const BH_PULL = 1.45; // seconds of pulling
const BH_BLAST = 1.75; // when it blows
function blackHole(fx, pos, tc) {
  const { hot, pale } = palette(tc);
  const dark = new THREE.Color(0.02, 0.0, 0.05);
  const violet = new THREE.Color(0.55, 0.25, 1);
  // Matter from all over the field: streams that spiral in, more and more of them.
  const steps = 24;
  for (let s = 0; s < steps; s++) {
    fx.later((s / steps) * BH_PULL * 0.85, () => {
      const n = Math.round(34 * fx.quality.particles) + 4;
      const left = BH_PULL - (s / steps) * BH_PULL * 0.85;
      for (let i = 0; i < n; i++) {
        const r = rnd(10, 48);
        const a = Math.random() * Math.PI * 2;
        const p = v.set(pos.x + Math.cos(a) * r, rnd(0.2, 14), pos.z + Math.sin(a) * r * 0.8);
        const t = Math.max(0.25, left * rnd(0.6, 1));
        // Straight in plus a sideways part, so the streams curl.
        const vx = (pos.x - p.x) / t - Math.sin(a) * r * 0.6;
        const vz = (pos.z - p.z) / t + Math.cos(a) * r * 0.6;
        const vy = (pos.y - p.y) / t;
        fx.glow.spawn(p.x, p.y, p.z, vx, vy, vz, t, rnd(0.25, 0.5), 0.05, Math.random() < 0.4 ? pale : tc, violet, 1, 0, 0);
      }
      // Dust torn off the floor.
      if (s % 3 === 0) {
        const m = Math.round(10 * fx.quality.particles) + 2;
        for (let i = 0; i < m; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = rnd(6, 30);
          const x = pos.x + Math.cos(a) * r;
          const z = pos.z + Math.sin(a) * r;
          fx.smoke.spawn(x, 0.3, z, (pos.x - x) * 1.2, rnd(1, 3), (pos.z - z) * 1.2, rnd(0.6, 1), 1, 0.2, fx.colors.smokeDark, dark, 0.5, 0, 0);
        }
      }
    });
  }
  // Accretion ring: a bright disk turning around the core.
  const ringN = Math.round(260 * fx.quality.particles) + 30;
  for (let i = 0; i < ringN; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = rnd(1.5, 3.2);
    const sp = 14 / r;
    fx.glow.spawn(pos.x + Math.cos(a) * r, pos.y + rnd(-0.1, 0.1), pos.z + Math.sin(a) * r, -Math.sin(a) * sp * r * 0.3, 0, Math.cos(a) * sp * r * 0.3, rnd(0.6, BH_PULL), rnd(0.15, 0.3), 0.05, Math.random() < 0.5 ? hot : pale, violet, 1, 0, 0);
  }
  fx.ring(pos, fieldDir(pos), 22, 0.5, BH_PULL, tc, 0.9, 0.92);
  fx.ring(v2.set(pos.x, 0.06, pos.z), UP, 30, 0.5, BH_PULL, hot, 0.7, 0.94);
  fx.later(BH_PULL * 0.5, () => fx.ring(v2.set(pos.x, 0.06, pos.z), UP, 18, 0.5, BH_PULL * 0.5, violet, 0.7, 0.9));
  fx.fireball(pos, dark, tc, 0.3, 3.6, BH_BLAST, 'smoke', 0);
  fx.flash(pos, 7, BH_BLAST, violet);
  fx.later(BH_BLAST, () => {
    fx.flash(pos, 34, 0.45, WHITE);
    fx.flash(pos, 30, 1.2, tc);
    fx.fireball(pos, tc, hot, 1, 32, 0.7, 'shell', 0);
    fx.later(0.12, () => fx.fireball(pos, violet, pale, 1, 22, 0.8, 'shell', 0));
    fx.fireball(pos, tc, pale, 0.6, 9, 0.8, 'plasma', 0);
    streakBurst(fx, pos, 520, 30, 80, 0.8, () => (Math.random() < 0.5 ? pale : tc), { lift: 0 });
    burst(fx, pos, 420, 12, 45, 1.6, 0.4, 0.05, hot, violet, { grav: 2 });
    fx.ring(pos, fieldDir(pos), 1, 40, 0.9, pale, 1, 0.95);
    fx.ring(v2.set(pos.x, 0.06, pos.z), UP, 1, 60, 1.1, tc, 1, 0.96);
    smokeBurst(fx, pos, 80, 6, 18, 2.5, 2, 8, violet, dark, 0.4, { grav: 0 });
    fx.shake = Math.max(fx.shake, 2.4);
  });
}

function confetti(fx, pos, tc) {
  const colors = [tc, WHITE, GOLD, new THREE.Color(1, 0.3, 0.55), new THREE.Color(0.3, 1, 0.55), new THREE.Color(0.35, 0.6, 1), new THREE.Color(0.75, 0.4, 1)];
  fx.flash(pos, 12, 0.25, WHITE);
  for (let wave = 0; wave < 3; wave++) {
    fx.later(wave * 0.18, () => {
      burst(fx, pos, 420, 8, 24, 4.2, 0.24, 0.22, () => pick(colors), null, { lift: 1.4, drag: 2.2, grav: 2.5 });
      fx.flash(pos, 6, 0.15, pick(colors));
    });
  }
  // Streamers: long-lived streaks.
  streakBurst(fx, pos, 120, 10, 22, 1.6, () => pick(colors), { lift: 1.2, drag: 1.6, grav: 3, len: 0.04 });
  smokeBurst(fx, pos, 25, 1, 3, 1.5, 1, 3, fx.colors.smokeLight, fx.colors.smokeLight, 0.25);
  fx.shake = Math.max(fx.shake, 0.4);
}

function geyser(fx, pos, tc) {
  const { hot, pale, deep } = palette(tc);
  const base = new THREE.Vector3(pos.x, 0.3, pos.z);
  fx.fireball(base, tc, hot, 0.5, 4, 0.6, 'plasma', 2);
  fx.ring(v2.set(pos.x, 0.06, pos.z), UP, 1, 12, 0.8, pale, 0.9, 0.9);
  for (let i = 0; i < 26; i++) {
    fx.later(i * 0.045, () => {
      const n = Math.round(30 * fx.quality.particles);
      for (let k = 0; k < n; k++) {
        const vy = rnd(17, 27);
        fx.glow.spawn(base.x + rnd(-0.6, 0.6), base.y, base.z + rnd(-0.6, 0.6), rnd(-2.2, 2.2), vy, rnd(-2.2, 2.2), rnd(1.6, 2.6), rnd(0.25, 0.45), 0.08, Math.random() < 0.6 ? pale : tc, deep, 1, 0.3, 10);
      }
      fx.smoke.spawn(base.x, base.y, base.z, rnd(-1, 1), rnd(4, 8), rnd(-1, 1), 1.8, 1.2, 4, pale, fx.colors.smokeLight, 0.3, 1, -0.5);
    });
  }
  fx.later(1.25, () => burst(fx, v.set(pos.x, 18, pos.z).clone(), 160, 2, 8, 2, 0.3, 0.05, pale, tc, { grav: 6 }));
  fx.flash(base, 12, 0.5, hot);
  fx.shake = Math.max(fx.shake, 0.8);
}

function rainbow(fx, pos, tc) {
  const bands = [[1, 0.2, 0.2], [1, 0.55, 0.1], [1, 0.95, 0.2], [0.25, 1, 0.35], [0.2, 0.75, 1], [0.35, 0.35, 1], [0.8, 0.35, 1]].map((c) => new THREE.Color(...c));
  bands.forEach((c, i) => {
    fx.later(i * 0.07, () => {
      fx.ring(pos, fieldDir(pos), 1, 8 + i * 2.2, 1.1, c, 0.85, 0.92);
      fx.ring(v2.set(pos.x, 0.06 + i * 0.01, pos.z), UP, 1, 12 + i * 2.5, 1.2, c, 0.8, 0.92);
    });
  });
  fx.flash(pos, 16, 0.5, WHITE);
  fx.fireball(pos, tc, WHITE, 0.5, 5, 0.5, 'plasma', 0.5);
  streakBurst(fx, pos, 280, 14, 40, 1, () => pick(bands), { lift: 0.3 });
  burst(fx, pos, 260, 4, 18, 2.4, 0.22, 0.06, () => pick(bands), null, { lift: 0.6, drag: 1.6, grav: 2.5 });
  fx.shake = Math.max(fx.shake, 0.9);
}

// Small glowing cubes (meshes) that tumble out and bounce on the floor.
function cubes(fx, pos, colors, n, speed, size = 0.24, life = 2.6) {
  const geo = new THREE.BoxGeometry(size, size, size);
  const mats = colors.map((c) => new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(1.4), toneMapped: false }));
  const k = Math.round(n * Math.max(0.35, fx.quality.particles));
  for (let i = 0; i < k; i++) {
    const m = new THREE.Mesh(geo, pick(mats));
    m.position.copy(pos);
    const vel = randDir(new THREE.Vector3(), 0.6).multiplyScalar(rnd(speed * 0.35, speed));
    const spin = new THREE.Vector3(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12));
    const l = life * rnd(0.7, 1.2);
    fx.temp(m, l, (dt, age) => {
      vel.y -= 12 * dt;
      m.position.addScaledVector(vel, dt);
      if (m.position.y < size / 2) {
        m.position.y = size / 2;
        vel.y = Math.abs(vel.y) * 0.45;
        vel.x *= 0.7;
        vel.z *= 0.7;
        spin.multiplyScalar(0.6);
      }
      m.rotation.x += spin.x * dt;
      m.rotation.y += spin.y * dt;
      m.rotation.z += spin.z * dt;
      m.scale.setScalar(Math.min(1, (l - age) * 3));
    });
  }
  fx.later(life * 1.3, () => {
    geo.dispose();
    for (const mt of mats) mt.dispose();
  });
}

function voxel(fx, pos, tc) {
  const { hot, pale } = palette(tc);
  cubes(fx, pos, [tc, hot, pale, WHITE], 160, 22);
  fx.flash(pos, 18, 0.3, pale);
  fx.ring(v2.set(pos.x, 0.06, pos.z), UP, 1, 14, 0.5, tc, 1, 0.75);
  fx.ring(pos, fieldDir(pos), 1, 9, 0.4, hot, 0.9, 0.7);
  burst(fx, pos, 120, 6, 18, 0.8, 0.3, 0.3, tc, hot, { grav: 6 });
  fx.shake = Math.max(fx.shake, 1);
}

function starburst(fx, pos, tc) {
  const { hot, pale } = palette(tc);
  const dir = fieldDir(pos);
  const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
  const rays = 14;
  for (let r = 0; r < rays; r++) {
    const a = (r / rays) * Math.PI * 2;
    const rayDir = new THREE.Vector3().addScaledVector(side, Math.cos(a)).addScaledVector(UP, Math.sin(a));
    rayDir.addScaledVector(dir, 0.25).normalize();
    const n = Math.round(26 * fx.quality.particles);
    for (let k = 0; k < n; k++) {
      const sp = 4 + (k / n) * 30;
      fx.glow.spawn(pos.x, pos.y, pos.z, rayDir.x * sp, rayDir.y * sp, rayDir.z * sp, 1.3, 0.6, 0.08, k % 3 ? pale : WHITE, tc, 1, 1.8, 0);
    }
  }
  fx.flash(pos, 30, 0.7, pale);
  fx.flash(pos, 9, 0.2, WHITE);
  fx.fireball(pos, tc, hot, 0.5, 4.5, 0.5, 'plasma', 0);
  fx.ring(pos, dir, 1, 18, 0.9, hot, 0.9, 0.95);
  // Twinkles where the rays fade.
  fx.later(0.7, () => {
    const n = Math.round(90 * fx.quality.particles);
    for (let i = 0; i < n; i++) {
      const p = v.copy(pos).addScaledVector(side, rnd(-14, 14)).addScaledVector(UP, rnd(-1, 13));
      fx.glow.spawn(p.x, Math.max(0.3, p.y), p.z, 0, 0, 0, rnd(0.3, 0.8), 0.4, 0.02, WHITE, pale, 1, 0, 0);
    }
  });
  fx.shake = Math.max(fx.shake, 0.9);
}

function meteor(fx, pos, tc) {
  const { hot, pale } = palette(tc);
  const fire = new THREE.Color(1, 0.5, 0.15).lerp(tc, 0.4);
  const start = pos.clone().add(v.set(rnd(-4, 4), 24, -Math.sign(pos.z) * 14));
  const fall = 0.42;
  const steps = 16;
  for (let s = 0; s <= steps; s++) {
    const f = s / steps;
    fx.later(f * fall, () => {
      const p = start.clone().lerp(pos, f);
      fx.glow.spawn(p.x, p.y, p.z, 0, 0, 0, 0.35, 1.6, 0.4, WHITE, fire, 1, 0, 0);
      burst(fx, p, 8, 1, 3, 0.5, 0.35, 0.05, hot, fire, { grav: 0 });
      fx.smoke.spawn(p.x, p.y, p.z, rnd(-0.5, 0.5), rnd(0, 1), rnd(-0.5, 0.5), 1.6, 1, 3, fx.colors.smokeExpl, fx.colors.smokeDark, 0.5, 1, -0.2);
    });
  }
  fx.later(fall, () => {
    fx.fireball(pos, fire, hot, 0.8, 8, 0.9, 'plasma', 1.5);
    fx.fireball(pos, fire, hot, 1.2, 10, 2.6, 'smoke', 1.2);
    fx.fireball(pos, tc, pale, 1, 18, 0.5, 'shell', 0);
    fx.ring(v2.set(pos.x, 0.06, pos.z), UP, 1, 24, 0.8, fire, 1, 0.9);
    cubes(fx, pos, [new THREE.Color(0.25, 0.2, 0.18), fire, tc], 60, 18, 0.3, 2.2);
    streakBurst(fx, pos, 260, 16, 50, 0.8, () => (Math.random() < 0.5 ? hot : fx.colors.spark), { lift: 0.3 });
    smokeBurst(fx, pos, 110, 3, 11, 3.2, 2, 7, fx.colors.smokeExpl, fx.colors.smokeDark, 0.6);
    fx.flash(pos, 30, 0.8, fire);
    fx.shake = Math.max(fx.shake, 2);
  });
}

function vortex(fx, pos, tc) {
  const { hot, pale } = palette(tc);
  const T = 1.2;
  const steps = 40;
  for (let s = 0; s < steps; s++) {
    fx.later((s / steps) * T, () => {
      for (let arm = 0; arm < 3; arm++) {
        const a = s * 0.55 + (arm * Math.PI * 2) / 3;
        const r = 1.2 + s * 0.06;
        const p = v.set(pos.x + Math.cos(a) * r, 0.3 + s * 0.12, pos.z + Math.sin(a) * r);
        // Tangent plus a little outward and upward drift traces a widening spiral.
        const tx = -Math.sin(a) * 4 + Math.cos(a) * 1.2;
        const tz = Math.cos(a) * 4 + Math.sin(a) * 1.2;
        const n = Math.max(1, Math.round(5 * fx.quality.particles));
        for (let k = 0; k < n; k++) {
          fx.glow.spawn(p.x, p.y, p.z, tx + rnd(-0.4, 0.4), rnd(2.5, 4), tz + rnd(-0.4, 0.4), rnd(0.8, 1.3), 0.4, 0.05, k % 2 ? pale : tc, hot, 1, 0.5, 0);
        }
      }
      if (s % 8 === 0) fx.ring(v2.set(pos.x, 0.3 + s * 0.12, pos.z), UP, 1, 7 + s * 0.15, 0.6, s % 16 ? tc : pale, 0.7, 0.9);
    });
  }
  fx.later(T, () => {
    const top = new THREE.Vector3(pos.x, 0.3 + steps * 0.12, pos.z);
    burst(fx, top, 260, 6, 20, 1.5, 0.35, 0.05, pale, tc, { grav: 4 });
    fx.flash(top, 22, 0.5, hot);
    fx.fireball(top, tc, pale, 1, 12, 0.5, 'shell', 0);
    fx.shake = Math.max(fx.shake, 1);
  });
  fx.flash(pos, 10, 0.4, tc);
  smokeBurst(fx, pos, 40, 1, 4, 2.5, 1.5, 4, fx.colors.smokeLight, fx.colors.smokeDark, 0.3);
}

// ------------------------------------------------------------------ Sport Drop explosions

function bubbles(fx, pos, tc) {
  const { pale, hot } = palette(tc);
  fx.flash(pos, 12, 0.3, pale);
  fx.ring(v2.set(pos.x, 0.06, pos.z), UP, 1, 12, 0.8, pale, 0.7, 0.85);
  // Big soft spheres that wobble upward and pop.
  const n = 34;
  for (let i = 0; i < n; i++) {
    const r = rnd(0.25, 0.8);
    const geo = new THREE.SphereGeometry(r, 18, 12);
    const mat = new THREE.MeshBasicMaterial({ color: (i % 3 ? tc : pale).clone().multiplyScalar(1.2), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos).add(v.set(rnd(-2, 2), rnd(-1, 1), rnd(-2, 2)));
    const vel = new THREE.Vector3(rnd(-3, 3), rnd(3, 7), rnd(-3, 3)).addScaledVector(fieldDir(pos), rnd(1, 4));
    const life = rnd(1.4, 3.2);
    const phase = rnd(0, 6);
    fx.temp(m, life, (dt, age) => {
      vel.multiplyScalar(Math.exp(-dt * 0.8));
      m.position.addScaledVector(vel, dt);
      m.position.x += Math.sin(age * 5 + phase) * 0.01;
      m.scale.setScalar(1 + Math.sin(age * 9 + phase) * 0.06);
      if (life - age < 0.08 && mat.opacity > 0) {
        burst(fx, m.position, 12, 2, 5, 0.4, 0.15, 0.02, pale, tc, { grav: 2 });
        mat.opacity = 0;
      }
    });
    fx.later(life + 0.1, () => {
      geo.dispose();
      mat.dispose();
    });
  }
  burst(fx, pos, 120, 3, 10, 1.4, 0.2, 0.05, pale, hot, { lift: 0.5, drag: 2, grav: -0.5 });
  fx.shake = Math.max(fx.shake, 0.5);
}

function petals(fx, pos, tc) {
  const pink = new THREE.Color(1, 0.62, 0.78);
  const white = new THREE.Color(1, 0.93, 0.96);
  const tint = tc.clone().lerp(pink, 0.6);
  fx.flash(pos, 14, 0.4, pink);
  // Petals: flat little cards that flutter down.
  const geo = new THREE.PlaneGeometry(0.22, 0.14);
  const mats = [pink, white, tint].map((c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, transparent: true, toneMapped: false }));
  const n = Math.round(220 * Math.max(0.4, fx.quality.particles));
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, pick(mats));
    m.position.copy(pos);
    const vel = randDir(new THREE.Vector3(), 1).multiplyScalar(rnd(6, 16));
    const spin = new THREE.Vector3(rnd(-8, 8), rnd(-8, 8), rnd(-8, 8));
    const life = rnd(2.5, 4.5);
    fx.temp(m, life, (dt, age) => {
      vel.multiplyScalar(Math.exp(-dt * 2.4));
      vel.y -= 1.6 * dt;
      m.position.addScaledVector(vel, dt);
      m.position.x += Math.sin(age * 3 + i) * 0.012;
      m.rotation.x += spin.x * dt;
      m.rotation.y += spin.y * dt;
      m.rotation.z += spin.z * dt;
      if (m.position.y < 0.05) m.position.y = 0.05;
    });
  }
  // Shared materials fade together near the end.
  fx.temp(new THREE.Object3D(), 4.6, (dt, age) => {
    for (const mt of mats) mt.opacity = Math.min(1, (4.6 - age) / 1.2);
  });
  fx.later(5, () => {
    geo.dispose();
    for (const m of mats) m.dispose();
  });
  fx.ring(v2.set(pos.x, 0.06, pos.z), UP, 1, 14, 1, pink, 0.6, 0.9);
  fx.fireball(pos, tint, white, 0.5, 4, 0.5, 'plasma', 0.4);
  fx.shake = Math.max(fx.shake, 0.4);
}

function cometShower(fx, pos, tc) {
  const { hot, pale } = palette(tc);
  const dir = fieldDir(pos);
  for (let c = 0; c < 9; c++) {
    const delay = c * 0.09;
    const target = pos.clone().add(v.set(rnd(-4, 4), rnd(-1, 1.5), rnd(-1, 1)));
    const start = target.clone().add(v.set(rnd(-8, 8), rnd(16, 22), -dir.z * rnd(4, 12)));
    const dur = 0.35;
    const steps = 9;
    for (let s = 0; s <= steps; s++) {
      fx.later(delay + (s / steps) * dur, () => {
        const p = start.clone().lerp(target, s / steps);
        fx.glow.spawn(p.x, p.y, p.z, 0, 0, 0, 0.45, 0.9, 0.1, WHITE, tc, 1, 0, 0);
        burst(fx, p, 4, 0.5, 2, 0.6, 0.25, 0.04, pale, tc, { grav: 0 });
      });
    }
    fx.later(delay + dur, () => {
      fx.flash(target, 9, 0.25, pale);
      streakBurst(fx, target, 40, 8, 20, 0.5, () => (Math.random() < 0.5 ? hot : WHITE), { lift: 0.3 });
      fx.ring(v2.set(target.x, 0.06, target.z), UP, 0.5, 5, 0.4, tc, 0.8, 0.85);
      fx.shake = Math.max(fx.shake, 0.6);
    });
  }
  fx.later(1.1, () => {
    fx.fireball(pos, tc, hot, 0.6, 6, 0.7, 'plasma', 0.8);
    fx.fireball(pos, tc, hot, 1, 14, 0.4, 'shell', 0);
    burst(fx, pos, 200, 6, 22, 1.2, 0.35, 0.06, hot, tc, { grav: 5 });
  });
}

function heartbeat(fx, pos, tc) {
  const red = new THREE.Color(1, 0.2, 0.35);
  const pink = new THREE.Color(1, 0.6, 0.75);
  const dir = fieldDir(pos);
  const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
  // Heart outline (parametric heart curve), two beats.
  const heart = (scale, life, color) => {
    const n = Math.round(160 * Math.max(0.5, fx.quality.particles));
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      const hx = 16 * Math.pow(Math.sin(t), 3);
      const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      const d = v.copy(side).multiplyScalar(hx / 16).addScaledVector(UP, hy / 16);
      fx.glow.spawn(pos.x, pos.y + 1.5, pos.z, d.x * scale, d.y * scale, d.z * scale, life, 0.5, 0.15, color, pink, 1, 2.2, 0);
    }
  };
  heart(9, 1.3, red);
  fx.flash(pos, 16, 0.3, red);
  fx.later(0.38, () => {
    heart(14, 1.5, pink);
    fx.flash(pos, 24, 0.35, pink);
    fx.ring(pos, dir, 1, 14, 0.7, red, 0.8, 0.9);
    fx.shake = Math.max(fx.shake, 0.8);
  });
  burst(fx, pos, 120, 2, 9, 1.8, 0.25, 0.06, pink, tc, { lift: 0.8, drag: 1.5, grav: 1.5 });
  fx.fireball(pos, red, pink, 0.4, 4, 0.5, 'plasma', 0.5);
}

// Phoenix: one fire bird bursts out of the goal, climbs, swoops low over the field leaving a trail
// of embers, then climbs again and burns out in a shower of sparks over midfield.
function phoenix(fx, pos, tc) {
  const fire = new THREE.Color(1, 0.42, 0.08).lerp(tc, 0.15);
  const gold = new THREE.Color(1, 0.84, 0.35);
  const ember = new THREE.Color(0.9, 0.15, 0.03);
  const dir = fieldDir(pos);
  const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
  const at = (f, u, s) => pos.clone().addScaledVector(dir, f).addScaledVector(UP, u).addScaledVector(side, s);
  const path = new THREE.CatmullRomCurve3([
    at(-1, 1, 0), at(3, 8, 0), at(12, 15, 5), at(24, 8, 3), at(33, 3.2, -3), at(42, 4, -1), at(50, 17, 2),
  ], false, 'centripetal');
  const T = 3.8;

  // Bird, built along +z (Object3D.lookAt points +z at the target).
  const g = new THREE.Group();
  const mats = [];
  const glowMat = (color, opacity = 1) => {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    mats.push(m);
    return m;
  };
  const geos = [];
  const keep = (geo) => (geos.push(geo), geo);
  const body = new THREE.Mesh(keep(new THREE.SphereGeometry(1, 16, 10)), glowMat(gold.clone().lerp(fire, 0.45), 0.9));
  body.scale.set(0.55, 0.5, 1.9);
  const head = new THREE.Mesh(keep(new THREE.SphereGeometry(0.42, 12, 8)), glowMat(gold, 0.95));
  head.position.set(0, 0.35, 2.0);
  const crest = new THREE.Mesh(keep(new THREE.ConeGeometry(0.16, 1.3, 6)), glowMat(fire));
  crest.position.set(0, 0.75, 1.55);
  crest.rotation.x = -2.2;
  g.add(body, head, crest);
  // Wings: a fan of feathers, gold at the root and red at the tips (vertex colors).
  function wingGeo() {
    const pts = [[0, 0], [1.5, 0.9], [3.5, 1.3], [5.6, 1.0], [7.4, 0.2], [6.6, -0.5], [5.4, -1.3], [4.0, -1.6], [2.6, -2.1], [1.2, -1.6], [0.2, -0.9]];
    const posA = [], colA = [];
    const cRoot = gold, cTip = ember;
    for (let i = 1; i < pts.length - 1; i++) {
      for (const [x, z] of [[0, 0], pts[i], pts[i + 1]]) {
        posA.push(x, 0, z * 0.9);
        const t = Math.min(1, Math.hypot(x, z) / 7.4);
        const c = cRoot.clone().lerp(fire, Math.min(1, t * 2.2)).lerp(cTip, Math.min(1, Math.max(0, t - 0.4) * 1.8)).multiplyScalar(0.85);
        colA.push(c.r, c.g, c.b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(posA, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colA, 3));
    return keep(geo);
  }
  const wMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  mats.push(wMat);
  const wings = [1, -1].map((s) => {
    const pivot = new THREE.Group();
    const m = new THREE.Mesh(wingGeo(), wMat);
    m.scale.x = s;
    pivot.add(m);
    pivot.position.set(s * 0.35, 0.15, 0.3);
    g.add(pivot);
    return { pivot, s };
  });
  // Tail: three long feathers.
  const tails = [-0.35, 0, 0.35].map((a, i) => {
    const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.7, 4.2)), glowMat(i === 1 ? fire : ember, 0.85));
    m.geometry.translate(0, -2.1, 0);
    m.rotation.x = Math.PI / 2;
    const pivot = new THREE.Group();
    pivot.position.set(0, 0, -1.6);
    pivot.rotation.y = a;
    pivot.add(m);
    g.add(pivot);
    return pivot;
  });
  g.position.copy(path.getPoint(0));
  g.scale.setScalar(0.01);

  // Burst out of the goal.
  fx.fireball(pos.clone().add(v.set(0, 1.5, 0)), fire, gold, 0.5, 4.5, 0.9, 'plasma', 3);
  fx.flash(pos.clone().add(v.set(0, 2, 0)), 22, 0.7, fire);
  smokeBurst(fx, pos, 50, 2, 6, 2.6, 1.5, 5, fx.colors.smokeExpl, fx.colors.smokeDark, 0.4, { lift: 0.8, grav: -1.5 });
  fx.ring(v2.set(pos.x, 0.06, pos.z), UP, 1, 16, 0.8, fire, 0.9, 0.9);
  fx.shake = Math.max(fx.shake, 1.0);

  const look = new THREE.Vector3();
  const tip = new THREE.Vector3();
  let done = false;
  fx.temp(g, T + 0.05, (dt, age) => {
    const t = Math.min(1, age / T);
    // Fast out of the goal, slower through the swoop, fast up at the end.
    const u = t < 0.25 ? t * 1.25 : t < 0.75 ? 0.3125 + (t - 0.25) * 0.95 : 0.7875 + (t - 0.75) * 0.85;
    path.getPoint(Math.min(1, u), g.position);
    path.getPoint(Math.min(1, u + 0.01), look);
    if (look.distanceToSquared(g.position) > 1e-6) g.lookAt(look);
    // Bank into the turns.
    const tan = path.getTangent(Math.min(1, u));
    g.rotateZ(-tan.dot(side) * 0.9);
    g.scale.setScalar(Math.min(1, age / 0.35) * 2.1);
    // Big slow flaps while climbing, gliding in the swoop.
    const glide = u > 0.42 && u < 0.72;
    const flap = Math.sin(age * (glide ? 4 : 10)) * (glide ? 0.12 : 0.65) + (glide ? -0.05 : 0.1);
    for (const w of wings) w.pivot.rotation.z = w.s * flap;
    tails.forEach((p, i) => (p.rotation.x = Math.sin(age * 7 + i) * 0.15));
    // Ember trail from the wing tips and the tail.
    const n = Math.max(1, Math.round(5 * fx.quality.particles));
    for (const w of wings) {
      tip.set(w.s * 7, 0, -0.4).applyMatrix4(w.pivot.matrixWorld);
      for (let k = 0; k < n; k++) fx.glow.spawn(tip.x, tip.y, tip.z, rnd(-1, 1), rnd(-1.5, 0.5), rnd(-1, 1), rnd(0.5, 1.1), 0.5, 0.05, k % 2 ? gold : fire, ember, 1, 1.5, 3);
    }
    tip.set(0, 0, -5).applyMatrix4(g.matrixWorld);
    for (let k = 0; k < n * 2; k++) fx.glow.spawn(tip.x, tip.y, tip.z, rnd(-1.5, 1.5), rnd(-2, 1), rnd(-1.5, 1.5), rnd(0.8, 1.6), 0.7, 0.08, fire, ember, 1, 1.2, 5);
    // Low over the field: sparks rain onto the grass.
    if (glide && Math.random() < 0.5) streakBurst(fx, g.position, 6, 4, 10, 0.6, () => (Math.random() < 0.5 ? gold : fire), { lift: -0.6 });
    // The end: it bursts into a shower of sparks.
    if (!done && age > T - 0.08) {
      done = true;
      const p = g.position.clone();
      fx.flash(p, 26, 0.6, gold);
      fx.fireball(p, fire, gold, 0.8, 6, 0.9, 'plasma', 1);
      burst(fx, p, 220, 4, 16, 1.6, 0.7, 0.06, () => (Math.random() < 0.5 ? gold : fire), ember, { grav: 5 });
      streakBurst(fx, p, 160, 12, 34, 1.1, () => (Math.random() < 0.5 ? gold : fire), { lift: 0.2 });
      fx.ring(p, dir, 1, 20, 0.8, gold, 0.9, 0.85);
      g.visible = false;
    }
  });
  fx.later(T + 0.2, () => { geos.forEach((x) => x.dispose()); mats.forEach((m) => m.dispose()); });
}

// Kraken: glowing tentacles burst up out of the goal, two hook over the crossbar and the rest wave
// at the field, then they all sink back down in a splash of light.
function kraken(fx, pos, tc) {
  const { pale, deep } = palette(tc);
  const skin = new THREE.Color(0.2, 0.05, 0.28).lerp(tc, 0.25);
  const glowC = tc.clone().lerp(new THREE.Color(0.2, 1, 0.85), 0.35);
  const dir = fieldDir(pos);
  const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
  const H = CROSSBAR;
  const N = 44; // segments per tentacle
  // Bases on the floor at the back of the goal. They come out under the crossbar, then rise in front
  // of the goal: the two "grab" ones hook back over the crossbar, the others curl toward the field.
  const arms = [
    { x: -6.6, back: 3.5, len: 15, grab: false, curl: 1.1, ph: 0.0 },
    { x: -2.4, back: 4.0, len: 15.5, grab: true, ph: 1.3 },
    { x: 2.4, back: 4.0, len: 15.5, grab: true, ph: 2.1 },
    { x: 6.6, back: 3.5, len: 15, grab: false, curl: 1.1, ph: 3.0 },
    { x: -4.5, back: 2.5, len: 17, grab: false, curl: 0.7, ph: 4.2, spread: -1 },
    { x: 4.5, back: 2.5, len: 17, grab: false, curl: 0.7, ph: 5.1, spread: 1 },
  ];
  const geo = new THREE.SphereGeometry(1, 12, 8);
  const mat = new THREE.MeshStandardMaterial({ color: skin, emissive: glowC, emissiveIntensity: 0.3, roughness: 0.3, metalness: 0.15 });
  const sucker = new THREE.MeshBasicMaterial({ color: pale, toneMapped: false });
  const mesh = new THREE.InstancedMesh(geo, mat, arms.length * N);
  const SUCK = Math.floor(N / 3);
  const dots = new THREE.InstancedMesh(geo, sucker, arms.length * SUCK);
  mesh.frustumCulled = false;
  dots.frustumCulled = false;
  const grp = new THREE.Group();
  grp.add(mesh, dots);
  const T = 3.4;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();
  const prev = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const inner = new THREE.Vector3();
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  const floor = pos.clone().addScaledVector(dir, -2.5).setY(0.1);
  fx.flash(floor.clone().setY(2), 24, 0.6, glowC);
  smokeBurst(fx, floor, 50, 2, 6, 2.2, 1.5, 5, pale, deep, 0.35, { lift: 0.9, grav: -1 });
  streakBurst(fx, floor, 120, 8, 20, 0.9, () => (Math.random() < 0.5 ? pale : glowC), { lift: 1.2 });
  fx.ring(v2.set(floor.x, 0.06, floor.z), UP, 1, 14, 0.8, glowC, 0.9, 0.85);
  fx.shake = Math.max(fx.shake, 1.2);

  let splashed = false;
  fx.temp(grp, T + 0.05, (dt, age) => {
    // Shoot out fast, hold, then pull back in.
    const grow = smooth(0, 0.7, age) * (1 - smooth(2.3, T, age));
    let k = 0, d = 0;
    for (const a of arms) {
      const L = a.len * grow;
      const ds = Math.max(0.001, L / N);
      p.copy(pos).addScaledVector(side, a.x).addScaledVector(dir, -a.back).setY(0.3);
      // Heading in the field/up plane: 0 = toward the field, PI/2 = up, PI = back over the goal.
      const sExit = a.back + 1.2; // out from under the crossbar
      const hook = smooth(0.5, 1.1, age);
      for (let i = 0; i < N; i++) {
        const sArc = (i + 0.5) * ds;
        let ang = 0.08 + (Math.PI / 2 - 0.08) * smooth(sExit, sExit + 2, sArc);
        if (a.grab) {
          // Up to just above the crossbar, then hook back over it.
          ang += (Math.PI * 0.92 - Math.PI / 2) * hook * smooth(sExit + H - 0.5, sExit + H + 2.2, sArc);
          ang += Math.sin(age * 4 + a.ph) * 0.05 * smooth(sExit + H, a.len, sArc);
        } else {
          // Curl toward the field near the tip, waving.
          const tipPart = smooth(sExit + 3, a.len, sArc);
          ang -= a.curl * tipPart * (0.7 + 0.3 * Math.sin(age * 2.5 + a.ph));
          ang += Math.sin(age * 3.2 + sArc * 0.6 + a.ph) * 0.35 * tipPart;
        }
        prev.copy(p);
        nrm.copy(dir).multiplyScalar(Math.cos(ang)).addScaledVector(UP, Math.sin(ang));
        p.addScaledVector(nrm, ds);
        if (a.spread) p.addScaledVector(side, a.spread * ds * 0.35 * smooth(sExit, sExit + 4, sArc));
        p.addScaledVector(side, Math.sin(age * 2.4 + sArc * 0.4 + a.ph) * 0.02 * sArc / Math.max(1, a.len) * 6);
        const f = i / (N - 1);
        const r = (0.72 * (1 - f * 0.88) + 0.06) * (0.5 + 0.5 * grow);
        fwd.copy(p).sub(prev);
        if (fwd.lengthSq() < 1e-8) fwd.copy(UP);
        fwd.normalize();
        q.setFromUnitVectors(UP, fwd);
        sc.set(r, Math.max(r, ds * 0.8), r);
        m4.compose(p, q, sc);
        mesh.setMatrixAt(k++, m4);
        // Suckers on the inner side of the curl.
        if (i % 3 === 1 && d < dots.count) {
          inner.crossVectors(fwd, side).normalize();
          if (!a.grab) inner.negate();
          v.copy(p).addScaledVector(inner, r * 0.78);
          sc.setScalar(r * 0.3);
          m4.compose(v, q, sc);
          dots.setMatrixAt(d++, m4);
        }
        if (i === N - 1 && grow > 0.3 && Math.random() < 0.4 * fx.quality.particles) fx.glow.spawn(p.x, p.y, p.z, rnd(-1, 1), rnd(-1, 0.5), rnd(-1, 1), rnd(0.5, 1), 0.35, 0.05, pale, glowC, 1, 1, 6);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    dots.instanceMatrix.needsUpdate = true;
    mat.emissiveIntensity = 0.25 + 0.15 * Math.sin(age * 8);
    if (!splashed && age > 2.55) {
      splashed = true;
      fx.flash(floor.clone().setY(1.5), 28, 0.7, glowC);
      burst(fx, floor.clone().setY(1), 200, 4, 14, 1.4, 0.6, 0.06, () => (Math.random() < 0.5 ? pale : glowC), deep, { lift: 1.1, grav: 9 });
      streakBurst(fx, floor, 140, 10, 26, 1, () => (Math.random() < 0.5 ? pale : glowC), { lift: 1.4 });
      fx.ring(v2.set(floor.x, 0.06, floor.z), UP, 1, 22, 0.9, pale, 0.9, 0.85);
      fx.shake = Math.max(fx.shake, 0.8);
    }
  });
  fx.later(T + 0.2, () => { geo.dispose(); mat.dispose(); sucker.dispose(); mesh.dispose(); dots.dispose(); });
}

function galaxy(fx, pos, tc) {
  const { pale, hot } = palette(tc);
  const violet = new THREE.Color(0.65, 0.4, 1);
  const center = pos.clone().add(v.set(0, 1.5, 0));
  fx.flash(center, 30, 0.9, violet);
  fx.fireball(center, violet, pale, 0.5, 3, 1.6, 'plasma', 0);
  // Spiral disk: stars launched along two arms with tangential speed, so the disk spins outward.
  const arms = 3;
  const n = Math.round(600 * fx.quality.particles);
  for (let i = 0; i < n; i++) {
    const arm = i % arms;
    const d = Math.random();
    const a = (arm / arms) * Math.PI * 2 + d * 5;
    const r = 0.5 + d * 2;
    const p = v.set(center.x + Math.cos(a) * r, center.y + rnd(-0.15, 0.15), center.z + Math.sin(a) * r);
    const sp = 3 + d * 10;
    const tx = -Math.sin(a) * sp * 0.7 + Math.cos(a) * sp * 0.6;
    const tz = Math.cos(a) * sp * 0.7 + Math.sin(a) * sp * 0.6;
    const c = Math.random() < 0.3 ? WHITE : Math.random() < 0.5 ? violet : tc;
    fx.glow.spawn(p.x, p.y, p.z, tx, rnd(-0.3, 0.3), tz, rnd(1.8, 3), rnd(0.15, 0.35), 0.05, c, pale, 1, 1.4, 0);
  }
  fx.ring(center, UP, 1, 16, 1.6, violet, 0.8, 0.95);
  fx.ring(center, UP, 1, 10, 1.2, hot, 0.6, 0.9);
  fx.later(1.4, () => {
    fx.flash(center, 26, 0.5, WHITE);
    fx.fireball(center, tc, pale, 1, 20, 0.6, 'shell', 0);
    streakBurst(fx, center, 200, 15, 40, 0.7, () => (Math.random() < 0.5 ? WHITE : violet));
    fx.shake = Math.max(fx.shake, 1.4);
  });
}

// Northern lights: three waving curtains of light rise behind the goal and fade.
function aurora(fx, pos, tc) {
  const { pale } = palette(tc);
  const cols = [new THREE.Color(0.25, 1, 0.55), new THREE.Color(0.3, 0.85, 1), new THREE.Color(0.7, 0.4, 1), tc];
  const dir = fieldDir(pos);
  const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
  fx.flash(pos, 18, 0.6, cols[0]);
  fx.ring(v2.set(pos.x, 0.06, pos.z), UP, 1, 14, 1.0, cols[1], 0.7, 0.9);
  for (let c = 0; c < 3; c++) {
    fx.later(c * 0.22, () => {
      const color = cols[(c + 1) % cols.length];
      const back = 1.0 + c * 1.4; // in front of the goal so the net does not hide it
      const n = Math.round(220 * fx.quality.particles) + 30;
      for (let i = 0; i < n; i++) {
        const u = (i / n) * 2 - 1;
        const x = pos.x + side.x * u * 9;
        const z = pos.z + side.z * u * 9 + dir.z * back + Math.sin(u * 5 + c * 2) * 0.9;
        const y = pos.y + rnd(-0.5, 0.5);
        const up = rnd(6, 13) * (1 - Math.abs(u) * 0.45);
        fx.glow.spawn(x, y, z, 0, up, 0, rnd(1.6, 2.6), rnd(0.6, 1.1), 0.25, Math.random() < 0.2 ? WHITE : color, i % 3 ? cols[3] : pale, 0.7, 0.7, -0.5);
      }
    });
  }
  burst(fx, pos, 160, 3, 12, 1.4, 0.3, 0.05, () => pick(cols), WHITE, { lift: 0.9, drag: 1.6, grav: 1 });
  fx.shake = Math.max(fx.shake, 0.6);
}

// Solar eclipse: a dark disc slides over a blazing corona, a diamond-ring flash, then the blast.
// Achievement item (150 saves).
function eclipse(fx, pos, tc) {
  const { hot, pale } = palette(tc);
  const dir = fieldDir(pos);
  const center = pos.clone().add(v.set(0, 2.2, 0)).addScaledVector(dir, 0.5);
  const sun = new THREE.Color(1, 0.85, 0.5);
  const R = 2.4;
  const hold = 0.9;
  // Corona: particles circling the rim, plus slow rays pushed outward.
  const n = Math.round(420 * fx.quality.particles) + 40;
  const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = R * rnd(1.0, 1.25);
    const ox = Math.cos(a) * r;
    const oy = Math.sin(a) * r;
    const px = center.x + side.x * ox;
    const pz = center.z + side.z * ox;
    const out = rnd(0.2, 1.6);
    fx.glow.spawn(px, center.y + oy, pz, side.x * Math.cos(a) * out, Math.sin(a) * out, side.z * Math.cos(a) * out, rnd(hold * 0.8, hold * 1.3), rnd(0.25, 0.6), 0.1, Math.random() < 0.5 ? sun : pale, tc, 1, 0.6, 0);
  }
  fx.flash(center, 22, hold, sun);
  fx.ring(center, dir, R * 0.95, R * 1.4, hold, sun, 0.9, 0.86);
  // The dark disc, facing the field, slides in from the side and stays.
  const geo = new THREE.CircleGeometry(R, 48);
  const mat = new THREE.MeshBasicMaterial({ color: 0x020203, side: THREE.DoubleSide, toneMapped: false });
  const disc = new THREE.Mesh(geo, mat);
  disc.lookAt(dir);
  disc.position.copy(center).addScaledVector(dir, 0.3).addScaledVector(side, R * 1.6);
  const target = center.clone().addScaledVector(dir, 0.3);
  fx.temp(disc, hold + 0.12, (dt, age) => {
    const t = Math.min(1, age / (hold * 0.7));
    disc.position.lerpVectors(v.copy(center).addScaledVector(dir, 0.3).addScaledVector(side, R * 1.6), target, 1 - (1 - t) ** 3);
  });
  fx.later(hold + 0.2, () => {
    geo.dispose();
    mat.dispose();
  });
  // Diamond ring: one bright point on the rim just before the blast.
  fx.later(hold * 0.75, () => {
    const p = center.clone().add(v.set(0, R * 0.95, 0));
    fx.flash(p, 9, 0.35, WHITE);
    fx.flash(p, 4, 0.5, sun);
  });
  fx.later(hold, () => {
    fx.flash(center, 40, 0.5, WHITE);
    fx.fireball(center, tc, sun, 1, 22, 0.6, 'shell', 0);
    fx.fireball(center, sun, WHITE, 0.6, 6, 0.5, 'plasma', 0);
    fx.ring(center, dir, R, 28, 0.9, sun, 1, 0.95);
    fx.ring(v2.set(pos.x, 0.06, pos.z), UP, 1, 22, 0.8, tc, 0.9, 0.93);
    streakBurst(fx, center, 300, 20, 55, 0.7, () => (Math.random() < 0.5 ? sun : hot));
    burst(fx, center, 260, 6, 26, 1.4, 0.35, 0.06, () => (Math.random() < 0.4 ? WHITE : sun), tc, { grav: 2 });
    smokeBurst(fx, pos, 50, 2, 6, 2.5, 1.5, 5, fx.colors.smokeExpl, fx.colors.smokeDark, 0.4);
    fx.shake = Math.max(fx.shake, 1.7);
  });
}

// Thunderdome: a cage of lightning bolts slams down in a ring around the goal, then the dome
// above it bursts. Achievement item (100 demolitions).
function thunderdome(fx, pos, tc) {
  const { hot, pale } = palette(tc);
  const ground = pos.y > 1 ? pos.y - 1 : 0.1;
  const bolt = (from, to, size = 0.55) => {
    let prev = from.clone();
    const steps = 10;
    for (let s = 1; s <= steps; s++) {
      const p = from.clone().lerp(to, s / steps);
      if (s < steps) p.add(v.set(rnd(-0.6, 0.6), rnd(-0.3, 0.3), rnd(-0.6, 0.6)));
      for (let d = 0; d < 6; d++) {
        const q = prev.clone().lerp(p, d / 6);
        fx.glow.spawn(q.x, q.y, q.z, 0, 0, 0, rnd(0.18, 0.3), size, 0.25, WHITE, pale, 1, 0, 0);
      }
      prev = p;
    }
    fx.flash(to, 7, 0.2, pale);
    burst(fx, to, 20, 3, 9, 0.4, 0.2, 0.03, WHITE, tc, { lift: 0.8, grav: 6 });
  };
  const top = pos.clone().add(v.set(0, 7, 0));
  const N = 8;
  const R = 5.5;
  for (let i = 0; i < N; i++) {
    fx.later(i * 0.06, () => {
      const a = (i / N) * Math.PI * 2;
      const foot = new THREE.Vector3(pos.x + Math.cos(a) * R, ground, pos.z + Math.sin(a) * R);
      bolt(top, foot);
      fx.later(0.12, () => bolt(top, foot, 0.4));
    });
  }
  fx.flash(top, 14, 0.6, pale);
  fx.ring(v2.set(pos.x, 0.06, pos.z), UP, R, R + 0.4, 0.8, pale, 1, 0.9);
  // The cage collapses into the middle and the dome blows.
  fx.later(0.65, () => {
    fx.flash(pos, 36, 0.45, WHITE);
    fx.fireball(pos, tc, hot, 1, 20, 0.55, 'shell', 0);
    fx.fireball(pos, pale, WHITE, 0.5, 6, 0.45, 'plasma', 0.5);
    fx.ring(v2.set(pos.x, 0.06, pos.z), UP, 1, 26, 0.8, tc, 1, 0.94);
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      bolt(pos.clone(), pos.clone().add(v.set(Math.cos(a) * 7, rnd(2, 6), Math.sin(a) * 7)), 0.45);
    }
    streakBurst(fx, pos, 260, 18, 50, 0.6, () => (Math.random() < 0.5 ? WHITE : hot));
    smokeBurst(fx, pos, 70, 2, 8, 2.6, 1.5, 5.5, fx.colors.smokeExpl, fx.colors.smokeDark, 0.5);
    fx.shake = Math.max(fx.shake, 2);
  });
}

// ------------------------------------------------------------------ second wave of explosions

// Tsunami: a wall of water rises out of the goal and rolls across the field.
function tsunami(fx, pos, tc) {
  const water = new THREE.Color(0.25, 0.7, 1).lerp(tc, 0.25);
  const foam = new THREE.Color(0.9, 0.97, 1);
  const dir = fieldDir(pos);
  const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
  fx.flash(pos, 16, 0.4, water);
  for (let s = 0; s < 22; s++) {
    fx.later(s * 0.04, () => {
      const n = Math.round(45 * fx.quality.particles) + 6;
      for (let i = 0; i < n; i++) {
        const u = rnd(-1, 1);
        const x = pos.x + side.x * u * 12;
        const z = pos.z + side.z * u * 12;
        const sp = rnd(14, 20);
        const up = rnd(4, 9) * (1 - Math.abs(u) * 0.4);
        const c = Math.random() < 0.35 ? foam : water;
        fx.glow.spawn(x, 0.3, z, dir.x * sp, up, dir.z * sp, rnd(0.9, 1.5), rnd(0.8, 1.5), 0.3, c, water, 0.85, 0.6, 7);
      }
      if (s % 3 === 0) {
        const x0 = pos.x + rnd(-8, 8) * side.x;
        const z0 = pos.z + rnd(-8, 8) * side.z;
        fx.smoke.spawn(x0, 0.6, z0, dir.x * 15, 3, dir.z * 15, 1.4, 2.5, 7, foam, water, 0.45, 0.8, 1);
      }
    });
  }
  fx.ring(v2.set(pos.x, 0.06, pos.z), UP, 1, 20, 1.1, foam, 0.8, 0.9);
  streakBurst(fx, pos, 160, 10, 26, 0.9, () => (Math.random() < 0.5 ? foam : water), { lift: 0.8, grav: 9 });
  fx.shake = Math.max(fx.shake, 1);
}

// Popcorn: a pan of kernels pops all over the goal.
function popcorn(fx, pos, tc) {
  const butter = new THREE.Color(1, 0.88, 0.45);
  const white = new THREE.Color(1, 0.98, 0.9);
  for (let i = 0; i < 16; i++) {
    fx.later(i * 0.06 + rnd(0, 0.04), () => {
      const p = pos.clone().add(v.set(rnd(-4, 4), rnd(-1, 2), rnd(-2, 2)));
      cubes(fx, p, [white, butter, white], 14, 14, 0.42, 2.4);
      fx.flash(p, 5, 0.15, white);
      burst(fx, p, 10, 2, 5, 0.3, 0.2, 0.02, white, butter, { grav: 4 });
    });
  }
  fx.flash(pos, 12, 0.3, butter);
  fx.ring(v2.set(pos.x, 0.06, pos.z), UP, 1, 10, 0.6, butter, 0.8, 0.85);
  fx.shake = Math.max(fx.shake, 0.4);
}

// Balloons: a bunch of team-colored balloons floats up, then they all pop.
function balloons(fx, pos, tc) {
  const cols = [tc, WHITE, GOLD, tc.clone().lerp(WHITE, 0.5)];
  const geo = new THREE.SphereGeometry(0.8, 18, 14);
  geo.scale(1, 1.22, 1);
  const mats = cols.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, metalness: 0.1, emissive: c, emissiveIntensity: 0.35 }));
  const n = 36;
  for (let i = 0; i < n; i++) {
    const mat = mats[i % mats.length];
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos).add(v.set(rnd(-3, 3), rnd(-0.5, 0.5), rnd(-2, 2)));
    const vel = new THREE.Vector3(rnd(-3, 3), rnd(4, 7), rnd(-2, 2)).addScaledVector(fieldDir(pos), rnd(2, 5));
    const life = rnd(1.6, 2.3);
    const ph = rnd(0, 6);
    let popped = false;
    fx.temp(m, life, (dt, age) => {
      m.position.addScaledVector(vel, dt);
      m.rotation.z = Math.sin(age * 3 + ph) * 0.25;
      if (!popped && life - age < 0.06) {
        popped = true;
        m.visible = false;
        burst(fx, m.position, 30, 4, 11, 0.5, 0.3, 0.04, mat.color, WHITE, { grav: 6 });
        fx.flash(m.position, 4.5, 0.15, mat.color);
      }
    });
  }
  fx.later(2.5, () => {
    geo.dispose();
    for (const mt of mats) mt.dispose();
  });
  fx.flash(pos, 14, 0.35, WHITE);
  burst(fx, pos, 120, 4, 12, 1.6, 0.18, 0.15, () => pick(cols), null, { lift: 1, drag: 2, grav: 2.5 });
  fx.shake = Math.max(fx.shake, 0.5);
}

// Pinball: glowing balls shoot out and ricochet off the floor, each bounce a spark.
function pinball(fx, pos, tc) {
  const { hot, pale } = palette(tc);
  const geo = new THREE.SphereGeometry(0.5, 14, 10);
  const mat = new THREE.MeshBasicMaterial({ color: hot.clone().multiplyScalar(2), toneMapped: false });
  for (let i = 0; i < 22; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos);
    const vel = randDir(new THREE.Vector3(), 0.7).multiplyScalar(rnd(13, 22)).addScaledVector(fieldDir(pos), 6);
    const life = rnd(1.8, 2.5);
    fx.temp(m, life, (dt) => {
      vel.y -= 16 * dt;
      m.position.addScaledVector(vel, dt);
      if (m.position.y < 0.5) {
        m.position.y = 0.5;
        vel.y = Math.abs(vel.y) * 0.8;
        streakBurst(fx, m.position, 12, 5, 13, 0.35, pale, { lift: 1 });
        fx.flash(m.position, 4, 0.15, hot);
        fx.ring(v.set(m.position.x, 0.06, m.position.z), UP, 0.3, 2.5, 0.3, hot, 0.8, 0.8);
      }
      if (Math.random() < 0.6) fx.glow.spawn(m.position.x, m.position.y, m.position.z, 0, 0, 0, 0.35, 0.55, 0.04, pale, tc, 0.8, 0, 0);
    });
  }
  fx.later(2.6, () => {
    geo.dispose();
    mat.dispose();
  });
  fx.fireball(pos, tc, hot, 0.4, 4, 0.4, 'plasma', 0);
  fx.flash(pos, 14, 0.3, pale);
  fx.shake = Math.max(fx.shake, 0.6);
}

// Glitch: the goal breaks into digital blocks that flicker in and out.
function glitch(fx, pos, tc) {
  const cyan = new THREE.Color(0.2, 1, 0.95);
  const mag = new THREE.Color(1, 0.2, 0.85);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mats = [tc, cyan, mag, WHITE].map((c) => new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(1.6), toneMapped: false, transparent: true, opacity: 0.85 }));
  const n = Math.round(60 * Math.max(0.4, fx.quality.particles));
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, pick(mats));
    const sx = rnd(0.2, 2.6);
    m.scale.set(sx, rnd(0.08, 0.6), rnd(0.1, 0.4));
    const home = pos.clone().add(v.set(rnd(-6, 6), rnd(-1, 5), rnd(-2, 2)));
    m.position.copy(home);
    const life = rnd(0.6, 1.6);
    fx.temp(m, life, () => {
      m.visible = Math.random() < 0.7;
      if (Math.random() < 0.15) m.position.copy(home).add(v.set(rnd(-1.5, 1.5), 0, 0));
    });
  }
  fx.later(1.7, () => {
    geo.dispose();
    for (const mt of mats) mt.dispose();
  });
  fx.flash(pos, 18, 0.3, cyan);
  fx.later(0.15, () => fx.flash(pos, 14, 0.2, mag));
  streakBurst(fx, pos, 140, 20, 40, 0.4, () => (Math.random() < 0.5 ? cyan : mag), { lift: 0 });
  fx.shake = Math.max(fx.shake, 0.8);
}

// Quake: the ground splits open in glowing cracks that race out from the goal.
function quake(fx, pos, tc) {
  const { hot } = palette(tc);
  const lava = new THREE.Color(1, 0.45, 0.1).lerp(tc, 0.3);
  const ground = new THREE.Vector3(pos.x, 0.08, pos.z);
  for (let c = 0; c < 9; c++) {
    let a = (c / 9) * Math.PI * 2 + rnd(-0.2, 0.2);
    let p = ground.clone();
    for (let s = 0; s < 16; s++) {
      fx.later(s * 0.03, () => {
        a += rnd(-0.35, 0.35);
        const next = p.clone().add(v.set(Math.cos(a) * 1.1, 0, Math.sin(a) * 1.1));
        for (let d = 0; d < 4; d++) {
          const q = p.clone().lerp(next, d / 4);
          fx.glow.spawn(q.x, 0.1, q.z, 0, rnd(0, 0.6), 0, rnd(1.2, 1.8), 0.45, 0.2, hot, lava, 1, 0, 0);
        }
        if (s % 4 === 0) fx.smoke.spawn(next.x, 0.3, next.z, rnd(-0.5, 0.5), rnd(2, 4), rnd(-0.5, 0.5), 1.5, 1, 3, fx.colors.dust, fx.colors.smokeDark, 0.45, 1, -0.3);
        p = next;
      });
    }
  }
  cubes(fx, ground, [new THREE.Color(0.3, 0.26, 0.22), new THREE.Color(0.2, 0.18, 0.16), lava], 50, 14, 0.35, 2.2);
  fx.fireball(pos, lava, hot, 0.6, 6, 0.8, 'plasma', 1);
  fx.flash(pos, 22, 0.6, lava);
  smokeBurst(fx, ground, 90, 3, 9, 3, 2, 6, fx.colors.dust, fx.colors.smokeDark, 0.55, { lift: 0.6 });
  fx.shake = Math.max(fx.shake, 2.4);
}

// Solar flare: a loop of plasma arcs over the goal and snaps.
function solarFlare(fx, pos, tc) {
  const sun = new THREE.Color(1, 0.75, 0.25);
  const { hot, pale } = palette(tc);
  const dir = fieldDir(pos);
  const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
  const steps = 30;
  for (let s = 0; s <= steps; s++) {
    fx.later((s / steps) * 0.6, () => {
      const t = s / steps;
      const a = t * Math.PI;
      for (const loop of [0, 1]) {
        const R = 6 + loop * 2;
        const p = v.copy(pos).addScaledVector(side, Math.cos(a) * R).addScaledVector(UP, Math.sin(a) * R * 0.9).addScaledVector(dir, 1 + loop);
        const n = Math.round(6 * fx.quality.particles) + 2;
        for (let k = 0; k < n; k++) fx.glow.spawn(p.x, p.y, p.z, rnd(-0.5, 0.5), rnd(-0.3, 0.6), rnd(-0.5, 0.5), rnd(0.6, 1.1), rnd(0.5, 0.9), 0.1, loop ? pale : sun, tc, 1, 0.5, 0);
      }
    });
  }
  fx.flash(pos, 26, 0.8, sun);
  fx.later(0.65, () => {
    const top = pos.clone().addScaledVector(UP, 6);
    fx.flash(top, 30, 0.5, WHITE);
    fx.fireball(top, sun, pale, 1, 16, 0.6, 'shell', 0);
    streakBurst(fx, top, 260, 18, 50, 0.7, () => (Math.random() < 0.5 ? sun : hot));
    burst(fx, top, 200, 6, 22, 1.4, 0.35, 0.05, sun, tc, { grav: 4 });
    fx.shake = Math.max(fx.shake, 1.4);
  });
}

// Warp: streaks of light rush into the goal as if jumping to light speed, then it blinks out.
function warp(fx, pos, tc) {
  const { pale, hot } = palette(tc);
  const n = Math.round(500 * fx.quality.particles) + 50;
  for (let i = 0; i < n; i++) {
    randDir(v, 0.1);
    const r = rnd(18, 40);
    const p = v2.copy(pos).addScaledVector(v, r);
    const t = rnd(0.5, 0.9);
    fx.streaks.spawn(p.x, p.y, p.z, -v.x * (r / t), -v.y * (r / t), -v.z * (r / t), t, 0.06, Math.random() < 0.5 ? WHITE : pale, 0, 0);
  }
  fx.flash(pos, 10, 0.9, pale);
  fx.later(0.9, () => {
    fx.flash(pos, 40, 0.35, WHITE);
    fx.fireball(pos, tc, pale, 1, 20, 0.45, 'shell', 0);
    fx.ring(pos, fieldDir(pos), 1, 30, 0.6, pale, 1, 0.97);
    burst(fx, pos, 260, 10, 36, 1, 0.3, 0.04, WHITE, hot, { grav: 0, drag: 1.5 });
    fx.shake = Math.max(fx.shake, 1.6);
  });
}

// Portal: a spinning ring opens in front of the goal, sucks in light, then sprays it back out.
function portal(fx, pos, tc) {
  const { pale, hot } = palette(tc);
  const green = new THREE.Color(0.3, 1, 0.6).lerp(tc, 0.3);
  const dir = fieldDir(pos);
  const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
  const center = pos.clone().add(v.set(0, 1.5, 0)).addScaledVector(dir, 1.5);
  const R = 3.2;
  const T = 1.3;
  for (let s = 0; s < 40; s++) {
    fx.later((s / 40) * T, () => {
      const n = Math.round(14 * fx.quality.particles) + 3;
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const rr = R * Math.min(1, (s + 4) / 12) * rnd(0.92, 1.05);
        const p = v.copy(center).addScaledVector(side, Math.cos(a) * rr).addScaledVector(UP, Math.sin(a) * rr);
        const tx = -Math.sin(a) * 5;
        const ty = Math.cos(a) * 5;
        fx.glow.spawn(p.x, p.y, p.z, side.x * tx, ty, side.z * tx, rnd(0.25, 0.45), rnd(0.25, 0.45), 0.05, Math.random() < 0.5 ? green : pale, tc, 1, 1, 0);
      }
    });
  }
  fx.ring(center, dir, 0.3, R, 0.4, green, 1, 0.85);
  fx.flash(center, 10, T, green);
  fx.later(T, () => {
    fx.flash(center, 30, 0.4, WHITE);
    fx.ring(center, dir, R, 22, 0.8, green, 1, 0.94);
    const n = Math.round(300 * fx.quality.particles) + 30;
    for (let i = 0; i < n; i++) {
      const sp = rnd(12, 36);
      const d = v.copy(dir).addScaledVector(side, rnd(-0.6, 0.6)).addScaledVector(UP, rnd(-0.3, 0.7)).normalize();
      fx.glow.spawn(center.x, center.y, center.z, d.x * sp, d.y * sp, d.z * sp, rnd(0.8, 1.4), 0.35, 0.05, Math.random() < 0.5 ? green : hot, tc, 1, 1.4, 3);
    }
    fx.shake = Math.max(fx.shake, 1.3);
  });
}

// Big Bang: everything goes dark, one point of light, then a whole universe expands out of it.
function bigBang(fx, pos, tc) {
  const { pale } = palette(tc);
  const cols = [WHITE, pale, tc, new THREE.Color(0.6, 0.4, 1), new THREE.Color(1, 0.6, 0.3), new THREE.Color(0.3, 0.8, 1)];
  const T = 0.8;
  fx.flash(pos, 2, T, WHITE);
  fx.later(T * 0.6, () => fx.flash(pos, 4, T * 0.4, WHITE));
  fx.later(T, () => {
    fx.flash(pos, 24, 0.4, WHITE);
    fx.fireball(pos, pale, tc, 0.5, 24, 0.8, 'shell', 0);
    fx.later(0.1, () => fx.fireball(pos, tc, pale, 0.5, 26, 0.9, 'shell', 0));
    for (let k = 0; k < 5; k++) {
      const n = randDir(new THREE.Vector3()).clone();
      fx.ring(pos, n, 1, 30 + k * 6, 1.4, cols[k % cols.length], 0.9, 0.96);
    }
    // Galaxies: small spinning clumps flung out in every direction.
    for (let g = 0; g < 10; g++) {
      const d = randDir(new THREE.Vector3(), 0.2);
      const c = pick(cols);
      const sp = rnd(10, 22);
      const m = Math.round(40 * fx.quality.particles) + 6;
      for (let i = 0; i < m; i++) fx.glow.spawn(pos.x, pos.y, pos.z, d.x * sp + rnd(-2, 2), d.y * sp + rnd(-2, 2), d.z * sp + rnd(-2, 2), rnd(1.8, 2.6), rnd(0.2, 0.45), 0.05, c, WHITE, 1, 0.8, 0);
    }
    burst(fx, pos, 900, 4, 50, 3, 0.2, 0.06, () => pick(cols), null, { drag: 1, grav: 0 });
    streakBurst(fx, pos, 400, 30, 90, 0.9, () => pick(cols));
    fx.shake = Math.max(fx.shake, 2.6);
  });
}

// ------------------------------------------------------------------ full-screen parts
// What each explosion does to the whole picture (see screenFx.js). Arguments: the ScreenFx, the
// blast position, the team color. Times match the effects above.
const R = (t, at, len, r1, amp) => env.ripple(t, at, len, r1, amp);
const { up, down, pulse } = env;
const ICE = new THREE.Color(0.6, 0.85, 1);
const FIRE = new THREE.Color(1, 0.45, 0.12);
const VIOLET = new THREE.Color(0.55, 0.25, 1);
const SCREEN = {
  classic: (sf, pos, tc) => sf.add(pos, 1.2, (t) => ({ ...R(t, 0, 0.9, 1.4, 0.05), bulge: 0.18 * pulse(t, 0, 0.35), flash: 0.5 * pulse(t, 0, 0.3), chroma: 0.6 * pulse(t, 0, 0.5), vig: 0.35 * pulse(t, 0, 1.1) }), tc),
  fireworks: (sf, pos, tc) => {
    const cols = [tc, GOLD, WHITE, tc.clone().lerp(WHITE, 0.7)];
    sf.add(pos, 2.4, (t) => {
      let f = 0;
      for (let i = 0; i < 9; i++) f += pulse(t, 0.55 + i * 0.09, 0.25);
      return { flash: 0.12 * f, flashColor: cols[Math.floor(t * 7) % cols.length], vig: 0.25 * f };
    }, tc);
  },
  supernova: (sf, pos, tc) => sf.add(pos, 2.2, (t) => ({
    flash: 0.8 * pulse(t, 0, 0.4) + 0.15 * pulse(t, 0.15, 0.6), flashColor: WHITE,
    bulge: 0.45 * pulse(t, 0, 0.6), ...R(t, 0.05, 1.3, 1.8, 0.09), zoom: 0.9 * pulse(t, 0, 0.7),
    chroma: 1.4 * pulse(t, 0, 1), vig: 0.6 * pulse(t, 0.2, 2), tintA: 0.25 * pulse(t, 0.3, 1.8),
  }), tc),
  shockwave: (sf, pos, tc) => sf.add(pos, 1.8, (t) => {
    let best = { ripR: 0, ripA: 0 };
    for (let i = 0; i < 4; i++) {
      const r = R(t, i * 0.14, 0.9, 1.3 + i * 0.25, 0.09);
      if (Math.abs(r.ripA) > Math.abs(best.ripA)) best = r;
    }
    return { ...best, chroma: 0.7 * pulse(t, 0, 1), flash: 0.25 * pulse(t, 0, 0.25) };
  }, tc),
  inferno: (sf, pos) => sf.add(pos, 3.2, (t) => ({ haze: 1.6 * up(t, 0, 0.3) * down(t, 2, 3.2), vig: 0.45 * up(t, 0, 0.4) * down(t, 1.6, 3.2), tintA: 0.15 * up(t, 0, 0.3) * down(t, 1.5, 3), flash: 0.35 * pulse(t, 0, 0.4) }), FIRE),
  frost: (sf, pos) => sf.add(pos, 3.2, (t) => ({ vig: 1.1 * up(t, 0, 0.25) * down(t, 2.2, 3.2), tintA: 0.35 * up(t, 0, 0.2) * down(t, 1.8, 3.2), hue: -0.25 * up(t, 0, 0.3) * down(t, 2, 3.2), ...R(t, 0, 0.8, 1.2, 0.05), flash: 0.5 * pulse(t, 0, 0.3), flashColor: ICE }), ICE),
  lightning: (sf, pos, tc) => {
    const hits = Array.from({ length: 6 }, (_, i) => i * 0.14 + Math.random() * 0.04);
    sf.add(pos, 1.6, (t) => {
      let f = 0;
      for (const h of hits) f += pulse(t, h, 0.09);
      return { dark: 0.45 * up(t, 0, 0.05) * down(t, 0.9, 1.5), flash: 0.9 * f, flashColor: WHITE, chroma: 1.2 * f, zoom: 0.3 * f };
    }, tc);
  },
  blackhole: (sf, pos, tc) => sf.add(pos, BH_BLAST + 1.3, (t) => {
    const blast = t >= BH_BLAST;
    if (!blast) {
      const pull = up(t, 0.2, BH_PULL);
      const hole = t < BH_PULL ? 0.02 + 0.1 * up(t, 0, BH_PULL) : 0.12 * down(t, BH_PULL, BH_BLAST) + 0.01;
      return {
        pinch: Math.min(0.995, pull * pull * pull * 1.03),
        swirl: 11 * Math.pow(up(t, 0, BH_PULL), 1.5),
        hole, rimColor: tc.clone().lerp(VIOLET, 0.4),
        dark: 0.3 * up(t, 0.2, BH_PULL),
        chroma: 0.8 * up(t, 0.4, BH_PULL),
        stars: 0.6 * up(t, 0.5, BH_PULL),
      };
    }
    const k = t - BH_BLAST;
    // Thrown back out: the picture snaps back past normal (a bulge), with a ripple and a white flash.
    return {
      pinch: 0.995 * down(k, 0, 0.16),
      swirl: -4 * down(k, 0, 0.3),
      bulge: 0.75 * pulse(k, 0.05, 0.7),
      ...R(k, 0.05, 1.1, 1.9, 0.12),
      flash: 0.9 * pulse(k, 0, 0.35),
      flashColor: WHITE,
      chroma: 2 * pulse(k, 0, 1),
      zoom: pulse(k, 0, 0.6),
      vig: 0.7 * pulse(k, 0.1, 1.2),
    };
  }, tc),
  confetti: (sf, pos, tc) => sf.add(pos, 1.4, (t) => ({ hue: 0.6 * Math.sin(t * 9) * pulse(t, 0, 1.4), flash: 0.25 * (pulse(t, 0, 0.2) + pulse(t, 0.18, 0.2) + pulse(t, 0.36, 0.2)), bulge: 0.08 * pulse(t, 0, 0.4) }), tc),
  geyser: (sf, pos, tc) => sf.add(pos, 2.4, (t) => ({ haze: 0.9 * up(t, 0, 0.2) * down(t, 1.2, 2), ...R(t, 1.25, 0.9, 1.2, 0.06), flash: 0.4 * pulse(t, 1.25, 0.35), vig: 0.4 * up(t, 0, 0.3) * down(t, 1.5, 2.4) }), tc),
  rainbow: (sf, pos, tc) => sf.add(pos, 2.2, (t) => ({ hue: 6.283 * up(t, 0, 2.2), ...R(t, 0, 1.2, 1.5, 0.06), chroma: 0.8 * pulse(t, 0, 1.6), flash: 0.3 * pulse(t, 0, 0.3) }), tc),
  voxel: (sf, pos, tc) => sf.add(pos, 1.6, (t) => ({ pixel: 0.9 * up(t, 0, 0.06) * down(t, 0.3, 1.5), flash: 0.4 * pulse(t, 0, 0.25), bulge: 0.12 * pulse(t, 0, 0.4) }), tc),
  starburst: (sf, pos, tc) => sf.add(pos, 1.6, (t) => ({ zoom: 1 * pulse(t, 0, 1.1), flash: 0.8 * pulse(t, 0, 0.35), chroma: 0.8 * pulse(t, 0, 1), vig: 0.4 * pulse(t, 0.1, 1.4) }), tc),
  meteor: (sf, pos, tc) => sf.add(pos, 2.2, (t) => {
    const k = t - 0.42;
    return { dark: 0.4 * up(t, 0, 0.2) * down(t, 0.42, 0.6), ...R(k, 0, 1, 1.6, 0.11), bulge: 0.35 * pulse(k, 0, 0.5), flash: 0.6 * pulse(k, 0, 0.35), flashColor: FIRE, zoom: 0.7 * pulse(k, 0, 0.6), haze: 0.8 * pulse(k, 0.1, 1.6), chroma: 1 * pulse(k, 0, 0.8) };
  }, FIRE),
  vortex: (sf, pos, tc) => sf.add(pos, 1.9, (t) => ({ swirl: 3.5 * up(t, 0, 1.2) * down(t, 1.2, 1.5), flash: 0.5 * pulse(t, 1.2, 0.35), ...R(t, 1.2, 0.7, 1.1, 0.06), vig: 0.35 * up(t, 0, 0.6) * down(t, 1.2, 1.9) }), tc),
  bubbles: (sf, pos, tc) => sf.add(pos, 2.6, (t) => ({ haze: 1.2 * up(t, 0, 0.3) * down(t, 1.8, 2.6), bulge: 0.12 * Math.sin(t * 6) * down(t, 1.5, 2.6), vig: 0.3 * down(t, 1, 2.6) }), tc),
  petals: (sf, pos) => sf.add(pos, 3.5, (t) => ({ vig: 0.5 * up(t, 0, 0.4) * down(t, 2.2, 3.5), tintA: 0.12 * up(t, 0, 0.4) * down(t, 2, 3.5), flash: 0.25 * pulse(t, 0, 0.3) }), new THREE.Color(1, 0.62, 0.78)),
  cometshower: (sf, pos, tc) => sf.add(pos, 1.8, (t) => {
    let f = 0;
    for (let c = 0; c < 9; c++) f += pulse(t, c * 0.09 + 0.35, 0.15);
    return { flash: 0.18 * f, chroma: 0.5 * f, ...R(t, 1.1, 0.7, 1.2, 0.07), bulge: 0.2 * pulse(t, 1.1, 0.4) };
  }, tc),
  heartbeat: (sf, pos) => sf.add(pos, 1.8, (t) => ({ bulge: 0.2 * pulse(t, 0, 0.25) + 0.3 * pulse(t, 0.38, 0.3), vig: 0.6 * pulse(t, 0, 0.35) + 0.8 * pulse(t, 0.38, 0.6), flash: 0.2 * pulse(t, 0.38, 0.2) }), new THREE.Color(1, 0.2, 0.35)),
  phoenix: (sf, pos) => sf.add(pos, 2.6, (t) => ({ haze: 0.25 * up(t, 0, 0.3) * down(t, 1.6, 2.6), vig: 0.7 * up(t, 0, 0.3) * down(t, 1.4, 2.6), tintA: 0.2 * up(t, 0, 0.3) * down(t, 1.2, 2.4), flash: 0.5 * pulse(t, 0, 0.4) }), FIRE),
  galaxy: (sf, pos, tc) => sf.add(pos, 2.4, (t) => ({ dark: 0.55 * up(t, 0, 0.4) * down(t, 1.4, 1.6), stars: 1.2 * up(t, 0, 0.4) * down(t, 1.4, 1.8), swirl: 2.2 * up(t, 0, 1.4) * down(t, 1.4, 1.7), flash: 0.6 * pulse(t, 1.4, 0.35), flashColor: WHITE, ...R(t, 1.4, 0.9, 1.6, 0.08) }), VIOLET),
  aurora: (sf, pos) => sf.add(pos, 2.8, (t) => ({ vig: 0.8 * up(t, 0, 0.4) * down(t, 1.8, 2.8), tintA: 0.15 * up(t, 0, 0.4) * down(t, 1.8, 2.8), hue: 0.4 * Math.sin(t * 2.5) * down(t, 1.5, 2.8), haze: 0.4 * down(t, 1, 2.8) }), new THREE.Color(0.25, 1, 0.55)),
  eclipse: (sf, pos, tc) => sf.add(pos, 2.4, (t) => {
    const k = t - 0.9;
    return { dark: 0.75 * up(t, 0, 0.8) * down(t, 0.9, 1.0), stars: 0.8 * up(t, 0.3, 0.85) * down(t, 0.9, 1), flash: 0.85 * pulse(k, 0, 0.4), flashColor: new THREE.Color(1, 0.85, 0.5), ...R(k, 0, 1.2, 1.7, 0.1), bulge: 0.4 * pulse(k, 0, 0.6), chroma: 1.2 * pulse(k, 0, 0.8) };
  }, tc),
  tsunami: (sf, pos) => sf.add(pos, 2, (t) => ({ haze: 1.4 * up(t, 0, 0.3) * down(t, 1, 2), ...R(t, 0, 1.4, 1.8, 0.08), tintA: 0.2 * up(t, 0, 0.3) * down(t, 1, 2), vig: 0.5 * up(t, 0, 0.3) * down(t, 1, 2) }), new THREE.Color(0.3, 0.75, 1)),
  popcorn: (sf, pos) => sf.add(pos, 1.2, (t) => {
    let f = 0;
    for (let i = 0; i < 16; i++) f += pulse(t, i * 0.06, 0.08);
    return { bulge: 0.04 * f, flash: 0.06 * f };
  }, new THREE.Color(1, 0.9, 0.5)),
  balloons: (sf, pos, tc) => sf.add(pos, 2.4, (t) => ({ flash: 0.35 * pulse(t, 0, 0.3) + 0.4 * pulse(t, 1.7, 0.4), bulge: 0.15 * pulse(t, 1.7, 0.4), hue: 0.3 * Math.sin(t * 4) * down(t, 1.5, 2.4) }), tc),
  pinball: (sf, pos, tc) => sf.add(pos, 2.2, (t) => ({ flash: 0.3 * pulse(t, 0, 0.3), chroma: 0.4 * down(t, 0, 2), vig: 0.4 * Math.abs(Math.sin(t * 9)) * down(t, 1, 2.2) }), tc),
  glitch: (sf, pos, tc) => sf.add(pos, 1.6, (t) => {
    const j = Math.floor(t * 20);
    const on = (j * 7919) % 5 < 2 ? 1 : 0;
    const k = down(t, 0.9, 1.6);
    return { pixel: 0.55 * on * k, chroma: (1.5 + on * 2) * k, hue: on * 1.2 * k, ...R(t, 0, 0.3, 0.8, 0.05 * on) };
  }, tc),
  quake: (sf, pos) => sf.add(pos, 2, (t) => ({ ...R(t, 0, 1.2, 1.6, 0.12), haze: 0.8 * pulse(t, 0, 1.8), bulge: -0.2 * pulse(t, 0, 0.4), dark: 0.2 * pulse(t, 0, 1.5), flash: 0.35 * pulse(t, 0, 0.3) }), new THREE.Color(1, 0.5, 0.15)),
  solarflare: (sf, pos) => sf.add(pos, 1.8, (t) => ({ vig: 0.7 * up(t, 0, 0.3) * down(t, 0.8, 1.8), haze: 0.9 * up(t, 0, 0.3) * down(t, 1, 1.8), flash: 0.7 * pulse(t, 0.65, 0.35), zoom: 0.6 * pulse(t, 0.65, 0.6), chroma: 0.9 * pulse(t, 0.65, 0.9) }), new THREE.Color(1, 0.75, 0.25)),
  warp: (sf, pos, tc) => sf.add(pos, 1.9, (t) => ({ zoom: 1 * up(t, 0, 0.85) * (t < 0.9 ? 1 : 0), pinch: 0.45 * up(t, 0.2, 0.9) * (t < 0.9 ? 1 : 0), chroma: 2 * up(t, 0, 0.85) * down(t, 0.9, 1.4), flash: 0.9 * pulse(t, 0.9, 0.35), flashColor: WHITE, bulge: 0.5 * pulse(t, 0.9, 0.5), ...R(t, 0.9, 0.9, 1.7, 0.09) }), tc),
  portal: (sf, pos, tc) => sf.add(pos, 2.1, (t) => ({ swirl: 2.5 * up(t, 0, 1.3) * down(t, 1.3, 1.45), pinch: 0.25 * up(t, 0.3, 1.3) * down(t, 1.3, 1.4), bulge: 0.55 * pulse(t, 1.3, 0.6), flash: 0.6 * pulse(t, 1.3, 0.3), ...R(t, 1.3, 0.8, 1.6, 0.1), vig: 0.6 * up(t, 0, 0.5) * down(t, 1.3, 2.1) }), new THREE.Color(0.3, 1, 0.6)),
  bigbang: (sf, pos, tc) => sf.add(pos, 3, (t) => {
    const k = t - 0.8;
    return {
      dark: 0.92 * up(t, 0, 0.25) * down(t, 0.8, 0.85),
      stars: 0.6 * up(t, 0.2, 0.6) * down(t, 0.8, 0.9) + 0.9 * up(k, 0.3, 0.8) * down(k, 1.4, 2.2),
      flash: 0.55 * pulse(k, 0, 0.35), flashColor: WHITE,
      bulge: 0.8 * pulse(k, 0, 0.7), zoom: pulse(k, 0, 0.8), chroma: 2.2 * pulse(k, 0, 1.2),
      hue: 6.283 * up(k, 0, 2.2) * down(k, 1.6, 2.2),
      ...R(k, 0.05, 1.4, 2, 0.13),
    };
  }, tc),
  thunderdome: (sf, pos, tc) => sf.add(pos, 1.8, (t) => {
    let f = 0;
    for (let i = 0; i < 8; i++) f += pulse(t, i * 0.06, 0.08);
    const k = t - 0.65;
    return { dark: 0.5 * up(t, 0, 0.05) * down(t, 0.65, 0.75), flash: 0.4 * f + 0.8 * pulse(k, 0, 0.35), flashColor: WHITE, chroma: 0.6 * f + 1.5 * pulse(k, 0, 0.8), ...R(k, 0, 1, 1.7, 0.11), bulge: 0.35 * pulse(k, 0, 0.5) };
  }, tc),
};

export const GOAL_EXPLOSIONS = [
  { id: 'classic', name: 'Classic', blurb: 'Fireball, shock ring and embers.', fn: classic },
  { id: 'fireworks', name: 'Fireworks', blurb: 'Rockets that burst over the goal.', fn: fireworks },
  { id: 'supernova', name: 'Supernova', blurb: 'White-hot flash and huge light rings.', fn: supernova },
  { id: 'shockwave', name: 'Shockwave', blurb: 'Four rings rip across the floor.', fn: shockwave },
  { id: 'inferno', name: 'Inferno', blurb: 'A rolling column of fire and smoke.', fn: inferno },
  { id: 'frost', name: 'Frost', blurb: 'Ice shards, then snow drifts down.', fn: frost },
  { id: 'lightning', name: 'Lightning', blurb: 'Bolts strike the goal from above.', fn: lightning },
  { id: 'blackhole', name: 'Black Hole', blurb: 'Swallows the whole arena, then blows it back out.', fn: blackHole },
  { id: 'confetti', name: 'Confetti', blurb: 'Party cannon, three waves.', fn: confetti },
  { id: 'geyser', name: 'Geyser', blurb: 'A fountain of light shoots up.', fn: geyser },
  { id: 'rainbow', name: 'Rainbow', blurb: 'Seven colored rings ripple out.', fn: rainbow },
  { id: 'voxel', name: 'Voxel', blurb: 'Glowing cubes tumble and bounce.', fn: voxel },
  { id: 'starburst', name: 'Starburst', blurb: 'Rays of light in a star shape.', fn: starburst },
  { id: 'meteor', name: 'Meteor', blurb: 'A burning rock hits the goal.', fn: meteor },
  { id: 'vortex', name: 'Vortex', blurb: 'A spiral twister that pops at the top.', fn: vortex },
  { id: 'bubbles', name: 'Bubbles', blurb: 'Glowing bubbles float up and pop.', fn: bubbles },
  { id: 'petals', name: 'Petals', blurb: 'A cloud of petals flutters down.', fn: petals },
  { id: 'cometshower', name: 'Comet Shower', blurb: 'Nine comets rain into the goal.', fn: cometShower },
  { id: 'heartbeat', name: 'Heartbeat', blurb: 'Two heart-shaped pulses.', fn: heartbeat },
  { id: 'phoenix', name: 'Phoenix', blurb: 'A fire bird flies out of the goal and swoops over the field.', fn: phoenix },
  { id: 'kraken', name: 'Kraken', blurb: 'Glowing tentacles burst out and grab the crossbar.', fn: kraken },
  { id: 'galaxy', name: 'Galaxy', blurb: 'A spinning spiral of stars, then a flash.', fn: galaxy },
  { id: 'aurora', name: 'Aurora', blurb: 'Curtains of northern lights rise and wave.', fn: aurora },
  { id: 'eclipse', name: 'Eclipse', blurb: 'A dark moon covers a blazing sun, then it blows.', fn: eclipse },
  { id: 'thunderdome', name: 'Thunderdome', blurb: 'A cage of lightning slams down around the goal.', fn: thunderdome },
  { id: 'tsunami', name: 'Tsunami', blurb: 'A wall of water rolls out of the goal.', fn: tsunami },
  { id: 'popcorn', name: 'Popcorn', blurb: 'Kernels pop all over the goal.', fn: popcorn },
  { id: 'balloons', name: 'Balloons', blurb: 'A bunch of balloons floats up and pops.', fn: balloons },
  { id: 'pinball', name: 'Pinball', blurb: 'Glowing balls ricochet off the floor.', fn: pinball },
  { id: 'glitch', name: 'Glitch', blurb: 'The goal breaks into flickering digital blocks.', fn: glitch },
  { id: 'quake', name: 'Quake', blurb: 'Glowing cracks split the ground open.', fn: quake },
  { id: 'solarflare', name: 'Solar Flare', blurb: 'A loop of plasma arcs over the goal and snaps.', fn: solarFlare },
  { id: 'warp', name: 'Warp Speed', blurb: 'Light rushes in like a jump to hyperspace.', fn: warp },
  { id: 'portal', name: 'Portal', blurb: 'A spinning portal opens and sprays light out.', fn: portal },
  { id: 'bigbang', name: 'Big Bang', blurb: 'Darkness, one point of light, then a whole universe.', fn: bigBang },
];

export const EXPLOSION_IDS = GOAL_EXPLOSIONS.map((e) => e.id);

export function playGoalExplosion(fx, id, pos, teamColor) {
  const e = GOAL_EXPLOSIONS.find((x) => x.id === id) || GOAL_EXPLOSIONS[0];
  const tc = new THREE.Color(teamColor);
  e.fn(fx, pos.clone(), tc);
  if (fx.screen && SCREEN[e.id]) SCREEN[e.id](fx.screen, pos.clone(), tc);
}
