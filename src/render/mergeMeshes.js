// Fewer draw calls: meshes that never move on their own and share a material are merged into one.
// Each draw call costs CPU time in WebGL (and a lot of it on weak laptops), so a scene of 1500 small
// meshes renders far slower than the same triangles in 300 meshes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Merge the direct child meshes of `group` with the same material and drawing settings. `pinned`:
// objects the code holds on to (moves, hides, recolors one by one); those are never merged.
// The originals were never drawn, so they hold no GPU memory.
export function mergeChildren(group, pinned = null) {
  const buckets = new Map();
  for (const m of group.children) {
    if (!m.isMesh || m.isInstancedMesh || m.isSkinnedMesh || m.children.length || Array.isArray(m.material) || !m.geometry) continue;
    if (pinned && pinned.has(m)) continue;
    if (m.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) continue;
    const g = m.geometry;
    if (g.morphAttributes && Object.keys(g.morphAttributes).length) continue;
    const key = [m.material.uuid, Object.keys(g.attributes).sort().join(','), g.index ? 'i' : 'n', m.castShadow, m.receiveShadow,
      m.visible, m.renderOrder, m.frustumCulled, m.layers.mask].join('|');
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(m);
  }
  let saved = 0;
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const geos = list.map((m) => {
      m.updateMatrix();
      const c = m.geometry.clone();
      c.clearGroups(); // one material for the whole mesh, so per-face groups (boxes have 6) do not matter
      c.applyMatrix4(m.matrix);
      return c;
    });
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const first = list[0];
    const mesh = new THREE.Mesh(merged, first.material);
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.visible = first.visible;
    mesh.renderOrder = first.renderOrder;
    mesh.frustumCulled = first.frustumCulled;
    mesh.layers.mask = first.layers.mask;
    for (const m of list) group.remove(m);
    group.add(mesh);
    saved += list.length - 1;
  }
  return saved;
}

// Every Object3D reachable from an object's own fields (one level into arrays and plain objects).
export function pinnedFrom(owner) {
  const out = new Set();
  const take = (v, depth) => {
    if (!v || typeof v !== 'object') return;
    if (v.isObject3D) {
      out.add(v);
      return;
    }
    if (depth > 2) return;
    if (Array.isArray(v)) for (const x of v) take(x, depth + 1);
    else if (Object.getPrototypeOf(v) === Object.prototype) for (const x of Object.values(v)) take(x, depth + 1);
  };
  for (const v of Object.values(owner)) take(v, 0);
  return out;
}

// Merge throughout a tree (each group's own children), keeping pinned objects and their insides.
export function mergeTree(root, pinned) {
  let saved = 0;
  const groups = [];
  root.traverse((o) => {
    if (o.children.length > 1) groups.push(o);
  });
  for (const g of groups) {
    let inside = false;
    for (let p = g; p; p = p.parent) if (p !== root && pinned.has(p) && p !== g) inside = true;
    if (inside) continue;
    saved += mergeChildren(g, pinned);
  }
  return saved;
}
