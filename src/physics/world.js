// Rapier world setup: arena collider, collision groups and friction/restitution combine rules.
//
// Why the combine rules look odd: the original game uses different friction/bounce numbers for every
// pair (car-ball grips with friction 2.0 and no bounce, ball-wall bounces at 0.6, car-car barely grips).
// Rapier lets each collider pick a combine rule, and the higher-priority rule wins
// (Average < Min < Multiply < Max). The values below make every pair come out exactly right.

import RAPIER from '@dimforge/rapier3d-compat';
import { CONFIG } from '../config.js';
import { UU } from '../util/math.js';
import { buildArenaSurfaces, surfacesToMesh } from './arenaShape.js';

export let R = null; // the initialized RAPIER namespace

export const GROUP = {
  ARENA: 1 << 0,
  BALL: 1 << 1,
  CAR: 1 << 2,
  CARCAR: 1 << 3,
  RAY: 1 << 4,
};

export const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);

export const COLLIDER_GROUPS = {
  arena: groups(GROUP.ARENA, GROUP.BALL | GROUP.CAR | GROUP.RAY),
  ball: groups(GROUP.BALL, GROUP.ARENA | GROUP.CAR | GROUP.RAY),
  car: groups(GROUP.CAR, GROUP.ARENA | GROUP.BALL),
  carcar: groups(GROUP.CARCAR, GROUP.CARCAR | GROUP.RAY),
  wheelRay: groups(GROUP.RAY, GROUP.ARENA | GROUP.BALL | GROUP.CARCAR),
  arenaRay: groups(GROUP.RAY, GROUP.ARENA),
};

export async function initPhysics() {
  if (!R) {
    await RAPIER.init();
    R = RAPIER;
  }
  return R;
}

export class PhysicsWorld {
  constructor() {
    const P = CONFIG.physics;
    this.world = new R.World({ x: 0, y: P.gravityZ * UU, z: 0 });
    this.world.timestep = 1 / CONFIG.game.tickRate;
    this.world.numSolverIterations = P.solverIterations;
    // Generate contacts up to 25 cm before objects touch. Without this a car at full speed sinks
    // ~7 cm into the ball before the solver sees it, and the overlap fires the hit push twice.
    this.world.integrationParameters.normalizedPredictionDistance = 0.25;
    this.eventQueue = new R.EventQueue(true);

    const { surfaces, footprint, floorPoly } = buildArenaSurfaces();
    this.surfaces = surfaces;
    this.footprint = footprint;
    this.floorPoly = floorPoly;
    const mesh = surfacesToMesh(surfaces, Object.keys(surfaces));
    this.arenaMesh = mesh;

    const body = this.world.createRigidBody(R.RigidBodyDesc.fixed());
    const flags = R.TriMeshFlags.FIX_INTERNAL_EDGES | R.TriMeshFlags.MERGE_DUPLICATE_VERTICES;
    // Pair results (target values from the original game):
    //   ball-arena  friction max(0.35, 0.3) = 0.35, bounce max(0.6, 0.3) = 0.6
    //   car-arena   friction min(2.0, 0.3)  = 0.3,  bounce max(0.0, 0.3) = 0.3
    //   car-ball    friction max(2.0, 0.35) = 2.0,  bounce min(0.0, 0.6) = 0.0
    //   car-car     separate colliders: 0.09 and 0.1
    const desc = R.ColliderDesc.trimesh(mesh.vertices, mesh.indices, flags)
      .setFriction(P.arenaFriction)
      .setFrictionCombineRule(R.CoefficientCombineRule.Average)
      .setRestitution(P.carWorldRestitution)
      .setRestitutionCombineRule(R.CoefficientCombineRule.Max)
      .setCollisionGroups(COLLIDER_GROUPS.arena)
      .setSolverGroups(COLLIDER_GROUPS.arena);
    this.arenaCollider = this.world.createCollider(desc, body);
    this.arenaBody = body;
    this.arenaHandle = this.arenaCollider.handle;

    // Sky Field (endless mode): a flat slab, 5 km across, with the same surface rules as the arena.
    // Off until setEndless(true); the game keeps the car near the middle with a floating origin.
    const slab = R.ColliderDesc.cuboid(2500, 5, 2500)
      .setTranslation(0, -5, 0)
      .setFriction(P.arenaFriction)
      .setFrictionCombineRule(R.CoefficientCombineRule.Average)
      .setRestitution(P.carWorldRestitution)
      .setRestitutionCombineRule(R.CoefficientCombineRule.Max)
      .setCollisionGroups(COLLIDER_GROUPS.arena)
      .setSolverGroups(COLLIDER_GROUPS.arena);
    this.endlessCollider = this.world.createCollider(slab, body);
    this.endlessCollider.setEnabled(false);
    this.stadiumCollider = this.arenaCollider;
    this.endless = false;
  }

  // Swap the stadium mesh for the endless slab. Wheel contact and body scrape checks read
  // arenaCollider / arenaHandle, so they follow the swap.
  setEndless(on) {
    if (this.endless === on) return;
    this.endless = on;
    this.stadiumCollider.setEnabled(!on);
    this.endlessCollider.setEnabled(on);
    this.arenaCollider = on ? this.endlessCollider : this.stadiumCollider;
    this.arenaHandle = this.arenaCollider.handle;
    this.syncQueries();
  }

  step() {
    this.world.step(this.eventQueue);
  }

  // Ray queries use a tree that is only rebuilt during a step. After teleporting bodies,
  // run a tiny step so the very next wheel raycast sees the new positions.
  syncQueries() {
    const dt = this.world.timestep;
    this.world.timestep = 1e-6;
    this.world.step(this.eventQueue);
    this.world.timestep = dt;
  }

  castRay(origin, dir, maxToi, filterGroups, excludeBody) {
    const ray = new R.Ray(origin, dir);
    return this.world.castRayAndGetNormal(ray, maxToi, true, undefined, filterGroups, undefined, excludeBody);
  }
}
