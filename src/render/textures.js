// Procedural textures drawn on canvases at load time. Nothing is downloaded.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { mulberry32 } from '../util/math.js';

const A = CONFIG.arena;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Smooth value noise on a grid, for patchy grass color.
function makeNoise(seed, cells) {
  const rand = mulberry32(seed);
  const g = new Float32Array((cells + 1) * (cells + 1));
  for (let i = 0; i < g.length; i++) g[i] = rand();
  return (u, v) => {
    const x = u * cells;
    const y = v * cells;
    const xi = Math.floor(x) % cells;
    const yi = Math.floor(y) % cells;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const sx = xf * xf * (3 - 2 * xf);
    const sy = yf * yf * (3 - 2 * yf);
    const a = g[yi * (cells + 1) + xi];
    const b = g[yi * (cells + 1) + xi + 1];
    const c2 = g[(yi + 1) * (cells + 1) + xi];
    const d = g[(yi + 1) * (cells + 1) + xi + 1];
    return a + (b - a) * sx + (c2 - a) * sy + (a - b - c2 + d) * sx * sy;
  };
}

// Field surface with stripes and line markings. Covers x in [-extentX, extentX], z in [-extentY, extentY].
// turf.style: grass | snow | sand | grid. A grid field also gets an emissive map (glowing lines).
export function makeTurfTexture(floorPoly, renderer, turf = {}) {
  const style = turf.style || 'grass';
  const W = 2048;
  const H = 2560;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const sx = W / (A.extentX * 2); // px per uu
  const sy = H / (A.extentY * 2);
  const toPx = (x, y) => [(x + A.extentX) * sx, (y + A.extentY) * sy];

  // Base color, written per pixel.
  const img = ctx.createImageData(W, H);
  const data = img.data;
  const n1 = makeNoise(7, 24);
  const n2 = makeNoise(11, 96);
  const n3 = makeNoise(17, 40);
  const rand = mulberry32(3);
  const stripes = 22;
  const base = turf.base || [30, 84, 38];
  const st = turf.stripe || [9, 18, 6];
  const pa = turf.patch || [10, 20, 8];
  const gr = turf.grain || [8, 14, 6];
  for (let y = 0; y < H; y++) {
    const v = y / H;
    const stripe = Math.floor(v * stripes) % 2;
    const fr = (v * stripes) % 1;
    const edge = Math.min(fr, 1 - fr);
    const soften = edge < 0.02 ? 0.5 + (stripe ? 0.5 : -0.5) * (edge / 0.02) : stripe;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const i = (y * W + x) * 4;
      if (style === 'grid') {
        // Dark glossy deck with faint large-scale variation.
        const p = n1(u, v) * 0.6 + n2(u, v) * 0.4;
        const g = rand();
        data[i] = 12 + p * 8 + g * 3;
        data[i + 1] = 8 + p * 5 + g * 2;
        data[i + 2] = 24 + p * 12 + g * 4;
      } else {
        const patch = n1(u, v) * 0.6 + n2(u, v) * 0.4;
        const grain = rand();
        let k = soften;
        if (style === 'sand') {
          // Wind ripples across the field instead of mowing stripes.
          const warp = n3(u, v) * 30;
          k = 0.5 + 0.5 * Math.sin((x * 0.11 + y * 0.02 + warp) * 0.9);
          k = k * 0.6 + soften * 0.4;
        }
        data[i] = base[0] + k * st[0] + patch * pa[0] + grain * gr[0];
        data[i + 1] = base[1] + k * st[1] + patch * pa[1] + grain * gr[1];
        data[i + 2] = base[2] + k * st[2] + patch * pa[2] + grain * gr[2];
      }
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Team color wash toward each end.
  const blue = CONFIG.teams[0].css;
  const orange = CONFIG.teams[1].css;
  const washHex = Math.round((turf.wash ?? 0.2) * 255).toString(16).padStart(2, '0');
  for (const [y0, col] of [[0, blue], [H, orange]]) {
    const grad = ctx.createLinearGradient(0, y0, 0, y0 === 0 ? H * 0.32 : H * 0.68);
    grad.addColorStop(0, col + washHex);
    grad.addColorStop(1, col + '00');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y0 === 0 ? 0 : H * 0.68, W, H * 0.32);
  }

  const lineColor = turf.lines || 'rgba(240, 248, 240, 0.86)';
  const drawMarkings = (g, color, gridColor) => {
    const lw = (u) => u * sx;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (gridColor) {
      // Neon deck: a 4 m grid of thin lines under the field markings.
      g.strokeStyle = gridColor;
      g.lineWidth = lw(8);
      for (let x = -A.extentX; x <= A.extentX; x += 400) {
        g.beginPath();
        g.moveTo(...toPx(x, -A.extentY));
        g.lineTo(...toPx(x, A.extentY));
        g.stroke();
      }
      for (let y = -A.extentY; y <= A.extentY; y += 400) {
        g.beginPath();
        g.moveTo(...toPx(-A.extentX, y));
        g.lineTo(...toPx(A.extentX, y));
        g.stroke();
      }
    }
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = lw(20);
    const inset = 70;
    g.beginPath();
    floorPoly.forEach((p, i) => {
      const len = Math.hypot(p[0], p[1]);
      const k = (len - inset) / len;
      const [px, py] = toPx(p[0] * k, p[1] * k);
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    });
    g.closePath();
    g.stroke();
    g.beginPath();
    g.moveTo(...toPx(-A.extentX + 330, 0));
    g.lineTo(...toPx(A.extentX - 330, 0));
    g.stroke();
    g.beginPath();
    g.ellipse(...toPx(0, 0), 1000 * sx, 1000 * sy, 0, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.ellipse(...toPx(0, 0), 30 * sx, 30 * sy, 0, 0, Math.PI * 2);
    g.fill();
    for (const s of [-1, 1]) {
      const y0 = s * (A.extentY - 6);
      const box = (hw, depth) => {
        g.beginPath();
        g.moveTo(...toPx(-hw, y0));
        g.lineTo(...toPx(-hw, y0 - s * depth));
        g.lineTo(...toPx(hw, y0 - s * depth));
        g.lineTo(...toPx(hw, y0));
        g.stroke();
      };
      box(1900, 1500);
      box(1150, 560);
      const [cx, cy] = toPx(0, y0 - s * 1500);
      g.beginPath();
      g.ellipse(cx, cy, 700 * sx, 700 * sy, 0, s < 0 ? 0 : Math.PI, s < 0 ? Math.PI : Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.ellipse(...toPx(0, y0 - s * 1050), 24 * sx, 24 * sy, 0, 0, Math.PI * 2);
      g.fill();
    }
    // Center emblem: two chevrons pointing at each goal, in team colors.
    g.lineWidth = lw(26);
    for (const [s, col] of [[-1, blue], [1, orange]]) {
      g.strokeStyle = col + (gridColor ? 'cc' : '55');
      for (let k = 0; k < 2; k++) {
        const off = 250 + k * 230;
        g.beginPath();
        g.moveTo(...toPx(-420, s * (off - 160)));
        g.lineTo(...toPx(0, s * (off + 120)));
        g.lineTo(...toPx(420, s * (off - 160)));
        g.stroke();
      }
    }
  };
  drawMarkings(ctx, lineColor, style === 'grid' ? turf.grid : null);

  const finish = (cv) => {
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false; // canvas row 0 = the blue end (z = -extentY)
    tex.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 8;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    return tex;
  };
  const tex = finish(c);
  if (style === 'grid') {
    // Emissive map: the same markings on black, so only the lines glow.
    const e = canvas(W / 2, H / 2);
    const ectx = e.getContext('2d');
    ectx.fillStyle = '#000';
    ectx.fillRect(0, 0, e.width, e.height);
    ectx.scale(0.5, 0.5);
    drawMarkings(ectx, lineColor, turf.grid);
    tex.userData.emissive = finish(e);
  }
  return tex;
}

// Tiling surface detail for ramps and close-up shading (grass, snow, sand or neon deck).
export function makeGrassTile(renderer, style = 'grass') {
  const S = 256;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const rand = mulberry32(21);
  const n = makeNoise(5, 8);
  const pal = {
    grass: [[30, 88, 40], [10, 20, 8], [8, 14, 6]],
    snow: [[214, 222, 234], [16, 14, 12], [10, 10, 10]],
    sand: [[190, 146, 96], [22, 16, 10], [12, 10, 8]],
    grid: [[22, 14, 38], [10, 6, 14], [4, 3, 6]],
  }[style] || [[30, 88, 40], [10, 20, 8], [8, 14, 6]];
  const [b, pa, gr] = pal;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const p = n(x / S, y / S);
      const g = rand();
      const i = (y * S + x) * 4;
      img.data[i] = b[0] + p * pa[0] + g * gr[0];
      img.data[i + 1] = b[1] + p * pa[1] + g * gr[1];
      img.data[i + 2] = b[2] + p * pa[2] + g * gr[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (style === 'grid') {
    ctx.strokeStyle = 'rgba(255, 90, 220, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, S - 2, S - 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 8;
  return tex;
}

// Grass grain normal map (tiling), built from noise heights.
export function makeGrassNormal() {
  const S = 256;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const rand = mulberry32(99);
  const h = new Float32Array(S * S);
  for (let i = 0; i < h.length; i++) h[i] = rand();
  // Blur a little so it reads as grain, not static.
  const hb = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += h[((y + dy + S) % S) * S + ((x + dx + S) % S)];
      hb[y * S + x] = s / 9;
    }
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const l = hb[y * S + ((x - 1 + S) % S)];
      const r = hb[y * S + ((x + 1) % S)];
      const u = hb[((y - 1 + S) % S) * S + x];
      const d = hb[((y + 1) % S) * S + x];
      let nx = (l - r) * 3;
      let ny = (u - d) * 3;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * S + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Hexagon net mask (white lines on transparent), tiling.
export function makeHexNetTexture() {
  const W = 256;
  const H = Math.round(256 * Math.sqrt(3) / 1.5 / 2) * 2;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = 3;
  const r = W / 6;
  const hh = Math.sqrt(3) * r;
  for (let col = -1; col < 5; col++) {
    for (let row = -1; row < 4; row++) {
      const cx = col * r * 1.5;
      const cy = row * hh + (col % 2 ? hh / 2 : 0);
      ctx.beginPath();
      for (let k = 0; k <= 6; k++) {
        const a = (Math.PI / 3) * k;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Scrolling LED ribbon text.
export function makeRibbonTexture(lines) {
  const W = 2048;
  const H = 128;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#05070c';
  ctx.fillRect(0, 0, W, H);
  ctx.font = '800 76px "Saira Game", "Arial Narrow", Arial, sans-serif';
  ctx.textBaseline = 'middle';
  // Measure one sequence, repeat it a whole number of times and spread the gaps so it tiles seamlessly.
  const widths = lines.map((l) => ctx.measureText(l.text).width);
  const seq = widths.reduce((a, b) => a + b, 0);
  const reps = Math.max(1, Math.floor(W / (seq + lines.length * 90)));
  const gap = (W - reps * seq) / (reps * lines.length);
  let x = gap / 2;
  for (let r = 0; r < reps; r++) {
    lines.forEach((item, i) => {
      ctx.fillStyle = item.color;
      ctx.fillText(item.text, x, H / 2 + 4);
      x += widths[i];
      ctx.fillStyle = '#ffffff55';
      ctx.fillRect(x + gap / 2 - 6, H / 2 - 6, 12, 12);
      x += gap;
    });
  }
  // LED dot mask.
  ctx.globalCompositeOperation = 'destination-in';
  const dot = canvas(4, 4);
  const dctx = dot.getContext('2d');
  dctx.fillStyle = '#fff';
  dctx.fillRect(0, 0, 3, 3);
  ctx.fillStyle = ctx.createPattern(dot, 'repeat');
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#020306';
  ctx.fillRect(0, 0, W, H);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

// Ball surface: a truncated icosahedron panel layout computed per pixel on an equirect map.
// Ball skins (Sport Drops): standard | midnight | golden | lava | beach | eight | globe | disco.
export const BALL_SKIN_MATERIAL = {
  standard: { emissive: [0.55, 0.85, 1.0], roughness: 0.28, metalness: 0.15, halo: 0x9fd8ff },
  midnight: { emissive: [0.3, 0.95, 1.0], roughness: 0.3, metalness: 0.3, halo: 0x3fe0ff },
  golden: { emissive: [1.0, 0.8, 0.45], roughness: 0.2, metalness: 0.9, halo: 0xffd27a },
  lava: { emissive: [1.0, 0.45, 0.1], roughness: 0.75, metalness: 0.0, halo: 0xff7a2a },
  beach: { emissive: [1, 1, 1], roughness: 0.45, metalness: 0.0, halo: 0xfff2c0 },
  eight: { emissive: [1, 1, 1], roughness: 0.12, metalness: 0.05, halo: 0xdde6ff },
  globe: { emissive: [1.0, 0.85, 0.5], roughness: 0.55, metalness: 0.0, halo: 0x8ac8ff },
  disco: { emissive: [1, 1, 1], roughness: 0.12, metalness: 1.0, halo: 0xffffff },
};

function hash3(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
function noise3(x, y, z) {
  const xi = Math.floor(x); const yi = Math.floor(y); const zi = Math.floor(z);
  const xf = x - xi; const yf = y - yi; const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf); const v = yf * yf * (3 - 2 * yf); const w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v),
    w,
  );
}
function fbm(x, y, z) {
  let s = 0;
  let a = 0.5;
  for (let i = 0; i < 4; i++) {
    s += a * noise3(x, y, z);
    x *= 2.03; y *= 2.03; z *= 2.03;
    a *= 0.5;
  }
  return s;
}

export function makeBallTextures(skin = 'standard') {
  const W = 1024;
  const H = 512;
  const phi = (1 + Math.sqrt(5)) / 2;
  // Pentagon centers = icosahedron vertices; hexagon centers = icosahedron face centers.
  const ico = [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
  ].map((v) => { const l = Math.hypot(...v); return v.map((x) => x / l); });
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  const hex = faces.map((f) => {
    const v = [0, 1, 2].map((k) => ico[f[0]][k] + ico[f[1]][k] + ico[f[2]][k]);
    const l = Math.hypot(...v);
    return v.map((x) => x / l);
  });
  const centers = [...ico.map((v) => ({ v, pent: true })), ...hex.map((v) => ({ v, pent: false }))];
  const color = canvas(W, H);
  const glow = canvas(W, H);
  const cctx = color.getContext('2d');
  const gctx = glow.getContext('2d');
  const cimg = cctx.createImageData(W, H);
  const gimg = gctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const lat = Math.PI * (0.5 - (y + 0.5) / H);
    const cl = Math.cos(lat);
    const sl = Math.sin(lat);
    for (let x = 0; x < W; x++) {
      const lon = 2 * Math.PI * ((x + 0.5) / W) - Math.PI;
      // three.js SphereGeometry: x = -cos(lon)*cos(lat), y = sin(lat), z = sin(lon)*cos(lat)
      const px = -Math.cos(lon) * cl;
      const py = sl;
      const pz = Math.sin(lon) * cl;
      let best = -2;
      let second = -2;
      let bestPent = false;
      for (const c of centers) {
        // Pentagons are slightly smaller than hexagons on a real truncated icosahedron.
        const d = (px * c.v[0] + py * c.v[1] + pz * c.v[2]) - (c.pent ? 0.025 : 0);
        if (d > best) {
          second = best;
          best = d;
          bestPent = c.pent;
        } else if (d > second) {
          second = d;
        }
      }
      const seam = best - second; // 0 on the boundary
      const i = (y * W + x) * 4;
      const line = Math.max(0, 1 - seam / 0.016);
      const groove = Math.max(0, 1 - seam / 0.03);
      let r;
      let g;
      let b;
      let er = line * 0.45;
      let eg = line * 0.9;
      let eb = line;
      let shade = true;
      switch (skin) {
        case 'midnight':
          [r, g, b] = bestPent ? [8, 10, 16] : [26, 30, 42];
          [er, eg, eb] = [line, line, line];
          break;
        case 'golden':
          [r, g, b] = bestPent ? [92, 62, 22] : [232, 186, 86];
          [er, eg, eb] = [line * 0.8, line * 0.7, line * 0.4];
          break;
        case 'lava': {
          const n = fbm(px * 4 + 3, py * 4, pz * 4);
          const crack = Math.max(0, 1 - Math.abs(n - 0.5) / 0.035);
          const rock = 30 + n * 40;
          [r, g, b] = [rock + 10, rock * 0.6, rock * 0.5];
          const hot = Math.max(line, crack);
          [er, eg, eb] = [hot, hot * 0.75, hot * 0.4];
          break;
        }
        case 'beach': {
          const seg = Math.floor(((lon + Math.PI) / (Math.PI * 2)) * 6) % 6;
          const cols = [[230, 50, 50], [250, 210, 40], [40, 120, 230], [245, 245, 240], [60, 190, 90], [250, 140, 30]];
          [r, g, b] = Math.abs(lat) > 1.25 ? [245, 245, 240] : cols[seg];
          [er, eg, eb] = [0, 0, 0];
          shade = false;
          break;
        }
        case 'eight': {
          [r, g, b] = [14, 14, 18];
          [er, eg, eb] = [0, 0, 0];
          shade = false;
          // White disc with an "8" on both sides (+z and -z).
          const face = Math.abs(pz);
          if (face > 0.82) {
            [r, g, b] = [246, 246, 242];
            const yy = py;
            const xx = px;
            const ring = (cy, rad) => Math.abs(Math.hypot(xx, yy - cy) - rad) < 0.022;
            if (ring(0.075, 0.05) || ring(-0.07, 0.065)) [r, g, b] = [14, 14, 18];
          }
          break;
        }
        case 'globe': {
          const n = fbm(px * 2.2 + 11, py * 2.2 + 5, pz * 2.2);
          const land = n > 0.52;
          if (Math.abs(lat) > 1.22) [r, g, b] = [240, 246, 250];
          else if (land) [r, g, b] = n > 0.62 ? [120, 100, 60] : [60, 140, 60];
          else [r, g, b] = [24, 80 + n * 60, 170 + n * 40];
          const city = land && hash3(Math.floor(x / 3), Math.floor(y / 3), 7) > 0.985 ? 1 : 0;
          [er, eg, eb] = [city, city * 0.85, city * 0.5];
          shade = false;
          break;
        }
        case 'disco': {
          const tl = 0.11;
          const ti = Math.floor(lat / tl);
          const tj = Math.floor(lon / (tl / Math.max(0.2, cl)));
          const fl = (lat / tl) - ti;
          const fj = (lon / (tl / Math.max(0.2, cl))) - tj;
          const gap = fl < 0.08 || fj < 0.08;
          const v = 150 + hash3(ti, tj, 1) * 105;
          [r, g, b] = gap ? [30, 30, 34] : [v, v, v + 8];
          const spark = !gap && hash3(ti, tj, 9) > 0.93 ? 1 : 0;
          [er, eg, eb] = [spark, spark, spark];
          shade = false;
          break;
        }
        default:
          [r, g, b] = bestPent ? [44, 50, 62] : [236, 240, 246];
      }
      if (shade) {
        r = r * (1 - groove * 0.55);
        g = g * (1 - groove * 0.55);
        b = b * (1 - groove * 0.5);
      }
      cimg.data[i] = r;
      cimg.data[i + 1] = g;
      cimg.data[i + 2] = b;
      cimg.data[i + 3] = 255;
      gimg.data[i] = er * 255;
      gimg.data[i + 1] = eg * 255;
      gimg.data[i + 2] = eb * 255;
      gimg.data[i + 3] = 255;
    }
  }
  cctx.putImageData(cimg, 0, 0);
  gctx.putImageData(gimg, 0, 0);
  const map = new THREE.CanvasTexture(color);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const emissive = new THREE.CanvasTexture(glow);
  emissive.colorSpace = THREE.SRGBColorSpace;
  return { map, emissive };
}

// Soft round sprite (white, alpha falloff), used for glows and blob shadows.
export function makeGlowTexture(size = 128, hard = 0) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(Math.max(0.01, hard), 'rgba(255,255,255,0.85)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

// Car livery: a top-down map (u along the car's length, v across its width) with the team color as
// the base, stripes in the player's accent color and a number. style: twin | single | side | roof | hazard | none.
// paint: body color override (hex) or null for the team color. pattern: finish pattern (carbon, glitter).
// Decal styles (from Sport Drops): checker | stars | camo | flames | tiger | lightning | circuit.
export function makeLiveryTexture(team, number, { accent = '#ffffff', style = 'twin', base = 0.82, paint = null, pattern = null } = {}) {
  const W = 512;
  const H = 512;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const t = CONFIG.teams[team];
  const baseCol = paint !== null && paint !== undefined ? new THREE.Color(paint) : new THREE.Color(t.color).multiplyScalar(base);
  ctx.fillStyle = '#' + baseCol.getHexString();
  ctx.fillRect(0, 0, W, H);
  // Subtle metallic flake via noise, or the finish pattern.
  const img = ctx.getImageData(0, 0, W, H);
  const rand = mulberry32(team * 13 + number);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let k = (rand() - 0.5) * 10;
      if (pattern === 'carbon') {
        // 2x2 twill weave: alternating bands of light and dark threads.
        const cx = Math.floor(x / 8);
        const cy = Math.floor(y / 8);
        const along = (cx + cy) % 2 === 0;
        const f = along ? (x % 8) / 8 : (y % 8) / 8;
        k += (along ? 16 : -16) + Math.sin(f * Math.PI) * 14 - 10;
      } else if (pattern === 'glitter') {
        if (rand() < 0.012) k += 120 + rand() * 80;
      }
      img.data[i] += k;
      img.data[i + 1] += k;
      img.data[i + 2] += k;
    }
  }
  ctx.putImageData(img, 0, 0);
  const dark = '#' + new THREE.Color(t.dark).getHexString();
  ctx.fillStyle = accent;
  if (drawDecal(ctx, style, W, H, accent, dark, rand)) style = 'none-decal';
  switch (style) {
    case 'twin':
      ctx.fillRect(0, H * 0.42, W, H * 0.05);
      ctx.fillRect(0, H * 0.53, W, H * 0.05);
      break;
    case 'single':
      ctx.fillRect(0, H * 0.4, W, H * 0.2);
      ctx.fillStyle = dark;
      ctx.fillRect(0, H * 0.395, W, H * 0.01);
      ctx.fillRect(0, H * 0.595, W, H * 0.01);
      break;
    case 'side':
      for (const v of [0.06, 0.94]) {
        ctx.save();
        ctx.translate(W * 0.5, H * v);
        ctx.transform(1, 0, -0.5, 1, 0, 0);
        ctx.fillRect(-W * 0.35, -H * 0.03, W * 0.7, H * 0.06);
        ctx.restore();
      }
      break;
    case 'roof':
      ctx.fillRect(0, H * 0.2, W, H * 0.6);
      break;
    case 'hazard':
      ctx.save();
      for (const u0 of [0, W * 0.86]) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(u0, 0, W * 0.14, H);
        ctx.clip();
        for (let k = -4; k < 14; k++) {
          ctx.beginPath();
          ctx.moveTo(u0 + k * 26, 0);
          ctx.lineTo(u0 + k * 26 + 13, 0);
          ctx.lineTo(u0 + k * 26 - 120, H);
          ctx.lineTo(u0 + k * 26 - 133, H);
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.restore();
      break;
    default:
      break;
  }
  // Roof number.
  ctx.save();
  ctx.translate(W * 0.47, H * 0.5);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = style === 'roof' || style === 'single' ? dark : '#ffffff';
  if (style === 'none-decal') {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 6;
  }
  ctx.font = '800 92px "Saira Game", "Arial Narrow", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), 0, 6);
  ctx.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Decals from Sport Drops, drawn in the accent color on the top-down livery map (u = rear to front,
// v = across the car, 0.5 is the roof line). Returns false for the built-in stripe styles.
function drawDecal(ctx, style, W, H, accent, dark, rand) {
  const star = (x, y, r, rot = 0) => {
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = rot + (k * Math.PI) / 5 - Math.PI / 2;
      const rr = k % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  };
  switch (style) {
    case 'checker': {
      const s = 32;
      for (let x = 0; x < W; x += s) {
        for (let y = H * 0.3; y < H * 0.7; y += s) {
          ctx.fillStyle = ((x + y) / s) % 2 < 1 ? accent : dark;
          ctx.fillRect(x, y, s, s);
        }
      }
      return true;
    }
    case 'stars': {
      ctx.fillStyle = accent;
      for (let i = 0; i < 26; i++) star(rand() * W, rand() * H, 10 + rand() * 22, rand() * 2);
      return true;
    }
    case 'camo': {
      const base = new THREE.Color(accent);
      const tones = [base.clone().multiplyScalar(0.55), base.clone().multiplyScalar(0.3), new THREE.Color(dark)];
      for (let i = 0; i < 90; i++) {
        ctx.fillStyle = '#' + tones[i % 3].getHexString();
        ctx.beginPath();
        const x = rand() * W;
        const y = rand() * H;
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2;
          const r = 18 + rand() * 26;
          ctx.lineTo(x + Math.cos(a) * r * 1.4, y + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
      }
      return true;
    }
    case 'flames': {
      // Tongues licking back from the nose over the hood and along both sides.
      const grad = ctx.createLinearGradient(W, 0, W * 0.25, 0);
      grad.addColorStop(0, '#ffd34a');
      grad.addColorStop(0.45, accent);
      grad.addColorStop(1, accent);
      ctx.fillStyle = grad;
      for (const [v0, v1] of [[0.0, 0.3], [0.32, 0.68], [0.7, 1.0]]) {
        const n = 4;
        for (let k = 0; k < n; k++) {
          const v = H * (v0 + ((v1 - v0) * (k + 0.5)) / n);
          const len = W * (0.35 + rand() * 0.3);
          const w = ((v1 - v0) * H) / n;
          ctx.beginPath();
          ctx.moveTo(W, v - w * 0.7);
          ctx.quadraticCurveTo(W - len * 0.5, v - w * 0.9, W - len, v + w * 0.15);
          ctx.quadraticCurveTo(W - len * 0.55, v + w * 0.1, W - len * 0.35, v + w * 0.45);
          ctx.quadraticCurveTo(W - len * 0.2, v + w * 0.7, W, v + w * 0.7);
          ctx.fill();
        }
      }
      return true;
    }
    case 'tiger': {
      ctx.fillStyle = dark;
      for (let x = 20; x < W; x += 46 + rand() * 20) {
        ctx.beginPath();
        const w = 8 + rand() * 10;
        ctx.moveTo(x, 0);
        for (let y = 0; y <= H; y += 32) ctx.lineTo(x + Math.sin(y * 0.03 + x) * 22 + (y / H) * 20, y);
        for (let y = H; y >= 0; y -= 32) ctx.lineTo(x + w * (0.4 + 0.6 * Math.abs(Math.sin(y * 0.02))) + Math.sin(y * 0.03 + x) * 22 + (y / H) * 20, y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(0, H * 0.45, W, H * 0.1);
      ctx.globalAlpha = 1;
      return true;
    }
    case 'lightning': {
      ctx.strokeStyle = accent;
      ctx.lineJoin = 'miter';
      for (const v of [0.1, 0.5, 0.9]) {
        ctx.lineWidth = v === 0.5 ? 14 : 9;
        ctx.shadowColor = accent;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        let x = 0;
        ctx.moveTo(0, H * v);
        let up = true;
        while (x < W) {
          x += 34 + rand() * 30;
          ctx.lineTo(x, H * v + (up ? -1 : 1) * (14 + rand() * 18));
          up = !up;
        }
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      return true;
    }
    case 'circuit': {
      ctx.strokeStyle = accent;
      ctx.fillStyle = accent;
      ctx.lineWidth = 4;
      for (let i = 0; i < 40; i++) {
        let x = Math.round((rand() * W) / 16) * 16;
        let y = Math.round((rand() * H) / 16) * 16;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let k = 0; k < 3; k++) {
          if (rand() < 0.5) x += (rand() < 0.5 ? -1 : 1) * 16 * (2 + Math.floor(rand() * 5));
          else y += (rand() < 0.5 ? -1 : 1) * 16 * (2 + Math.floor(rand() * 4));
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      return true;
    }
    default:
      return false;
  }
}
