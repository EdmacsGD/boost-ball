// Ten original car designs built with the kit in carKit.js. Each one sits on one of the six hitbox
// shapes (CONFIG.hitboxes), so its body is sized to that box and its wheels sit where the physics
// wheels are. Coordinates in meters: +x forward, +y up, +z right, origin at the car's center point.
//
// Covered wheels use "pods": the core body stays narrower than the wheel track and a separate fender
// loft sits over each wheel with its lower edge near the axle, so the lower half of the tire shows.

import * as THREE from 'three';

// Mirror a list of loft stations to the left side (zc -> -zc).
const L = (stations, s) => stations.map((st) => ({ ...st, zc: (st.zc || 0) * s }));

export const DESIGNS = {
  // ------------------------------------------------------------------ 1. Strider (standard)
  strider: {
    name: 'Strider',
    hitbox: 'standard',
    blurb: 'Open-wheel racer with wings front and back.',
    span: [-0.6, 0.8, 0.35],
    livery: 'twin',
    wheels: { front: { r: 0.14, w: 0.13, z: 0.365 }, back: { r: 0.165, w: 0.17, z: 0.38 }, rim: 'spokes', arms: true, armFrom: { front: 0.12, back: 0.2 } },
    build(k) {
      k.shell([
        { x: 0.775, w: 0.055, yb: -0.045, yt: 0.005, n: 2.4, tb: 0.1 },
        { x: 0.7, w: 0.085, yb: -0.065, yt: 0.045, n: 2.7, tb: 0.15 },
        { x: 0.58, w: 0.115, yb: -0.08, yt: 0.095, n: 2.9, tb: 0.2 },
        { x: 0.43, w: 0.15, yb: -0.09, yt: 0.145, n: 3.1, tb: 0.22 },
        { x: 0.27, w: 0.19, yb: -0.095, yt: 0.19, n: 3.4, tb: 0.25 },
        { x: 0.11, w: 0.245, yb: -0.1, yt: 0.212, n: 3.8, tb: 0.3 },
        { x: -0.05, w: 0.285, yb: -0.1, yt: 0.222, n: 4.2, tb: 0.34 },
        { x: -0.2, w: 0.285, yb: -0.1, yt: 0.226, n: 4.2, tb: 0.4 },
        { x: -0.33, w: 0.25, yb: -0.095, yt: 0.228, n: 3.9, tb: 0.42 },
        { x: -0.45, w: 0.2, yb: -0.075, yt: 0.21, n: 3.5, tb: 0.38 },
        { x: -0.535, w: 0.16, yb: -0.045, yt: 0.175, n: 3.0, tb: 0.3 },
        { x: -0.565, w: 0.125, yb: -0.02, yt: 0.14, n: 2.6, tb: 0.22 },
      ], { ring: 48, steps: 7, twoTone: { y: 0.018, dark: 0.09 } });
      // Canopy, halo and engine fin.
      k.shell([
        { x: 0.3, w: 0.06, yb: 0.12, yt: 0.17, n: 2.4, tb: 0.5 },
        { x: 0.2, w: 0.12, yb: 0.12, yt: 0.29, n: 2.6, tb: 0.55 },
        { x: 0.06, w: 0.145, yb: 0.12, yt: 0.355, n: 2.8, tb: 0.58 },
        { x: -0.08, w: 0.14, yb: 0.12, yt: 0.355, n: 2.8, tb: 0.58 },
        { x: -0.2, w: 0.11, yb: 0.12, yt: 0.3, n: 2.6, tb: 0.55 },
      ], { mat: 'glass', ring: 36 });
      const halo = k.add(new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.014, 8, 32, Math.PI), k.mats.carbon));
      halo.rotation.set(0, Math.PI / 2, 0);
      halo.scale.set(1, 1.05, 1.2);
      halo.position.set(-0.02, 0.215, 0);
      k.box([0.03, 0.15, 0.022], [0.17, 0.27, 0], 'carbon', [0, 0, -0.5]);
      k.plate([[-0.16, 0], [-0.16, 0.13], [-0.3, 0.12], [-0.52, 0.05], [-0.54, 0]], 0.024, [0, 0.2, 0], 'paintPlain', { bevel: 0.006 });
      k.box([0.3, 0.012, 0.03], [-0.33, 0.315, 0], 'glow', [0, 0, 0.2]);
      k.cyl(0.04, 0.05, 0.08, [-0.13, 0.33, 0], 'black', { axis: 'x', open: true });
      k.sym((s) => {
        k.box([0.1, 0.07, 0.006], [0.14, 0.09, s * 0.236], 'black', [0, s * 0.9, 0]);
        k.box([0.42, 0.01, 0.006], [-0.12, 0.04, s * 0.289], 'glow');
        k.rbox([0.03, 0.025, 0.05], [0.16, 0.22, s * 0.2], 'carbon', { r: 0.008 });
      });
      // Front wing and lights.
      k.wing(0.15, 0.025, 0.84, [0.72, -0.085, 0], 'carbon', { rotZ: 0.08 });
      k.wing(0.09, 0.018, 0.7, [0.67, -0.05, 0], 'paintPlain', { rotZ: 0.25 });
      k.sym((s) => {
        k.box([0.17, 0.085, 0.012], [0.72, -0.06, s * 0.42], 'carbon');
        k.box([0.15, 0.008, 0.014], [0.72, -0.02, s * 0.42], 'glow');
        k.box([0.12, 0.012, 0.016], [0.64, 0.085, s * 0.098], 'head', [0, s * 0.28, -0.32]);
      });
      // Rear wing, diffuser, lights, boosters.
      k.wing(0.2, 0.032, 0.74, [-0.47, 0.44, 0], 'carbon', { rotZ: -0.12 });
      k.wing(0.09, 0.02, 0.74, [-0.585, 0.475, 0], 'paintPlain', { rotZ: -0.5 });
      k.box([0.012, 0.014, 0.6], [-0.6, 0.487, 0], 'tail');
      k.sym((s) => {
        k.box([0.24, 0.12, 0.012], [-0.49, 0.44, s * 0.375], 'carbon');
        k.box([0.012, 0.085, 0.016], [-0.607, 0.44, s * 0.375], 'tail');
        k.box([0.07, 0.2, 0.016], [-0.47, 0.33, s * 0.07], 'carbon', [0, 0, 0.32]);
      });
      k.box([0.16, 0.05, 0.42], [-0.52, -0.065, 0], 'carbon', [0, 0, -0.2]);
      for (let i = -2; i <= 2; i++) k.box([0.14, 0.06, 0.008], [-0.53, -0.06, i * 0.08], 'carbon', [0, 0, -0.2]);
      k.box([0.01, 0.03, 0.05], [-0.6, -0.03, 0], 'tail');
      k.sym((s) => k.nozzle([-0.64, 0.075, s * 0.085], 0.06, { len: 0.16 }));
    },
  },

  // ------------------------------------------------------------------ 2. Bulldog (tall)
  bulldog: {
    name: 'Bulldog',
    hitbox: 'tall',
    blurb: 'Lifted off-road pickup. Big tires, bull bar, roof light bar.',
    span: [-0.55, 0.8, 0.37],
    livery: 'single',
    baseShade: 0.78,
    wheels: { front: { r: 0.2, w: 0.17, z: 0.4 }, back: { r: 0.2, w: 0.17, z: 0.4 }, rim: 'beadlock', rimMat: 'rimBlack', tire: 'offroad', sidewall: 0.45 },
    build(k) {
      k.shell([
        { x: 0.735, w: 0.3, yb: 0.06, yt: 0.2, n: 5 },
        { x: 0.7, w: 0.34, yb: 0.05, yt: 0.26, n: 7, tb: 0.04 },
        { x: 0.55, w: 0.355, yb: 0.05, yt: 0.28, n: 8, tb: 0.06 },
        { x: 0.3, w: 0.36, yb: 0.05, yt: 0.29, n: 8, tb: 0.08 },
        { x: -0.05, w: 0.36, yb: 0.05, yt: 0.29, n: 8, tb: 0.08 },
        { x: -0.46, w: 0.36, yb: 0.05, yt: 0.28, n: 8, tb: 0.06 },
        { x: -0.525, w: 0.33, yb: 0.07, yt: 0.25, n: 6 },
      ], { twoTone: { y: 0.1, dark: 0.14 } });
      // Cab.
      k.shell([
        { x: 0.3, w: 0.31, yb: 0.28, yt: 0.295, n: 6, tb: 0.1 },
        { x: 0.17, w: 0.32, yb: 0.28, yt: 0.44, n: 7, tb: 0.18 },
        { x: -0.04, w: 0.32, yb: 0.28, yt: 0.45, n: 7, tb: 0.18 },
        { x: -0.09, w: 0.31, yb: 0.28, yt: 0.43, n: 7, tb: 0.18 },
      ], { mat: 'glass' });
      k.rbox([0.27, 0.026, 0.56], [0.05, 0.452, 0], 'paintPlain', { r: 0.012 });
      k.sym((s) => {
        k.rod([0.295, 0.29, s * 0.29], [0.175, 0.445, s * 0.265], 0.014, 'paintPlain');
        k.rod([-0.075, 0.29, s * 0.3], [-0.06, 0.445, s * 0.265], 0.016, 'paintPlain');
        k.rbox([0.035, 0.05, 0.06], [0.27, 0.34, s * 0.375], 'black', { r: 0.01 });
        k.rbox([0.5, 0.02, 0.07], [0.08, 0.045, s * 0.37], 'black', { r: 0.008 });
        k.rbox([0.06, 0.07, 0.012], [-0.54, 0.2, s * 0.3], 'tail', { r: 0.004 });
        k.arch(0.5125, 0.011, s * 0.4, 0.225, 0.2, 'plastic', { thick: 0.03, from: -0.1, to: Math.PI + 0.1 });
        k.arch(-0.3375, 0.011, s * 0.4, 0.225, 0.2, 'plastic', { thick: 0.03, from: -0.1, to: Math.PI + 0.1 });
        // Bed rails and glow strip.
        k.rbox([0.42, 0.03, 0.03], [-0.28, 0.295, s * 0.34], 'paintPlain', { r: 0.01 });
        k.box([0.4, 0.008, 0.008], [-0.28, 0.27, s * 0.362], 'glow');
        // Round headlights in chrome bezels.
        k.cyl(0.042, 0.042, 0.02, [0.735, 0.2, s * 0.21], 'chrome', { axis: 'x' });
        k.cyl(0.033, 0.033, 0.02, [0.742, 0.2, s * 0.21], 'head', { axis: 'x' });
        k.nozzle([-0.56, 0.12, s * 0.17], 0.05);
      });
      // Hood scoop, grille, bumpers, bull bar.
      k.rbox([0.18, 0.04, 0.22], [0.43, 0.3, 0], 'paintPlain', { r: 0.015 });
      k.rbox([0.012, 0.024, 0.17], [0.52, 0.305, 0], 'black', { r: 0.004 });
      k.rbox([0.02, 0.13, 0.3], [0.733, 0.17, 0], 'black', { r: 0.008 });
      for (const y of [0.13, 0.17, 0.21]) k.rbox([0.012, 0.012, 0.28], [0.745, y, 0], 'chrome', { r: 0.004 });
      k.rbox([0.07, 0.07, 0.68], [0.76, 0.06, 0], 'black', { r: 0.015 });
      k.rbox([0.06, 0.07, 0.64], [-0.545, 0.07, 0], 'black', { r: 0.015 });
      k.tube([[0.79, 0.07, -0.27], [0.82, 0.2, -0.25], [0.83, 0.25, -0.1], [0.83, 0.25, 0.1], [0.82, 0.2, 0.25], [0.79, 0.07, 0.27]], 0.016, 'black');
      k.rod([0.83, 0.25, -0.1], [0.8, 0.08, -0.1], 0.012, 'black');
      k.rod([0.83, 0.25, 0.1], [0.8, 0.08, 0.1], 0.012, 'black');
      // Open bed with a spare tire, roll bar and roof light bar.
      k.rbox([0.4, 0.012, 0.62], [-0.28, 0.284, 0], 'black', { r: 0.004 });
      const spare = k.add(new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.045, 10, 24), k.mats.rubber));
      spare.rotation.x = Math.PI / 2;
      spare.position.set(-0.31, 0.32, 0);
      k.cyl(0.065, 0.065, 0.03, [-0.31, 0.31, 0], 'rimBlack');
      k.tube([[-0.13, 0.28, -0.3], [-0.13, 0.46, -0.27], [-0.13, 0.48, 0], [-0.13, 0.46, 0.27], [-0.13, 0.28, 0.3]], 0.018, 'black');
      k.rbox([0.045, 0.035, 0.5], [0.13, 0.485, 0], 'black', { r: 0.008 });
      for (let i = 0; i < 6; i++) k.rbox([0.006, 0.022, 0.06], [0.155, 0.485, -0.2 + i * 0.08], 'head', { r: 0.003 });
    },
  },

  // ------------------------------------------------------------------ 3. Viper (wedge)
  viper: {
    name: 'Viper',
    hitbox: 'wedge',
    blurb: 'Low wedge supercar with a cab-forward canopy and a rear wing.',
    span: [-0.6, 0.82, 0.42],
    livery: 'twin',
    wheels: { front: { r: 0.15, w: 0.14, z: 0.345 }, back: { r: 0.17, w: 0.2, z: 0.36 }, rim: 'star', rimMat: 'rimBlack', sidewall: 0.3 },
    build(k) {
      k.shell([
        { x: 0.82, w: 0.1, yb: -0.07, yt: -0.04, n: 2.5 },
        { x: 0.76, w: 0.22, yb: -0.08, yt: 0.0, n: 3.5, tb: 0.2 },
        { x: 0.62, w: 0.26, yb: -0.085, yt: 0.045, n: 4, tb: 0.3 },
        { x: 0.4, w: 0.27, yb: -0.085, yt: 0.09, n: 4.5, tb: 0.35 },
        { x: 0.2, w: 0.27, yb: -0.085, yt: 0.12, n: 4.5, tb: 0.4 },
        { x: -0.1, w: 0.27, yb: -0.085, yt: 0.15, n: 4.5, tb: 0.42 },
        { x: -0.35, w: 0.27, yb: -0.08, yt: 0.15, n: 4.5, tb: 0.4 },
        { x: -0.52, w: 0.25, yb: -0.06, yt: 0.13, n: 4, tb: 0.3 },
        { x: -0.585, w: 0.2, yb: -0.03, yt: 0.11, n: 3 },
      ], { ring: 48, twoTone: { y: -0.045, dark: 0.12 } });
      k.sym((s) => {
        k.shell(L([
          { x: 0.75, w: 0.03, yb: -0.06, yt: -0.035, n: 2.5, zc: 0.3 },
          { x: 0.66, w: 0.085, yb: -0.065, yt: 0.06, n: 3, zc: 0.33 },
          { x: 0.515, w: 0.098, yb: -0.04, yt: 0.135, n: 3.2, zc: 0.34 },
          { x: 0.36, w: 0.09, yb: -0.055, yt: 0.105, n: 3, zc: 0.335 },
          { x: 0.24, w: 0.04, yb: -0.07, yt: 0.06, n: 2.5, zc: 0.31 },
        ], s), { twoTone: { y: -0.045, dark: 0.12 } });
        k.shell(L([
          { x: 0.02, w: 0.04, yb: -0.07, yt: 0.07, n: 2.5, zc: 0.31 },
          { x: -0.15, w: 0.1, yb: -0.05, yt: 0.15, n: 3, zc: 0.34 },
          { x: -0.3575, w: 0.118, yb: -0.02, yt: 0.17, n: 3.4, zc: 0.355 },
          { x: -0.52, w: 0.1, yb: -0.035, yt: 0.14, n: 3, zc: 0.35 },
          { x: -0.59, w: 0.05, yb: -0.03, yt: 0.09, n: 2.5, zc: 0.33 },
        ], s), { twoTone: { y: -0.045, dark: 0.12 } });
        // Sill between the fenders, side intake, mirror.
        k.shell(L([
          { x: 0.3, w: 0.03, yb: -0.08, yt: -0.01, n: 3, zc: 0.29 },
          { x: 0.18, w: 0.05, yb: -0.085, yt: 0.02, n: 4, zc: 0.3 },
          { x: -0.02, w: 0.05, yb: -0.085, yt: 0.03, n: 4, zc: 0.3 },
          { x: -0.12, w: 0.03, yb: -0.075, yt: 0.03, n: 3, zc: 0.29 },
        ], s), { twoTone: { y: -0.045, dark: 0.12 } });
        k.rbox([0.09, 0.06, 0.02], [-0.12, 0.06, s * 0.385], 'black', { r: 0.008, rot: [0, s * 0.35, 0] });
        k.box([0.33, 0.006, 0.006], [0.1, -0.06, s * 0.352], 'glow');
        k.rbox([0.035, 0.022, 0.045], [0.17, 0.17, s * 0.215], 'paintPlain', { r: 0.008 });
        k.box([0.08, 0.01, 0.05], [0.68, 0.045, s * 0.31], 'head', [0, -s * 0.3, -0.25]);
        k.box([0.008, 0.05, 0.012], [-0.595, 0.07, s * 0.335], 'tail');
        // Rear wing struts and endplates.
        k.rod([-0.5, 0.13, s * 0.17], [-0.52, 0.235, s * 0.17], 0.01, 'carbon');
        k.rbox([0.15, 0.07, 0.008], [-0.52, 0.245, s * 0.315], 'carbon', { r: 0.004 });
        k.nozzle([-0.6, 0.02, s * 0.075], 0.045);
      });
      k.shell([
        { x: 0.3, w: 0.12, yb: 0.06, yt: 0.09, n: 2.5, tb: 0.5 },
        { x: 0.18, w: 0.2, yb: 0.07, yt: 0.22, n: 2.8, tb: 0.55 },
        { x: 0.0, w: 0.22, yb: 0.1, yt: 0.27, n: 3, tb: 0.55 },
        { x: -0.18, w: 0.2, yb: 0.12, yt: 0.25, n: 3, tb: 0.55 },
        { x: -0.3, w: 0.14, yb: 0.13, yt: 0.18, n: 2.6, tb: 0.5 },
      ], { mat: 'glass' });
      for (let i = 0; i < 5; i++) k.rbox([0.022, 0.008, 0.3], [-0.33 - i * 0.04, 0.152 - i * 0.004, 0], 'black', { r: 0.003 });
      k.wing(0.12, 0.02, 0.64, [-0.52, 0.24, 0], 'carbon', { rotZ: -0.1 });
      k.box([0.008, 0.012, 0.42], [-0.588, 0.09, 0], 'tail');
      k.box([0.08, 0.008, 0.52], [0.79, -0.085, 0], 'carbon');
      for (const z of [-0.18, -0.06, 0.06, 0.18]) k.box([0.12, 0.05, 0.006], [-0.55, -0.065, z], 'carbon', [0, 0, -0.25]);
    },
  },

  // ------------------------------------------------------------------ 4. Hornet (hybrid)
  hornet: {
    name: 'Hornet',
    hitbox: 'hybrid',
    blurb: 'Rally hatchback with box flares, a light pod and a roof wing.',
    span: [-0.56, 0.81, 0.36],
    livery: 'single',
    wheels: { front: { r: 0.15, w: 0.14, z: 0.345 }, back: { r: 0.155, w: 0.15, z: 0.35 }, rim: 'mesh', rimMat: 'rimGold', sidewall: 0.36 },
    build(k) {
      k.shell([
        { x: 0.8, w: 0.22, yb: -0.04, yt: 0.07, n: 4 },
        { x: 0.74, w: 0.28, yb: -0.05, yt: 0.13, n: 5, tb: 0.1 },
        { x: 0.55, w: 0.29, yb: -0.055, yt: 0.185, n: 5.5, tb: 0.15 },
        { x: 0.33, w: 0.29, yb: -0.055, yt: 0.205, n: 5.5, tb: 0.2 },
        { x: 0.0, w: 0.29, yb: -0.055, yt: 0.215, n: 5.5, tb: 0.2 },
        { x: -0.36, w: 0.29, yb: -0.055, yt: 0.215, n: 5.5, tb: 0.2 },
        { x: -0.49, w: 0.27, yb: -0.04, yt: 0.2, n: 5, tb: 0.15 },
        { x: -0.53, w: 0.23, yb: -0.02, yt: 0.17, n: 4 },
      ], { twoTone: { y: -0.015, dark: 0.12 } });
      k.sym((s) => {
        k.shell(L([
          { x: 0.74, w: 0.03, yb: -0.03, yt: 0.06, n: 4, zc: 0.31 },
          { x: 0.66, w: 0.07, yb: -0.035, yt: 0.15, n: 6, zc: 0.335 },
          { x: 0.5125, w: 0.085, yb: -0.025, yt: 0.165, n: 7, zc: 0.345 },
          { x: 0.36, w: 0.07, yb: -0.035, yt: 0.15, n: 6, zc: 0.335 },
          { x: 0.28, w: 0.03, yb: -0.04, yt: 0.09, n: 4, zc: 0.31 },
        ], s), { twoTone: { y: 0.0, dark: 0.12 } });
        k.shell(L([
          { x: -0.1, w: 0.03, yb: -0.04, yt: 0.09, n: 4, zc: 0.31 },
          { x: -0.19, w: 0.08, yb: -0.035, yt: 0.16, n: 6, zc: 0.34 },
          { x: -0.34, w: 0.095, yb: -0.02, yt: 0.175, n: 7, zc: 0.35 },
          { x: -0.48, w: 0.08, yb: -0.03, yt: 0.16, n: 6, zc: 0.34 },
          { x: -0.545, w: 0.03, yb: -0.02, yt: 0.1, n: 4, zc: 0.31 },
        ], s), { twoTone: { y: 0.0, dark: 0.12 } });
        k.shell(L([
          { x: 0.3, w: 0.03, yb: -0.05, yt: 0.02, n: 4, zc: 0.29 },
          { x: 0.18, w: 0.045, yb: -0.06, yt: 0.03, n: 5, zc: 0.3 },
          { x: -0.02, w: 0.045, yb: -0.06, yt: 0.03, n: 5, zc: 0.3 },
          { x: -0.12, w: 0.03, yb: -0.05, yt: 0.03, n: 4, zc: 0.29 },
        ], s), { mat: 'plastic' });
        k.box([0.3, 0.006, 0.006], [0.09, 0.0, s * 0.347], 'glow');
        k.rbox([0.035, 0.03, 0.055], [0.33, 0.25, s * 0.31], 'paintPlain', { r: 0.008 });
        k.rbox([0.008, 0.1, 0.12], [0.5125 - 0.19, -0.11, s * 0.345], 'rubber', { r: 0.003 });
        k.rbox([0.008, 0.1, 0.12], [-0.34 - 0.19, -0.11, s * 0.35], 'rubber', { r: 0.003 });
        k.rbox([0.01, 0.035, 0.08], [0.786, 0.08, s * 0.17], 'head', { r: 0.004 });
        k.rbox([0.01, 0.07, 0.05], [-0.535, 0.13, s * 0.2], 'tail', { r: 0.004 });
        k.rod([-0.44, 0.36, s * 0.18], [-0.47, 0.405, s * 0.18], 0.01, 'carbon');
        k.rbox([0.15, 0.08, 0.008], [-0.47, 0.41, s * 0.305], 'carbon', { r: 0.004 });
        k.nozzle([-0.555, 0.0, s * 0.14], 0.045);
      });
      k.shell([
        { x: 0.36, w: 0.24, yb: 0.195, yt: 0.21, n: 4, tb: 0.3 },
        { x: 0.13, w: 0.27, yb: 0.195, yt: 0.355, n: 5, tb: 0.3 },
        { x: -0.3, w: 0.27, yb: 0.195, yt: 0.365, n: 5, tb: 0.3 },
        { x: -0.46, w: 0.25, yb: 0.195, yt: 0.28, n: 5, tb: 0.28 },
      ], { mat: 'glass' });
      k.shell([
        { x: 0.15, w: 0.17, yb: 0.348, yt: 0.36, n: 4 },
        { x: 0.1, w: 0.2, yb: 0.35, yt: 0.38, n: 5 },
        { x: -0.3, w: 0.2, yb: 0.35, yt: 0.385, n: 5 },
        { x: -0.36, w: 0.17, yb: 0.348, yt: 0.365, n: 4 },
      ]);
      k.rbox([0.13, 0.035, 0.12], [0.02, 0.395, 0], 'paintPlain', { r: 0.012 });
      k.rbox([0.01, 0.022, 0.1], [0.09, 0.395, 0], 'black', { r: 0.003 });
      k.wing(0.13, 0.022, 0.6, [-0.47, 0.41, 0], 'carbon', { rotZ: -0.15 });
      // Rally light pod on the hood, grille.
      k.rbox([0.03, 0.05, 0.38], [0.66, 0.205, 0], 'black', { r: 0.01, rot: [0, 0, -0.2] });
      for (const z of [-0.135, -0.045, 0.045, 0.135]) {
        k.cyl(0.032, 0.032, 0.025, [0.675, 0.21, z], 'chrome', { axis: 'x', rot: [0, 0, -0.2] });
        k.cyl(0.026, 0.026, 0.02, [0.685, 0.212, z], 'head', { axis: 'x', rot: [0, 0, -0.2] });
      }
      k.rbox([0.012, 0.05, 0.22], [0.795, 0.03, 0], 'black', { r: 0.004 });
    },
  },

  // ------------------------------------------------------------------ 5. Manta (flat)
  manta: {
    name: 'Manta',
    hitbox: 'flat',
    blurb: 'Wide, flat sci-fi racer shaped like a ray. Huge hitting surface.',
    span: [-0.62, 0.8, 0.46],
    livery: 'twin',
    wheels: { front: { r: 0.13, w: 0.12, z: 0.32 }, back: { r: 0.175, w: 0.2, z: 0.27 }, rim: 'turbine', rimMat: 'rimWhite', sidewall: 0.3 },
    build(k) {
      k.shell([
        { x: 0.79, w: 0.04, yb: 0.0, yt: 0.025, n: 2.2 },
        { x: 0.7, w: 0.2, yb: -0.005, yt: 0.045, n: 2.8, tb: 0.4 },
        { x: 0.52, w: 0.38, yb: 0.0, yt: 0.075, n: 3.5, tb: 0.6 },
        { x: 0.25, w: 0.45, yb: 0.01, yt: 0.105, n: 4, tb: 0.7 },
        { x: -0.05, w: 0.46, yb: 0.02, yt: 0.115, n: 4, tb: 0.72 },
        { x: -0.35, w: 0.44, yb: 0.03, yt: 0.115, n: 4, tb: 0.7 },
        { x: -0.52, w: 0.36, yb: 0.03, yt: 0.095, n: 3.5, tb: 0.6 },
        { x: -0.6, w: 0.24, yb: 0.035, yt: 0.07, n: 3, tb: 0.5 },
      ], { ring: 56, steps: 7 });
      k.shell([
        { x: 0.62, w: 0.08, yb: -0.02, yt: 0.03, n: 3 },
        { x: 0.3, w: 0.15, yb: -0.07, yt: 0.04, n: 3 },
        { x: -0.3, w: 0.16, yb: -0.07, yt: 0.05, n: 3 },
        { x: -0.56, w: 0.12, yb: -0.04, yt: 0.05, n: 3 },
      ], { mat: 'carbon' });
      k.shell([
        { x: 0.42, w: 0.06, yb: 0.06, yt: 0.08, n: 2.2, tb: 0.5 },
        { x: 0.28, w: 0.13, yb: 0.06, yt: 0.18, n: 2.4, tb: 0.5 },
        { x: 0.05, w: 0.15, yb: 0.07, yt: 0.22, n: 2.6, tb: 0.5 },
        { x: -0.18, w: 0.12, yb: 0.08, yt: 0.18, n: 2.4, tb: 0.5 },
        { x: -0.3, w: 0.06, yb: 0.09, yt: 0.11, n: 2.2 },
      ], { mat: 'glass' });
      k.sym((s) => {
        // Rear haunches over the big inboard rear wheels.
        k.shell(L([
          { x: -0.12, w: 0.04, yb: 0.05, yt: 0.1, n: 2.5, zc: 0.25 },
          { x: -0.24, w: 0.1, yb: 0.04, yt: 0.17, n: 3, zc: 0.27 },
          { x: -0.3543, w: 0.115, yb: 0.04, yt: 0.2, n: 3.2, zc: 0.27 },
          { x: -0.5, w: 0.1, yb: 0.04, yt: 0.16, n: 3, zc: 0.27 },
          { x: -0.6, w: 0.05, yb: 0.04, yt: 0.09, n: 2.5, zc: 0.25 },
        ], s));
        k.plate([[0, 0], [0.07, 0], [-0.06, 0.13], [-0.12, 0.13]], 0.016, [-0.38, 0.17, s * 0.27], 'paintPlain', { bevel: 0.004 });
        k.box([0.06, 0.01, 0.02], [-0.47, 0.305, s * 0.27], 'tail');
        k.tube([[0.7, 0.025, 0.17], [0.5, 0.045, 0.37], [0.25, 0.06, 0.45], [-0.05, 0.07, 0.462], [-0.35, 0.075, 0.442], [-0.55, 0.065, 0.33]].map((p) => [p[0], p[1], p[2] * s]), 0.006, 'glow', { seg: 48 });
        k.box([0.06, 0.008, 0.07], [0.6, 0.05, s * 0.21], 'head', [0, s * 0.6, 0]);
        k.nozzle([-0.6, 0.06, s * 0.15], 0.04);
      });
      k.nozzle([-0.62, 0.06, 0], 0.05);
      k.rbox([0.05, 0.02, 0.22], [0.7, -0.02, 0], 'black', { r: 0.006 });
    },
  },

  // ------------------------------------------------------------------ 6. Comet (long)
  comet: {
    name: 'Comet',
    hitbox: 'long',
    blurb: 'Retro rocket car with a bubble canopy, tail fins and chrome.',
    span: [-0.68, 0.8, 0.36],
    livery: 'side',
    baseShade: 0.86,
    wheels: { front: { r: 0.14, w: 0.12, z: 0.33 }, back: { r: 0.15, w: 0.14, z: 0.345 }, rim: 'cap', whitewall: true, sidewall: 0.4 },
    build(k) {
      k.shell([
        { x: 0.8, w: 0.015, yb: 0.06, yt: 0.075, n: 2 },
        { x: 0.74, w: 0.08, yb: 0.02, yt: 0.12, n: 2.1 },
        { x: 0.6, w: 0.17, yb: -0.03, yt: 0.17, n: 2.3 },
        { x: 0.4, w: 0.24, yb: -0.05, yt: 0.2, n: 2.5, tb: 0.15 },
        { x: 0.1, w: 0.26, yb: -0.055, yt: 0.21, n: 2.6, tb: 0.2 },
        { x: -0.25, w: 0.26, yb: -0.055, yt: 0.21, n: 2.6, tb: 0.2 },
        { x: -0.5, w: 0.21, yb: -0.03, yt: 0.18, n: 2.4, tb: 0.15 },
        { x: -0.63, w: 0.13, yb: 0.01, yt: 0.13, n: 2.2 },
        { x: -0.67, w: 0.1, yb: 0.025, yt: 0.115, n: 2 },
      ], { ring: 48, steps: 7 });
      k.sym((s) => {
        k.shell(L([
          { x: 0.74, w: 0.02, yb: -0.01, yt: 0.01, n: 2, zc: 0.3 },
          { x: 0.68, w: 0.06, yb: -0.035, yt: 0.07, n: 2.2, zc: 0.32 },
          { x: 0.52, w: 0.085, yb: -0.03, yt: 0.12, n: 2.4, zc: 0.33 },
          { x: 0.36, w: 0.075, yb: -0.035, yt: 0.1, n: 2.3, zc: 0.325 },
          { x: 0.22, w: 0.03, yb: -0.03, yt: 0.05, n: 2, zc: 0.3 },
        ], s));
        k.shell(L([
          { x: 0.0, w: 0.03, yb: -0.03, yt: 0.06, n: 2, zc: 0.3 },
          { x: -0.15, w: 0.08, yb: -0.04, yt: 0.13, n: 2.4, zc: 0.335 },
          { x: -0.35, w: 0.095, yb: -0.03, yt: 0.15, n: 2.6, zc: 0.345 },
          { x: -0.55, w: 0.08, yb: -0.02, yt: 0.13, n: 2.4, zc: 0.335 },
          { x: -0.66, w: 0.03, yb: 0.02, yt: 0.07, n: 2, zc: 0.31 },
        ], s));
        // Tail fin with a round tail light at its tip.
        k.plate([[0.0, 0.0], [0.2, 0.0], [0.02, 0.17], [-0.07, 0.2], [-0.07, 0.15]], 0.016, [-0.43, 0.12, s * 0.345], 'paintPlain', { bevel: 0.005 });
        k.sphere(0.02, [-0.5, 0.3, s * 0.345], 'tail', { scale: [1.6, 1, 1] });
        k.tube([[0.6, 0.06, 0.2 * s], [0.2, 0.085, 0.263 * s], [-0.3, 0.085, 0.263 * s], [-0.6, 0.065, 0.15 * s]], 0.007, 'chrome', { seg: 24 });
        k.sphere(0.026, [0.715, 0.035, s * 0.31], 'head');
        const ring = k.add(new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 8, 20), k.mats.chrome));
        ring.rotation.y = Math.PI / 2;
        ring.position.set(0.71, 0.035, s * 0.31);
        k.nozzle([-0.67, 0.045, s * 0.31], 0.035);
      });
      k.shell([
        { x: 0.3, w: 0.05, yb: 0.17, yt: 0.18, n: 2 },
        { x: 0.22, w: 0.13, yb: 0.16, yt: 0.28, n: 2.1 },
        { x: 0.05, w: 0.16, yb: 0.16, yt: 0.33, n: 2.2 },
        { x: -0.12, w: 0.14, yb: 0.16, yt: 0.3, n: 2.1 },
        { x: -0.22, w: 0.05, yb: 0.17, yt: 0.2, n: 2 },
      ], { mat: 'glass' });
      const frame = k.add(new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.01, 8, 40), k.mats.chrome));
      frame.rotation.x = Math.PI / 2;
      frame.scale.set(1.65, 1, 1);
      frame.position.set(0.04, 0.165, 0);
      k.plate([[0, 0], [0.22, 0], [0.0, 0.11], [-0.08, 0.11]], 0.014, [-0.4, 0.2, 0], 'accent', { bevel: 0.004 });
      k.sphere(0.03, [0.79, 0.068, 0], 'chrome', { scale: [1.5, 1, 1] });
      for (const y of [-0.005, 0.02]) k.rod([0.72, y, -0.12], [0.72, y, 0.12], 0.007, 'chrome');
      k.nozzle([-0.68, 0.07, 0], 0.085, { len: 0.12 });
    },
  },

  // ------------------------------------------------------------------ 7. Blitz (long)
  blitz: {
    name: 'Blitz',
    hitbox: 'long',
    blurb: 'Muscle coupe with a long hood, a supercharger and fat rear tires.',
    span: [-0.62, 0.8, 0.36],
    livery: 'twin',
    baseShade: 0.8,
    wheels: { front: { r: 0.14, w: 0.13, z: 0.335 }, back: { r: 0.165, w: 0.21, z: 0.35 }, rim: 'star', rimMat: 'chrome', sidewall: 0.38 },
    build(k) {
      k.shell([
        { x: 0.785, w: 0.25, yb: -0.03, yt: 0.09, n: 6 },
        { x: 0.72, w: 0.27, yb: -0.05, yt: 0.13, n: 6, tb: 0.05 },
        { x: 0.45, w: 0.27, yb: -0.055, yt: 0.155, n: 6, tb: 0.08 },
        { x: 0.15, w: 0.27, yb: -0.055, yt: 0.165, n: 6, tb: 0.1 },
        { x: -0.2, w: 0.27, yb: -0.055, yt: 0.165, n: 6, tb: 0.1 },
        { x: -0.5, w: 0.27, yb: -0.05, yt: 0.165, n: 6, tb: 0.1 },
        { x: -0.605, w: 0.25, yb: -0.03, yt: 0.15, n: 5 },
      ], { twoTone: { y: -0.035, dark: 0.12 } });
      k.sym((s) => {
        k.shell(L([
          { x: 0.775, w: 0.05, yb: -0.03, yt: 0.09, n: 5, zc: 0.31 },
          { x: 0.7, w: 0.08, yb: -0.04, yt: 0.135, n: 6, zc: 0.33 },
          { x: 0.503, w: 0.085, yb: -0.03, yt: 0.155, n: 7, zc: 0.335 },
          { x: 0.3, w: 0.08, yb: -0.045, yt: 0.15, n: 6, zc: 0.33 },
          { x: 0.18, w: 0.05, yb: -0.05, yt: 0.12, n: 5, zc: 0.31 },
        ], s), { twoTone: { y: -0.035, dark: 0.12 } });
        k.shell(L([
          { x: -0.05, w: 0.05, yb: -0.05, yt: 0.12, n: 5, zc: 0.31 },
          { x: -0.18, w: 0.09, yb: -0.04, yt: 0.165, n: 6, zc: 0.34 },
          { x: -0.3475, w: 0.11, yb: -0.01, yt: 0.18, n: 7, zc: 0.355 },
          { x: -0.52, w: 0.095, yb: -0.03, yt: 0.165, n: 6, zc: 0.345 },
          { x: -0.6, w: 0.05, yb: -0.02, yt: 0.13, n: 5, zc: 0.32 },
        ], s), { twoTone: { y: -0.035, dark: 0.12 } });
        k.shell(L([
          { x: 0.22, w: 0.03, yb: -0.055, yt: 0.03, n: 5, zc: 0.29 },
          { x: 0.15, w: 0.045, yb: -0.06, yt: 0.05, n: 6, zc: 0.3 },
          { x: -0.02, w: 0.045, yb: -0.06, yt: 0.05, n: 6, zc: 0.3 },
          { x: -0.09, w: 0.03, yb: -0.055, yt: 0.05, n: 5, zc: 0.29 },
        ], s), { twoTone: { y: -0.035, dark: 0.12 } });
        k.cyl(0.018, 0.018, 0.42, [0.06, -0.04, s * 0.345], 'chrome', { axis: 'x' });
        k.cyl(0.022, 0.022, 0.02, [0.79, 0.045, s * 0.19], 'head', { axis: 'x' });
        k.cyl(0.022, 0.022, 0.02, [0.79, 0.045, s * 0.245], 'head', { axis: 'x' });
        k.cyl(0.022, 0.022, 0.02, [-0.61, 0.11, s * 0.13], 'tail', { axis: 'x' });
        k.cyl(0.022, 0.022, 0.02, [-0.61, 0.11, s * 0.2], 'tail', { axis: 'x' });
        k.rbox([0.035, 0.03, 0.05], [0.13, 0.215, s * 0.27], 'paintPlain', { r: 0.008 });
        k.nozzle([-0.62, 0.015, s * 0.13], 0.045);
      });
      k.shell([
        { x: 0.13, w: 0.23, yb: 0.155, yt: 0.165, n: 4, tb: 0.35 },
        { x: -0.01, w: 0.25, yb: 0.155, yt: 0.3, n: 4.5, tb: 0.35 },
        { x: -0.18, w: 0.25, yb: 0.155, yt: 0.31, n: 4.5, tb: 0.35 },
        { x: -0.45, w: 0.24, yb: 0.155, yt: 0.2, n: 4, tb: 0.3 },
        { x: -0.56, w: 0.22, yb: 0.155, yt: 0.166, n: 4 },
      ], { mat: 'glass' });
      k.shell([
        { x: 0.0, w: 0.15, yb: 0.292, yt: 0.302, n: 4 },
        { x: -0.04, w: 0.17, yb: 0.293, yt: 0.316, n: 5 },
        { x: -0.2, w: 0.17, yb: 0.293, yt: 0.32, n: 5 },
        { x: -0.27, w: 0.15, yb: 0.27, yt: 0.29, n: 4 },
      ]);
      // Supercharger through the hood, grille, splitter, ducktail.
      k.rbox([0.13, 0.06, 0.13], [0.42, 0.19, 0], 'chrome', { r: 0.012 });
      k.rbox([0.11, 0.05, 0.14], [0.43, 0.245, 0], 'black', { r: 0.012 });
      k.rbox([0.012, 0.03, 0.12], [0.49, 0.25, 0], 'chrome', { r: 0.004 });
      k.rbox([0.012, 0.07, 0.42], [0.787, 0.035, 0], 'black', { r: 0.004 });
      k.rbox([0.014, 0.012, 0.42], [0.79, 0.035, 0], 'accent', { r: 0.003 });
      k.rbox([0.06, 0.012, 0.56], [0.79, -0.045, 0], 'black', { r: 0.004 });
      k.rbox([0.07, 0.025, 0.5], [-0.585, 0.17, 0], 'paintPlain', { r: 0.008, rot: [0, 0, 0.35] });
    },
  },

  // ------------------------------------------------------------------ 8. Rhino (tall)
  rhino: {
    name: 'Rhino',
    hitbox: 'tall',
    blurb: 'Armored brawler with a ram plate and a horn. Built for bumps.',
    span: [-0.58, 0.85, 0.4],
    livery: 'hazard',
    baseShade: 0.75,
    wheels: { front: { r: 0.18, w: 0.16, z: 0.38 }, back: { r: 0.18, w: 0.16, z: 0.38 }, rim: 'beadlock', rimMat: 'darkMetal', tire: 'offroad', sidewall: 0.4 },
    build(k) {
      const flat = k.mats.paint.clone();
      flat.flatShading = true;
      const flatPlain = k.mats.paintPlain.clone();
      flatPlain.flatShading = true;
      k.disposables.push(flat, flatPlain);
      k.shell([
        { x: 0.77, w: 0.2, yb: 0.04, yt: 0.16, n: 2 },
        { x: 0.64, w: 0.34, yb: 0.0, yt: 0.26, n: 2 },
        { x: 0.35, w: 0.38, yb: -0.01, yt: 0.32, n: 2 },
        { x: -0.15, w: 0.38, yb: -0.01, yt: 0.34, n: 2 },
        { x: -0.45, w: 0.36, yb: 0.0, yt: 0.33, n: 2 },
        { x: -0.545, w: 0.28, yb: 0.04, yt: 0.27, n: 2 },
      ], { mat: flat, ring: 8, steps: 1 });
      k.shell([
        { x: 0.25, w: 0.22, yb: 0.28, yt: 0.36, n: 2 },
        { x: 0.15, w: 0.27, yb: 0.28, yt: 0.45, n: 2 },
        { x: -0.25, w: 0.27, yb: 0.28, yt: 0.46, n: 2 },
        { x: -0.33, w: 0.22, yb: 0.28, yt: 0.4, n: 2 },
      ], { mat: flat, ring: 6, steps: 1 });
      k.rbox([0.01, 0.03, 0.3], [0.21, 0.405, 0], 'glass', { r: 0.004, rot: [0, 0, 0.6] });
      k.cyl(0.0, 0.055, 0.17, [0.85, 0.15, 0], 'chrome', { axis: 'x', seg: 12 });
      k.rbox([0.035, 0.22, 0.52], [0.77, 0.1, 0], 'darkMetal', { r: 0.01, rot: [0, 0, -0.4] });
      k.sym((s) => {
        k.rbox([0.24, 0.025, 0.006], [-0.05, 0.41, s * 0.272], 'glass', { r: 0.003 });
        k.rbox([0.38, 0.02, 0.13], [0.5125, 0.19, s * 0.405], flatPlain, { r: 0.006, rot: [s * 0.55, 0, 0] });
        k.rbox([0.38, 0.02, 0.13], [-0.3375, 0.19, s * 0.405], flatPlain, { r: 0.006, rot: [s * 0.55, 0, 0] });
        k.rbox([0.012, 0.025, 0.06], [0.655, 0.2, s * 0.22], 'head', { r: 0.004 });
        for (const z of [0.18, 0.26]) k.rod([0.68, 0.17, s * z], [0.68, 0.24, s * z], 0.005, 'darkMetal');
        k.rbox([0.04, 0.02, 0.04], [-0.05, 0.47, s * 0.1], 'amber', { r: 0.005 });
        k.rbox([0.01, 0.05, 0.05], [-0.55, 0.28, s * 0.22], 'tail', { r: 0.003 });
        for (let i = 0; i < 6; i++) k.sphere(0.008, [0.5 - i * 0.18, 0.12, s * 0.383], 'darkMetal', { seg: 6 });
        k.nozzle([-0.56, 0.1, s * 0.12], 0.04);
        k.nozzle([-0.56, 0.2, s * 0.12], 0.04);
      });
      k.rod([-0.3, 0.45, 0.2], [-0.36, 0.62, 0.22], 0.004, 'black');
      k.sphere(0.01, [-0.36, 0.62, 0.22], 'glow', { seg: 8 });
    },
  },

  // ------------------------------------------------------------------ 9. Scorpion (standard)
  scorpion: {
    name: 'Scorpion',
    hitbox: 'standard',
    blurb: 'Dune buggy with a roll cage, an open engine and a stinger tail.',
    span: [-0.55, 0.85, 0.25],
    livery: 'twin',
    wheels: { front: { r: 0.145, w: 0.13, z: 0.4 }, back: { r: 0.19, w: 0.2, z: 0.41 }, rim: 'beadlock', rimMat: 'rimSilver', tire: 'offroad', sidewall: 0.45, arms: true, armFrom: { front: 0.15, back: 0.17 }, armMat: 'accent' },
    build(k) {
      k.shell([
        { x: 0.84, w: 0.04, yb: 0.02, yt: 0.05, n: 2.5 },
        { x: 0.74, w: 0.12, yb: -0.02, yt: 0.09, n: 3 },
        { x: 0.55, w: 0.17, yb: -0.05, yt: 0.11, n: 4 },
        { x: 0.2, w: 0.2, yb: -0.06, yt: 0.12, n: 5, tb: 0.1 },
        { x: -0.2, w: 0.21, yb: -0.06, yt: 0.12, n: 5, tb: 0.1 },
        { x: -0.45, w: 0.18, yb: -0.04, yt: 0.1, n: 4 },
        { x: -0.5, w: 0.15, yb: -0.02, yt: 0.08, n: 3 },
      ], { twoTone: { y: 0.0, dark: 0.15 } });
      // Roll cage in the accent color.
      k.tube([[-0.12, 0.1, -0.2], [-0.1, 0.38, -0.17], [-0.1, 0.43, 0], [-0.1, 0.38, 0.17], [-0.12, 0.1, 0.2]], 0.016, 'accent');
      k.tube([[0.25, 0.1, -0.2], [0.2, 0.3, -0.16], [0.18, 0.335, 0], [0.2, 0.3, 0.16], [0.25, 0.1, 0.2]], 0.014, 'accent');
      k.tube([[0.84, 0.0, -0.17], [0.89, 0.06, 0], [0.84, 0.0, 0.17]], 0.014, 'accent');
      k.sym((s) => {
        k.rod([0.19, 0.32, s * 0.12], [-0.1, 0.415, s * 0.12], 0.012, 'accent');
        k.rod([0.25, 0.1, s * 0.2], [-0.12, 0.1, s * 0.2], 0.012, 'accent');
        k.rod([-0.1, 0.38, s * 0.15], [-0.5, 0.15, s * 0.15], 0.012, 'accent');
        k.rod([0.25, 0.1, s * 0.2], [0.84, 0.0, s * 0.17], 0.011, 'accent');
        k.cyl(0.03, 0.03, 0.04, [0.215, 0.315, s * 0.1], 'black', { axis: 'x' });
        k.cyl(0.024, 0.024, 0.01, [0.238, 0.315, s * 0.1], 'head', { axis: 'x' });
        k.arch(0.5125, -0.027, s * 0.4, 0.168, 0.14, 'paintPlain', { thick: 0.012, from: 0.35, to: 2.6 });
        k.nozzle([-0.53, 0.16, s * 0.1], 0.04);
      });
      // Driver.
      k.rbox([0.12, 0.17, 0.2], [-0.01, 0.17, 0], 'black', { r: 0.02, rot: [0, 0, 0.25] });
      k.rbox([0.14, 0.1, 0.18], [0.05, 0.17, 0], 'plastic', { r: 0.03 });
      k.sphere(0.068, [0.03, 0.29, 0], 'accent');
      k.sphere(0.069, [0.055, 0.29, 0], 'glass', { scale: [0.7, 0.45, 0.85] });
      // Engine with intake stacks and air filter.
      k.rbox([0.18, 0.12, 0.2], [-0.33, 0.14, 0], 'darkMetal', { r: 0.015 });
      for (const [dx, dz] of [[-0.05, -0.05], [-0.05, 0.05], [0.05, -0.05], [0.05, 0.05]]) k.cyl(0.018, 0.022, 0.07, [-0.33 + dx, 0.23, dz], 'chrome');
      k.cyl(0.05, 0.05, 0.07, [-0.42, 0.22, 0], 'accent', { axis: 'z' });
      // Stinger tail and its wing.
      k.tube([[-0.48, 0.12, 0], [-0.6, 0.3, 0], [-0.52, 0.47, 0], [-0.33, 0.5, 0]], 0.022, 'paintPlain', { tension: 0.5 });
      k.wing(0.12, 0.02, 0.42, [-0.3, 0.5, 0], 'carbon', { rotZ: 0.2 });
      k.cyl(0.0, 0.026, 0.08, [-0.24, 0.475, 0], 'chrome', { axis: 'x', rot: [0, 0, -0.6] });
    },
  },

  // ------------------------------------------------------------------ 10. Bento (hybrid)
  bento: {
    name: 'Bento',
    hitbox: 'hybrid',
    blurb: 'Boxy micro van. Tall, cheerful and surprisingly quick.',
    span: [-0.55, 0.8, 0.35],
    livery: 'roof',
    wheels: { front: { r: 0.14, w: 0.13, z: 0.34 }, back: { r: 0.14, w: 0.13, z: 0.34 }, rim: 'disc', rimMat: 'rimWhite', sidewall: 0.38 },
    build(k) {
      k.shell([
        { x: 0.8, w: 0.28, yb: 0.0, yt: 0.1, n: 5 },
        { x: 0.76, w: 0.33, yb: 0.0, yt: 0.19, n: 6, tb: 0.05 },
        { x: 0.66, w: 0.345, yb: 0.0, yt: 0.29, n: 7, tb: 0.08 },
        { x: 0.5, w: 0.35, yb: 0.0, yt: 0.42, n: 8, tb: 0.1 },
        { x: 0.3, w: 0.35, yb: 0.0, yt: 0.45, n: 8, tb: 0.1 },
        { x: -0.45, w: 0.35, yb: 0.0, yt: 0.45, n: 8, tb: 0.1 },
        { x: -0.52, w: 0.34, yb: 0.01, yt: 0.43, n: 7, tb: 0.08 },
        { x: -0.545, w: 0.3, yb: 0.03, yt: 0.4, n: 6 },
      ], { ring: 48 });
      // Windows.
      k.rbox([0.2, 0.01, 0.6], [0.582, 0.358, 0], 'glass', { r: 0.004, rot: [0, 0, -0.68] });
      k.rbox([0.008, 0.12, 0.5], [-0.548, 0.33, 0], 'glass', { r: 0.004 });
      k.sym((s) => {
        k.rbox([0.32, 0.13, 0.008], [0.28, 0.34, s * 0.344], 'glass', { r: 0.01 });
        k.rbox([0.42, 0.13, 0.008], [-0.18, 0.34, s * 0.344], 'glass', { r: 0.01 });
        k.box([0.9, 0.024, 0.006], [0.1, 0.19, s * 0.348], 'accent');
        for (const x of [0.5125, -0.34]) {
          k.archShadow(x, -0.031, s * 0.351, 0.162, s);
          k.arch(x, -0.031, s * 0.345, 0.158, 0.05, 'paintPlain', { thick: 0.013, from: 0, to: Math.PI });
        }
        k.rbox([0.62, 0.07, 0.03], [0.087, -0.01, s * 0.335], 'plastic', { r: 0.01 });
        k.cyl(0.042, 0.042, 0.015, [0.795, 0.15, s * 0.22], 'chrome', { axis: 'x' });
        k.cyl(0.034, 0.034, 0.015, [0.802, 0.15, s * 0.22], 'head', { axis: 'x' });
        k.rbox([0.01, 0.02, 0.045], [0.8, 0.085, s * 0.27], 'amber', { r: 0.004 });
        k.rbox([0.012, 0.14, 0.035], [-0.548, 0.24, s * 0.3], 'tail', { r: 0.004 });
        k.rbox([0.02, 0.06, 0.05], [0.6, 0.3, s * 0.38], 'black', { r: 0.008 });
        k.rod([0.35, 0.47, s * 0.25], [-0.4, 0.47, s * 0.25], 0.01, 'black');
        k.rod([0.3, 0.45, s * 0.25], [0.3, 0.47, s * 0.25], 0.008, 'black');
        k.rod([-0.35, 0.45, s * 0.25], [-0.35, 0.47, s * 0.25], 0.008, 'black');
        k.nozzle([-0.56, 0.06, s * 0.15], 0.045);
      });
      for (const x of [0.3, -0.05, -0.35]) k.rod([x, 0.47, -0.25], [x, 0.47, 0.25], 0.008, 'black');
      k.rbox([0.06, 0.08, 0.62], [0.79, 0.0, 0], 'plastic', { r: 0.02 });
      k.rbox([0.05, 0.08, 0.62], [-0.55, 0.0, 0], 'plastic', { r: 0.02 });
      k.rbox([0.01, 0.05, 0.22], [0.805, 0.12, 0], 'black', { r: 0.004 });
      k.cyl(0.022, 0.022, 0.01, [0.812, 0.12, 0], 'accent', { axis: 'x' });
    },
  },

  // ------------------------------------------------------------------ Sport Drop cars
  // 11. Falcon (standard): fastback GT coupe.
  falcon: {
    name: 'Falcon',
    hitbox: 'standard',
    blurb: 'Fastback GT coupe with a long glass roof and a ducktail.',
    span: [-0.6, 0.8, 0.38],
    livery: 'twin',
    wheels: { front: { r: 0.145, w: 0.14, z: 0.37 }, back: { r: 0.16, w: 0.17, z: 0.375 }, rim: 'turbine', rimMat: 'rimSilver', sidewall: 0.32 },
    build(k) {
      k.shell([
        { x: 0.79, w: 0.16, yb: -0.07, yt: -0.025, n: 3 },
        { x: 0.73, w: 0.28, yb: -0.085, yt: 0.035, n: 4, tb: 0.2 },
        { x: 0.56, w: 0.34, yb: -0.09, yt: 0.08, n: 5, tb: 0.3 },
        { x: 0.3, w: 0.35, yb: -0.09, yt: 0.1, n: 5, tb: 0.35 },
        { x: 0.0, w: 0.35, yb: -0.09, yt: 0.11, n: 5, tb: 0.35 },
        { x: -0.3, w: 0.35, yb: -0.085, yt: 0.12, n: 5, tb: 0.35 },
        { x: -0.5, w: 0.33, yb: -0.07, yt: 0.12, n: 4.5, tb: 0.3 },
        { x: -0.585, w: 0.28, yb: -0.04, yt: 0.11, n: 4 },
      ], { ring: 48, twoTone: { y: -0.05, dark: 0.12 } });
      k.shell([
        { x: 0.34, w: 0.18, yb: 0.08, yt: 0.095, n: 3, tb: 0.5 },
        { x: 0.2, w: 0.26, yb: 0.08, yt: 0.21, n: 3.5, tb: 0.55 },
        { x: 0.0, w: 0.27, yb: 0.09, yt: 0.25, n: 3.6, tb: 0.55 },
        { x: -0.22, w: 0.26, yb: 0.1, yt: 0.22, n: 3.5, tb: 0.55 },
        { x: -0.46, w: 0.22, yb: 0.11, yt: 0.14, n: 3, tb: 0.5 },
      ], { mat: 'glass', ring: 40 });
      k.rbox([0.46, 0.014, 0.12], [-0.03, 0.252, 0], 'paintPlain', { r: 0.006, rot: [0, 0, -0.06] });
      k.wing(0.13, 0.022, 0.6, [-0.55, 0.13, 0], 'paintPlain', { rotZ: -0.2 });
      k.rbox([0.02, 0.05, 0.34], [0.785, -0.045, 0], 'black', { r: 0.01 });
      k.box([0.1, 0.04, 0.5], [-0.56, -0.075, 0], 'carbon', [0, 0, -0.25]);
      k.sym((s) => {
        k.box([0.012, 0.018, 0.14], [0.77, 0.0, s * 0.2], 'head', [0, s * 0.45, 0]);
        k.box([0.012, 0.026, 0.22], [-0.588, 0.07, s * 0.16], 'tail', [0, -s * 0.2, 0]);
        k.box([0.14, 0.05, 0.01], [-0.18, 0.0, s * 0.352], 'black');
        k.box([0.6, 0.008, 0.006], [0.05, -0.04, s * 0.352], 'glow');
        k.rbox([0.05, 0.03, 0.04], [0.22, 0.13, s * 0.29], 'paintPlain', { r: 0.01 });
        k.box([0.12, 0.006, 0.03], [0.5, 0.078, s * 0.1], 'black', [0, 0, 0.12]);
        k.nozzle([-0.6, 0.0, s * 0.15], 0.05);
      });
    },
  },

  // 12. Jolt (hybrid): dune buggy.
  jolt: {
    name: 'Jolt',
    hitbox: 'hybrid',
    blurb: 'Dune buggy with a roll cage, an open seat and a big rear engine.',
    span: [-0.56, 0.8, 0.3],
    livery: 'single',
    wheels: { front: { r: 0.16, w: 0.15, z: 0.38 }, back: { r: 0.18, w: 0.2, z: 0.4 }, rim: 'beadlock', rimMat: 'rimGold', tire: 'offroad', sidewall: 0.45, arms: true, armFrom: { front: 0.12, back: 0.16 } },
    build(k) {
      k.shell([
        { x: 0.78, w: 0.1, yb: -0.02, yt: 0.05, n: 3 },
        { x: 0.66, w: 0.2, yb: -0.05, yt: 0.1, n: 4, tb: 0.2 },
        { x: 0.4, w: 0.25, yb: -0.07, yt: 0.13, n: 4.5, tb: 0.25 },
        { x: 0.1, w: 0.26, yb: -0.07, yt: 0.12, n: 4.5, tb: 0.25 },
        { x: -0.2, w: 0.25, yb: -0.06, yt: 0.12, n: 4.5, tb: 0.25 },
        { x: -0.45, w: 0.21, yb: -0.03, yt: 0.14, n: 4, tb: 0.2 },
        { x: -0.53, w: 0.15, yb: 0.0, yt: 0.12, n: 3 },
      ], { ring: 44, twoTone: { y: -0.02, dark: 0.1 } });
      k.rbox([0.16, 0.04, 0.2], [0.0, 0.14, 0], 'black', { r: 0.015 });
      k.rbox([0.04, 0.18, 0.2], [-0.09, 0.22, 0], 'black', { r: 0.015, rot: [0, 0, 0.15] });
      const sw = k.add(new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 8, 20), k.mats.black));
      sw.rotation.set(0, Math.PI / 2, 0);
      sw.rotation.z = 0.5;
      sw.position.set(0.17, 0.22, 0);
      k.sym((s) => {
        k.tube([[0.34, 0.12, s * 0.23], [0.21, 0.38, s * 0.2], [-0.12, 0.4, s * 0.2], [-0.33, 0.14, s * 0.23]], 0.016, 'chrome');
        k.cyl(0.03, 0.03, 0.045, [0.215, 0.41, s * 0.1], 'black', { axis: 'x' });
        k.cyl(0.024, 0.024, 0.01, [0.24, 0.41, s * 0.1], 'head', { axis: 'x' });
        k.nozzle([-0.56, 0.1, s * 0.1], 0.05);
        k.box([0.012, 0.03, 0.05], [-0.535, 0.12, s * 0.17], 'tail');
        k.cyl(0.03, 0.03, 0.08, [-0.33, 0.3, s * 0.06], 'chrome');
      });
      k.rod([0.21, 0.38, -0.2], [0.21, 0.38, 0.2], 0.016, 'chrome');
      k.rod([-0.12, 0.4, -0.2], [-0.12, 0.4, 0.2], 0.016, 'chrome');
      k.rod([0.21, 0.38, -0.2], [-0.12, 0.4, 0.2], 0.012, 'chrome');
      k.rbox([0.2, 0.12, 0.24], [-0.38, 0.2, 0], 'darkMetal', { r: 0.02 });
      for (let i = 0; i < 4; i++) k.box([0.16, 0.008, 0.25], [-0.38, 0.268 + i * 0.016, 0], 'darkMetal');
      k.tube([[0.79, 0.0, -0.17], [0.84, 0.04, 0], [0.79, 0.0, 0.17]], 0.014, 'black');
      k.box([0.012, 0.012, 0.18], [0.79, 0.07, 0], 'glow');
    },
  },

  // 13. Brick (tall): box truck.
  brick: {
    name: 'Brick',
    hitbox: 'tall',
    blurb: 'Square-nosed delivery truck with a roof rack. A wall on wheels.',
    span: [-0.56, 0.8, 0.37],
    livery: 'hazard',
    baseShade: 0.8,
    wheels: { front: { r: 0.19, w: 0.17, z: 0.38 }, back: { r: 0.19, w: 0.17, z: 0.38 }, rim: 'disc', rimMat: 'rimSilver', sidewall: 0.42 },
    build(k) {
      k.shell([
        { x: 0.79, w: 0.32, yb: 0.03, yt: 0.2, n: 9 },
        { x: 0.775, w: 0.345, yb: 0.02, yt: 0.36, n: 10, tb: 0.03 },
        { x: 0.6, w: 0.355, yb: 0.02, yt: 0.5, n: 12, tb: 0.04 },
        { x: -0.5, w: 0.355, yb: 0.02, yt: 0.5, n: 12, tb: 0.04 },
        { x: -0.55, w: 0.345, yb: 0.03, yt: 0.48, n: 10 },
      ], { ring: 48, twoTone: { y: 0.08, dark: 0.14 } });
      k.rbox([0.012, 0.2, 0.56], [0.692, 0.435, 0], 'glass', { r: 0.006, rot: [0, 0, 0.88] });
      k.rbox([0.012, 0.08, 0.3], [0.797, 0.14, 0], 'black', { r: 0.01 });
      k.rbox([0.06, 0.06, 0.74], [0.79, 0.04, 0], 'darkMetal', { r: 0.015 });
      k.rbox([0.05, 0.06, 0.72], [-0.555, 0.05, 0], 'darkMetal', { r: 0.015 });
      k.box([0.006, 0.36, 0.006], [-0.553, 0.28, 0], 'black');
      k.sym((s) => {
        k.rbox([0.2, 0.12, 0.008], [0.5, 0.4, s * 0.358], 'glass', { r: 0.01 });
        k.box([1.16, 0.03, 0.006], [0.1, 0.22, s * 0.359], 'accent');
        k.rbox([0.03, 0.07, 0.04], [0.66, 0.37, s * 0.39], 'black', { r: 0.008 });
        k.rbox([0.012, 0.06, 0.09], [0.796, 0.15, s * 0.25], 'head', { r: 0.008 });
        k.rbox([0.012, 0.12, 0.04], [-0.556, 0.22, s * 0.3], 'tail', { r: 0.006 });
        k.rbox([0.012, 0.02, 0.04], [0.796, 0.08, s * 0.31], 'amber', { r: 0.004 });
        k.nozzle([-0.58, 0.13, s * 0.12], 0.055);
        k.rod([0.45, 0.535, s * 0.29], [-0.45, 0.535, s * 0.29], 0.01, 'black');
        k.rod([0.4, 0.5, s * 0.29], [0.4, 0.535, s * 0.29], 0.008, 'black');
        k.rod([-0.4, 0.5, s * 0.29], [-0.4, 0.535, s * 0.29], 0.008, 'black');
      });
      for (const x of [-0.35, -0.1, 0.15, 0.4]) k.rod([x, 0.535, -0.29], [x, 0.535, 0.29], 0.008, 'black');
      k.rbox([0.04, 0.035, 0.5], [0.52, 0.555, 0], 'black', { r: 0.008 });
      for (let i = 0; i < 5; i++) k.rbox([0.006, 0.02, 0.07], [0.543, 0.555, -0.18 + i * 0.09], 'head', { r: 0.003 });
    },
  },

  // 14. Stingray (flat): low hypercar with side pontoons and a tail fin.
  stingray: {
    name: 'Stingray',
    hitbox: 'flat',
    blurb: 'Flat hypercar with side pontoons, a jet canopy and a tall tail fin.',
    span: [-0.62, 0.8, 0.44],
    livery: 'twin',
    wheels: { front: { r: 0.13, w: 0.13, z: 0.33 }, back: { r: 0.17, w: 0.2, z: 0.3 }, rim: 'star', rimMat: 'rimBlack', sidewall: 0.3 },
    build(k) {
      k.shell([
        { x: 0.8, w: 0.05, yb: -0.02, yt: 0.0, n: 2.4 },
        { x: 0.66, w: 0.14, yb: -0.03, yt: 0.04, n: 3, tb: 0.3 },
        { x: 0.4, w: 0.2, yb: -0.04, yt: 0.09, n: 3.4, tb: 0.4 },
        { x: 0.1, w: 0.22, yb: -0.04, yt: 0.11, n: 3.6, tb: 0.45 },
        { x: -0.25, w: 0.22, yb: -0.03, yt: 0.11, n: 3.6, tb: 0.45 },
        { x: -0.5, w: 0.18, yb: -0.01, yt: 0.09, n: 3.2, tb: 0.4 },
        { x: -0.61, w: 0.1, yb: 0.01, yt: 0.06, n: 2.6 },
      ], { ring: 48, steps: 7 });
      k.sym((s) => {
        k.shell(L([
          { x: 0.6, w: 0.03, yb: -0.01, yt: 0.01, n: 2.4, zc: 0.3 },
          { x: 0.45, w: 0.1, yb: -0.03, yt: 0.05, n: 3, zc: 0.36, tb: 0.4 },
          { x: 0.1, w: 0.12, yb: -0.03, yt: 0.06, n: 3.4, zc: 0.38, tb: 0.5 },
          { x: -0.3, w: 0.12, yb: -0.02, yt: 0.07, n: 3.4, zc: 0.37, tb: 0.5 },
          { x: -0.58, w: 0.06, yb: 0.0, yt: 0.05, n: 2.8, zc: 0.33 },
        ], s), { ring: 36 });
        k.box([0.7, 0.008, 0.008], [-0.05, 0.065, s * 0.43], 'glow');
        k.box([0.014, 0.01, 0.12], [0.6, 0.02, s * 0.33], 'head', [0, s * 0.6, 0]);
        k.box([0.012, 0.02, 0.1], [-0.585, 0.04, s * 0.33], 'tail');
        k.nozzle([-0.62, 0.03, s * 0.06], 0.045);
      });
      k.shell([
        { x: 0.4, w: 0.04, yb: 0.07, yt: 0.09, n: 2.2 },
        { x: 0.25, w: 0.1, yb: 0.08, yt: 0.18, n: 2.4, tb: 0.5 },
        { x: 0.02, w: 0.12, yb: 0.09, yt: 0.22, n: 2.5, tb: 0.5 },
        { x: -0.2, w: 0.09, yb: 0.1, yt: 0.17, n: 2.4, tb: 0.5 },
        { x: -0.32, w: 0.04, yb: 0.1, yt: 0.11, n: 2.2 },
      ], { mat: 'glass' });
      k.plate([[-0.25, 0], [-0.4, 0.2], [-0.56, 0.24], [-0.6, 0.22], [-0.6, 0]], 0.02, [0, 0.08, 0], 'paintPlain', { bevel: 0.005 });
      k.box([0.3, 0.01, 0.022], [-0.46, 0.27, 0], 'glow', [0, 0, 0.25]);
      k.wing(0.12, 0.018, 0.76, [0.74, -0.015, 0], 'carbon', { rotZ: 0.05 });
    },
  },

  // 15. Tempest (long): muscle car with a blower on the hood.
  tempest: {
    name: 'Tempest',
    hitbox: 'long',
    blurb: 'Long-hood muscle car with a supercharger poking out of the hood.',
    span: [-0.66, 0.8, 0.36],
    livery: 'single',
    baseShade: 0.82,
    wheels: { front: { r: 0.14, w: 0.13, z: 0.335 }, back: { r: 0.16, w: 0.2, z: 0.35 }, rim: 'mesh', rimMat: 'chrome', sidewall: 0.36 },
    build(k) {
      k.shell([
        { x: 0.8, w: 0.3, yb: -0.06, yt: 0.06, n: 8 },
        { x: 0.7, w: 0.33, yb: -0.07, yt: 0.09, n: 8, tb: 0.06 },
        { x: 0.3, w: 0.34, yb: -0.075, yt: 0.1, n: 8, tb: 0.08 },
        { x: -0.1, w: 0.34, yb: -0.075, yt: 0.1, n: 8, tb: 0.08 },
        { x: -0.55, w: 0.34, yb: -0.07, yt: 0.11, n: 8, tb: 0.06 },
        { x: -0.65, w: 0.32, yb: -0.05, yt: 0.1, n: 7 },
      ], { ring: 48, twoTone: { y: -0.04, dark: 0.12 } });
      k.shell([
        { x: 0.02, w: 0.26, yb: 0.09, yt: 0.1, n: 5, tb: 0.3 },
        { x: -0.1, w: 0.28, yb: 0.09, yt: 0.22, n: 5.5, tb: 0.35 },
        { x: -0.32, w: 0.28, yb: 0.09, yt: 0.22, n: 5.5, tb: 0.35 },
        { x: -0.48, w: 0.26, yb: 0.09, yt: 0.12, n: 5, tb: 0.3 },
      ], { mat: 'glass' });
      k.rbox([0.26, 0.014, 0.42], [-0.21, 0.222, 0], 'paintPlain', { r: 0.006 });
      // Supercharger with intake scoop.
      k.rbox([0.16, 0.06, 0.16], [0.4, 0.13, 0], 'chrome', { r: 0.015 });
      k.rbox([0.12, 0.05, 0.12], [0.4, 0.185, 0], 'black', { r: 0.012 });
      for (let i = 0; i < 4; i++) k.cyl(0.018, 0.018, 0.04, [0.36 + (i % 2) * 0.08, 0.225, i < 2 ? -0.03 : 0.03], 'chrome', { open: true });
      k.rbox([0.02, 0.07, 0.6], [0.8, -0.015, 0], 'black', { r: 0.01 });
      k.rbox([0.03, 0.025, 0.66], [0.81, -0.06, 0], 'chrome', { r: 0.01 });
      k.rbox([0.03, 0.025, 0.66], [-0.655, -0.05, 0], 'chrome', { r: 0.01 });
      k.wing(0.08, 0.015, 0.62, [-0.6, 0.13, 0], 'paintPlain', { rotZ: -0.3 });
      k.sym((s) => {
        k.cyl(0.03, 0.03, 0.012, [0.81, 0.0, s * 0.24], 'head', { axis: 'x' });
        k.cyl(0.025, 0.025, 0.012, [0.81, 0.0, s * 0.17], 'head', { axis: 'x' });
        k.rbox([0.012, 0.03, 0.18], [-0.66, 0.04, s * 0.2], 'tail', { r: 0.006 });
        k.box([0.24, 0.008, 0.006], [0.48, 0.07, s * 0.342], 'chrome');
        k.nozzle([-0.66, -0.04, s * 0.13], 0.045);
        k.cyl(0.012, 0.012, 0.2, [-0.15, -0.08, s * 0.35], 'chrome', { axis: 'x' });
      });
    },
  },

  // 16. Orbit (wedge): futuristic pod with a glass bubble and glowing rings.
  orbit: {
    name: 'Orbit',
    hitbox: 'wedge',
    blurb: 'Space-age pod with a glass bubble, glowing rings and fins.',
    span: [-0.6, 0.82, 0.4],
    livery: 'twin',
    wheels: { front: { r: 0.14, w: 0.13, z: 0.34 }, back: { r: 0.16, w: 0.18, z: 0.36 }, rim: 'disc', rimMat: 'rimWhite', sidewall: 0.3 },
    build(k) {
      k.shell([
        { x: 0.82, w: 0.06, yb: -0.04, yt: -0.02, n: 2.2 },
        { x: 0.72, w: 0.2, yb: -0.07, yt: 0.03, n: 2.4 },
        { x: 0.5, w: 0.32, yb: -0.08, yt: 0.08, n: 2.6, tb: 0.2 },
        { x: 0.2, w: 0.36, yb: -0.08, yt: 0.11, n: 2.8, tb: 0.25 },
        { x: -0.15, w: 0.36, yb: -0.075, yt: 0.12, n: 2.8, tb: 0.25 },
        { x: -0.45, w: 0.3, yb: -0.06, yt: 0.11, n: 2.6, tb: 0.2 },
        { x: -0.585, w: 0.18, yb: -0.03, yt: 0.08, n: 2.3 },
      ], { ring: 56, steps: 7 });
      k.sphere(0.2, [0.05, 0.1, 0], 'glass', { scale: [1.35, 0.85, 1], seg: 32 });
      const ring = k.add(new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.012, 8, 64), k.mats.glow));
      ring.rotation.x = Math.PI / 2;
      ring.scale.set(1.6, 1.1, 1);
      ring.position.set(0.08, 0.02, 0);
      k.sym((s) => {
        k.plate([[0, 0], [-0.12, 0.16], [-0.2, 0.17], [-0.16, 0]], 0.016, [-0.38, 0.08, s * 0.16], 'paintPlain', { rot: [s * 0.25, 0, 0] });
        k.box([0.1, 0.008, 0.01], [-0.5, 0.235, s * 0.2], 'glow', [s * 0.25, 0, -0.1]);
        k.box([0.014, 0.012, 0.1], [0.74, -0.01, s * 0.12], 'head', [0, s * 0.5, 0]);
        k.nozzle([-0.6, 0.02, s * 0.08], 0.05);
      });
      k.cyl(0.05, 0.05, 0.02, [-0.6, 0.02, 0], 'glow', { axis: 'x' });
    },
  },
  // ------------------------------------------------------------------ drop cars added later
  // 17. Boxer (standard): boxy retro sedan with square lamps and chrome bumpers.
  boxer: {
    name: 'Boxer',
    hitbox: 'standard',
    blurb: 'Boxy retro sedan with square headlamps, chrome bumpers and a light bar.',
    span: [-0.6, 0.8, 0.37],
    livery: 'single',
    baseShade: 0.85,
    wheels: { front: { r: 0.145, w: 0.14, z: 0.36 }, back: { r: 0.155, w: 0.15, z: 0.365 }, rim: 'cap', rimMat: 'chrome', sidewall: 0.36 },
    build(k) {
      k.shell([
        { x: 0.79, w: 0.31, yb: -0.06, yt: 0.07, n: 9 },
        { x: 0.75, w: 0.335, yb: -0.07, yt: 0.1, n: 9, tb: 0.04 },
        { x: 0.35, w: 0.34, yb: -0.075, yt: 0.11, n: 9, tb: 0.05 },
        { x: -0.4, w: 0.34, yb: -0.075, yt: 0.12, n: 9, tb: 0.05 },
        { x: -0.56, w: 0.335, yb: -0.065, yt: 0.12, n: 9, tb: 0.04 },
        { x: -0.59, w: 0.31, yb: -0.05, yt: 0.1, n: 8 },
      ], { ring: 48, twoTone: { y: -0.03, dark: 0.12 } });
      // Square cabin with a flat roof.
      k.shell([
        { x: 0.3, w: 0.3, yb: 0.1, yt: 0.115, n: 8, tb: 0.15 },
        { x: 0.17, w: 0.31, yb: 0.1, yt: 0.29, n: 8, tb: 0.2 },
        { x: -0.25, w: 0.31, yb: 0.1, yt: 0.3, n: 8, tb: 0.2 },
        { x: -0.36, w: 0.3, yb: 0.11, yt: 0.17, n: 8, tb: 0.15 },
      ], { mat: 'glass', ring: 40 });
      k.rbox([0.4, 0.016, 0.6], [-0.04, 0.302, 0], 'paintPlain', { r: 0.008 });
      k.rbox([0.06, 0.03, 0.4], [-0.02, 0.325, 0], 'black', { r: 0.008 });
      k.sym((s) => {
        k.rbox([0.024, 0.016, 0.07], [-0.02, 0.33, s * 0.12], 'tail', { r: 0.004 });
        k.rbox([0.024, 0.016, 0.07], [-0.02, 0.33, s * 0.05], 'glow', { r: 0.004 });
        // Square headlamps in a black grille, tall tail lamps.
        k.rbox([0.012, 0.055, 0.07], [0.797, 0.02, s * 0.235], 'head', { r: 0.006 });
        k.rbox([0.012, 0.055, 0.04], [0.797, 0.02, s * 0.15], 'head', { r: 0.006 });
        k.rbox([0.012, 0.08, 0.05], [-0.597, 0.04, s * 0.27], 'tail', { r: 0.006 });
        k.rbox([0.012, 0.03, 0.05], [-0.597, -0.03, s * 0.27], 'amber', { r: 0.004 });
        k.box([1.2, 0.012, 0.006], [0.1, 0.03, s * 0.342], 'chrome');
        k.box([0.012, 0.16, 0.006], [-0.06, 0.2, s * 0.312], 'paintPlain');
        k.rbox([0.03, 0.03, 0.05], [0.22, 0.14, s * 0.33], 'chrome', { r: 0.008 });
        k.nozzle([-0.62, -0.04, s * 0.12], 0.045);
      });
      k.rbox([0.012, 0.06, 0.2], [0.797, 0.02, 0], 'black', { r: 0.006 });
      for (const y of [0.0, 0.025, 0.05]) k.box([0.006, 0.008, 0.18], [0.803, y, 0], 'chrome');
      k.rbox([0.04, 0.035, 0.7], [0.81, -0.055, 0], 'chrome', { r: 0.012 });
      k.rbox([0.04, 0.035, 0.7], [-0.6, -0.045, 0], 'chrome', { r: 0.012 });
      k.rbox([0.014, 0.022, 0.12], [0.36, 0.125, 0], 'chrome', { r: 0.004 });
    },
  },

  // 18. Buzz (flat): racing go-kart with side pods, a bare engine and a driver in a helmet.
  buzz: {
    name: 'Buzz',
    hitbox: 'flat',
    blurb: 'Oversized racing kart. Side pods, a bare engine and nothing to hide behind.',
    span: [-0.6, 0.8, 0.44],
    livery: 'twin',
    wheels: { front: { r: 0.13, w: 0.14, z: 0.36 }, back: { r: 0.17, w: 0.22, z: 0.36 }, rim: 'star', rimMat: 'rimWhite', sidewall: 0.3, arms: true, armFrom: { front: 0.12, back: 0.16 } },
    build(k) {
      // Low tray chassis.
      k.shell([
        { x: 0.78, w: 0.12, yb: -0.04, yt: 0.0, n: 3 },
        { x: 0.66, w: 0.2, yb: -0.05, yt: 0.03, n: 3.5, tb: 0.3 },
        { x: 0.4, w: 0.18, yb: -0.05, yt: 0.04, n: 4, tb: 0.3 },
        { x: 0.0, w: 0.2, yb: -0.05, yt: 0.05, n: 4, tb: 0.3 },
        { x: -0.4, w: 0.2, yb: -0.05, yt: 0.05, n: 4, tb: 0.3 },
        { x: -0.56, w: 0.16, yb: -0.04, yt: 0.04, n: 3.5 },
      ], { ring: 44, twoTone: { y: -0.03, dark: 0.12 } });
      // Nose cone.
      k.shell([
        { x: 0.82, w: 0.2, yb: -0.03, yt: 0.03, n: 3 },
        { x: 0.74, w: 0.3, yb: -0.035, yt: 0.07, n: 3.5, tb: 0.3 },
        { x: 0.6, w: 0.24, yb: -0.03, yt: 0.09, n: 3.5, tb: 0.4 },
        { x: 0.5, w: 0.12, yb: -0.02, yt: 0.06, n: 3 },
      ], { mat: 'paintPlain', ring: 40 });
      k.sym((s) => {
        // Side pods between the wheels.
        k.shell(L([
          { x: 0.3, w: 0.04, yb: -0.04, yt: 0.03, n: 3, zc: 0.3 },
          { x: 0.18, w: 0.09, yb: -0.05, yt: 0.07, n: 4, zc: 0.32 },
          { x: -0.08, w: 0.1, yb: -0.05, yt: 0.08, n: 4, zc: 0.32 },
          { x: -0.16, w: 0.04, yb: -0.04, yt: 0.04, n: 3, zc: 0.3 },
        ], s));
        k.box([0.3, 0.008, 0.008], [0.05, 0.06, s * 0.42], 'glow');
        k.box([0.012, 0.02, 0.06], [0.82, 0.0, s * 0.12], 'head', [0, s * 0.4, 0]);
        k.rod([0.48, 0.0, s * 0.18], [0.48, 0.0, s * 0.3], 0.012, 'darkMetal');
        k.nozzle([-0.6, 0.06, s * 0.06], 0.04);
      });
      // Seat, driver with a helmet, steering wheel.
      k.rbox([0.14, 0.03, 0.16], [-0.12, 0.07, 0], 'black', { r: 0.012 });
      k.rbox([0.04, 0.14, 0.16], [-0.2, 0.13, 0], 'black', { r: 0.015, rot: [0, 0, 0.2] });
      k.rbox([0.12, 0.1, 0.13], [-0.1, 0.16, 0], 'darkMetal', { r: 0.03 });
      k.sphere(0.075, [-0.1, 0.29, 0], 'paintPlain', { seg: 24 });
      k.rbox([0.012, 0.03, 0.1], [-0.03, 0.3, 0], 'glass', { r: 0.008 });
      k.rod([0.05, 0.08, 0], [0.1, 0.17, 0], 0.01, 'black');
      const sw = k.add(new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.009, 8, 20), k.mats.black));
      sw.rotation.set(0, Math.PI / 2, 0.5);
      sw.position.set(0.04, 0.2, 0);
      // Bare engine on the back with a pipe.
      k.rbox([0.14, 0.1, 0.12], [-0.4, 0.11, 0.08], 'darkMetal', { r: 0.015 });
      for (let i = 0; i < 4; i++) k.box([0.1, 0.006, 0.13], [-0.4, 0.17 + i * 0.012, 0.08], 'nozzle');
      k.tube([[-0.38, 0.12, -0.0], [-0.46, 0.14, -0.08], [-0.58, 0.16, -0.1]], 0.018, 'chrome');
      k.wing(0.1, 0.016, 0.5, [-0.56, 0.12, 0], 'carbon', { rotZ: -0.15 });
      k.rbox([0.03, 0.012, 0.2], [-0.62, 0.06, 0], 'tail', { r: 0.004 });
    },
  },

  // 19. Lancer (long): endurance prototype with a shark fin and a wide rear wing.
  lancer: {
    name: 'Lancer',
    hitbox: 'long',
    blurb: 'Endurance prototype with a closed bubble cockpit, a shark fin and covered wheels.',
    span: [-0.66, 0.82, 0.37],
    livery: 'twin',
    wheels: { front: { r: 0.14, w: 0.13, z: 0.34 }, back: { r: 0.155, w: 0.17, z: 0.35 }, rim: 'disc', rimMat: 'rimBlack', sidewall: 0.3 },
    build(k) {
      k.shell([
        { x: 0.82, w: 0.16, yb: -0.07, yt: -0.04, n: 2.6 },
        { x: 0.74, w: 0.3, yb: -0.085, yt: 0.02, n: 3.2, tb: 0.3 },
        { x: 0.55, w: 0.33, yb: -0.09, yt: 0.07, n: 3.6, tb: 0.4 },
        { x: 0.2, w: 0.32, yb: -0.09, yt: 0.06, n: 3.6, tb: 0.5 },
        { x: -0.2, w: 0.33, yb: -0.09, yt: 0.08, n: 3.6, tb: 0.45 },
        { x: -0.5, w: 0.34, yb: -0.08, yt: 0.1, n: 4, tb: 0.35 },
        { x: -0.66, w: 0.32, yb: -0.06, yt: 0.09, n: 4 },
      ], { ring: 56, steps: 7, twoTone: { y: -0.05, dark: 0.1 } });
      // Teardrop cockpit.
      k.shell([
        { x: 0.38, w: 0.05, yb: 0.04, yt: 0.07, n: 2.2, tb: 0.5 },
        { x: 0.24, w: 0.12, yb: 0.04, yt: 0.19, n: 2.5, tb: 0.55 },
        { x: 0.04, w: 0.14, yb: 0.04, yt: 0.22, n: 2.6, tb: 0.55 },
        { x: -0.14, w: 0.11, yb: 0.04, yt: 0.18, n: 2.5, tb: 0.55 },
        { x: -0.28, w: 0.05, yb: 0.05, yt: 0.1, n: 2.2 },
      ], { mat: 'glass', ring: 40 });
      // Shark fin from the roof to the wing.
      k.plate([[0, 0], [0.04, 0.09], [-0.42, 0.15], [-0.46, 0.0]], 0.012, [-0.12, 0.13, 0], 'paintPlain', { bevel: 0.003 });
      k.box([0.36, 0.008, 0.014], [-0.36, 0.27, 0], 'glow', [0, 0, -0.12]);
      k.wing(0.14, 0.022, 0.74, [-0.6, 0.24, 0], 'carbon', { rotZ: -0.1 });
      k.box([0.012, 0.012, 0.7], [-0.672, 0.25, 0], 'tail');
      k.sym((s) => {
        // Fender humps over all four wheels.
        k.shell(L([
          { x: 0.7, w: 0.03, yb: -0.06, yt: 0.03, n: 3, zc: 0.3 },
          { x: 0.6, w: 0.07, yb: -0.06, yt: 0.13, n: 3.5, zc: 0.31 },
          { x: 0.47, w: 0.075, yb: -0.06, yt: 0.155, n: 3.6, zc: 0.31 },
          { x: 0.33, w: 0.06, yb: -0.06, yt: 0.12, n: 3.5, zc: 0.31 },
          { x: 0.24, w: 0.02, yb: -0.06, yt: 0.04, n: 3, zc: 0.3 },
        ], s));
        k.shell(L([
          { x: -0.12, w: 0.02, yb: -0.06, yt: 0.06, n: 3, zc: 0.3 },
          { x: -0.24, w: 0.07, yb: -0.06, yt: 0.15, n: 3.5, zc: 0.31 },
          { x: -0.4, w: 0.085, yb: -0.06, yt: 0.18, n: 3.6, zc: 0.32 },
          { x: -0.56, w: 0.075, yb: -0.06, yt: 0.15, n: 3.5, zc: 0.31 },
          { x: -0.66, w: 0.05, yb: -0.05, yt: 0.1, n: 3, zc: 0.3 },
        ], s));
        k.plate([[0, 0], [0.0, 0.16], [-0.1, 0.16], [-0.12, 0]], 0.012, [-0.53, 0.12, s * 0.37], 'carbon', { bevel: 0.003 });
        k.box([0.02, 0.012, 0.09], [0.7, 0.07, s * 0.27], 'head', [0, s * 0.3, -0.2]);
        k.box([0.012, 0.03, 0.04], [-0.67, 0.06, s * 0.3], 'tail');
        k.box([0.5, 0.006, 0.006], [0.1, -0.03, s * 0.33], 'glow');
        k.nozzle([-0.68, -0.02, s * 0.1], 0.045);
      });
      k.rbox([0.06, 0.012, 0.5], [0.79, -0.08, 0], 'carbon', { r: 0.004 });
      k.box([0.12, 0.04, 0.44], [-0.64, -0.07, 0], 'carbon', [0, 0, -0.25]);
    },
  },

  // ------------------------------------------------------------------ achievement cars (never in drops)
  // 20. Titan (standard): armored gladiator in black metal and gold. Win 50 1v1 matches.
  titan: {
    name: 'Titan',
    hitbox: 'standard',
    blurb: 'Armored gladiator with a crest, a glowing visor and gold trim. For 1v1 champions.',
    span: [-0.6, 0.82, 0.39],
    livery: 'single',
    baseShade: 0.7,
    wheels: { front: { r: 0.145, w: 0.15, z: 0.37 }, back: { r: 0.165, w: 0.18, z: 0.38 }, rim: 'turbine', rimMat: 'rimGold', sidewall: 0.38 },
    build(k) {
      k.shell([
        { x: 0.8, w: 0.22, yb: -0.06, yt: 0.02, n: 4 },
        { x: 0.72, w: 0.32, yb: -0.08, yt: 0.09, n: 5, tb: 0.15 },
        { x: 0.45, w: 0.35, yb: -0.09, yt: 0.13, n: 5.5, tb: 0.25 },
        { x: 0.1, w: 0.35, yb: -0.09, yt: 0.15, n: 5.5, tb: 0.3 },
        { x: -0.3, w: 0.35, yb: -0.09, yt: 0.16, n: 5.5, tb: 0.3 },
        { x: -0.52, w: 0.33, yb: -0.07, yt: 0.15, n: 5, tb: 0.25 },
        { x: -0.6, w: 0.28, yb: -0.04, yt: 0.12, n: 4 },
      ], { ring: 48, twoTone: { y: -0.02, dark: 0.16 } });
      // Low helmet cabin with a glowing visor slit.
      k.shell([
        { x: 0.22, w: 0.18, yb: 0.12, yt: 0.14, n: 4, tb: 0.4 },
        { x: 0.1, w: 0.24, yb: 0.12, yt: 0.26, n: 4.5, tb: 0.45 },
        { x: -0.15, w: 0.25, yb: 0.13, yt: 0.29, n: 4.5, tb: 0.45 },
        { x: -0.36, w: 0.2, yb: 0.14, yt: 0.2, n: 4, tb: 0.4 },
      ], { mat: 'darkMetal', ring: 40 });
      k.rbox([0.012, 0.03, 0.34], [0.165, 0.22, 0], 'glow', { r: 0.006, rot: [0, 0, 0.55] });
      // Crest down the middle of the roof.
      k.plate([[0, 0], [0.06, 0.06], [-0.1, 0.1], [-0.38, 0.05], [-0.42, 0]], 0.02, [0.06, 0.27, 0], 'rimGold', { bevel: 0.004 });
      // Ram plate on the nose.
      k.rbox([0.05, 0.1, 0.62], [0.82, -0.03, 0], 'darkMetal', { r: 0.02, rot: [0, 0, 0.35] });
      k.box([0.012, 0.012, 0.6], [0.85, 0.02, 0], 'rimGold');
      k.sym((s) => {
        // Layered armor plates on the flanks.
        for (let i = 0; i < 3; i++) k.rbox([0.22, 0.06, 0.02], [0.35 - i * 0.3, 0.07, s * (0.352 - i * 0.004)], 'darkMetal', { r: 0.01, rot: [s * 0.15, 0, 0] });
        k.box([0.9, 0.01, 0.006], [0.0, 0.11, s * 0.355], 'rimGold');
        k.box([0.02, 0.016, 0.13], [0.79, 0.04, s * 0.18], 'head', [0, s * 0.35, 0]);
        k.box([0.012, 0.04, 0.12], [-0.605, 0.06, s * 0.17], 'tail');
        // Shoulder spikes.
        k.cyl(0.0, 0.03, 0.08, [-0.42, 0.2, s * 0.25], 'rimGold', { rot: [s * -0.5, 0, 0] });
        k.cyl(0.0, 0.025, 0.07, [0.4, 0.15, s * 0.28], 'rimGold', { rot: [s * -0.6, 0, 0.3] });
        k.nozzle([-0.63, 0.02, s * 0.1], 0.055);
      });
      k.wing(0.12, 0.02, 0.66, [-0.56, 0.26, 0], 'darkMetal', { rotZ: -0.15 });
      k.box([0.012, 0.012, 0.62], [-0.625, 0.27, 0], 'rimGold');
      k.sym((s) => k.box([0.12, 0.12, 0.016], [-0.5, 0.2, s * 0.3], 'darkMetal', [0, 0, 0.35]));
    },
  },

  // 21. Phantom (flat): faceted stealth wedge with glowing edges. Score 500 goals.
  phantom: {
    name: 'Phantom',
    hitbox: 'flat',
    blurb: 'Faceted stealth wedge with glowing edges and a slit canopy. For 500-goal scorers.',
    span: [-0.62, 0.82, 0.46],
    livery: 'twin',
    baseShade: 0.55,
    wheels: { front: { r: 0.13, w: 0.13, z: 0.33 }, back: { r: 0.17, w: 0.2, z: 0.3 }, rim: 'turbine', rimMat: 'rimBlack', sidewall: 0.28 },
    build(k) {
      // Sharp, low body: low n gives the faceted diamond section.
      k.shell([
        { x: 0.82, w: 0.03, yb: 0.0, yt: 0.01, n: 1.4 },
        { x: 0.66, w: 0.24, yb: -0.01, yt: 0.05, n: 1.6, tb: 0.5 },
        { x: 0.4, w: 0.42, yb: 0.0, yt: 0.09, n: 1.7, tb: 0.6 },
        { x: 0.05, w: 0.47, yb: 0.01, yt: 0.12, n: 1.8, tb: 0.65 },
        { x: -0.3, w: 0.46, yb: 0.02, yt: 0.12, n: 1.8, tb: 0.65 },
        { x: -0.52, w: 0.4, yb: 0.03, yt: 0.1, n: 1.7, tb: 0.6 },
        { x: -0.62, w: 0.3, yb: 0.035, yt: 0.07, n: 1.6 },
      ], { ring: 8, steps: 3 });
      k.shell([
        { x: 0.6, w: 0.06, yb: -0.02, yt: 0.03, n: 2 },
        { x: 0.3, w: 0.17, yb: -0.07, yt: 0.04, n: 2 },
        { x: -0.3, w: 0.18, yb: -0.07, yt: 0.05, n: 2 },
        { x: -0.58, w: 0.12, yb: -0.04, yt: 0.05, n: 2 },
      ], { mat: 'carbon', ring: 8, steps: 3 });
      // Slit canopy.
      k.shell([
        { x: 0.32, w: 0.04, yb: 0.08, yt: 0.1, n: 1.6 },
        { x: 0.18, w: 0.11, yb: 0.08, yt: 0.17, n: 1.7 },
        { x: -0.06, w: 0.12, yb: 0.09, yt: 0.18, n: 1.7 },
        { x: -0.24, w: 0.05, yb: 0.1, yt: 0.12, n: 1.6 },
      ], { mat: 'glass', ring: 8, steps: 3 });
      k.sym((s) => {
        // Glowing leading edges and twin tail blades.
        k.tube([[0.8, 0.012, 0.02], [0.6, 0.03, 0.26], [0.38, 0.05, 0.42], [0.05, 0.065, 0.47], [-0.3, 0.07, 0.46], [-0.6, 0.055, 0.31]].map((p) => [p[0], p[1], p[2] * s]), 0.006, 'glow', { seg: 48 });
        k.plate([[0, 0], [-0.08, 0.2], [-0.16, 0.2], [-0.14, 0]], 0.012, [-0.42, 0.1, s * 0.2], 'carbon', { rot: [s * -0.35, 0, 0], bevel: 0.003 });
        k.box([0.08, 0.006, 0.05], [0.6, 0.045, s * 0.2], 'head', [0, s * 0.7, 0]);
        k.box([0.012, 0.012, 0.16], [-0.62, 0.06, s * 0.16], 'tail');
        k.nozzle([-0.62, 0.05, s * 0.07], 0.04);
      });
      k.box([0.5, 0.006, 0.01], [-0.1, 0.125, 0], 'glow');
    },
  },

  // 22. Monarch (hybrid): royal grand coupe with gold grille and a crown ornament. Win 100 matches.
  monarch: {
    name: 'Monarch',
    hitbox: 'hybrid',
    blurb: 'Royal grand coupe with a gold grille, white-wall tires and a crown on the hood. For 100-win players.',
    span: [-0.58, 0.82, 0.37],
    livery: 'single',
    wheels: { front: { r: 0.15, w: 0.14, z: 0.35 }, back: { r: 0.155, w: 0.15, z: 0.355 }, rim: 'mesh', rimMat: 'rimGold', whitewall: true, sidewall: 0.36 },
    build(k) {
      k.shell([
        { x: 0.8, w: 0.27, yb: -0.05, yt: 0.07, n: 5 },
        { x: 0.74, w: 0.31, yb: -0.06, yt: 0.12, n: 5.5, tb: 0.08 },
        { x: 0.45, w: 0.33, yb: -0.065, yt: 0.15, n: 6, tb: 0.12 },
        { x: 0.1, w: 0.34, yb: -0.065, yt: 0.16, n: 6, tb: 0.14 },
        { x: -0.3, w: 0.34, yb: -0.06, yt: 0.17, n: 6, tb: 0.14 },
        { x: -0.5, w: 0.32, yb: -0.05, yt: 0.16, n: 5.5, tb: 0.12 },
        { x: -0.575, w: 0.28, yb: -0.03, yt: 0.13, n: 5 },
      ], { ring: 48, twoTone: { y: 0.0, dark: 0.14 } });
      k.shell([
        { x: 0.22, w: 0.26, yb: 0.15, yt: 0.16, n: 4.5, tb: 0.3 },
        { x: 0.1, w: 0.28, yb: 0.15, yt: 0.29, n: 5, tb: 0.35 },
        { x: -0.2, w: 0.28, yb: 0.16, yt: 0.3, n: 5, tb: 0.35 },
        { x: -0.38, w: 0.26, yb: 0.16, yt: 0.18, n: 4.5, tb: 0.3 },
      ], { mat: 'glass', ring: 40 });
      k.rbox([0.32, 0.014, 0.5], [-0.05, 0.302, 0], 'paintPlain', { r: 0.008 });
      // Tall gold grille with vertical bars.
      k.rbox([0.02, 0.13, 0.22], [0.8, 0.04, 0], 'rimGold', { r: 0.01 });
      for (let i = -3; i <= 3; i++) k.box([0.008, 0.11, 0.008], [0.812, 0.04, i * 0.028], 'black');
      // Crown ornament on the hood.
      k.cyl(0.035, 0.035, 0.02, [0.62, 0.17, 0], 'rimGold');
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        k.cyl(0.0, 0.009, 0.035, [0.62 + Math.cos(a) * 0.03, 0.195, Math.sin(a) * 0.03], 'rimGold');
      }
      k.sphere(0.012, [0.62, 0.2, 0], 'tail');
      k.sym((s) => {
        k.cyl(0.032, 0.032, 0.014, [0.8, 0.05, s * 0.2], 'rimGold', { axis: 'x' });
        k.cyl(0.024, 0.024, 0.01, [0.808, 0.05, s * 0.2], 'head', { axis: 'x' });
        k.box([1.1, 0.01, 0.006], [0.1, 0.12, s * 0.335], 'rimGold');
        k.box([0.012, 0.05, 0.14], [-0.578, 0.08, s * 0.18], 'tail');
        k.cyl(0.012, 0.012, 0.3, [0.0, -0.07, s * 0.34], 'rimGold', { axis: 'x' });
        k.nozzle([-0.6, -0.01, s * 0.12], 0.05, { mat: 'rimGold' });
        k.plate([[0, 0], [-0.06, 0.08], [-0.12, 0.08], [-0.1, 0]], 0.01, [-0.45, 0.16, s * 0.26], 'paintPlain', { bevel: 0.003 });
      });
      k.rbox([0.04, 0.03, 0.66], [0.81, -0.055, 0], 'rimGold', { r: 0.01 });
      k.rbox([0.04, 0.03, 0.62], [-0.585, -0.04, 0], 'rimGold', { r: 0.01 });
    },
  },
  // 23. Hotshot (hybrid): boxy early-80s hot hatch. Leaderboard #1 reward (never in drops).
  hotshot: {
    name: 'Hotshot',
    hitbox: 'hybrid',
    blurb: 'Boxy 80s hot hatch: round lamps, a red-trimmed grille and black arches. For players who reached #1.',
    span: [-0.56, 0.8, 0.36],
    livery: 'single',
    baseShade: 0.86,
    wheels: { front: { r: 0.145, w: 0.13, z: 0.345 }, back: { r: 0.145, w: 0.13, z: 0.345 }, rim: 'star', rimMat: 'rimSilver', sidewall: 0.4 },
    build(k) {
      const red = new THREE.MeshStandardMaterial({ color: 0xd8141e, roughness: 0.4, metalness: 0.1 });
      // Lower body: flat sides, square nose, a crease at the beltline.
      k.shell([
        { x: 0.795, w: 0.3, yb: -0.05, yt: 0.07, n: 9 },
        { x: 0.775, w: 0.325, yb: -0.06, yt: 0.105, n: 10, tb: 0.04 },
        { x: 0.55, w: 0.33, yb: -0.065, yt: 0.125, n: 10, tb: 0.05 },
        { x: 0.2, w: 0.33, yb: -0.065, yt: 0.13, n: 10, tb: 0.05 },
        { x: -0.4, w: 0.33, yb: -0.065, yt: 0.135, n: 10, tb: 0.05 },
        { x: -0.53, w: 0.325, yb: -0.055, yt: 0.135, n: 10, tb: 0.04 },
        { x: -0.55, w: 0.31, yb: -0.04, yt: 0.12, n: 9 },
      ], { ring: 48, twoTone: { y: -0.035, dark: 0.12 } });
      // Tall glasshouse: raked windscreen, flat roof, near-vertical hatch.
      k.shell([
        { x: 0.3, w: 0.29, yb: 0.12, yt: 0.135, n: 8, tb: 0.12 },
        { x: 0.14, w: 0.29, yb: 0.12, yt: 0.33, n: 8, tb: 0.16 },
        { x: -0.36, w: 0.29, yb: 0.125, yt: 0.335, n: 8, tb: 0.16 },
        { x: -0.47, w: 0.28, yb: 0.13, yt: 0.3, n: 8, tb: 0.14 },
        { x: -0.53, w: 0.27, yb: 0.135, yt: 0.16, n: 8, tb: 0.1 },
      ], { mat: 'glass', ring: 40 });
      k.rbox([0.5, 0.022, 0.585], [-0.11, 0.334, 0], 'paintPlain', { r: 0.008 });
      k.sym((s) => {
        // Thick C-pillar (following the hatch line), thin A- and B-pillars, mirror.
        k.plate([[0, 0], [0.16, 0], [0.16, 0.195], [0.05, 0.165], [-0.005, 0.025]], 0.01, [-0.52, 0.135, s * 0.287], 'paintPlain', { bevel: 0.003 });
        k.box([0.012, 0.2, 0.012], [0.21, 0.23, s * 0.284], 'paintPlain', [0, 0, 0.75]);
        k.box([0.014, 0.2, 0.012], [-0.06, 0.23, s * 0.287], 'black');
        k.rbox([0.03, 0.03, 0.05], [0.28, 0.16, s * 0.33], 'black', { r: 0.008 });
        // Round headlamps in the black grille, square indicators below.
        k.cyl(0.042, 0.042, 0.016, [0.8, 0.045, s * 0.21], 'chrome', { axis: 'x' });
        k.cyl(0.034, 0.034, 0.012, [0.806, 0.045, s * 0.21], 'head', { axis: 'x' });
        k.rbox([0.012, 0.022, 0.05], [0.8, -0.03, s * 0.25], 'amber', { r: 0.004 });
        // Wide tail lamps.
        k.rbox([0.012, 0.06, 0.1], [-0.552, 0.075, s * 0.22], 'tail', { r: 0.006 });
        k.rbox([0.012, 0.02, 0.1], [-0.552, 0.03, s * 0.22], 'amber', { r: 0.004 });
        // Black arch extensions and the side trim strip.
        for (const x of [0.5125, -0.34]) k.arch(x, -0.031, s * 0.338, 0.162, 0.05, 'plastic', { thick: 0.014, from: 0, to: Math.PI });
        k.box([0.62, 0.02, 0.008], [0.09, 0.0, s * 0.334], 'plastic');
        k.nozzle([-0.57, -0.035, s * 0.14], 0.045);
      });
      // Grille: full-width black panel with a thin red outline, badge-free.
      k.rbox([0.016, 0.095, 0.56], [0.796, 0.045, 0], 'black', { r: 0.008 });
      k.box([0.008, 0.008, 0.56], [0.806, 0.094, 0], red);
      k.box([0.008, 0.008, 0.56], [0.806, -0.004, 0], red);
      for (const y of [0.02, 0.045, 0.07]) k.box([0.006, 0.006, 0.26], [0.805, y, 0], 'darkMetal');
      // Black wraparound bumpers and a small front lip.
      k.rbox([0.05, 0.035, 0.68], [0.81, -0.055, 0], 'plastic', { r: 0.01 });
      k.rbox([0.04, 0.035, 0.66], [-0.565, -0.045, 0], 'plastic', { r: 0.01 });
      k.box([0.06, 0.008, 0.6], [0.8, -0.078, 0], 'black');
      // Rear hatch details: wiper and plate recess.
      k.box([0.006, 0.008, 0.14], [-0.53, 0.17, 0.04], 'black', [0.5, 0, 0]);
      k.rbox([0.01, 0.04, 0.16], [-0.556, 0.08, 0], 'black', { r: 0.004 });
    },
  },
};

export const CAR_IDS = Object.keys(DESIGNS);
export const CAR_LIST = CAR_IDS.map((id) => ({ id, name: DESIGNS[id].name, hitbox: DESIGNS[id].hitbox, blurb: DESIGNS[id].blurb }));
