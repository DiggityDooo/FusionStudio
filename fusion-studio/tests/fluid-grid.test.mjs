import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFluidGrid, maxDivergence, projectVelocity, advectField, smokeStep,
} from '../src/fluid-grid.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6d2b79f5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

test('pressure projection drives divergence to solver tolerance', () => {
  const grid = createFluidGrid(16);
  const n = 16;
  const rand = rng(3);
  for (let c = 0; c < grid.u.length; c++) grid.u[c] = rand() * 2 - 1;
  for (let c = 0; c < grid.v.length; c++) grid.v[c] = rand() * 2 - 1;
  // Wall faces are boundary conditions (held at 0), not unknowns: a random
  // wall state is physically meaningless and makes the Neumann problem
  // incompatible. Zero them, as every solver step maintains them.
  for (let j = 0; j < n; j++) { grid.u[j * (n + 1)] = 0; grid.u[j * (n + 1) + n] = 0; }
  for (let i = 0; i < n; i++) { grid.v[i] = 0; grid.v[n * n + i] = 0; }
  const before = maxDivergence(grid);
  assert.ok(before > 0.1, `before ${before}`);
  const residual = projectVelocity(grid, 400);
  assert.ok(residual < 1e-6, `residual ${residual}`);
  assert.ok(residual < before * 1e-5, 'orders of magnitude reduction');
});

test('projection leaves an already divergence-free field unchanged', () => {
  const grid = createFluidGrid(16);
  const n = 16;
  // Streamfunction on corners, zero on the boundary so wall faces are 0.
  // u = dpsi/dy along vertical edges, v = -dpsi/dx along horizontal edges:
  // the MAC divergence of a discrete curl is exactly zero.
  const psi = new Float64Array((n + 1) * (n + 1));
  const P = (i, j) => psi[j * (n + 1) + i];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) psi[j * (n + 1) + i] = Math.sin(Math.PI * i / n) * Math.sin(Math.PI * j / n);
  for (let j = 0; j < n; j++) for (let i = 0; i <= n; i++) grid.u[j * (n + 1) + i] = P(i, j + 1) - P(i, j);
  for (let j = 0; j <= n; j++) for (let i = 0; i < n; i++) grid.v[j * n + i] = -(P(i + 1, j) - P(i, j));
  assert.ok(maxDivergence(grid) < 1e-12, 'constructed field is divergence-free');
  const u0 = Float64Array.from(grid.u), v0 = Float64Array.from(grid.v);
  projectVelocity(grid, 400);
  let maxChange = 0;
  for (let c = 0; c < grid.u.length; c++) maxChange = Math.max(maxChange, Math.abs(grid.u[c] - u0[c]));
  for (let c = 0; c < grid.v.length; c++) maxChange = Math.max(maxChange, Math.abs(grid.v[c] - v0[c]));
  assert.ok(maxChange < 1e-9, `change ${maxChange}`);
});

test('advection moves a density blob with the flow', () => {
  const grid = createFluidGrid(24);
  grid.u.fill(2); // 2 cells/sec in +x
  const n = 24;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const dx = i - 6, dy = j - 12;
    grid.density[j * n + i] = Math.exp(-(dx * dx + dy * dy) / 4);
  }
  const centroid = (field) => {
    let mass = 0, x = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const m = field[j * n + i]; mass += m; x += i * m; }
    return { mass, x: x / mass };
  };
  const before = centroid(grid.density);
  const moved = advectField(grid, grid.density, 1.0); // expect +2 cells
  const after = centroid(moved);
  assert.ok(Math.abs(after.x - (before.x + 2)) < 0.05, `centroid ${before.x} -> ${after.x}`);
  assert.ok(after.mass > before.mass * 0.95, 'mass approximately conserved');
});

test('hot smoke rises and stays bounded', () => {
  const grid = createFluidGrid(20);
  const n = 20;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const dx = i - 10, dy = j - 3;
    const r2 = dx * dx + dy * dy;
    if (r2 < 9) { grid.density[j * n + i] = 1; grid.temperature[j * n + i] = 2; }
  }
  const centroidY = () => {
    let mass = 0, y = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const m = grid.density[j * n + i]; mass += m; y += j * m; }
    return y / mass;
  };
  const y0 = centroidY();
  let residual = 0;
  for (let s = 0; s < 30; s++) residual = smokeStep(grid, 0.05, { iterations: 200 });
  assert.ok(centroidY() > y0 + 0.3, `rose ${y0} -> ${centroidY()}`);
  let maxDensity = 0;
  for (const d of grid.density) maxDensity = Math.max(maxDensity, d);
  assert.ok(maxDensity <= 1.000001, 'no overshoot beyond initial max (monotone advection)');
  assert.ok(residual < 1e-3, `divergence stays controlled: ${residual}`);
});

test('invalid grid size rejected', () => {
  assert.throws(() => createFluidGrid(2), RangeError);
});
