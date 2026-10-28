'use strict';
// XPBD kernel (Macklin et al.): position-based dynamics with compliance in
// physical units, substeps, and Gauss-Seidel constraint iteration with
// accumulated Lagrange multipliers. Distance constraints cover ropes,
// chains, cloth structural/bend networks and soft-body springs. Pins are
// infinite-mass anchors (optionally moving). A ground plane clamp is
// included; full collision/friction and UI wiring are not claimed.

/** Create an XPBD world from positions [[x,y,z],...] and masses. */
export function createXPBDWorld(positions, masses, options = {}) {
  const n = positions.length;
  const pos = new Float64Array(n * 3);
  positions.forEach((p, i) => pos.set(p, i * 3));
  const invMass = new Float64Array(n);
  masses.forEach((m, i) => { invMass[i] = m > 0 ? 1 / m : 0; });
  return {
    count: n,
    positions: pos,
    previous: Float64Array.from(pos),
    velocities: new Float64Array(n * 3),
    invMass,
    constraints: [], // {i, j, rest, compliance, lambda}
    volumeConstraints: [], // {indices:[a,b,c,d], rest, compliance, lambda}
    pins: new Map(), // index -> [x,y,z]
    gravity: options.gravity ?? [0, -9.81, 0],
    groundY: options.groundY ?? null,
  };
}

/** Add a distance constraint. compliance in m/N (0 = rigid). Returns index. */
export function addDistanceConstraint(world, i, j, rest, compliance = 0) {
  const a = i * 3, b = j * 3;
  const dx = world.positions[a] - world.positions[b];
  const dy = world.positions[a + 1] - world.positions[b + 1];
  const dz = world.positions[a + 2] - world.positions[b + 2];
  world.constraints.push({
    i, j,
    rest: rest ?? Math.hypot(dx, dy, dz),
    compliance,
    lambda: 0,
  });
  return world.constraints.length - 1;
}

/** Signed volume of tetrahedron (a, b, c, d) from a positions array. */
export function tetraVolume(positions, a, b, c, d) {
  const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
  const ux = positions[b * 3] - ax, uy = positions[b * 3 + 1] - ay, uz = positions[b * 3 + 2] - az;
  const vx = positions[c * 3] - ax, vy = positions[c * 3 + 1] - ay, vz = positions[c * 3 + 2] - az;
  const wx = positions[d * 3] - ax, wy = positions[d * 3 + 1] - ay, wz = positions[d * 3 + 2] - az;
  return (ux * (vy * wz - vz * wy) - uy * (vx * wz - vz * wx) + uz * (vx * wy - vy * wx)) / 6;
}

/**
 * Add a tetrahedral volume-preservation constraint (soft bodies).
 * restVolume defaults to the current signed volume. compliance in m/N.
 */
export function addVolumeConstraint(world, a, b, c, d, restVolume, compliance = 0) {
  const v = tetraVolume(world.positions, a, b, c, d);
  world.volumeConstraints.push({
    indices: [a, b, c, d],
    rest: restVolume ?? v,
    compliance,
    lambda: 0,
  });
  return world.volumeConstraints.length - 1;
}

function solveVolume(world, c, alphaTilde) {
  const { positions, invMass } = world;
  const [a, b, cc, d] = c.indices;
  const pa = a * 3, pb = b * 3, pc = cc * 3, pd = d * 3;
  // Gradients of signed volume: grad_b = ((c-a) x (d-a))/6, cyclic; grad_a
  // is the negative sum of the other three.
  const grads = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const corners = [pa, pb, pc, pd];
  for (let m = 1; m < 4; m++) {
    const o = corners[0];
    const v = corners[1 + (m % 3)];
    const w = corners[1 + ((m + 1) % 3)];
    const vx = positions[v] - positions[o], vy = positions[v + 1] - positions[o + 1], vz = positions[v + 2] - positions[o + 2];
    const wx = positions[w] - positions[o], wy = positions[w + 1] - positions[o + 1], wz = positions[w + 2] - positions[o + 2];
    // grad_m = ((v-o) x (w-o))/6 with (v,w) the cyclic (c,d),(d,b),(b,c).
    grads[m] = [
      (vy * wz - vz * wy) / 6,
      (vz * wx - vx * wz) / 6,
      (vx * wy - vy * wx) / 6,
    ];
  }
  grads[0] = [
    -(grads[1][0] + grads[2][0] + grads[3][0]),
    -(grads[1][1] + grads[2][1] + grads[3][1]),
    -(grads[1][2] + grads[2][2] + grads[3][2]),
  ];
  const C = tetraVolume(positions, a, b, cc, d) - c.rest;
  let denom = alphaTilde;
  for (let m = 0; m < 4; m++) {
    const w = invMass[c.indices[m]];
    denom += w * (grads[m][0] ** 2 + grads[m][1] ** 2 + grads[m][2] ** 2);
  }
  if (denom < 1e-15) return;
  const dLambda = (-C - alphaTilde * c.lambda) / denom;
  c.lambda += dLambda;
  for (let m = 0; m < 4; m++) {
    const w = invMass[c.indices[m]];
    if (w === 0) continue;
    const p = corners[m];
    positions[p] += w * dLambda * grads[m][0];
    positions[p + 1] += w * dLambda * grads[m][1];
    positions[p + 2] += w * dLambda * grads[m][2];
  }
}

/** Pin a particle to a fixed (or script-moved) anchor position. */
export function pinParticle(world, index, position) {
  world.invMass[index] = 0;
  world.pins.set(index, [position[0], position[1], position[2]]);
}

/** Build a rope: particles along a ray, distance constraints, first pinned. */
export function buildRope({ origin, direction, segments, segmentLength, mass = 1, compliance = 0 }) {
  const positions = [];
  for (let s = 0; s <= segments; s++) {
    positions.push([
      origin[0] + direction[0] * segmentLength * s,
      origin[1] + direction[1] * segmentLength * s,
      origin[2] + direction[2] * segmentLength * s,
    ]);
  }
  const world = createXPBDWorld(positions, new Array(segments + 1).fill(mass));
  for (let s = 0; s < segments; s++) addDistanceConstraint(world, s, s + 1, segmentLength, compliance);
  pinParticle(world, 0, origin);
  return world;
}

function solveDistance(world, c, alphaTilde) {
  const { positions, invMass } = world;
  const a = c.i * 3, b = c.j * 3;
  const dx = positions[a] - positions[b];
  const dy = positions[a + 1] - positions[b + 1];
  const dz = positions[a + 2] - positions[b + 2];
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-12) return;
  const wi = invMass[c.i], wj = invMass[c.j];
  const wSum = wi + wj;
  if (wSum === 0) return;
  const C = dist - c.rest;
  const dLambda = (-C - alphaTilde * c.lambda) / (wSum + alphaTilde);
  c.lambda += dLambda;
  const nx = dx / dist, ny = dy / dist, nz = dz / dist;
  const si = wi * dLambda, sj = wj * dLambda;
  positions[a] += nx * si; positions[a + 1] += ny * si; positions[a + 2] += nz * si;
  positions[b] -= nx * sj; positions[b + 1] -= ny * sj; positions[b + 2] -= nz * sj;
}

/**
 * Advance the world. XPBD: many substeps, one (or few) constraint passes
 * each, multipliers reset per substep. options {substeps, iterations, damping}
 */
export function stepXPBD(world, dt, options = {}) {
  const substeps = options.substeps ?? 10;
  const iterations = options.iterations ?? 1;
  const damping = options.damping ?? 0;
  const h = dt / substeps;
  const { positions, previous, velocities, invMass, gravity } = world;
  const dampFactor = damping > 0 ? Math.max(0, 1 - damping * h) : 1;
  for (let s = 0; s < substeps; s++) {
    for (let i = 0; i < world.count; i++) {
      if (invMass[i] === 0) continue;
      const ix = i * 3;
      velocities[ix] = (velocities[ix] + gravity[0] * h) * dampFactor;
      velocities[ix + 1] = (velocities[ix + 1] + gravity[1] * h) * dampFactor;
      velocities[ix + 2] = (velocities[ix + 2] + gravity[2] * h) * dampFactor;
      previous[ix] = positions[ix];
      previous[ix + 1] = positions[ix + 1];
      previous[ix + 2] = positions[ix + 2];
      positions[ix] += velocities[ix] * h;
      positions[ix + 1] += velocities[ix + 1] * h;
      positions[ix + 2] += velocities[ix + 2] * h;
    }
    for (const [index, anchor] of world.pins) {
      positions.set(anchor, index * 3);
      previous.set(anchor, index * 3);
    }
    for (const c of world.constraints) c.lambda = 0;
    for (const c of world.volumeConstraints) c.lambda = 0;
    for (let it = 0; it < iterations; it++) {
      for (const c of world.constraints) {
        solveDistance(world, c, c.compliance / (h * h));
      }
      for (const c of world.volumeConstraints) {
        solveVolume(world, c, c.compliance / (h * h));
      }
    }
    if (world.groundY !== null) {
      for (let i = 0; i < world.count; i++) {
        const iy = i * 3 + 1;
        if (positions[iy] < world.groundY) positions[iy] = world.groundY;
      }
    }
    for (let i = 0; i < world.count; i++) {
      const ix = i * 3;
      if (invMass[i] === 0) {
        velocities[ix] = velocities[ix + 1] = velocities[ix + 2] = 0;
        continue;
      }
      velocities[ix] = (positions[ix] - previous[ix]) / h;
      velocities[ix + 1] = (positions[ix + 1] - previous[ix + 1]) / h;
      velocities[ix + 2] = (positions[ix + 2] - previous[ix + 2]) / h;
    }
  }
}

/** Total constraint stretch error: max |C| / rest over distance constraints. */
export function maxConstraintError(world) {
  const { positions } = world;
  let max = 0;
  for (const c of world.constraints) {
    const a = c.i * 3, b = c.j * 3;
    const d = Math.hypot(
      positions[a] - positions[b],
      positions[a + 1] - positions[b + 1],
      positions[a + 2] - positions[b + 2]);
    max = Math.max(max, Math.abs(d - c.rest) / c.rest);
  }
  return max;
}

/** Sum of segment lengths along a particle chain (indices in order). */
export function chainLength(world, indices) {
  const { positions } = world;
  let total = 0;
  for (let k = 0; k + 1 < indices.length; k++) {
    const a = indices[k] * 3, b = indices[k + 1] * 3;
    total += Math.hypot(
      positions[a] - positions[b],
      positions[a + 1] - positions[b + 1],
      positions[a + 2] - positions[b + 2]);
  }
  return total;
}
