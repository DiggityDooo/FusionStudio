'use strict';
// Grid fluid kernel (2D) on a MAC (marker-and-cell) staggered grid:
// semi-Lagrangian advection, Jacobi pressure projection, Boussinesq-style
// buoyancy for smoke. MAC staggering is used because on a collocated grid
// the central-difference divergence has a checkerboard null mode that no
// pressure gradient can remove; on MAC, divergence and gradient are exact
// adjoints and the projection is consistent. UI wiring is not claimed.
//
// Layout (n x n cells, spacing h):
//   u faces: (n+1) x n, u(i,j) at (i*h, (j+0.5)*h)     index j*(n+1)+i
//   v faces: n x (n+1), v(i,j) at ((i+0.5)*h, j*h)     index j*n+i
//   scalars (density, temperature, pressure, divergence): n x n centers
// Boundary faces are no-through-flow walls (held at 0).

/** Create a MAC fluid grid. size = cells per side (>= 4). */
export function createFluidGrid(size, options = {}) {
  if (!Number.isInteger(size) || size < 4) throw new RangeError('size must be an integer >= 4');
  const n = size;
  return {
    size: n,
    spacing: Number(options.spacing) || 1,
    u: new Float64Array((n + 1) * n),
    v: new Float64Array(n * (n + 1)),
    density: new Float64Array(n * n),
    temperature: new Float64Array(n * n),
    pressure: new Float64Array(n * n),
    divergence: new Float64Array(n * n),
    time: 0,
  };
}

export const uIndex = (grid, i, j) => j * (grid.size + 1) + i;
export const vIndex = (grid, i, j) => j * grid.size + i;
export const cellIndex = (grid, i, j) => j * grid.size + i;

/** Max |divergence| over cell centers; also fills grid.divergence. */
export function maxDivergence(grid) {
  const n = grid.size, h = grid.spacing, { u, v, divergence } = grid;
  let max = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const d = (u[uIndex(grid, i + 1, j)] - u[uIndex(grid, i, j)]
        + v[vIndex(grid, i, j + 1)] - v[vIndex(grid, i, j)]) / h;
      divergence[cellIndex(grid, i, j)] = d;
      max = Math.max(max, Math.abs(d));
    }
  }
  return max;
}

/**
 * Project velocity onto the divergence-free subspace. Solves the 5-point
 * pressure Poisson equation (Neumann at walls) by red-black Gauss-Seidel
 * with SOR, then subtracts the pressure gradient at interior faces and
 * re-pins wall faces. (Jacobi is not used: its checkerboard error mode has
 * amplification exactly -1 and never damps.) Wall faces are boundary
 * conditions, held at 0; callers must not treat them as unknowns.
 * @returns residual max |divergence| after projection.
 */
export function projectVelocity(grid, iterations = 200) {
  const n = grid.size, h = grid.spacing, { u, v } = grid;
  maxDivergence(grid);
  const rhs = grid.divergence;
  const p = grid.pressure;
  p.fill(0);
  const h2 = h * h;
  const omega = 1.7;
  for (let it = 0; it < iterations; it++) {
    for (let color = 0; color < 2; color++) {
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          if (((i + j) & 1) !== color) continue;
          const c = cellIndex(grid, i, j);
          let sum = 0, count = 0;
          if (i > 0) { sum += p[cellIndex(grid, i - 1, j)]; count++; }
          if (i < n - 1) { sum += p[cellIndex(grid, i + 1, j)]; count++; }
          if (j > 0) { sum += p[cellIndex(grid, i, j - 1)]; count++; }
          if (j < n - 1) { sum += p[cellIndex(grid, i, j + 1)]; count++; }
          const gs = (sum - h2 * rhs[c]) / count;
          p[c] += omega * (gs - p[c]);
        }
      }
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i <= n; i++) {
      const c = uIndex(grid, i, j);
      if (i === 0 || i === n) { u[c] = 0; continue; } // wall face
      u[c] -= (p[cellIndex(grid, i, j)] - p[cellIndex(grid, i - 1, j)]) / h;
    }
  }
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i < n; i++) {
      const c = vIndex(grid, i, j);
      if (j === 0 || j === n) { v[c] = 0; continue; } // wall face
      v[c] -= (p[cellIndex(grid, i, j)] - p[cellIndex(grid, i, j - 1)]) / h;
    }
  }
  return maxDivergence(grid);
}

function bilinear(field, nx, ny, fx, fy) {
  const cx = Math.min(nx - 1.001, Math.max(0, fx));
  const cy = Math.min(ny - 1.001, Math.max(0, fy));
  const i = Math.floor(cx), j = Math.floor(cy);
  const tx = cx - i, ty = cy - j;
  const a = field[j * nx + i], b = field[j * nx + i + 1];
  const c = field[(j + 1) * nx + i], d = field[(j + 1) * nx + i + 1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

/** Interpolate the staggered velocity at an arbitrary position. */
export function sampleVelocity(grid, x, y) {
  const n = grid.size, h = grid.spacing;
  const uu = bilinear(grid.u, n + 1, n, x / h, y / h - 0.5);
  const vv = bilinear(grid.v, n, n + 1, x / h - 0.5, y / h);
  return [uu, vv];
}

/** Semi-Lagrangian advection of a cell-centered scalar field. */
export function advectField(grid, field, dt) {
  const n = grid.size, h = grid.spacing, { u, v } = grid;
  const out = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const uc = 0.5 * (u[uIndex(grid, i, j)] + u[uIndex(grid, i + 1, j)]);
      const vc = 0.5 * (v[vIndex(grid, i, j)] + v[vIndex(grid, i, j + 1)]);
      const x = (i + 0.5) * h - uc * dt;
      const y = (j + 0.5) * h - vc * dt;
      out[cellIndex(grid, i, j)] = bilinear(field, n, n, x / h - 0.5, y / h - 0.5);
    }
  }
  return out;
}

function advectVelocity(grid, dt) {
  const n = grid.size, h = grid.spacing;
  const newU = new Float64Array(grid.u.length);
  const newV = new Float64Array(grid.v.length);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i <= n; i++) {
      if (i === 0 || i === n) { newU[uIndex(grid, i, j)] = 0; continue; }
      const x = i * h, y = (j + 0.5) * h;
      const [vx, vy] = sampleVelocity(grid, x, y);
      const [su] = sampleVelocity(grid, x - vx * dt, y - vy * dt);
      newU[uIndex(grid, i, j)] = su;
    }
  }
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i < n; i++) {
      if (j === 0 || j === n) { newV[vIndex(grid, i, j)] = 0; continue; }
      const x = (i + 0.5) * h, y = j * h;
      const [vx, vy] = sampleVelocity(grid, x, y);
      const [, sv] = sampleVelocity(grid, x - vx * dt, y - vy * dt);
      newV[vIndex(grid, i, j)] = sv;
    }
  }
  grid.u.set(newU);
  grid.v.set(newV);
}

/**
 * One smoke step: buoyancy on v faces (dense smoke sinks slightly, hot
 * smoke rises), advect velocity, project, advect density + temperature.
 * @returns residual max |divergence| after projection.
 */
export function smokeStep(grid, dt, options = {}) {
  const alpha = options.densityWeight ?? -0.4;
  const beta = options.temperatureWeight ?? 1.6;
  const ambient = options.ambient ?? 0;
  const n = grid.size;
  for (let j = 1; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const below = cellIndex(grid, i, j - 1), above = cellIndex(grid, i, j);
      const dAvg = 0.5 * (grid.density[below] + grid.density[above]);
      const tAvg = 0.5 * (grid.temperature[below] + grid.temperature[above]);
      grid.v[vIndex(grid, i, j)] += dt * (alpha * dAvg + beta * (tAvg - ambient));
    }
  }
  advectVelocity(grid, dt);
  const residual = projectVelocity(grid, options.iterations ?? 200);
  grid.density.set(advectField(grid, grid.density, dt));
  grid.temperature.set(advectField(grid, grid.temperature, dt));
  grid.time += dt;
  return residual;
}
