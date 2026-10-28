import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentByAngle, selectPlanarRegion, buildFaceAdjacency, computeFaceNormals } from '../src/mesh-segment.js';

// Indexed unit cube [0,1]^3 (welded): 8 vertices, 12 triangles.
function cube(origin = [0, 0, 0], size = 1) {
  const [ox, oy, oz] = origin;
  const s = size;
  const c = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
  ].map(([x, y, z]) => [ox + x * s, oy + y * s, oz + z * s]);
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [3, 0, 4, 7]];
  const indices = [];
  for (const [a, b, cc, d] of quads) indices.push(a, b, cc, a, cc, d);
  return { positions: Float32Array.from(c.flat()), indices: Uint32Array.from(indices), normals: null };
}

function mergeMeshes(meshes) {
  const positions = [];
  const indices = [];
  for (const m of meshes) {
    const base = positions.length / 3;
    positions.push(...m.positions);
    for (const i of m.indices) indices.push(i + base);
  }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices), normals: null };
}

// Open tube around Y: n segments, 2 triangles per segment.
function tube(n = 16, radius = 1, height = 2) {
  const positions = [];
  const indices = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    positions.push(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    positions.push(Math.cos(a) * radius, height, Math.sin(a) * radius);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
    indices.push(a, c, b, b, c, d);
  }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices), normals: null };
}

test('cube segmentation: 90-degree edges cut, each face its own region', () => {
  const mesh = cube();
  const { regionCount, labels } = segmentByAngle(mesh, { angleThresholdDeg: 30 });
  assert.equal(regionCount, 6, 'one region per cube face');
  // The two triangles of each quad share a coplanar diagonal: same label.
  for (let q = 0; q < 6; q++) assert.equal(labels[q * 2], labels[q * 2 + 1], `quad ${q} triangles together`);
  const counts = new Map();
  for (const l of labels) counts.set(l, (counts.get(l) || 0) + 1);
  for (const [, c] of counts) assert.equal(c, 2);
  // Threshold 120 degrees merges everything into one region.
  assert.equal(segmentByAngle(mesh, { angleThresholdDeg: 120 }).regionCount, 1);
});

test('cylinder tube: region count follows the dihedral threshold exactly', () => {
  const mesh = tube(16);
  // Adjacent segment faces meet at 360/16 = 22.5 degrees.
  assert.equal(segmentByAngle(mesh, { angleThresholdDeg: 30 }).regionCount, 1, 'whole tube is one smooth region');
  assert.equal(segmentByAngle(mesh, { angleThresholdDeg: 10 }).regionCount, 16, 'each segment its own region');
  // Adjacency sanity on a middle face (the fixture has an index
  // seam at segment 0, so end faces have fewer neighbors): it has a
  // coplanar diagonal partner and 22.5-degree segment neighbors.
  const adjacency = buildFaceAdjacency(mesh);
  const middle = adjacency[16];
  assert.ok(middle.length >= 2, `middle face neighbors ${middle.length}`);
  const angles = middle.map((e) => e.angleDeg).sort((x, y) => x - y);
  assert.ok(angles[0] < 0.1, `coplanar partner across the diagonal (${angles[0]})`);
  assert.ok(angles.some((a) => Math.abs(a - 22.5) < 0.5), `segment dihedral 22.5 present (${angles.map((a) => a.toFixed(1))})`);
});

test('planar selection picks exactly the seed face plane', () => {
  const two = mergeMeshes([cube([0, 0, 0]), cube([3, 0, 0])]);
  // Find a top-facing triangle (normal +Z... cube built with y-up
  // quads: find via normals) and select with a 10-degree cone.
  const normals = computeFaceNormals(two);
  let seed = -1;
  for (let f = 0; f < 12; f++) {
    if (normals[f * 3 + 1] > 0.99) { seed = f; break; }
  }
  assert.ok(seed >= 0, 'found a top face');
  const selected = selectPlanarRegion(two, seed, { angleDeg: 10 });
  // Only the seed cube's two top triangles: the other cube's top is
  // coplanar in normal but DISCONNECTED, so it must not be selected.
  assert.equal(selected.length, 2);
  assert.ok(selected.every((f) => f < 12), 'selection stays on the seed cube');
  assert.throws(() => selectPlanarRegion(two, 999), /out of range/);
});
