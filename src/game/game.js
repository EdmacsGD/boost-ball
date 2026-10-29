// Game: wires physics, rendering, input, bots, match rules, replays, sound and HUD together.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { UU, rl, clamp } from '../util/math.js';
import { initPhysics, COLLIDER_GROUPS, R } from '../physics/world.js';
import { Simulation } from '../physics/sim.js';
import { Renderer, QUALITY, guessWeakDevice } from '../render/renderer.js';
import { Stadium } from '../render/stadium.js';
import { CarModel } from '../render/carKit.js';
import { DESIGNS, CAR_IDS } from '../render/carDesigns.js';
import { Showroom } from '../render/showroom.js';
import { HomeScreen } from '../ui/home.js';
import { BallModel } from '../render/ballModel.js';
import { BoostPadVisuals } from '../render/pads.js';
import { Effects, Ribbon, createFlame } from '../render/effects.js';
import { CameraRig, setFlatFloor } from '../render/cameraRig.js';
import { SkyField, PATTERN_PERIOD } from '../render/skyField.js';
import { Input } from '../input/input.js';
import { AudioEngine } from '../audio/audio.js';
import { HUD } from '../ui/hud.js';
import { setupBindings } from '../ui/bindings.js';
import { EXPLOSION_IDS } from '../render/goalExplosions.js';
import { Account } from '../meta/account.js';
import { item, itemsIn } from '../meta/items.js';
import { LoginScreen } from '../ui/login.js';
import { PadNav } from '../ui/padnav.js';

// Where the car stands on the pitch behind the home screen menus.
const HOME_SPOT = new THREE.Vector3(0, 0, -16);
import { Bot } from './bot.js';
import { ReplayBuffer, lerpPose } from './replay.js';
import { AnthemPlayer, anthemSpec } from '../audio/anthems.js';
import { AnthemStore } from '../meta/anthemStore.js';
import { AnthemUploads } from '../ui/anthemEditor.js';
import { predictBall, goalBound } from './ballPredict.js';
import { teamRole } from './roles.js';
import { Online } from '../net/online.js';
import { NetPlay } from '../net/netplay.js';
import { bannerCard } from '../ui/playerCard.js';

const TICK = 1 / CONFIG.game.tickRate;
const BOT_NAMES = ['Comet', 'Volt', 'Nyx', 'Pike', 'Echo', 'Rook', 'Ember', 'Halo', 'Quill', 'Sable', 'Drift', 'Juno'];
const v0 = new THREE.Vector3();
const WHITE = new THREE.Color(1, 1, 1);
const v1 = new THREE.Vector3();

function loadSettings() {
  const defaults = { quality: 'auto', fov: 110, distance: 270, height: 100, angle: -3, stiffness: 0.45, transitionSpeed: 1.2, volume: 80, showFps: false, ballCam: true, mode: '1v1', difficulty: 'medium', car: 'strider', accent: 'white', arena: 'aurora', explosion: 'classic', rumble: true, anthemVolume: 80 };
  try {
    const raw = localStorage.getItem('boostball.settings');
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch (e) {
    // Storage can be blocked; defaults are fine.
  }
  return defaults;
}

function saveSettings(s) {
  try {
    localStorage.setItem('boostball.settings', JSON.stringify(s));
  } catch (e) {
    // Ignore.
  }
}

export class Game {
  constructor(container, progress = () => {}, restored = {}) {
    this.container = container;
    this.progress = progress;
    this.settings = { ...loadSettings(), ...(restored.settings || {}) };
    this.players = [];
    this.state = 'loading';
    this.stateTime = 0;
    this.simTime = 0;
    this.acc = 0;
    this.paused = false;
    this.score = [0, 0];
    this.clock = CONFIG.game.matchSeconds;
    this.overtime = false;
    this.kickoffTouched = false;
    this.touches = [];
    this.fpsSmooth = 60;
    this.lastFrame = performance.now();
    this.time = 0;
  }

  async init() {
    this.progress(0.1, 'Loading physics');
    await initPhysics();
    this.progress(0.35, 'Loading fonts');
    try {
      await Promise.race([document.fonts.load('800 40px "Saira Game"'), new Promise((r) => setTimeout(r, 1500))]);
    } catch (e) {
      // Fall back to system fonts.
    }
    this.progress(0.45, 'Building arena');
    this.sim = new Simulation();
    this.renderer = new Renderer(this.container);
    this.weakDevice = guessWeakDevice(this.renderer.renderer);
    const qName = this.settings.quality === 'auto' ? this.autoStartQuality() : this.settings.quality;
    this.renderer.autoQuality = this.settings.quality === 'auto';
    this.renderer.setQuality(QUALITY[qName] ? qName : 'medium');
    const scene = this.renderer.scene;
    await new Promise((r) => setTimeout(r, 0));
    if (!CONFIG.arenas.some((a) => a.id === this.settings.arena)) this.settings.arena = 'aurora';
    this.buildArena(this.settings.arena);
    this.progress(0.75, 'Building cars');
    await new Promise((r) => setTimeout(r, 0));
    // Pads and ball reflect the scene environment, so they follow arena changes.
    this.padVis = new BoostPadVisuals(this.sim.pads, null);
    scene.add(this.padVis.group);
    this.ballModel = new BallModel(this.sim.ball.radius, null);
    scene.add(this.ballModel.root, this.ballModel.marker);
    this.ballTrail = new Ribbon(36, 0.5, 0xffc070, 0.5, 10, [2.0, 6.0]);
    scene.add(this.ballTrail.mesh);
    this.effects = new Effects(scene, this.renderer.quality);
    this.showroom = new Showroom(this.renderer.renderer);
    this.renderer.onResize = (w, h) => this.showroom.resize(w, h);
    this.showroom.resize(this.renderer.width, this.renderer.height);
    this.renderer.onQualityChange = (q) => {
      this.stadium.keyLight.castShadow = q.shadows;
      if (q.shadowSize) {
        this.stadium.keyLight.shadow.mapSize.set(q.shadowSize, q.shadowSize);
        this.stadium.keyLight.shadow.map?.dispose();
        this.stadium.keyLight.shadow.map = null;
      }
      for (const l of this.stadium.goalLights) l.visible = q.bloom;
      this.stadium.setQuality(q);
      if (this.skyField) {
        this.skyField.sun.castShadow = q.shadows;
        this.skyField.setQuality(q);
      }
      if (this.effects) this.effects.quality = q;
      this.updateGraphicsUi?.();
    };
    this.renderer.onQualityChange(this.renderer.quality);

    const ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    this.cameraRig = new CameraRig(this.renderer.camera, (origin, dir, max) => {
      ray.origin = { x: origin.x, y: origin.y, z: origin.z };
      ray.dir = { x: dir.x, y: dir.y, z: dir.z };
      const hit = this.sim.pw.world.castRay(ray, max, true, undefined, COLLIDER_GROUPS.arenaRay);
      return hit ? hit.timeOfImpact : null;
    });
    this.applyCameraSettings();
    this.cameraRig.ballCam = this.settings.ballCam;

    this.input = new Input(window);
    this.input.setBindings(this.settings.bindings);
    this.audio = new AudioEngine();
    this.audio.volume = this.settings.volume / 100;
    this.anthemStore = new AnthemStore();
    this.anthems = new AnthemPlayer(this.audio, this.anthemStore);
    this.anthems.volume = this.settings.anthemVolume / 100;
    this.uploads = new AnthemUploads(this);
    this.hud = new HUD();
    this.replay = new ReplayBuffer(8, 60);
    this.input.onAnyInput(() => this.audio.init());

    this.bindMenus();
    this.renderBindings = setupBindings(this.input, (b) => {
      this.settings.bindings = b;
      saveSettings(this.settings);
    });
    this.input.rumbleOn = this.settings.rumble !== false;
    this.padNav = new PadNav(this);
    // Controller plugged in or out: say so, switch button names, and rumble once to confirm.
    this.input.onPadChange((on, type) => {
      const name = type === 'ps' ? 'PlayStation controller' : type === 'xbox' ? 'Xbox controller' : 'Controller';
      this.toast(on ? `${name} connected` : `${name} disconnected`);
      document.body.classList.toggle('pad-ps', on && type === 'ps');
      document.body.classList.toggle('pad-on', on);
      this.renderBindings?.();
      if (on) this.input.rumble(0.4, 0.4, 180);
    });
    this.previewTeam = 0;
    this.testMode = new URLSearchParams(location.search).has('test');
    this.account = new Account();
    this.account.onChange(() => {
      if (this.player && this.account.mode) this.player.name = this.account.data.name;
    });
    this.online = new Online(this);
    this.np = null; // NetPlay while in an online match
    this.home = new HomeScreen(this);
    this.login = new LoginScreen(this);
    this.online.init();
    this.progress(0.95, 'Kicking off');
    // Tests start as a guest; everyone else picks an account first.
    if (this.testMode) this.account.useGuest(this.legacyProfile());
    this.setupMatch(this.settings.mode, this.settings.difficulty);
    this.enterHome();
    this.progress(1, 'Ready');
    if (!this.testMode) {
      this.login.show();
      requestAnimationFrame((t) => this.frame(t));
    }
  }

  // Test hook: show one car alone in the showroom.
  debugCar(id, { team = 0, spin = 0.6, accent = 0xffffff, cam = null } = {}) {
    const d = DESIGNS[id];
    const model = new CarModel(d, { team, number: 7, accent, hitbox: CONFIG.hitboxes[d.hitbox] });
    this.showroom.setStage('studio');
    this.showroom.setCar(model);
    this.showroom.spin = spin;
    this.showroom.spinSpeed = 0;
    if (cam) {
      this.showroom.camera.position.set(...cam.pos);
      this.showroom.camera.lookAt(...cam.look);
    } else {
      this.showroom.placeCamera();
    }
    this.showroom.update(0);
    this.renderer.setView(this.showroom.scene, this.showroom.camera);
    this.showingShowroom = true;
    return d.name;
  }

  // Test hook: run frames with a fixed time step, rendering only the last one (for slow headless GPUs).
  runFrames(n, dt = 1 / 60, renderEach = false) {
    for (let i = 0; i < n; i++) this.stepFrame(dt, renderEach || i === n - 1);
    return { state: this.state, tick: this.sim.tick };
  }

  applyCameraSettings() {
    const c = this.cameraRig.settings;
    c.fov = this.settings.fov;
    c.distance = this.settings.distance;
    c.height = this.settings.height;
    c.angle = this.settings.angle;
    c.stiffness = this.settings.stiffness;
    c.transitionSpeed = this.settings.transitionSpeed;
  }

  // ------------------------------------------------------------------ setup
  setupMatch(mode, difficulty) {
    this.mode = mode;
    this.difficulty = difficulty;
    this.settings.mode = mode;
    this.settings.difficulty = difficulty;
    saveSettings(this.settings);
    for (const p of this.players) {
      this.sim.removeCar(p.car);
      this.renderer.scene.remove(p.model.root);
      p.model.dispose();
      for (const r of p.ribbons) this.renderer.scene.remove(r.mesh);
      if (this.audio.ready) this.audio.stopEngine(p.car.id);
    }
    this.players = [];
    const perTeam = mode === '2v2' ? 2 : mode === '3v3' ? 3 : 1;
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    const lo = this.account.loadout;
    const playerCar = DESIGNS[lo.car] && this.account.owns('car', lo.car) ? lo.car : 'strider';
    const boosts = itemsIn('boost');
    // Bots drive a shuffled mix of the other cars, each with a random accent.
    const pool = CAR_IDS.filter((id) => id !== playerCar).sort(() => Math.random() - 0.5);
    const botCar = (i) => pool[i % pool.length];
    const botAccent = () => CONFIG.accents[Math.floor(Math.random() * CONFIG.accents.length)].hex;
    this.addPlayer(0, this.account.data.name, true, 7, playerCar, this.accentHex(), this.cosmetics(lo, 0));
    // Bots get a random boost too.
    const botLook = () => ({ boost: boosts[Math.floor(Math.random() * boosts.length)] });
    if (mode !== 'free') {
      let b = 0;
      for (let i = 1; i < perTeam; i++) this.addPlayer(0, names.pop(), false, 10 + i, botCar(b++), botAccent(), botLook());
      for (let i = 0; i < perTeam; i++) this.addPlayer(1, names.pop(), false, 20 + i, botCar(b++), botAccent(), botLook());
    }
    this.ballModel?.setSkin(lo.ball);
    this.player = this.players[0];
    this.score = [0, 0];
    this.clock = CONFIG.game.matchSeconds;
    this.overtime = false;
    this.matchOver = false;
    this.recorded = false;
    this.zeroSeconds = false;
    this.hud.setScore(0, 0);
    this.matchTime = 0;
    this.kickoffSetup();
    document.querySelectorAll('#modeGroup button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    document.querySelectorAll('#diffGroup button').forEach((b) => b.classList.toggle('on', b.dataset.diff === difficulty));
  }

  accentHex() {
    const id = this.account?.mode ? this.account.loadout.accent : this.settings.accent;
    return (CONFIG.accents.find((a) => a.id === id) || CONFIG.accents[0]).hex;
  }

  // look: { paint, finish, decal, boost } cosmetics (see cosmetics()).
  addPlayer(team, name, isPlayer, number, carId = 'strider', accent = 0xffffff, look = {}) {
    const design = DESIGNS[carId] || DESIGNS.strider;
    const car = this.sim.addCar(team, design.hitbox);
    const model = new CarModel(design, { team, number, accent, hitbox: car.hitbox, paint: look.paint ?? null, finish: look.finish || null, decal: look.decal || 'default' });
    this.renderer.scene.add(model.root);
    const tc = CONFIG.teams[team];
    const flames = model.nozzles.map((n) => {
      const f = createFlame(tc.color, look.boost || null);
      f.position.copy(n.pos).add(new THREE.Vector3(0.03, 0, 0));
      f.scale.setScalar(n.r / 0.06); // flame size follows the nozzle
      f.visible = false;
      model.body.add(f);
      return f;
    });
    // Supersonic streaks from behind the rear tires, capped at 4 m so they read as streaks at any speed.
    const ribbons = [new Ribbon(30, 0.045, 0xd8f0ff, 0.55, 4.0, [1.2, 4.0]), new Ribbon(30, 0.045, 0xd8f0ff, 0.55, 4.0, [1.2, 4.0])];
    for (const r of ribbons) this.renderer.scene.add(r.mesh);
    const p = {
      car, model, name, team, isPlayer, number, flames, ribbons, carId, boostItem: look.boost || null,
      bot: isPlayer ? null : new Bot(car, this, this.difficulty),
      stats: { score: 0, goals: 0, assists: 0, saves: 0, shots: 0, demos: 0 },
      prevPos: new THREE.Vector3(), prevQuat: new THREE.Quaternion(),
      renderPos: new THREE.Vector3(), renderQuat: new THREE.Quaternion(),
      scrapeTimer: 0, wasSupersonic: false,
    };
    // Goal explosion: yours from the garage, a random one for each bot.
    p.explosion = isPlayer ? this.account.loadout.explosion : EXPLOSION_IDS[Math.floor(Math.random() * EXPLOSION_IDS.length)];
    this.players.push(p);
    return p;
  }

  kickoffSetup() {
    this.sim.ball.body.setEnabled(true);
    this.sim.setupKickoff();
    for (const p of this.players) {
      p.car.readState();
      p.prevPos.copy(p.car.pos);
      p.prevQuat.copy(p.car.quat);
      p.car.infiniteBoost = p.isPlayer ? !!this.infiniteBoost : false;
      if (p.bot) {
        p.bot.state = 'kickoff';
        p.bot.dodge = null;
        p.bot.aerial = null;
      }
      p.model.root.visible = true;
    }
    this.sim.ball.readState();
    this.prevBallPos = this.sim.ball.pos.clone();
    this.prevBallQuat = this.sim.ball.quat.clone();
    this.kickoffTouched = false;
    this.touches = [];
    this.ballThreat = -1;
    this.ballHidden = false;
    this.effects.clear();
    this.replay.clear();
    if (this.endlessOn) this.endlessKickoff();
    if (this.np && this.np.isHost) this.np.hostKickoff();
    this.cameraRig.snap();
    this.stopGoalAnthem(1.2);
  }

  enterState(s) {
    this.state = s;
    this.stateTime = 0;
    if (s === 'home') {
      this.home.show();
      this.stopGoalAnthem(0.4);
    }
    else this.home.hide();
    this.hud.showHud(s !== 'home');
    this.hud.replay(s === 'replay');
    this.showReplayCard(s === 'replay');
    if (s === 'home') {
      this.sim.freezeCars = true;
      this.cameraRig.snap();
    }
    if (s === 'countdown') {
      this.sim.freezeCars = true;
      this.countStep = -1;
      this.cameraRig.snap();
    }
    if (s === 'play') this.sim.freezeCars = false;
    if (s === 'replay') {
      this.replayStart = Math.max(this.replay.start, this.goalInfo.time - 4.4);
      this.replayEnd = Math.min(this.replay.end, this.goalInfo.time + 0.6);
      this.replayT = this.replayStart;
      this.replayExploded = false;
      this.effects.clear();
      this.cameraRig.snap();
      if (this.audio.ready) this.audio.silenceEngines();
    }
    if (s === 'ended') {
      this.sim.freezeCars = true;
      this.showResults();
    }
  }

  startKickoffCountdown() {
    this.audio.init();
    this.kickoffSetup();
    this.enterState('countdown');
  }

  // ------------------------------------------------------------------ menus
  bindMenus() {
    const $ = (id) => document.getElementById(id);
    document.querySelectorAll('#modeGroup button').forEach((b) => b.addEventListener('click', () => {
      this.audio.init();
      this.audio.play('click');
      this.setupMatch(b.dataset.mode, this.difficulty);
      this.home.refresh();
    }));
    document.querySelectorAll('#diffGroup button').forEach((b) => b.addEventListener('click', () => {
      this.audio.init();
      this.audio.play('click');
      this.difficulty = b.dataset.diff;
      this.settings.difficulty = b.dataset.diff;
      saveSettings(this.settings);
      for (const p of this.players) p.bot?.setDifficulty(b.dataset.diff);
      document.querySelectorAll('#diffGroup button').forEach((x) => x.classList.toggle('on', x === b));
    }));
    $('startBtn').addEventListener('click', () => this.startMatch());
    $('resumeBtn').addEventListener('click', () => this.setPaused(false));
    $('fullBtn').addEventListener('click', () => this.toggleFullscreen());
    $('restartBtn').addEventListener('click', () => {
      this.setPaused(false);
      this.setupMatch(this.mode, this.difficulty);
      this.startKickoffCountdown();
    });
    $('menuBtn').addEventListener('click', () => {
      this.setPaused(false);
      if (this.np) {
        this.leaveOnlineMatch();
        return;
      }
      this.enterHome();
    });
    $('againBtn').addEventListener('click', () => {
      $('results').hidden = true;
      if (this.np) {
        this.leaveOnlineMatch();
        return;
      }
      this.setupMatch(this.mode, this.difficulty);
      this.startKickoffCountdown();
    });
    $('modeBtn2').addEventListener('click', () => {
      $('results').hidden = true;
      if (this.np) {
        this.leaveOnlineMatch();
        this.home.setPage('main');
        return;
      }
      this.enterHome();
    });
    document.querySelectorAll('.tabs .tab').forEach((t) => t.addEventListener('click', () => {
      document.querySelectorAll('.tabs .tab').forEach((x) => x.classList.toggle('on', x === t));
      document.querySelectorAll('.tabpane').forEach((p) => { p.hidden = p.dataset.pane !== t.dataset.tab; });
    }));
    const bindRange = (id, outId, key, fmt = (v) => v, apply = () => {}) => {
      const el = $(id);
      const out = $(outId);
      el.value = this.settings[key];
      out.textContent = fmt(this.settings[key]);
      el.addEventListener('input', () => {
        const v = Number(el.value);
        this.settings[key] = v;
        out.textContent = fmt(v);
        apply(v);
        saveSettings(this.settings);
      });
    };
    bindRange('setFov', 'outFov', 'fov', (v) => v, () => this.applyCameraSettings());
    bindRange('setDist', 'outDist', 'distance', (v) => v, () => this.applyCameraSettings());
    bindRange('setHeight', 'outHeight', 'height', (v) => v, () => this.applyCameraSettings());
    bindRange('setStiff', 'outStiff', 'stiffness', (v) => Number(v).toFixed(2), () => this.applyCameraSettings());
    bindRange('setAngle', 'outAngle', 'angle', (v) => v, () => this.applyCameraSettings());
    bindRange('setTrans', 'outTrans', 'transitionSpeed', (v) => Number(v).toFixed(1), () => this.applyCameraSettings());
    bindRange('setVol', 'outVol', 'volume', (v) => v, (v) => this.audio.setVolume(v / 100));
    bindRange('setAnthemVol', 'outAnthemVol', 'anthemVolume', (v) => v, (v) => this.anthems.setVolume(v / 100));
    const q = $('setQuality');
    q.value = this.settings.quality;
    q.addEventListener('change', () => this.setGraphics(q.value));
    document.querySelectorAll('#gfxGroup button').forEach((b) => b.addEventListener('click', () => {
      this.audio.init();
      this.audio.play('click');
      this.setGraphics(b.dataset.q);
    }));
    this.updateGraphicsUi();
    const rum = $('setRumble');
    rum.checked = this.settings.rumble !== false;
    rum.addEventListener('change', () => {
      this.settings.rumble = rum.checked;
      this.input.rumbleOn = rum.checked;
      saveSettings(this.settings);
      if (rum.checked) this.input.rumble(0.5, 0.5, 200);
    });
    const fps = $('setFps');
    fps.checked = this.settings.showFps;
    fps.addEventListener('change', () => { this.settings.showFps = fps.checked; saveSettings(this.settings); });
    const bc = $('setBallCam');
    bc.checked = this.settings.ballCam;
    bc.addEventListener('change', () => { this.settings.ballCam = bc.checked; this.cameraRig.ballCam = bc.checked; saveSettings(this.settings); });
  }

  setPaused(p) {
    if (this.state === 'home' || this.state === 'ended' || this.state === 'loading') return;
    this.paused = p;
    document.getElementById('pause').hidden = !p;
    if (p) {
      // Settings and controls may have been moved to the home screen; bring them back.
      document.querySelector('.tabpane[data-pane="settings"]').appendChild(document.getElementById('settingsBlock'));
      document.querySelector('.tabpane[data-pane="controls"]').appendChild(document.getElementById('controlsBlock'));
    }
    if (p && this.audio.ready) this.audio.silenceEngines();
    this.lastFrame = performance.now();
  }

  // ------------------------------------------------------------------ main loop
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    let dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 0.1);
    this.stepFrame(dt, true);
  }

  stepFrame(dt, render = true) {
    this.time += dt;
    this.fpsSmooth += (1 / Math.max(dt, 1e-3) - this.fpsSmooth) * 0.05;
    if (this.state === 'home' && !this.testMode) {
      this.fpsTimer = (this.fpsTimer || 0) - dt;
      if (this.fpsTimer <= 0) {
        this.fpsTimer = 0.5;
        document.getElementById('sbFps').textContent = `${Math.round(this.fpsSmooth)} FPS`;
      }
    }

    this.input.pollPad(dt);
    this.padNav.update(this.input);
    this.handleGlobalKeys();
    // Online matches never pause: the menu opens over the running game.
    if (this.paused && !this.np) {
      if (render) this.renderer.render();
      return;
    }
    this.stateTime += dt;
    // Play time for the profile (anything but menus and the end screen).
    if (this.state === 'countdown' || this.state === 'play' || this.state === 'goal' || this.state === 'replay') {
      this.account.addPlaytime(dt);
      this.matchTime = (this.matchTime || 0) + dt;
    }

    const stepping = this.state === 'play' || this.state === 'countdown' || this.state === 'goal';
    if (stepping) {
      // Player input.
      const pc = this.player.car.controls;
      if (this.paused) pc.reset();
      else this.input.read(pc);
      this.acc += dt;
      let steps = 0;
      while (this.acc >= TICK && steps < 8) {
        this.tick();
        this.acc -= TICK;
        steps++;
      }
      if (steps === 8) this.acc = 0;
    }
    this.updateState(dt);
    this.online.update(dt);
    const alpha = clamp(this.acc / TICK, 0, 1);
    this.updateVisuals(dt, alpha);
    if (render) {
      if (!this.testMode) this.renderer.trackFrame(dt);
      this.renderer.render();
    }
    this.input.clearEdges();
  }

  // ------------------------------------------------------------------ home screen
  enterHome() {
    document.getElementById('results').hidden = true;
    this.endless = false;
    this.setEndlessWorld(false);
    this.setupMatch(this.settings.mode, this.settings.difficulty);
    this.enterState('home');
    this.previewCar();
    this.onHomePage(this.home.page);
    if (this.audio.ready) this.audio.silenceEngines();
  }

  // The showroom car for the home screen, in the chosen car, accent and preview team.
  previewCar() {
    const lo = this.account.loadout;
    const d = DESIGNS[lo.car] || DESIGNS.strider;
    const look = this.cosmetics(lo, this.previewTeam);
    const model = new CarModel(d, { team: this.previewTeam, number: 7, accent: this.accentHex(), hitbox: CONFIG.hitboxes[d.hitbox], paint: look.paint, finish: look.finish, decal: look.decal });
    this.showroom.setCar(model);
    this.showroom.setTeamColor(CONFIG.teams[this.previewTeam].light);
  }

  onHomePage(page) {
    if (this.state !== 'home') return;
    if (page !== 'garage' && page !== 'drops') this.anthems.stop(0.4);
    this.explPreview = null;
    this.home.el.classList.remove('previewing');
    if (page === 'arenas') {
      // Arenas page: wide orbit of the arena itself.
      this.showroom.setStage('arena', this.renderer.scene, HOME_SPOT);
      this.renderer.setView(this.renderer.scene, this.renderer.camera);
      this.applyViewLook(false);
    } else if (page === 'garage') {
      // Garage: the car alone in the studio.
      this.showroom.setStage('studio');
      this.renderer.setView(this.showroom.scene, this.showroom.camera);
      this.applyViewLook(true);
    } else {
      // Main screen and other menus: the car on a platform out on the pitch of the chosen arena.
      this.showroom.setStage('arena', this.renderer.scene, HOME_SPOT);
      this.renderer.setView(this.renderer.scene, this.showroom.camera);
      this.applyViewLook(false);
    }
    this.placeHomeBall();
  }

  // The ball rests behind the car as part of the home scene.
  placeHomeBall() {
    const b = this.sim.ball;
    // Far behind the car, a little to its right as the home camera sees it.
    b.place(new THREE.Vector3(HOME_SPOT.x - 6.0, b.radius, HOME_SPOT.z - 11.0));
    b.readState();
    this.prevBallPos?.copy(b.pos);
    this.prevBallQuat?.copy(b.quat);
  }

  // The record kept before accounts existed, moved into the first guest save.
  legacyProfile() {
    const p = this.settings.profile;
    const lo = { car: this.settings.car, accent: this.settings.accent, explosion: this.settings.explosion };
    return p ? { ...p, loadout: lo } : { loadout: lo };
  }

  profile() {
    return this.account.data;
  }

  // After logging in or picking guest: rebuild the cars with the account's items.
  onLogin() {
    this.setupMatch(this.settings.mode, this.settings.difficulty);
    if (this.state === 'home') {
      this.previewCar();
      this.onHomePage(this.home.page);
    }
    this.home.refresh();
  }

  // Short message at the top of the screen (controller connected...).
  toast(text) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  // Garage / drop reveal: listen to an anthem.
  previewAnthem(id) {
    this.audio.init();
    this.anthems.play(id);
  }

  anthemName(id) {
    if (!id || id === 'none') return '';
    if (id.startsWith('custom:')) return this.uploads.name(id) || '';
    return anthemSpec(id)?.name || '';
  }

  // Your goal: play your anthem and show its name in the corner.
  async playGoalAnthem() {
    const id = this.account.loadout.anthem;
    if (!id || id === 'none') return;
    if (id.startsWith('custom:') && !this.uploads.loaded) await this.uploads.load();
    const started = await this.anthems.play(id);
    if (!started || (this.state !== 'goal' && this.state !== 'replay')) return;
    const tag = document.getElementById('anthemTag');
    document.getElementById('anthemName').textContent = this.anthemName(id) || 'Your anthem';
    tag.hidden = false;
    tag.classList.remove('show');
    void tag.offsetWidth;
    tag.classList.add('show');
    clearTimeout(this.anthemTagTimer);
    this.anthemTagTimer = setTimeout(() => { tag.hidden = true; }, 6000);
  }

  stopGoalAnthem(fade) {
    this.anthems.stop(fade);
    clearTimeout(this.anthemTagTimer);
    const tag = document.getElementById('anthemTag');
    if (tag) tag.hidden = true;
  }

  showLogin() {
    this.account.logout();
    this.login.show();
  }

  // Equip an owned item (or an accent) and update what is on screen.
  equip(slot, id) {
    if (!this.account.equip(slot, id)) return;
    if (['car', 'accent', 'paint', 'finish', 'decal', 'boost'].includes(slot)) {
      this.previewCar();
      if (this.player && this.state === 'home') this.setupMatch(this.settings.mode, this.settings.difficulty);
    }
    if (slot === 'ball') {
      this.ballModel.setSkin(id);
      this.showroom.setBall(this.home.page === 'garage' && this.home.gtab === 'ball' ? id : null);
    }
    if (slot === 'explosion' && this.player) this.player.explosion = id;
    this.home.refresh();
  }

  openDrop() {
    return this.account.openDrop();
  }

  // Cosmetics for a car model from a loadout (player) for a team.
  cosmetics(lo, team) {
    const paint = item('paint', lo.paint);
    return {
      paint: paint?.colors ? paint.colors[team] : null,
      finish: item('finish', lo.finish),
      decal: lo.decal,
      boost: item('boost', lo.boost),
    };
  }

  // Garage tabs: show the boost flames or the ball next to the car.
  onGarageTab(tab) {
    const lo = this.account.loadout;
    if (tab === 'anthem') this.uploads.load();
    else this.anthems.stop(0.3);
    this.showroom.setBoost(tab === 'boost' ? item('boost', lo.boost) : null);
    this.showroom.setBall(tab === 'ball' ? lo.ball : null);
  }

  // Quest progress for the player; shows a popup for each finished quest.
  quest(type, n = 1) {
    if (this.state !== 'play' && this.state !== 'goal') return;
    const done = this.account.event(type, n, { free: this.mode === 'free' });
    for (const q of done) {
      this.hud.popup(`QUEST DONE: ${q.text.toUpperCase()}`);
      this.hud.feed([{ name: 'QUEST', team: 0 }, `+${q.drops} DROP${q.drops > 1 ? 'S' : ''}`]);
      this.audio.play('padBig');
    }
  }

  startQuickMatch() {
    this.endless = false;
    if (this.settings.mode === 'free') this.settings.mode = this.settings.teamMode || '1v1';
    this.startMatch();
  }

  startFreePlay() {
    this.settings.mode = 'free';
    this.endless = false;
    this.startMatch();
  }

  // Sky Field: free play on a floor that never ends, unlimited boost on.
  startEndless() {
    this.settings.mode = 'free';
    this.endless = true;
    if (!this.endlessOn) this.boostBeforeEndless = !!this.infiniteBoost;
    this.infiniteBoost = true;
    this.startMatch();
  }

  // Goal replay: the scorer's banner card (name, title, icon, banner, level) at the bottom.
  showReplayCard(on) {
    const box = document.getElementById('replayCard');
    if (!box) return;
    box.textContent = '';
    box.hidden = true;
    const gi = this.goalInfo;
    if (!on || !gi) return;
    const sp = gi.scorer;
    const label = document.createElement('span');
    label.className = 'replay-card-label';
    label.textContent = sp ? 'Goal by' : `${CONFIG.teams[gi.team].name} goal`;
    box.appendChild(label);
    if (sp) {
      const lo = this.account.loadout;
      const look = sp.isPlayer
        ? { name: sp.name, title: lo.title, icon: lo.icon, banner: lo.banner, level: this.account.level(), badge: this.account.mode === 'online' ? this.account.badge : null }
        : sp.card || { name: sp.name, title: null, icon: 'ball', banner: 'default', level: null };
      const card = bannerCard({ ...look, sub: `${gi.speedKmh} KM/H${sp.card || sp.isPlayer ? '' : ' · BOT'}` }, `replay ${sp.team ? 'orange' : 'blue'}`);
      box.appendChild(card);
    }
    box.hidden = false;
  }

  // ------------------------------------------------------------------ online
  // Build the cars for an online match from the host's slot list (same order on every page).
  setupNetMatch(slots, mode, isHost) {
    for (const p of this.players) {
      this.sim.removeCar(p.car);
      this.renderer.scene.remove(p.model.root);
      p.model.dispose();
      for (const r of p.ribbons) this.renderer.scene.remove(r.mesh);
      if (this.audio.ready) this.audio.stopEngine(p.car.id);
    }
    this.players = [];
    this.mode = mode;
    this.difficulty = 'medium';
    const lo = this.account.loadout;
    const myCar = DESIGNS[lo.car] && this.account.owns('car', lo.car) ? lo.car : 'strider';
    const boosts = itemsIn('boost');
    let botN = 0;
    let me = null;
    for (const sl of slots) {
      const number = (sl.team === 0 ? 10 : 20) + sl.index;
      if (sl.peer && sl.me) {
        me = this.addPlayer(sl.team, this.account.data.name, true, number, myCar, this.accentHex(), this.cosmetics(lo, sl.team));
        me.slot = sl.index;
        continue;
      }
      let p;
      if (sl.peer) {
        // Another player: their car, paint and boost (checked against the catalog), moved by their page.
        const L = sl.look || {};
        const carId = DESIGNS[L.car] ? L.car : 'strider';
        const pick = (cat, id, def) => (item(cat, id) ? id : def);
        const look = this.cosmetics({ paint: pick('paint', L.paint, 'team'), finish: pick('finish', L.finish, 'gloss'), decal: pick('decal', L.decal, 'default'), boost: pick('boost', L.boost, 'standard') }, sl.team);
        const accent = Number.isFinite(L.acc) ? (L.acc & 0xffffff) : 0xffffff;
        p = this.addPlayer(sl.team, String(sl.name || 'PLAYER').slice(0, 16), false, number, carId, accent, look);
        p.bot = null;
        p.remote = sl.peer;
        p.explosion = EXPLOSION_IDS.includes(L.expl) ? L.expl : 'classic';
        p.anthem = item('anthem', L.anthem) ? L.anthem : null;
        p.card = { name: p.name, title: L.title, icon: L.icon, banner: L.banner, level: Number(L.lvl) || 1 };
      } else {
        // Bot: the host drives it; everyone uses the same name and car for it.
        const name = BOT_NAMES[(botN * 5 + 3) % BOT_NAMES.length];
        const carId = CAR_IDS[(botN * 7 + 2) % CAR_IDS.length];
        botN++;
        p = this.addPlayer(sl.team, name, false, number, carId, 0xffffff, { boost: boosts[botN % boosts.length] });
        p.isBotSlot = true;
        if (!isHost) p.bot = null;
      }
      p.slot = sl.index;
      if (!p.bot) {
        p.car.netDriven = true;
        p.car.infiniteBoost = true;
      }
    }
    this.ballModel?.setSkin(lo.ball);
    this.player = me || this.players[0];
    this.score = [0, 0];
    this.clock = CONFIG.game.matchSeconds;
    this.overtime = false;
    this.matchOver = false;
    this.recorded = false;
    this.zeroSeconds = false;
    this.matchTime = 0;
    this.hud.setScore(0, 0);
  }

  startOnlineMatch(slots, arena, mode, isHost) {
    this.audio.init();
    this.anthems.stop(0.3);
    this.anthems.buffer(this.account.loadout.anthem);
    document.getElementById('results').hidden = true;
    this.endless = false;
    this.setEndlessWorld(false);
    if (CONFIG.arenas.some((a) => a.id === arena)) this.buildArena(arena);
    this.showroom.setStage('studio');
    this.renderer.setView(this.renderer.scene, this.renderer.camera);
    this.applyViewLook(false);
    this.infiniteBoost = false;
    this.np = new NetPlay(this, this.online, isHost);
    this.setupNetMatch(slots, mode, isHost);
    document.body.classList.add('online-match');
    if (isHost) {
      this.startKickoffCountdown();
    } else {
      // Wait at our spawn for the host's first update.
      this.kickoffSetup();
      this.enterState('countdown');
    }
    this.toast(isHost ? 'Online match: you are the host' : 'Online match started');
  }

  netOutgoing() {
    return this.np ? this.np.outgoing() : null;
  }

  onHostSnapshot(s, at) {
    if (this.np && this.np.client) this.np.hostSnapshot(s, at);
  }

  onPeerCar(peer, presence, at) {
    if (this.np) this.np.peerCar(peer, presence, at);
  }

  // Host: a player left mid-match; a bot takes over their car.
  onOnlinePeerLeft(peer) {
    if (!this.np || !this.np.isHost) return;
    const p = this.players.find((x) => x.remote === peer);
    if (!p) return;
    p.remote = null;
    p.car.netDriven = false;
    p.car.infiniteBoost = false;
    if (p.car.isDemoed) p.car.demoRespawnTimer = Math.min(p.car.demoRespawnTimer, 1);
    p.bot = new Bot(p.car, this, 'medium');
    this.hud.feed([{ name: p.name, team: p.team }, 'LEFT, A BOT TOOK OVER']);
  }

  // The online match is over for us (we left, or the host left): back to the online page.
  onOnlineEnded() {
    if (!this.np) return;
    this.np = null;
    document.body.classList.remove('online-match');
    this.setPaused(false);
    this.enterHome();
    this.home.setPage('online');
  }

  leaveOnlineMatch() {
    if (this.online.match) this.online.leave();
    else this.onOnlineEnded();
  }

  onRemoteDemo(p) {
    p.model.root.visible = false;
    for (const f of p.flames) f.visible = false;
    this.effects.demolition(p.car.pos.clone(), p.car.vel.clone(), new THREE.Color(CONFIG.teams[p.team].color));
    this.audio.play('demo', this.panFor(p.car.pos));
    if (this.audio.ready) this.audio.stopEngine(p.car.id);
    const by = this.players[p.demoBy];
    this.hud.feed(by ? [{ name: by.name, team: by.team }, 'DEMOLISHED', { name: p.name, team: p.team }] : [{ name: p.name, team: p.team }, 'WAS DEMOLISHED']);
  }

  onRemoteRespawn(p) {
    p.model.root.visible = true;
    p.prevPos.copy(p.car.pos);
    p.prevQuat.copy(p.car.quat);
  }

  // Swap between the stadium and the Sky Field: physics floor, scene, fog, reflections, sound.
  setEndlessWorld(on) {
    if (!!this.endlessOn === on) return;
    this.endlessOn = on;
    this.sim.pw.setEndless(on);
    this.sim.padsEnabled = !on;
    setFlatFloor(on);
    const scene = this.renderer.scene;
    if (on) {
      if (!this.skyField) {
        this.skyField = new SkyField(this.renderer.renderer, this.renderer.quality);
        this.skyField.sun.castShadow = this.renderer.quality.shadows;
      }
      this.skyField.offset.set(0, 0);
      scene.add(this.skyField.group);
      this.stadium.group.visible = false;
      this.padVis.group.visible = false;
      scene.environment = this.skyField.envMap;
      scene.fog = this.skyField.fog;
      this.savedLook = { exposure: this.arenaExposure, bloom: this.arenaBloom };
      this.arenaExposure = 1.0;
      this.arenaBloom = { strength: 0.3, threshold: 0.92 };
      if (this.audio.ready) this.audio.crowdGain.gain.setTargetAtTime(0, this.audio.ctx.currentTime, 0.3);
    } else {
      if (this.skyField) scene.remove(this.skyField.group);
      this.stadium.group.visible = true;
      this.padVis.group.visible = true;
      scene.environment = this.stadium.envMap;
      const T = this.stadium.theme;
      scene.fog = new THREE.FogExp2(T.fog.color, T.fog.density);
      if (this.savedLook) {
        this.arenaExposure = this.savedLook.exposure;
        this.arenaBloom = this.savedLook.bloom;
      }
      if (this.audio.ready) this.audio.crowdGain.gain.setTargetAtTime(0.045, this.audio.ctx.currentTime, 0.3);
      this.infiniteBoost = !!this.boostBeforeEndless; // Training keeps its own unlimited-boost choice
    }
    document.body.classList.toggle('endless', on);
    this.applyViewLook(false);
  }

  // Sky Field start: car in the middle facing +x, ball 12 m ahead.
  endlessKickoff() {
    const car = this.player.car;
    car.place(rl(0, 0, CONFIG.car.spawnRestZ), 0, CONFIG.boost.max);
    car.infiniteBoost = !!this.infiniteBoost;
    this.sim.ball.place(new THREE.Vector3(12, this.sim.ball.radius + 0.0001, 0));
    this.skyField.offset.set(0, 0);
    this.sim.pw.syncQueries();
    car.readState();
    this.sim.ball.readState();
    this.player.prevPos.copy(car.pos);
    this.player.prevQuat.copy(car.quat);
    this.prevBallPos.copy(this.sim.ball.pos);
    this.prevBallQuat.copy(this.sim.ball.quat);
  }

  // Floating origin: when the car is more than 1 km out, move car, ball and camera back by whole
  // kilometers. The floor pattern repeats every kilometer, so the jump is invisible, and positions
  // never grow large enough for 32-bit float wobble. Also fetches the ball when it is lost.
  endlessTick() {
    const car = this.player.car;
    const ball = this.sim.ball;
    if (ball.pos.y < -10 || v0.subVectors(ball.pos, car.pos).setY(0).length() > 1200) {
      const ahead = v1.set(car.fwd.x, 0, car.fwd.z);
      if (ahead.lengthSq() < 1e-4) ahead.set(1, 0, 0);
      ahead.normalize();
      ball.place(v0.copy(car.pos).setY(Math.max(car.pos.y, 0) + 3).addScaledVector(ahead, 10));
      this.prevBallPos.copy(ball.pos);
      this.hud.popup('BALL RETURNED');
    }
    const P = PATTERN_PERIOD;
    const sx = Math.abs(car.pos.x) > P ? Math.sign(car.pos.x) * P * Math.floor(Math.abs(car.pos.x) / P) : 0;
    const sz = Math.abs(car.pos.z) > P ? Math.sign(car.pos.z) * P * Math.floor(Math.abs(car.pos.z) / P) : 0;
    if (!sx && !sz) return;
    const d = new THREE.Vector3(sx, 0, sz);
    const move = (body) => {
      const t = body.translation();
      body.setTranslation({ x: t.x - sx, y: t.y, z: t.z - sz }, true);
    };
    for (const p of this.players) {
      move(p.car.body);
      p.car.readState();
      p.prevPos.sub(d);
      p.renderPos.sub(d);
      for (const r of p.ribbons) for (const q of r.pts) q.sub(d);
    }
    move(ball.body);
    ball.readState();
    this.prevBallPos.sub(d);
    this.sim.ballSnapPos.sub(d);
    this.cameraRig.shift(d);
    this.effects.clear();
    this.replay.clear();
    this.skyField.offset.x += sx;
    this.skyField.offset.y += sz;
    this.sim.pw.syncQueries();
  }

  // Distance from the start point, for the scoreboard.
  endlessDistance() {
    const c = this.player.car.pos;
    return Math.hypot(this.skyField.offset.x + c.x, this.skyField.offset.y + c.z);
  }

  // Exposure and glow follow what is on screen: the studio look for the showroom, the arena's own otherwise.
  applyViewLook(showroom) {
    const r = this.renderer;
    if (showroom) {
      r.renderer.toneMappingExposure = 1.0;
      r.setBloom(0.5, 0.85);
    } else {
      r.renderer.toneMappingExposure = this.arenaExposure ?? 1;
      const b = this.arenaBloom || { strength: 0.55, threshold: 0.82 };
      r.setBloom(b.strength, b.threshold);
    }
  }

  selectCar(id) {
    this.equip('car', id);
  }

  selectExplosion(id) {
    this.equip('explosion', id);
    this.previewExplosion(id);
  }

  // Show a goal explosion in the arena from a camera on the field, then go back to the menu view.
  previewExplosion(id) {
    if (this.state !== 'home') return;
    const team = this.previewTeam;
    const z = team === 0 ? 51.0 : -51.0; // the goal this team scores into
    this.effects.clear();
    // Aimed left of the goal so the blast sits in the right half, clear of the garage panel.
    // (Looking toward +z, screen right is -x, hence the sign.)
    const sx = Math.sign(z);
    this.explPreview = { t: 0, cam: new THREE.Vector3(3 * sx, 4.5, z * 0.6), target: new THREE.Vector3(0, 5, z) };
    // Fade the menus so the blast is visible; they come back when the preview ends.
    this.home.el.classList.add('previewing');
    this.cameraRig.snap();
    this.renderer.setView(this.renderer.scene, this.renderer.camera);
    this.applyViewLook(false);
    this.effects.goalExplosion(new THREE.Vector3(0, 1.6, z - Math.sign(z) * 0.3), CONFIG.teams[team].color, false, id);
  }

  selectAccent(id) {
    this.equip('accent', id);
  }

  selectArena(id) {
    this.settings.arena = id;
    saveSettings(this.settings);
    this.buildArena(id);
    this.home.refresh();
  }

  // Build (or rebuild) the stadium for an arena theme and apply its fog, exposure and reflections.
  buildArena(id) {
    const scene = this.renderer.scene;
    if (this.stadium) {
      if (this.stadium.arenaId === id) return;
      scene.remove(this.stadium.group);
      this.stadium.dispose();
    }
    this.stadium = new Stadium(this.renderer.renderer, this.sim.pw, this.renderer.quality, id);
    scene.add(this.stadium.group);
    scene.environment = this.stadium.envMap;
    const T = this.stadium.theme;
    scene.fog = new THREE.FogExp2(T.fog.color, T.fog.density);
    this.arenaExposure = T.exposure;
    this.arenaBloom = T.bloom || { strength: 0.55, threshold: 0.82 };
    this.applyViewLook(!!this.showroom && this.renderer.view.scene === this.showroom.scene);
    this.renderer.onQualityChange?.(this.renderer.quality);
    this.lastJumbo = null;
    if (this.score) this.stadium.drawJumbo({ blue: this.score[0], orange: this.score[1], clock: this.formatClock?.() ?? '5:00', banner: '' });
  }

  startMatch() {
    this.audio.init();
    this.anthems.stop(0.3);
    this.anthems.buffer(this.account.loadout.anthem); // render it now so it starts on time at the first goal
    this.showroom.setStage('studio');
    if (this.settings.mode !== 'free') this.settings.teamMode = this.settings.mode;
    this.renderer.setView(this.renderer.scene, this.renderer.camera);
    this.applyViewLook(false);
    this.setEndlessWorld(!!this.endless);
    this.setupMatch(this.settings.mode, this.settings.difficulty);
    this.startKickoffCountdown();
  }

  autoStartQuality() {
    return this.weakDevice ? 'low' : 'medium';
  }

  // One place for graphics changes from the start screen or the pause menu.
  setGraphics(name) {
    this.settings.quality = name;
    this.renderer.autoQuality = name === 'auto';
    this.renderer.dynamicScale = 1;
    this.renderer.setQuality(name === 'auto' ? this.autoStartQuality() : name);
    saveSettings(this.settings);
  }

  updateGraphicsUi() {
    const chosen = this.settings.quality;
    document.querySelectorAll('#gfxGroup button').forEach((b) => b.classList.toggle('on', b.dataset.q === chosen));
    const sel = document.getElementById('setQuality');
    if (sel) sel.value = chosen;
    const note = document.getElementById('gfxNote');
    if (note) {
      const names = { lowest: 'Lowest', low: 'Low', medium: 'Medium', high: 'High' };
      note.textContent = chosen === 'auto' ? `using ${names[this.renderer.qualityName]}` : '';
    }
  }

  toggleFullscreen() {
    // Optional: some embeds refuse fullscreen, which is fine.
    try {
      if (document.fullscreenElement) document.exitFullscreen?.()?.catch?.(() => {});
      else document.documentElement.requestFullscreen?.()?.catch?.(() => {});
    } catch {
      /* not allowed here */
    }
  }

  handleGlobalKeys() {
    const inp = this.input;
    if (inp.consumeAction('fullscreen')) this.toggleFullscreen();
    if (this.login?.visible) {
      inp.clearEdges();
      return;
    }
    if (!document.getElementById('reveal').hidden) {
      if (inp.consume('Escape')) this.home.closeReveal();
      inp.clearEdges();
      return;
    }
    if (this.state === 'home' && !this.paused && inp.consumePad('start')) {
      this.startMatch();
      return;
    }
    if (this.state === 'home' && !this.paused && inp.consume('Escape')) {
      if (this.home.page !== 'main') this.home.setPage('main');
      return;
    }
    if (inp.consume('Escape') || inp.consumeAction('pause') || inp.consumePad('start')) {
      if (!document.getElementById('results').hidden) return;
      this.setPaused(!this.paused);
    }
    if (this.paused) return;
    if (this.state === 'home') {
      // Cross / A presses the highlighted menu button (PadNav); Options / Start kicks off.
      if (inp.consume('Enter') || inp.consumePad('start')) this.startMatch();
      return;
    }
    if (inp.consumeAction('ballCam') || inp.consumePad('y')) {
      this.cameraRig.ballCam = !this.cameraRig.ballCam;
      this.audio.play('click');
    }
    if (inp.consumeAction('unlimited')) {
      this.infiniteBoost = !this.infiniteBoost;
      this.player.car.infiniteBoost = this.infiniteBoost;
      this.hud.popup(this.infiniteBoost ? 'UNLIMITED BOOST ON' : 'UNLIMITED BOOST OFF');
      this.audio.play('click');
    }
    if (this.mode === 'free' && this.state === 'play') {
      for (let k = 1; k <= 4; k++) if (inp.consumeAction(`practice${k}`)) this.practiceBall(k);
    }
    if ((inp.consumeAction('reset') || inp.consumePad('back')) && !this.np && (this.state === 'play' || this.state === 'goal')) {
      if (this.mode === 'free') {
        this.kickoffSetup();
        this.enterState('play');
        this.sim.freezeCars = false;
      } else {
        this.sim.respawnCar(this.player.car);
        this.player.car.infiniteBoost = !!this.infiniteBoost;
        this.player.prevPos.copy(this.player.car.pos);
        this.player.prevQuat.copy(this.player.car.quat);
        this.sim.pw.syncQueries();
      }
    }
    if (this.state === 'replay' && !(this.np && this.np.client) && this.stateTime > 0.4 && (inp.consume('Space') || inp.consumeAction('jump') || inp.consume('Enter') || inp.consumePad('a'))) {
      this.finishReplay();
    }
  }

  // Free play training shots (keys 1-4 by default).
  // 1: ball on the car's roof, moving with the car. 2: ball resting just in front of the bumper.
  // 3: ball shot at the car from about 20 m, timed to reach it in 1.1-2 s. 4: ball launched straight up.
  practiceBall(kind) {
    const car = this.player.car;
    const ball = this.sim.ball;
    if (car.isDemoed) return;
    // The goal replay starts from this shot, not from before the ball jumped.
    this.replay.clear();
    const rad = ball.radius;
    const he = car.halfExtents;
    const ho = car.hitboxOffset;
    const pos = new THREE.Vector3();
    const vel = new THREE.Vector3();
    const toWorld = (x, y, z) => pos.set(x, y, z).applyQuaternion(car.quat).add(car.pos);
    let label = '';
    if (kind === 1) {
      toWorld(ho.x + 0.1, ho.y + he.y + rad + 0.03, 0);
      vel.copy(car.vel);
      label = 'BALL ON HOOD';
    } else if (kind === 2) {
      // The car's origin rides about 0.17 m above the surface, so this puts the ball on the surface.
      toWorld(ho.x + he.x + rad + 0.3, rad - 0.17, 0);
      label = 'BALL IN FRONT';
    } else if (kind === 3) {
      const T = 1.5;
      const g = CONFIG.physics.gravityZ * UU;
      const target = car.pos.clone().addScaledVector(car.vel, T);
      target.y = Math.max(car.pos.y, 0.17) + 0.9;
      // Start ~20 m ahead of the car (or toward the middle if a wall is close), 2-4 m up.
      const dir = new THREE.Vector3(car.fwd.x, 0, car.fwd.z);
      if (dir.lengthSq() < 0.01) dir.set(-car.pos.x, 0, -car.pos.z);
      dir.normalize();
      const inside = (p) => p.set(clamp(p.x, -36, 36), clamp(p.y, 2, 12), clamp(p.z, -46, 46));
      inside(pos.copy(car.pos).addScaledVector(dir, 20).setY(car.pos.y + 3));
      if (Math.hypot(pos.x - car.pos.x, pos.z - car.pos.z) < 12) {
        dir.set(-car.pos.x, 0, -car.pos.z);
        if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
        inside(pos.copy(car.pos).addScaledVector(dir.normalize(), 20).setY(car.pos.y + 3));
      }
      // Ballistic: p + v T + g T^2 / 2 = target.
      vel.subVectors(target, pos).divideScalar(T);
      vel.y -= 0.5 * g * T;
      label = 'INCOMING';
    } else {
      pos.copy(ball.pos);
      pos.y = clamp(pos.y, rad, 6);
      vel.set(0, 12, 0);
      label = 'BALL UP';
    }
    // Keep it inside the field.
    pos.x = clamp(pos.x, -40.9 + rad, 40.9 - rad);
    pos.z = clamp(pos.z, -51.1 + rad, 51.1 - rad);
    pos.y = clamp(pos.y, rad, CONFIG.arena.height * UU - rad);
    ball.place(pos, vel);
    ball.readState();
    this.sim.pw.syncQueries();
    this.prevBallPos.copy(ball.pos);
    this.prevBallQuat.copy(ball.quat);
    this.ballTrail?.clear?.();
    this.hud.popup(label);
    this.audio.play('click');
  }

  // One physics tick.
  tick() {
    const kickoff = this.state === 'play' && !this.kickoffTouched;
    const playing = this.state === 'play';
    for (const p of this.players) {
      if (p.bot) {
        if (playing) p.bot.think(TICK, kickoff);
        else p.car.controls.reset();
      }
      p.prevPos.copy(p.car.pos);
      p.prevQuat.copy(p.car.quat);
    }
    if (this.state === 'goal' && this.player.car.controls) {
      // After a goal everyone can still drive around until the replay.
    }
    this.prevBallPos.copy(this.sim.ball.pos);
    this.prevBallQuat.copy(this.sim.ball.quat);
    this.sim.goalDetection = playing && !this.endlessOn && !(this.np && this.np.client);
    if (this.np) this.np.beforeStep();
    this.sim.step();
    if (this.endlessOn && this.player) this.endlessTick();
    this.simTime += TICK;
    this.handleEvents();
    if (playing) this.matchTick();
    if (this.state !== 'home') this.replay.record(TICK, this.simTime, this.sim);
  }

  matchTick() {
    if (this.mode === 'free') return;
    if (this.np && this.np.client) return; // the host keeps the clock
    // The clock starts on the first touch after kickoff, like the original.
    if (this.kickoffTouched) {
      if (this.overtime) this.clock += TICK;
      else if (this.clock > 0) {
        this.clock -= TICK;
        if (this.clock <= 0) {
          this.clock = 0;
          this.zeroSeconds = true;
        }
      }
    }
    // At 0:00 play continues until the ball touches the ground.
    if (this.zeroSeconds && !this.overtime) {
      const b = this.sim.ball;
      if (b.pos.y <= b.radius + 0.05) this.endRegulation();
    }
    // Threat tracking for saves: which goal the ball is heading into right now.
    if (this.sim.tick % 6 === 0) {
      const path = predictBall(this.sim.ball.pos, this.sim.ball.vel, 2.5, 1 / 30);
      this.ballThreat = goalBound(path);
      this.threatSpeed = this.sim.ball.vel.length();
    }
  }

  endRegulation() {
    this.zeroSeconds = false;
    if (this.score[0] === this.score[1]) {
      this.overtime = true;
      this.clock = 0;
      this.hud.banner('OVERTIME', 'NEXT GOAL WINS', '#c89b2a', 2.4);
      this.audio.play('whistle');
      this.kickoffSetup();
      this.enterState('countdown');
    } else {
      this.matchOver = true;
      this.audio.play('whistle');
      const w = this.score[0] > this.score[1] ? 0 : 1;
      this.hud.banner(`${CONFIG.teams[w].name} WINS`, `${this.score[0]} - ${this.score[1]}`, CONFIG.teams[w].css, 3);
      this.enterState('ended');
    }
  }

  // ------------------------------------------------------------------ events
  playerById(id) {
    return this.players.find((p) => p.car.id === id);
  }

  panFor(pos) {
    const cam = this.renderer.camera;
    v0.subVectors(pos, cam.position);
    const right = v1.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const d = v0.length();
    return { pan: clamp(v0.dot(right) / Math.max(1, d), -1, 1) * 0.8, volume: clamp(1.4 - d / 45, 0.15, 1) };
  }

  handleEvents() {
    for (const e of this.sim.events) {
      const p = e.carId !== undefined ? this.playerById(e.carId) : null;
      switch (e.type) {
        case 'ballHit': {
          const ball = this.sim.ball;
          const n = v0.subVectors(ball.pos, p.car.pos).normalize();
          const contact = v1.copy(ball.pos).addScaledVector(n, -ball.radius);
          this.effects.ballHit(contact, n, e.strength);
          this.ballModel.hit(Math.min(1, e.strength / 2500));
          const s = this.panFor(contact);
          this.audio.play('ballHit', { strength: e.strength, pan: s.pan, volume: s.volume });
          this.onTouch(p, e);
          p.bot?.onTouch();
          if (p.isPlayer) {
            if (this.np) this.np.myTouch();
            const k = Math.min(1, e.strength / 2500);
            this.input.rumble(0.15 + 0.6 * k, 0.4 + 0.4 * k, 70 + 90 * k);
            this.quest('touches');
            if (!p.car.isOnGround && ball.pos.y > 2.5) this.quest('aerials');
          }
          break;
        }
        case 'ballBounce': {
          if (e.strength > 3) {
            const s = this.panFor(this.sim.ball.pos);
            this.audio.play('bounce', { strength: e.strength, pan: s.pan, volume: s.volume });
          }
          break;
        }
        case 'pad': {
          const pad = this.sim.pads[e.pad];
          this.effects.padPickup(v0.set(pad.pos.x, 0.2, pad.pos.z), e.big);
          if (p.isPlayer) {
            this.audio.play(e.big ? 'padBig' : 'pad');
            this.quest('pads');
          }
          break;
        }
        case 'jump':
        case 'doubleJump': {
          if (p.isPlayer || this.panFor(p.car.pos).volume > 0.5) this.audio.play('jump', { ...this.panFor(p.car.pos), volume: p.isPlayer ? 1 : 0.4 });
          if (e.type === 'jump' && p.car.up.y > 0.8) this.effects.dust(v0.copy(p.car.pos).setY(0.05), 5, 0.5);
          break;
        }
        case 'flip':
          if (p.isPlayer) this.audio.play('flip');
          break;
        case 'flipReset':
          if (p.car.pos.distanceTo(this.sim.ball.pos) < this.sim.ball.radius + 2.5) {
            // A little light out of the ball where the wheels touched it (shown for everyone's resets;
            // a reset off another car's roof gets no light).
            const ballPos = this.sim.ball.pos;
            const contact = v0.subVectors(p.car.pos, ballPos).normalize().multiplyScalar(this.sim.ball.radius).add(ballPos);
            this.effects.flipReset(ballPos.clone(), contact.clone(), () => (this.ballHidden ? null : this.ballModel.root.position));
          }
          if (p.isPlayer) {
            this.audio.play('flipReset');
            this.hud.popup('FLIP RESET');
            this.input.rumble(0.2, 0.6, 60);
            this.quest('flipreset');
          }
          break;
        case 'land':
          if (e.speed > 3) {
            if (p.isPlayer) this.audio.play('land', { strength: e.speed });
            if (p.car.pos.y < 1) this.effects.dust(v0.copy(p.car.pos).setY(0.05), Math.min(14, 3 + e.speed), 0.7);
          }
          break;
        case 'bump': {
          const s = this.panFor(e.pos);
          this.audio.play('bump', s);
          this.effects.sparks(e.pos, v1.set(0, 1, 0), 25, 8);
          break;
        }
        case 'demo': {
          const victim = this.playerById(e.victimId);
          victim.model.root.visible = false;
          for (const f of victim.flames) f.visible = false;
          this.effects.demolition(e.pos, e.vel, new THREE.Color(CONFIG.teams[victim.team].color));
          const s = this.panFor(e.pos);
          this.audio.play('demo', s);
          if (this.audio.ready) this.audio.stopEngine(victim.car.id);
          this.hud.feed([{ name: p.name, team: p.team }, 'DEMOLISHED', { name: victim.name, team: victim.team }]);
          this.award(p, 'DEMOLITION', 25, 'demos');
          if (victim.isPlayer) {
            this.input.rumble(1, 1, 450);
            if (this.np) this.np.myDemo(this.players.indexOf(p));
          }
          else if (p.isPlayer) this.input.rumble(0.6, 0.5, 220);
          break;
        }
        case 'respawn':
          if (p) {
            p.model.root.visible = true;
            p.prevPos.copy(p.car.pos);
            p.prevQuat.copy(p.car.quat);
            this.effects.flash(p.car.pos, 3, 0.3, new THREE.Color(CONFIG.teams[p.team].light));
          }
          break;
        case 'goal':
          this.onGoal(e.team);
          break;
        default:
          break;
      }
    }
  }

  award(p, label, points, stat) {
    if (!p) return;
    p.stats.score += points;
    if (stat) p.stats[stat] += 1;
    if (p.isPlayer) {
      this.hud.popup(label, points);
      if (stat) this.quest(stat);
    }
  }

  onTouch(p, e) {
    if (!p || this.state !== 'play') return;
    const ball = this.sim.ball;
    const first = !this.kickoffTouched;
    if (first) this.kickoffTouched = true;
    const now = this.simTime;
    const prev = this.touches[this.touches.length - 1];
    this.touches.push({ id: p.car.id, team: p.team, t: now, z: ball.pos.z });
    if (first && this.mode !== 'free') this.award(p, 'FIRST TOUCH', 10);
    if (this.touches.length > 20) this.touches.shift();
    if (this.endlessOn) {
      // No goals out here: only aerial hits count.
      if (!(prev && prev.id === p.car.id && now - prev.t < 0.25) && !p.car.isOnGround && ball.pos.y > 3 && e.strength > 400) this.award(p, 'AERIAL HIT', 20);
      return;
    }
    if (prev && prev.id === p.car.id && now - prev.t < 0.25) return; // same continued touch
    const ownGoal = p.team; // team 0 defends goal 0
    // Save: the ball was heading into our goal and now it is not.
    const path = predictBall(ball.pos, ball.vel, 3, 1 / 30);
    const bound = goalBound(path);
    if (this.ballThreat === ownGoal && bound !== ownGoal) {
      // Epic save: the ball was close to the line and moving fast toward it.
      const toLine = CONFIG.arena.extentY * UU - Math.abs(ball.pos.z);
      const epic = toLine < 9 && this.threatSpeed > 20;
      this.award(p, epic ? 'EPIC SAVE' : 'SAVE', epic ? 75 : 50, 'saves');
      this.hud.feed([{ name: p.name, team: p.team }, epic ? 'EPIC SAVE' : 'SAVE']);
    } else if (bound === 1 - p.team && e.strength > 300) {
      this.award(p, 'SHOT ON GOAL', 20, 'shots');
    } else if (!p.car.isOnGround && ball.pos.y > 3 && e.strength > 400) {
      this.award(p, 'AERIAL HIT', 20);
    } else if (Math.sign(ball.pos.z) === (p.team === 0 ? -1 : 1) && Math.abs(ball.pos.z) > 25 && ball.vel.z * (p.team === 0 ? 1 : -1) > 15) {
      this.award(p, 'CLEAR', 20);
    }
    this.ballThreat = bound;
  }

  // forced: an online goal the host saw ({ scorer, assist: slot indexes or -1, kmh }); the host's
  // score and stats are shown, so nothing is counted here.
  onGoal(team, forced = null) {
    const ball = this.sim.ball;
    if (!forced) this.score[team] += 1;
    this.hud.setScore(this.score[0], this.score[1], team);
    // Scorer: latest toucher on the scoring team; assist: the teammate touch before it within 5 s.
    let scorer = null;
    let assist = null;
    for (let i = this.touches.length - 1; i >= 0; i--) {
      const t = this.touches[i];
      if (t.team === team) {
        if (!scorer) scorer = t;
        else if (t.id !== scorer.id && scorer.t - t.t < 5) {
          assist = t;
          break;
        }
      }
    }
    if (forced) {
      const sPl = this.players[forced.scorer];
      const aPl = this.players[forced.assist];
      scorer = sPl ? { id: sPl.car.id, team, z: 0, t: this.simTime } : null;
      assist = aPl ? { id: aPl.car.id, team, z: 0, t: this.simTime } : null;
    }
    const sp = scorer ? this.playerById(scorer.id) : null;
    const ap = assist ? this.playerById(assist.id) : null;
    const speedKmh = forced && Number.isFinite(forced.kmh) ? forced.kmh : Math.round(ball.vel.length() * 3.6);
    if (this.np && this.np.isHost) this.np.hostGoal(team, sp, ap, speedKmh);
    const tc = CONFIG.teams[team];
    // Own goal only when the defending team touched it last; an untouched ball is just a team goal.
    const last = this.touches[this.touches.length - 1];
    const own = !sp && last && last.team !== team ? this.playerById(last.id) : null;
    let who = tc.name;
    if (sp) {
      this.award(sp, 'GOAL', 100, 'goals');
      this.hud.feed([{ name: sp.name, team: sp.team }, 'SCORED']);
      who = sp.name;
      // Extra accolades.
      if (this.overtime) this.award(sp, 'OVERTIME GOAL', 25);
      if ((team === 0 && scorer.z < -5) || (team === 1 && scorer.z > 5)) this.award(sp, 'LONG GOAL', 20);
      if (sp.stats.goals === 3) {
        this.award(sp, 'HAT TRICK', 25);
        this.hud.feed([{ name: sp.name, team: sp.team }, 'HAT TRICK']);
      }
    } else if (own) {
      this.hud.feed([{ name: own.name, team: own.team }, 'OWN GOAL']);
      who = `OWN GOAL BY ${own.name}`;
    } else {
      this.hud.feed([{ name: tc.name, team }, 'SCORED']);
    }
    if (ap) this.award(ap, 'ASSIST', 50, 'assists');
    this.hud.banner('GOAL', who, tc.css, 3.2, `${speedKmh} KM/H`);
    // Burst at the goal line so the blast spills out of the mouth toward the field.
    const explodePos = ball.pos.clone();
    explodePos.z = Math.sign(explodePos.z) * Math.min(Math.abs(explodePos.z), CONFIG.arena.extentY * 0.01 - 0.3);
    explodePos.y = Math.max(explodePos.y, 1.4);
    const explosion = sp ? sp.explosion : 'classic';
    this.effects.goalExplosion(explodePos, tc.color, true, explosion);
    this.stadium.goalCelebration(team, team === 0 ? 1 : 0);
    // Light the goal mouth and the field in front of it in the team color.
    this.stadium.flashLight.position.copy(explodePos).add(v1.set(0, 3, -Math.sign(explodePos.z) * 3.5));
    this.flashT = 1;
    this.audio.play('goal');
    this.input.rumble(0.7, 0.9, 650);
    if (sp && sp.isPlayer) this.playGoalAnthem();
    else if (sp && sp.anthem && sp.anthem !== 'none' && anthemSpec(sp.anthem)) this.anthems.play(sp.anthem);
    // The blast throws nearby cars away.
    for (const p of this.players) {
      if (p.car.isDemoed) continue;
      const d = v0.subVectors(p.car.pos, explodePos);
      const dist = d.length();
      if (dist < 14) {
        d.normalize();
        d.y = Math.max(d.y, 0.35);
        d.normalize();
        p.car.vel.addScaledVector(d, (14 - dist) * 2.2);
        p.car.body.setLinvel({ x: p.car.vel.x, y: p.car.vel.y, z: p.car.vel.z }, true);
      }
    }
    ball.body.setEnabled(false);
    this.ballHidden = true;
    this.goalInfo = { team, time: this.simTime, pos: explodePos, scorer: sp, speedKmh, explosion };
    this.stadium.drawJumbo({ banner: 'GOAL' });
    if (this.overtime || this.mode === 'free') this.matchOver = this.overtime;
    this.enterState('goal');
  }

  // ------------------------------------------------------------------ state machine
  updateState(dt) {
    switch (this.state) {
      case 'countdown': {
        const step = Math.floor(this.stateTime);
        if (step !== this.countStep) {
          this.countStep = step;
          if (step < 3) {
            this.hud.countdown(String(3 - step));
            this.audio.play('count');
          } else {
            this.hud.countdown('GO!');
            this.audio.play('go');
            this.enterState('play');
            setTimeout(() => this.hud.countdown(null), 900);
          }
        }
        break;
      }
      case 'goal': {
        if (this.np && this.np.client) break; // the host says when the replay starts
        if (this.stateTime > (this.mode === 'free' ? 2.4 : CONFIG.game.goalCelebrationSeconds)) {
          if (this.replay.frames.length > 60) {
            this.enterState('replay');
          } else {
            this.afterGoal();
          }
        }
        break;
      }
      case 'replay': {
        // Real time, with a short slow-motion moment around the goal.
        const toGoal = this.goalInfo.time - this.replayT;
        this.replayT += dt * (toGoal < 0.8 && toGoal > -0.3 ? 0.4 : 1);
        if (this.np && this.np.client) {
          // Hold the last frame until the host's next kickoff.
          this.replayT = Math.min(this.replayT, this.replayEnd + 0.6);
        } else if (this.replayT >= this.replayEnd + 0.6) this.finishReplay();
        break;
      }
      case 'ended':
        break;
      default:
        break;
    }
    // Jumbotron text once per second.
    const clockText = this.mode === 'free' ? 'FREE PLAY' : this.formatClock();
    if (clockText !== this.lastJumbo && this.state !== 'goal' && this.state !== 'replay') {
      this.lastJumbo = clockText;
      this.stadium.drawJumbo({ blue: this.score[0], orange: this.score[1], clock: clockText, banner: '' });
    }
  }

  formatClock() {
    const s = Math.max(0, Math.ceil(this.clock - 1e-6));
    return `${this.overtime ? '+' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  finishReplay() {
    this.hud.replay(false);
    this.afterGoal();
  }

  afterGoal() {
    // Free play: straight back to driving, no countdown.
    if (this.mode === 'free') {
      this.kickoffSetup();
      this.enterState('play');
      this.sim.freezeCars = false;
      return;
    }
    if (this.matchOver || (this.zeroSeconds && !this.overtime) || (this.clock <= 0 && !this.overtime && this.mode !== 'free')) {
      if (this.score[0] === this.score[1]) {
        this.endRegulation();
        return;
      }
      this.matchOver = true;
      const w = this.score[0] > this.score[1] ? 0 : 1;
      this.hud.banner(`${CONFIG.teams[w].name} WINS`, `${this.score[0]} - ${this.score[1]}`, CONFIG.teams[w].css, 3);
      this.kickoffSetup();
      this.enterState('ended');
      return;
    }
    this.kickoffSetup();
    this.enterState('countdown');
  }

  showResults() {
    setTimeout(() => {
      const el = document.getElementById('results');
      const w = this.score[0] > this.score[1] ? 0 : 1;
      document.getElementById('resultTitle').textContent = this.score[0] === this.score[1] ? 'DRAW' : `${CONFIG.teams[w].name} WINS`;
      const scoreEl = document.getElementById('resultScore');
      scoreEl.replaceChildren();
      for (const [cls, text] of [['b', this.score[0]], ['dash', '-'], ['o', this.score[1]]]) {
        const span = document.createElement('span');
        span.className = cls;
        span.textContent = text;
        scoreEl.appendChild(span);
      }
      const winners = this.players.filter((p) => p.team === w);
      const mvp = winners.sort((a, b) => b.stats.score - a.stats.score)[0];
      let reward = null;
      if (this.mode !== 'free' && !this.recorded) {
        this.recorded = true;
        const me = this.player;
        const draw = this.score[0] === this.score[1];
        reward = this.account.recordMatch({
          won: !draw && me.team === w, draw, goals: me.stats.goals, mvp: !draw && mvp === me, score: me.stats.score,
          history: {
            mode: this.mode, online: !!this.np, team: me.team, scoreUs: this.score[me.team], scoreThem: this.score[1 - me.team],
            assists: me.stats.assists, saves: me.stats.saves, shots: me.stats.shots, demos: me.stats.demos, seconds: this.matchTime || 0,
          },
        });
      }
      const rw = document.getElementById('resultReward');
      if (rw) {
        rw.textContent = '';
        if (reward) {
          const parts = [`+${reward.xp} XP`];
          if (reward.levels) parts.push(`LEVEL UP: +${reward.levels} DROP${reward.levels > 1 ? 'S' : ''}`);
          for (const q of reward.quests) parts.push(`QUEST DONE: ${q.text.toUpperCase()} (+${q.drops} DROP${q.drops > 1 ? 'S' : ''})`);
          rw.textContent = parts.join('  ·  ');
        }
      }
      const rows = [...this.players].sort((a, b) => a.team - b.team || b.stats.score - a.stats.score);
      const table = document.getElementById('statsTable');
      table.innerHTML = '';
      const head = table.createTHead().insertRow();
      for (const h of ['PLAYER', 'SCORE', 'GOALS', 'ASSISTS', 'SAVES', 'SHOTS', 'DEMOS']) {
        const th = document.createElement('th');
        th.textContent = h;
        head.appendChild(th);
      }
      const body = table.createTBody();
      for (const p of rows) {
        const tr = body.insertRow();
        tr.className = `${p.team === 0 ? 'blue' : 'orange'}${p.isPlayer ? ' you' : ''}`;
        const name = tr.insertCell();
        name.textContent = p.name;
        if (p === mvp) {
          const m = document.createElement('span');
          m.className = 'mvp';
          m.textContent = 'MVP';
          name.appendChild(m);
        }
        for (const k of ['score', 'goals', 'assists', 'saves', 'shots', 'demos']) tr.insertCell().textContent = p.stats[k];
      }
      el.hidden = false;
    }, 1800);
  }

  roleFor(bot) {
    return teamRole(this.sim.cars, bot.car, this.sim.ball.pos);
  }

  // ------------------------------------------------------------------ visuals
  updateVisuals(dt, alpha) {
    const cam = this.renderer.camera;
    const replaying = this.state === 'replay';
    let sample = null;
    if (replaying) sample = this.replay.sample(this.replayT);

    // Cars.
    for (const p of this.players) {
      const car = p.car;
      let boosting = car.isBoosting;
      let supersonic = car.isSupersonic;
      let demoed = car.isDemoed;
      let susp = null;
      let steer = car.wheels[0].steerAngle;
      let fwdSpeed = car.forwardSpeed;
      let ground = car.numWheelsInContact >= 3;
      let vel = car.vel;
      if (replaying && sample) {
        const a = sample.a.cars.find((c) => c.id === car.id);
        const b = sample.b.cars.find((c) => c.id === car.id) || a;
        if (a) {
          lerpPose(a, b, sample.k, p.renderPos, p.renderQuat);
          boosting = a.boosting;
          supersonic = a.ss;
          demoed = a.demoed;
          susp = a.susp;
          steer = a.steer;
          fwdSpeed = a.fwdSpeed;
          ground = a.ground;
          vel = v1.fromArray(a.v);
        }
      } else {
        p.renderPos.lerpVectors(p.prevPos, car.pos, alpha);
        p.renderQuat.slerpQuaternions(p.prevQuat, car.quat, alpha);
        susp = car.wheels.map((w) => w.suspensionLength);
      }
      p.model.root.visible = !demoed && this.state !== 'home';
      p.model.root.position.copy(p.renderPos);
      p.model.root.quaternion.copy(p.renderQuat);
      p.model.update(dt, { suspension: susp, steer, forwardSpeed: fwdSpeed, onGround: ground });
      // Boost flame and particles.
      const flicker = 0.85 + Math.random() * 0.3;
      for (const f of p.flames) {
        f.visible = boosting && !demoed;
        f.material.uniforms.uTime.value = this.time;
        f.material.uniforms.uPower.value = (supersonic ? 1.25 : 1) * flicker;
      }
      if (!p.nozzleColor) p.nozzleColor = new THREE.Color(CONFIG.teams[p.team].light);
      for (const n of p.model.nozzles) n.inner.material.color.copy(p.nozzleColor).multiplyScalar(boosting ? 3 : 0.3);
      if (boosting && !demoed) {
        const back = v0.set(-1, 0, 0).applyQuaternion(p.renderQuat);
        for (const n of p.model.nozzles) {
          const wp = v1.copy(n.pos).applyQuaternion(p.renderQuat).add(p.renderPos);
          this.effects.boost(wp, back, vel, p.team, dt / 2, supersonic, p.boostItem);
        }
      }
      // Supersonic streaks from the rear corners.
      for (let i = 0; i < 2; i++) {
        const corner = v1.copy(p.model.trailPoints[i]).applyQuaternion(p.renderQuat).add(p.renderPos);
        p.ribbons[i].update(dt, cam.position, supersonic && !demoed, corner);
      }
      if (!replaying && supersonic && !p.wasSupersonic && p.isPlayer) {
        this.audio.play('supersonic');
        this.input.rumble(0, 0.35, 140);
        this.quest('supersonic');
      }
      p.wasSupersonic = supersonic;
      // Body scraping sparks.
      if (!replaying && car.bodyScrapeTick === this.sim.tick - 1 && car.vel.length() > 6 && !car.isDemoed) {
        p.scrapeTimer -= dt;
        if (p.scrapeTimer <= 0) {
          p.scrapeTimer = 0.04;
          const contact = v0.copy(car.pos).addScaledVector(car.worldContact.normal, -0.15);
          this.effects.sparks(contact, car.worldContact.normal, 4, 5);
          if (p.isPlayer && Math.random() < 0.3) this.audio.play('scrape');
        }
      }
      // Engine sound.
      if (this.audio.ready && !replaying) {
        if (demoed || this.state === 'home') this.audio.stopEngine(car.id);
        else {
          const s = this.panFor(p.renderPos);
          this.audio.updateEngine(car.id, {
            speed: car.vel.length(), throttle: car.controls.throttle, boosting, onGround: ground,
            pan: p.isPlayer ? 0 : s.pan, volume: p.isPlayer ? 1 : s.volume * 0.5, supersonic,
          });
        }
      }
    }

    // Ball (dedicated vectors: the camera code below reuses the shared scratch vectors).
    const ballPos = this.renderBallPos || (this.renderBallPos = new THREE.Vector3());
    const ballQuat = this.renderBallQuat || (this.renderBallQuat = new THREE.Quaternion());
    let ballVel = this.sim.ball.vel;
    let ballOn = !this.ballHidden;
    if (replaying && sample) {
      lerpPose(sample.a.ball, sample.b.ball, sample.k, ballPos, ballQuat);
      ballVel = new THREE.Vector3().fromArray(sample.a.ball.v);
      ballOn = sample.a.ball.on && this.replayT < this.goalInfo.time;
      if (!this.replayExploded && this.replayT >= this.goalInfo.time) {
        this.replayExploded = true;
        this.effects.goalExplosion(this.goalInfo.pos, CONFIG.teams[this.goalInfo.team].color, true, this.goalInfo.explosion);
        this.audio.play('demo', { volume: 0.6 });
      }
    } else {
      ballPos.lerpVectors(this.prevBallPos, this.sim.ball.pos, alpha);
      ballQuat.slerpQuaternions(this.prevBallQuat, this.sim.ball.quat, alpha);
    }
    this.ballModel.root.visible = ballOn;
    this.ballModel.marker.visible = ballOn;
    this.ballModel.update(dt, ballPos, ballQuat, 0);
    const bspeed = ballVel.length();
    const fast = ballOn && bspeed > 30;
    this.ballTrail.update(dt, cam.position, fast, ballPos);
    if (fast) this.effects.ballTrail(ballPos, ballVel, clamp((bspeed - 30) / 25, 0, 1));

    // Pads.
    this.padVis.update(dt, this.time, replaying && sample ? sample.a.pads : null);

    // Camera.
    if (this.state === 'home') this.showroom.update(dt);
    this.updateCamera(dt, ballPos, ballOn);
    this.renderer.setHorizontalFov(this.cameraRig.settings.fov);
    this.effects.aspect = this.renderer.camera.aspect;
    this.effects.setViewport(this.renderer.height * this.renderer.renderer.getPixelRatio(), this.renderer.camera.fov);
    this.cameraRig.shake = this.effects.shake;

    // Flash light decay.
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt * 0.9);
      this.stadium.flashLight.intensity = 650 * Math.pow(this.flashT, 1.5);
      this.stadium.flashLight.color.set(CONFIG.teams[this.goalInfo?.team ?? 0].light).lerp(WHITE, 0.45);
    }
    this.effects.update(dt, cam.position);
    if (this.endlessOn) this.skyField.update(this.player.renderPos, cam);
    else {
      if (this.player && this.state !== 'home') this.stadium.setNear(this.player.renderPos, ballOn ? ballPos : null);
      this.stadium.update(dt, this.time, cam);
    }
    this.updateHud(dt);
  }

  updateCamera(dt, ballPos, ballOn) {
    const rig = this.cameraRig;
    const p = this.player;
    if (this.debugCam) {
      // Test hook: fixed camera {pos:[x,y,z], look:[x,y,z]} or {follow:true, offset:[x,y,z]} relative to the player car.
      const d = this.debugCam;
      if (d.follow) {
        const off = v1.fromArray(d.offset).applyQuaternion(p.renderQuat).add(p.renderPos);
        rig.pos.copy(off);
        rig.look.copy(p.renderPos).add(v0.set(0, 0.15, 0));
      } else {
        rig.pos.fromArray(d.pos);
        rig.look.fromArray(d.look);
      }
      rig.up.set(0, 1, 0);
      rig.apply(0);
      return;
    }
    if (this.explPreview && this.state === 'home') {
      const ep = this.explPreview;
      ep.t += dt;
      rig.updateFixed(dt, ep.cam, ep.target, 50);
      if (ep.t > 3.6) {
        this.explPreview = null;
        this.onHomePage(this.home.page);
      }
      return;
    }
    if (this.state === 'home' || this.state === 'ended') {
      rig.updateOrbit(dt, v1.set(0, 1, 0), 34, 9, 0.07);
      return;
    }
    if (this.state === 'replay') {
      const sample = this.replay.sample(this.replayT);
      if (sample) {
        const target = new THREE.Vector3();
        lerpPose(sample.a.ball, sample.b.ball, sample.k, target, new THREE.Quaternion());
        const vel = new THREE.Vector3().fromArray(sample.a.ball.v);
        const toGoal = this.goalInfo.time - this.replayT;
        if (toGoal < 1.3) {
          // Behind-the-goal view for the finish.
          const s = this.goalInfo.team === 0 ? 1 : -1;
          rig.updateFixed(dt, v0.set(this.goalInfo.pos.x * 0.5 + 6, 7, s * 66), target, 3);
        } else {
          rig.updateFollow(dt, target, vel, 10, 3.2);
        }
      }
      return;
    }
    const car = p.car;
    // Render-state view of the player car for smooth camera motion.
    const view = {
      pos: p.renderPos,
      vel: car.vel,
      fwd: v0.set(1, 0, 0).applyQuaternion(p.renderQuat).clone(),
      up: v0.set(0, 1, 0).applyQuaternion(p.renderQuat).clone(),
      numWheelsInContact: car.isDemoed ? 0 : car.numWheelsInContact,
    };
    if (car.isDemoed) {
      // Watch the action from where we were blown up.
      rig.updateFixed(dt, v1.copy(p.renderPos).add(new THREE.Vector3(0, 6, 0)), ballOn ? ballPos : p.renderPos, 2);
      return;
    }
    rig.updatePlay(dt, view, ballOn ? ballPos : null);
  }

  updateHud(dt) {
    const car = this.player.car;
    this.hud.setClock(this.mode === 'free' ? 0 : this.clock, this.overtime);
    if (this.mode === 'free') {
      let text = 'FREE';
      if (this.endlessOn) {
        const m = this.endlessDistance();
        text = m < 1000 ? `${Math.round(m)} M` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} KM`;
      }
      document.getElementById('clock').textContent = text;
    }
    this.hud.setBoost(car.boost, car.infiniteBoost);
    this.hud.setSpeed(car.vel.length(), car.isSupersonic);
    let flip = null;
    if (!car.isOnGround && !car.isDemoed && this.state !== 'replay') {
      if (car.hasFlipReset()) flip = 'reset';
    }
    this.hud.setChips({ ballCam: this.cameraRig.ballCam, flip, fps: this.settings.showFps ? Math.round(this.fpsSmooth) : null });
    this.hud.update(dt);
  }
}
