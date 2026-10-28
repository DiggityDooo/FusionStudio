import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLattice, estimateRelativeDensity } from '../src/lattice.js';

function bounds(mesh) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], mesh.positions[i + a]);
      max[a] = Math.max(max[a], mesh.positions[i + a]);
    }
  }
  return { min, max };
}

function componentCount(mesh) {
  // Union-find over triangles: each prism is its own component.
  const parent = new Map();
  const find = (x) => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r);
    return r;
  };
  const add = (x) => { if (!parent.has(x)) parent.set(x, x); };
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]];
    add(a); add(b); add(c);
    parent.set(find(a), find(b));
    parent.set(find(a), find(c));
  }
  return new Set([...parent.keys()].map(find)).size;
}

test('grid lattice: strut count, structure, and bounds are exact', () => {
  const mesh = generateLattice({ size: [2, 2, 2], cell: 1, type: 'grid', strutRadius: 0.05, sides: 6 });
  // Cells 2x2x2: struts per axis = 2 * 3 * 3 = 18; total 54.
  assert.equal(mesh.meta.strutCount, 54);
  assert.deepEqual(mesh.meta.cells, [2, 2, 2]);
  assert.equal(componentCount(mesh), 54, 'each strut is a separate prism component');
  // Each prism: 2*sides ring verts + 2 cap centers; 4*sides triangles.
  assert.equal(mesh.positions.length / 3, 54 * (2 * 6 + 2));
  assert.equal(mesh.indices.length, 54 * 4 * 6 * 3);
  const { min, max } = bounds(mesh);
  // Boundary struts bleed one radius past the nominal box (untrimmed).
  assert.ok(Math.abs(min[0] + 0.05) < 1e-6 && Math.abs(max[0] - 2.05) < 1e-6, 'spans the box plus strut radius');
  // Total strut length: 54 struts of length 1.
  assert.ok(Math.abs(mesh.meta.totalStrutLength - 54) < 1e-9);
});

test('bcc lattice: corner-to-center struts with diagonal lengths', () => {
  const mesh = generateLattice({ size: [2, 2, 2], cell: 2, type: 'bcc', strutRadius: 0.05 });
  assert.equal(mesh.meta.strutCount, 8, 'one cell, 8 corners to center');
  const diagonal = Math.hypot(1, 1, 1);
  assert.ok(Math.abs(mesh.meta.totalStrutLength - 8 * diagonal) < 1e-9);
  const finer = generateLattice({ size: [2, 2, 2], cell: 1, type: 'bcc', strutRadius: 0.05 });
  assert.equal(finer.meta.strutCount, 64, '8 cells x 8 struts');
});

test('mesh volume is bracketed by the analytic strut volume', () => {
  const params = { size: [3, 3, 3], cell: 1, type: 'grid', strutRadius: 0.05, sides: 32 };
  const mesh = generateLattice(params);
  // Signed volume via divergence theorem.
  const p = mesh.positions, idx = mesh.indices;
  let volume = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
    volume += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
      - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c])
      + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
  }
  volume = Math.abs(volume);
  const density = estimateRelativeDensity(params);
  const analyticMaterial = density * 27;
  // Divergence sum over closed prisms equals the per-strut sum (the
  // union volume would be smaller at joints, but is not what either
  // number computes -- both are the stated upper bound).
  assert.ok(Math.abs(volume - analyticMaterial) / analyticMaterial < 0.01,
    `mesh volume ${volume.toFixed(3)} vs analytic ${analyticMaterial.toFixed(3)}`);
  assert.ok(density > 0 && density < 0.2, `relative density ${density.toFixed(4)} is a light lattice`);
});

test('relative density scales with strut radius squared and cell size', () => {
  const base = estimateRelativeDensity({ size: [3, 3, 3], cell: 1, type: 'grid', strutRadius: 0.05 });
  const thicker = estimateRelativeDensity({ size: [3, 3, 3], cell: 1, type: 'grid', strutRadius: 0.1 });
  assert.ok(Math.abs(thicker / base - 4) < 0.01, 'area scales as r^2');
  const coarser = estimateRelativeDensity({ size: [3, 3, 3], cell: 3, type: 'grid', strutRadius: 0.05 });
  assert.ok(coarser < base, 'bigger cells are lighter at fixed strut radius');
});

test('validation errors are explicit', () => {
  assert.throws(() => generateLattice({ size: [0, 1, 1] }), /must be positive/);
  assert.throws(() => generateLattice({ cell: -1 }), /must be positive/);
  assert.throws(() => generateLattice({ type: 'diamond' }), /unknown cell type/);
  assert.throws(() => generateLattice({ sides: 2 }), /sides must be/);
});
