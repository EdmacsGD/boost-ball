// Boost pad visuals: big pads hold a floating energy core, small pads are glowing plates.
import * as THREE from 'three';
import { makeGlowTexture } from './textures.js';

const CORE = new THREE.Color(1.0, 0.72, 0.18);
const DIM = new THREE.Color(0.18, 0.12, 0.06);

export class BoostPadVisuals {
  constructor(pads, envMap) {
    this.group = new THREE.Group();
    this.items = [];
    const glowTex = makeGlowTexture(128, 0.1);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1b1f27, metalness: 0.75, roughness: 0.35, envMap, envMapIntensity: 0.9 });
    const bigBase = new THREE.CylinderGeometry(1.55, 1.75, 0.12, 40);
    const bigRing = new THREE.TorusGeometry(1.25, 0.07, 10, 48);
    const smallBase = new THREE.CylinderGeometry(0.62, 0.7, 0.06, 32);
    const smallDisc = new THREE.CircleGeometry(0.46, 32);
    const coreGeo = new THREE.IcosahedronGeometry(0.42, 2);
    const cageGeo = new THREE.TorusGeometry(0.6, 0.025, 6, 40);
    for (const pad of pads) {
      const g = new THREE.Group();
      g.position.set(pad.pos.x, 0, pad.pos.z);
      const item = { pad, group: g, t: 0, active: true, fill: 1 };
      if (pad.big) {
        const base = new THREE.Mesh(bigBase, baseMat);
        base.position.y = 0.06;
        base.receiveShadow = true;
        g.add(base);
        const ringMat = new THREE.MeshBasicMaterial({ color: CORE.clone().multiplyScalar(2.2), toneMapped: false });
        const ring = new THREE.Mesh(bigRing, ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.13;
        g.add(ring);
        const coreMat = new THREE.MeshBasicMaterial({ color: CORE.clone().multiplyScalar(3), toneMapped: false });
        const core = new THREE.Mesh(coreGeo, coreMat);
        core.position.y = 1.15;
        g.add(core);
        const cages = [];
        for (let k = 0; k < 2; k++) {
          const cage = new THREE.Mesh(cageGeo, ringMat);
          cage.position.y = 1.15;
          g.add(cage);
          cages.push(cage);
        }
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb648, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 }));
        halo.scale.setScalar(3.6);
        halo.position.y = 1.15;
        g.add(halo);
        // Light column above the pad.
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.5, 1.2, 4.5, 24, 1, true),
          new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            uniforms: { uOpacity: { value: 1 } },
            vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
            fragmentShader: 'uniform float uOpacity; varying float vY; void main(){ float a = (1.0 - vY) * (1.0 - vY) * 0.22 * uOpacity; gl_FragColor = vec4(vec3(1.0,0.62,0.15) * a, 1.0); }',
          }),
        );
        beam.position.y = 2.25;
        g.add(beam);
        Object.assign(item, { ringMat, core, coreMat, cages, halo, beam });
      } else {
        const base = new THREE.Mesh(smallBase, baseMat);
        base.position.y = 0.03;
        base.receiveShadow = true;
        g.add(base);
        const discMat = new THREE.MeshBasicMaterial({ color: CORE.clone().multiplyScalar(2.0), toneMapped: false });
        const disc = new THREE.Mesh(smallDisc, discMat);
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = 0.065;
        g.add(disc);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa83a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.45 }));
        halo.scale.set(1.8, 0.6, 1);
        halo.position.y = 0.2;
        g.add(halo);
        Object.assign(item, { discMat, halo });
      }
      this.group.add(g);
      this.items.push(item);
    }
  }

  update(dt, time, activeStates) {
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const active = activeStates ? activeStates[i] : it.pad.active;
      // Fill animates back up when a pad respawns.
      it.fill += ((active ? 1 : 0) - it.fill) * Math.min(1, dt * (active ? 3 : 14));
      const f = it.fill;
      if (it.pad.big) {
        const s = Math.max(0.001, f);
        it.core.scale.setScalar(s * (1 + 0.06 * Math.sin(time * 4 + i)));
        it.core.position.y = 1.15 + Math.sin(time * 2 + i) * 0.08;
        it.core.rotation.y += dt * 1.2;
        it.core.rotation.x += dt * 0.7;
        it.cages[0].rotation.set(time * 1.3 + i, time * 0.9, 0);
        it.cages[1].rotation.set(-time * 0.8, time * 1.6 + i, Math.PI / 2);
        for (const c of it.cages) c.scale.setScalar(Math.max(0.001, f));
        it.halo.material.opacity = 0.7 * f;
        it.halo.position.y = it.core.position.y;
        it.beam.material.uniforms.uOpacity.value = f;
        it.ringMat.color.copy(DIM).lerp(CORE, f).multiplyScalar(0.6 + 1.6 * f);
      } else {
        it.discMat.color.copy(DIM).lerp(CORE, f).multiplyScalar(0.5 + 1.6 * f);
        it.halo.material.opacity = 0.45 * f;
      }
    }
  }
}
