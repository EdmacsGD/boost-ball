// 3D grass with "shells": the field floor is drawn again a few times, each copy a little higher, and
// each copy keeps only the pixels where a blade is tall enough. Stacked, that looks like a lawn of
// short blades. The blades lean in the wind (rolling gusts across the field) and get pushed down and
// aside by cars and the ball. One draw call; the number of shells follows the graphics quality, and
// blades fade into the flat floor with distance so far grass does not shimmer.
import * as THREE from 'three';

const MAX_SHELLS = 14;
const MAX_PUSH = 8;
const HEIGHT = 0.055; // blade height (m)

export class Grass {
  // floorGeo: the non-indexed floor geometry (meters). map: the turf texture. tint: optional color scale.
  constructor(floorGeo, { map, envMap, style = 'grass', shells = 9 } = {}) {
    const base = floorGeo;
    const n = base.attributes.position.count;
    const pos = new Float32Array(n * 3 * MAX_SHELLS);
    const nrm = new Float32Array(n * 3 * MAX_SHELLS);
    const uv = new Float32Array(n * 2 * MAX_SHELLS);
    const shell = new Float32Array(n * MAX_SHELLS);
    for (let s = 0; s < MAX_SHELLS; s++) {
      pos.set(base.attributes.position.array, s * n * 3);
      nrm.set(base.attributes.normal.array, s * n * 3);
      uv.set(base.attributes.uv.array, s * n * 2);
      shell.fill((s + 1) / MAX_SHELLS, s * n, (s + 1) * n);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aShell', new THREE.BufferAttribute(shell, 1));
    g.computeBoundingSphere();
    g.boundingSphere.radius += 1;
    this.geo = g;
    this.vertsPerShell = n;

    this.uniforms = {
      uTime: { value: 0 },
      uPush: { value: Array.from({ length: MAX_PUSH }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uShells: { value: shells },
      uClear: { value: new THREE.Vector3(0, 0, 0) }, // x, z, radius: no grass inside (menu car stand)
    };
    const tip = style === 'snow' ? new THREE.Color(1.05, 1.05, 1.08) : style === 'sand' ? new THREE.Color(1.1, 1.05, 0.95) : new THREE.Color(1.12, 1.18, 0.95);
    // Lambert lighting: the blades are tiny and matte, and it costs far less than the floor's PBR shading.
    const mat = new THREE.MeshLambertMaterial({ map });
    const U = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = U.uTime;
      shader.uniforms.uPush = U.uPush;
      shader.uniforms.uShells = U.uShells;
      shader.uniforms.uClear = U.uClear;
      shader.uniforms.uTip = { value: tip };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute float aShell;
          uniform float uTime;
          uniform float uShells;
          uniform vec4 uPush[${MAX_PUSH}];
          varying float vShell;
          varying vec3 vGrassPos;
          varying float vPressed;`)
        .replace('#include <project_vertex>', `
          vShell = aShell;
          vec4 wp = modelMatrix * vec4(transformed, 1.0);
          float k = aShell * ${MAX_SHELLS.toFixed(1)} / max(uShells, 1.0); // 0..1 through the drawn shells
          // Wind: slow rolling gusts plus a faster flutter. Leans grow with height (k squared).
          float gust = sin(wp.x * 0.11 + uTime * 1.1) * 0.5 + sin(wp.z * 0.07 - uTime * 0.7 + wp.x * 0.03) * 0.5;
          vec2 lean = vec2(0.55, 0.35) * (0.6 + 0.4 * gust) + vec2(sin(uTime * 3.1 + wp.z * 1.7), cos(uTime * 2.7 + wp.x * 1.9)) * 0.18;
          vec2 off = lean * 0.035 * k * k;
          // Cars and the ball flatten the grass under them and push it outward.
          float pressed = 0.0;
          for (int i = 0; i < ${MAX_PUSH}; i++) {
            vec4 p = uPush[i];
            if (p.z <= 0.0) continue;
            vec2 d = wp.xz - p.xy;
            float r = length(d);
            float f = 1.0 - smoothstep(p.z * 0.4, p.z, r);
            pressed = max(pressed, f * p.w);
            off += (r > 0.001 ? d / r : vec2(0.0)) * f * p.w * 0.06 * k;
          }
          vPressed = pressed;
          wp.xz += off;
          wp.y += k * ${HEIGHT.toFixed(3)} * (1.0 - pressed * 0.75);
          vGrassPos = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uShells;
          uniform vec3 uClear;
          uniform vec3 uTip;
          varying float vShell;
          varying vec3 vGrassPos;
          varying float vPressed;
          float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          {
            float k = vShell * ${MAX_SHELLS.toFixed(1)} / max(uShells, 1.0);
            if (k > 1.001) discard;
            if (uClear.z > 0.0 && length(vGrassPos.xz - uClear.xy) < uClear.z) discard;
            // Blades: a jittered grid of cells (about 2.4 cm); each cell has its own height and the
            // blade gets thinner toward its tip.
            vec2 g = vGrassPos.xz * 42.0;
            vec2 cell = floor(g);
            vec2 f = fract(g) - 0.5;
            float h = 0.35 + 0.65 * gHash(cell);
            vec2 c = vec2(gHash(cell + 3.1), gHash(cell + 7.7)) - 0.5;
            float d = length(f - c * 0.4);
            float width = 0.42 * (1.0 - k / h);
            // Far away: fewer shells survive, so the lawn fades into the flat floor.
            float dist = length(vGrassPos - cameraPosition);
            float keep = 1.0 - smoothstep(14.0, 34.0, dist);
            if (k > h * keep || d > width) discard;
            // Darker near the ground, lighter at the tips; flattened grass is a bit lighter (sheen).
            diffuseColor.rgb *= mix(vec3(0.62), uTip, k) * (1.0 + vPressed * 0.12);
          }`);
    };
    mat.customProgramCacheKey = () => 'grass-shells';
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.setShells(shells);
  }

  // Keep a circle free of grass (the glowing stand under the menu car); radius 0 turns it off.
  setClear(x, z, r) {
    this.uniforms.uClear.value.set(x, z, r);
  }

  setShells(count) {
    const n = Math.max(0, Math.min(MAX_SHELLS, Math.round(count)));
    this.uniforms.uShells.value = n;
    this.mesh.visible = n > 0;
    this.geo.setDrawRange(0, this.vertsPerShell * n);
  }

  // pushers: up to 8 { x, z, r, s } (meters; s = 0..1 strength).
  update(time, pushers) {
    this.uniforms.uTime.value = time;
    const arr = this.uniforms.uPush.value;
    for (let i = 0; i < MAX_PUSH; i++) {
      const p = pushers && pushers[i];
      if (p) arr[i].set(p.x, p.z, p.r, p.s);
      else arr[i].set(0, 0, 0, 0);
    }
  }
}
