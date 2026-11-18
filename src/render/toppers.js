// Toppers: small hats and decorations that sit on the car's roof. All original, simple shapes.
// Each builder returns a Group with its base at y = 0, centered on x/z, about 0.3 m across.
import * as THREE from 'three';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...o });
const glow = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });

function mesh(geo, mat, pos = [0, 0, 0], rot = null, scale = null) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  m.castShadow = true;
  return m;
}

const BUILD = {
  // Knit winter hat with a fluffy ball on top.
  beanie(g, team) {
    const knit = std(team.clone().multiplyScalar(0.9), { roughness: 0.95 });
    const rim = std(0xf2f2f2, { roughness: 1 });
    g.add(mesh(new THREE.SphereGeometry(0.13, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), knit, [0, 0.03, 0], null, [1, 1.05, 1]));
    g.add(mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.05, 24), rim, [0, 0.025, 0]));
    for (let i = 0; i < 10; i++) g.add(mesh(new THREE.BoxGeometry(0.008, 0.1, 0.01), std(0xffffff, { roughness: 1 }), [Math.cos(i * 0.628) * 0.12, 0.09, Math.sin(i * 0.628) * 0.12], [0, -i * 0.628, Math.cos(i * 0.628) * 0.35]));
    g.add(mesh(new THREE.IcosahedronGeometry(0.055, 1), rim, [0, 0.19, 0]));
  },
  // Red winter holiday hat with a white band, flopping back.
  holiday(g) {
    const red = std(0xc8202a, { roughness: 0.9 });
    const white = std(0xffffff, { roughness: 1 });
    const cone = mesh(new THREE.ConeGeometry(0.12, 0.3, 18, 1, true), red, [-0.04, 0.17, 0], [0, 0, 0.55]);
    g.add(cone);
    g.add(mesh(new THREE.TorusGeometry(0.12, 0.035, 10, 24), white, [0, 0.035, 0], [Math.PI / 2, 0, 0]));
    g.add(mesh(new THREE.IcosahedronGeometry(0.045, 1), white, [-0.18, 0.24, 0]));
  },
  // Reindeer antlers on a headband, splayed out to the sides, with a little bell.
  antlers(g) {
    const bone = std(0x8a5a32, { roughness: 0.8 });
    const band = std(0x3a2a1e, { roughness: 0.7 });
    g.add(mesh(new THREE.TorusGeometry(0.1, 0.012, 8, 20, Math.PI), band, [0, 0, 0], [0, Math.PI / 2, 0]));
    for (const s of [1, -1]) {
      const a = new THREE.Group();
      a.position.set(0, 0.07, s * 0.07);
      a.rotation.x = s * 0.55;
      a.add(mesh(new THREE.CylinderGeometry(0.011, 0.016, 0.16, 8), bone, [0, 0.08, 0]));
      a.add(mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.08, 8), bone, [0.03, 0.12, 0], [0, 0, -0.9]));
      a.add(mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.07, 8), bone, [-0.025, 0.15, 0], [0, 0, 0.8]));
      g.add(a);
    }
    g.add(mesh(new THREE.SphereGeometry(0.022, 10, 8), std(0xffc63a, { metalness: 0.8, roughness: 0.3 }), [0.02, 0.1, 0]));
  },
  // A layer of snow on the roof with icicles on the edges and a snowball: winter pass.
  snowdrift(g) {
    const snow = std(0xb9c6d6, { roughness: 1 });
    const ice = new THREE.MeshPhysicalMaterial({ color: 0xbfe6ff, roughness: 0.05, transmission: 0.5, transparent: true, opacity: 0.85 });
    g.add(mesh(new THREE.BoxGeometry(0.26, 0.03, 0.22), snow, [0, 0.015, 0]));
    [[0.07, 0.03, 0.05, 0.06], [-0.08, 0.03, -0.04, 0.07], [0.0, 0.03, -0.07, 0.05]].forEach(([x, y, z, r]) => g.add(mesh(new THREE.SphereGeometry(r, 12, 8), snow, [x, y, z], null, [1.4, 0.4, 1])));
    g.add(mesh(new THREE.IcosahedronGeometry(0.035, 1), snow, [-0.02, 0.06, 0.03]));
    for (const x of [0.13, -0.13]) for (let i = 0; i < 4; i++) g.add(mesh(new THREE.ConeGeometry(0.01, 0.05 + (i % 2) * 0.02, 6), ice, [x, -0.01, -0.08 + i * 0.055], [Math.PI, 0, 0]));
  },
  // A crown of ice crystals that glows a little: winter pass, tier 30.
  icecrown(g) {
    const ice = new THREE.MeshPhysicalMaterial({ color: 0xa6e3ff, roughness: 0.05, metalness: 0.1, transmission: 0.4, transparent: true, opacity: 0.9, emissive: 0x2a6cff, emissiveIntensity: 0.35 });
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.05, 6), ice, [0, 0.025, 0]));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.add(mesh(new THREE.ConeGeometry(0.03, i % 2 ? 0.13 : 0.2, 5), ice, [Math.cos(a) * 0.11, i % 2 ? 0.11 : 0.15, Math.sin(a) * 0.11]));
    }
    g.add(mesh(new THREE.OctahedronGeometry(0.035), glow(0xdff6ff), [0, 0.08, 0]));
  },
  // Baseball cap, team colored, brim forward and tipped down a little.
  cap(g, team) {
    const c = std(team, { roughness: 0.8 });
    const dark = std(team.clone().multiplyScalar(0.5), { roughness: 0.8 });
    g.add(mesh(new THREE.SphereGeometry(0.11, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), c, [0, 0.01, 0], null, [1, 0.95, 1]));
    g.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.014, 20, 1, false, -Math.PI / 2, Math.PI), dark, [0.06, 0.02, 0], [0, 0, -0.18], [1.5, 1, 0.95]));
    g.add(mesh(new THREE.SphereGeometry(0.016, 8, 6), dark, [0, 0.115, 0]));
  },
  // Traffic cone.
  cone(g) {
    const o = std(0xff6a00, { roughness: 0.6 });
    const w = std(0xffffff, { roughness: 0.5 });
    g.add(mesh(new THREE.BoxGeometry(0.22, 0.02, 0.22), o, [0, 0.01, 0]));
    g.add(mesh(new THREE.ConeGeometry(0.085, 0.24, 20), o, [0, 0.14, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.044, 0.06, 0.045, 20), w, [0, 0.13, 0]));
  },
  // Party hat with dots and a tassel.
  party(g, team) {
    const c = std(team, { roughness: 0.5 });
    g.add(mesh(new THREE.ConeGeometry(0.09, 0.26, 20), c, [0, 0.13, 0]));
    for (let i = 0; i < 8; i++) g.add(mesh(new THREE.SphereGeometry(0.012, 6, 4), std(i % 2 ? 0xffe14a : 0xffffff), [Math.cos(i) * 0.06 * (1 - (i % 3) * 0.25), 0.05 + (i % 3) * 0.06, Math.sin(i) * 0.06 * (1 - (i % 3) * 0.25)]));
    g.add(mesh(new THREE.IcosahedronGeometry(0.03, 0), std(0xffe14a), [0, 0.27, 0]));
  },
  // Beanie with a little propeller that spins (see update).
  propeller(g, team) {
    const a = std(team, { roughness: 0.8 });
    g.add(mesh(new THREE.SphereGeometry(0.12, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), a, [0, 0.01, 0], null, [1, 0.75, 1]));
    g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8), std(0x333333), [0, 0.12, 0]));
    const p = new THREE.Group();
    p.position.y = 0.15;
    p.userData.spin = 14;
    for (const s of [0, Math.PI]) p.add(mesh(new THREE.BoxGeometry(0.17, 0.006, 0.035), std(s ? 0xff3b3b : 0xffd12a), [Math.cos(s) * 0.085, 0, 0], [0.3, s, 0]));
    g.add(p);
  },
  // Tall black hat with a band.
  tophat(g) {
    const b = std(0x15161a, { roughness: 0.6 });
    g.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.012, 24), b, [0, 0.006, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.095, 0.1, 0.2, 24), b, [0, 0.11, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.102, 0.102, 0.03, 24), std(0xb0192a), [0, 0.035, 0]));
  },
  // Horned helmet.
  viking(g) {
    const steel = std(0x9aa3ad, { metalness: 0.8, roughness: 0.35 });
    const horn = std(0xeee2c6, { roughness: 0.7 });
    g.add(mesh(new THREE.SphereGeometry(0.12, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), steel, [0, 0.01, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.025, 24), std(0x6b4a2a, { roughness: 0.8 }), [0, 0.012, 0]));
    for (const s of [1, -1]) {
      const h = mesh(new THREE.ConeGeometry(0.03, 0.16, 10), horn, [0, 0.11, s * 0.13], [s * 1.0, 0, 0]);
      g.add(h);
    }
  },
  // Pointy wizard hat with stars.
  wizard(g) {
    const blue = std(0x2c2f8f, { roughness: 0.8 });
    g.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.012, 24), blue, [0, 0.006, 0]));
    g.add(mesh(new THREE.ConeGeometry(0.1, 0.26, 20), blue, [-0.02, 0.14, 0], [0, 0, 0.18]));
    for (let i = 0; i < 4; i++) g.add(mesh(new THREE.OctahedronGeometry(0.018), glow(0xffe680), [Math.cos(i * 1.6) * 0.07, 0.06 + i * 0.05, Math.sin(i * 1.6) * 0.07]));
  },
  // Gold crown with jewels.
  crown(g) {
    const gold = std(0xffc63a, { metalness: 0.9, roughness: 0.25 });
    g.add(mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.06, 24, 1, true), gold, [0, 0.03, 0]));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.add(mesh(new THREE.ConeGeometry(0.03, 0.08, 4), gold, [Math.cos(a) * 0.105, 0.1, Math.sin(a) * 0.105]));
      g.add(mesh(new THREE.SphereGeometry(0.016, 8, 6), std([0xe0115f, 0x1f8bff, 0x22c55e][i % 3], { metalness: 0.3, roughness: 0.1 }), [Math.cos(a) * 0.118, 0.035, Math.sin(a) * 0.118]));
    }
  },
  // Glowing ring floating above the roof (bobs, see update).
  halo(g) {
    const r = mesh(new THREE.TorusGeometry(0.11, 0.014, 10, 32), glow(0xfff2a8), [0, 0.14, 0], [Math.PI / 2, 0, 0]);
    r.userData.bob = 0.015;
    g.add(r);
  },
  // Round sunglasses standing on the front of the roof, arms lying back along it.
  sunglasses(g) {
    const frame = std(0x111111, { roughness: 0.3 });
    const lens = new THREE.MeshPhysicalMaterial({ color: 0x24243a, roughness: 0.05, metalness: 0.6, clearcoat: 1 });
    for (const s of [1, -1]) {
      g.add(mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.012, 20), lens, [0.07, 0.06, s * 0.065], [0, 0, Math.PI / 2 - 0.35]));
      g.add(mesh(new THREE.TorusGeometry(0.056, 0.007, 6, 20), frame, [0.07, 0.06, s * 0.065], [0, Math.PI / 2, 0.35]));
      g.add(mesh(new THREE.BoxGeometry(0.17, 0.01, 0.01), frame, [-0.02, 0.012, s * 0.12], [0, 0, -0.25]));
    }
    g.add(mesh(new THREE.BoxGeometry(0.01, 0.01, 0.03), frame, [0.075, 0.075, 0]));
  },
};

export const TOPPER_IDS = Object.keys(BUILD);

export function buildTopper(id, teamColor = new THREE.Color(0x2f8bff)) {
  const fn = BUILD[id];
  if (!fn) return null;
  const g = new THREE.Group();
  g.name = 'topper';
  fn(g, teamColor.clone());
  return g;
}

// Spin and bob the moving parts.
export function animateTopper(g, t) {
  if (!g) return;
  g.traverse((o) => {
    if (o.userData.spin) o.rotation.y = t * o.userData.spin;
    if (o.userData.bob) o.position.y = 0.14 + Math.sin(t * 2.5) * o.userData.bob;
  });
}

export function disposeTopper(g) {
  g?.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });
}
