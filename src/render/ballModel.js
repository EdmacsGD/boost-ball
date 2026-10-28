import * as THREE from 'three';
import { makeBallTextures, makeGlowTexture, BALL_SKIN_MATERIAL } from './textures.js';

// Pearl-white panel ball with glowing seams that flare on hits, plus a ground marker under it.
export class BallModel {
  constructor(radius, envMap) {
    this.radius = radius;
    const { map, emissive } = makeBallTextures();
    this.material = new THREE.MeshPhysicalMaterial({
      map,
      emissiveMap: emissive,
      emissive: new THREE.Color(0.55, 0.85, 1.0),
      emissiveIntensity: 0.55,
      roughness: 0.28,
      metalness: 0.15,
      clearcoat: 0.8,
      clearcoatRoughness: 0.15,
      envMap,
      envMapIntensity: 1.1,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 32), this.material);
    this.mesh.castShadow = true;
    this.root = new THREE.Group();
    this.root.add(this.mesh);
    this.hitGlow = 0;
    this.skin = 'standard';

    // Ground marker: a dark disc directly under the ball, sharper and darker when the ball is low.
    const tex = makeGlowTexture(128, 0.0);
    this.marker = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: tex, color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.renderOrder = 1;
    // Faint halo so the ball reads against the dark stands.
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x9fd8ff, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(radius * 3.6);
    this.halo = halo;
    this.root.add(halo);
  }

  // Ball skin from Sport Drops (textures.js BALL_SKIN_MATERIAL keys).
  setSkin(skin = 'standard') {
    if (skin === this.skin) return;
    this.skin = skin;
    const m = BALL_SKIN_MATERIAL[skin] || BALL_SKIN_MATERIAL.standard;
    const { map, emissive } = makeBallTextures(skin);
    this.material.map?.dispose();
    this.material.emissiveMap?.dispose();
    this.material.map = map;
    this.material.emissiveMap = emissive;
    this.material.emissive.setRGB(...m.emissive);
    this.material.roughness = m.roughness;
    this.material.metalness = m.metalness;
    this.material.needsUpdate = true;
    this.halo.material.color.set(m.halo);
  }

  hit(strength) {
    this.hitGlow = Math.min(1.5, this.hitGlow + strength);
  }

  update(dt, pos, quat, groundY = 0) {
    this.root.position.copy(pos);
    this.mesh.quaternion.copy(quat);
    this.hitGlow = Math.max(0, this.hitGlow - dt * 2.5);
    this.material.emissiveIntensity = 0.55 + this.hitGlow * 3.5;
    this.halo.material.opacity = 0.14 + this.hitGlow * 0.35;
    const h = Math.max(0, pos.y - this.radius - groundY);
    const s = this.radius * (1.7 + h * 0.05);
    this.marker.position.set(pos.x, groundY + 0.02, pos.z);
    this.marker.scale.set(s, s, 1);
    this.marker.material.opacity = Math.max(0.12, 0.55 - h * 0.025);
  }
}
