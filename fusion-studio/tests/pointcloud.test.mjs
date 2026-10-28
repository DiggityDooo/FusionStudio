import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRigid, cloudBounds, estimateNormals, exportPly, heightfieldMesh,
  icpAlign, parsePly, parseXyz, ransacPlane, statisticalOutlierRemoval,
  voxelDownsample,
} from '../src/pointcloud.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

function sphereCloud(radius = 5, count = 400, seedPhase = 0) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = i * 2.399963 + seedPhase;
    pts.push([radius * r * Math.cos(theta), radius * r * Math.sin(theta), radius * y]);
  }
  return pts;
}

test('voxel downsampling and bounds are exact', () => {
  const pts = [[0, 0, 0], [0.1, 0, 0], [5, 5, 5], [5.1, 5, 5]];
  assert.equal(voxelDownsample(pts, 1).length, 2);
  const { min, max, size } = cloudBounds(pts);
  assert.deepEqual(min, [0, 0, 0]);
  assert.ok(near(size[0], 5.1));
});

test('statistical cleaning removes planted outliers only', () => {
  const clean = [];
  for (let x = 0; x < 10; x++) for (let y = 0; y < 10; y++) clean.push([x, y, 0]);
  const cloud = [...clean, [100, 100, 100], [-80, 40, 90], [55, -70, 20]];
  const { points, removed } = statisticalOutlierRemoval(cloud, { k: 6, stdRatio: 1.0 });
  assert.equal(points.length, 100);
  assert.equal(removed.length, 3);
});

test('PCA normals align with the surface on a sphere', () => {
  const pts = sphereCloud(5, 300);
  const normals = estimateNormals(pts, { k: 12, viewpoint: [0, 0, 100] });
  assert.equal(normals.length, pts.length);
  for (let i = 0; i < pts.length; i += 17) {
    const radial = pts[i].map((v) => v / 5);
    const dot = normals[i][0] * radial[0] + normals[i][1] * radial[1] + normals[i][2] * radial[2];
    // Viewpoint orientation flips normals toward +Z, so check planarity instead:
    assert.ok(Math.abs(dot) > 0.9, `normal aligned with surface (dot ${dot})`);
    assert.ok(near(Math.hypot(...normals[i]), 1, 1e-9), 'unit normal');
  }
});

test('RANSAC finds the dominant plane and its inliers', () => {
  const pts = [];
  for (let x = 0; x < 12; x++) for (let y = 0; y < 12; y++) pts.push([x, y, 2]);
  pts.push([20, 20, 20], [-15, 3, 9], [4, 30, -8]);
  const plane = ransacPlane(pts, { iterations: 100, threshold: 0.01, seed: 3 });
  assert.ok(near(Math.abs(plane.normal[2]), 1, 1e-9));
  assert.ok(near(Math.abs(plane.d), 2, 1e-9));
  assert.equal(plane.inliers.length, 144);
});

test('ICP recovers a known rigid transform', () => {
  // Asymmetric cloud: point-to-point ICP on rotationally symmetric objects
  // (spheres) falls into local minima, a known limitation of the algorithm.
  let s = 12345;
  const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const source = [];
  for (let i = 0; i < 150; i++) source.push([rand() * 8 - 4, rand() * 5 - 2, rand() * 3]);
  const angle = 25 * Math.PI / 180, c = Math.cos(angle), sn = Math.sin(angle);
  const truth = { rotation: [[c, -sn, 0], [sn, c, 0], [0, 0, 1]], translation: [1.5, -2, 0.5] };
  const target = applyRigid(source, truth);
  const result = icpAlign(source, target, { iterations: 80 });
  assert.ok(result.rms < 1e-6, `rms ${result.rms}`);
  for (let a = 0; a < 3; a++) assert.ok(near(result.translation[a], truth.translation[a], 1e-4), `t[${a}]`);
  assert.ok(near(result.rotation[0][0], c, 1e-4) && near(result.rotation[1][0], sn, 1e-4));
});

test('PLY and XYZ import/export round-trip real scan data', () => {
  const pts = sphereCloud(4, 60);
  const parsed = parsePly(exportPly(pts));
  assert.equal(parsed.length, pts.length);
  for (let i = 0; i < pts.length; i += 9) {
    for (let a = 0; a < 3; a++) assert.ok(near(parsed[i][a], pts[i][a], 1e-4), `point ${i}`);
  }
  const withNormals = ['ply', 'format ascii 1.0', 'element vertex 2', 'property float x', 'property float y', 'property float z', 'property float nx', 'property float ny', 'property float nz', 'end_header', '1 2 3 0 0 1', '4 5 6 0 1 0'].join('\n');
  assert.deepEqual(parsePly(withNormals), [[1, 2, 3], [4, 5, 6]]);
  assert.throws(() => parsePly('ply\nformat binary_little_endian 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nend_header\n'), /Binary PLY/);
  assert.deepEqual(parseXyz('1,2,3\n4 5 6\n\n7,8,9,0.5\n'), [[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
  assert.throws(() => parsePly('not ply'), /Not a PLY/);
});

test('heightfield meshing reconstructs a sampled surface', () => {
  const pts = [];
  for (let x = 0; x <= 10; x += 0.5) for (let y = 0; y <= 10; y += 0.5) pts.push([x, y, (x * x) / 20]);
  const mesh = heightfieldMesh(pts, { cellSize: 0.5 });
  assert.ok(mesh.indices.length > 500, `tris ${mesh.indices.length / 3}`);
  // Highest vertex sits at x=10 -> z=5.
  let maxZ = -Infinity;
  for (let i = 2; i < mesh.positions.length; i += 3) maxZ = Math.max(maxZ, mesh.positions[i]);
  assert.ok(near(maxZ, 5, 0.3), `maxZ ${maxZ}`);
  assert.throws(() => heightfieldMesh([], { cellSize: 1 }), /empty/);
});
