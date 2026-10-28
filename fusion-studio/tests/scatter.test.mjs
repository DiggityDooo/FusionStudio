import test from 'node:test';
import assert from 'node:assert/strict';
import { poissonDiskScatter, densityScatter, alignToNormal, placeOnHeightfield, mulberry32 } from '../src/scatter.js';

test('poisson-disk scatter guarantees minimum separation and stays in domain', () => {
  const domain = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
  const points = poissonDiskScatter({ count: 80, minDist: 1.2, domain, seed: 42 });
  assert.ok(points.length >= 40, `placed a useful number (${points.length})`);
  for (const [x, z] of points) {
    assert.ok(x >= -5 && x <= 5 && z >= -5 && z <= 5);
  }
  // Brute-force pairwise oracle.
  let minPair = Infinity;
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    minPair = Math.min(minPair, Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]));
  }
  assert.ok(minPair >= 1.2 - 1e-9, `min pairwise distance ${minPair} >= 1.2`);
  // Determinism: same seed -> identical layout; different seed -> different.
  assert.deepEqual(poissonDiskScatter({ count: 80, minDist: 1.2, domain, seed: 42 }), points);
  assert.notDeepEqual(poissonDiskScatter({ count: 80, minDist: 1.2, domain, seed: 43 }), points);
  assert.throws(() => poissonDiskScatter({ minDist: 0 }), /positive/);
});

test('density scatter follows the field: half-plane support and ramp mean shift', () => {
  const domain = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
  const leftOnly = densityScatter({ count: 60, density: (x) => (x < 0 ? 1 : 0), domain, seed: 5 });
  assert.equal(leftOnly.length, 60);
  assert.ok(leftOnly.every(([x]) => x < 0), 'zero-density region stays empty');
  const ramp = densityScatter({ count: 300, density: (x) => (x + 10) / 20, domain, seed: 6, maxAttempts: 100000 });
  assert.equal(ramp.length, 300);
  const meanX = ramp.reduce((s, p) => s + p[0], 0) / ramp.length;
  // Analytic mean for density ~ (x+10)/20 on [-10,10] is +10/3.
  assert.ok(Math.abs(meanX - 10 / 3) < 1.2, `ramp mean ${meanX.toFixed(2)} near analytic 3.33`);
  assert.throws(() => densityScatter({ density: null }), /density function/);
});

test('alignToNormal produces orthonormal bases with random spin', () => {
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  for (const n of [[0, 1, 0], [0, 0, 1], [1, 2, 3], [0, -1, 0]]) {
    const { tangent, normal, bitangent } = alignToNormal(n, 0.37);
    for (const v of [tangent, normal, bitangent]) assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-9);
    assert.ok(Math.abs(dot(tangent, normal)) < 1e-9);
    assert.ok(Math.abs(dot(bitangent, normal)) < 1e-9);
    assert.ok(Math.abs(dot(tangent, bitangent)) < 1e-9);
    const nl = Math.hypot(...n);
    assert.ok(Math.abs(dot(normal, n.map((v) => v / nl)) - 1) < 1e-9, 'normal axis preserved');
  }
  assert.throws(() => alignToNormal([0, 0, 0]), /zero normal/);
});

test('heightfield placement respects slope and altitude masks, aligns to slope', () => {
  const points = poissonDiskScatter({ count: 200, minDist: 0.8, domain: { minX: -6, maxX: 6, minZ: -6, maxZ: 6 }, seed: 9 });
  // Hillside: height = x (45 degree slope everywhere) -> slope mag 1.
  const steep = placeOnHeightfield(points, (x) => x, { maxSlope: 0.5, seed: 3 });
  assert.equal(steep.length, 0, '45-degree slope exceeds the 0.5 mask');
  const gentle = placeOnHeightfield(points, (x) => x, { maxSlope: 2, seed: 3 });
  assert.equal(gentle.length, points.length);
  // Normal for height=x is (-1, 1, 0)/sqrt(2): basis Y must match it,
  // and instances sit exactly on the surface.
  const expected = [-Math.SQRT1_2, Math.SQRT1_2, 0];
  for (const inst of gentle) {
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(inst.basis.normal[i] - expected[i]) < 1e-9);
    assert.equal(inst.position[1], inst.position[0], 'on the heightfield');
    assert.ok(inst.scale >= 0.8 && inst.scale <= 1.3);
  }
  // Altitude band keeps only the middle strip.
  const band = placeOnHeightfield(points, (x) => x, { minHeight: -2, maxHeight: 2, seed: 3 });
  assert.ok(band.length > 0 && band.length < points.length);
  assert.ok(band.every((inst) => Math.abs(inst.position[1]) <= 2));
});

test('mulberry32 is deterministic and uniform-ish', () => {
  const a = mulberry32(123); const b = mulberry32(123);
  let sum = 0;
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
  const rng = mulberry32(7);
  for (let i = 0; i < 5000; i++) sum += rng();
  const mean = sum / 5000;
  assert.ok(Math.abs(mean - 0.5) < 0.03, `mean ${mean}`);
});
