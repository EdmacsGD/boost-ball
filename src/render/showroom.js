// Home screen backdrop: the selected car on a slowly turning platform in a dark studio, with a soft
// reflection under it, colored rim lights and a reflective environment. Original design.
import * as THREE from 'three';
import { createFlame } from './effects.js';
import { BallModel } from './ballModel.js';

function floorTexture() {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  // Radial falloff in the alpha channel so the floor fades into the backdrop.
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(40,48,64,1)');
  g.addColorStop(0.35, 'rgba(22,27,38,1)');
  g.addColorStop(1, 'rgba(8,10,16,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // Concentric rings and spokes, very faint.
  ctx.strokeStyle = 'rgba(150,180,230,0.10)';
  ctx.lineWidth = 2;
  for (let r = 60; r < S / 2; r += 60) {
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(S / 2 + Math.cos(a) * 120, S / 2 + Math.sin(a) * 120);
    ctx.lineTo(S / 2 + Math.cos(a) * S * 0.5, S / 2 + Math.sin(a) * S * 0.5);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Showroom {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 200);
    this.spin = -0.25; // front three-quarter view toward the camera
    this.spinSpeed = 0.28;
    this.dragVel = 0;
    this.shift = 0.24; // move the car right of center so the menu has room on the left
    this.model = null;
    this.mirror = null;
    this.time = 0;

    // Backdrop: deep blue-black gradient with soft team-colored glows low on each side.
    const bg = new THREE.Mesh(
      new THREE.SphereGeometry(60, 48, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { uTime: { value: 0 } },
        vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: /* glsl */ `
          uniform float uTime;
          varying vec3 vD;
          void main() {
            float h = vD.y;
            vec3 c = mix(vec3(0.02, 0.028, 0.05), vec3(0.006, 0.008, 0.016), smoothstep(-0.05, 0.6, h));
            float az = atan(vD.x, vD.z);
            c += vec3(0.08, 0.28, 0.9) * 0.22 * exp(-pow((az + 1.2) * 1.6, 2.0)) * exp(-abs(h - 0.05) * 6.0);
            c += vec3(1.0, 0.45, 0.12) * 0.2 * exp(-pow((az - 1.2) * 1.6, 2.0)) * exp(-abs(h - 0.05) * 6.0);
            // Slow light sweep across the back wall.
            float sweep = exp(-pow(fract(az * 0.16 + uTime * 0.03) - 0.5, 2.0) * 220.0) * smoothstep(0.0, 0.3, h) * (1.0 - smoothstep(0.3, 0.7, h));
            c += vec3(0.5, 0.65, 1.0) * sweep * 0.05;
            gl_FragColor = vec4(c, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    );
    bg.renderOrder = -1;
    this.bg = bg;
    this.scene.add(bg);

    // Floor: semi-transparent so the mirrored car under it reads as a reflection.
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(14, 96),
      new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.4, metalness: 0.4, transparent: true, opacity: 0.9, depthWrite: true }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.renderOrder = 1;
    this.scene.add(floor);

    // Stage: turntable plus ring. It lives in this studio scene (garage) or is moved out onto the
    // pitch of the current arena (main menu), see setStage.
    this.stage = new THREE.Group();
    this.scene.add(this.stage);
    this.stageMode = 'studio';
    this.turntable = new THREE.Group();
    this.stage.add(this.turntable);
    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5aa8ff).multiplyScalar(2.2), toneMapped: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.012, 8, 128), this.ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.012;
    ring.renderOrder = 2;
    this.stage.add(ring);
    // Soft glow disc under the car, only on the pitch (the studio floor has its own rings).
    const gc = document.createElement('canvas');
    gc.width = gc.height = 128;
    const g2 = gc.getContext('2d');
    const grad = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.18)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g2.fillStyle = grad;
    g2.fillRect(0, 0, 128, 128);
    const glowTex = new THREE.CanvasTexture(gc);
    this.glowMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0x5aa8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.glow = new THREE.Mesh(new THREE.CircleGeometry(1.9, 48), this.glowMat);
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = 0.01;
    this.glow.renderOrder = 1;
    this.glow.visible = false;
    this.stage.add(this.glow);
    this.ticks = [];
    for (let k = 0; k < 36; k++) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.004, 0.012), this.ringMat);
      const a = (k / 36) * Math.PI * 2;
      t.position.set(Math.cos(a) * 1.23, 0.004, Math.sin(a) * 1.23);
      t.rotation.y = -a;
      this.turntable.add(t);
    }

    // Lights: soft sky, a key light with shadows, and blue/orange rim lights from behind.
    this.scene.add(new THREE.HemisphereLight(0x9fb4d8, 0x0c0f14, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(3, 6, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera;
    sc.left = -2; sc.right = 2; sc.top = 2; sc.bottom = -2; sc.near = 1; sc.far = 15;
    key.shadow.bias = -0.0005;
    key.shadow.radius = 4;
    this.key = key;
    this.scene.add(key);
    const blue = new THREE.DirectionalLight(0x3d8bff, 2.2);
    blue.position.set(-4, 2, -3);
    const orange = new THREE.DirectionalLight(0xff8a2a, 2.0);
    orange.position.set(4, 2, -3);
    this.scene.add(blue, orange);

    // Reflections: a studio light box (overhead softbox, side strips, dark walls).
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(
      new THREE.SphereGeometry(20, 32, 16),
      new THREE.MeshBasicMaterial({ color: 0x07090e, side: THREE.BackSide }),
    ));
    const strip = (color, intensity, w, h, pos, look) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
      m.position.set(...pos);
      m.lookAt(...look);
      env.add(m);
    };
    strip(0xffffff, 6, 8, 4, [0, 9, 0], [0, 0, 0]);
    strip(0xffffff, 3, 2, 10, [6, 4, 6], [0, 0, 0]);
    strip(0x3d8bff, 5, 2, 10, [-8, 3, -2], [0, 0, 0]);
    strip(0xff8a2a, 5, 2, 10, [8, 3, -2], [0, 0, 0]);
    strip(0x9fb4d8, 1.2, 30, 3, [0, 1, -12], [0, 0, 0]);
    const pm = new THREE.PMREMGenerator(renderer);
    this.envMap = pm.fromScene(env, 0.04).texture;
    pm.dispose();
    this.scene.environment = this.envMap;
    this.scene.fog = new THREE.Fog(0x05070c, 9, 26);

    this.placeCamera();
  }

  placeCamera() {
    const o = this.stage.position;
    if (this.stageMode === 'arena') {
      // Lower and a bit wider on the pitch, so the stands and lights fill the background.
      this.camera.fov = 30;
      this.camera.position.set(o.x + 3.5, o.y + 0.8, o.z + 3.8);
      this.camera.lookAt(o.x, o.y + 0.55, o.z);
    } else {
      this.camera.fov = 28;
      this.camera.position.set(o.x + 3.3, o.y + 1.25, o.z + 3.55);
      this.camera.lookAt(o.x, o.y + 0.2, o.z);
    }
    this.camera.updateProjectionMatrix();
  }

  // mode 'studio': stage in this scene at the origin. 'arena': stage moved into `scene` at `spot`
  // (the car's reflection is hidden there; the arena lights and reflections take over).
  setStage(mode, scene = null, spot = null) {
    if (mode === 'arena' && scene) {
      scene.add(this.stage);
      this.stage.position.copy(spot);
    } else {
      this.scene.add(this.stage);
      this.stage.position.set(0, 0, 0);
    }
    this.stageMode = mode === 'arena' && scene ? 'arena' : 'studio';
    // The stand's rings lie flat on the pitch: keep the arena grass out of them.
    this.onStage?.(this.stageMode, this.stage.position);
    if (this.mirror) this.mirror.visible = this.stageMode === 'studio';
    this.glow.visible = this.stageMode === 'arena';
    if (this.size) this.resize(...this.size);
    this.placeCamera();
  }

  resize(width, height) {
    this.size = [width, height];
    this.camera.aspect = width / height;
    // Narrow screens: keep the car centered; wide screens: shift it right to leave room for the menu
    // (studio only; on the pitch the menus sit on both sides and the car stays in the middle).
    const shift = width / height > 1.25 && this.stageMode === 'studio' ? this.shift : 0;
    this.camera.setViewOffset(width, height, -width * shift, 0, width, height);
    this.camera.updateProjectionMatrix();
  }

  setTeamColor(color) {
    this.ringMat.color.set(color).multiplyScalar(2.2);
    this.glowMat.color.set(color);
  }

  // model: a CarModel. The previous one is disposed.
  setCar(model) {
    if (this.model) {
      this.turntable.remove(this.model.root);
      this.turntable.remove(this.mirror);
      this.model.dispose();
    }
    this.model = model;
    const h = model.restHeight();
    model.root.position.set(0, h, 0);
    model.root.rotation.set(0, 0, 0);
    model.underglow.visible = false;
    // Turn the front wheels a little so the car looks posed.
    for (const w of model.wheelVis) if (w.def.front) w.steerG.rotation.y = -0.18;
    this.turntable.add(model.root);
    // Reflection: the same meshes mirrored under the floor.
    const mirror = model.root.clone(true);
    mirror.scale.y = -1;
    mirror.position.set(0, -h, 0);
    mirror.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    this.mirror = mirror;
    this.turntable.add(mirror);
    this.applyBoost();
    mirror.visible = this.stageMode === 'studio';
  }

  // Garage preview of a boost (flames on, item from meta/items.js) or null to hide them.
  setBoost(boostItem) {
    this.boostItem = boostItem;
    this.applyBoost();
  }

  applyBoost() {
    for (const f of this.flames || []) {
      f.parent?.remove(f);
      f.material.dispose();
    }
    this.flames = [];
    if (!this.boostItem || !this.model) return;
    for (const n of this.model.nozzles) {
      const f = createFlame(this.model.teamColor, this.boostItem);
      f.position.copy(n.pos).add(new THREE.Vector3(0.03, 0, 0));
      f.scale.setScalar(n.r / 0.06);
      this.model.body.add(f);
      this.flames.push(f);
    }
  }

  // Garage preview of a ball skin next to the car, or null to hide it.
  setBall(skin) {
    if (!skin) {
      if (this.ball) this.ball.root.visible = false;
      return;
    }
    if (!this.ball) {
      this.ball = new BallModel(0.9125, null);
      this.ball.marker.visible = false;
      this.stage.add(this.ball.root);
    }
    this.ball.setSkin(skin);
    this.ball.root.visible = true;
  }

  // Drag to spin the car; release keeps a little momentum.
  drag(dx) {
    this.spin += dx * 0.008;
    this.dragVel = dx * 0.008 * 60;
  }

  update(dt) {
    this.time += dt;
    this.dragVel *= Math.exp(-dt * 3);
    this.spin += (this.spinSpeed + this.dragVel) * dt;
    this.turntable.rotation.y = this.spin;
    this.bg.material.uniforms.uTime.value = this.time;
    for (const f of this.flames || []) {
      f.material.uniforms.uTime.value = this.time;
      f.material.uniforms.uPower.value = 0.95 + Math.random() * 0.2;
    }
    if (this.ball?.root.visible) {
      this.ballSpin = (this.ballSpin || 0) + dt * 0.5;
      this.ball.root.scale.setScalar(0.45);
      this.ball.update(dt, new THREE.Vector3(0.3, 0.75, -0.85), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.ballSpin), 0);
    }
  }
}
