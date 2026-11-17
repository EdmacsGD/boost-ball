// Physics values that game modes can change for one match (gravity, ball size, ball bounce).
// Code that used to copy CONFIG into module constants reads them from here, so a change applies
// everywhere at once: physics, bots, ball prediction, online smoothing.
import { CONFIG } from '../config.js';
import { UU } from '../util/math.js';

const P = CONFIG.physics;
export const BASE = Object.freeze({ gravityZ: P.gravityZ, ballRadius: P.ballRadius, ballRestitution: P.ballRestitution });

export const LIVE = {
  g: P.gravityZ * UU, // m/s^2, negative
  ballR: P.ballRadius * UU, // m
};

// scale: { gravity, ball, bounce } (1 = normal). Writes CONFIG too, for code that reads it per call.
export function setLivePhysics({ gravity = 1, ball = 1, bounce = null } = {}) {
  P.gravityZ = BASE.gravityZ * gravity;
  P.ballRadius = BASE.ballRadius * ball;
  P.ballRestitution = bounce ?? BASE.ballRestitution;
  LIVE.g = P.gravityZ * UU;
  LIVE.ballR = P.ballRadius * UU;
}
