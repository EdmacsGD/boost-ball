// Camera rig checks: framing, floor clearance, smoothness and ball cam behavior.
// Run with: node tests/camera.test.mjs
import * as THREE from 'three';
import { CameraRig, floorHeightAt } from '../src/render/cameraRig.js';

const DEG = Math.PI / 180;
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });

const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 2000);
function setView(hfovDeg = 110, aspect = 16 / 9) {
  camera.aspect = aspect;
  camera.fov = (2 * Math.atan(Math.tan((hfovDeg * DEG) / 2) / aspect)) / DEG;
  camera.updateProjectionMatrix();
}
setView();

function makeRig(ballCam = true) {
  const rig = new CameraRig(camera, null);
  rig.ballCam = ballCam;
  return rig;
}

// Car pose: yaw 0 faces +x; pitch noses up; roll banks right.
function makeCar(pos, { yaw = 0, pitch = 0, roll = 0, vel = [0, 0, 0], wheels = 4, quat = null } = {}) {
  const q = quat || new THREE.Quaternion().setFromEuler(new THREE.Euler(roll, -yaw, pitch, 'YZX'));
  return {
    pos: new THREE.Vector3(...pos),
    vel: new THREE.Vector3(...vel),
    fwd: new THREE.Vector3(1, 0, 0).applyQuaternion(q),
    up: new THREE.Vector3(0, 1, 0).applyQuaternion(q),
    numWheelsInContact: wheels,
  };
}

function ndc(p) {
  camera.updateMatrixWorld();
  return p.clone().project(camera);
}
const onScreen = (n, lim = 1) => Math.abs(n.x) <= lim && Math.abs(n.y) <= lim && n.z > -1 && n.z < 1;
const camFwd = () => new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
const camRight = () => new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
const camUp = () => new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);

function run(rig, car, ball, seconds, dt = 1 / 60, each = null) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    rig.updatePlay(dt, car, ball);
    if (each) each(i, dt);
  }
}

const REST_Y = 0.17;
const BALL_R = 0.93;

// 1. Ball on the ground far ahead: normal framing.
{
  const rig = makeRig();
  const car = makeCar([0, REST_Y, -20]);
  const ball = new THREE.Vector3(20, BALL_R, -20);
  run(rig, car, ball, 1.5);
  const c = ndc(car.pos);
  const b = ndc(ball);
  check('ground: car centered low', Math.abs(c.x) < 0.02 && c.y < -0.3 && c.y > -0.75, `car ndc ${c.x.toFixed(2)}, ${c.y.toFixed(2)}`);
  check('ground: ball near center', Math.abs(b.x) < 0.02 && Math.abs(b.y) < 0.3, `ball ndc ${b.x.toFixed(2)}, ${b.y.toFixed(2)}`);
  const back = car.pos.x - camera.position.x;
  check('ground: boom 2.7 m back, 1.0 m up', Math.abs(back - 2.7) < 0.15 && Math.abs(camera.position.y - REST_Y - 1.0) < 0.15, `back ${back.toFixed(2)} up ${(camera.position.y - REST_Y).toFixed(2)}`);
  check('ground: horizon level', Math.abs(camRight().y) < 1e-3);
}

// 2. High ball ahead, car on the ground: the ball rides up the frame but stays on screen; the view tilts up.
{
  const rig = makeRig();
  const car = makeCar([0, REST_Y, 0]);
  const ball = new THREE.Vector3(15, 8, 0);
  run(rig, car, ball, 1.5);
  const c = ndc(car.pos);
  const b = ndc(ball);
  check('high ball: ball on screen, upper half', onScreen(b) && b.y > 0.15 && b.y < 0.6, `ball ndc y ${b.y.toFixed(2)}`);
  check('high ball: car on screen', onScreen(c, 0.81), `car ndc y ${c.y.toFixed(2)}`);
  check('high ball: view tilts up', camFwd().y > 0.02, `fwd.y ${camFwd().y.toFixed(3)}`);
}

// 3. Ball overhead (dribble on the roof): camera stays behind the car and does not spin as the ball rolls.
{
  const rig = makeRig();
  const car = makeCar([0, REST_Y, 0], { yaw: 0.5 });
  const ball = new THREE.Vector3(0, REST_Y + 1.25, 0);
  const heading = new THREE.Vector3(Math.cos(0.5), 0, Math.sin(0.5));
  let minDot = 1;
  let maxStep = 0;
  let prev = null;
  run(rig, car, ball, 4, 1 / 60, (i) => {
    const t = i / 60;
    // Ball wanders over the roof: up to 0.45 m from the car center in any direction.
    ball.set(Math.sin(t * 1.7) * 0.45, REST_Y + 1.25, Math.sin(t * 2.3 + 1) * 0.45);
    ball.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0);
    const f = camFwd().setY(0).normalize();
    if (i > 30) minDot = Math.min(minDot, f.dot(heading));
    if (prev) maxStep = Math.max(maxStep, Math.acos(Math.min(1, prev.dot(camFwd()))));
    prev = camFwd();
  });
  check('dribble: camera stays behind the car', minDot > Math.cos(35 * DEG), `min cos ${minDot.toFixed(3)}`);
  check('dribble: no fast swings', maxStep / DEG < 4, `max step ${(maxStep / DEG).toFixed(2)} deg/frame`);
  check('dribble: car on screen', onScreen(ndc(car.pos), 0.81));
  check('dribble: ball on screen', onScreen(ndc(ball)));
}

// 4. Ball behind the car: the camera swings round to look back at the car's front.
{
  const rig = makeRig();
  const car = makeCar([0, REST_Y, 0]);
  const ball = new THREE.Vector3(10, BALL_R, 0);
  run(rig, car, ball, 1);
  ball.set(-12, BALL_R, 0.5);
  let maxRate = 0;
  let settledAt = null;
  let prev = camFwd();
  run(rig, car, ball, 2, 1 / 60, (i, dt) => {
    const f = camFwd();
    maxRate = Math.max(maxRate, Math.acos(Math.min(1, prev.dot(f))) / dt);
    prev = f;
    if (settledAt === null && f.x < -0.97) settledAt = (i + 1) * dt;
  });
  check('ball behind: camera looks back', camFwd().x < -0.97, `fwd.x ${camFwd().x.toFixed(3)}`);
  check('ball behind: turn takes 0.3-0.8 s', settledAt !== null && settledAt > 0.3 && settledAt < 0.8, `settled at ${settledAt?.toFixed(2)} s`);
  check('ball behind: turn rate capped near 600 deg/s', maxRate / DEG < 640, `max ${(maxRate / DEG).toFixed(0)} deg/s`);
  check('ball behind: car on screen', onScreen(ndc(car.pos), 0.81));
}

// 5. Aerial under a high ball: the boom swings under the car to keep the ball in the upper middle.
{
  const rig = makeRig();
  const car = makeCar([0, 6, 0], { pitch: 0.6, wheels: 0, vel: [8, 6, 0] });
  const ball = new THREE.Vector3(8, 14, 0);
  run(rig, car, ball, 1.5);
  const b = ndc(ball);
  const c = ndc(car.pos);
  check('aerial: boom swings under the car', rig.orbit > 10 * DEG, `orbit ${(rig.orbit / DEG).toFixed(1)} deg`);
  check('aerial: ball held near 0.3 of the half height', b.y < 0.36 && b.y > 0.1, `ball ndc y ${b.y.toFixed(2)}`);
  check('aerial: car keeps its spot', onScreen(c, 0.81) && c.y < -0.3, `car ndc y ${c.y.toFixed(2)}`);
  check('aerial: camera dropped, looking up', camera.position.y < car.pos.y + 0.5 && camFwd().y > 0.3, `cam ${(camera.position.y - car.pos.y).toFixed(2)} m above car, fwd.y ${camFwd().y.toFixed(2)}`);
}

// 6. Car in the air above the ball: the camera looks down at it.
{
  const rig = makeRig();
  const car = makeCar([0, 6, 0], { wheels: 0 });
  const ball = new THREE.Vector3(4, BALL_R, 0);
  run(rig, car, ball, 1.5);
  check('above ball: view looks down', camFwd().y < -0.5, `fwd.y ${camFwd().y.toFixed(2)}`);
  check('above ball: both on screen', onScreen(ndc(ball)) && onScreen(ndc(car.pos), 0.81));
  check('above ball: camera above the car', camera.position.y > car.pos.y + 0.5);
}

// 7. Wall driving: ball cam keeps the horizon level, car cam rolls with the wall.
{
  // Car on the +x side wall, wheels on the wall (up = -x), driving along +z.
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0));
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  const car = makeCar([40.96 - REST_Y, 5, 0], { quat: q, vel: [0, 0, 12] });
  const ball = new THREE.Vector3(0, BALL_R, 10);
  const rig = makeRig(true);
  run(rig, car, ball, 1.5);
  check('wall, ball cam: horizon level', Math.abs(camRight().y) < 0.01 && camUp().y > 0.5, `right.y ${camRight().y.toFixed(3)}`);
  check('wall, ball cam: car and ball on screen', onScreen(ndc(car.pos), 0.81) && onScreen(ndc(ball)));
  const rig2 = makeRig(false);
  run(rig2, car, ball, 1.5);
  check('wall, car cam: rolls with the wall', camUp().dot(car.up) > 0.9, `up.dot ${camUp().dot(car.up).toFixed(3)}`);
  check('wall, car cam: car on screen', onScreen(ndc(car.pos), 0.81));
}

// 8. Ball cam toggle: eases over 0.5 / transitionSpeed seconds with no jumps.
{
  const rig = makeRig(true);
  const car = makeCar([0, REST_Y, 0], { vel: [10, 0, 0] });
  const ball = new THREE.Vector3(-8, 3, 6); // behind and to the side, so the two cams differ a lot
  run(rig, car, ball, 1.5);
  rig.ballCam = false;
  let doneAt = null;
  let maxStep = 0;
  let prev = camFwd();
  const dt = 1 / 60;
  run(rig, car, ball, 1.5, dt, (i) => {
    const f = camFwd();
    maxStep = Math.max(maxStep, Math.acos(Math.min(1, prev.dot(f))));
    prev = f;
    if (doneAt === null && rig.blend === 0) doneAt = (i + 1) * dt;
  });
  const expect = 0.5 / rig.settings.transitionSpeed;
  check('toggle: blend takes 0.5 / transition speed', doneAt !== null && Math.abs(doneAt - expect) < 0.03, `${doneAt?.toFixed(3)} s vs ${expect.toFixed(3)} s`);
  check('toggle: no jump (max 12 deg per frame)', maxStep / DEG < 12, `${(maxStep / DEG).toFixed(2)} deg`);
  check('toggle: ends in car cam behind the car', camFwd().x > 0.95);
}

// 9. Frame-rate independence: same view at 30, 60 and 144 fps.
{
  const finals = [];
  for (const fps of [30, 60, 240]) {
    const rig = makeRig(true);
    const car = makeCar([0, REST_Y, 0]);
    const ball = new THREE.Vector3(10, BALL_R, 0);
    run(rig, car, ball, 0.5, 1 / fps);
    ball.set(-6, 4, 6);
    run(rig, car, ball, 0.3, 1 / fps); // mid-swing (whole frames at each rate)
    finals.push(camFwd());
  }
  const a = Math.max(finals[0].angleTo(finals[1]), finals[2].angleTo(finals[1])) / DEG;
  check('frame rate: same aim mid-swing at 30/60/240 fps', a < 1, `${a.toFixed(2)} deg apart`);
}

// 10. Stress: random driving, flying and teleports. Never NaN, never under the floor, car always framed.
{
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const rig = makeRig(true);
  let bad = 0;
  let below = 0;
  let offscreen = 0;
  let frames = 0;
  const car = makeCar([0, REST_Y, 0]);
  const ball = new THREE.Vector3(5, BALL_R, 5);
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let k = 0; k < 400; k++) {
    // New random situation.
    const air = rnd() < 0.5;
    car.pos.set((rnd() * 2 - 1) * 38, air ? 1 + rnd() * 15 : REST_Y, (rnd() * 2 - 1) * 48);
    e.set((rnd() * 2 - 1) * Math.PI, rnd() * Math.PI * 2, (rnd() * 2 - 1) * (air ? Math.PI : 0.05), 'YZX');
    q.setFromEuler(e);
    car.fwd.set(1, 0, 0).applyQuaternion(q);
    car.up.set(0, 1, 0).applyQuaternion(q);
    car.numWheelsInContact = air ? 0 : 4;
    car.vel.set((rnd() * 2 - 1) * 20, air ? (rnd() * 2 - 1) * 10 : 0, (rnd() * 2 - 1) * 20);
    ball.set((rnd() * 2 - 1) * 38, BALL_R + rnd() * rnd() * 18, (rnd() * 2 - 1) * 48);
    if (rnd() < 0.25) ball.copy(car.pos).add(new THREE.Vector3((rnd() - 0.5) * 3, 0.5 + rnd() * 3, (rnd() - 0.5) * 3));
    if (rnd() < 0.15) rig.ballCam = !rig.ballCam;
    const steps = 10 + Math.floor(rnd() * 60);
    for (let i = 0; i < steps; i++) {
      const dt = [1 / 240, 1 / 144, 1 / 60, 1 / 30, 1 / 12][Math.floor(rnd() * 5)];
      car.pos.addScaledVector(car.vel, dt);
      car.pos.y = Math.max(car.pos.y, REST_Y);
      ball.x += (rnd() - 0.5) * 0.3;
      ball.z += (rnd() - 0.5) * 0.3;
      rig.updatePlay(dt, car, ball);
      frames++;
      const p = camera.position;
      if (![p.x, p.y, p.z, camera.quaternion.x, camera.quaternion.w].every(Number.isFinite)) bad++;
      const fh = floorHeightAt(p.x, p.z) ?? 0;
      if (p.y < fh + 0.29) below++;
      if (!onScreen(ndc(car.pos), 0.81)) offscreen++;
    }
  }
  check('stress: no NaN', bad === 0, `${bad} of ${frames}`);
  check('stress: camera never under the floor or ramps', below === 0, `${below} of ${frames}`);
  check('stress: car always inside 0.8 of the frame', offscreen === 0, `${offscreen} of ${frames}`);
}

// 11. Corner ramp: the camera stays above the curved floor.
{
  const rig = makeRig(true);
  const car = makeCar([34, REST_Y + 0.3, 44], { yaw: Math.PI * 0.25, vel: [6, 0, 6] });
  const ball = new THREE.Vector3(0, BALL_R, 0);
  run(rig, car, ball, 1);
  const fh = floorHeightAt(camera.position.x, camera.position.z) ?? 0;
  check('corner: camera above the ramp', camera.position.y >= fh + 0.29, `y ${camera.position.y.toFixed(2)} floor ${fh.toFixed(2)}`);
}

let pass = 0;
for (const r of results) {
  if (r.ok) pass++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
}
console.log(`\n${pass}/${results.length} passed`);
if (pass !== results.length) process.exitCode = 1;
