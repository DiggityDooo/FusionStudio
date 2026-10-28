import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOcean, oceanEnergy, oceanHeightAt, oceanHeightfield, oceanNormals,
} from '../src/ocean.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('single spectral mode produces the exact cosine wave', () => {
  const ocean = createOcean({ gridSize: 16, worldSize: 16, seed: 3 });
  ocean.h0.fill(0);
  // Mode (1, 0) and its conjugate partner (15, 0), real amplitude 0.5.
  ocean.h0[(0 * 16 + 1) * 2] = 0.5;
  ocean.h0[(0 * 16 + 15) * 2] = 0.5;
  const field = oceanHeightfield(ocean, 0);
  // The conjugate pair sums to a standing wave of amplitude 2 * 0.5 * 2 = 2.
  for (let ix = 0; ix < 16; ix++) {
    assert.ok(near(field[ix], 2 * Math.cos(2 * Math.PI * ix / 16), 1e-6), `node ${ix}: ${field[ix]}`);
    assert.ok(near(oceanHeightAt(ocean, ix, 0, 0), field[ix], 1e-6), 'direct sum agrees');
  }
  const omega = Math.sqrt(9.81 * (2 * Math.PI / 16));
  const quarter = oceanHeightfield(ocean, Math.PI / 2 / omega);
  assert.ok(Math.abs(quarter[0]) < 1e-6 && Math.abs(quarter[4]) < 1e-6, 'standing wave node at quarter period');
  const half = oceanHeightfield(ocean, Math.PI / omega);
  assert.ok(near(half[0], -2, 1e-6), 'inverted at half period');
});

test('IFFT heightfield matches direct modal sums on a random sea', () => {
  const ocean = createOcean({ gridSize: 16, worldSize: 60, windSpeed: 9, seed: 11 });
  const field = oceanHeightfield(ocean, 1.7);
  // Heights are stored Float32 (mesh convention): agreement is relative.
  let maxDiff = 0, maxAbs = 0;
  for (let iz = 0; iz < 16; iz += 3) {
    for (let ix = 0; ix < 16; ix += 3) {
      const direct = oceanHeightAt(ocean, ix * 60 / 16, iz * 60 / 16, 1.7);
      maxDiff = Math.max(maxDiff, Math.abs(direct - field[iz * 16 + ix]));
      maxAbs = Math.max(maxAbs, Math.abs(field[iz * 16 + ix]));
    }
  }
  assert.ok(maxDiff / maxAbs < 1e-6, `relative diff ${maxDiff / maxAbs}`);
  assert.ok(field.every(Number.isFinite));
  const normals = oceanNormals(field, ocean);
  for (let i = 0; i < normals.length; i += 3) {
    assert.ok(near(Math.hypot(normals[i], normals[i + 1], normals[i + 2]), 1, 1e-6), 'unit normal');
  }
});

test('Phillips spectrum concentrates energy downwind and is deterministic', () => {
  const ocean = createOcean({ gridSize: 64, worldSize: 200, windSpeed: 14, windAngle: 0, seed: 5 });
  const n = 64;
  const freq = (i) => (i <= n / 2 ? i : i - n);
  let downSum = 0, downCount = 0, crossSum = 0, crossCount = 0;
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
    const kx = freq(ix), kz = freq(iz);
    const k = Math.hypot(kx, kz);
    if (k < 3 || k > 9) continue; // one radial ring, grid units
    const dot = Math.abs(kx / k); // wind along +x
    const e = ocean.h0[(iz * n + ix) * 2] ** 2 + ocean.h0[(iz * n + ix) * 2 + 1] ** 2;
    if (dot > 0.85) { downSum += e; downCount++; }
    if (dot < 0.35) { crossSum += e; crossCount++; }
  }
  assert.ok(downCount > 0 && crossCount > 0);
  const ratio = (downSum / downCount) / (crossSum / crossCount);
  assert.ok(ratio > 2, `downwind/crosswind energy density ratio ${ratio}`);
  const again = createOcean({ gridSize: 64, worldSize: 200, windSpeed: 14, windAngle: 0, seed: 5 });
  assert.deepEqual([...again.h0.slice(0, 32)], [...ocean.h0.slice(0, 32)], 'same seed, same spectrum');
  const other = createOcean({ gridSize: 64, worldSize: 200, windSpeed: 14, windAngle: 0, seed: 6 });
  assert.notDeepEqual([...other.h0.slice(0, 32)], [...ocean.h0.slice(0, 32)]);
  assert.ok(oceanEnergy(ocean) > 0);
  assert.throws(() => createOcean({ gridSize: 48 }), /power of two/);
});
