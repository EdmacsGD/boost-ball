// Small pictures of cars and toppers for the Season Pass and the Orb Shop, drawn with the game's
// own renderer into an off-screen target once and cached as image URLs.
import * as THREE from 'three';
import { CarModel } from './carKit.js';
import { DESIGNS } from './carDesigns.js';
import { buildTopper, disposeTopper } from './toppers.js';
import { CONFIG } from '../config.js';

const W = 256, H = 160;
const cache = new Map();

export class ItemThumbs {
  constructor(renderer) {
    this.r = renderer; // THREE.WebGLRenderer
    this.target = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
    this.target.texture.colorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x1a2233, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(3, 4, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fd0ff, 1.4);
    rim.position.set(-4, 2, -3);
    this.scene.add(rim);
    this.camera = new THREE.PerspectiveCamera(30, W / H, 0.05, 50);
    this.pixels = new Uint8Array(W * H * 4);
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
  }

  // "car:ranger" or "topper:crown" -> image URL (or null for other kinds).
  url(k) {
    if (cache.has(k)) return cache.get(k);
    const [cat, id] = k.split(':');
    let obj = null, dispose = () => {};
    if (cat === 'car' && DESIGNS[id]) {
      const d = DESIGNS[id];
      const m = new CarModel(d, { team: 0, number: 7, hitbox: CONFIG.hitboxes[d.hitbox] });
      obj = m.root;
      obj.rotation.y = -0.6;
      dispose = () => m.dispose?.();
    } else if (cat === 'topper') {
      obj = buildTopper(id, new THREE.Color(CONFIG.teams[0].color));
      if (obj) {
        obj.scale.setScalar(3);
        obj.rotation.y = -0.5;
        dispose = () => disposeTopper(obj);
      }
    }
    if (!obj) {
      cache.set(k, null);
      return null;
    }
    this.scene.add(obj);
    // Frame the object: fit its bounding sphere in the view.
    const box = new THREE.Box3().setFromObject(obj);
    const sph = box.getBoundingSphere(new THREE.Sphere());
    const dist = sph.radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 0.62;
    this.camera.position.copy(sph.center).add(new THREE.Vector3(0.35, 0.32, 1).normalize().multiplyScalar(dist));
    this.camera.lookAt(sph.center);
    const prevTarget = this.r.getRenderTarget();
    const prevClear = this.r.getClearAlpha();
    this.r.setRenderTarget(this.target);
    this.r.setClearColor(0x000000, 0);
    this.r.clear();
    this.r.render(this.scene, this.camera);
    this.r.readRenderTargetPixels(this.target, 0, 0, W, H, this.pixels);
    this.r.setRenderTarget(prevTarget);
    this.r.setClearAlpha(prevClear);
    this.scene.remove(obj);
    dispose();
    // Pixels come out upside down; flip into the canvas.
    const ctx = this.canvas.getContext('2d');
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) img.data.set(this.pixels.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    ctx.putImageData(img, 0, 0);
    const u = this.canvas.toDataURL('image/png');
    cache.set(k, u);
    return u;
  }
}

// The orb: a glowing crystal sphere (inline SVG so it needs no file).
let orbN = 0;
// Each copy gets its own gradient ids: Chrome drops a gradient whose first copy sits in a hidden page.
export const orbSvg = () => { const n = ++orbN; return ORB_SVG.replace(/\b(og|oh)\b/g, (m) => `${m}${n}`); };
export const ORB_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="og" cx="0.35" cy="0.3" r="0.75"><stop offset="0" stop-color="#ffffff"/><stop offset="0.25" stop-color="#9ff4ff"/><stop offset="0.6" stop-color="#5a7dff"/><stop offset="1" stop-color="#3a1f9e"/></radialGradient><radialGradient id="oh" cx="0.5" cy="0.5" r="0.5"><stop offset="0.6" stop-color="#7af0ff" stop-opacity="0.45"/><stop offset="1" stop-color="#7af0ff" stop-opacity="0"/></radialGradient></defs><circle cx="32" cy="32" r="31" fill="url(#oh)"/><circle cx="32" cy="32" r="20" fill="url(#og)"/><path d="M32 14 L37 32 L32 50 L27 32 Z" fill="#ffffff" opacity="0.35"/><path d="M14 32 L32 27 L50 32 L32 37 Z" fill="#ffffff" opacity="0.2"/><ellipse cx="25" cy="23" rx="6" ry="3.5" fill="#fff" opacity="0.7" transform="rotate(-35 25 23)"/></svg>`;
