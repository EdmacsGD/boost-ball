// Builds the arena shell as triangles: floor, curved floor-to-wall ramps, walls, curved wall-to-ceiling
// ramps, ceiling, and two goal boxes. The same data feeds the physics collider and the visible walls,
// so what you see is exactly what the ball and cars hit.
//
// Plan view is an octagon (side walls, back walls, 45 degree corners) with rounded corners.
// Every footprint sample sweeps a vertical profile inward. Near the goals the floor ramp shrinks to
// zero so the goal mouth sits on flat ground.

import { CONFIG } from '../config.js';
import { smoothstep } from '../util/math.js';

const A = CONFIG.arena;

// Octagon corners (uu), counter-clockwise when viewed with +x right and +y up.
function octagon() {
  const X = A.extentX;
  const Y = A.extentY;
  const C = A.cornerPlane;
  return [
    [X, -(C - X)], [X, C - X], [C - Y, Y], [-(C - Y), Y],
    [-X, C - X], [-X, -(C - X)], [-(C - Y), -Y], [C - Y, -Y],
  ];
}

// Sample the rounded octagon. Each sample: position, inward normal, arc length, ramp radius, flags.
export function sampleFootprint({ straightStep = 256, taperStep = 60, arcSegments = 8 } = {}) {
  const pts = octagon();
  const n = pts.length;
  const R = A.cornerFillet;
  const gw = A.goalHalfWidth;
  const taper = A.goalRampTaper;
  const out = [];

  const edgeDir = (i) => {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    return [dx / len, dy / len, len];
  };

  // Interior angle is 135 degrees everywhere, so the fillet trims this much off each edge end.
  const trim = R * Math.tan(Math.PI / 8);

  for (let i = 0; i < n; i++) {
    const [dx, dy, len] = edgeDir(i);
    const a = pts[i];
    // Inward normal for a CCW polygon: rotate the edge direction +90 degrees.
    const nx = -dy;
    const ny = dx;
    const isBack = Math.abs(dy) < 1e-6; // back walls run along x
    // Straight part from a + trim to b - trim.
    const s0 = trim;
    const s1 = len - trim;
    const params = [];
    const addRange = (from, to, step) => {
      const count = Math.max(1, Math.ceil((to - from) / step));
      for (let k = 0; k < count; k++) params.push(from + ((to - from) * k) / count);
    };
    if (isBack) {
      // Break exactly at the goal posts; sample the ramp taper zone finely; nothing inside the mouth.
      const xAt = (s) => a[0] + dx * s;
      const sAtX = (x) => (x - a[0]) / dx;
      const breaks = [gw + taper, gw, -gw, -(gw + taper)].map(sAtX).sort((p, q) => p - q);
      const segs = [s0, ...breaks, s1];
      for (let k = 0; k < segs.length - 1; k++) {
        const from = segs[k];
        const to = segs[k + 1];
        const midX = Math.abs(xAt((from + to) / 2));
        if (midX < gw) {
          params.push(from); // mouth: just the post sample, the next sample is the other post
        } else if (midX < gw + taper) {
          addRange(from, to, taperStep);
        } else {
          addRange(from, to, straightStep);
        }
      }
    } else {
      addRange(s0, s1, straightStep);
    }
    for (const s of params) {
      const x = a[0] + dx * s;
      const y = a[1] + dy * s;
      let rf = A.floorRampRadius;
      let mouth = false;
      if (isBack) {
        rf *= smoothstep(gw, gw + taper, Math.abs(x));
        if (Math.abs(x) <= gw + 1e-3) mouth = true;
      }
      out.push({ x, y, nx, ny, rf, mouth, back: isBack, sign: isBack ? Math.sign(y) : 0 });
    }
    // Fillet arc around corner b.
    const [dx2, dy2] = edgeDir((i + 1) % n);
    const b = pts[(i + 1) % n];
    const tA = [b[0] - dx * trim, b[1] - dy * trim]; // tangent point on this edge
    const cx = tA[0] + nx * R;
    const cy = tA[1] + ny * R;
    const startAng = Math.atan2(tA[1] - cy, tA[0] - cx);
    const tB = [b[0] + dx2 * trim, b[1] + dy2 * trim];
    let endAng = Math.atan2(tB[1] - cy, tB[0] - cx);
    let delta = endAng - startAng;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    for (let k = 0; k < arcSegments; k++) {
      const ang = startAng + (delta * k) / arcSegments;
      const x = cx + Math.cos(ang) * R;
      const y = cy + Math.sin(ang) * R;
      // Inward normal points toward the fillet center.
      const inx = (cx - x) / R;
      const iny = (cy - y) / R;
      out.push({ x, y, nx: inx, ny: iny, rf: A.floorRampRadius, mouth: false, back: false, sign: 0 });
    }
  }
  // Arc length along the wall for texture coordinates.
  let s = 0;
  for (let i = 0; i < out.length; i++) {
    if (i > 0) s += Math.hypot(out[i].x - out[i - 1].x, out[i].y - out[i - 1].y);
    out[i].s = s;
  }
  out.perimeter = s + Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y);
  return out;
}

// Vertical profile for one sample: list of {d, z, nd, nz, part}. d = inward distance from the wall line.
function profile(rf, rampSteps, ceilSteps) {
  const H = A.height;
  const rc = A.ceilingRampRadius;
  const p = [];
  for (let k = 0; k <= rampSteps; k++) {
    const th = (Math.PI / 2) * (k / rampSteps);
    p.push({ d: rf - rf * Math.sin(th), z: rf - rf * Math.cos(th), nd: Math.sin(th), nz: Math.cos(th), part: 'ramp' });
  }
  p.push({ d: 0, z: A.goalHeight, nd: 1, nz: 0, part: 'wall' });
  for (let k = 0; k <= ceilSteps; k++) {
    const ph = (Math.PI / 2) * (k / ceilSteps);
    p.push({ d: rc - rc * Math.cos(ph), z: H - rc + rc * Math.sin(ph), nd: Math.cos(ph), nz: -Math.sin(ph), part: 'ceilRamp' });
  }
  return p;
}

// Triangulate a simple polygon (2D, uu) with ear clipping. Points are [x, y].
function earcut2D(poly) {
  const idx = poly.map((_, i) => i);
  const tris = [];
  const area = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  let signed = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    signed += a[0] * b[1] - b[0] * a[1];
  }
  const ccw = signed > 0;
  const inside = (p, a, b, c) => {
    const d1 = area(p, a, b);
    const d2 = area(p, b, c);
    const d3 = area(p, c, a);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(neg && pos);
  };
  let guard = 0;
  while (idx.length > 3 && guard++ < 100000) {
    let found = false;
    for (let i = 0; i < idx.length; i++) {
      const i0 = idx[(i + idx.length - 1) % idx.length];
      const i1 = idx[i];
      const i2 = idx[(i + 1) % idx.length];
      const a = poly[i0];
      const b = poly[i1];
      const c = poly[i2];
      const ar = area(a, b, c);
      if (ccw ? ar <= 1e-9 : ar >= -1e-9) continue;
      let ok = true;
      for (const j of idx) {
        if (j === i0 || j === i1 || j === i2) continue;
        if (inside(poly[j], a, b, c)) { ok = false; break; }
      }
      if (!ok) continue;
      tris.push(ccw ? [i0, i1, i2] : [i0, i2, i1]);
      idx.splice(i, 1);
      found = true;
      break;
    }
    if (!found) break;
  }
  if (idx.length === 3) tris.push(ccw ? [idx[0], idx[1], idx[2]] : [idx[0], idx[2], idx[1]]);
  return tris;
}

// Resolution: the curved ramps are made of flat strips, and a ball rolling across the joint between
// two strips gets a small bounce (restitution 0.6 on the angle change). With 12 strips per quarter
// circle (7.5 degrees each) a ball rolling into the wall at 2400 uu/s hopped clean off it; with 48
// (1.9 degrees) it rolls up the wall and stays on. Costs about 7% more physics time per tick.
// Main builder. Returns surfaces in uu with (x, y, z) z-up coordinates. Each surface is a list of
// triangles with per-vertex normals pointing into the play volume, plus wall arc length for UVs.
export function buildArenaSurfaces({ straightStep = 256, taperStep = 60, arcSegments = 12, rampSteps = 48, ceilSteps = 16 } = {}) {
  const fp = sampleFootprint({ straightStep, taperStep, arcSegments });
  const surfaces = {
    floor: [], ramp: [], wall: [], ceilRamp: [], ceiling: [],
    goalFloor: [], goalWall: [], goalRoof: [], goalBack: [],
  };
  const vert = (x, y, z, nx, ny, nz, u, v) => ({ x, y, z, nx, ny, nz, u, v });
  const H = A.height;
  const rc = A.ceilingRampRadius;

  // Swept shell.
  const rings = fp.map((f) => profile(f.rf, rampSteps, ceilSteps).map((p) => vert(
    f.x + f.nx * p.d, f.y + f.ny * p.d, p.z,
    f.nx * p.nd, f.ny * p.nd, p.nz,
    f.s, p.z,
  )));
  const count = fp.length;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    const fa = fp[i];
    const fb = fp[j];
    const ra = rings[i];
    const rb = rings[j];
    const uWrap = j === 0 ? fp.perimeter : rb[0].u;
    for (let k = 0; k < ra.length - 1; k++) {
      // Strips: [0, rampSteps) floor ramp, rampSteps and rampSteps+1 wall (below and above goal height),
      // the rest the ceiling ramp.
      const part = k < rampSteps ? 'ramp' : k <= rampSteps + 1 ? 'wall' : 'ceilRamp';
      // The floor ramp and the low wall strip are open across the goal mouth.
      const lowStrip = k <= rampSteps;
      if (fa.mouth && fb.mouth && lowStrip) continue;
      const a0 = ra[k];
      const a1 = ra[k + 1];
      const b0 = { ...rb[k], u: uWrap };
      const b1 = { ...rb[k + 1], u: uWrap };
      const target = surfaces[part];
      // Winding chosen so the face normal points inward (checked against vertex normals below).
      target.push([a0, b0, b1], [a0, b1, a1]);
    }
  }

  // Floor polygon: the inner edge of the floor ramp at every sample.
  const floorPoly = fp.map((f) => [f.x + f.nx * f.rf, f.y + f.ny * f.rf]);
  for (const [i0, i1, i2] of earcut2D(floorPoly)) {
    const p = [floorPoly[i0], floorPoly[i1], floorPoly[i2]];
    surfaces.floor.push(p.map((q) => vert(q[0], q[1], 0, 0, 0, 1, q[0], q[1])));
  }
  // Ceiling polygon.
  const ceilPoly = fp.map((f) => [f.x + f.nx * rc, f.y + f.ny * rc]);
  for (const [i0, i1, i2] of earcut2D(ceilPoly)) {
    const p = [ceilPoly[i0], ceilPoly[i2], ceilPoly[i1]];
    surfaces.ceiling.push(p.map((q) => vert(q[0], q[1], H, 0, 0, -1, q[0], q[1])));
  }

  // Goals: a box with rounded inside edges (floor, roof and side edges, and the back corners), so
  // the ball rolls around the inside instead of hitting a hard corner. Built as a rounded-rectangle
  // tube from the mouth to the back, closed by a rounded back. At the mouth the rounding starts at
  // zero and grows to full size over the first 3 m, so the opening stays a clean rectangle and a
  // ball rolling in along a post meets no lip.
  const gw = A.goalHalfWidth;
  const gh = A.goalHeight;
  const Y0 = A.extentY;
  const Y1 = A.extentY + A.goalDepth;
  const r = A.goalCornerRadius;
  const taperLen = A.goalCornerTaper;
  const yb = Y1 - r; // where the back rounding starts
  const arcN = 6;
  // Cross-section ring: corner sign (x, z) and the start angle of its arc, counter-clockwise from
  // the bottom right. Outward = from the corner's center toward the surface.
  const corners = [[1, -1, -90], [1, 1, 0], [-1, 1, 90], [-1, -1, 180]];
  const ring = [];
  for (const [sx, sz, a0] of corners) {
    for (let k = 0; k <= arcN; k++) {
      const a = ((a0 + (90 * k) / arcN) * Math.PI) / 180;
      ring.push([sx, sz, Math.cos(a), Math.sin(a)]);
    }
  }
  const classify = (n) => (n[2] > 0.92 ? surfaces.goalFloor : n[2] < -0.92 ? surfaces.goalRoof : Math.abs(n[1]) > 0.7 ? surfaces.goalBack : surfaces.goalWall);
  for (const s of [-1, 1]) {
    // Rows from the mouth to the back. rr: corner radius of the cross-section; c and sy: how far
    // round the back rounding is (c = 1, sy = 0 on the straight part).
    const rows = [];
    const taperRows = 6;
    for (let k = 0; k <= taperRows; k++) {
      const t = k / taperRows;
      rows.push({ y: Y0 + taperLen * t, rr: r * t * t * (3 - 2 * t), c: 1, sy: 0 });
    }
    for (let k = 0; k <= arcN; k++) {
      const phi = ((90 * k) / arcN) * Math.PI / 180;
      rows.push({ y: yb + r * Math.sin(phi), rr: r, c: Math.cos(phi), sy: Math.sin(phi) });
    }
    const point = (row, q) => {
      const [sx, sz, ox, oz] = q;
      const cx = sx * (gw - row.rr);
      const cz = sz > 0 ? gh - row.rr : row.rr;
      return vert(cx + row.rr * row.c * ox, s * row.y, cz + row.rr * row.c * oz, -row.c * ox, -s * row.sy, -row.c * oz, cx, cz);
    };
    for (let i = 0; i < rows.length - 1; i++) {
      for (let j = 0; j < ring.length; j++) {
        const q0 = ring[j];
        const q1 = ring[(j + 1) % ring.length];
        const a0 = point(rows[i], q0);
        const a1 = point(rows[i], q1);
        const b0 = point(rows[i + 1], q0);
        const b1 = point(rows[i + 1], q1);
        const n = [(a0.nx + a1.nx + b0.nx + b1.nx) / 4, (a0.ny + a1.ny + b0.ny + b1.ny) / 4, (a0.nz + a1.nz + b0.nz + b1.nz) / 4];
        const list = classify(n);
        // Skip the zero-area slivers where a corner arc has shrunk to a point.
        const area = (p, q, w) => Math.hypot(
          (q.y - p.y) * (w.z - p.z) - (q.z - p.z) * (w.y - p.y),
          (q.z - p.z) * (w.x - p.x) - (q.x - p.x) * (w.z - p.z),
          (q.x - p.x) * (w.y - p.y) - (q.y - p.y) * (w.x - p.x),
        );
        if (area(a0, b0, b1) > 1e-3) list.push([a0, b0, b1]);
        if (area(a0, b1, a1) > 1e-3) list.push([a0, b1, a1]);
      }
    }
    // Flat back: the core rectangle at the very back.
    const bv = (x, z) => vert(x, s * Y1, z, 0, -s, 0, x, z);
    surfaces.goalBack.push([bv(-gw + r, r), bv(gw - r, r), bv(gw - r, gh - r)], [bv(-gw + r, r), bv(gw - r, gh - r), bv(-gw + r, gh - r)]);
  }

  // Fix winding so every triangle's face normal agrees with its vertex normals (points into the field).
  for (const key of Object.keys(surfaces)) {
    for (const tri of surfaces[key]) {
      const [a, b, c] = tri;
      const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
      const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
      const fx = uy * vz - uz * vy;
      const fy = uz * vx - ux * vz;
      const fz = ux * vy - uy * vx;
      const nx = a.nx + b.nx + c.nx;
      const ny = a.ny + b.ny + c.ny;
      const nz = a.nz + b.nz + c.nz;
      if (fx * nx + fy * ny + fz * nz < 0) {
        tri[1] = c;
        tri[2] = b;
      }
    }
  }

  return { surfaces, footprint: fp, floorPoly };
}

// Flatten surfaces into one welded, indexed mesh in meters with Three.js axes (y up).
// Triangles keep their winding (face normal into the field) after the axis swap is applied.
export function surfacesToMesh(surfaces, keys, scale = 0.01) {
  const map = new Map();
  const positions = [];
  const indices = [];
  const keyOf = (v) => `${Math.round(v.x * 100)},${Math.round(v.y * 100)},${Math.round(v.z * 100)}`;
  const idx = (v) => {
    const k = keyOf(v);
    let i = map.get(k);
    if (i === undefined) {
      i = positions.length / 3;
      positions.push(v.x * scale, v.z * scale, v.y * scale);
      map.set(k, i);
    }
    return i;
  };
  for (const key of keys) {
    for (const [a, b, c] of surfaces[key]) {
      const ia = idx(a);
      const ib = idx(b);
      const ic = idx(c);
      if (ia === ib || ib === ic || ia === ic) continue;
      // Swapping y and z mirrors handedness, so swap two indices to keep the face normal inward.
      indices.push(ia, ic, ib);
    }
  }
  return { vertices: new Float32Array(positions), indices: new Uint32Array(indices) };
}
