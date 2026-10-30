import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { ScreenFx } from './screenFx.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

// Quality presets. "auto" starts at medium and moves up or down from measured frame times.
// maxPixelRatio caps the device pixel ratio (a 2x laptop screen at "medium" renders at 1.25x);
// renderScale then scales that. "lowest" is for weak laptops: about a third of the pixels of "medium",
// no shadows or glow, a thin crowd and a plain sky.
export const QUALITY = {
  lowest: { maxPixelRatio: 1, renderScale: 0.55, shadows: false, shadowSize: 0, bloom: false, fxaa: false, msaa: 0, crowd: 0.15, particles: 0.35, envMap: true, aurora: false, lightShafts: false, city: false },
  low: { maxPixelRatio: 1, renderScale: 0.75, shadows: false, shadowSize: 0, bloom: false, fxaa: false, msaa: 0, crowd: 0.4, particles: 0.5, envMap: true, aurora: false, lightShafts: false, city: true },
  medium: { maxPixelRatio: 1.25, renderScale: 1, shadows: true, shadowSize: 1024, bloom: true, fxaa: true, msaa: 0, crowd: 0.75, particles: 0.8, envMap: true, aurora: true, lightShafts: false, city: true },
  high: { maxPixelRatio: 2, renderScale: 1, shadows: true, shadowSize: 2048, bloom: true, fxaa: false, msaa: 4, crowd: 1.0, particles: 1.0, envMap: true, aurora: true, lightShafts: true, city: true },
};
// Glow around bright things (medium and high only). A wide, strong glow washed the whole picture
// out (about 70% brighter than low quality on the default arena), so it is kept tight: lights and
// boost flames glow, the rest of the scene keeps the same brightness as the low settings.
const BLOOM_SCALE = 0.5;
const BLOOM_RADIUS = 0.2;

const STEP_DOWN = { high: 'medium', medium: 'low', low: 'lowest' };

// Rough guess from the GPU name and core count; "auto" starts lower on likely-weak laptops.
export function guessWeakDevice(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    const weakGpu = /mali|powervr|adreno|swiftshader|llvmpipe|software|intel.*\b(hd|uhd) graphics/i.test(name);
    return weakGpu || (navigator.hardwareConcurrency || 8) <= 4;
  } catch {
    return false;
  }
}

export class Renderer {
  constructor(container) {
    this.container = container;
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0x05070d, 1);
    container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', 'Game view');
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 2500);
    // What gets drawn: the game scene by default, or another scene (the home screen showroom).
    this.view = { scene: this.scene, camera: this.camera };
    this.qualityName = 'medium';
    this.quality = QUALITY.medium;
    this.dynamicScale = 1;
    this.composer = null;
    this.bloomPass = null;
    this.fxaaPass = null;
    this.frameTimes = [];
    this.autoQuality = true;
    this.screenFx = new ScreenFx();
    this.warpPass = null;
    this.fxComposer = null; // low qualities draw straight to the screen; this one is for screen effects
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(name) {
    this.qualityName = name;
    this.quality = QUALITY[name];
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.buildComposer();
    this.resize();
    this.onQualityChange?.(this.quality);
  }

  buildComposer() {
    const q = this.quality;
    if (this.composer) {
      this.composer.dispose?.();
      this.composer = null;
    }
    if (this.fxComposer) {
      this.fxComposer.dispose?.();
      this.fxComposer = null;
    }
    this.warpPass = null;
    if (!q.bloom && !q.fxaa) {
      // Direct render: tone mapping and sRGB conversion happen in the main pass.
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      return;
    }
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: q.msaa,
    });
    const composer = new EffectComposer(this.renderer, target);
    this.renderPass = new RenderPass(this.view.scene, this.view.camera);
    composer.addPass(this.renderPass);
    if (q.bloom) {
      const b = this.bloomSettings || { strength: 0.55, threshold: 0.82 };
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), b.strength * BLOOM_SCALE, BLOOM_RADIUS, b.threshold);
      composer.addPass(this.bloomPass);
    } else {
      this.bloomPass = null;
    }
    composer.addPass(new OutputPass());
    this.warpPass = new ShaderPass(this.screenFx.makeShader());
    this.warpPass.enabled = false;
    composer.addPass(this.warpPass);
    if (q.fxaa) {
      this.fxaaPass = new ShaderPass(FXAAShader);
      composer.addPass(this.fxaaPass);
    }
    this.composer = composer;
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    const q = this.quality;
    const pr = Math.max(0.5, Math.min(dpr, q.maxPixelRatio) * q.renderScale * this.dynamicScale);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.width = w;
    this.height = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.onResize?.(w, h);
    if (this.composer) {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
      if (this.fxaaPass) {
        this.fxaaPass.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
      }
    }
  }

  // Horizontal FOV like the original game; three.js wants vertical.
  setHorizontalFov(deg) {
    const aspect = this.width / this.height;
    const v = 2 * Math.atan(Math.tan((deg * Math.PI) / 360) / aspect) * (180 / Math.PI);
    if (Math.abs(this.camera.fov - v) > 0.01) {
      this.camera.fov = v;
      this.camera.updateProjectionMatrix();
    }
  }

  // Dynamic resolution: keeps frame time near 60 fps by scaling the render size.
  trackFrame(dt) {
    if (!this.autoQuality) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 45) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    this.frameTimes.length = 0;
    // Big steps when far too slow so a weak laptop reaches a playable rate within a few seconds.
    // Going up waits for 4 fast windows in a row: every size change reallocates the render targets,
    // which is itself a small hitch, so the scale should not bounce up and down.
    let scale = this.dynamicScale;
    if (median > 1 / 30) scale = Math.max(0.55, scale - 0.2);
    else if (median > 1 / 50) scale = Math.max(0.55, scale - 0.1);
    if (median < 1 / 58 && scale < 1) {
      this.fastWindows = (this.fastWindows || 0) + 1;
      if (this.fastWindows >= 4) {
        this.fastWindows = 0;
        scale = Math.min(1, scale + 0.1);
      }
    } else {
      this.fastWindows = 0;
    }
    if (scale !== this.dynamicScale) {
      this.dynamicScale = scale;
      this.resize();
    }
    // Persistent slowness at the lowest scale: drop a quality level.
    if (median > 1 / 40 && this.dynamicScale <= 0.56 && STEP_DOWN[this.qualityName]) {
      this.setQuality(STEP_DOWN[this.qualityName]);
      this.dynamicScale = 0.8;
      this.resize();
    }
  }

  // Glow strength per arena: bright day scenes need a higher threshold or everything glows.
  setBloom(strength, threshold) {
    this.bloomSettings = { strength, threshold };
    if (this.bloomPass) {
      this.bloomPass.strength = strength * BLOOM_SCALE;
      this.bloomPass.threshold = threshold;
    }
  }

  setView(scene, camera) {
    this.view = { scene, camera };
    if (this.renderPass) {
      this.renderPass.scene = scene;
      this.renderPass.camera = camera;
    }
  }

  // A composer for the low qualities, used only while a screen effect runs.
  ensureFxComposer() {
    if (this.fxComposer) return this.fxComposer;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
    const c = new EffectComposer(this.renderer, target);
    c.addPass(new RenderPass(this.view.scene, this.view.camera));
    c.addPass(new OutputPass());
    const warp = new ShaderPass(this.screenFx.makeShader());
    c.addPass(warp);
    c.warp = warp;
    this.fxComposer = c;
    return c;
  }

  render() {
    const fx = this.screenFx;
    const on = fx.active && this.view.scene === this.scene;
    if (on) {
      let pass = this.warpPass;
      let comp = this.composer;
      if (!comp) {
        comp = this.ensureFxComposer();
        pass = comp.warp;
        comp.passes[0].scene = this.view.scene;
        comp.passes[0].camera = this.view.camera;
        const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
        if (comp.renderTarget1.width !== size.x || comp.renderTarget1.height !== size.y) {
          comp.setPixelRatio(this.renderer.getPixelRatio());
          comp.setSize(this.width, this.height);
        }
      }
      pass.enabled = fx.apply(pass.material.uniforms, this.view.camera, this.width, this.height);
      comp.render();
      return;
    }
    if (this.warpPass) this.warpPass.enabled = false;
    if (this.composer) this.composer.render();
    else this.renderer.render(this.view.scene, this.view.camera);
  }
}
