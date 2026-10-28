import test from 'node:test';
import assert from 'node:assert/strict';
import { cosineHemisphereDirection, estimateIrradiance, raySphere } from '../src/gi-sample.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('unoccluded sky: the estimator is exactly pi * radiance (zero variance)', () => {
  const open = estimateIrradiance({ point: [0, 0, 0], normal: [0, 1, 0], samples: 512, radiance: 2 });
  assert.ok(near(open.irradiance, 2 * Math.PI, 1e-9), `irradiance ${open.irradiance}`);
  assert.ok(near(open.ambientOcclusion, 1, 1e-12), 'AO is 1 up to sum rounding');
  assert.ok(open.standardError < 1e-9, 'no occlusion, no variance');
  // Direction sampler sanity: unit, in-hemisphere, deterministic
  // in the uniforms.
  const d1 = cosineHemisphereDirection([0, 1, 0], 0.25, 0.5);
  assert.ok(near(Math.hypot(...d1), 1, 1e-12), 'unit direction');
  assert.ok(d1[1] > 0, 'in the hemisphere');
  assert.ok(near(d1[1], Math.sqrt(0.75), 1e-12), 'Malley z = sqrt(1 - u1)');
  assert.deepEqual(cosineHemisphereDirection([0, 0, 1], 0.3, 0.7), cosineHemisphereDirection([0, 0, 1], 0.3, 0.7), 'deterministic');
});

test('half-blocked sky integrates to pi/2 within reported standard error', () => {
  // Analytic occluder: a vertical wall blocks every direction
  // with x > 0 — exactly half the cosine-weighted measure.
  const wall = (_origin, dir) => dir[0] > 0;
  const coarse = estimateIrradiance({ point: [0, 0, 0], normal: [0, 1, 0], isOccluded: wall, samples: 256, seed: 7 });
  const fine = estimateIrradiance({ point: [0, 0, 0], normal: [0, 1, 0], isOccluded: wall, samples: 8192, seed: 7 });
  assert.ok(Math.abs(fine.ambientOcclusion - 0.5) < 4 * fine.standardError / Math.PI + 1e-12,
    `AO ${fine.ambientOcclusion} vs analytic 0.5 (SE ${fine.standardError / Math.PI})`);
  assert.ok(Math.abs(fine.ambientOcclusion - 0.5) < 0.03, 'absolute agreement too');
  assert.ok(fine.standardError < coarse.standardError * 0.35,
    `SE shrinks ~1/sqrt(N): ${coarse.standardError} -> ${fine.standardError}`);
});

test('sphere ambient occlusion matches the cos^2(half-angle) law', () => {
  const center = [0, 2, 0], radius = 1;
  const occluder = (origin, dir) => raySphere(origin, dir, center, radius) !== null;
  const result = estimateIrradiance({
    point: [0, 0, 0], normal: [0, 1, 0], isOccluded: occluder, samples: 8192, seed: 3,
  });
  // sin(half-angle) = r / dist = 1/2, AO = 1 - sin^2 = 0.75.
  assert.ok(Math.abs(result.ambientOcclusion - 0.75) < 4 * result.standardError / Math.PI + 1e-12,
    `AO ${result.ambientOcclusion} vs analytic 0.75`);
  assert.ok(Math.abs(result.ambientOcclusion - 0.75) < 0.04);
  // Ray-sphere helper: exact t values.
  assert.ok(near(raySphere([0, 0, 0], [0, 1, 0], center, radius), 1, 1e-12), 'head-on hit at t=1');
  assert.equal(raySphere([0, 0, 0], [1, 0, 0], center, radius), null, 'perpendicular miss');
  assert.ok(near(raySphere([0, 2, 0], [0, 1, 0], center, radius), 1, 1e-12), 'from inside exits at t=1');
  // Ground-level point far from the sphere: nearly full sky.
  const far = estimateIrradiance({
    point: [10, 0, 0], normal: [0, 1, 0], isOccluded: occluder, samples: 4096, seed: 5,
  });
  assert.ok(far.ambientOcclusion > 0.99, `distant AO ${far.ambientOcclusion}`);
  assert.throws(() => estimateIrradiance({ point: [0, 0, 0], normal: [0, 1, 0], samples: 0 }), /positive integer/);
});
