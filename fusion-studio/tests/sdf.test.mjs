import test from 'node:test';
import assert from 'node:assert/strict';
import {
  raymarch, sampleSdfGrid, sdfBox, sdfCapsule, sdfCylinder, sdfGroundPlane,
  sdfIntersect, sdfNormal, sdfRepeat, sdfRotate, sdfRoundedBox, sdfScale,
  sdfShell, sdfSmoothUnion, sdfSphere, sdfSubtract, sdfToMesh, sdfTorus,
  sdfTranslate, sdfUnion,
} from '../src/sdf.js';
import { meshVolume } from '../src/mesh-section.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('SDF primitives return exact signed distances', () => {
  const sphere = sdfSphere([1, 2, 3], 2);
  assert.ok(near(sphere([1, 2, 3]), -2), 'center is -r');
  assert.ok(near(sphere([3, 2, 3]), 0), 'surface is 0');
  assert.ok(near(sphere([1, 2, 8]), 3), 'outside distance');
  const box = sdfBox([0, 0, 0], [1, 2, 3]);
  assert.ok(near(box([0, 0, 0]), -1), 'box center: -min(half)');
  assert.ok(near(box([2, 0, 0]), 1), 'box face distance');
  assert.ok(near(box([2, 3, 4]), Math.sqrt(3)), 'box corner distance sqrt(3)');
  const rounded = sdfRoundedBox([0, 0, 0], [1, 1, 1], 0.25);
  assert.ok(near(rounded([1.25, 0, 0]), 0.25), 'rounded face stands off by r-adjusted half');
  assert.ok(near(rounded([0, 0, 0]), -1), 'rounded center: -min(half) (Minkowski box+sphere reaches the face)');
  const torus = sdfTorus([0, 0, 0], 2, 0.5);
  assert.ok(near(torus([2, 0, 0]), -0.5), 'tube center is -r');
  assert.ok(near(torus([0, 0, 0]), 1.5), 'hole center: R - r');
  assert.ok(near(torus([2, 0.5, 0]), 0), 'tube surface');
  const capsule = sdfCapsule([0, -1, 0], [0, 1, 0], 0.5);
  assert.ok(near(capsule([1, 0, 0]), 0.5), 'capsule side distance');
  assert.ok(near(capsule([0, 2, 0]), 0.5), 'capsule cap distance');
  assert.ok(near(capsule([0, 0, 0]), -0.5), 'capsule spine is -r');
  const cylinder = sdfCylinder([0, 0, 0], 1, 2);
  assert.ok(near(cylinder([0, 0, 0]), -1), 'cylinder core');
  assert.ok(near(cylinder([0, 2, 0]), 1), 'cylinder cap distance');
  assert.ok(near(sdfGroundPlane(0.5)([0, 2, 0]), 1.5), 'plane distance');
});

test('CSG composition: hard ops are exact, smooth union matches the polynomial law', () => {
  const a = sdfSphere([-0.5, 0, 0], 1);
  const b = sdfSphere([0.5, 0, 0], 1);
  assert.ok(near(sdfUnion(a, b)([0, 0, 0]), -0.5), 'union takes min');
  assert.ok(near(sdfIntersect(a, b)([0, 0, 0]), -0.5), 'lens center inside both');
  assert.ok(near(sdfIntersect(a, b)([-1.2, 0, 0]), 0.7), 'outside B bounds the intersection');
  const carved = sdfSubtract(sdfSphere([0, 0, 0], 2), sdfSphere([1.5, 0, 0], 1));
  assert.ok(carved([1.5, 0, 0]) > 0, 'tool center is carved out of the material');
  assert.ok(near(carved([-1, 0, 0]), -1), 'far side of the base sphere intact');
  // At the symmetry plane both distances equal d; polynomial
  // smooth-min gives exactly d - k/4 there.
  const k = 0.4;
  const d = a([0, 0, 0]);
  const smooth = sdfSmoothUnion(a, b, k)([0, 0, 0]);
  assert.ok(near(smooth, d - k / 4, 1e-12), `smooth union ${smooth} vs ${d - k / 4}`);
  assert.ok(smooth < Math.min(a([0, 0, 0]), b([0, 0, 0])), 'blend dips below the hard union (material bridges)');
  const shell = sdfShell(sdfSphere([0, 0, 0], 2), 0.4);
  assert.ok(near(shell([0, 0, 0]), 1.8), 'hollow core: |sdf| - t/2');
  assert.ok(near(shell([2.2, 0, 0]), 0, 1e-12), 'shell outer wall lies on the zero level');
  assert.throws(() => sdfUnion(), /at least one/);
});

test('domain transforms move and tile the field exactly', () => {
  const moved = sdfTranslate(sdfSphere([0, 0, 0], 1), [3, 0, 0]);
  assert.ok(near(moved([3, 0, 0]), -1) && near(moved([0, 0, 0]), 2), 'translated sphere');
  const scaled = sdfScale(sdfSphere([0, 0, 0], 1), 2);
  assert.ok(near(scaled([0, 0, 0]), -2) && near(scaled([3, 0, 0]), 1), 'uniform scale doubles distances');
  const rot90 = [[0, -1, 0], [1, 0, 0], [0, 0, 1]];
  const rotated = sdfRotate(sdfCapsule([0, -1, 0], [0, 1, 0], 0.5), rot90);
  assert.ok(near(rotated([0, 1, 0]), 0.5, 1e-9), 'capsule rotated onto X axis: (0,1,0) is r above the end region');
  assert.ok(near(rotated([1, 0, 0]), -0.5), 'rotated spine passes through (1,0,0)');
  const repeated = sdfRepeat(sdfSphere([0, 0, 0], 0.4), [2, 2, 2]);
  assert.ok(near(repeated([2, 0, 0]), -0.4) && near(repeated([4, -2, 2]), -0.4), 'every cell holds a sphere');
  assert.ok(near(repeated([1, 0, 0]), 0.6), 'cell boundary point sees the nearest copy');
});

test('sphere tracing lands on analytic surfaces; normals point outward', () => {
  const sphere = sdfSphere([0, 0, 0], 1);
  const hit = raymarch(sphere, [0, 0, 5], [0, 0, -1]);
  assert.ok(hit && near(hit.t, 4, 1e-5), `sphere hit at t=${hit?.t} (exact 4)`);
  assert.ok(near(hit.point[2], 1, 1e-5));
  assert.equal(raymarch(sphere, [0, 3, 5], [0, 0, -1]), null, 'parallel miss');
  assert.equal(raymarch(sphere, [0, 0, 5], [0, 0, 1]), null, 'pointing away');
  const boxHit = raymarch(sdfBox([0, 0, 0], [1, 1, 1]), [5, 0.5, 0.5], [-1, 0, 0]);
  assert.ok(boxHit && near(boxHit.t, 4, 1e-4), `box hit at ${boxHit?.t}`);
  const n = sdfNormal(sphere, [0, 0, 1]);
  assert.ok(near(n[2], 1, 1e-6) && near(Math.hypot(...n), 1), 'sphere normal is radial');
  const unionHit = raymarch(sdfUnion(sdfSphere([0, 0, 0], 1), sdfSphere([3, 0, 0], 1)), [-5, 0, 0], [1, 0, 0]);
  assert.ok(unionHit && near(unionHit.t, 4, 1e-5), 'tracer stops at the first union surface');
  assert.throws(() => raymarch(sphere, [0, 0, 5], [0, 0, 0]), /non-zero/);
});

test('extracted SDF meshes close on analytic volumes; grid sampler is exact at nodes', () => {
  const sphereMesh = sdfToMesh(sdfSphere([0, 0, 0], 1), { min: [-1.3, -1.3, -1.3], max: [1.3, 1.3, 1.3], res: 36 });
  const sphereVol = Math.abs(meshVolume(sphereMesh));
  const analytic = (4 / 3) * Math.PI;
  assert.ok(Math.abs(sphereVol - analytic) / analytic < 0.04, `sphere volume ${sphereVol.toFixed(3)} vs ${analytic.toFixed(3)}`);
  // Every extracted vertex lies on the surface (interpolated
  // zero-crossings), and gradient normals are unit length.
  const sphere = sdfSphere([0, 0, 0], 1);
  for (let i = 0; i < sphereMesh.positions.length; i += 3) {
    const p = [sphereMesh.positions[i], sphereMesh.positions[i + 1], sphereMesh.positions[i + 2]];
    assert.ok(Math.abs(sphere(p)) < 0.03, `vertex on surface (sdf ${sphere(p).toFixed(4)})`);
    assert.ok(near(Math.hypot(sphereMesh.normals[i], sphereMesh.normals[i + 1], sphereMesh.normals[i + 2]), 1, 1e-3), 'unit normal');
  }
  // Union of two r=1 spheres 1 apart: analytic overlap is the
  // symmetric lens 5*pi/12.
  const unionMesh = sdfToMesh(
    sdfUnion(sdfSphere([-0.5, 0, 0], 1), sdfSphere([0.5, 0, 0], 1)),
    { min: [-1.8, -1.3, -1.3], max: [1.8, 1.3, 1.3], res: 40 },
  );
  const unionVol = Math.abs(meshVolume(unionMesh));
  const unionAnalytic = 2 * analytic - (5 * Math.PI) / 12;
  assert.ok(Math.abs(unionVol - unionAnalytic) / unionAnalytic < 0.05, `union volume ${unionVol.toFixed(3)} vs ${unionAnalytic.toFixed(3)}`);
  // Subtracted mesh is strictly smaller than the base sphere.
  const carvedMesh = sdfToMesh(
    sdfSubtract(sdfSphere([0, 0, 0], 1.2), sdfSphere([0.9, 0, 0], 0.7)),
    { min: [-1.5, -1.5, -1.5], max: [1.5, 1.5, 1.5], res: 36 },
  );
  const carvedVol = Math.abs(meshVolume(carvedMesh));
  assert.ok(carvedVol < (4 / 3) * Math.PI * 1.2 ** 3 * 0.98, `carved volume ${carvedVol.toFixed(3)} shrinks`);
  // Grid sampler: node at the sphere center holds -r exactly.
  const grid = sampleSdfGrid(sdfSphere([0, 0, 0], 1), { min: [-1, -1, -1], max: [1, 1, 1], res: 2 });
  const n = 3;
  assert.ok(near(grid.values[1 + n * (1 + n * 1)], -1, 1e-6), 'center voxel (index 13) is -r');
  assert.ok(near(grid.values[0], Math.sqrt(3) - 1, 1e-6), 'corner voxel distance (Float32 grid)');
});
