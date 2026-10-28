import test from 'node:test';
import assert from 'node:assert/strict';
import { weldVertices, removeDegenerateTriangles, removeUnreferencedVertices, cleanupMesh } from '../src/mesh-cleanup.js';
import { meshVolume } from '../src/mesh-section.js';

// Triangle-soup cube: 12 triangles, 36 vertices (no sharing).
function soupCube() {
  const c = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
  ];
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [3, 0, 4, 7]];
  const positions = [];
  const indices = [];
  for (const [a, b, cc, d] of quads) {
    for (const tri of [[a, b, cc], [a, cc, d]]) {
      for (const idx of tri) {
        indices.push(positions.length / 3);
        positions.push(...c[idx]);
      }
    }
  }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices), normals: null };
}

test('welding a soup cube recovers the 8-vertex indexed cube, volume exact', () => {
  const soup = soupCube();
  const { mesh, weldedCount } = weldVertices(soup);
  assert.equal(mesh.positions.length / 3, 8);
  assert.equal(weldedCount, 28);
  assert.equal(mesh.indices.length, 36);
  assert.ok(Math.abs(Math.abs(meshVolume(mesh)) - 1) < 1e-9, 'welded cube volume still exactly 1');
  // Welding again is a no-op (idempotent).
  const again = weldVertices(mesh);
  assert.equal(again.weldedCount, 0);
  // Tolerance semantics: vertices 0.001 apart weld at tol 0.01, not at 1e-6.
  const near = {
    positions: Float32Array.from([0, 0, 0, 0.001, 0, 0, 0, 1, 0]),
    indices: Uint32Array.from([0, 1, 2]),
    normals: null,
  };
  assert.equal(weldVertices(near, { tolerance: 0.01 }).mesh.positions.length / 3, 2);
  assert.equal(weldVertices(near, { tolerance: 1e-6 }).mesh.positions.length / 3, 3);
});

test('degenerate removal counts exactly: repeated indices and slivers', () => {
  const positions = Float32Array.from([
    0, 0, 0, 1, 0, 0, 0, 1, 0, // good triangle (0,1,2)
    2, 0, 0, 3, 0, 0, 2, 1, 0, // good triangle (3,4,5)
    0, 0, 0, 0, 0, 0, 0, 0, 0, // degenerate point (6,7,8)
  ]);
  const indices = Uint32Array.from([
    0, 1, 2,
    3, 4, 5,
    0, 0, 2, // repeated index
    6, 7, 8, // zero area
    0, 1, 1, // repeated index
  ]);
  const { mesh, removed } = removeDegenerateTriangles({ positions, indices, normals: null });
  assert.equal(removed, 3);
  assert.equal(mesh.indices.length, 6);
});

test('cleanup pipeline: stats and geometry preservation on a dirty cube', () => {
  const dirty = soupCube();
  // Plant an unreferenced vertex and a degenerate triangle.
  const positions = Array.from(dirty.positions);
  positions.push(9, 9, 9);
  const indices = Array.from(dirty.indices);
  const orphanIndex = positions.length / 3 - 1;
  indices.push(0, 0, 1); // degenerate
  const meshIn = {
    positions: Float32Array.from(positions),
    indices: Uint32Array.from(indices),
    normals: null,
  };
  void orphanIndex;
  const { mesh, stats } = cleanupMesh(meshIn);
  assert.equal(stats.verticesBefore, 37);
  assert.equal(stats.verticesAfter, 8);
  assert.equal(stats.trianglesBefore, 13);
  assert.equal(stats.trianglesAfter, 12);
  assert.equal(stats.degenerateRemoved, 1);
  assert.equal(stats.unreferencedRemoved, 1);
  assert.ok(Math.abs(Math.abs(meshVolume(mesh)) - 1) < 1e-9, 'geometry untouched by cleanup');
  // Every remaining vertex is referenced.
  const used = new Set(mesh.indices);
  assert.equal(used.size, 8);
});

test('unreferenced compaction remaps indices correctly', () => {
  const positions = Float32Array.from([0, 0, 0, 5, 5, 5, 1, 0, 0, 0, 1, 0, 9, 9, 9]);
  const mesh = { positions, indices: Uint32Array.from([0, 2, 3]), normals: null };
  const { mesh: out, removedCount } = removeUnreferencedVertices(mesh);
  assert.equal(removedCount, 2);
  assert.deepEqual(Array.from(out.indices), [0, 1, 2]);
  // The kept triangle's corners survived intact.
  assert.deepEqual(Array.from(out.positions), [0, 0, 0, 1, 0, 0, 0, 1, 0]);
});
