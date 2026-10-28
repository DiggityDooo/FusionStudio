'use strict';
// Particle kernel: fixed-capacity pool, deterministic emission, field-driven
// semi-implicit Euler integration with exponential drag, plane/sphere
// colliders with restitution and friction, and age/lifespan death with
// swap-remove compaction. Fields (src/force-fields.js) act as accelerations
// (unit-mass particles). Rendering/instancing and UI wiring are not claimed.

import { combinedFieldVector } from './force-fields.js';

/**
 * Create a particle pool. Alive particles always occupy slots [0, alive).
 * @param {number} capacity Maximum simultaneous particles.
 * @param {object} [options] {seed}
 */
export function createParticleSystem(capacity, options = {}) {
  if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('capacity must be a positive integer');
  return {
    capacity,
    positions: new Float32Array(capacity * 3),
    velocities: new Float32Array(capacity * 3),
    ages: new Float32Array(capacity),
    lifes: new Float32Array(capacity),
    alive: 0,
    time: 0,
    rngState: (options.seed ?? 1) >>> 0,
  };
}

function rand(system) {
  let a = system.rngState | 0;
  a = a + 0x6d2b79f5 | 0;
  system.rngState = a;
  let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

/**
 * Emit particles. Returns how many were actually spawned (pool may fill).
 * spec: {count, origin:[x,y,z], direction:[x,y,z], speed, spread (0..1 cone
 * jitter), life, lifeSpread (0..1), velocity:[x,y,z] exact override}
 */
export function emitParticles(system, spec) {
  const count = spec.count ?? 1;
  const origin = spec.origin ?? [0, 0, 0];
  const direction = spec.direction ?? [0, 1, 0];
  const speed = spec.speed ?? 1;
  const spread = spec.spread ?? 0;
  const life = spec.life ?? 1;
  const lifeSpread = spec.lifeSpread ?? 0;
  let spawned = 0;
  for (let k = 0; k < count && system.alive < system.capacity; k++) {
    const i = system.alive++;
    system.positions.set(origin, i * 3);
    let v;
    if (spec.velocity) {
      v = spec.velocity;
    } else {
      let dx = direction[0], dy = direction[1], dz = direction[2];
      if (spread > 0) {
        dx += (rand(system) * 2 - 1) * spread;
        dy += (rand(system) * 2 - 1) * spread;
        dz += (rand(system) * 2 - 1) * spread;
      }
      const jitter = 1 + (rand(system) * 2 - 1) * spread * 0.5;
      const il = 1 / (Math.hypot(dx, dy, dz) || 1);
      v = [dx * il * speed * jitter, dy * il * speed * jitter, dz * il * speed * jitter];
    }
    system.velocities.set(v, i * 3);
    system.ages[i] = 0;
    system.lifes[i] = life * (1 + (rand(system) * 2 - 1) * lifeSpread);
    spawned++;
  }
  return spawned;
}

function kill(system, i) {
  const last = --system.alive;
  if (i !== last) {
    system.positions.copyWithin(i * 3, last * 3, last * 3 + 3);
    system.velocities.copyWithin(i * 3, last * 3, last * 3 + 3);
    system.ages[i] = system.ages[last];
    system.lifes[i] = system.lifes[last];
  }
}

/**
 * Advance the pool. options: {fields: [], drag: 0, colliders: []}.
 * Colliders: {type:'plane', point, normal, restitution, friction}
 *            {type:'sphere', center, radius, restitution, friction}
 * @returns number alive after the step.
 */
export function stepParticles(system, dt, options = {}) {
  const fields = options.fields ?? [];
  const drag = options.drag ?? 0;
  const colliders = options.colliders ?? [];
  const dragFactor = drag > 0 ? Math.exp(-drag * dt) : 1;
  const { positions, velocities } = system;
  system.time += dt;
  let i = 0;
  while (i < system.alive) {
    system.ages[i] += dt;
    if (system.ages[i] >= system.lifes[i]) { kill(system, i); continue; }
    const ix = i * 3;
    const px = positions[ix], py = positions[ix + 1], pz = positions[ix + 2];
    const f = combinedFieldVector(fields, [px, py, pz], system.time);
    let vx = (velocities[ix] + f[0] * dt) * dragFactor;
    let vy = (velocities[ix + 1] + f[1] * dt) * dragFactor;
    let vz = (velocities[ix + 2] + f[2] * dt) * dragFactor;
    let nx = px + vx * dt, ny = py + vy * dt, nz = pz + vz * dt;
    for (const collider of colliders) {
      if (collider.type === 'plane') {
        const nrm = collider.normal;
        const d = (nx - collider.point[0]) * nrm[0] + (ny - collider.point[1]) * nrm[1] + (nz - collider.point[2]) * nrm[2];
        if (d < 0) {
          nx -= nrm[0] * d; ny -= nrm[1] * d; nz -= nrm[2] * d;
          const vn = vx * nrm[0] + vy * nrm[1] + vz * nrm[2];
          if (vn < 0) {
            const e = collider.restitution ?? 0.5;
            const fr = 1 - (collider.friction ?? 0);
            vx = (vx - nrm[0] * vn) * fr + nrm[0] * (-vn * e);
            vy = (vy - nrm[1] * vn) * fr + nrm[1] * (-vn * e);
            vz = (vz - nrm[2] * vn) * fr + nrm[2] * (-vn * e);
          }
        }
      } else if (collider.type === 'sphere') {
        const dx = nx - collider.center[0], dy = ny - collider.center[1], dz = nz - collider.center[2];
        const r = Math.hypot(dx, dy, dz);
        if (r < collider.radius && r > 1e-9) {
          const nrm = [dx / r, dy / r, dz / r];
          nx = collider.center[0] + nrm[0] * collider.radius;
          ny = collider.center[1] + nrm[1] * collider.radius;
          nz = collider.center[2] + nrm[2] * collider.radius;
          const vn = vx * nrm[0] + vy * nrm[1] + vz * nrm[2];
          if (vn < 0) {
            const e = collider.restitution ?? 0.5;
            const fr = 1 - (collider.friction ?? 0);
            vx = (vx - nrm[0] * vn) * fr + nrm[0] * (-vn * e);
            vy = (vy - nrm[1] * vn) * fr + nrm[1] * (-vn * e);
            vz = (vz - nrm[2] * vn) * fr + nrm[2] * (-vn * e);
          }
        }
      }
    }
    positions[ix] = nx; positions[ix + 1] = ny; positions[ix + 2] = nz;
    velocities[ix] = vx; velocities[ix + 1] = vy; velocities[ix + 2] = vz;
    i++;
  }
  return system.alive;
}
