// Particles, ribbons, flames and explosions.
import * as THREE from 'three';
import { playGoalExplosion } from './goalExplosions.js';

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const col = new THREE.Color();
const tmpCol = new THREE.Color();

// CPU-simulated point particles drawn in one draw call per pool.
class ParticlePool {
  constructor(max, additive, kind) {
    this.max = max;
    this.count = 0;
    this.kind = kind; // 0 = glow, 1 = smoke
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.size1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 3);
    this.c1 = new Float32Array(max * 3);
    this.a0 = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.seed = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('pcolor', this.aCol);
    g.setAttribute('psize', this.aSize);
    g.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 600 }, uKind: { value: kind } },
      vertexShader: /* glsl */ `
        attribute vec4 pcolor;
        attribute vec2 psize;
        uniform float uScale;
        varying vec4 vColor;
        varying float vSeed;
        void main() {
          vColor = pcolor;
          vSeed = psize.y;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float depth = -mv.z;
          gl_PointSize = clamp(psize.x * uScale / max(0.1, depth), 1.0, 220.0);
          // Fade particles that are about to touch the lens so they never fill the screen.
          vColor.a *= smoothstep(0.6, 2.2, depth);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uKind;
        varying vec4 vColor;
        varying float vSeed;
        float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float n(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float r = length(p) * 2.0;
          float a;
          if (uKind < 0.5) {
            a = smoothstep(1.0, 0.0, r);
            a *= a;
          } else {
            float puff = n(p * 5.0 + vSeed * 17.0) * 0.6 + n(p * 11.0 - vSeed * 9.0) * 0.4;
            a = smoothstep(1.0, 0.3, r + (puff - 0.5) * 0.7);
          }
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor.rgb, vColor.a * a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
  }

  spawn(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, alpha, drag = 1, grav = 0) {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.size0[i] = s0; this.size1[i] = s1;
    this.c0[i * 3] = c0.r; this.c0[i * 3 + 1] = c0.g; this.c0[i * 3 + 2] = c0.b;
    this.c1[i * 3] = c1.r; this.c1[i * 3 + 1] = c1.g; this.c1[i * 3 + 2] = c1.b;
    this.a0[i] = alpha; this.drag[i] = drag; this.grav[i] = grav;
    this.seed[i] = Math.random();
  }

  update(dt) {
    let n = this.count;
    const P = this.aPos.array;
    const C = this.aCol.array;
    const S = this.aSize.array;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // Swap-remove.
        n--;
        this.copy(n, i);
        i--;
        continue;
      }
      const k = Math.exp(-this.drag[i] * dt);
      this.v[i * 3] *= k;
      this.v[i * 3 + 1] = this.v[i * 3 + 1] * k - this.grav[i] * dt;
      this.v[i * 3 + 2] *= k;
      this.p[i * 3] += this.v[i * 3] * dt;
      this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt;
      this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      P[i * 3] = this.p[i * 3]; P[i * 3 + 1] = this.p[i * 3 + 1]; P[i * 3 + 2] = this.p[i * 3 + 2];
      C[i * 4] = this.c0[i * 3] + (this.c1[i * 3] - this.c0[i * 3]) * t;
      C[i * 4 + 1] = this.c0[i * 3 + 1] + (this.c1[i * 3 + 1] - this.c0[i * 3 + 1]) * t;
      C[i * 4 + 2] = this.c0[i * 3 + 2] + (this.c1[i * 3 + 2] - this.c0[i * 3 + 2]) * t;
      // Fade in fast, fade out over the second half.
      C[i * 4 + 3] = this.a0[i] * Math.min(1, t * 12) * (t < 0.4 ? 1 : 1 - (t - 0.4) / 0.6);
      S[i * 2] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      S[i * 2 + 1] = this.seed[i];
    }
    this.count = n;
    this.points.geometry.setDrawRange(0, n);
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
    this.aSize.needsUpdate = true;
  }

  copy(from, to) {
    for (let k = 0; k < 3; k++) {
      this.p[to * 3 + k] = this.p[from * 3 + k];
      this.v[to * 3 + k] = this.v[from * 3 + k];
      this.c0[to * 3 + k] = this.c0[from * 3 + k];
      this.c1[to * 3 + k] = this.c1[from * 3 + k];
    }
    this.life[to] = this.life[from];
    this.maxLife[to] = this.maxLife[from];
    this.size0[to] = this.size0[from];
    this.size1[to] = this.size1[from];
    this.a0[to] = this.a0[from];
    this.drag[to] = this.drag[from];
    this.grav[to] = this.grav[from];
    this.seed[to] = this.seed[from];
  }

  clear() {
    this.count = 0;
    this.points.geometry.setDrawRange(0, 0);
  }
}

// Fast sparks drawn as thin camera-facing quads stretched along their velocity (reads as motion).
// Width is in meters with a 1.5 px minimum, so streaks stay visible far away without getting fat up close.
const CORNERS = [0, -1, 0, 1, 1, -1, 1, -1, 0, 1, 1, 1];
class StreakPool {
  constructor(max) {
    this.max = max;
    this.count = 0;
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.c = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.len = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aHead = new THREE.BufferAttribute(new Float32Array(max * 18), 3).setUsage(THREE.DynamicDrawUsage);
    this.aTail = new THREE.BufferAttribute(new Float32Array(max * 18), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(new Float32Array(max * 24), 4).setUsage(THREE.DynamicDrawUsage);
    const corner = new Float32Array(max * 12);
    for (let i = 0; i < max; i++) corner.set(CORNERS, i * 12);
    g.setAttribute('position', this.aHead);
    g.setAttribute('aTail', this.aTail);
    g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    g.setAttribute('scolor', this.aCol);
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, // quad winding flips with the streak's screen direction
      uniforms: { uWidth: { value: 0.035 }, uRes: { value: new THREE.Vector2(1280, 720) } },
      vertexShader: /* glsl */ `
        attribute vec3 aTail;
        attribute vec2 aCorner;
        attribute vec4 scolor;
        uniform float uWidth;
        uniform vec2 uRes;
        varying vec4 vC;
        varying float vSide;
        void main() {
          vec4 h = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          vec4 t = projectionMatrix * modelViewMatrix * vec4(aTail, 1.0);
          vec2 d = (t.xy / t.w - h.xy / h.w) * vec2(uRes.x / uRes.y, 1.0);
          float L = length(d);
          d = L > 1e-6 ? d / L : vec2(1.0, 0.0);
          vec2 n = vec2(-d.y, d.x) * vec2(uRes.y / uRes.x, 1.0);
          vec4 p = aCorner.x < 0.5 ? h : t;
          float w = max(uWidth * projectionMatrix[1][1], 2.0 / uRes.y * p.w);
          p.xy += n * w * aCorner.y;
          vC = scolor;
          vC.a *= aCorner.x < 0.5 ? 1.0 : 0.0;
          vSide = aCorner.y;
          gl_Position = p;
        }`,
      fragmentShader: /* glsl */ `
        varying vec4 vC;
        varying float vSide;
        void main() {
          float edge = 1.0 - abs(vSide);
          gl_FragColor = vec4(vC.rgb * vC.a * (0.35 + edge), 1.0);
        }`,
    });
    this.lines = new THREE.Mesh(g, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 6;
  }

  // len: how many seconds of travel the streak covers.
  spawn(x, y, z, vx, vy, vz, life, len, color, drag = 1.5, grav = 9.8) {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.c[i * 3] = color.r; this.c[i * 3 + 1] = color.g; this.c[i * 3 + 2] = color.b;
    this.life[i] = life; this.maxLife[i] = life;
    this.len[i] = len; this.drag[i] = drag; this.grav[i] = grav;
  }

  update(dt) {
    let n = this.count;
    const H = this.aHead.array;
    const T = this.aTail.array;
    const C = this.aCol.array;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        n--;
        for (let k = 0; k < 3; k++) {
          this.p[i * 3 + k] = this.p[n * 3 + k];
          this.v[i * 3 + k] = this.v[n * 3 + k];
          this.c[i * 3 + k] = this.c[n * 3 + k];
        }
        this.life[i] = this.life[n]; this.maxLife[i] = this.maxLife[n];
        this.len[i] = this.len[n]; this.drag[i] = this.drag[n]; this.grav[i] = this.grav[n];
        i--;
        continue;
      }
      const k = Math.exp(-this.drag[i] * dt);
      const j = i * 3;
      this.v[j] *= k;
      this.v[j + 1] = this.v[j + 1] * k - this.grav[i] * dt;
      this.v[j + 2] *= k;
      this.p[j] += this.v[j] * dt;
      this.p[j + 1] += this.v[j + 1] * dt;
      this.p[j + 2] += this.v[j + 2] * dt;
      const L = this.len[i];
      const hx = this.p[j], hy = this.p[j + 1], hz = this.p[j + 2];
      const tx = hx - this.v[j] * L, ty = hy - this.v[j + 1] * L, tz = hz - this.v[j + 2] * L;
      const a = this.life[i] / this.maxLife[i];
      const r = this.c[j] * 1.3, g = this.c[j + 1] * 1.3, b = this.c[j + 2] * 1.3;
      for (let q = 0; q < 6; q++) {
        const o = (i * 6 + q) * 3;
        H[o] = hx; H[o + 1] = hy; H[o + 2] = hz;
        T[o] = tx; T[o + 1] = ty; T[o + 2] = tz;
        const oc = (i * 6 + q) * 4;
        C[oc] = r; C[oc + 1] = g; C[oc + 2] = b; C[oc + 3] = a;
      }
    }
    this.count = n;
    this.lines.geometry.setDrawRange(0, n * 6);
    this.aHead.needsUpdate = true;
    this.aTail.needsUpdate = true;
    this.aCol.needsUpdate = true;
  }

  clear() {
    this.count = 0;
    this.lines.geometry.setDrawRange(0, 0);
  }
}

// Camera-facing ribbon that follows a moving point.
// Camera-facing trail. maxLen caps its length in meters so it stays short at any speed;
// it fades out close to the camera so a trail passing under the lens never fills the screen.
export class Ribbon {
  constructor(length, width, color, opacity = 0.8, maxLen = Infinity, near = [0.8, 3.0]) {
    this.n = length;
    this.width = width;
    this.maxLen = maxLen;
    this.pts = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(length * 2 * 3);
    this.alpha = new Float32Array(length * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < length - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uNear: { value: new THREE.Vector2(near[0], near[1]) } },
      vertexShader: `
        attribute float alpha;
        uniform vec2 uNear;
        varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vA = alpha * smoothstep(uNear.x, uNear.y, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: 'uniform vec3 uColor; uniform float uOpacity; varying float vA; void main(){ gl_FragColor = vec4(uColor * vA * uOpacity, 1.0); }',
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.active = false;
    this.strength = 0;
  }

  push(p) {
    this.pts.unshift(p.clone());
    if (this.pts.length > this.n) this.pts.pop();
  }

  update(dt, camPos, emitting, point) {
    this.strength += ((emitting ? 1 : 0) - this.strength) * Math.min(1, dt * 6);
    if (emitting && point) this.push(point);
    else if (this.pts.length) this.pts.pop();
    // Drop points past the length cap.
    let s = 0;
    for (let i = 1; i < this.pts.length; i++) {
      s += this.pts[i].distanceTo(this.pts[i - 1]);
      if (s > this.maxLen) {
        this.pts.length = i + 1;
        break;
      }
    }
    const m = this.pts.length;
    const span = Math.min(s, this.maxLen) || 1;
    let along = 0;
    for (let i = 0; i < this.n; i++) {
      if (m < 2) {
        this.alpha[i * 2] = this.alpha[i * 2 + 1] = 0;
        continue;
      }
      const ii = Math.min(i, m - 1);
      const p = this.pts[ii];
      if (i > 0 && i < m) along += p.distanceTo(this.pts[ii - 1]);
      const prev = this.pts[Math.max(0, ii - 1)];
      const next = this.pts[Math.min(m - 1, ii + 1)];
      tmp.subVectors(prev, next);
      if (tmp.lengthSq() < 1e-8) tmp.set(0, 0, 1);
      tmp2.subVectors(camPos, p);
      tmp.cross(tmp2);
      if (tmp.lengthSq() < 1e-10) tmp.set(0, 1, 0);
      tmp.normalize();
      // Taper and fade by distance along the trail, so length and look do not depend on frame rate.
      const t = Math.min(1, along / span);
      const w = this.width * (1 - t * 0.7);
      this.pos[i * 6] = p.x + tmp.x * w; this.pos[i * 6 + 1] = p.y + tmp.y * w; this.pos[i * 6 + 2] = p.z + tmp.z * w;
      this.pos[i * 6 + 3] = p.x - tmp.x * w; this.pos[i * 6 + 4] = p.y - tmp.y * w; this.pos[i * 6 + 5] = p.z - tmp.z * w;
      const a = (1 - t) * (1 - t) * this.strength * (i < m ? 1 : 0);
      this.alpha[i * 2] = this.alpha[i * 2 + 1] = a;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.alpha.needsUpdate = true;
    this.mesh.visible = m > 1;
  }
}

// Boost flame cone (child of a car body). Points along -x.
// boost: a boost item from meta/items.js (colors), or null for the standard team-tinted flame.
export function createFlame(teamColor, boost = null) {
  const team = new THREE.Color(teamColor);
  const std = !boost || boost.id === 'standard';
  const hot = new THREE.Color(std ? 0xfff2d8 : boost.hot);
  const mid = std ? new THREE.Color(1.0, 0.55, 0.15).lerp(team, 0.35) : new THREE.Color(boost.mid);
  const tail = new THREE.Color(std ? new THREE.Color(0.9, 0.18, 0.05) : boost.tail);
  const geo = new THREE.ConeGeometry(0.06, 0.55, 16, 8, true);
  // Base at the nozzle (x = 0), tip 0.55 m behind it (x = -0.55).
  geo.translate(0, 0.275, 0);
  geo.rotateZ(Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uPower: { value: 0 }, uHot: { value: hot }, uMid: { value: mid }, uTail: { value: tail }, uRainbow: { value: boost?.rainbow ? 1 : 0 }, uDark: { value: boost?.dark ? 1 : 0 } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uPower;
      varying float vT;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vT = clamp(-position.x / 0.55, 0.0, 1.0);
        vec3 p = position;
        float wob = sin(uTime * 60.0 + vT * 12.0) * 0.012 * vT;
        p.y += wob;
        p.x *= 0.65 + 0.55 * uPower + 0.12 * sin(uTime * 45.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uPower;
      uniform float uTime;
      uniform vec3 uHot;
      uniform vec3 uMid;
      uniform vec3 uTail;
      uniform float uRainbow;
      uniform float uDark;
      varying float vT;
      varying vec3 vN;
      varying vec3 vV;
      vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
      void main() {
        float core = pow(abs(dot(vN, vV)), 1.5);
        vec3 mid = uRainbow > 0.5 ? hue(uTime * 0.6 + vT * 0.8) : uMid;
        vec3 tail = uRainbow > 0.5 ? hue(uTime * 0.6 + 0.5) : uTail;
        vec3 c = mix(uHot, mid, smoothstep(0.0, 0.45, vT));
        c = mix(c, tail, smoothstep(0.45, 1.0, vT));
        float a = (1.0 - vT) * core * uPower;
        gl_FragColor = vec4(c * a * (uDark > 0.5 ? 1.6 : 2.4), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

// Billowing fireball / shock shell: a noise-displaced sphere with a hot core and team-colored edges.
let fireGeo = null;
const FIRE_GLSL = /* glsl */ `
  float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float vnoise3(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm3(vec3 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise3(p); p *= 2.03; a *= 0.5; } return s; }
`;

// kind: 'plasma' (glowing body, additive), 'smoke' (dark billowing cloud) or 'shell' (shock front rim).
function fireMaterial(color, hot, kind) {
  const shell = kind === 'shell';
  const smoke = kind === 'smoke';
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: smoke ? THREE.NormalBlending : THREE.AdditiveBlending,
    side: shell ? THREE.FrontSide : THREE.DoubleSide,
    uniforms: {
      uT: { value: 0 },
      uSeed: { value: Math.random() * 20 },
      uColor: { value: new THREE.Color(color) },
      uHot: { value: new THREE.Color(hot) },
      uOpacity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      uniform float uT;
      uniform float uSeed;
      varying vec3 vN;
      varying vec3 vV;
      varying float vNoise;
      ${FIRE_GLSL}
      void main() {
        vec3 p = position;
        float n = fbm3(p * 2.2 + vec3(uSeed) + vec3(0.0, -uT * 3.0, uT * 1.5));
        vNoise = n;
        ${shell ? '' : `p *= 1.0 + (n - 0.5) * ${smoke ? '0.6' : '0.35'};`}
        vec4 w = modelMatrix * vec4(p, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uT;
      uniform vec3 uColor;
      uniform vec3 uHot;
      uniform float uOpacity;
      varying vec3 vN;
      varying vec3 vV;
      varying float vNoise;
      void main() {
        float facing = abs(dot(normalize(vN), normalize(vV)));
        vec3 c;
        float a;
        ${shell ? `
        a = pow(1.0 - facing, 5.0);
        c = uColor * 2.2 + uHot * 0.4;` : smoke ? `
        // Soot lit from inside by the team color early on.
        float d = vNoise;
        c = mix(vec3(0.045, 0.045, 0.055), uColor * 0.22, 0.6) * (0.7 + d);
        c += uColor * 0.8 * pow(facing, 3.0) * (1.0 - smoothstep(0.0, 0.45, uT));
        a = smoothstep(0.0, 0.5, facing) * smoothstep(0.2, 0.55, d + facing * 0.25);` : `
        // Hot where the noise is high and the surface faces the camera; white core early, team color after.
        // Kept below ~1.5 so tone mapping does not wash the team color out to white; bloom adds the glow.
        float heat = clamp(vNoise * 1.7 + facing * 0.8 - 0.65 - uT * 1.1, 0.0, 1.0);
        c = mix(uColor * 0.95, uHot * 1.35, heat);
        c += vec3(1.1) * heat * heat * heat * heat * max(0.0, 1.0 - uT * 3.0);
        a = smoothstep(0.0, 0.5, facing) * (0.35 + 0.65 * heat);`}
        gl_FragColor = vec4(c, a * uOpacity);
      }`,
  });
}

export class Effects {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    const scale = quality.particles;
    this.glow = new ParticlePool(Math.floor(5000 * scale), true, 0);
    this.smoke = new ParticlePool(Math.floor(2500 * scale), false, 1);
    this.streaks = new StreakPool(Math.floor(1500 * scale));
    scene.add(this.glow.points, this.smoke.points, this.streaks.lines);
    this.rings = [];
    this.flashes = [];
    this.fireballs = [];
    this.shake = 0;
    this.debris = [];
    this.debrisGeo = new THREE.BoxGeometry(0.12, 0.05, 0.08);
    this.debrisMat = new THREE.MeshStandardMaterial({ color: 0x22252b, roughness: 0.6, metalness: 0.5 });
    this.timers = []; // { t, fn }: run fn after t seconds (multi-stage goal explosions)
    this.temps = []; // { obj, age, life, fn }: meshes with their own update, removed after life
    this.colors = COLORS;
  }

  later(delay, fn) {
    this.timers.push({ t: delay, fn });
  }

  temp(obj, life, fn) {
    this.scene.add(obj);
    this.temps.push({ obj, age: 0, life, fn });
  }

  setViewport(height, fovDeg) {
    // Point size scale: pixels per meter at distance 1.
    const s = height / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.glow.points.material.uniforms.uScale.value = s;
    this.smoke.points.material.uniforms.uScale.value = s;
    this.streaks.mat.uniforms.uRes.value.set(height * (this.aspect || 16 / 9), height);
  }

  // ----- emitters
  // boostItem: the car's boost (meta/items.js) or null for the standard look.
  boost(worldPos, backDir, carVel, team, dt, supersonic, boostItem = null) {
    const std = !boostItem || boostItem.id === 'standard';
    let edge = team === 0 ? COLORS.blueHot : COLORS.orangeHot;
    if (std) col.setRGB(1.0, 0.75, 0.35);
    else {
      col.set(boostItem.spark);
      edge = tmpCol.set(boostItem.mid);
      if (boostItem.rainbow) edge = tmpCol.setHSL((performance.now() / 1000 * 0.6) % 1, 1, 0.55);
    }
    const n = Math.max(1, Math.round(dt * 150 * this.quality.particles));
    for (let i = 0; i < n; i++) {
      const sp = 5 + Math.random() * 5;
      const jx = (Math.random() - 0.5) * 1.2;
      const jy = (Math.random() - 0.5) * 1.2;
      const jz = (Math.random() - 0.5) * 1.2;
      this.glow.spawn(
        worldPos.x + (Math.random() - 0.5) * 0.04, worldPos.y + (Math.random() - 0.5) * 0.04, worldPos.z + (Math.random() - 0.5) * 0.04,
        carVel.x * 0.85 + backDir.x * sp + jx, carVel.y * 0.85 + backDir.y * sp + jy, carVel.z * 0.85 + backDir.z * sp + jz,
        0.12 + Math.random() * 0.12, 0.22, 0.05, col, edge, 0.9, 2,
      );
    }
    if (Math.random() < dt * 40 * this.quality.particles) {
      const dark = boostItem?.dark;
      this.smoke.spawn(
        worldPos.x, worldPos.y, worldPos.z,
        carVel.x * 0.5 + backDir.x * 3, carVel.y * 0.5 + backDir.y * 3 + 0.5, carVel.z * 0.5 + backDir.z * 3,
        0.7 + Math.random() * 0.5, 0.25, supersonic ? 1.6 : 1.2, dark ? COLORS.shadowSmoke : COLORS.smokeLight, COLORS.smokeDark, dark ? 0.5 : 0.28, 2.5, -0.6,
      );
    }
  }

  sparks(pos, dir, count, speed, color = COLORS.spark) {
    const n = Math.round(count * this.quality.particles);
    for (let i = 0; i < n; i++) {
      tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      tmp.addScaledVector(dir, 1.2).normalize();
      const s = speed * (0.4 + Math.random() * 0.8);
      const life = 0.25 + Math.random() * 0.45;
      this.streaks.spawn(pos.x, pos.y, pos.z, tmp.x * s, tmp.y * s, tmp.z * s, life, 0.035, color, 1.5, 9.8);
      if (i % 3 === 0) this.glow.spawn(pos.x, pos.y, pos.z, tmp.x * s, tmp.y * s, tmp.z * s, life, 0.08, 0.02, color, COLORS.ember, 1, 1.5, 9.8);
    }
  }

  dust(pos, count, size = 0.6, color = COLORS.dust) {
    const n = Math.round(count * this.quality.particles);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 2.5;
      this.smoke.spawn(pos.x, pos.y + 0.05, pos.z, Math.cos(a) * s, 0.3 + Math.random() * 0.8, Math.sin(a) * s, 0.5 + Math.random() * 0.6, size * 0.4, size, color, COLORS.smokeDark, 0.35, 3, -0.2);
    }
  }

  ballHit(pos, normal, strength) {
    const k = Math.min(1, strength / 3000);
    this.sparks(pos, normal, 8 + k * 40, 4 + k * 14, COLORS.white);
    this.flash(pos, 0.6 + k * 1.6, 0.12, COLORS.white);
    if (k > 0.6) this.ring(pos, normal, 0.6, 2.2 + k * 2.5, 0.25, COLORS.white, 0.18);
  }

  // Flip reset: a small light pops out of the ball where the wheels touched it, with a ring and
  // sparkles, and a soft glow rides along with the ball for a moment.
  // ballPos: ball center; contact: point on the ball where the car touched; getBallPos(): live position.
  flipReset(ballPos, contact, getBallPos) {
    const col = new THREE.Color(0xc8f6ff);
    const n = tmp.subVectors(contact, ballPos).normalize();
    // Light just outside the ball's surface so the ball itself does not hide it.
    const lp = new THREE.Vector3().copy(contact).addScaledVector(n, 0.45);
    this.flash(lp, 3.6, 0.28, col);
    this.flash(lp, 1.4, 0.5, COLORS.white);
    this.ring(tmp2.copy(contact).addScaledVector(n, 0.05), n, 0.4, 2.8, 0.4, col, 0.85, 0.86);
    const count = Math.round(34 * this.quality.particles) + 10;
    const nx = n.x, ny = n.y, nz = n.z;
    for (let i = 0; i < count; i++) {
      tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.8);
      tmp.x += nx; tmp.y += ny; tmp.z += nz;
      tmp.normalize();
      const sp = 4 + Math.random() * 6;
      this.glow.spawn(lp.x, lp.y, lp.z, tmp.x * sp, tmp.y * sp, tmp.z * sp, 0.4 + Math.random() * 0.4, 0.22, 0.03, COLORS.white, col, 1, 2.5, 0);
    }
    // Glow that follows the ball and fades.
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX(), color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.renderOrder = 8;
    halo.position.copy(ballPos);
    halo.scale.setScalar(3.2);
    this.temp(halo, 0.6, (dt, age) => {
      const p = getBallPos();
      if (p) halo.position.copy(p);
      const k = 1 - age / 0.6;
      halo.material.opacity = k * k;
      halo.scale.setScalar(3.2 + (1 - k) * 1.5);
    });
  }

  padPickup(pos, big) {
    const n = Math.round((big ? 60 : 18) * this.quality.particles);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * (big ? 1.2 : 0.5);
      this.glow.spawn(pos.x + Math.cos(a) * r, pos.y, pos.z + Math.sin(a) * r, 0, 3 + Math.random() * (big ? 6 : 3), 0, 0.4 + Math.random() * 0.4, big ? 0.3 : 0.18, 0.02, COLORS.boostCore, COLORS.boostEdge, 1, 2, 0);
    }
  }

  ballTrail(pos, vel, speed01) {
    if (Math.random() < speed01 * this.quality.particles) {
      this.smoke.spawn(pos.x, pos.y, pos.z, -vel.x * 0.05, 0.4, -vel.z * 0.05, 1.0 + Math.random() * 0.7, 0.8, 2.6, COLORS.smokeLight, COLORS.smokeDark, 0.22 + speed01 * 0.2, 1.5, -0.3);
    }
    if (Math.random() < speed01 * 1.5 * this.quality.particles) {
      this.glow.spawn(pos.x + (Math.random() - 0.5) * 0.8, pos.y + (Math.random() - 0.5) * 0.8, pos.z + (Math.random() - 0.5) * 0.8, vel.x * 0.2, vel.y * 0.2, vel.z * 0.2, 0.3, 0.5, 0.1, COLORS.fireCore, COLORS.fireEdge, 0.5 * speed01, 3, 0);
    }
  }

  explosion(pos, color, scale = 1) {
    const q = this.quality.particles;
    const tc = new THREE.Color(color || COLORS.fireEdge);
    const hot = tc.clone().lerp(COLORS.white, 0.4);
    this.fireball(pos, tc, hot, 0.4, 2.8 * scale, 0.55, 'plasma', 0.8);
    this.fireball(pos, hot, COLORS.fireCore, 0.3, 1.5 * scale, 0.3, 'plasma', 0.4);
    this.fireball(pos, tc, hot, 0.6, 3.6 * scale, 1.7, 'smoke', 1.3);
    for (let i = 0; i < 90 * q * scale; i++) {
      tmp.set(Math.random() - 0.5, Math.random() * 0.9 - 0.15, Math.random() - 0.5).normalize();
      const sp = (9 + Math.random() * 18) * scale;
      this.streaks.spawn(pos.x, pos.y, pos.z, tmp.x * sp, tmp.y * sp, tmp.z * sp, 0.3 + Math.random() * 0.5, 0.03, Math.random() < 0.5 ? hot : COLORS.spark, 1.4, 9.8);
    }
    for (let i = 0; i < 50 * q * scale; i++) {
      tmp.set(Math.random() - 0.5, Math.random() * 0.8 - 0.1, Math.random() - 0.5).normalize();
      const sp = (4 + Math.random() * 10) * scale;
      this.glow.spawn(pos.x, pos.y, pos.z, tmp.x * sp, tmp.y * sp, tmp.z * sp, 0.4 + Math.random() * 0.6, 0.28, 0.06, hot, tc, 1, 1.6, 6);
    }
    this.flash(pos, 5 * scale, 0.25, COLORS.fireCore);
    this.ring(tmp2.set(pos.x, Math.max(0.06, pos.y - 0.4), pos.z), tmp.set(0, 1, 0), 1, 7 * scale, 0.45, tc, 0.75, 0.92);
    this.shake = Math.max(this.shake, 0.5 * scale);
  }

  demolition(pos, vel, color) {
    this.explosion(pos, color, 0.9);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(this.debrisGeo, this.debrisMat);
      m.position.copy(pos);
      m.castShadow = true;
      const v = new THREE.Vector3((Math.random() - 0.5) * 10, 4 + Math.random() * 8, (Math.random() - 0.5) * 10).addScaledVector(vel, 0.4);
      const av = new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10);
      this.scene.add(m);
      this.debris.push({ m, v, av, life: 2.5 + Math.random() });
    }
  }

  // type: one of the GOAL_EXPLOSIONS ids (goalExplosions.js).
  goalExplosion(pos, teamColor, light = true, type = 'classic') {
    playGoalExplosion(this, type, pos, teamColor);
    if (light) this.flashLightRequest = { pos: pos.clone(), color: new THREE.Color(teamColor), intensity: 900 };
  }

  fireball(pos, color, hot, r0, r1, life, kind, rise) {
    if (!fireGeo) fireGeo = new THREE.IcosahedronGeometry(1, 5);
    const m = new THREE.Mesh(fireGeo, fireMaterial(color, hot, kind));
    m.position.copy(pos);
    m.scale.setScalar(r0);
    m.frustumCulled = false;
    this.scene.add(m);
    m.renderOrder = kind === 'smoke' ? 5 : 8;
    this.fireballs.push({ m, t: 0, life, r0, r1, kind, rise });
  }

  flash(pos, size, life, color) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.copy(pos);
    s.scale.setScalar(size);
    s.renderOrder = 8;
    this.scene.add(s);
    this.flashes.push({ s, life, max: life, size });
  }

  ring(pos, normal, r0, r1, life, color, opacity, inner = 0.82) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(inner, 1, 64),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }),
    );
    m.position.copy(pos);
    m.lookAt(tmp2.copy(pos).add(normal));
    m.renderOrder = 8;
    this.scene.add(m);
    this.rings.push({ m, r0, r1, life, max: life, opacity });
  }

  update(dt, camPos = null) {
    if (this.timers.length) {
      const due = [];
      for (let i = this.timers.length - 1; i >= 0; i--) {
        const t = this.timers[i];
        t.t -= dt;
        if (t.t <= 0) {
          due.push(t);
          this.timers.splice(i, 1);
        }
      }
      for (let i = due.length - 1; i >= 0; i--) due[i].fn();
    }
    for (let i = this.temps.length - 1; i >= 0; i--) {
      const t = this.temps[i];
      t.age += dt;
      if (t.age >= t.life) {
        this.scene.remove(t.obj);
        this.temps.splice(i, 1);
      } else {
        t.fn(dt, t.age);
      }
    }
    this.glow.update(dt);
    this.smoke.update(dt);
    this.streaks.update(dt);
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const f = this.fireballs[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.life);
      const e = 1 - Math.pow(1 - k, 3);
      const r = f.r0 + (f.r1 - f.r0) * e;
      f.m.scale.setScalar(r);
      f.m.position.y += f.rise * dt;
      const u = f.m.material.uniforms;
      u.uT.value = k;
      if (f.kind === 'shell') u.uOpacity.value = Math.pow(1 - k, 2);
      else if (f.kind === 'smoke') u.uOpacity.value = 0.9 * Math.min(1, k * 6) * Math.pow(1 - k, 1.3);
      else u.uOpacity.value = Math.min(1, k * 15) * Math.pow(1 - k, 1.2);
      // Fade out when the camera is inside or right next to it, instead of tinting the whole screen.
      if (camPos) {
        const d = camPos.distanceTo(f.m.position);
        const t = Math.min(1, Math.max(0, (d - r * 1.05) / (r * 0.6 + 0.5)));
        u.uOpacity.value *= f.kind === 'shell' ? Math.min(1, d / (r + 0.01)) : t * t * (3 - 2 * t);
      }
      if (k >= 1) {
        this.scene.remove(f.m);
        f.m.material.dispose();
        this.fireballs.splice(i, 1);
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      const t = Math.max(0, f.life / f.max);
      f.s.material.opacity = t;
      f.s.scale.setScalar(f.size * (1.2 - 0.2 * t));
      if (f.life <= 0) {
        this.scene.remove(f.s);
        f.s.material.dispose();
        this.flashes.splice(i, 1);
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      const t = 1 - Math.max(0, r.life / r.max);
      const e = 1 - Math.pow(1 - t, 3);
      r.m.scale.setScalar(r.r0 + (r.r1 - r.r0) * e);
      r.m.material.opacity = r.opacity * (1 - t);
      if (r.life <= 0) {
        this.scene.remove(r.m);
        r.m.geometry.dispose();
        r.m.material.dispose();
        this.rings.splice(i, 1);
      }
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      d.v.y -= 9.8 * dt;
      d.m.position.addScaledVector(d.v, dt);
      if (d.m.position.y < 0.03) {
        d.m.position.y = 0.03;
        d.v.y *= -0.3;
        d.v.x *= 0.7;
        d.v.z *= 0.7;
        d.av.multiplyScalar(0.7);
      }
      d.m.rotation.x += d.av.x * dt;
      d.m.rotation.y += d.av.y * dt;
      d.m.rotation.z += d.av.z * dt;
      if (d.life <= 0) {
        this.scene.remove(d.m);
        this.debris.splice(i, 1);
      }
    }
    this.shake = Math.max(0, this.shake - dt * 1.6);
  }

  clear() {
    this.glow.clear();
    this.smoke.clear();
    this.streaks.clear();
    // Drop pending explosion steps and live pieces.
    this.timers.length = 0;
    for (const t of this.temps) this.scene.remove(t.obj);
    this.temps.length = 0;
    for (const f of this.fireballs) {
      this.scene.remove(f.m);
      f.m.material.dispose();
    }
    this.fireballs.length = 0;
  }
}

let glowTex = null;
function GLOW_TEX() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.7)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

export const COLORS = {
  white: new THREE.Color(1, 1, 1),
  spark: new THREE.Color(1.0, 0.85, 0.5),
  ember: new THREE.Color(1.0, 0.3, 0.05),
  dust: new THREE.Color(0.38, 0.42, 0.32),
  smokeLight: new THREE.Color(0.55, 0.56, 0.6),
  smokeDark: new THREE.Color(0.12, 0.12, 0.14),
  smokeExpl: new THREE.Color(0.3, 0.27, 0.25),
  fireCore: new THREE.Color(1.0, 0.85, 0.55),
  fireEdge: new THREE.Color(1.0, 0.35, 0.05),
  boostCore: new THREE.Color(1.0, 0.9, 0.5),
  boostEdge: new THREE.Color(1.0, 0.45, 0.05),
  blueHot: new THREE.Color(0.25, 0.55, 1.0),
  orangeHot: new THREE.Color(1.0, 0.35, 0.05),
  shadowSmoke: new THREE.Color(0.12, 0.05, 0.22),
};
