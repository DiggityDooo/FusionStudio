'use strict';
// Granular simulation (A19 "Granular/sand/snow/mud simulation"): 2D
// position-based grains with contact friction. Semi-implicit PBD:
// integrate, project non-penetration positionally (spatial-hash
// broadphase), derive velocities from the projection, then damp
// tangential relative velocity at contacts once per substep
// (velocity-level friction). Grains settle into piles with a finite
// angle of repose. No rolling resistance is modeled.

/**
 * world: { width, height (walls at x in [0,width], floor y=0, open
 * top when height omitted), gravity, radius, friction, substeps,
 * iterations }. Grains are uniform disks.
 */
export function createGranularWorld({ width = 10, gravity = -9.81, radius = 0.09, friction = 0.6, substeps = 4, iterations = 4 } = {}) {
  if (!(width > 0) || !(radius > 0)) throw new Error('granular: width and radius must be positive');
  return {
    width, gravity, radius, friction, substeps, iterations,
    positions: [], // flat [x0, y0, x1, y1, ...]
    velocities: [],
    count: 0,
  };
}

export function addGrain(world, x, y) {
  world.positions.push(x, y);
  world.velocities.push(0, 0);
  world.count++;
  return world.count - 1;
}

/** Add a jittered grid of grains in a rectangle (deterministic jitter). */
export function pourGrains(world, { x0, x1, y0, rows, seed = 1 }) {
  let s = seed >>> 0 || 1;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const spacing = world.radius * 2.05;
  const cols = Math.max(1, Math.floor((x1 - x0) / spacing));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      addGrain(world, x0 + c * spacing + (rand() - 0.5) * spacing * 0.3, y0 + r * spacing);
    }
  }
  return world.count;
}

function solveContacts(world, prevX, prevY) {
  const { positions, radius, width, friction } = world;
  const n = world.count;
  const diameter = radius * 2;
  const cell = diameter;
  const grid = new Map();
  const key = (cx, cy) => cx * 100000 + cy;
  for (let i = 0; i < n; i++) {
    const cx = Math.floor(positions[i * 2] / cell), cy = Math.floor(positions[i * 2 + 1] / cell);
    const k = key(cx, cy);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  const correctionX = new Float64Array(n);
  const correctionY = new Float64Array(n);
  function contact(i, j) {
    const dx = positions[j * 2] - positions[i * 2];
    const dy = positions[j * 2 + 1] - positions[i * 2 + 1];
    const d2 = dx * dx + dy * dy;
    if (d2 >= diameter * diameter || d2 === 0) return;
    const d = Math.sqrt(d2);
    const push = (diameter - d) / d * 0.5;
    correctionX[i] -= dx * push; correctionY[i] -= dy * push;
    correctionX[j] += dx * push; correctionY[j] += dy * push;
  }
  for (let i = 0; i < n; i++) {
    const cx = Math.floor(positions[i * 2] / cell), cy = Math.floor(positions[i * 2 + 1] / cell);
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      for (const j of grid.get(key(cx + ox, cy + oy)) || []) {
        if (j > i) contact(i, j);
      }
    }
  }
  for (let i = 0; i < n; i++) {
    positions[i * 2] += correctionX[i];
    positions[i * 2 + 1] += correctionY[i];
    // Container: floor and side walls (open top).
    if (positions[i * 2 + 1] < radius) positions[i * 2 + 1] = radius;
    if (positions[i * 2] < radius) positions[i * 2] = radius;
    if (positions[i * 2] > width - radius) positions[i * 2] = width - radius;
  }
}

// Velocity-level friction, applied once per substep after the
// positional solve: contacting pairs lose a friction-scaled share of
// their tangential relative velocity (Coulomb-style, clamped so it
// never reverses the slide), and floor grains lose horizontal speed.
// Running this inside the projection iterations would over-damp and
// freeze piles into towers.
function applyFriction(world) {
  const { positions, velocities, radius, friction } = world;
  const n = world.count;
  const diameter = radius * 2;
  const cell = diameter;
  const grid = new Map();
  const key = (cx, cy) => cx * 100000 + cy;
  for (let i = 0; i < n; i++) {
    const k = key(Math.floor(positions[i * 2] / cell), Math.floor(positions[i * 2 + 1] / cell));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  const dvx = new Float64Array(n), dvy = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const cx = Math.floor(positions[i * 2] / cell), cy = Math.floor(positions[i * 2 + 1] / cell);
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      for (const j of grid.get(key(cx + ox, cy + oy)) || []) {
        if (j <= i) continue;
        const dx = positions[j * 2] - positions[i * 2];
        const dy = positions[j * 2 + 1] - positions[i * 2 + 1];
        const d = Math.hypot(dx, dy);
        if (d >= diameter || d === 0) continue;
        const nx = dx / d, ny = dy / d;
        const rvx = velocities[j * 2] - velocities[i * 2];
        const rvy = velocities[j * 2 + 1] - velocities[i * 2 + 1];
        const vn = rvx * nx + rvy * ny;
        const tx = rvx - vn * nx, ty = rvy - vn * ny;
        const k = friction * 0.5;
        dvx[i] += tx * k * 0.5; dvy[i] += ty * k * 0.5;
        dvx[j] -= tx * k * 0.5; dvy[j] -= ty * k * 0.5;
      }
    }
    if (positions[i * 2 + 1] <= radius + 1e-6) {
      dvx[i] -= velocities[i * 2] * Math.min(1, friction);
    }
  }
  for (let i = 0; i < n; i++) {
    velocities[i * 2] += dvx[i];
    velocities[i * 2 + 1] += dvy[i];
  }
}

/** Advance the world by dt (split into substeps internally). */
export function stepGranular(world, dt) {
  if (!(dt > 0)) throw new Error('granular: dt must be positive');
  const h = dt / world.substeps;
  const n = world.count;
  for (let sub = 0; sub < world.substeps; sub++) {
    const prevX = new Float64Array(n), prevY = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      prevX[i] = world.positions[i * 2];
      prevY[i] = world.positions[i * 2 + 1];
      world.velocities[i * 2 + 1] += world.gravity * h;
      world.positions[i * 2] += world.velocities[i * 2] * h;
      world.positions[i * 2 + 1] += world.velocities[i * 2 + 1] * h;
    }
    for (let iter = 0; iter < world.iterations; iter++) solveContacts(world, prevX, prevY);
    for (let i = 0; i < n; i++) {
      world.velocities[i * 2] = (world.positions[i * 2] - prevX[i]) / h;
      world.velocities[i * 2 + 1] = (world.positions[i * 2 + 1] - prevY[i]) / h;
    }
    applyFriction(world);
  }
  return world;
}

export function kineticEnergy(world) {
  let e = 0;
  for (let i = 0; i < world.velocities.length; i += 2) {
    e += 0.5 * (world.velocities[i] ** 2 + world.velocities[i + 1] ** 2);
  }
  return e;
}

/** Highest grain top per x-bin: the pile surface profile. */
export function surfaceProfile(world, bins) {
  const profile = new Array(bins).fill(0);
  const binWidth = world.width / bins;
  for (let i = 0; i < world.count; i++) {
    const bin = Math.min(bins - 1, Math.floor(world.positions[i * 2] / binWidth));
    profile[bin] = Math.max(profile[bin], world.positions[i * 2 + 1] + world.radius);
  }
  return { profile, binWidth };
}
