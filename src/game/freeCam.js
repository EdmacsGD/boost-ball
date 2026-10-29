// Free camera (free play and Sky Field): fly around and look at the arena. The car stops taking
// input while it is on; the ball and the world keep running.
//
// Keyboard: W A S D or arrows to move, Space up, X or Ctrl down, Shift faster, mouse to look
// (click the screen to lock the pointer, or hold a mouse button and drag). Controller: left stick
// moves, right stick looks, A up, B down, right trigger faster.
import * as THREE from 'three';

const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class FreeCam {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.vel = new THREE.Vector3();
    this.dragging = false;
    const canvas = game.renderer.renderer.domElement;
    this.canvas = canvas;
    window.addEventListener('mousemove', (e) => {
      if (!this.active) return;
      const locked = document.pointerLockElement === canvas;
      if (!locked && !this.dragging) return;
      this.yaw -= e.movementX * 0.0025;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - e.movementY * 0.0025));
    });
    canvas.addEventListener('mousedown', () => {
      if (!this.active) return;
      this.dragging = true;
      if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
        try {
          const r = canvas.requestPointerLock();
          if (r && r.catch) r.catch(() => {});
        } catch (e) {
          // Pointer lock is optional (dragging works without it).
        }
      }
    });
    window.addEventListener('mouseup', () => {
      this.dragging = false;
    });
  }

  allowed() {
    const g = this.game;
    if (g.state === 'theater') return true; // match replay
    return g.mode === 'free' && !g.np && (g.state === 'play' || g.state === 'countdown' || g.state === 'goal');
  }

  toggle() {
    if (this.active) this.stop();
    else this.start();
  }

  start() {
    if (!this.allowed()) {
      this.game.hud.popup('FREE CAMERA: FREE PLAY ONLY');
      return;
    }
    const cam = this.game.renderer.camera;
    this.pos.copy(cam.position);
    cam.getWorldDirection(fwd);
    this.yaw = Math.atan2(-fwd.x, -fwd.z);
    this.pitch = Math.asin(Math.max(-1, Math.min(1, fwd.y)));
    this.vel.set(0, 0, 0);
    this.active = true;
    document.body.classList.add('free-cam');
    if (this.game.state !== 'theater') this.game.hud.hint('FREE CAMERA · WASD move · mouse look · Space / X up and down · Shift fast · V to exit');
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    document.body.classList.remove('free-cam');
    if (document.pointerLockElement === this.canvas && document.exitPointerLock) document.exitPointerLock();
    if (this.game.state !== 'theater') this.game.hud.hint('');
    this.game.cameraRig.snap();
  }

  // Each rendered frame: move and point the camera.
  update(dt, rig) {
    if (!this.allowed()) {
      this.stop();
      return false;
    }
    const inp = this.game.input;
    const k = (c) => inp.keys.has(c);
    const pad = inp.padState;
    let mx = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
    let mz = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
    let my = (k('Space') ? 1 : 0) - (k('KeyX') || k('ControlLeft') || k('ControlRight') ? 1 : 0);
    let fast = k('ShiftLeft') || k('ShiftRight');
    if (pad) {
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
      mx += dz(pad.lx);
      mz -= dz(pad.ly);
      my += (pad.b[0] ? 1 : 0) - (pad.b[1] ? 1 : 0);
      this.yaw -= dz(pad.rx) * 2.4 * dt;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - dz(pad.ry) * 1.8 * dt));
      if ((pad.v && pad.v[7] > 0.5) || pad.b[7]) fast = true;
    }
    const speed = fast ? 70 : 22;
    fwd.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    right.crossVectors(fwd, UP).normalize();
    const want = new THREE.Vector3().addScaledVector(fwd, mz).addScaledVector(right, mx).addScaledVector(UP, my);
    if (want.lengthSq() > 1) want.normalize();
    want.multiplyScalar(speed);
    // Smooth start and stop.
    this.vel.lerp(want, Math.min(1, dt * 8));
    this.pos.addScaledVector(this.vel, dt);
    this.pos.clampLength(0, 1200);
    rig.pos.copy(this.pos);
    rig.look.copy(this.pos).add(fwd);
    rig.up.set(0, 1, 0);
    rig.apply(0);
    return true;
  }
}
