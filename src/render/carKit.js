// Car model kit: shared parts (wheels, lights, boosters, paint) and the helpers each design uses to
// build its body. Local frame matches the physics: +x forward, +y up, +z right, origin at the car's
// center point (about 17 cm above the ground at rest). All sizes in meters.
import * as THREE from 'three';
import { mergeChildren } from './mergeMeshes.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CONFIG } from '../config.js';
import { UU } from '../util/math.js';
import { makeLiveryTexture } from './textures.js';

const V = CONFIG.vehicle;

// ------------------------------------------------------------------ geometry helpers
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function sampleStations(st, steps) {
  const out = [];
  const keys = Object.keys(st[0]);
  for (let i = 0; i < st.length - 1; i++) {
    const a = st[Math.max(0, i - 1)];
    const b = st[i];
    const c = st[i + 1];
    const d = st[Math.min(st.length - 1, i + 2)];
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const s = {};
      for (const key of keys) s[key] = catmull(a[key] ?? 0, b[key] ?? 0, c[key] ?? 0, d[key] ?? 0, t);
      out.push(s);
    }
  }
  out.push({ ...st[st.length - 1] });
  return out;
}

// Superellipse cross-section loft along x.
// Station: { x, w (half width), yb (bottom), yt (top), n (squareness, 2 = ellipse), tb (narrowing of the
// upper half, 0..1), zc (lateral center, default 0) }.
export function loftGeometry(stations, { ring = 40, steps = 6, colorFn = null, uvFn = null, capEnds = true } = {}) {
  const st = stations.map((s) => ({ tb: 0, zc: 0, ...s }));
  const S = sampleStations(st, steps);
  const pos = [];
  const uv = [];
  const col = [];
  for (const s of S) {
    const cy = (s.yb + s.yt) / 2;
    const h = (s.yt - s.yb) / 2;
    const e = 2 / Math.max(1.2, s.n);
    for (let k = 0; k <= ring; k++) {
      const th = (k / ring) * Math.PI * 2;
      const c = Math.cos(th);
      const sn = Math.sin(th);
      const zz = Math.sign(c) * Math.pow(Math.abs(c), e);
      const yy = Math.sign(sn) * Math.pow(Math.abs(sn), e);
      const y = cy + yy * h;
      const taper = yy > 0 ? 1 - s.tb * yy * yy : 1;
      const z = s.zc + zz * s.w * taper;
      pos.push(s.x, y, z);
      uv.push(...(uvFn ? uvFn(s.x, y, z) : [k / ring, 0]));
      col.push(...(colorFn ? colorFn(s.x, y, z, yy) : [1, 1, 1]));
    }
  }
  const idx = [];
  const Rn = ring + 1;
  for (let i = 0; i < S.length - 1; i++) {
    for (let k = 0; k < ring; k++) {
      const a = i * Rn + k;
      const b = (i + 1) * Rn + k;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  if (capEnds) {
    for (const [si, flip] of [[0, true], [S.length - 1, false]]) {
      const s = S[si];
      const center = pos.length / 3;
      const cy = (s.yb + s.yt) / 2;
      pos.push(s.x, cy, s.zc);
      uv.push(...(uvFn ? uvFn(s.x, cy, s.zc) : [0.5, 0.5]));
      col.push(...(colorFn ? colorFn(s.x, cy, s.zc, 0) : [1, 1, 1]));
      for (let k = 0; k < ring; k++) {
        const a = si * Rn + k;
        if (flip) idx.push(center, a + 1, a);
        else idx.push(center, a, a + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function withWhiteColors(g) {
  if (!g.getAttribute('color')) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).fill(1), 3));
  return g;
}

function tireGeometry(radius, width, sidewall = 0.34) {
  const pts = [];
  const r0 = radius * (1 - sidewall);
  const hw = width / 2;
  const sh = Math.min(width * 0.22, radius * 0.25);
  pts.push(new THREE.Vector2(r0, -hw * 0.94));
  pts.push(new THREE.Vector2(radius - sh * 1.6, -hw));
  const seg = 6;
  for (let i = 0; i <= seg; i++) {
    const a = -Math.PI / 2 + (i / seg) * (Math.PI / 2);
    pts.push(new THREE.Vector2(radius - sh + Math.cos(a) * sh, -hw + sh + Math.sin(a) * sh));
  }
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * (Math.PI / 2);
    pts.push(new THREE.Vector2(radius - sh + Math.cos(a) * sh, hw - sh + Math.sin(a) * sh));
  }
  pts.push(new THREE.Vector2(radius - sh * 1.6, hw));
  pts.push(new THREE.Vector2(r0, hw * 0.94));
  const g = new THREE.LatheGeometry(pts, 40);
  g.rotateX(Math.PI / 2); // lathe axis y -> z
  return g;
}

function treadTexture(kind) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#9a9a9a';
  ctx.fillRect(0, 0, 128, 512);
  ctx.fillStyle = '#222';
  if (kind === 'offroad') {
    for (let i = 0; i < 16; i++) {
      const y = (i * 512) / 16;
      const o = i % 2 ? 0 : 30;
      ctx.fillRect(4 + o, y + 4, 40, 22);
      ctx.fillRect(68 + o * 0.5, y + 4, 40, 22);
    }
  } else {
    for (let i = 0; i < 24; i++) {
      const y = (i * 512) / 24;
      ctx.save();
      ctx.translate(0, y);
      ctx.beginPath();
      ctx.moveTo(10, 0); ctx.lineTo(56, 6); ctx.lineTo(56, 14); ctx.lineTo(10, 8);
      ctx.moveTo(118, 0); ctx.lineTo(72, 6); ctx.lineTo(72, 14); ctx.lineTo(118, 8);
      ctx.fill();
      ctx.restore();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Materials shared by every car (reflections come from the scene's environment map).
let shared = null;
export function sharedCarAssets() {
  if (shared) return shared;
  shared = {
    tireMat: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.88, metalness: 0, bumpMap: treadTexture('road'), bumpScale: 3, envMapIntensity: 0.4 }),
    offroadTireMat: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.92, metalness: 0, bumpMap: treadTexture('offroad'), bumpScale: 6, envMapIntensity: 0.3 }),
    whitewallMat: new THREE.MeshStandardMaterial({ color: 0xe8e6df, roughness: 0.7, metalness: 0, envMapIntensity: 0.4 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xc9d1da, roughness: 0.12, metalness: 1.0, envMapIntensity: 1.4 }),
    rimSilver: new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.22, metalness: 1.0, envMapIntensity: 1.2 }),
    rimBlack: new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.35, metalness: 0.8, envMapIntensity: 0.9 }),
    rimGold: new THREE.MeshStandardMaterial({ color: 0xc9a14a, roughness: 0.25, metalness: 1.0, envMapIntensity: 1.2 }),
    rimWhite: new THREE.MeshStandardMaterial({ color: 0xe9edf2, roughness: 0.3, metalness: 0.3, envMapIntensity: 0.9 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.35, metalness: 0.9, envMapIntensity: 1.0 }),
    black: new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 0.6, metalness: 0.2, envMapIntensity: 0.4 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.55, metalness: 0.1, envMapIntensity: 0.5 }),
    carbon: new THREE.MeshPhysicalMaterial({ color: 0x15171c, roughness: 0.42, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.15, envMapIntensity: 0.9 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x050a12, roughness: 0.04, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.0 }),
    nozzle: new THREE.MeshStandardMaterial({ color: 0x8a8f99, roughness: 0.25, metalness: 1.0, envMapIntensity: 1.2 }),
    head: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.97, 0.92).multiplyScalar(3.4), toneMapped: false }),
    tail: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.07, 0.05).multiplyScalar(2.8), toneMapped: false }),
    amber: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.55, 0.05).multiplyScalar(2.4), toneMapped: false }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.9, metalness: 0 }),
  };
  return shared;
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
// Most a drawn wheel hangs below its resting spot (m).
const DROOP = 0.035;
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

// ------------------------------------------------------------------ the model
export class CarModel {
  // design: one entry of DESIGNS; opts: { team, number, accent (hex), hitbox (CONFIG.hitboxes entry) }
  // Cosmetics: paint (body color hex or null), finish (finish item), decal (decal id or 'default').
  constructor(design, { team = 0, number = 1, accent = 0xffffff, hitbox = CONFIG.hitboxes.standard, paint = null, finish = null, decal = 'default' } = {}) {
    const A = sharedCarAssets();
    this.A = A;
    this.design = design;
    this.team = team;
    this.hitbox = hitbox;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.nozzles = [];
    this.disposables = [];

    const tc = CONFIG.teams[team];
    this.teamColor = new THREE.Color(tc.color);
    this.teamLight = new THREE.Color(tc.light);
    this.accentColor = new THREE.Color(accent);
    const livery = makeLiveryTexture(team, number, {
      accent: '#' + this.accentColor.getHexString(),
      style: decal && decal !== 'default' ? decal : design.livery || 'twin',
      base: design.baseShade ?? 0.82,
      paint,
      pattern: finish?.pattern || null,
    });
    this.disposables.push(livery);
    const [x0, x1, hw] = design.span; // body extent used for the top-down livery mapping
    this.uvTop = (x, y, z) => [(x - x0) / (x1 - x0), (z + hw) / (2 * hw)];
    const paintOpts = { roughness: 0.32, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.9, ...(finish?.mat || {}) };
    const bodyColor = paint !== null && paint !== undefined ? new THREE.Color(paint) : this.teamColor.clone().multiplyScalar(design.baseShade ?? 0.82);
    this.mats = {
      ...A,
      paint: new THREE.MeshPhysicalMaterial({ map: livery, vertexColors: true, ...paintOpts }),
      paintPlain: new THREE.MeshPhysicalMaterial({ color: bodyColor, ...paintOpts }),
      accent: new THREE.MeshPhysicalMaterial({ color: this.accentColor, ...paintOpts }),
      glow: new THREE.MeshBasicMaterial({ color: this.teamLight.clone().multiplyScalar(2.2), toneMapped: false }),
      caliper: new THREE.MeshStandardMaterial({ color: this.accentColor, roughness: 0.35, metalness: 0.4 }),
    };
    for (const k of ['paint', 'paintPlain', 'accent', 'glow', 'caliper']) this.disposables.push(this.mats[k]);

    design.build(this);
    this.buildWheels(design.wheels);
    this.buildUnderglow();
    // Fewer draw calls: a car is built from up to ~300 small meshes. Meshes that move together and
    // share a material become one mesh (body parts; each wheel's spinning parts).
    mergeChildren(this.body);
    for (const w of this.wheelVis) mergeChildren(w.spin);
    this.body.traverse((o) => {
      if (o.isMesh && !o.material.isMeshBasicMaterial) o.castShadow = true;
    });
  }

  // ---------------------------------------------------------------- helpers used by designs
  mat(m) {
    return typeof m === 'string' ? this.mats[m] : m;
  }

  add(mesh) {
    this.body.add(mesh);
    return mesh;
  }

  // Lofted body shell. twoTone darkens everything below y (a lower body in dark trim color).
  shell(stations, { mat = 'paint', ring = 40, steps = 6, twoTone = null, cap = true } = {}) {
    const colorFn = twoTone
      ? (x, y) => {
        const t = THREE.MathUtils.smoothstep(y, twoTone.y - 0.006, twoTone.y + 0.006);
        const v = (twoTone.dark ?? 0.1) + (1 - (twoTone.dark ?? 0.1)) * t;
        return [v, v, v];
      }
      : null;
    const g = loftGeometry(stations, { ring, steps, colorFn, uvFn: this.uvTop, capEnds: cap });
    const m = this.mat(mat);
    if (!m.vertexColors) g.deleteAttribute('color');
    return this.add(new THREE.Mesh(g, m));
  }

  // Rounded box. size: [x, y, z]; rot in radians [x, y, z].
  rbox(size, pos, mat = 'paintPlain', { r = 0.02, rot = null, seg = 3 } = {}) {
    const rr = Math.min(r, size[0] / 2 - 1e-4, size[1] / 2 - 1e-4, size[2] / 2 - 1e-4);
    const g = rr > 0.001 ? new RoundedBoxGeometry(size[0], size[1], size[2], seg, rr) : new THREE.BoxGeometry(...size);
    const m = this.mat(mat);
    if (m.vertexColors) withWhiteColors(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(...pos);
    if (rot) mesh.rotation.set(...rot);
    return this.add(mesh);
  }

  box(size, pos, mat = 'paintPlain', rot = null) {
    return this.rbox(size, pos, mat, { r: 0, rot });
  }

  // Cylinder along an axis ('x', 'y' or 'z').
  cyl(rTop, rBot, len, pos, mat = 'darkMetal', { axis = 'y', seg = 20, open = false, rot = null } = {}) {
    const g = new THREE.CylinderGeometry(rTop, rBot, len, seg, 1, open);
    if (axis === 'x') g.rotateZ(-Math.PI / 2);
    if (axis === 'z') g.rotateX(Math.PI / 2);
    const m = this.mat(mat);
    if (m.vertexColors) withWhiteColors(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(...pos);
    if (rot) mesh.rotation.set(...rot);
    return this.add(mesh);
  }

  sphere(r, pos, mat = 'chrome', { scale = null, seg = 20 } = {}) {
    const g = new THREE.SphereGeometry(r, seg, Math.max(8, seg >> 1));
    const m = this.mat(mat);
    if (m.vertexColors) withWhiteColors(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(...pos);
    if (scale) mesh.scale.set(...scale);
    return this.add(mesh);
  }

  // Tube through points (roll cages, frames, bars).
  tube(points, r, mat = 'darkMetal', { closed = false, seg = 32, radial = 8, tension = 0.0 } = {}) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed, 'catmullrom', tension);
    const g = new THREE.TubeGeometry(curve, seg, r, radial, closed);
    const m = this.mat(mat);
    if (m.vertexColors) withWhiteColors(g);
    return this.add(new THREE.Mesh(g, m));
  }

  // Straight rod between two points.
  rod(a, b, r, mat = 'darkMetal', seg = 8) {
    const va = new THREE.Vector3(...a);
    const d = new THREE.Vector3(...b).sub(va);
    const len = d.length();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), this.mat(mat));
    mesh.position.copy(va).addScaledVector(d, 0.5);
    mesh.quaternion.setFromUnitVectors(Y_AXIS, d.normalize());
    return this.add(mesh);
  }

  // Flat shape in the x-y plane (points [[x, y], ...]) extruded along z, centered on z.
  plate(points, depth, pos, mat = 'paintPlain', { rot = null, bevel = 0.004 } = {}) {
    const sh = new THREE.Shape(points.map((p) => new THREE.Vector2(p[0], p[1])));
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8 });
    g.translate(0, 0, -depth / 2);
    const m = this.mat(mat);
    if (m.vertexColors) withWhiteColors(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(...pos);
    if (rot) mesh.rotation.set(...rot);
    return this.add(mesh);
  }

  // Airfoil-section wing spanning z.
  wing(chord, thick, span, pos, mat = 'carbon', { rotZ = 0, rotX = 0 } = {}) {
    const sh = new THREE.Shape();
    sh.moveTo(chord / 2, 0);
    sh.bezierCurveTo(chord * 0.2, thick * 1.2, -chord * 0.3, thick * 1.1, -chord / 2, thick * 0.2);
    sh.lineTo(-chord / 2, -thick * 0.2);
    sh.bezierCurveTo(-chord * 0.2, -thick * 0.2, chord * 0.2, -thick * 0.3, chord / 2, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: span, bevelEnabled: false, curveSegments: 10 });
    g.translate(0, 0, -span / 2);
    const m = this.mat(mat);
    if (m.vertexColors) withWhiteColors(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(...pos);
    mesh.rotation.set(rotX, 0, rotZ);
    return this.add(mesh);
  }

  // Wheel arch flare: a partial ring hugging the top of a wheel. Center at the wheel's rest position.
  arch(x, y, z, r, width, mat = 'paintPlain', { thick = 0.03, from = -0.25, to = Math.PI + 0.25 } = {}) {
    const g = new THREE.TorusGeometry(r, thick, 8, 28, to - from);
    g.rotateZ(from);
    g.scale(1, 1, width / (thick * 2));
    const m = this.mat(mat);
    if (m.vertexColors) withWhiteColors(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    return this.add(mesh);
  }

  // Dark disc behind a wheel so arch openings read as deep.
  archShadow(x, y, z, r, s) {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(r, 24), this.mats.black);
    mesh.position.set(x, y, z);
    if (s < 0) mesh.rotation.y = Math.PI;
    return this.add(mesh);
  }

  sym(fn) {
    fn(1);
    fn(-1);
  }

  light(kind, size, pos, { rot = null, r = 0.006 } = {}) {
    return this.rbox(size, pos, kind, { r, rot });
  }

  // Booster exhaust; registers the flame position. dir is always -x.
  nozzle(pos, r = 0.06, { len = 0.12, mat = 'nozzle' } = {}) {
    const [x, y, z] = pos;
    this.cyl(r * 0.92, r * 1.1, len, [x + len / 2, y, z], mat, { axis: 'x', seg: 24, open: true });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.08, r * 0.16, 8, 24), this.mats.darkMetal);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(x, y, z);
    this.add(ring);
    // Dim team glow at rest; the game brightens it while boosting.
    const inner = new THREE.Mesh(new THREE.CircleGeometry(r * 0.88, 24), new THREE.MeshBasicMaterial({ color: this.teamLight.clone().multiplyScalar(0.3), toneMapped: false }));
    inner.position.set(x + 0.02, y, z);
    inner.rotation.y = -Math.PI / 2;
    this.add(inner);
    this.nozzles.push({ pos: new THREE.Vector3(x, y, z), inner, r });
    return inner;
  }

  // ---------------------------------------------------------------- wheels
  // spec: { front: { r, w, z }, back: { r, w, z }, rim, rimMat, tire, arms, armFrom }
  buildWheels(spec) {
    const A = this.A;
    const hb = this.hitbox;
    this.wheelVis = [];
    const defs = [
      { front: true, right: true }, { front: true, right: false },
      { front: false, right: true }, { front: false, right: false },
    ];
    for (const d of defs) {
      const ws = d.front ? spec.front : spec.back;
      const phys = d.front ? hb.frontWheel : hb.backWheel;
      const s = d.right ? 1 : -1;
      d.x = (ws.x ?? phys.offset[0] * UU);
      d.z = s * ws.z;
      d.r = ws.r;
      d.w = ws.w;
      const hub = new THREE.Group();
      const steerG = new THREE.Group();
      const spin = new THREE.Group();
      hub.add(steerG);
      steerG.add(spin);
      const tireMat = spec.tire === 'offroad' ? A.offroadTireMat : A.tireMat;
      const tire = new THREE.Mesh(tireGeometry(d.r, d.w, spec.sidewall ?? 0.34), tireMat);
      tire.castShadow = true;
      spin.add(tire);
      if (spec.tire === 'offroad') this.addKnobs(spin, d.r, d.w);
      if (spec.whitewall) {
        const ww = new THREE.Mesh(new THREE.RingGeometry(d.r * 0.74, d.r * 0.86, 32), A.whitewallMat);
        ww.position.z = s * (d.w / 2 + 0.001);
        if (s < 0) ww.rotation.y = Math.PI;
        spin.add(ww);
      }
      this.buildRim(spin, d, s, spec);
      // Brake disc and caliper (do not spin).
      const rimR = d.r * (1 - (spec.sidewall ?? 0.34));
      const face = s * d.w * 0.36;
      if (spec.rim !== 'cap') {
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(rimR * 0.8, rimR * 0.8, 0.012, 24), A.darkMetal);
        disc.rotation.x = Math.PI / 2;
        disc.position.z = face - s * 0.03;
        steerG.add(disc);
        const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.03), this.mats.caliper);
        caliper.position.set(-0.035, rimR * 0.55, face - s * 0.032);
        steerG.add(caliper);
      }
      hub.position.set(d.x, -0.04, d.z);
      this.root.add(hub);
      const arms = [];
      if (spec.arms) {
        const from = spec.armFrom || {};
        const inZ = (d.front ? from.front : from.back) ?? 0.14;
        const pick = [
          new THREE.Vector3(d.x + 0.05, 0.0, s * inZ),
          new THREE.Vector3(d.x - 0.06, 0.0, s * inZ),
          new THREE.Vector3(d.x + 0.03, 0.11, s * (inZ + 0.02)),
          new THREE.Vector3(d.x - 0.05, 0.11, s * (inZ + 0.02)),
        ];
        for (let k = 0; k < 4; k++) {
          const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 6), spec.armMat ? this.mat(spec.armMat) : A.carbon);
          this.root.add(arm);
          arms.push({ mesh: arm, from: pick[k], upper: k >= 2 });
        }
      }
      const visualDrop = d.r - phys.radius * UU;
      this.wheelVis.push({ hub, steerG, spin, def: d, phys, angle: 0, arms, visualDrop, inner: s * (Math.abs(d.z) - d.w / 2 - 0.01) });
    }
    // Rest pose until the first update (used by the showroom too).
    this.update(0, { suspension: null, steer: 0, forwardSpeed: 0, onGround: true, snap: true });
    // Trail emitters behind the rear tires (supersonic streaks).
    const back = this.wheelVis[2].def;
    this.trailPoints = [new THREE.Vector3(back.x - back.r, -0.1, Math.abs(back.z)), new THREE.Vector3(back.x - back.r, -0.1, -Math.abs(back.z))];
  }

  addKnobs(spin, r, w) {
    const n = 22;
    const g = new THREE.BoxGeometry(0.03, 0.022, w * 0.42);
    for (let i = 0; i < n; i++) {
      for (const side of [-1, 1]) {
        const a = ((i + (side > 0 ? 0.5 : 0)) / n) * Math.PI * 2;
        const k = new THREE.Mesh(g, this.A.offroadTireMat);
        k.position.set(Math.cos(a) * (r - 0.004), Math.sin(a) * (r - 0.004), side * w * 0.24);
        k.rotation.z = a;
        spin.add(k);
      }
    }
  }

  buildRim(spin, d, s, spec) {
    const A = this.A;
    const rimMat = spec.rimMat ? this.mat(spec.rimMat) : A.rimSilver;
    const rimR = d.r * (1 - (spec.sidewall ?? 0.34));
    const face = s * d.w * 0.36;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR, d.w * 0.88, 28, 1, true), A.darkMetal);
    barrel.rotation.x = Math.PI / 2;
    spin.add(barrel);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(rimR - 0.004, 0.007, 8, 36), rimMat);
    lip.position.z = face;
    spin.add(lip);
    const spoke = (len, wide, thick, angle, offset = 0, mat = rimMat) => {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(len, wide, thick), mat);
      sp.geometry.translate(len / 2 + offset, 0, 0);
      sp.rotation.z = angle;
      sp.position.z = face - s * 0.006;
      spin.add(sp);
      return sp;
    };
    switch (spec.rim) {
      case 'star': // five wide spokes
        for (let k = 0; k < 5; k++) spoke(rimR * 0.9, rimR * 0.28, 0.016, (k / 5) * Math.PI * 2);
        break;
      case 'mesh': // crossed thin spokes
        for (let k = 0; k < 12; k++) {
          const sp = spoke(rimR * 0.92, 0.01, 0.01, (k / 12) * Math.PI * 2);
          sp.rotation.z += k % 2 ? 0.35 : -0.35;
        }
        break;
      case 'disc': { // aero cover with vents
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(rimR * 0.96, rimR * 0.96, 0.012, 28), rimMat);
        disc.rotation.x = Math.PI / 2;
        disc.position.z = face - s * 0.004;
        spin.add(disc);
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          const v = new THREE.Mesh(new THREE.CircleGeometry(rimR * 0.16, 12), A.black);
          v.position.set(Math.cos(a) * rimR * 0.58, Math.sin(a) * rimR * 0.58, face + s * 0.004);
          if (s < 0) v.rotation.y = Math.PI;
          spin.add(v);
        }
        break;
      }
      case 'turbine': // curved blades
        for (let k = 0; k < 9; k++) {
          const sp = spoke(rimR * 0.85, 0.03, 0.012, (k / 9) * Math.PI * 2, rimR * 0.08);
          sp.rotation.y = s * 0.5;
        }
        break;
      case 'beadlock': { // off-road: heavy six-spoke with a bolted outer ring
        for (let k = 0; k < 6; k++) spoke(rimR * 0.88, rimR * 0.22, 0.02, (k / 6) * Math.PI * 2);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(rimR * 0.9, 0.012, 6, 32), A.darkMetal);
        ring.position.z = face + s * 0.004;
        spin.add(ring);
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          const bolt = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), A.chrome);
          bolt.position.set(Math.cos(a) * rimR * 0.9, Math.sin(a) * rimR * 0.9, face + s * 0.012);
          spin.add(bolt);
        }
        break;
      }
      case 'cap': { // chrome hubcap dome
        const dome = new THREE.Mesh(new THREE.SphereGeometry(rimR * 0.95, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), A.chrome);
        dome.rotation.x = s * Math.PI / 2;
        dome.scale.set(1, 0.35, 1);
        dome.position.z = face;
        spin.add(dome);
        const bump = new THREE.Mesh(new THREE.SphereGeometry(rimR * 0.2, 12, 8), this.mats.accent);
        bump.position.z = face + s * rimR * 0.3;
        spin.add(bump);
        break;
      }
      default: // ten thin spokes
        for (let k = 0; k < 10; k++) spoke(rimR * 0.9, 0.012, 0.01, (k / 10) * Math.PI * 2);
    }
    if (spec.rim !== 'cap') {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(d.r * 0.13, d.r * 0.15, 0.03, 16), A.darkMetal);
      cap.rotation.x = Math.PI / 2;
      cap.position.z = face;
      spin.add(cap);
      const capGlow = new THREE.Mesh(new THREE.CircleGeometry(d.r * 0.07, 16), this.mats.glow);
      capGlow.position.z = face + s * 0.016;
      if (s < 0) capGlow.rotation.y = Math.PI;
      spin.add(capGlow);
    }
  }

  buildUnderglow() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    this.disposables.push(tex);
    const [x0, x1, hw] = this.design.span;
    const under = new THREE.Mesh(
      new THREE.PlaneGeometry((x1 - x0) * 1.15, hw * 2.2),
      new THREE.MeshBasicMaterial({ map: tex, color: this.teamColor.clone().multiplyScalar(0.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    under.rotation.x = -Math.PI / 2;
    under.position.set((x0 + x1) / 2, -0.165, 0);
    this.root.add(under);
    this.underglow = under;
  }

  // Rest height of the car origin above the ground (meters), for placing it on a floor.
  restHeight() {
    return (this.hitbox.restZ ?? 17) * UU;
  }

  update(dt, { suspension, steer = 0, forwardSpeed = 0, onGround = true, snap = false }) {
    const restLen = (phys) => {
      // Rest pose: wheel bottom on the ground, which sits restHeight() below the origin.
      return phys.offset[2] * UU + this.restHeight() - phys.radius * UU;
    };
    for (let i = 0; i < 4; i++) {
      const w = this.wheelVis[i];
      const def = w.def;
      const phys = w.phys;
      const hardY = phys.offset[2] * UU;
      // In the air (or upside down) the physics wheel hangs at full travel, 13 cm below its rest
      // spot, which looks broken on the model. Drawn wheels drop at most DROOP below rest.
      const rest = restLen(phys);
      const len = suspension ? Math.min(suspension[i], rest + DROOP) : rest;
      const target = hardY - len + w.visualDrop;
      if (snap) w.hub.position.y = target;
      else w.hub.position.y += (target - w.hub.position.y) * Math.min(1, dt * 30);
      if (def.front) w.steerG.rotation.y = -steer;
      if (onGround || Math.abs(forwardSpeed) > 0.1) w.angle -= (forwardSpeed / def.r) * dt;
      w.spin.rotation.z = w.angle;
      for (const a of w.arms) {
        tmpA.copy(a.from);
        tmpB.set(def.x + (a.from.x - def.x) * 0.3, w.hub.position.y + (a.upper ? 0.045 : -0.04), w.inner);
        const d = tmpB.sub(tmpA);
        const len2 = d.length();
        a.mesh.position.copy(tmpA).addScaledVector(d, 0.5);
        a.mesh.scale.set(1, len2, 1);
        a.mesh.quaternion.setFromUnitVectors(Y_AXIS, d.normalize());
      }
    }
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh) o.geometry.dispose();
    });
    for (const d of this.disposables) d.dispose();
  }
}
