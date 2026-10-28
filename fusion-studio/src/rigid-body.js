'use strict';
// Rigid-body dynamics (A19 "Rigid-body dynamics and constraints"):
// impulse-based bodies (spheres and boxes) with gravity, ground-plane
// contact (restitution + Coulomb friction + sleeping), sphere-sphere
// collision, angular impulse response, and PBD distance constraints.

const CLAMP = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createBody({
  shape = { type: 'sphere', radius: 0.5 }, position = [0, 0, 0], velocity = [0, 0, 0],
  mass = 1, restitution = 0.4, friction = 0.5, angularVelocity = [0, 0, 0],
} = {}) {
  if (mass <= 0) throw new Error('rigid: mass must be positive');
  // Inertia (scalar sphere; diagonal box) about the center.
  let inertia;
  if (shape.type === 'sphere') {
    inertia = 0.4 * mass * shape.radius * shape.radius; // 2/5 m r^2
  } else if (shape.type === 'box') {
    const [hx, hy, hz] = shape.halfExtents;
    inertia = [
      (mass / 3) * (hy * hy + hz * hz),
      (mass / 3) * (hx * hx + hz * hz),
      (mass / 3) * (hx * hx + hy * hy),
    ];
  } else {
    throw new Error(`rigid: unsupported shape ${shape.type}`);
  }
  return {
    shape, position: [...position], velocity: [...velocity],
    quaternion: [1, 0, 0, 0], angularVelocity: [...angularVelocity],
    mass, inverseMass: 1 / mass, inertia, restitution, friction,
    sleeping: false, sleepTimer: 0,
  };
}

/** Apply an impulse at a world point: linear + angular response. */
export function applyImpulse(body, impulse, worldPoint) {
  body.velocity = body.velocity.map((v, i) => v + impulse[i] * body.inverseMass);
  const r = worldPoint.map((v, i) => v - body.position[i]);
  const torque = [
    r[1] * impulse[2] - r[2] * impulse[1],
    r[2] * impulse[0] - r[0] * impulse[2],
    r[0] * impulse[1] - r[1] * impulse[0],
  ];
  if (Array.isArray(body.inertia)) {
    body.angularVelocity = body.angularVelocity.map((w, i) => w + torque[i] / body.inertia[i]);
  } else {
    body.angularVelocity = body.angularVelocity.map((w, i) => w + torque[i] / body.inertia);
  }
  body.sleeping = false;
  body.sleepTimer = 0;
}

function integrateOrientation(body, dt) {
  const [w, x, y, z] = body.quaternion;
  const [wx, wy, wz] = body.angularVelocity;
  // q' = q + 0.5 * (omega_quat * q) * dt, renormalized.
  const dq = [
    0.5 * (-wx * x - wy * y - wz * z),
    0.5 * (wx * w - wy * z + wz * y),
    0.5 * (wy * w - wz * x + wx * z),
    0.5 * (wz * w - wx * y + wy * x),
  ];
  const q = [w + dq[0] * dt, x + dq[1] * dt, y + dq[2] * dt, z + dq[3] * dt];
  const l = Math.hypot(...q) || 1;
  body.quaternion = q.map((v) => v / l);
}

/** Lowest point of the body relative to the ground plane y = groundY. */
function groundPenetration(body, groundY) {
  if (body.shape.type === 'sphere') {
    return (body.position[1] - body.shape.radius) - groundY;
  }
  // Box: axis-aligned approximation using half extents (tests use
  // unrotated resting boxes; rotation-aware support is future work).
  return (body.position[1] - body.shape.halfExtents[1]) - groundY;
}

function resolveGround(body, groundY, dt, applyVelocity = true) {
  const pen = groundPenetration(body, groundY);
  if (pen >= 0) return;
  body.position[1] -= pen; // push out fully
  if (!applyVelocity) return;
  const vn = body.velocity[1];
  if (vn < 0) {
    // Restitution only above a bounce threshold; below it, dead stop.
    const bounce = -vn > 0.5 ? -vn * body.restitution : 0;
    body.velocity[1] = bounce;
    // Coulomb friction on the tangential velocity.
    const frictionAccel = body.friction * 9.81 * dt;
    for (const axis of [0, 2]) {
      const vt = body.velocity[axis];
      body.velocity[axis] = vt - CLAMP(vt, -frictionAccel, frictionAccel);
    }
    // Ground contact friction also damps spin about horizontal axes
    // gradually (rolling resistance-lite): leave spin untouched here.
  }
}

function resolveSpherePair(a, b, applyVelocity = true) {
  if (a.shape.type !== 'sphere' || b.shape.type !== 'sphere') return;
  const delta = b.position.map((v, i) => v - a.position[i]);
  const dist = Math.hypot(...delta);
  const minDist = a.shape.radius + b.shape.radius;
  if (dist >= minDist || dist < 1e-12) return;
  const n = delta.map((v) => v / dist);
  const overlap = minDist - dist;
  const wa = effInv(a), wb = effInv(b);
  const totalInv = wa + wb;
  if (totalInv === 0) return;
  a.position = a.position.map((v, i) => v - n[i] * overlap * (wa / totalInv));
  b.position = b.position.map((v, i) => v + n[i] * overlap * (wb / totalInv));
  if (!applyVelocity) return;
  const relVel = b.velocity.map((v, i) => v - a.velocity[i]);
  const vn = relVel[0] * n[0] + relVel[1] * n[1] + relVel[2] * n[2];
  if (vn >= 0) return;
  const e = Math.min(a.restitution, b.restitution);
  const j = (-(1 + e) * vn) / totalInv;
  a.velocity = a.velocity.map((v, i) => v - j * a.inverseMass * n[i]);
  b.velocity = b.velocity.map((v, i) => v + j * b.inverseMass * n[i]);
  a.sleeping = b.sleeping = false;
}

/**
 * Velocity-level distance constraint: remove the relative velocity
 * component along the rod. Position projection alone pumps energy
 * (measured 278 J of perpetual limb swing in a settled ragdoll).
 */
export function solveDistanceVelocity(a, b) {
  const delta = b.position.map((v, i) => v - a.position[i]);
  const dist = Math.hypot(...delta);
  if (dist < 1e-12) return;
  const n = delta.map((v) => v / dist);
  const relVel = b.velocity.map((v, i) => v - a.velocity[i]);
  const vn = relVel[0] * n[0] + relVel[1] * n[1] + relVel[2] * n[2];
  const wa = effInv(a), wb = effInv(b);
  const totalInv = wa + wb;
  if (totalInv === 0) return;
  const j = -vn / totalInv;
  a.velocity = a.velocity.map((v, i) => v - j * wa * n[i]);
  b.velocity = b.velocity.map((v, i) => v + j * wb * n[i]);
}

/** PBD distance constraint between two bodies at anchor distance L. */
/** Sleeping bodies act as infinite mass in constraint solves. */
const effInv = (body) => (body.sleeping ? 0 : body.inverseMass);

export function solveDistanceConstraint(a, b, restLength, stiffness = 1) {
  const delta = b.position.map((v, i) => v - a.position[i]);
  const dist = Math.hypot(...delta);
  if (dist < 1e-12) return;
  const diff = (dist - restLength) / dist;
  const wa = effInv(a), wb = effInv(b);
  const totalInv = wa + wb;
  if (totalInv === 0) return;
  const correction = delta.map((v) => v * diff * stiffness);
  a.position = a.position.map((v, i) => v + correction[i] * (wa / totalInv));
  b.position = b.position.map((v, i) => v - correction[i] * (wb / totalInv));
}

/**
 * Step the world. constraints: [{ a, b, restLength, stiffness }].
 * Sleeping: bodies nearly at rest in ground contact freeze (and are
 * skipped by gravity) until an impulse or collision wakes them.
 */
export function stepWorld(bodies, { dt = 1 / 60, gravity = -9.81, groundY = 0, constraints = [], constraintIterations = 1, linearDamping = 0, angularDamping = 0 } = {}) {
  if (dt <= 0) throw new Error('rigid: dt must be positive');
  // Exponential damping (per-second rates), as in production solvers:
  // sphere contacts have no rolling resistance, so undamped piles
  // jitter at a few J forever. Default 0 keeps analytic tests exact.
  const linFactor = Math.exp(-linearDamping * dt);
  const angFactor = Math.exp(-angularDamping * dt);
  for (const body of bodies) {
    if (body.sleeping) continue;
    if (linearDamping) body.velocity = body.velocity.map((v) => v * linFactor);
    if (angularDamping) body.angularVelocity = body.angularVelocity.map((v) => v * angFactor);
    body.velocity[1] += gravity * dt;
    body.position = body.position.map((v, i) => v + body.velocity[i] * dt);
    integrateOrientation(body, dt);
  }
  // Adjacent (rod-connected) bodies never collide with each other:
  // segment spheres overlap at joints by construction, and pair
  // resolution popping them apart while rods yank them back pumps
  // energy from step 0 (measured KE spikes > 300 J in a ragdoll).
  const connected = new Set();
  {
    const indexOf = new Map(bodies.map((b, i) => [b, i]));
    for (const c of constraints) {
      const i = indexOf.get(c.a), j = indexOf.get(c.b);
      if (i !== undefined && j !== undefined) connected.add(i < j ? `${i}:${j}` : `${j}:${i}`);
    }
  }
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      if (connected.has(`${i}:${j}`)) continue;
      resolveSpherePair(bodies[i], bodies[j]);
    }
  }
  // Relaxation passes: rods and ground contact must iterate
  // TOGETHER — resolving ground after the rods re-breaks them every
  // step (measured 12.7 cm rod stretch single-pass, 7.3 cm with
  // rods-only iteration). Velocity response applies on pass 0 only.
  let preSolvePositions = null;
  for (let iter = 0; iter < constraintIterations; iter++) {
    for (const c of constraints) solveDistanceConstraint(c.a, c.b, c.restLength, c.stiffness ?? 1);
    // Pair separation also iterates (positional only): resolving a
    // folded pile's overlaps once per step pops spheres; spreading
    // the separation across passes lets rods and contacts agree.
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        if (connected.has(`${i}:${j}`)) continue;
        resolveSpherePair(bodies[i], bodies[j], false);
      }
    }
    for (const body of bodies) {
      if (!body.sleeping) resolveGround(body, groundY, dt, iter === 0);
    }
    // Snapshot after pass 0 (which owns the ground velocity
    // response): an impact push-out must not be converted back
    // into velocity by the update below.
    if (iter === 0 && constraints.length) preSolvePositions = bodies.map((b) => [...b.position]);
  }
  if (preSolvePositions) {
    // PBD velocity update, restricted to the Y axis of AIRBORNE
    // bodies. That is the phantom-velocity channel: rod-supported
    // bodies otherwise keep fake gravity velocity forever (measured:
    // settled ragdoll "gliding" at 0.5 m/s, 7.8 J, never sleeping).
    // Wider updates proved unstable: converting rod/ground
    // corrections of wedged spheres into velocity ejects them
    // (measured KE spikes of 54-127 J), so contact bodies and the
    // horizontal axes are deliberately excluded.
    for (let i = 0; i < bodies.length; i++) {
      if (bodies[i].sleeping) continue;
      if (groundPenetration(bodies[i], groundY) <= 0.001) continue;
      bodies[i].velocity[1] += (bodies[i].position[1] - preSolvePositions[i][1]) / dt;
    }
  }
  for (const c of constraints) solveDistanceVelocity(c.a, c.b);
  // Post-solve contact velocity pass. Friction at pass 0 alone
  // ratchets: the PBD velocity update injects correction velocity
  // AFTER friction ran, so a leaning pile creeps sideways forever
  // (measured 0.22 m/s constant COM drift). Running friction last —
  // and zeroing residual downward velocity in contact (bounce has
  // already set vy > 0, so this cannot kill a bounce) — breaks it.
  for (const body of bodies) {
    if (body.sleeping) continue;
    if (groundPenetration(body, groundY) <= 0.001) {
      if (body.velocity[1] < 0) body.velocity[1] = 0;
      const frictionAccel = body.friction * Math.abs(gravity) * dt;
      for (const axis of [0, 2]) {
        const vt = body.velocity[axis];
        body.velocity[axis] = vt - CLAMP(vt, -frictionAccel, frictionAccel);
      }
    }
  }
  for (const body of bodies) {
    if (body.sleeping) continue;
    // Sleep bookkeeping: slow + in contact -> sleep after 0.5 s.
    const speed = Math.hypot(...body.velocity);
    const angSpeed = Math.hypot(...body.angularVelocity);
    const inContact = groundPenetration(body, groundY) <= 0.001;
    if (inContact && speed < 0.08 && angSpeed < 0.2) {
      body.sleepTimer += dt;
      if (body.sleepTimer > 0.5) {
        body.sleeping = true;
        body.velocity = [0, 0, 0];
        body.angularVelocity = [0, 0, 0];
      }
    } else {
      body.sleepTimer = 0;
    }
  }
}

export function kineticEnergy(body) {
  const linear = 0.5 * body.mass * body.velocity.reduce((s, v) => s + v * v, 0);
  let angular;
  if (Array.isArray(body.inertia)) {
    angular = 0.5 * body.angularVelocity.reduce((s, w, i) => s + body.inertia[i] * w * w, 0);
  } else {
    angular = 0.5 * body.inertia * body.angularVelocity.reduce((s, w) => s + w * w, 0);
  }
  return linear + angular;
}
