// Arena: field, walls, goals, stands with crowd, roof lights, sky and scenery, styled by a theme
// (render/arenaThemes.js). Original design.
import * as THREE from 'three';
import { Grass } from './grass.js';
import { mergeTree, pinnedFrom } from './mergeMeshes.js';
import { buildRanges, buildTrees, buildIslands, buildClouds, buildTurbines, buildBridge, buildTraffic } from './scenery.js';
import { CONFIG } from '../config.js';
import { UU, mulberry32 } from '../util/math.js';
import { makeTurfTexture, makeGrassTile, makeGrassNormal, makeHexNetTexture, makeRibbonTexture, makeGlowTexture } from './textures.js';
import { NOISE, HEX } from './shaders.js';
import { themeFor } from './arenaThemes.js';

const A = CONFIG.arena;
const BLUE = new THREE.Color(CONFIG.teams[0].color);
const ORANGE = new THREE.Color(CONFIG.teams[1].color);

// Surfaces from arenaShape (uu, z-up) to a three.js geometry (meters, y-up).
function surfaceGeometry(surfaces, keys, uvFn) {
  const pos = [];
  const nrm = [];
  const uv = [];
  for (const key of keys) {
    for (const tri of surfaces[key]) {
      // Swapping y/z flips handedness, so reverse the winding to keep faces pointing inward.
      for (const v of [tri[0], tri[2], tri[1]]) {
        pos.push(v.x * UU, v.z * UU, v.y * UU);
        nrm.push(v.nx, v.nz, v.ny);
        const t = uvFn(v, key);
        uv.push(t[0], t[1]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

function shaderMat(params) {
  return new THREE.ShaderMaterial({
    ...params,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, params.uniforms || {}]),
    fog: true,
  });
}

const FOG_V = /* glsl */ `
#include <fog_pars_vertex>
`;
const FOG_F = /* glsl */ `
#include <fog_pars_fragment>
`;
const OUT_F = /* glsl */ `
#include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
`;

const col3 = (a) => new THREE.Color(a[0], a[1], a[2]);

export class Stadium {
  constructor(renderer, pw, quality, arenaId = 'aurora') {
    this.renderer = renderer;
    this.pw = pw;
    this.quality = quality;
    this.arenaId = arenaId;
    this.theme = themeFor(arenaId);
    this.arenaName = (CONFIG.arenas.find((a) => a.id === arenaId) || CONFIG.arenas[0]).name;
    this.group = new THREE.Group();
    this.time = 0;
    this.cheer = [0, 0];
    this.updaters = [];
    this.rand = mulberry32(1234);

    this.buildLights();
    this.buildField();
    this.buildWalls();
    this.buildGoals();
    this.buildStands();
    this.buildApron();
    this.buildRoof();
    this.buildJumbotron();
    this.buildSky();
    this.buildProps();
    // Merge static parts that share a material (hundreds of light and trim meshes) into a few
    // meshes. Anything the stadium keeps a reference to (animated or toggled) is left alone.
    this.merged = mergeTree(this.group, pinnedFrom(this));
  }

  // Free GPU memory when switching arenas.
  dispose() {
    const seen = new Set();
    this.group.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry)) {
        seen.add(o.geometry);
        o.geometry.dispose();
      }
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        if (seen.has(m)) continue;
        seen.add(m);
        for (const v of Object.values(m)) if (v && v.isTexture && !seen.has(v)) { seen.add(v); v.dispose(); }
        if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u.value && u.value.isTexture && !seen.has(u.value)) { seen.add(u.value); u.value.dispose(); }
        m.dispose();
      }
    });
    this.envMap?.dispose();
    this.keyLight?.shadow?.map?.dispose();
  }

  // ------------------------------------------------------------------ lights and reflections
  buildLights() {
    const scene = this.group;
    const T = this.theme;
    const hemi = new THREE.HemisphereLight(T.hemi.sky, T.hemi.ground, T.hemi.intensity);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(T.key.color, T.key.intensity);
    key.position.set(...T.key.pos);
    key.target.position.set(0, 0, 0);
    key.castShadow = true;
    const sc = key.shadow.camera;
    sc.left = -46;
    sc.right = 46;
    sc.top = 58;
    sc.bottom = -58;
    sc.near = 20;
    sc.far = 140;
    key.shadow.mapSize.set(this.quality.shadowSize || 1024, this.quality.shadowSize || 1024);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    scene.add(key, key.target);
    this.keyLight = key;
    // Fill from the opposite side, no shadows.
    const fill = new THREE.DirectionalLight(T.fill.color, T.fill.intensity);
    fill.position.set(...T.fill.pos);
    scene.add(fill);
    // Team glow near each goal.
    this.goalLights = [];
    for (const [s, col] of [[-1, BLUE], [1, ORANGE]]) {
      const l = new THREE.PointLight(col, 60, 34, 2);
      l.position.set(0, 4, s * 54);
      scene.add(l);
      this.goalLights.push(l);
    }
    // Light used for explosions and goal flashes.
    this.flashLight = new THREE.PointLight(0xffd2a0, 0, 60, 2);
    scene.add(this.flashLight);

    // Environment map: a dome in the theme's sky colors with floodlight panels, team glows and the sun.
    const E = T.env;
    const env = new THREE.Scene();
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(100, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: {
          uTop: { value: col3(E.top) }, uHor: { value: col3(E.horizon) }, uGnd: { value: col3(E.ground) },
          uGlow: { value: E.teamGlow }, uSun: { value: new THREE.Vector3(...(E.sun || [0, -1, 0])).normalize() }, uHasSun: { value: E.sun ? 1 : 0 },
          uNeon: { value: E.neon ? 1 : 0 },
        },
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: `uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uGnd; uniform float uGlow; uniform vec3 uSun; uniform float uHasSun; uniform float uNeon;
          varying vec3 vP; void main(){ vec3 d = normalize(vP);
          vec3 c = d.y > 0.0 ? mix(uHor, uTop, pow(d.y, 0.6)) : mix(uHor, uGnd, pow(-d.y, 0.5));
          c += vec3(0.12,0.35,1.0) * uGlow * exp(-pow((d.z + 0.9) * 3.0, 2.0)) * smoothstep(-0.2, 0.2, d.y + 0.1);
          c += vec3(1.0,0.45,0.1) * uGlow * exp(-pow((d.z - 0.9) * 3.0, 2.0)) * smoothstep(-0.2, 0.2, d.y + 0.1);
          c += vec3(1.0, 0.95, 0.85) * uHasSun * (pow(max(dot(d, uSun), 0.0), 40.0) * 30.0 + pow(max(dot(d, uSun), 0.0), 4.0) * 0.6);
          c += uNeon * (vec3(1.0, 0.2, 0.7) * exp(-pow((d.x - 0.8) * 3.0, 2.0)) + vec3(0.1, 0.8, 1.0) * exp(-pow((d.x + 0.8) * 3.0, 2.0))) * 0.6 * smoothstep(-0.1, 0.3, d.y);
          gl_FragColor = vec4(c, 1.0); }`,
      }),
    );
    env.add(dome);
    const panelMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(E.panels) });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(14, 4), panelMat);
      p.position.set(Math.cos(a) * 60, 38, Math.sin(a) * 75);
      p.lookAt(0, 0, 0);
      env.add(p);
    }
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pm.fromScene(env, 0.03).texture;
    pm.dispose();
  }

  // ------------------------------------------------------------------ field
  buildField() {
    const S = this.pw.surfaces;
    const TF = this.theme.turf;
    const style = TF.style;
    const turfTex = makeTurfTexture(this.pw.floorPoly, this.renderer, TF);
    const grassNormal = makeGrassNormal();
    grassNormal.repeat.set(60, 75);
    const surf = {
      grass: { roughness: 0.86, metalness: 0, normal: 0.35, env: 0.35 },
      snow: { roughness: 0.62, metalness: 0, normal: 0.22, env: 0.55 },
      sand: { roughness: 0.95, metalness: 0, normal: 0.5, env: 0.25 },
      grid: { roughness: 0.28, metalness: 0.35, normal: 0.05, env: 0.9 },
    }[style] || { roughness: 0.86, metalness: 0, normal: 0.35, env: 0.35 };
    const floorGeo = surfaceGeometry(S, ['floor'], (v) => [(v.x + A.extentX) / (2 * A.extentX), (v.y + A.extentY) / (2 * A.extentY)]);
    const floorMat = new THREE.MeshStandardMaterial({
      map: turfTex,
      normalMap: grassNormal,
      normalScale: new THREE.Vector2(surf.normal, surf.normal),
      roughness: surf.roughness,
      metalness: surf.metalness,
      envMap: this.envMap,
      envMapIntensity: surf.env,
    });
    if (turfTex.userData.emissive) {
      floorMat.emissiveMap = turfTex.userData.emissive;
      floorMat.emissive = new THREE.Color(1, 1, 1);
      floorMat.emissiveIntensity = TF.emissive ?? 1.0;
    }
    // Close-up surface detail: a tiling texture in world space, faded in near the camera.
    if (style !== 'grid') {
      const detail = makeGrassTile(this.renderer, style);
      const mean = { grass: 0.075, snow: 0.68, sand: 0.3 }[style] || 0.1;
      floorMat.onBeforeCompile = (shader) => {
        shader.uniforms.uDetail = { value: detail };
        shader.uniforms.uMean = { value: mean };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
          .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform sampler2D uDetail;\nuniform float uMean;\nvarying vec3 vWorldPos;')
          .replace('#include <map_fragment>', `#include <map_fragment>
            vec3 dA = texture2D(uDetail, vWorldPos.xz * 0.9).rgb;
            vec3 dB = texture2D(uDetail, vWorldPos.xz * 0.23 + 0.37).rgb;
            float lum = dot(dA, vec3(0.3, 0.59, 0.11)) * 0.6 + dot(dB, vec3(0.3, 0.59, 0.11)) * 0.4;
            float near = 1.0 - smoothstep(6.0, 40.0, length(vWorldPos - cameraPosition));
            ${style === 'grass'
    ? 'diffuseColor.rgb *= mix(1.0, 0.55 + lum * 1.6, 0.55 * near + 0.15);'
    : 'diffuseColor.rgb *= mix(1.0, clamp(lum / uMean, 0.6, 1.4), (0.55 * near + 0.15) * 0.6);'}`);
      };
    }
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.receiveShadow = true;
    this.group.add(floor);
    this.floor = floor;

    // Blades of grass (or snow and sand tufts) on top, swaying in the wind; not on the neon deck.
    this.grass = null;
    this.grassPush = [];
    if (style !== 'grid' && TF.grass !== false) {
      this.grass = new Grass(floorGeo, { map: turfTex, envMap: this.envMap, style, shells: this.quality.grass ?? 0 });
      this.group.add(this.grass.mesh);
      this.updaters.push((dt, time) => this.grass.update(time, this.grassPush));
    }

    // Ramps continue the turf, tiled, darkening as they rise.
    const tile = makeGrassTile(this.renderer, style);
    const rampGeo = surfaceGeometry(S, ['ramp'], (v) => [v.u / 600, v.z / 600]);
    const rampMat = new THREE.MeshStandardMaterial({
      map: tile,
      roughness: Math.min(0.92, surf.roughness + 0.05),
      metalness: surf.metalness,
      color: TF.rampColor,
      envMap: this.envMap,
      envMapIntensity: surf.env * 0.85,
    });
    const ramp = new THREE.Mesh(rampGeo, rampMat);
    ramp.receiveShadow = true;
    this.group.add(ramp);

    // Glowing seam where the ramp meets the wall, blue to orange along the field.
    const fp = this.pw.footprint;
    const pos = [];
    const col = [];
    const idx = [];
    const c = new THREE.Color();
    const white = new THREE.Color(0xdfe9ff);
    for (let i = 0; i < fp.length; i++) {
      const f = fp[i];
      const z0 = f.rf + 2;
      const z1 = z0 + (f.mouth ? 0 : 10);
      const inset = 3; // uu inward so it never z-fights the wall
      const x = f.x + f.nx * inset;
      const y = f.y + f.ny * inset;
      pos.push(x * UU, z0 * UU, y * UU, x * UU, z1 * UU, y * UU);
      const t = THREE.MathUtils.smoothstep(f.y / A.extentY, -0.25, 0.25);
      c.copy(BLUE).lerp(ORANGE, t);
      c.lerp(white, Math.max(0, 1 - Math.abs(f.y) / 1600) * 0.6);
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      const j = (i + 1) % fp.length;
      if (!(f.mouth && fp[j].mouth)) idx.push(i * 2, j * 2, j * 2 + 1, i * 2, j * 2 + 1, i * 2 + 1);
    }
    const seamGeo = new THREE.BufferGeometry();
    seamGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    seamGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    seamGeo.setIndex(idx);
    // Glows (HDR color for bloom) but fades out within a few meters of the camera, so it never
    // becomes a blinding bar when the camera rides along a wall.
    const seamMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      vertexShader: /* glsl */ `
        varying vec3 vC;
        varying float vD;
        void main() {
          vC = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vD = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vC;
        varying float vD;
        void main() {
          gl_FragColor = vec4(vC * 2.0, smoothstep(2.0, 9.0, vD));
        }`,
    });
    const seam = new THREE.Mesh(seamGeo, seamMat);
    seam.renderOrder = 3;
    this.group.add(seam);
  }

  // ------------------------------------------------------------------ walls
  buildWalls() {
    const S = this.pw.surfaces;
    const geo = surfaceGeometry(S, ['wall', 'ceilRamp'], (v) => [v.u, v.z]);
    const mat = shaderMat({
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide, // invisible from outside, so a camera behind a wall sees through it
      uniforms: {
        uBlue: { value: BLUE.clone() },
        uOrange: { value: ORANGE.clone() },
        uTime: { value: 0 },
        uPulse: { value: new THREE.Vector2(0, 0) },
        uMid: { value: col3(this.theme.walls.mid) },
        uGlow: { value: this.theme.walls.glow },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorld;
        varying vec3 vNormal;
        ${FOG_V}
        void main() {
          vUv = uv;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          vNormal = normalize(mat3(modelMatrix) * normal);
          vec4 mvPosition = viewMatrix * w;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uBlue;
        uniform vec3 uOrange;
        uniform float uTime;
        uniform vec2 uPulse;
        uniform vec3 uMid;
        uniform float uGlow;
        varying vec2 vUv;
        varying vec3 vWorld;
        varying vec3 vNormal;
        ${NOISE}
        ${HEX}
        ${FOG_F}
        void main() {
          float zf = clamp(vWorld.z / 51.2, -1.0, 1.0);
          float t = smoothstep(-0.3, 0.3, zf);
          vec3 team = mix(uBlue, uOrange, t);
          float pulse = mix(uPulse.x, uPulse.y, t);
          vec3 col = mix(team, uMid, (1.0 - abs(zf)) * 0.45);
          vec2 p = vUv * 0.01 * vec2(0.62, 0.62);
          vec4 hc = hexCoords(p);
          float e = hexEdge(hc.xy);
          float line = 1.0 - smoothstep(0.0, 0.035, e);
          float h = vWorld.y;
          float cell = hash12(hc.zw);
          float twinkle = step(0.965, cell) * (0.5 + 0.5 * sin(uTime * 2.0 + cell * 40.0));
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - abs(dot(V, normalize(vNormal))), 3.0);
          float fadeTop = 1.0 - 0.55 * smoothstep(6.0, 19.0, h);
          float bottom = exp(-max(h - 2.7, 0.0) * 0.9) * step(2.55, h);
          float alpha = 0.035 + line * (0.07 + 0.2 * fadeTop) + fres * 0.08 + bottom * 0.22 + twinkle * 0.12 * fadeTop;
          vec3 c = col * (0.18 + (line * (0.9 + pulse * 2.0) + bottom * 1.6 + twinkle * 1.2) * uGlow);
          alpha = clamp(alpha * (1.0 + pulse), 0.0, 0.9);
          gl_FragColor = vec4(c, alpha);
          ${OUT_F}
        }`,
    });
    this.wallMat = mat;
    const walls = new THREE.Mesh(geo, mat);
    walls.renderOrder = 2;
    this.group.add(walls);
    this.updaters.push((dt, time) => {
      mat.uniforms.uTime.value = time;
      mat.uniforms.uPulse.value.x = Math.max(0, mat.uniforms.uPulse.value.x - dt * 0.8);
      mat.uniforms.uPulse.value.y = Math.max(0, mat.uniforms.uPulse.value.y - dt * 0.8);
    });

    // Ceiling: hex glass over the whole field, tinted blue to orange like the walls. It glows where
    // the car or the ball gets close, so you can see it coming when you fly up.
    const ceilGeo = surfaceGeometry(S, ['ceiling'], (v) => [v.x, v.y]);
    const ceilMat = shaderMat({
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide, // seen from below only
      uniforms: {
        uBlue: { value: BLUE.clone() },
        uOrange: { value: ORANGE.clone() },
        uMid: { value: col3(this.theme.walls.mid) },
        uGlow: { value: this.theme.walls.glow },
        uCar: { value: new THREE.Vector3(0, -100, 0) },
        uBall: { value: new THREE.Vector3(0, -100, 0) },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        ${FOG_V}
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          vec4 mvPosition = viewMatrix * w;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uBlue;
        uniform vec3 uOrange;
        uniform vec3 uMid;
        uniform float uGlow;
        uniform vec3 uCar;
        uniform vec3 uBall;
        uniform float uTime;
        varying vec3 vWorld;
        ${NOISE}
        ${HEX}
        ${FOG_F}
        // Glow from an object below the ceiling: bright when it is close in height, spread by distance.
        float nearGlow(vec3 o) {
          float gap = max(vWorld.y - o.y, 0.0);
          float d = length(vWorld.xz - o.xz);
          return exp(-d * d / (16.0 + gap * gap * 1.5)) * smoothstep(14.0, 2.0, gap);
        }
        void main() {
          float zf = clamp(vWorld.z / 51.2, -1.0, 1.0);
          vec3 team = mix(uBlue, uOrange, smoothstep(-0.3, 0.3, zf));
          vec3 col = mix(team, uMid, (1.0 - abs(zf)) * 0.55);
          vec4 hc = hexCoords(vWorld.xz * 0.36);
          float e = hexEdge(hc.xy);
          float line = 1.0 - smoothstep(0.0, 0.05, e);
          float cell = hash12(hc.zw);
          float twinkle = step(0.97, cell) * (0.5 + 0.5 * sin(uTime * 1.5 + cell * 50.0));
          float glow = max(nearGlow(uCar), nearGlow(uBall) * 0.8);
          // Big structural ribs every 4 hexes so the ceiling reads from far below.
          vec2 rib = abs(fract(vWorld.xz / 12.0) - 0.5) * 12.0;
          float ribs = 1.0 - smoothstep(0.08, 0.2, min(rib.x, rib.y));
          float a = 0.06 + line * (0.22 + glow * 0.6) + ribs * 0.18 + glow * 0.12 + twinkle * 0.15;
          vec3 c = col * (0.25 + (line * (0.8 + glow * 2.5) + ribs * 0.7 + twinkle) * uGlow) + vec3(1.0) * glow * line * 0.4;
          gl_FragColor = vec4(c, clamp(a, 0.0, 0.85));
          ${OUT_F}
        }`,
    });
    this.ceilMat = ceilMat;
    const ceiling = new THREE.Mesh(ceilGeo, ceilMat);
    ceiling.renderOrder = 2;
    this.group.add(ceiling);
    this.updaters.push((dt, time) => {
      ceilMat.uniforms.uTime.value = time;
    });

    // Solid structure behind the transparent walls: a dark rim along the top edge.
    const rimPts = this.pw.footprint.map((f) => new THREE.Vector3(f.x * UU, (A.height - A.ceilingRampRadius) * UU, f.y * UU));
    const rimCurve = new THREE.CatmullRomCurve3(rimPts, true);
    const rim = new THREE.Mesh(
      new THREE.TubeGeometry(rimCurve, 400, 0.12, 6, true),
      new THREE.MeshBasicMaterial({ color: col3(this.theme.rim).multiplyScalar(1.4), toneMapped: false }),
    );
    this.group.add(rim);
  }

  // ------------------------------------------------------------------ goals
  buildGoals() {
    const S = this.pw.surfaces;
    const gw = A.goalHalfWidth * UU;
    const gh = A.goalHeight * UU;
    const y0 = A.extentY * UU;
    const depth = A.goalDepth * UU;
    const netTex = makeHexNetTexture();
    this.goalFrames = [];

    for (const [team, s] of [[0, -1], [1, 1]]) {
      const color = team === 0 ? BLUE : ORANGE;
      const g = new THREE.Group();
      // Posts and crossbar: white metal with a glowing team core.
      const metal = new THREE.MeshStandardMaterial({ color: 0xe8eef7, metalness: 0.7, roughness: 0.28, envMap: this.envMap, envMapIntensity: 1.1 });
      const glow = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2.4), toneMapped: false });
      const r = 0.17;
      const post = new THREE.CylinderGeometry(r, r, gh + r, 20);
      for (const x of [-gw, gw]) {
        const m = new THREE.Mesh(post, metal);
        m.position.set(x, (gh + r) / 2, s * y0);
        m.castShadow = true;
        g.add(m);
        const core = new THREE.Mesh(new THREE.BoxGeometry(0.06, gh, 0.36), glow);
        core.position.set(x - Math.sign(x) * (r - 0.02), gh / 2, s * y0);
        g.add(core);
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, gw * 2 + 2 * r, 20), metal);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0, gh, s * y0);
      bar.castShadow = true;
      g.add(bar);
      const barCore = new THREE.Mesh(new THREE.BoxGeometry(gw * 2, 0.06, 0.36), glow);
      barCore.position.set(0, gh - r + 0.02, s * y0);
      g.add(barCore);

      // Goal line.
      const line = new THREE.Mesh(new THREE.PlaneGeometry(gw * 2, 0.22), new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.8), toneMapped: false }));
      line.rotation.x = -Math.PI / 2;
      line.position.set(0, 0.012, s * (y0 - 0.15));
      g.add(line);

      // Interior: glowing floor grid and a hex net on sides, roof and back.
      const floorMat = shaderMat({
        uniforms: { uColor: { value: color.clone() }, uFlash: { value: 0 } },
        vertexShader: `varying vec3 vW;
          ${FOG_V}
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vW = w.xyz;
            vec4 mvPosition = viewMatrix * w;
            gl_Position = projectionMatrix * mvPosition;
            #include <fog_vertex>
          }`,
        fragmentShader: `uniform vec3 uColor; uniform float uFlash; varying vec3 vW; ${FOG_F}
          void main(){ vec2 g = abs(fract(vW.xz * 0.5) - 0.5); float l = 1.0 - smoothstep(0.0, 0.04, min(g.x, g.y));
          float depth = clamp((abs(vW.z) - 51.2) / 8.8, 0.0, 1.0);
          vec3 c = vec3(0.02, 0.03, 0.04) + uColor * (l * 0.9 + 0.12 + depth * 0.25) * (1.0 + uFlash * 3.0);
          gl_FragColor = vec4(c, 1.0); ${OUT_F} }`,
      });
      const gf = new THREE.Mesh(surfaceGeometry({ f: S.goalFloor.filter((t) => Math.sign(t[0].y) === s) }, ['f'], () => [0, 0]), floorMat);
      g.add(gf);
      const netMat = new THREE.MeshBasicMaterial({
        map: netTex,
        color: color.clone().lerp(new THREE.Color(1, 1, 1), 0.45).multiplyScalar(1.1),
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      });
      const netGeo = surfaceGeometry(
        { w: [...S.goalWall, ...S.goalRoof, ...S.goalBack].filter((t) => Math.sign(t[0].y) === s) },
        ['w'],
        (v) => {
          // Planar mapping per face direction, 1 hex per ~0.7 m.
          const k = 1 / 75;
          if (Math.abs(v.nx) > 0.5) return [v.y * k, v.z * k];
          if (Math.abs(v.nz) > 0.5) return [v.x * k, v.y * k];
          return [v.x * k, v.z * k];
        },
      );
      const net = new THREE.Mesh(netGeo, netMat);
      net.renderOrder = 3;
      g.add(net);
      // Back panel light behind the flat part of the net.
      const rr = A.goalCornerRadius * UU;
      const back = new THREE.Mesh(new THREE.PlaneGeometry(gw * 2 - 2 * rr, gh - 2 * rr), new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(0.1), toneMapped: false }));
      back.position.set(0, gh / 2, s * (y0 + depth + 0.05));
      back.rotation.y = s > 0 ? Math.PI : 0;
      g.add(back);

      // Surround on the back wall: dark frame with chevron lights above the mouth.
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x0b1018, metalness: 0.6, roughness: 0.4, envMap: this.envMap, envMapIntensity: 0.6 });
      const top = new THREE.Mesh(new THREE.BoxGeometry(gw * 2 + 3.2, 1.6, 0.4), frameMat);
      top.position.set(0, gh + 0.8 + r, s * (y0 + 0.25));
      g.add(top);
      for (const x of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.BoxGeometry(1.4, gh + 2.4, 0.4), frameMat);
        side.position.set(x * (gw + 0.9), (gh + 2.4) / 2, s * (y0 + 0.25));
        g.add(side);
      }
      const chevMat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2.0), toneMapped: false });
      const chevrons = [];
      for (let k = 0; k < 7; k++) {
        const ch = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5), chevMat.clone());
        ch.position.set((k - 3) * 1.6, gh + 0.85 + r, s * (y0 + 0.02));
        ch.rotation.y = s > 0 ? Math.PI : 0;
        g.add(ch);
        chevrons.push(ch);
      }
      this.group.add(g);
      this.goalFrames.push({ group: g, floorMat, netMat, chevrons, color, flash: 0 });
    }
    this.updaters.push((dt, time) => {
      for (const gfr of this.goalFrames) {
        gfr.flash = Math.max(0, gfr.flash - dt * 0.5);
        gfr.floorMat.uniforms.uFlash.value = gfr.flash;
        gfr.chevrons.forEach((ch, k) => {
          const wave = 0.5 + 0.5 * Math.sin(time * (2 + gfr.flash * 10) - k * 0.8);
          ch.material.color.copy(gfr.color).multiplyScalar(0.6 + wave * (1.8 + gfr.flash * 4));
        });
      }
    });
  }

  // Dark ground between the walls and the stands. Walls are see-through from behind, so a camera that
  // swings outside one (ball cam with the car low on a wall) looks onto this floor, not the void under
  // the field. Inside the arena the field covers it.
  buildApron() {
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(this.theme.stands.concrete).multiplyScalar(0.85), roughness: 0.95, metalness: 0 });
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(130, 170), mat);
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.05;
    this.group.add(apron);
  }

  // ------------------------------------------------------------------ stands and crowd
  buildStands() {
    const rand = this.rand;
    // Rounded-rectangle bowl around the arena and goals (meters).
    const HX = 46.5;
    const HZ = 66;
    const RC = 24;
    const loop = [];
    const segs = 220;
    const perim = (t) => {
      // Superellipse-like rounded rectangle via corner arcs.
      const sx = HX - RC;
      const sz = HZ - RC;
      const L = 4 * (sx + sz) + 2 * Math.PI * RC;
      let d = t * L;
      const pts = [
        [sx * 2, (p) => [-sx + p, -HZ, 0, 1]],
        [Math.PI * RC / 2, (p) => { const a = -Math.PI / 2 + p / RC; return [sx + Math.cos(a) * RC, -sz + Math.sin(a) * RC, -Math.cos(a), -Math.sin(a)]; }],
        [sz * 2, (p) => [HX, -sz + p, -1, 0]],
        [Math.PI * RC / 2, (p) => { const a = p / RC; return [sx + Math.cos(a) * RC, sz + Math.sin(a) * RC, -Math.cos(a), -Math.sin(a)]; }],
        [sx * 2, (p) => [sx - p, HZ, 0, -1]],
        [Math.PI * RC / 2, (p) => { const a = Math.PI / 2 + p / RC; return [-sx + Math.cos(a) * RC, sz + Math.sin(a) * RC, -Math.cos(a), -Math.sin(a)]; }],
        [sz * 2, (p) => [-HX, sz - p, 1, 0]],
        [Math.PI * RC / 2, (p) => { const a = Math.PI + p / RC; return [-sx + Math.cos(a) * RC, -sz + Math.sin(a) * RC, -Math.cos(a), -Math.sin(a)]; }],
      ];
      for (const [len, fn] of pts) {
        if (d <= len) return fn(d);
        d -= len;
      }
      return pts[0][1](0);
    };
    for (let i = 0; i < segs; i++) loop.push(perim(i / segs));
    this.bowlLoop = loop;

    // Profile: [outward distance, height] points, stepped seating. Inward normal is (nx, nz).
    const profile = [];
    profile.push([0, -0.2], [0, 3.2], [1.2, 3.2]); // front barrier with ribbon board
    let d = 1.2;
    let h = 3.2;
    const lowerRows = [];
    for (let r = 0; r < 26; r++) {
      lowerRows.push([d + 0.42, h]);
      d += 0.85;
      profile.push([d, h]);
      h += 0.42;
      profile.push([d, h]);
    }
    profile.push([d + 3.0, h]); // concourse
    d += 3.0;
    const conc = [d, h];
    profile.push([d, h + 4.2]); // fascia (upper ribbon board)
    h += 4.2;
    profile.push([d + 0.8, h]);
    d += 0.8;
    const upperRows = [];
    for (let r = 0; r < 22; r++) {
      upperRows.push([d + 0.4, h]);
      d += 0.8;
      profile.push([d, h]);
      h += 0.58;
      profile.push([d, h]);
    }
    profile.push([d + 1.0, h], [d + 1.0, h + 3.5]);
    this.standTop = { d: d + 1.0, h: h + 3.5 };

    const pos = [];
    const col = [];
    const idx = [];
    const ST = this.theme.stands;
    const concrete = new THREE.Color(ST.concrete);
    const seatBlue = new THREE.Color(ST.seatBlue);
    const seatOrange = new THREE.Color(ST.seatOrange);
    const seatGrey = new THREE.Color(ST.seatMid);
    const c = new THREE.Color();
    for (let i = 0; i < segs; i++) {
      const [x, z, nx, nz] = loop[i];
      for (let k = 0; k < profile.length; k++) {
        const [pd, ph] = profile[k];
        pos.push(x - nx * pd, ph, z - nz * pd);
        // Seat rows get team colors by end, grey in the middle; risers and walls stay concrete.
        const isTread = k > 0 && profile[k - 1][1] === ph;
        if (isTread && k > 3) {
          const t = THREE.MathUtils.smoothstep(z / HZ, -0.35, 0.35);
          c.copy(seatBlue).lerp(seatOrange, t);
          c.lerp(seatGrey, Math.max(0, 1 - Math.abs(z) / 22) * 0.8);
          const v = 0.85 + rand() * 0.15;
          col.push(c.r * v, c.g * v, c.b * v);
        } else {
          col.push(concrete.r, concrete.g, concrete.b);
        }
      }
    }
    const P = profile.length;
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % segs;
      for (let k = 0; k < P - 1; k++) {
        const a = i * P + k;
        const b = j * P + k;
        idx.push(a, b, b + 1, a, b + 1, a + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.05, side: THREE.DoubleSide, envMap: this.envMap, envMapIntensity: 0.25 });
    const stands = new THREE.Mesh(geo, mat);
    stands.receiveShadow = false;
    this.group.add(stands);

    // Ribbon boards on the front barrier and the upper fascia.
    const R = this.theme.ribbon;
    const ribbonTex = makeRibbonTexture([
      { text: R[1][0], color: R[1][1] },
      { text: 'BLUE', color: CONFIG.teams[0].css },
      { text: R[0][0], color: R[0][1] },
      { text: 'ORANGE', color: CONFIG.teams[1].css },
      { text: R[2][0], color: R[2][1] },
    ]);
    const makeRibbon = (dOut, y0, y1) => {
      const rp = [];
      const ru = [];
      const ri = [];
      let s = 0;
      for (let i = 0; i <= segs; i++) {
        const [x, z, nx, nz] = loop[i % segs];
        if (i > 0) {
          const [px, pz] = loop[(i - 1) % segs];
          s += Math.hypot(x - px, z - pz);
        }
        const X = x - nx * dOut;
        const Z = z - nz * dOut;
        rp.push(X, y0, Z, X, y1, Z);
        ru.push(s / ((y1 - y0) * 16), 0, s / ((y1 - y0) * 16), 1);
        if (i < segs) {
          const a = i * 2;
          ri.push(a, a + 2, a + 3, a, a + 3, a + 1);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(ru, 2));
      g.setIndex(ri);
      const tex = ribbonTex.clone();
      tex.needsUpdate = true;
      tex.wrapS = THREE.RepeatWrapping;
      const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide });
      m.color.setScalar(1.6);
      const mesh = new THREE.Mesh(g, m);
      this.group.add(mesh);
      this.updaters.push((dt) => { tex.offset.x -= dt * 0.035; });
      return mesh;
    };
    makeRibbon(-0.02, 0.4, 2.9);
    makeRibbon(conc[0] - 0.02, conc[1] + 0.5, conc[1] + 3.8);

    // Crowd: instanced billboards on every seat row.
    const spots = [];
    const addRows = (rows) => {
      for (const [rd, rh] of rows) {
        for (let i = 0; i < segs; i++) {
          const [x, z, nx, nz] = loop[i];
          const [x2, z2] = loop[(i + 1) % segs];
          const len = Math.hypot(x2 - x, z2 - z);
          const n = Math.floor(len / 0.62);
          for (let k = 0; k < n; k++) {
            if (rand() > 0.82) continue; // empty seats
            const t = (k + rand() * 0.3) / n;
            const px = x + (x2 - x) * t - nx * rd;
            const pz = z + (z2 - z) * t - nz * rd;
            spots.push([px, rh, pz, z]);
          }
        }
      }
    };
    addRows(lowerRows);
    addRows(upperRows);
    // Shuffle so quality-limited counts still cover the whole bowl.
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [spots[i], spots[j]] = [spots[j], spots[i]];
    }
    // Build every seat up to 16000; quality only changes how many are drawn (see setQuality).
    const count = Math.min(spots.length, 16000);
    this.crowdMax = count;
    const quad = new THREE.PlaneGeometry(1, 1);
    const ig = new THREE.InstancedBufferGeometry();
    ig.index = quad.index;
    ig.setAttribute('position', quad.getAttribute('position'));
    const offsets = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const teams = new Float32Array(count);
    const scales = new Float32Array(count);
    const shirt = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const [x, y, z, zz] = spots[i];
      offsets.set([x, y, z], i * 3);
      // Fans wear their team's color more often at their team's end.
      const t = THREE.MathUtils.smoothstep(zz / HZ, -0.5, 0.5);
      const isOrange = rand() < t;
      teams[i] = isOrange ? 1 : 0;
      const r = rand();
      if (r < 0.62) shirt.copy(isOrange ? ORANGE : BLUE).offsetHSL((rand() - 0.5) * 0.04, -rand() * 0.2, (rand() - 0.5) * 0.15);
      else if (r < 0.8) shirt.setHSL(0, 0, 0.75 + rand() * 0.2);
      else shirt.setHSL(rand(), 0.2 + rand() * 0.3, 0.12 + rand() * 0.25);
      colors.set([shirt.r, shirt.g, shirt.b], i * 3);
      phases[i] = rand() * Math.PI * 2;
      scales[i] = 0.9 + rand() * 0.2;
    }
    ig.setAttribute('offset', new THREE.InstancedBufferAttribute(offsets, 3));
    ig.setAttribute('shirt', new THREE.InstancedBufferAttribute(colors, 3));
    ig.setAttribute('phase', new THREE.InstancedBufferAttribute(phases, 1));
    ig.setAttribute('team', new THREE.InstancedBufferAttribute(teams, 1));
    ig.setAttribute('scale', new THREE.InstancedBufferAttribute(scales, 1));
    this.crowdDensity = ST.crowd ?? 1;
    ig.instanceCount = Math.floor(count * this.quality.crowd * this.crowdDensity);
    this.crowdGeo = ig;
    const crowdMat = shaderMat({
      uniforms: { uTime: { value: 0 }, uCheer: { value: new THREE.Vector2(0, 0) } },
      vertexShader: /* glsl */ `
        attribute vec3 offset;
        attribute vec3 shirt;
        attribute float phase;
        attribute float team;
        attribute float scale;
        uniform float uTime;
        uniform vec2 uCheer;
        varying vec2 vUv;
        varying vec3 vShirt;
        varying float vArms;
        varying float vShade;
        ${FOG_V}
        void main() {
          float cheer = team < 0.5 ? uCheer.x : uCheer.y;
          float idle = sin(uTime * 1.3 + phase) * 0.02;
          float jump = max(0.0, sin(uTime * (7.0 + fract(phase) * 3.0) + phase)) * 0.32 * cheer;
          vec3 center = offset + vec3(0.0, 0.62 * scale + idle + jump, 0.0);
          vec3 toCam = cameraPosition - center;
          toCam.y = 0.0;
          toCam = normalize(toCam);
          vec3 right = vec3(toCam.z, 0.0, -toCam.x);
          vec3 p = center + right * position.x * 0.62 * scale + vec3(0.0, position.y * 1.24 * scale, 0.0);
          vUv = position.xy + 0.5;
          vShirt = shirt;
          vArms = step(0.35, cheer * (0.6 + 0.4 * sin(phase * 7.0 + uTime * 2.0)));
          vShade = 0.75 + 0.25 * fract(phase * 3.7);
          vec4 mvPosition = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vShirt;
        varying float vArms;
        varying float vShade;
        ${FOG_F}
        float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
        float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
        void main() {
          vec2 p = vUv;
          float head = length((p - vec2(0.5, 0.8)) * vec2(1.0, 0.95)) - 0.12;
          float body = sdBox(p - vec2(0.5, 0.36), vec2(0.27, 0.34), 0.13);
          float arms = min(sdSeg(p, vec2(0.3, 0.55), vec2(0.15, 0.97)), sdSeg(p, vec2(0.7, 0.55), vec2(0.85, 0.97))) - 0.055;
          float d = min(head, body);
          if (vArms > 0.5) d = min(d, arms);
          if (d > 0.0) discard;
          vec3 skin = vec3(0.55, 0.4, 0.32) * (0.7 + vShade * 0.5);
          vec3 c = head < 0.0 ? skin : vShirt;
          c *= vShade * (0.55 + 0.45 * smoothstep(0.0, 0.9, p.y));
          gl_FragColor = vec4(c, 1.0);
          ${OUT_F}
        }`,
    });
    this.crowdMat = crowdMat;
    const crowd = new THREE.Mesh(ig, crowdMat);
    crowd.frustumCulled = false;
    this.group.add(crowd);
    this.updaters.push((dt, time) => {
      crowdMat.uniforms.uTime.value = time;
      this.cheer[0] = Math.max(0, this.cheer[0] - dt * 0.18);
      this.cheer[1] = Math.max(0, this.cheer[1] - dt * 0.18);
      crowdMat.uniforms.uCheer.value.set(this.cheer[0], this.cheer[1]);
    });
  }

  // ------------------------------------------------------------------ roof, floodlights, beams
  buildRoof() {
    const loop = this.bowlLoop;
    const top = this.standTop;
    const segs = loop.length;
    // Canopy: a ring from the back of the upper tier reaching inward, slightly tilted.
    const pos = [];
    const idx = [];
    const inner = 18; // how far it reaches toward the field (m)
    for (let i = 0; i < segs; i++) {
      const [x, z, nx, nz] = loop[i];
      const bx = x - nx * top.d;
      const bz = z - nz * top.d;
      pos.push(bx, top.h + 2, bz, bx + nx * (top.d - inner), top.h + 6, bz + nz * (top.d - inner));
      pos.push(bx, top.h + 3.2, bz, bx + nx * (top.d - inner), top.h + 7.2, bz + nz * (top.d - inner));
    }
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % segs;
      const a = i * 4;
      const b = j * 4;
      idx.push(a, b, b + 1, a, b + 1, a + 1); // underside
      idx.push(a + 2, a + 3, b + 3, a + 2, b + 3, b + 2); // top
      idx.push(a + 1, b + 1, b + 3, a + 1, b + 3, a + 3); // inner lip
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const RF = this.theme.roof;
    const roof = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: RF.color, roughness: 0.7, metalness: 0.4, side: THREE.DoubleSide, envMap: this.envMap, envMapIntensity: 0.4 }));
    this.group.add(roof);

    // Floodlight bars along the canopy's inner lip, aimed at the field.
    const lampMat = new THREE.MeshBasicMaterial({ color: col3(RF.lampColor || [1, 0.98, 0.92]).multiplyScalar(RF.lamp), toneMapped: false });
    const housing = new THREE.MeshStandardMaterial({ color: 0x0c0f15, roughness: 0.5, metalness: 0.6 });
    const glowTex = makeGlowTexture(128, 0.05);
    const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: col3(RF.lampColor || [1, 0.96, 0.88]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: RF.glow });
    const lampGroup = new THREE.Group();
    const lampCount = 28;
    const beams = [];
    for (let k = 0; k < lampCount; k++) {
      const i = Math.floor((k / lampCount) * segs);
      const [x, z, nx, nz] = loop[i];
      const lx = x - nx * top.d + nx * (top.d - 18);
      const lz = z - nz * top.d + nz * (top.d - 18);
      const ly = top.h + 5.4;
      const box = new THREE.Group();
      box.position.set(lx, ly, lz);
      const h = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.6, 0.7), housing);
      box.add(h);
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 5; c++) {
          const lamp = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.55), lampMat);
          lamp.position.set(-2.0 + c * 1.0, -0.35 + r * 0.7, 0.36);
          box.add(lamp);
        }
      }
      const spr = new THREE.Sprite(glowMat);
      spr.scale.set(9, 5, 1);
      spr.position.set(0, 0, 0.6);
      box.add(spr);
      box.lookAt(0, -6, 0);
      lampGroup.add(box);
      beams.push(box);
    }
    this.group.add(lampGroup);

    // Faint light shafts (shown on high quality only, see setQuality).
    this.shafts = new THREE.Group();
    this.shafts.visible = !!this.quality.lightShafts;
    this.group.add(this.shafts);
    {
      const beamMat = shaderMat({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {},
        vertexShader: `varying float vY; varying vec3 vW; varying vec3 vN;
          ${FOG_V}
          void main() {
            vY = uv.y;
            vec4 w = modelMatrix * vec4(position, 1.0);
            vW = w.xyz;
            vN = normalize(mat3(modelMatrix) * normal);
            vec4 mvPosition = viewMatrix * w;
            gl_Position = projectionMatrix * mvPosition;
            #include <fog_vertex>
          }`,
        fragmentShader: `varying float vY; varying vec3 vW; varying vec3 vN; ${FOG_F} void main(){ vec3 V = normalize(cameraPosition - vW); float edge = pow(abs(dot(V, vN)), 2.0); float a = vY * vY * 0.05 * edge; gl_FragColor = vec4(vec3(1.0,0.96,0.88) * a, 1.0); ${OUT_F} }`,
      });
      for (let k = 0; k < lampCount; k += 4) {
        const b = beams[k];
        const len = b.position.length() * 0.9;
        const cone = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 9, len, 16, 1, true), beamMat);
        cone.geometry.translate(0, -len / 2, 0);
        cone.geometry.rotateX(-Math.PI / 2);
        cone.position.copy(b.position);
        cone.lookAt(0, 0, 0);
        cone.rotateY(Math.PI);
        this.shafts.add(cone);
      }
    }
  }

  // ------------------------------------------------------------------ jumbotron
  buildJumbotron() {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    this.jumboCanvas = c;
    this.jumboCtx = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.jumboTex = tex;
    const g = new THREE.Group();
    g.position.set(0, 33, 0);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(15.4, 8.4, 15.4), new THREE.MeshStandardMaterial({ color: 0x0b0e14, metalness: 0.6, roughness: 0.4, envMap: this.envMap }));
    g.add(frame);
    const screenMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    screenMat.color.setScalar(1.3);
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(14.6, 7.3), screenMat);
      const a = (i * Math.PI) / 2;
      s.position.set(Math.sin(a) * 7.72, 0, Math.cos(a) * 7.72);
      s.rotation.y = a;
      g.add(s);
    }
    // Light rings above and below.
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 0.85, 1).multiplyScalar(2), toneMapped: false });
    for (const y of [-4.35, 4.35]) {
      const ring = new THREE.Mesh(new THREE.BoxGeometry(15.8, 0.25, 15.8), ringMat);
      ring.position.y = y;
      g.add(ring);
    }
    // Cables to the roof.
    const cableMat = new THREE.MeshBasicMaterial({ color: 0x0a0c10 });
    for (const [x, z] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) {
      const cab = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 40, 4), cableMat);
      cab.position.set(x * 2.2, 20, z * 2.4);
      cab.lookAt(x, 0, z);
      cab.rotateX(Math.PI / 2);
      g.add(cab);
    }
    this.group.add(g);
    this.jumbo = g;
    this.drawJumbo({ blue: 0, orange: 0, clock: '5:00', banner: '' });
  }

  drawJumbo({ blue, orange, clock, banner }) {
    const ctx = this.jumboCtx;
    const W = 1024;
    const H = 512;
    ctx.fillStyle = '#04070d';
    ctx.fillRect(0, 0, W, H);
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, CONFIG.teams[0].css);
    grad.addColorStop(0.5, '#0a0f18');
    grad.addColorStop(1, CONFIG.teams[1].css);
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (banner) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 190px "Saira Game", "Arial Narrow", Arial, sans-serif';
      ctx.fillText(banner, W / 2, H / 2 + 10);
    } else {
      ctx.font = '800 240px "Saira Game", "Arial Narrow", Arial, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(blue), W * 0.2, H * 0.52);
      ctx.fillText(String(orange), W * 0.8, H * 0.52);
      ctx.font = '700 120px "Saira Game", "Arial Narrow", Arial, sans-serif';
      ctx.fillStyle = '#e8f2ff';
      ctx.fillText(clock, W / 2, H * 0.52);
      ctx.font = '700 44px "Saira Game", "Arial Narrow", Arial, sans-serif';
      ctx.fillStyle = '#9fb6d6';
      ctx.fillText(this.arenaName.toUpperCase(), W / 2, H * 0.17);
    }
    this.jumboTex.needsUpdate = true;
  }

  // ------------------------------------------------------------------ sky
  buildSky() {
    const SK = this.theme.sky;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1400, 48, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        defines: { SKY_TYPE: SK.type },
        uniforms: {
          uTime: { value: 0 },
          uAurora: { value: this.quality.aurora ? 1 : 0 }, // sky detail (aurora, clouds) on/off
          uTop: { value: col3(SK.top || [0, 0, 0]) },
          uHor: { value: col3(SK.horizon || [0, 0, 0]) },
          uSun: { value: new THREE.Vector3(...(SK.sun || [0, 1, 0])).normalize() },
          uSunColor: { value: col3(SK.sunColor || [1, 1, 1]) },
        },
        vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform float uAurora;
          uniform vec3 uTop;
          uniform vec3 uHor;
          uniform vec3 uSun;
          uniform vec3 uSunColor;
          varying vec3 vDir;
          ${NOISE}
          float stars(vec3 d, float h, float density) {
            vec2 sp = d.xz / (h + 1.0) * 380.0;
            float st = hash12(floor(sp));
            return step(density, st) * smoothstep(0.5, 0.0, length(fract(sp) - 0.5)) * (0.6 + 0.4 * sin(uTime * 3.0 + st * 100.0)) * smoothstep(0.08, 0.3, h);
          }
          void main() {
            vec3 d = normalize(vDir);
            float h = d.y;
            vec3 col;
          #if SKY_TYPE == 0
            // Night with the northern lights.
            col = mix(vec3(0.035, 0.05, 0.11), vec3(0.004, 0.008, 0.025), smoothstep(0.0, 0.7, h));
            col += vec3(0.10, 0.05, 0.16) * exp(-abs(h) * 9.0);
            if (h > 0.02) {
              vec2 p = d.xz / (h + 0.18);
              float t = uTime * 0.03;
              float a = 0.0;
              // The aurora is the most expensive pixel work in the scene; low settings skip it.
              for (int i = 0; i < 3; i++) {
                if (uAurora < 0.5) break;
                float fi = float(i);
                vec2 q = p * (0.55 + fi * 0.18) + vec2(t * (1.0 + fi * 0.4), fi * 3.1);
                float band = sin(q.x * 1.3 + fbm(q * 0.7 + t) * 4.0 + fi * 2.0);
                float curtain = exp(-band * band * 6.0);
                float rays = 0.55 + 0.45 * vnoise(vec2(q.x * 14.0, t * 6.0 + fi));
                a += curtain * rays * (0.6 - fi * 0.12);
              }
              float mask = smoothstep(0.05, 0.28, h) * (1.0 - smoothstep(0.55, 0.95, h));
              vec3 aur = mix(vec3(0.12, 1.0, 0.55), vec3(0.55, 0.25, 1.0), smoothstep(0.2, 0.6, h + a * 0.08));
              col += aur * a * mask * 0.38;
              col += vec3(0.9, 0.95, 1.0) * stars(d, h, 0.9955) * 1.4;
            }
          #elif SKY_TYPE == 1
            // Clear day: blue gradient, sun and drifting cumulus.
            col = mix(uHor, uTop, pow(clamp(h, 0.0, 1.0), 0.55));
            col = mix(col, uHor * 0.85, smoothstep(0.02, -0.15, h));
            float sd = max(dot(d, uSun), 0.0);
            col += uSunColor * (pow(sd, 900.0) * 30.0 + pow(sd, 60.0) * 0.6 + pow(sd, 6.0) * 0.12);
            if (h > 0.0 && uAurora > 0.5) {
              vec2 p = d.xz / (h + 0.08) * 0.9 + vec2(uTime * 0.006, uTime * 0.002);
              float c = fbm(p * 0.6) * 0.65 + fbm(p * 1.7 + 3.1) * 0.35;
              c = smoothstep(0.5, 0.78, c) * smoothstep(0.0, 0.18, h);
              vec3 cc = mix(vec3(0.78, 0.83, 0.9), vec3(1.0), smoothstep(0.55, 0.9, c)) * (0.9 + 0.25 * pow(sd, 3.0));
              col = mix(col, cc, c * 0.92);
            }
          #elif SKY_TYPE == 2
            // Sunset: violet overhead, burning orange at the horizon, a big low sun and streaky clouds.
            col = mix(uHor, uTop, pow(clamp(h + 0.02, 0.0, 1.0), 0.45));
            col = mix(col, vec3(0.22, 0.09, 0.07), smoothstep(0.0, -0.2, h));
            float sd = max(dot(d, uSun), 0.0);
            col += uSunColor * (pow(sd, 400.0) * 25.0 + pow(sd, 30.0) * 0.9 + pow(sd, 4.0) * 0.35);
            if (h > 0.0 && uAurora > 0.5) {
              vec2 p = vec2(d.x, d.z) / (h + 0.05) * vec2(0.35, 1.6) + vec2(uTime * 0.003, 0.0);
              float c = fbm(p * vec2(1.0, 0.3));
              c = smoothstep(0.52, 0.76, c) * smoothstep(0.02, 0.12, h) * (1.0 - smoothstep(0.35, 0.6, h));
              vec3 cc = mix(vec3(0.42, 0.18, 0.3), vec3(1.0, 0.58, 0.32), pow(sd, 2.0));
              col = mix(col, cc, c * 0.85);
            }
            col += vec3(1.0, 0.9, 0.8) * stars(d, h, 0.997) * smoothstep(0.35, 0.7, h);
          #elif SKY_TYPE == 3
            // Neon city night: violet-black, magenta horizon glow, a striped retro sun and stars.
            col = mix(uHor, uTop, pow(clamp(h, 0.0, 1.0), 0.35));
            col = mix(col, uTop, smoothstep(0.0, -0.1, h));
            float sd = dot(d, uSun);
            float ang = acos(clamp(sd, -1.0, 1.0));
            float disc = 1.0 - smoothstep(0.17, 0.175, ang);
            float rel = h - uSun.y;
            float band = step(0.45 + 0.4 * smoothstep(0.02, -0.12, rel), fract(rel * 45.0));
            float cut = mix(1.0, 1.0 - band, smoothstep(0.03, -0.02, rel));
            vec3 sunCol = mix(vec3(1.0, 0.82, 0.3), vec3(1.0, 0.2, 0.55), smoothstep(0.15, -0.12, rel));
            col = mix(col, sunCol * 1.5, disc * cut * step(0.0, h));
            col += vec3(1.0, 0.25, 0.6) * pow(max(sd, 0.0), 10.0) * 0.45;
            col += vec3(0.9, 0.85, 1.0) * stars(d, h, 0.994) * 1.2;
          #else
            // Overcast snow sky: layered soft grey clouds.
            col = mix(uHor, uTop, pow(clamp(h, 0.0, 1.0), 0.6));
            if (uAurora > 0.5) {
              vec2 p = d.xz / (h + 0.15) + vec2(uTime * 0.01, 0.0);
              float c = fbm(p * 0.8);
              col *= 0.88 + 0.24 * c;
            }
            col = mix(col, uHor, smoothstep(0.05, -0.1, h));
          #endif
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    );
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    this.sky = sky;
    this.group.add(sky);
    this.updaters.push((dt, time, cam) => {
      sky.material.uniforms.uTime.value = time;
      if (cam) sky.position.copy(cam.position);
    });

    // Distant city glow ring on the horizon (night arena only).
    if (this.theme.city !== 'night') return;
    const ringGeo = new THREE.CylinderGeometry(900, 900, 70, 64, 1, true);
    const ringMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `varying vec2 vUv; ${NOISE} void main(){
        float sky = smoothstep(0.0, 1.0, vUv.y);
        float bld = step(vUv.y, 0.15 + 0.25 * vnoise(vec2(vUv.x * 160.0, 0.0)) * step(0.4, vnoise(vec2(vUv.x * 40.0, 3.0))));
        float lights = step(0.8, hash12(floor(vec2(vUv.x * 2400.0, vUv.y * 120.0)))) * bld;
        vec3 c = mix(vec3(0.02,0.025,0.04), vec3(0.0), sky) + vec3(1.0, 0.8, 0.5) * lights * 0.6;
        float a = bld * 0.95 + (1.0 - sky) * 0.25;
        gl_FragColor = vec4(c, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 20;
    ring.visible = !!this.quality.city;
    this.cityRing = ring;
    this.group.add(ring);
  }

  // ------------------------------------------------------------------ scenery beyond the bowl
  buildProps() {
    const props = this.theme.props || [];
    if (props.includes('balloons')) this.buildBalloons();
    if (props.includes('towers')) this.buildTowers();
    if (props.includes('mountains')) this.buildMountains();
    if (props.includes('snow')) this.buildSnowfall();
    if (props.includes('canyon')) this.buildCanyon();
    this.buildScenery(this.theme.scenery || []);
  }

  // Theme scenery list: [{ kind, ...options }] (see scenery.js). Ranges come first so trees and
  // turbines can stand on their slopes.
  buildScenery(list) {
    const haze = this.theme.haze ?? this.theme.fog.color;
    let slope = null;
    const onSlope = (layer, f0, f1) => (i, rand) => {
      if (!slope) return null;
      const a = rand() * Math.PI * 2;
      return slope(layer, a, f0 + rand() * (f1 - f0));
    };
    for (const it of list) {
      if (it.kind === 'ranges') slope = buildRanges(this, it.layers, haze);
      else if (it.kind === 'trees') buildTrees(this, { ...it, kind: it.kind2 || 'pine', hazeColor: haze, place: onSlope(it.layer ?? 0, it.f?.[0] ?? 0.05, it.f?.[1] ?? 0.9) });
      else if (it.kind === 'turbines') {
        const spots = [];
        for (let i = 0; i < it.count; i++) {
          const p = slope && slope(it.layer ?? 0, it.from + (i / it.count) * it.span, 1.6);
          if (p) spots.push(p);
        }
        buildTurbines(this, { spots, color: it.color });
      } else if (it.kind === 'islands') buildIslands(this, { ...it, hazeColor: haze });
      else if (it.kind === 'clouds') buildClouds(this, it);
      else if (it.kind === 'bridge') buildBridge(this, it);
      else if (it.kind === 'traffic') buildTraffic(this, it);
      else if (it.kind === 'skyline') this.buildTowers(it);
    }
  }

  // Hot-air balloons drifting slowly around the stadium (day arena).
  buildBalloons() {
    const rand = this.rand;
    const prof = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const a = t * Math.PI;
      // Teardrop: wide top, narrowing to the burner mouth.
      const r = Math.sin(a) * (t < 0.55 ? 1.0 : 1.0 - (t - 0.55) * 0.9) * 6;
      prof.push(new THREE.Vector2(Math.max(0.6, r), 7 - t * 15));
    }
    const env = new THREE.LatheGeometry(prof.reverse(), 24);
    const palettes = [[0xff4d4d, 0xffd166], [0x2a86ff, 0xffffff], [0x3ad38a, 0xffe066], [0xff8a2a, 0x8a5cff]];
    this.balloons = [];
    for (let k = 0; k < 4; k++) {
      const [ca, cb] = palettes[k];
      const g = env.clone();
      const pos = g.getAttribute('position');
      const col = [];
      const A1 = new THREE.Color(ca);
      const B1 = new THREE.Color(cb);
      for (let i = 0; i < pos.count; i++) {
        const ang = Math.atan2(pos.getZ(i), pos.getX(i));
        const c = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 12) % 2 ? A1 : B1;
        col.push(c.r, c.g, c.b);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const b = new THREE.Group();
      b.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 })));
      const basket = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.6), new THREE.MeshStandardMaterial({ color: 0x7a5534, roughness: 0.9 }));
      basket.position.y = -10.5;
      b.add(basket);
      const a = (k / 4) * Math.PI * 2 + rand();
      const r = 120 + rand() * 60;
      b.userData = { a, r, y: 52 + rand() * 30, speed: 0.01 + rand() * 0.01, phase: rand() * 6 };
      this.group.add(b);
      this.balloons.push(b);
    }
    this.updaters.push((dt, time) => {
      for (const b of this.balloons) {
        const u = b.userData;
        u.a += u.speed * dt;
        b.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(time * 0.3 + u.phase) * 2, Math.sin(u.a) * u.r * 1.25);
        b.rotation.y = time * 0.05 + u.phase;
      }
    });
  }

  // Neon skyline: towers with lit windows and glowing roof edges around the arena.
  // opts (skyline): { count, r: [min, max], h: [min, max], w: [min, max], neon (roof edges), warm (window colors), beacons }
  buildTowers(opts = {}) {
    const rand = this.rand;
    const O = { count: 46, r: [125, 245], h: [45, 215], w: [12, 30], neon: true, warm: false, beacons: false, ...opts };
    const pos = [];
    const seed = [];
    const idx = [];
    const tops = [];
    let base = 0;
    const box = (cx, cz, w, d, h, sd) => {
      const x0 = cx - w / 2; const x1 = cx + w / 2; const z0 = cz - d / 2; const z1 = cz + d / 2;
      const v = [[x0, 0, z0], [x1, 0, z0], [x1, h, z0], [x0, h, z0], [x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1]];
      const faces = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7]];
      for (const f of faces) {
        for (const k of f) { pos.push(...v[k]); seed.push(sd); }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        base += 4;
      }
      tops.push([cx, h, cz, w, d]);
    };
    for (let i = 0; i < O.count; i++) {
      const a = (i / O.count) * Math.PI * 2 + rand() * 0.08;
      const r = O.r[0] + rand() * (O.r[1] - O.r[0]);
      const w = O.w[0] + rand() * (O.w[1] - O.w[0]);
      const h = O.h[0] + rand() * rand() * (O.h[1] - O.h[0]);
      box(Math.cos(a) * r, Math.sin(a) * r * 1.2, w, w * (0.7 + rand() * 0.6), h, rand());
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 1));
    g.setIndex(idx);
    const mat = shaderMat({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `attribute float seed; varying vec3 vW; varying float vSeed;
        ${FOG_V}
        void main(){ vSeed = seed; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform float uTime; varying vec3 vW; varying float vSeed; ${NOISE} ${FOG_F}
        void main(){
          vec2 cell = floor(vec2(vW.x + vW.z, vW.y) / vec2(2.2, 3.0));
          vec2 f = fract(vec2(vW.x + vW.z, vW.y) / vec2(2.2, 3.0));
          float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.25, f.y) * step(f.y, 0.75);
          float r = hash12(cell + vSeed * 91.0);
          float lit = step(0.62, r) * win;
          #ifdef WARM
          vec3 wc = r > 0.9 ? vec3(1.0, 0.95, 0.85) : vec3(1.0, 0.72, 0.42);
          vec3 c = vec3(0.05, 0.045, 0.06) + wc * lit * 1.2;
          #else
          vec3 wc = r > 0.92 ? vec3(1.0, 0.3, 0.8) : r > 0.84 ? vec3(0.3, 0.9, 1.0) : vec3(1.0, 0.82, 0.55);
          vec3 c = vec3(0.025, 0.02, 0.045) + wc * lit * 1.4;
          #endif
          gl_FragColor = vec4(c, 1.0);
          ${OUT_F}
        }`,
    });
    if (O.warm) {
      mat.defines = { ...(mat.defines || {}), WARM: '' };
      mat.needsUpdate = true;
    }
    const towers = new THREE.Mesh(g, mat);
    this.group.add(towers);
    if (O.beacons) {
      // Red aircraft lights on the tall ones, blinking together.
      const bm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.1, 0.05).multiplyScalar(3), toneMapped: false });
      for (const [x, h, z] of tops) if (h > O.h[0] + (O.h[1] - O.h[0]) * 0.45) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), bm);
        b.position.set(x, h + 1.5, z);
        this.group.add(b);
      }
      this.updaters.push((dt, time) => { bm.color.setRGB(1, 0.1, 0.05).multiplyScalar(Math.sin(time * 2.4) > 0.3 ? 3 : 0.25); });
    }
    if (!O.neon) return;
    // Neon edges on the roofs, alternating magenta and cyan.
    const neonA = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.25, 0.75).multiplyScalar(2.2), toneMapped: false });
    const neonB = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.9, 1.0).multiplyScalar(2.2), toneMapped: false });
    tops.forEach(([x, h, z, w, d], i) => {
      const ring = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.6, d + 0.6), i % 2 ? neonA : neonB);
      ring.position.set(x, h + 0.3, z);
      this.group.add(ring);
      if (i % 5 === 0) {
        const sign = new THREE.Mesh(new THREE.BoxGeometry(1.2, h * 0.35, 1.2), i % 2 ? neonB : neonA);
        sign.position.set(x + w / 2 + 0.6, h * 0.6, z);
        this.group.add(sign);
      }
    });
  }

  // Snowy peaks rising above the stands (frost arena).
  buildMountains() {
    const rand = this.rand;
    const segs = 160;
    const pos = [];
    const col = [];
    const idx = [];
    const rock = new THREE.Color(0x4a5566);
    const snow = new THREE.Color(0xf2f6fb);
    const c = new THREE.Color();
    const heights = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const n = Math.sin(a * 3 + 1) * 0.5 + Math.sin(a * 7 + 2) * 0.3 + Math.sin(a * 13) * 0.2;
      heights.push(130 + 90 * (0.5 + 0.5 * n) + rand() * 25);
    }
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const h = heights[i % segs];
      const r0 = 300;
      const r1 = 300 + 120;
      pos.push(Math.cos(a) * r1, -20, Math.sin(a) * r1, Math.cos(a) * r0, h, Math.sin(a) * r0);
      c.copy(rock);
      col.push(c.r, c.g, c.b);
      c.copy(rock).lerp(snow, h > 150 ? 1 : 0.6);
      col.push(c.r, c.g, c.b);
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 3, a, a + 3, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true, side: THREE.DoubleSide }));
    this.group.add(m);
  }

  // Falling snow around the camera: one draw call, animated in the vertex shader.
  buildSnowfall() {
    const n = Math.floor(7000 * Math.max(0.3, this.quality.particles));
    const pos = new Float32Array(n * 3);
    const rand = this.rand;
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rand() * 120 - 60;
      pos[i * 3 + 1] = rand() * 50;
      pos[i * 3 + 2] = rand() * 120 - 60;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uScale: { value: 400 } },
      vertexShader: `uniform float uTime; uniform vec3 uCam; uniform float uScale; varying float vA;
        void main(){
          vec3 p = position;
          p.y = mod(p.y - uTime * 1.6, 50.0);
          p.x += sin(uTime * 0.7 + position.z * 0.3) * 0.8;
          // Wrap the 120 m box around the camera so snow is always nearby.
          vec3 w = vec3(mod(p.x - uCam.x + 60.0, 120.0) - 60.0 + uCam.x, p.y, mod(p.z - uCam.z + 60.0, 120.0) - 60.0 + uCam.z);
          vec4 mv = viewMatrix * vec4(w, 1.0);
          gl_Position = projectionMatrix * mv;
          float depth = -mv.z;
          gl_PointSize = clamp(0.09 * uScale / max(depth, 0.5), 1.0, 9.0);
          vA = smoothstep(0.5, 3.0, depth) * (1.0 - smoothstep(40.0, 70.0, depth));
        }`,
      fragmentShader: `varying float vA; void main(){ float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard; gl_FragColor = vec4(vec3(1.0), vA * 0.85 * smoothstep(0.5, 0.1, r)); }`,
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 6;
    this.snow = pts;
    this.group.add(pts);
    this.updaters.push((dt, time, cam) => {
      mat.uniforms.uTime.value = time;
      if (cam) {
        mat.uniforms.uCam.value.copy(cam.position);
        mat.uniforms.uScale.value = this.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
      }
    });
  }

  // Red rock buttes and mesas around the desert arena.
  buildCanyon() {
    const rand = this.rand;
    const group = new THREE.Group();
    const bands = [0x8a3a1e, 0xb4552a, 0xc8743a, 0x9c4424, 0xd89058];
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rand() * 0.15;
      const r = 135 + rand() * 90;
      const h = 45 + rand() * 75;
      const rad = 14 + rand() * 22;
      const g = new THREE.CylinderGeometry(rad * (0.75 + rand() * 0.2), rad, h, 9, 6);
      const p = g.getAttribute('position');
      const colors = [];
      const cc = new THREE.Color();
      for (let k = 0; k < p.count; k++) {
        const y = p.getY(k);
        const jitter = 1 + (rand() - 0.5) * 0.18;
        p.setX(k, p.getX(k) * jitter);
        p.setZ(k, p.getZ(k) * jitter);
        const band = Math.floor(((y / h) + 0.5) * 7 + rand() * 0.6) % bands.length;
        cc.set(bands[band]);
        colors.push(cc.r, cc.g, cc.b);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r * 1.2);
      m.rotation.y = rand() * Math.PI;
      group.add(m);
    }
    this.group.add(group);
  }

  // Apply a graphics preset at runtime (crowd size, sky detail, extra glow geometry).
  setQuality(q) {
    this.quality = q;
    if (this.crowdGeo) this.crowdGeo.instanceCount = Math.floor(this.crowdMax * q.crowd * (this.crowdDensity ?? 1));
    if (this.sky) this.sky.material.uniforms.uAurora.value = q.aurora ? 1 : 0;
    if (this.shafts) this.shafts.visible = !!q.lightShafts;
    if (this.cityRing) this.cityRing.visible = !!q.city;
    if (this.grass) this.grass.setShells(q.grass ?? 0);
  }

  // Cars and the ball that press the grass down: [{ x, z, r, s }] (meters).
  setGrassPush(list) {
    this.grassPush = list;
  }

  // ------------------------------------------------------------------ runtime
  pulseWalls(team, amount = 1) {
    this.wallMat.uniforms.uPulse.value.setComponent(team, amount);
  }

  goalCelebration(scoringTeam, defendingGoal) {
    this.cheer[scoringTeam] = 1;
    const gf = this.goalFrames[defendingGoal];
    if (gf) gf.flash = 1;
    this.pulseWalls(scoringTeam, 1.2);
  }

  // Car and ball positions for the ceiling glow (meters, three axes).
  setNear(car, ball) {
    if (!this.ceilMat) return;
    this.ceilMat.uniforms.uCar.value.copy(car);
    if (ball) this.ceilMat.uniforms.uBall.value.copy(ball);
    else this.ceilMat.uniforms.uBall.value.set(0, -100, 0);
  }

  update(dt, time, camera) {
    this.time = time;
    for (const u of this.updaters) u(dt, time, camera);
  }
}
