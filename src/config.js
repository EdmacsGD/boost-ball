// All tuning values live here.
// Physics numbers come from RocketSim (MIT, github.com/ZealanL/RocketSim), a reverse-engineered
// simulator that matches the real game tick for tick. They are kept in Unreal units (uu, 1 uu = 1 cm)
// so they can be checked against that source; the physics code converts them to meters.

export const CONFIG = {
  game: {
    title: 'BOOST BALL',
    tickRate: 120, // physics ticks per second, same as the original game
    matchSeconds: 300,
    kickoffCountdown: 3,
    goalCelebrationSeconds: 3.0,
    replaySeconds: 5.0,
    spawnBoost: 100 / 3,
  },

  physics: {
    gravityZ: -650,
    carMass: 180,
    ballMass: 30,
    ballRadius: 91.25,
    ballDrag: 0.03,
    ballFriction: 0.35,
    ballRestitution: 0.6,
    ballMaxSpeed: 6000,
    ballMaxAngSpeed: 6,
    arenaFriction: 0.3, // car-world friction is overridden to 0.3, ball-world uses ball friction
    carWorldFriction: 0.3,
    carWorldRestitution: 0.3,
    carCarFriction: 0.09,
    carCarRestitution: 0.1,
    carBallFriction: 2.0,
    carBallRestitution: 0.0,
    carMaxSpeed: 2300,
    carMaxAngSpeed: 5.5,
    supersonicStart: 2200,
    supersonicMaintainMin: 2100,
    supersonicMaintainTime: 1.0,
    solverIterations: 8,
  },

  // Default car (the "standard" hitbox below) plus values shared by every car.
  car: {
    hitboxSize: [120.507, 86.6994, 38.6591], // length, width, height (uu)
    hitboxOffset: [13.8757, 0, 20.755],
    frontWheel: { radius: 12.5, suspensionRest: 38.755, offset: [51.25, 25.9, 20.755] },
    backWheel: { radius: 15.0, suspensionRest: 37.055, offset: [-33.75, 29.5, 20.755] },
    spawnRestZ: 17,
    respawnZ: 36,
    dodgeDeadzone: 0.5,
  },

  // The six hitbox shapes of the original game (RocketSim CarConfig presets: Octane, Dominus, Plank,
  // Breakout, Hybrid, Merc). Same engine, boost and jump for all; the box and wheel layout change how a
  // car hits the ball, turns and lands. Names here are descriptive.
  hitboxes: {
    standard: {
      restZ: 17.2,
      label: 'Standard', blurb: 'Tall and balanced. Good at everything.',
      hitboxSize: [120.507, 86.6994, 38.6591], hitboxOffset: [13.8757, 0, 20.755],
      frontWheel: { radius: 12.5, suspensionRest: 38.755, offset: [51.25, 25.9, 20.755] },
      backWheel: { radius: 15.0, suspensionRest: 37.055, offset: [-33.75, 29.5, 20.755] },
    },
    long: {
      restZ: 17.2,
      label: 'Long', blurb: 'Longer and lower. Strong flicks and long reach.',
      hitboxSize: [130.427, 85.7799, 33.8], hitboxOffset: [9, 0, 15.75],
      frontWheel: { radius: 12.0, suspensionRest: 33.95, offset: [50.3, 31.1, 15.75] },
      backWheel: { radius: 13.5, suspensionRest: 33.85, offset: [-34.75, 33.0, 15.75] },
    },
    flat: {
      restZ: 18.8,
      label: 'Flat', blurb: 'Widest and flattest. Big surface for hits.',
      hitboxSize: [131.32, 87.1704, 31.8944], hitboxOffset: [9.00857, 0, 12.0942],
      frontWheel: { radius: 12.5, suspensionRest: 31.9242, offset: [49.97, 27.8, 12.0942] },
      backWheel: { radius: 17.0, suspensionRest: 27.9242, offset: [-35.43, 20.28, 12.0942] },
    },
    wedge: {
      restZ: 18.5,
      label: 'Wedge', blurb: 'Longest and lowest. Sharp nose for shots.',
      hitboxSize: [133.992, 83.021, 32.8], hitboxOffset: [12.5, 0, 11.75],
      frontWheel: { radius: 13.5, suspensionRest: 29.7, offset: [51.5, 26.67, 11.75] },
      backWheel: { radius: 15.0, suspensionRest: 29.666, offset: [-35.75, 35.0, 11.75] },
    },
    hybrid: {
      restZ: 17.1,
      label: 'Hybrid', blurb: 'Between Standard and Long.',
      hitboxSize: [129.519, 84.6879, 36.6591], hitboxOffset: [13.8757, 0, 20.755],
      frontWheel: { radius: 12.5, suspensionRest: 38.755, offset: [51.25, 25.9, 20.755] },
      backWheel: { radius: 15.0, suspensionRest: 37.055, offset: [-34.0, 29.5, 20.755] },
    },
    tall: {
      restZ: 18.9,
      label: 'Tall', blurb: 'Tallest box. Hard to get past, great for blocking.',
      hitboxSize: [123.22, 79.2103, 44.1591], hitboxOffset: [11.3757, 0, 21.505],
      frontWheel: { radius: 15.0, suspensionRest: 39.505, offset: [51.25, 25.9, 21.505] },
      backWheel: { radius: 15.0, suspensionRest: 39.105, offset: [-33.75, 29.5, 21.505] },
    },
  },

  vehicle: {
    suspensionStiffness: 500,
    dampingCompression: 25,
    dampingRelaxation: 40,
    maxSuspensionTravel: 12,
    suspensionSubtraction: 0.05 * 50, // stored in uu (0.05 Bullet units)
    suspensionForceScaleFront: 36 - 1 / 4,
    suspensionForceScaleBack: 54 + 1 / 4 + 1.5 / 100,
    throttleTorque: 400, // uu/s^2 per unit throttle (x mass)
    brakeTorque: 14.25 + 1 / 3,
    stoppingForwardVel: 25,
    coastingBrakeFactor: 0.15,
    brakingNoThrottleSpeedThresh: 0.01,
    throttleDeadzone: 0.001,
    throttleAirAccel: 200 / 3,
    powerslideRiseRate: 5,
    powerslideFallRate: 2,
    rollingFrictionMagic: 113.73963,
    sideFrictionDamping: 0.2,
    steerAngleCurve: [[0, 0.53356], [500, 0.3193], [1000, 0.18203], [1500, 0.1057], [1750, 0.08507], [3000, 0.03454]],
    powerslideSteerAngleCurve: [[0, 0.39235], [2500, 0.1261]],
    driveSpeedTorqueCurve: [[0, 1.0], [1400, 0.1], [1410, 0.0]],
    nonStickyFrictionCurve: [[0, 0.1], [0.7075, 0.5], [1, 1.0]],
    latFrictionCurve: [[0, 1.0], [1, 0.2]],
    handbrakeLatFrictionCurve: [[0, 0.1]],
    handbrakeLongFrictionCurve: [[0, 0.5], [1, 0.9]],
  },

  boost: {
    max: 100,
    usedPerSecond: 100 / 3,
    minTime: 0.1,
    accelGround: 2975 / 3,
    accelAir: 3175 / 3,
  },

  jump: {
    accel: 4375 / 3,
    immediateForce: 875 / 3,
    minTime: 0.025,
    resetTimePad: 1 / 40,
    maxTime: 0.2,
    preMinAccelScale: 0.62,
    doubleJumpMaxDelay: 1.25,
  },

  flip: {
    zDamp120: 0.35,
    zDampStart: 0.15,
    zDampEnd: 0.21,
    torqueTime: 0.65,
    torqueMinTime: 0.41,
    pitchlockTime: 1.0,
    pitchlockExtraTime: 0.3,
    initialVelScale: 500,
    torqueX: 260, // roll (side dodges)
    torqueY: 224, // pitch (front/back dodges)
    forwardImpulseMaxSpeedScale: 1.0,
    sideImpulseMaxSpeedScale: 1.9,
    backwardImpulseMaxSpeedScale: 2.5,
    backwardImpulseScaleX: 16 / 15,
  },

  air: {
    torqueScale: (2 * Math.PI / (1 << 16)) * 1000,
    torque: { pitch: 130, yaw: 95, roll: 400 },
    damping: { pitch: 30, yaw: 20, roll: 50 },
  },

  autoflip: { impulse: 200, torque: 50, time: 0.4, normZThresh: Math.SQRT1_2, rollThresh: 2.8 },
  autoroll: { force: 100, torque: 80 },

  ballHit: {
    zScale: 0.35,
    forwardScale: 0.65,
    maxDeltaVel: 4600,
    factorCurve: [[0, 0.65], [500, 0.65], [2300, 0.55], [4600, 0.3]],
  },

  bump: {
    cooldown: 0.25,
    minForwardDist: 64.5,
    groundCurve: [[0, 5 / 6], [1400, 1100], [2200, 1530]],
    airCurve: [[0, 5 / 6], [1400, 1390], [2200, 1945]],
    upwardCurve: [[0, 2 / 6], [1400, 278], [2200, 417]],
    demoRespawnTime: 3,
  },

  arena: {
    extentX: 4096,
    extentY: 5120,
    height: 2150, // original 2044; raised about 1 m for more air room
    cornerPlane: 8064, // |x| + |y| = 8064
    floorRampRadius: 256,
    ceilingRampRadius: 384,
    cornerFillet: 420,
    goalHalfWidth: 892.755,
    goalHeight: 642.775,
    goalDepth: 880,
    goalCornerRadius: 150, // rounding of every inside edge of the goal (uu)
    goalCornerTaper: 300, // the rounding grows from zero at the goal line to full over this depth (uu)
    goalRampTaper: 420,
    goalScoreThresholdY: 5124.25,
  },

  boostPads: {
    cylHeight: 95,
    cylRadBig: 208,
    cylRadSmall: 144,
    boxHeight: 64,
    boxRadBig: 160,
    boxRadSmall: 120,
    cooldownBig: 10,
    cooldownSmall: 4,
    amountBig: 100,
    amountSmall: 12,
    big: [[-3584, 0, 73], [3584, 0, 73], [-3072, 4096, 73], [3072, 4096, 73], [-3072, -4096, 73], [3072, -4096, 73]],
    small: [
      [0, -4240, 70], [-1792, -4184, 70], [1792, -4184, 70], [-940, -3308, 70], [940, -3308, 70],
      [0, -2816, 70], [-3584, -2484, 70], [3584, -2484, 70], [-1788, -2300, 70], [1788, -2300, 70],
      [-2048, -1036, 70], [0, -1024, 70], [2048, -1036, 70], [-1024, 0, 70], [1024, 0, 70],
      [-2048, 1036, 70], [0, 1024, 70], [2048, 1036, 70], [-1788, 2300, 70], [1788, 2300, 70],
      [-3584, 2484, 70], [3584, 2484, 70], [0, 2816, 70], [-940, 3308, 70], [940, 3308, 70],
      [-1792, 4184, 70], [1792, 4184, 70], [0, 4240, 70],
    ],
  },

  // Blue team spawns; orange is mirrored. Yaw in radians, 0 = +x.
  spawns: {
    kickoff: [[-2048, -2560, Math.PI / 4], [2048, -2560, Math.PI * 3 / 4], [-256, -3840, Math.PI / 2], [256, -3840, Math.PI / 2], [0, -4608, Math.PI / 2]],
    respawn: [[-2304, -4608, Math.PI / 2], [-2688, -4608, Math.PI / 2], [2304, -4608, Math.PI / 2], [2688, -4608, Math.PI / 2]],
  },

  camera: {
    fov: 110, // horizontal, like the original's default
    distance: 270,
    height: 100,
    angle: -3, // degrees
    stiffness: 0.45, // 1 = boom length fixed; lower stretches it with speed
    transitionSpeed: 1.2, // ball cam on/off blend takes 0.5 / transitionSpeed seconds
  },

  bots: {
    // reaction: seconds between decisions; aim: aim error scale; boostUse: 0..1; maxSpeedUse: share of top speed;
    // dodges: how often they flip into the ball; aerialHeight: highest ball they go up for (m, 0 = never);
    // rotate: how reliably they rotate back on defense.
    easy: { reaction: 0.4, aim: 1.0, boostUse: 0.3, maxSpeedUse: 0.72, dodges: 0.25, aerialHeight: 0, rotate: 0.45 },
    medium: { reaction: 0.2, aim: 0.5, boostUse: 0.65, maxSpeedUse: 0.9, dodges: 0.6, aerialHeight: 7, rotate: 0.8 },
    hard: { reaction: 0.09, aim: 0.15, boostUse: 1.0, maxSpeedUse: 1.0, dodges: 0.9, aerialHeight: 12, rotate: 1.0 },
  },

  // Arenas: same field and physics, different look. Theme details live in render/arenaThemes.js.
  arenas: [
    { id: 'aurora', name: 'Aurora Arena', blurb: 'Night stadium under the northern lights.', swatch: ['#0b1430', '#3fe0a0', '#7a5cff'] },
    { id: 'solstice', name: 'Solstice Park', blurb: 'Open-air stadium on a bright summer day.', swatch: ['#4fa3ff', '#ffe08a', '#3a9c4a'] },
    { id: 'neon', name: 'Neon District', blurb: 'Rooftop arena in a city that never sleeps.', swatch: ['#12051f', '#ff3fb4', '#29e3ff'] },
    { id: 'frost', name: 'Frostbite Bowl', blurb: 'Snow falling on a mountain stadium.', swatch: ['#5f7896', '#dfe8f3', '#ffffff'] },
    { id: 'dune', name: 'Dune Canyon', blurb: 'Desert arena in red rock at sunset.', swatch: ['#7a2f1a', '#ff8a3d', '#ffcf7a'] },
    { id: 'skyhaven', name: 'Sky Haven', blurb: 'Floating islands above a sea of clouds.', swatch: ['#3a7ad8', '#ffffff', '#5aa83c'] },
    { id: 'harbor', name: 'Harbor Lights', blurb: 'City stadium by the bay at sunset, a red bridge behind.', swatch: ['#2a1e3c', '#ff8a4a', '#ffd9a0'] },
    { id: 'highlands', name: 'Highland Ridge', blurb: 'Green hills, pine forests and snowy peaks.', swatch: ['#3e6a32', '#a9bfd2', '#e6edf4'] },
  ],

  // Accent colors for stripes, trim and calipers (the body is always the team color).
  accents: [
    { id: 'white', name: 'White', hex: 0xf2f5fa },
    { id: 'gold', name: 'Gold', hex: 0xffc845 },
    { id: 'red', name: 'Red', hex: 0xe8384f },
    { id: 'lime', name: 'Lime', hex: 0x9be15d },
    { id: 'cyan', name: 'Cyan', hex: 0x3fe0e8 },
    { id: 'purple', name: 'Purple', hex: 0x9b6bff },
    { id: 'pink', name: 'Pink', hex: 0xff6fb5 },
    { id: 'black', name: 'Black', hex: 0x1a1d24 },
  ],

  teams: [
    { name: 'BLUE', color: 0x1f7bff, light: 0x5aa8ff, dark: 0x0a2a66, css: '#2a86ff' },
    { name: 'ORANGE', color: 0xff7a1a, light: 0xffa65a, dark: 0x6a2600, css: '#ff8a2a' },
  ],
};
