'use strict';
// SPH (smoothed particle hydrodynamics) liquid kernel, Muller et al. style:
// poly6 density, spiky pressure gradient, viscosity Laplacian, stiff
// equation of state p = k(rho - rho0), uniform-grid neighbor search.
// The symmetric pressure force conserves linear momentum exactly.
// FLIP/APIC grid transfer, surface tension, and UI wiring are not claimed.

const POLY6 = 315 / (64 * Math.PI);
const SPIKY = -45 / Math.PI;
const VISC = 45 / Math.PI;

/** Poly6 kernel value W(r, h), zero for r >= h. */
export function kernelPoly6(r, h) {
  if (r >= h) return 0;
  const h2 = h * h, r2 = r * r;
  return POLY6 / (h ** 9) * (h2 - r2) ** 3;
}

/** Spiky kernel gradient at offset vector [dx,dy,dz] (points from j to i). */
export function kernelSpikyGradient(dx, dy, dz, h) {
  const r = Math.hypot(dx, dy, dz);
  if (r >= h || r < 1e-12) return [0, 0, 0];
  const m = SPIKY / (h ** 6) * (h - r) ** 2 / r;
  return [dx * m, dy * m, dz * m];
}

/** Viscosity kernel Laplacian at distance r. */
export function kernelViscosityLaplacian(r, h) {
  if (r >= h) return 0;
  return VISC / (h ** 6) * (h - r);
}

/**
 * Particle mass that gives exactly restDensity on an infinite cubic lattice
 * of the given spacing: m = rho0 / sum(W over lattice offsets).
 */
export function calibrateMass(spacing, h, restDensity) {
  const range = Math.ceil(h / spacing);
  let sum = 0;
  for (let i = -range; i <= range; i++) {
    for (let j = -range; j <= range; j++) {
      for (let k = -range; k <= range; k++) {
        sum += kernelPoly6(Math.hypot(i, j, k) * spacing, h);
      }
    }
  }
  return restDensity / sum;
}

/** Create an SPH system. positions is [[x,y,z],...]; bounds {min, max}. */
export function createSPHSystem({
  positions, h = 1.4, restDensity = 1, mass = 1, gasConstant = 20,
  viscosity = 0.05, gravity = [0, -9.81, 0], bounds = null,
}) {
  const n = positions.length;
  const pos = new Float64Array(n * 3);
  positions.forEach((p, i) => pos.set(p, i * 3));
  return {
    count: n,
    h, restDensity, mass, gasConstant, viscosity, gravity, bounds,
    positions: pos,
    velocities: new Float64Array(n * 3),
    densities: new Float64Array(n),
    pressures: new Float64Array(n),
    accelerations: new Float64Array(n * 3),
  };
}

function neighborLists(system) {
  const { positions, count, h } = system;
  const cell = h;
  const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const grid = new Map();
  for (let i = 0; i < count; i++) {
    const k = key(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  const lists = new Array(count);
  for (let i = 0; i < count; i++) {
    const cx = Math.floor(positions[i * 3] / cell);
    const cy = Math.floor(positions[i * 3 + 1] / cell);
    const cz = Math.floor(positions[i * 3 + 2] / cell);
    const list = [];
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const bucket = grid.get(`${cx + a},${cy + b},${cz + c}`);
      if (!bucket) continue;
      for (const j of bucket) {
        if (j === i) continue;
        const dx = positions[i * 3] - positions[j * 3];
        const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
        const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
        if (dx * dx + dy * dy + dz * dz < h * h) list.push(j);
      }
    }
    lists[i] = list;
  }
  return lists;
}

/** Compute densities and pressures in place. Returns the neighbor lists. */
export function computeSPHState(system) {
  const { positions, densities, pressures, mass, h, restDensity, gasConstant } = system;
  const lists = neighborLists(system);
  const selfW = kernelPoly6(0, h);
  for (let i = 0; i < system.count; i++) {
    let rho = mass * selfW;
    for (const j of lists[i]) {
      const dx = positions[i * 3] - positions[j * 3];
      const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
      const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
      rho += mass * kernelPoly6(Math.hypot(dx, dy, dz), h);
    }
    densities[i] = rho;
    pressures[i] = gasConstant * (rho - restDensity);
  }
  return lists;
}

/**
 * Compute pressure + viscosity ACCELERATIONS (needs computeSPHState first).
 * In the Muller formulation these sums are already accelerations (the 1/rho
 * factors live inside the symmetric pressure term); dividing by density
 * again in the integrator would be a formulation bug. The pressure part is
 * pairwise antisymmetric, so it conserves linear momentum exactly. The
 * viscosity part (Muller's form) is not exactly momentum-conserving when
 * densities differ -- a known property of that formulation.
 */
export function computeSPHAccelerations(system, lists) {
  const { positions, velocities, densities, pressures, accelerations, mass, h, viscosity } = system;
  accelerations.fill(0);
  for (let i = 0; i < system.count; i++) {
    let fx = 0, fy = 0, fz = 0;
    const rhoI = densities[i];
    for (const j of lists[i]) {
      const dx = positions[i * 3] - positions[j * 3];
      const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
      const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
      const rhoJ = densities[j];
      // Pressure: symmetric form, exactly momentum-conserving.
      const pg = kernelSpikyGradient(dx, dy, dz, h);
      const pTerm = -mass * (pressures[i] / (rhoI * rhoI) + pressures[j] / (rhoJ * rhoJ));
      fx += pTerm * pg[0]; fy += pTerm * pg[1]; fz += pTerm * pg[2];
      // Viscosity.
      const r = Math.hypot(dx, dy, dz);
      const vTerm = viscosity * mass * kernelViscosityLaplacian(r, h) / rhoJ;
      fx += vTerm * (velocities[j * 3] - velocities[i * 3]);
      fy += vTerm * (velocities[j * 3 + 1] - velocities[i * 3 + 1]);
      fz += vTerm * (velocities[j * 3 + 2] - velocities[i * 3 + 2]);
    }
    accelerations[i * 3] = fx; accelerations[i * 3 + 1] = fy; accelerations[i * 3 + 2] = fz;
  }
}

/** Advance: state -> accelerations -> integrate -> box bounds. */
export function stepSPH(system, dt) {
  const lists = computeSPHState(system);
  computeSPHAccelerations(system, lists);
  const { positions, velocities, accelerations, gravity, bounds } = system;
  for (let i = 0; i < system.count; i++) {
    const ix = i * 3;
    velocities[ix] += (accelerations[ix] + gravity[0]) * dt;
    velocities[ix + 1] += (accelerations[ix + 1] + gravity[1]) * dt;
    velocities[ix + 2] += (accelerations[ix + 2] + gravity[2]) * dt;
    positions[ix] += velocities[ix] * dt;
    positions[ix + 1] += velocities[ix + 1] * dt;
    positions[ix + 2] += velocities[ix + 2] * dt;
    if (bounds) {
      for (let a = 0; a < 3; a++) {
        if (positions[ix + a] < bounds.min[a]) {
          positions[ix + a] = bounds.min[a];
          velocities[ix + a] *= -0.3;
        } else if (positions[ix + a] > bounds.max[a]) {
          positions[ix + a] = bounds.max[a];
          velocities[ix + a] *= -0.3;
        }
      }
    }
  }
}
