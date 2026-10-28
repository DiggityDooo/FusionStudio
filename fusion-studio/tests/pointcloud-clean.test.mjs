import test from 'node:test';
import assert from 'node:assert/strict';
import { voxelDownsample, statisticalOutlierIndices, filterPoints, estimateNormals } from '../src/pointcloud-clean.js';
import { mulberry32 } from '../src/scatter.js';

const flatOf = (pts) => pts.flatMap((p) => p);

test('voxel downsample returns exact per-voxel centroids', () => {
  // 8 corners of one voxel + a lone point in another voxel.
  const pts = [];
  for (const x of [0.1, 0.9]) for (const y of [0.1, 0.9]) for (const z of [0.1, 0.9]) pts.push([x, y, z]);
  pts.push([5.5, 5.5, 5.5]);
  const { positions, count } = voxelDownsample(flatOf(pts), 1);
  assert.equal(count, 2);
  const first = [positions[0], positions[1], positions[2]];
  assert.ok(Math.abs(first[0] - 0.5) < 1e-12 && Math.abs(first[1] - 0.5) < 1e-12, 'centroid of the corner voxel');
  assert.throws(() => voxelDownsample(flatOf(pts), 0), /positive/);
  // Halving the voxel size splits the corner voxel into 8.
  assert.equal(voxelDownsample(flatOf(pts), 0.5).count, 9);
});

test('statistical outlier removal removes exactly the planted outliers', () => {
  const rng = mulberry32(13);
  const cluster = [];
  for (let i = 0; i < 200; i++) {
    // Dense ball of radius 0.5.
    const v = [rng() - 0.5, rng() - 0.5, rng() - 0.5];
    const l = Math.hypot(...v) || 1;
    const r = 0.5 * Math.cbrt(rng());
    cluster.push(v.map((x) => (x / l) * r));
  }
  const outliers = [[6, 0, 0], [-7, 2, 0], [0, 8, 1], [0, -6, -6], [9, 9, 9]];
  const all = [...cluster, ...outliers];
  const { kept } = statisticalOutlierIndices(flatOf(all), { k: 8, stdRatio: 1 });
  const keptSet = new Set(kept);
  for (let i = 0; i < outliers.length; i++) {
    assert.ok(!keptSet.has(cluster.length + i), `planted outlier ${i} removed`);
  }
  assert.ok(kept.length >= cluster.length - 5, `kept ${kept.length} of ${cluster.length} inliers`);
  const filtered = filterPoints(flatOf(all), kept);
  assert.equal(filtered.length, kept.length * 3);
});

test('PCA normals on a sphere point radially; on a plane point along Z', () => {
  // Fibonacci sphere.
  const sphere = [];
  const N = 300, golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    sphere.push([Math.cos(theta) * r * 2, y * 2, Math.sin(theta) * r * 2]);
  }
  // Viewpoint at the center: orientation rule makes normals point
  // INWARD (toward the viewpoint) — consistency is the invariant.
  const { normals, curvature } = estimateNormals(flatOf(sphere), { k: 10, viewpoint: [0, 0, 0] });
  for (let i = 0; i < N; i++) {
    const p = sphere[i];
    const n = [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]];
    const radial = Math.hypot(...p);
    const dotRadial = (n[0] * p[0] + n[1] * p[1] + n[2] * p[2]) / radial;
    assert.ok(dotRadial < -0.98, `point ${i}: normal radial (dot ${dotRadial.toFixed(3)}), oriented to viewpoint`);
    // Local patches are shallow (sagitta/spread ~ 0.01), so the
    // curvature ratio is small but orders above a true plane's 0.
    assert.ok(curvature[i] > 0.003 && curvature[i] < 0.2, `sphere curvature sane (${curvature[i]})`);
  }
  // Plane: normals exactly +-Z, curvature ~ 0.
  const plane = [];
  for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) plane.push([x * 0.3, y * 0.3, 0]);
  const flatNormals = estimateNormals(flatOf(plane), { k: 8, viewpoint: [0, 0, 5] });
  for (let i = 0; i < plane.length; i++) {
    assert.ok(Math.abs(flatNormals.normals[i * 3 + 2] - 1) < 1e-9, 'plane normal is +Z toward viewpoint');
    assert.ok(flatNormals.curvature[i] < 1e-9, 'plane curvature zero');
  }
  assert.throws(() => estimateNormals([0, 0, 0], { k: 10 }), /not enough/);
});
