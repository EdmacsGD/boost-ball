// Full-screen goal explosion effects: a post-processing pass that bends, twists, ripples, tints and
// flashes the whole picture around a point in the world (the goal). Goal explosions add short
// "tracks"; each track is a function of time that returns the settings it wants, and the tracks
// are mixed every frame. When no track is running the pass is switched off and costs nothing.
import * as THREE from 'three';

const WarpShader = {
  uniforms: {
    tDiffuse: { value: null },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uAspect: { value: 1.78 },
    uTime: { value: 0 },
    uPinch: { value: 0 }, // 0..1: the picture shrinks into the center (1 = all of it gone)
    uSwirl: { value: 0 }, // radians of twist near the center
    uHole: { value: 0 }, // radius of the black disc (screen heights)
    uRim: { value: new THREE.Color(1, 1, 1) },
    uRipR: { value: 0 }, // ripple ring radius (screen heights)
    uRipA: { value: 0 }, // ripple strength
    uBulge: { value: 0 }, // push outward from the center (lens)
    uHaze: { value: 0 }, // heat shimmer
    uTint: { value: new THREE.Color(1, 1, 1) },
    uTintA: { value: 0 },
    uVig: { value: 0 }, // colored edges
    uDark: { value: 0 }, // whole picture darker
    uFlash: { value: new THREE.Color(0, 0, 0) },
    uChroma: { value: 0 }, // color fringes
    uZoom: { value: 0 }, // radial blur toward the center
    uPixel: { value: 0 }, // 0..1 blocky pixels
    uHue: { value: 0 }, // hue rotation (radians)
    uStars: { value: 0 }, // star field in the void and over the dark picture
    uRes: { value: new THREE.Vector2(1280, 720) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uCenter, uRes;
    uniform float uAspect, uTime, uPinch, uSwirl, uHole, uRipR, uRipA, uBulge, uHaze, uTintA, uVig, uDark;
    uniform float uChroma, uZoom, uPixel, uHue, uStars;
    uniform vec3 uRim, uTint, uFlash;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    vec3 stars(vec2 uv) {
      vec2 g = uv * vec2(uAspect, 1.0) * 90.0;
      vec2 id = floor(g);
      float h = hash(id);
      float tw = 0.6 + 0.4 * sin(uTime * 3.0 + h * 40.0);
      float d = length(fract(g) - 0.5);
      float s = step(0.985, h) * smoothstep(0.25, 0.0, d) * tw;
      return vec3(0.85, 0.9, 1.0) * s;
    }

    vec3 hueRot(vec3 c, float a) {
      const vec3 k = vec3(0.57735);
      float ca = cos(a);
      return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
    }

    // Where in the original picture this pixel looks (the warp), or off screen (the void).
    vec2 warp(vec2 uv) {
      vec2 d = uv - uCenter;
      d.x *= uAspect;
      float r = length(d);
      // Pinch: everything is drawn smaller, pulled toward the center, harder near the center.
      if (uPinch > 0.0) {
        float k = 1.0 / max(0.002, 1.0 - uPinch);
        float near = exp(-r * 2.5);
        d *= mix(1.0, k, 0.55 + 0.45 * near) ;
      }
      // Swirl: twist that is strongest at the center.
      if (uSwirl != 0.0) {
        float a = uSwirl / (1.0 + r * 6.0);
        float s = sin(a), c = cos(a);
        d = mat2(c, -s, s, c) * d;
      }
      // Ripple ring and lens bulge.
      float r2 = length(d);
      if (uRipA != 0.0) {
        float x = (r2 - uRipR) / 0.07;
        float w = exp(-x * x) * sin(x * 3.0);
        d *= 1.0 - uRipA * w / max(r2, 0.05);
      }
      if (uBulge != 0.0) d *= 1.0 - uBulge * exp(-r2 * 3.0);
      if (uHaze > 0.0) {
        d.x += sin(uv.y * 60.0 + uTime * 9.0) * 0.004 * uHaze;
        d.y += sin(uv.x * 45.0 + uTime * 7.0) * 0.003 * uHaze;
      }
      d.x /= uAspect;
      vec2 o = uCenter + d;
      if (uPixel > 0.0) {
        vec2 cells = uRes / mix(1.0, 26.0, uPixel);
        o = (floor(o * cells) + 0.5) / cells;
      }
      return o;
    }

    vec3 fetch(vec2 uv) {
      // Small bends (ripples, bulges) just stretch the edge pixels; only a real pull shows the void.
      if (uPinch < 0.05) uv = clamp(uv, vec2(0.001), vec2(0.999));
      if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
        // The void: almost black with a faint glow and stars.
        return vec3(0.01, 0.0, 0.025) + stars(uv * 0.5 + 0.3) * 0.8;
      }
      return texture2D(tDiffuse, uv).rgb;
    }

    void main() {
      vec2 uv = warp(vUv);
      vec3 col;
      if (uChroma > 0.0) {
        vec2 dir = (uv - uCenter) * uChroma * 0.03;
        col = vec3(fetch(uv + dir).r, fetch(uv).g, fetch(uv - dir).b);
      } else {
        col = fetch(uv);
      }
      if (uZoom > 0.0) {
        vec3 acc = col;
        for (int i = 1; i < 8; i++) {
          float f = float(i) / 8.0 * uZoom * 0.12;
          acc += fetch(mix(uv, uCenter, f));
        }
        col = acc / 8.0;
      }
      vec2 d = vUv - uCenter;
      d.x *= uAspect;
      float r = length(d);
      // Black hole disc with a bright, flickering rim.
      if (uHole > 0.0) {
        float edge = smoothstep(uHole, uHole * 0.92, r);
        float rim = exp(-pow((r - uHole) / (uHole * 0.12 + 0.004), 2.0));
        float ang = atan(d.y, d.x);
        rim *= 0.75 + 0.25 * sin(ang * 7.0 - uTime * 14.0);
        col = mix(col, vec3(0.0), edge);
        col += uRim * rim * 2.2;
        col += uRim * exp(-max(r - uHole, 0.0) * 9.0) * 0.25 * (1.0 - edge);
      }
      if (uHue != 0.0) col = hueRot(col, uHue);
      col *= 1.0 - uDark;
      if (uStars > 0.0) col += stars(vUv) * uStars;
      col = mix(col, col * uTint * 1.6, uTintA);
      float vig = smoothstep(0.35, 1.05, length((vUv - 0.5) * vec2(uAspect, 1.0)));
      col += uTint * vig * uVig;
      col += uFlash;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

const ZERO = {
  pinch: 0, swirl: 0, hole: 0, ripR: 0, ripA: 0, bulge: 0, haze: 0, tintA: 0, vig: 0, dark: 0,
  chroma: 0, zoom: 0, pixel: 0, hue: 0, stars: 0, flash: 0,
};

export class ScreenFx {
  constructor() {
    this.tracks = []; // { pos, t, life, fn, color }
    this.enabled = true;
    this.uniforms = null; // set by the renderer's pass
    this.time = 0;
    this.flashCol = new THREE.Color();
    this.tint = new THREE.Color();
    this.rim = new THREE.Color();
    this.v = new THREE.Vector3();
  }

  makeShader() {
    return WarpShader;
  }

  // Add a track. fn(t, life) returns some of: pinch, swirl, hole, ripR, ripA, bulge, haze, tintA,
  // vig, dark, chroma, zoom, pixel, hue, stars, flash (0..1 white-ish, colored by `flashColor`).
  add(pos, life, fn, color = null) {
    if (!this.enabled) return;
    this.tracks.push({ pos: pos.clone(), t: 0, life, fn, color: color ? new THREE.Color(color) : new THREE.Color(1, 1, 1) });
  }

  clear() {
    this.tracks.length = 0;
  }

  get active() {
    return this.tracks.length > 0;
  }

  update(dt) {
    this.time += dt;
    for (let i = this.tracks.length - 1; i >= 0; i--) {
      const tr = this.tracks[i];
      tr.t += dt;
      if (tr.t >= tr.life) this.tracks.splice(i, 1);
    }
  }

  // Fill the shader uniforms for this frame. Returns false when nothing is running.
  apply(u, camera, width, height) {
    if (!this.tracks.length) return false;
    const s = { ...ZERO };
    this.tint.setRGB(0, 0, 0);
    this.flashCol.setRGB(0, 0, 0);
    this.rim.setRGB(0, 0, 0);
    let tintW = 0;
    let center = null;
    let best = -1;
    for (const tr of this.tracks) {
      const o = tr.fn(tr.t, tr.life) || {};
      // Strong effects decide the center (the newest one wins a tie).
      const w = (o.pinch || 0) * 4 + (o.hole || 0) * 4 + Math.abs(o.swirl || 0) + Math.abs(o.ripA || 0) * 3 + Math.abs(o.bulge || 0) * 2 + 0.01;
      if (w >= best) {
        best = w;
        center = tr.pos;
      }
      s.pinch = Math.max(s.pinch, o.pinch || 0);
      s.hole = Math.max(s.hole, o.hole || 0);
      s.swirl += o.swirl || 0;
      if (Math.abs(o.ripA || 0) > Math.abs(s.ripA)) {
        s.ripA = o.ripA;
        s.ripR = o.ripR || 0;
      }
      s.bulge += o.bulge || 0;
      s.haze = Math.max(s.haze, o.haze || 0);
      s.dark = Math.max(s.dark, o.dark || 0);
      s.chroma = Math.max(s.chroma, o.chroma || 0);
      s.zoom = Math.max(s.zoom, o.zoom || 0);
      s.pixel = Math.max(s.pixel, o.pixel || 0);
      s.hue += o.hue || 0;
      s.stars = Math.max(s.stars, o.stars || 0);
      const ta = (o.tintA || 0) + (o.vig || 0);
      if (ta > 0) {
        this.tint.r += tr.color.r * ta;
        this.tint.g += tr.color.g * ta;
        this.tint.b += tr.color.b * ta;
        tintW += ta;
      }
      s.tintA = Math.max(s.tintA, o.tintA || 0);
      s.vig = Math.max(s.vig, o.vig || 0);
      if (o.flash) {
        const fc = o.flashColor || tr.color;
        this.flashCol.r += fc.r * o.flash;
        this.flashCol.g += fc.g * o.flash;
        this.flashCol.b += fc.b * o.flash;
      }
      if (o.hole) this.rim.copy(o.rimColor || tr.color);
    }
    if (tintW > 0) this.tint.multiplyScalar(1 / tintW);
    // Goal position on screen. Behind the camera: keep the effect centered so it still reads.
    const p = this.v.copy(center).project(camera);
    let cx = p.x * 0.5 + 0.5;
    let cy = p.y * 0.5 + 0.5;
    if (p.z > 1) {
      cx = 0.5;
      cy = 0.5;
    }
    u.uCenter.value.set(Math.min(1.3, Math.max(-0.3, cx)), Math.min(1.3, Math.max(-0.3, cy)));
    u.uAspect.value = width / height;
    u.uRes.value.set(width, height);
    u.uTime.value = this.time;
    u.uPinch.value = Math.min(0.995, s.pinch);
    u.uSwirl.value = s.swirl;
    u.uHole.value = s.hole;
    u.uRim.value.copy(this.rim);
    u.uRipR.value = s.ripR;
    u.uRipA.value = s.ripA;
    u.uBulge.value = s.bulge;
    u.uHaze.value = s.haze;
    u.uTint.value.copy(tintW > 0 ? this.tint : this.tint.setRGB(1, 1, 1));
    u.uTintA.value = Math.min(1, s.tintA);
    u.uVig.value = s.vig;
    u.uDark.value = Math.min(1, s.dark);
    u.uFlash.value.copy(this.flashCol);
    u.uChroma.value = s.chroma;
    u.uZoom.value = Math.min(1, s.zoom);
    u.uPixel.value = Math.min(1, s.pixel);
    u.uHue.value = s.hue;
    u.uStars.value = s.stars;
    return true;
  }
}

// Envelope helpers for tracks.
export const env = {
  // 0 -> 1 over [a, b] (smooth).
  up: (t, a, b) => {
    const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
    return x * x * (3 - 2 * x);
  },
  // 1 -> 0 over [a, b].
  down: (t, a, b) => 1 - env.up(t, a, b),
  // Quick attack, smooth fall: peak 1 at `at`, gone after `at + len`.
  pulse: (t, at, len) => {
    if (t < at) return 0;
    const x = (t - at) / len;
    return x >= 1 ? 0 : (1 - x) * (1 - x);
  },
  // A ripple ring: { ripR, ripA } starting at `at`, growing to `r1` over `len` seconds.
  ripple: (t, at, len, r1, amp) => {
    if (t < at || t > at + len) return { ripR: 0, ripA: 0 };
    const x = (t - at) / len;
    return { ripR: r1 * (1 - (1 - x) * (1 - x)), ripA: amp * (1 - x) };
  },
};
