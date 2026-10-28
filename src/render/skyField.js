// Sky Field: a flat floor that goes on forever under an open daytime sky.
//
// "Forever" works with a floating origin: the game moves the car and ball back toward (0, 0, 0)
// every 1000 m (see Game.recenterEndless), and the floor pattern repeats every 1000 m, so the move
// cannot be seen. That keeps every position small, because physics and the GPU use 32-bit floats
// and get shaky far from the origin. The floor mesh follows the car; the pattern is drawn from the
// world position in the shader, so it stays put while the mesh moves.
import * as THREE from 'three';

const SUN_DIR = new THREE.Vector3(0.45, 0.8, 0.35).normalize();
const SKY_TOP = new THREE.Color(0x2f6fd8);
const SKY_HOR = new THREE.Color(0xbfd8f2);
const FOG = 0xbfd8f2;
export const PATTERN_PERIOD = 1000; // meters; origin shifts are whole multiples of this

export class SkyField {
  constructor(renderer, quality) {
    this.group = new THREE.Group();
    this.group.name = 'skyField';
    this.quality = quality;
    this.offset = new THREE.Vector2(); // total origin shift so far (for the distance readout)
    this.buildLights();
    this.buildFloor();
    this.buildSky();
    this.buildEnv(renderer);
    this.fog = new THREE.FogExp2(FOG, 0.0016);
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x4a5a6a, 0.65);
    this.group.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
    sun.castShadow = true;
    const sc = sun.shadow.camera;
    sc.left = -28;
    sc.right = 28;
    sc.top = 28;
    sc.bottom = -28;
    sc.near = 1;
    sc.far = 160;
    const size = this.quality.shadowSize || 1024;
    sun.shadow.mapSize.set(size, size);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    this.group.add(sun, sun.target);
    this.sun = sun;
  }

  buildFloor() {
    // A big plane that follows the car; past ~2.5 km the fog has swallowed it anyway.
    const geo = new THREE.PlaneGeometry(6000, 6000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0.0, envMapIntensity: 0.12 });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFloorPos;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvFloorPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vFloorPos;
// Anti-aliased line: 1 on a line of the given width (m) every 'period' meters, fading out with distance.
float gridLine(vec2 p, float period, float width) {
  vec2 q = abs(fract(p / period + 0.5) - 0.5) * period;
  vec2 fw = fwidth(p);
  vec2 l = 1.0 - smoothstep(vec2(width) * 0.5, vec2(width) * 0.5 + fw * 1.5, q);
  // Lines thinner than a pixel fade instead of shimmering.
  vec2 fade = clamp(2.5 * width / max(fw, 1e-4), 0.0, 1.0);
  return max(l.x * fade.x, l.y * fade.y);
}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 p = vFloorPos.xz;
  // 100 m checker in two close shades so you can feel your speed far away from any line.
  vec2 cell = floor(p / 100.0);
  float checker = mod(cell.x + cell.y, 2.0);
  vec3 base = mix(vec3(0.014, 0.024, 0.04), vec3(0.019, 0.032, 0.052), checker);
  float minor = gridLine(p, 5.0, 0.1);
  float major = gridLine(p, 50.0, 0.3);
  float km = gridLine(p + 250.0, 500.0, 0.9); // offset so the start point is not on a line
  vec3 c = base;
  c = mix(c, vec3(0.06, 0.09, 0.13), minor * 0.9);
  c = mix(c, vec3(0.17, 0.26, 0.37), major * 0.95);
  c = mix(c, vec3(0.7, 0.42, 0.1), km);
  diffuseColor.rgb = c;
}`);
    };
    const floor = new THREE.Mesh(geo, mat);
    floor.receiveShadow = true;
    this.floor = floor;
    this.group.add(floor);
  }

  buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(2600, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTop: { value: SKY_TOP }, uHor: { value: SKY_HOR }, uSun: { value: SUN_DIR },
        },
        vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
        fragmentShader: `uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uSun; varying vec3 vDir;
          float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
            return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
          void main(){
            vec3 d = normalize(vDir);
            float h = max(d.y, 0.0);
            vec3 c = mix(uHor, uTop, pow(h, 0.55));
            // Soft clouds on a flat layer above.
            if (d.y > 0.02) {
              vec2 cp = d.xz / d.y * 1.6;
              float n = noise(cp) * 0.55 + noise(cp * 2.3) * 0.3 + noise(cp * 5.1) * 0.15;
              float cloud = smoothstep(0.55, 0.8, n) * smoothstep(0.02, 0.25, d.y);
              c = mix(c, vec3(1.0), cloud * 0.75);
            }
            float s = max(dot(d, uSun), 0.0);
            c += vec3(1.0, 0.92, 0.75) * (pow(s, 600.0) * 4.0 + pow(s, 12.0) * 0.25);
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    this.sky = sky;
    this.group.add(sky);
  }

  // Reflections for the car paint: the same sky with a dark floor.
  buildEnv(renderer) {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(
      new THREE.SphereGeometry(100, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: { uTop: { value: SKY_TOP }, uHor: { value: SKY_HOR }, uSun: { value: SUN_DIR } },
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: `uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uSun; varying vec3 vP;
          void main(){ vec3 d = normalize(vP);
            vec3 c = d.y > 0.0 ? mix(uHor, uTop, pow(d.y, 0.55)) : mix(uHor * 0.5, vec3(0.2, 0.3, 0.4), pow(-d.y, 0.4));
            c += vec3(1.0, 0.95, 0.85) * (pow(max(dot(d, uSun), 0.0), 60.0) * 20.0);
            gl_FragColor = vec4(c, 1.0); }`,
      }),
    ));
    const pm = new THREE.PMREMGenerator(renderer);
    this.envMap = pm.fromScene(env, 0.03).texture;
    pm.dispose();
  }

  setQuality(q) {
    this.quality = q;
    const size = q.shadowSize || 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  // Keep the floor, sky and sun shadow centered on the car.
  update(focus, camera) {
    // Snap the floor to the pattern's smallest repeat (5 m) so nothing swims.
    this.floor.position.set(Math.round(focus.x / 50) * 50, 0, Math.round(focus.z / 50) * 50);
    this.sky.position.copy(camera.position);
    this.sun.target.position.set(focus.x, 0, focus.z);
    this.sun.position.copy(this.sun.target.position).addScaledVector(SUN_DIR, 80);
    this.sun.target.updateMatrixWorld();
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    this.envMap?.dispose();
    this.sun.shadow.map?.dispose();
  }
}
