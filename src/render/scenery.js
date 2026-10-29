// Scenery beyond the stadium bowl: mountain ranges, forests, floating islands, cloud banks, a
// skyline, a bridge, wind turbines and flying traffic. Everything is built from a few merged or
// instanced meshes (one to three draw calls per kind), placed far and high enough to show above
// the stands. Colors fade toward the arena's haze color with distance, done once in the vertex
// colors (the materials skip the scene fog, which would hide anything this far away).
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

// How much of the haze color shows at distance d (m).
function hazeAmount(d, k) {
  const x = d * k;
  return 1 - Math.exp(-x * x);
}

// Unlit material: shading is baked into the vertex colors (bakeShade), so bright day lighting
// cannot wash distant scenery out to white, and it costs less than lit materials.
function sceneryMat(opts = {}) {
  return new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, ...opts });
}

// Flat-shade a geometry into its vertex colors from the arena's key light direction.
function bakeShade(geo, lightDir, amb = 0.55) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.getAttribute('position');
  const c = g.getAttribute('color');
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const d = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    d.fromBufferAttribute(p, i + 2);
    n.subVectors(d, b).cross(a.clone().sub(b)).normalize();
    // Faces looking away from the light still get sky light; both sides count (double-sided ranges).
    const lit = amb + (1 - amb) * Math.abs(n.dot(lightDir)) * (n.dot(lightDir) > 0 ? 1 : 0.45);
    for (let k = 0; k < 3; k++) c.setXYZ(i + k, c.getX(i + k) * lit, c.getY(i + k) * lit, c.getZ(i + k) * lit);
  }
  return g;
}

const lightOf = (st) => new THREE.Vector3(...(st.theme.key && st.theme.key.pos ? st.theme.key.pos : [-20, 60, 20])).normalize();

// Smooth random ridge line around a ring: sum of a few sines with random phases.
function ridgeFn(rand, freqs) {
  const parts = freqs.map((f) => ({ f, p: rand() * Math.PI * 2, a: 1 / f ** 0.6 }));
  const norm = parts.reduce((s, x) => s + x.a, 0);
  return (ang) => {
    let v = 0;
    for (const x of parts) v += Math.sin(ang * x.f + x.p) * x.a;
    return 0.5 + 0.5 * (v / norm);
  };
}

// ---------------------------------------------------------------- mountain ranges
// layer: { r, depth, h: [min, max], rock, top, snowLine (0..1, optional), freqs, flat (mesa tops) }
// Returns a height function (angle, radius) for placing trees on the front slopes.
export function buildRanges(st, layers, hazeColor) {
  const rand = st.rand;
  const k = (st.theme.fog.density || 0.003) * 0.42;
  const haze = new THREE.Color(hazeColor);
  const pos = [];
  const col = [];
  const idx = [];
  const slopes = [];
  const c = new THREE.Color();
  let base = 0;
  for (const L of layers) {
    const segs = L.segs || 220;
    const ridge = ridgeFn(rand, L.freqs || [2, 3, 5, 9, 17, 31]);
    const heights = [];
    for (let i = 0; i < segs; i++) {
      let t = ridge((i / segs) * Math.PI * 2);
      if (L.flat) t = Math.min(t, L.flat) / L.flat; // mesas: flat tops
      heights.push(L.h[0] + (L.h[1] - L.h[0]) * t + (rand() - 0.5) * (L.jag ?? 10));
    }
    const rock = new THREE.Color(L.rock);
    const top = new THREE.Color(L.top ?? L.rock);
    const snow = new THREE.Color(0xf4f7fb);
    const fz = L.squash ?? 1.15; // the bowl is longer along z
    // Each column: front foot (toward the stadium), ridge, back foot.
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const h = heights[i % segs];
      const ca = Math.cos(a);
      const sa = Math.sin(a) * fz;
      const rows = [
        [L.r - L.depth, -30, rock],
        [L.r - L.depth * 0.35, h * 0.55, rock],
        [L.r, h, null],
        [L.r + L.depth * 0.6, -30, rock],
      ];
      for (const [r, y, cc] of rows) {
        pos.push(ca * r, y, sa * r);
        if (cc) c.copy(cc).lerp(top, y > 0 ? (y / h) * 0.5 : 0);
        else {
          c.copy(top);
          if (L.snowLine !== undefined && h > L.h[0] + (L.h[1] - L.h[0]) * L.snowLine) c.copy(snow);
        }
        c.lerp(haze, hazeAmount(r, k) * (L.hazeMul ?? 1));
        col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < segs; i++) {
      const a = base + i * 4;
      const b = base + (i + 1) * 4;
      for (let r = 0; r < 3; r++) idx.push(a + r, b + r, b + r + 1, a + r, b + r + 1, a + r + 1);
    }
    base += (segs + 1) * 4;
    slopes.push({ L, heights, segs, fz });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(bakeShade(g, lightOf(st)), sceneryMat({ side: THREE.DoubleSide }));
  st.group.add(m);
  // Height on the front slope of layer `li` at angle a and fraction f (0 foot .. 1 ridge).
  return (li, a, f) => {
    const s = slopes[li];
    const L = s.L;
    const t = ((a / (Math.PI * 2)) % 1 + 1) % 1 * s.segs;
    const i0 = Math.floor(t) % s.segs;
    const h = s.heights[i0] + (s.heights[(i0 + 1) % s.segs] - s.heights[i0]) * (t - Math.floor(t));
    const r0 = L.r - L.depth * 0.35;
    const r = r0 + (L.r - r0) * f * 0.6;
    const y = h * 0.55 + (h - h * 0.55) * f * 0.6;
    return { x: Math.cos(a) * r, y, z: Math.sin(a) * s.fz * r, r };
  };
}

// ---------------------------------------------------------------- trees (instanced)
// kind: 'pine' (cone layers) or 'round' (blob crown). place(i) returns { x, y, z } or null.
export function buildTrees(st, { count, kind = 'pine', color, trunk = 0x4a3426, snow = false, scale = [10, 18], hazeColor, place }) {
  const rand = st.rand;
  const k = (st.theme.fog.density || 0.003) * 0.42;
  const parts = [];
  const tint = (g, c) => {
    const cc = new THREE.Color(c);
    const n = g.getAttribute('position').count;
    const arr = [];
    for (let i = 0; i < n; i++) arr.push(cc.r, cc.g, cc.b);
    g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
    return g;
  };
  const trunkG = tint(new THREE.CylinderGeometry(0.06, 0.09, 0.35, 5).translate(0, 0.175, 0), trunk);
  parts.push(trunkG);
  if (kind === 'pine') {
    for (let i = 0; i < 3; i++) {
      const r = 0.42 - i * 0.1;
      const g = new THREE.ConeGeometry(r, 0.5, 7).translate(0, 0.42 + i * 0.22, 0);
      parts.push(tint(g, snow && i === 2 ? 0xe8eef6 : color));
    }
  } else {
    parts.push(tint(new THREE.IcosahedronGeometry(0.38, 0).scale(1, 1.1, 1).translate(0, 0.62, 0), color));
    parts.push(tint(new THREE.IcosahedronGeometry(0.26, 0).translate(0.18, 0.82, 0.05), color));
  }
  const geo = bakeShade(mergeAll(parts), lightOf(st), 0.6);
  const mesh = new THREE.InstancedMesh(geo, sceneryMat(), count);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const haze = new THREE.Color(hazeColor);
  const c = new THREE.Color();
  let n = 0;
  for (let i = 0; i < count; i++) {
    const at = place(i, rand);
    if (!at) continue;
    const sc = scale[0] + rand() * (scale[1] - scale[0]);
    q.setFromAxisAngle(UP, rand() * Math.PI * 2);
    s.set(sc * (0.8 + rand() * 0.4), sc, sc * (0.8 + rand() * 0.4));
    p.set(at.x, at.y - sc * 0.05, at.z);
    m4.compose(p, q, s);
    mesh.setMatrixAt(n, m4);
    const v = 0.8 + rand() * 0.35;
    c.setRGB(v, v, v).lerp(haze, hazeAmount(Math.hypot(at.x, at.z), k));
    mesh.setColorAt(n, c);
    n++;
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  st.group.add(mesh);
  return mesh;
}

function mergeAll(geos) {
  // Small local merge (non-indexed) so this file does not depend on the addons path.
  const list = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const g of list) total += g.getAttribute('position').count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  for (const g of list) {
    const p = g.getAttribute('position');
    const nn = g.getAttribute('normal');
    const cc = g.getAttribute('color');
    pos.set(p.array, o * 3);
    if (nn) nor.set(nn.array, o * 3);
    if (cc) col.set(cc.array, o * 3);
    o += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

// ---------------------------------------------------------------- floating islands
// Rock islands hanging in the sky, grass on top, trees, and a few waterfalls falling off them.
export function buildIslands(st, { count = 16, r = [190, 460], y = [60, 230], size = [12, 38], grass = 0x5aa83c, rock = 0x8a7a66, rockDark = 0x4e4436, hazeColor, trees = 0x2f7a34 }) {
  const rand = st.rand;
  const k = (st.theme.fog.density || 0.003) * 0.42;
  const haze = new THREE.Color(hazeColor);
  const parts = [];
  const spots = [];
  const falls = [];
  const cG = new THREE.Color(grass);
  const cR = new THREE.Color(rock);
  const cD = new THREE.Color(rockDark);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.35;
    const rr = r[0] + rand() * (r[1] - r[0]);
    const R = size[0] + rand() * (size[1] - size[0]);
    const cx = Math.cos(a) * rr;
    const cz = Math.sin(a) * rr * 1.15;
    const cy = y[0] + rand() * (y[1] - y[0]);
    const hz = hazeAmount(rr, k);
    // Top: a slightly domed grass disc.
    const top = new THREE.CylinderGeometry(R, R * 0.96, R * 0.18, 16, 1);
    // Bottom: a jagged hanging rock cone.
    const bot = new THREE.ConeGeometry(R * 0.98, R * (1.4 + rand() * 0.8), 16, 5);
    bot.rotateX(Math.PI);
    bot.translate(0, -R * 0.09 - R * 0.75, 0);
    const bp = bot.getAttribute('position');
    for (let v = 0; v < bp.count; v++) {
      const yy = bp.getY(v);
      const j = 1 + (rand() - 0.5) * 0.28 * (yy < -R * 0.2 ? 1 : 0.4);
      bp.setX(v, bp.getX(v) * j);
      bp.setZ(v, bp.getZ(v) * j);
    }
    for (const [g, isTop] of [[top, true], [bot, false]]) {
      const p = g.getAttribute('position');
      const arr = [];
      for (let v = 0; v < p.count; v++) {
        const yy = p.getY(v);
        if (isTop) c.copy(yy > 0 ? cG : cR);
        else c.copy(cR).lerp(cD, Math.min(1, -yy / (R * 2)));
        c.lerp(haze, hz);
        arr.push(c.r, c.g, c.b);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
      g.rotateY(rand() * Math.PI);
      g.translate(cx, cy, cz);
      parts.push(g);
    }
    // Spots for trees on top.
    const nt = Math.floor(R / 5);
    for (let t = 0; t < nt; t++) {
      const ta = rand() * Math.PI * 2;
      const tr = Math.sqrt(rand()) * R * 0.75;
      spots.push({ x: cx + Math.cos(ta) * tr, y: cy + R * 0.09, z: cz + Math.sin(ta) * tr, s: R });
    }
    if (rand() < 0.45) falls.push({ x: cx, y: cy, z: cz, R, a: rand() * Math.PI * 2 });
  }
  st.group.add(new THREE.Mesh(bakeShade(mergeAll(parts), lightOf(st)), sceneryMat()));
  buildTrees(st, {
    count: spots.length, kind: 'round', color: trees, scale: [5, 9], hazeColor,
    place: (i) => spots[i],
  });
  // Waterfalls: thin glowing ribbons whose texture scrolls down.
  if (falls.length) {
    const fp = [];
    const fu = [];
    const fi = [];
    let b = 0;
    for (const f of falls) {
      const w = f.R * 0.18;
      const len = f.R * 3.2;
      const ex = f.x + Math.cos(f.a) * f.R * 0.97;
      const ez = f.z + Math.sin(f.a) * f.R * 0.97;
      const tx = -Math.sin(f.a) * w;
      const tz = Math.cos(f.a) * w;
      const y0 = f.y + f.R * 0.08;
      const out = 3;
      fp.push(ex - tx, y0, ez - tz, ex + tx, y0, ez + tz, ex + tx + Math.cos(f.a) * out, y0 - len, ez + tz + Math.sin(f.a) * out, ex - tx + Math.cos(f.a) * out, y0 - len, ez - tz + Math.sin(f.a) * out);
      fu.push(0, 0, 1, 0, 1, 1, 0, 1);
      fi.push(b, b + 1, b + 2, b, b + 2, b + 3);
      b += 4;
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    wg.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2));
    wg.setIndex(fi);
    const wm = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        float h(float x){ return fract(sin(x * 91.7) * 4375.5); }
        void main(){
          float col = floor(vUv.x * 9.0);
          float streak = 0.55 + 0.45 * sin((vUv.y * 6.0 - uTime * (2.2 + h(col))) * 6.2831 + h(col) * 6.0);
          float edge = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
          float fade = smoothstep(1.0, 0.55, vUv.y);
          gl_FragColor = vec4(mix(vec3(0.75, 0.88, 1.0), vec3(1.0), streak), (0.35 + 0.45 * streak) * edge * fade);
          #include <colorspace_fragment>
        }`,
    });
    const wmesh = new THREE.Mesh(wg, wm);
    wmesh.renderOrder = 4;
    st.group.add(wmesh);
    st.updaters.push((dt, time) => { wm.uniforms.uTime.value = time; });
  }
}

// ---------------------------------------------------------------- cloud banks
// Soft cloud cards facing the stadium, in one mesh. The whole bank turns very slowly.
export function buildClouds(st, { count = 40, r = [380, 620], y = [120, 260], size = [70, 150], color = 0xffffff, shade = 0xb8c4d6, opacity = 0.9, spin = 0.004 }) {
  const rand = st.rand;
  const tex = cloudTexture(rand);
  const pos = [];
  const uv = [];
  const idx = [];
  let b = 0;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.3;
    const rr = r[0] + rand() * (r[1] - r[0]);
    const w = size[0] + rand() * (size[1] - size[0]);
    const h = w * (0.35 + rand() * 0.2);
    const cx = Math.cos(a) * rr;
    const cz = Math.sin(a) * rr * 1.1;
    const cy = y[0] + rand() * (y[1] - y[0]);
    const tx = -Math.sin(a) * w * 0.5;
    const tz = Math.cos(a) * w * 0.5;
    pos.push(cx - tx, cy - h / 2, cz - tz, cx + tx, cy - h / 2, cz + tz, cx + tx, cy + h / 2, cz + tz, cx - tx, cy + h / 2, cz - tz);
    const u0 = (i % 4) * 0.25;
    uv.push(u0, 0, u0 + 0.25, 0, u0 + 0.25, 1, u0, 1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    b += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: { uMap: { value: tex }, uColor: { value: new THREE.Color(color) }, uShade: { value: new THREE.Color(shade) }, uOpacity: { value: opacity } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D uMap; uniform vec3 uColor; uniform vec3 uShade; uniform float uOpacity; varying vec2 vUv;
      void main(){ vec4 t = texture2D(uMap, vUv); vec3 c = mix(uShade, uColor, smoothstep(0.2, 0.85, vUv.y * 0.6 + t.g * 0.6));
        gl_FragColor = vec4(c, t.a * uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  st.cloudBank = mesh;
  st.group.add(mesh);
  if (spin) st.updaters.push((dt) => { mesh.rotation.y += spin * dt; });
  return mesh;
}

// Four cloud shapes side by side in one texture (alpha = shape, green = lit top).
function cloudTexture(rand) {
  const W = 512;
  const H = 128;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  for (let k = 0; k < 4; k++) {
    const x0 = k * 128;
    for (let i = 0; i < 26; i++) {
      const x = x0 + 18 + rand() * 92;
      const y = 50 + rand() * 50 - (Math.abs(x - x0 - 64) / 64) * 20;
      const r = 12 + rand() * 22;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const lit = Math.round(150 + (1 - y / H) * 105);
      g.addColorStop(0, `rgba(255,${lit},255,0.55)`);
      g.addColorStop(1, `rgba(255,${lit},255,0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

// ---------------------------------------------------------------- wind turbines on a range
export function buildTurbines(st, { spots, color = 0xeef1f4 }) {
  const mat = new THREE.MeshLambertMaterial({ color, fog: false });
  const tower = new THREE.CylinderGeometry(0.9, 1.6, 60, 8).translate(0, 30, 0);
  const towers = new THREE.InstancedMesh(tower, mat, spots.length);
  const m4 = new THREE.Matrix4();
  const rotors = [];
  spots.forEach((s, i) => {
    m4.makeTranslation(s.x, s.y, s.z);
    towers.setMatrixAt(i, m4);
    const rotor = new THREE.Group();
    for (let b = 0; b < 3; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.2, 26, 0.4).translate(0, 13, 0), mat);
      blade.rotation.z = (b / 3) * Math.PI * 2;
      rotor.add(blade);
    }
    rotor.add(new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6), mat));
    rotor.position.set(s.x, s.y + 60, s.z);
    rotor.lookAt(0, s.y + 60, 0);
    rotor.userData.speed = 0.6 + st.rand() * 0.4;
    st.group.add(rotor);
    rotors.push(rotor);
  });
  towers.frustumCulled = false;
  st.group.add(towers);
  st.turbines = rotors;
  st.updaters.push((dt) => {
    for (const r of rotors) r.rotateZ(r.userData.speed * dt);
  });
}

// ---------------------------------------------------------------- suspension bridge
export function buildBridge(st, { angle = 0.6, r = 420, length = 520, deckY = 46, towerH = 150, color = 0xb83a2a, lights = 0xffd9a0 }) {
  const mat = new THREE.MeshLambertMaterial({ color, fog: false });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2a2c33, fog: false });
  const g = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(length, 4, 22), dark);
  deck.position.y = deckY;
  g.add(deck);
  const half = length * 0.32;
  for (const x of [-half, half]) {
    for (const z of [-9, 9]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(5, towerH, 5), mat);
      leg.position.set(x, towerH / 2 - 10, z);
      g.add(leg);
    }
    for (const y of [deckY + 22, towerH - 22]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 22), mat);
      beam.position.set(x, y, 0);
      g.add(beam);
    }
  }
  // Main cables (catenary-ish) and hangers.
  const cablePts = (z) => {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const x = -length / 2 + (i / 40) * length;
      let y;
      if (Math.abs(x) <= half) y = towerH - 12 - (towerH - deckY - 18) * (1 - (x / half) ** 2);
      else y = towerH - 12 - (towerH - 12 - deckY) * ((Math.abs(x) - half) / (length / 2 - half));
      pts.push(new THREE.Vector3(x, y, z));
    }
    return pts;
  };
  for (const z of [-9, 9]) {
    const pts = cablePts(z);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.9, 5), mat));
    const hp = [];
    for (let i = 1; i < 40; i++) hp.push(pts[i].x, pts[i].y, z, pts[i].x, deckY + 2, z);
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3));
    g.add(new THREE.LineSegments(hg, new THREE.LineBasicMaterial({ color, fog: false })));
  }
  // Lamps along the deck.
  const lp = [];
  for (let i = 0; i <= 50; i++) for (const z of [-11, 11]) lp.push(-length / 2 + (i / 50) * length, deckY + 3, z);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  g.add(new THREE.Points(lg, new THREE.PointsMaterial({ color: new THREE.Color(lights).multiplyScalar(2), size: 3, sizeAttenuation: true, fog: false, toneMapped: false })));
  g.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r * 1.15);
  g.rotation.y = -angle + Math.PI / 2;
  st.group.add(g);
  st.bridge = g;
}

// ---------------------------------------------------------------- flying traffic
// Lights moving along loops between the towers (neon and harbor): one draw call, moved in the shader.
export function buildTraffic(st, { lanes = 6, perLane = 40, r = [170, 300], y = [60, 140], colors = [0xff4fd8, 0x5ff0ff, 0xffd27a] }) {
  const rand = st.rand;
  const n = lanes * perLane;
  const seed = new Float32Array(n * 4);
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const c = new THREE.Color();
  for (let l = 0; l < lanes; l++) {
    const rr = r[0] + rand() * (r[1] - r[0]);
    const yy = y[0] + rand() * (y[1] - y[0]);
    const dir = rand() < 0.5 ? 1 : -1;
    const speed = (0.02 + rand() * 0.03) * dir;
    for (let i = 0; i < perLane; i++) {
      const k = l * perLane + i;
      seed[k * 4] = rr;
      seed[k * 4 + 1] = yy + (rand() - 0.5) * 2;
      seed[k * 4 + 2] = (i / perLane) * Math.PI * 2 + rand() * 0.05;
      seed[k * 4 + 3] = speed;
      c.set(colors[(l + i) % colors.length]);
      col[k * 3] = c.r * 2;
      col[k * 3 + 1] = c.g * 2;
      col[k * 3 + 2] = c.b * 2;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  g.setAttribute('tcol', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: 500 } },
    vertexShader: `attribute vec4 seed; attribute vec3 tcol; uniform float uTime; uniform float uScale; varying vec3 vC;
      void main(){
        float a = seed.z + uTime * seed.w;
        vec3 p = vec3(cos(a) * seed.x, seed.y, sin(a) * seed.x * 1.15);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(2.2 * uScale / max(-mv.z, 1.0), 1.5, 8.0);
        vC = tcol;
      }`,
    fragmentShader: `varying vec3 vC; void main(){ float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard; gl_FragColor = vec4(vC, smoothstep(0.5, 0.15, r)); }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  st.group.add(pts);
  st.traffic = pts;
  st.updaters.push((dt, time, cam) => {
    mat.uniforms.uTime.value = time;
    if (cam) mat.uniforms.uScale.value = st.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
  });
}
