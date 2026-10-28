import test from 'node:test';
import assert from 'node:assert/strict';
import { heightfieldSlopes, splatCoverage, splatDominantLayer, splatWeights } from '../src/splatmap.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

function makeHeights(res, fn, worldSize = 10) {
  const heights = new Float32Array(res * res);
  for (let z = 0; z < res; z++) {
    for (let x = 0; x < res; x++) {
      const wx = (x / (res - 1)) * worldSize;
      const wz = (z / (res - 1)) * worldSize;
      heights[x + res * z] = fn(wx, wz);
    }
  }
  return heights;
}

test('slopes are analytic on a tilted plane and a cone flank', () => {
  const res = 21;
  const plane = makeHeights(res, (x) => 0.2 * x);
  const slopes = heightfieldSlopes(plane, res, 10);
  for (let i = 0; i < slopes.length; i++) {
    assert.ok(near(slopes[i], Math.atan(0.2), 1e-5), `plane slope ${slopes[i]} vs atan(0.2)`);
  }
  // Cone h = 2.5 - r (45-degree flanks) sampled away from apex/rim.
  const cone = makeHeights(res, (x, z) => Math.max(0, 2.5 - Math.hypot(x - 5, z - 5)));
  const coneSlopes = heightfieldSlopes(cone, res, 10);
  const at = (x, z) => coneSlopes[x + res * z];
  assert.ok(near(at(14, 10), Math.PI / 4, 0.06), `cone flank slope ${at(14, 10)} vs pi/4`);
  assert.ok(near(at(2, 2), 0, 1e-6), 'flat apron outside the cone');
  assert.throws(() => heightfieldSlopes(new Float32Array(3), 2, 10), /res\*res/);
});

test('splat weights sum to 1 per texel and respect hard bands exactly', () => {
  const res = 21;
  const heights = makeHeights(res, (x) => 0.2 * x); // heights 0..2 across the map
  const layers = [
    { height: [0, 1] }, // low band only
    { height: [1, 3] }, // high band only
    { slope: [0.3, 1.5] }, // steep only (never on this gentle plane)
  ];
  const { weights } = splatWeights(heights, res, { worldSize: 10, layers });
  for (let i = 0; i < res * res; i++) {
    const sum = weights[0][i] + weights[1][i] + weights[2][i];
    assert.ok(near(sum, 1), `texel ${i} sums to ${sum}`);
    assert.ok(weights.every((w) => w[i] >= 0 && w[i] <= 1), 'weights in [0,1]');
  }
  // Hard bands (zero falloff): leftmost column is purely low band,
  // rightmost column purely high band, steep layer never fires.
  const at = (layer, x, z) => weights[layer][x + res * z];
  assert.ok(near(at(0, 0, 10), 1) && near(at(1, 0, 10), 0), 'low edge pure low layer');
  assert.ok(near(at(0, 20, 10), 0) && near(at(1, 20, 10), 1), 'high edge pure high layer');
  assert.ok(weights[2].every((w) => w === 0), 'steep layer silent on a gentle plane');
  // Slope angle here is atan(0.2) ~= 0.1974 < 0.3 everywhere.
  const coverage = splatCoverage(weights);
  assert.ok(near(coverage.reduce((s, v) => s + v, 0), 1), 'coverage sums to 1');
  assert.ok(near(coverage[2], 0), 'steep coverage zero');
  const dominant = splatDominantLayer(weights);
  assert.equal(dominant[0 + res * 10], 0, 'low side dominated by low layer');
  assert.equal(dominant[20 + res * 10], 1, 'high side dominated by high layer');
});

test('falloffs blend smoothly and uncovered texels fall back to the base layer', () => {
  const res = 21;
  const heights = makeHeights(res, (x) => 0.2 * x);
  // Single restrictive layer: covers height [1.5, 3] with a wide
  // falloff. Everything below that must land on the base layer
  // (here the same single layer via baseLayer 0? no: use 2 layers
  // where layer 1 is the restrictive one and layer 0 is base).
  const layers = [
    {}, // base: no rules (raw 1 everywhere before normalization)
    { height: [1.5, 3], heightFalloff: 0.5 },
  ];
  const plain = splatWeights(heights, res, { worldSize: 10, layers });
  // Layer 0 raw is 1, layer 1 raw in [0,1]: totals in [1,2], so
  // normalization keeps layer 0 dominant at low heights and the
  // high band takes a share at the top.
  const at = (layer, x, z) => plain.weights[layer][x + res * z];
  assert.ok(near(at(1, 0, 10), 0), 'restrictive layer off at the bottom');
  assert.ok(at(1, 20, 10) > 0.4, `restrictive layer on at the top (${at(1, 20, 10)})`);
  assert.ok(at(1, 15, 10) > 0 && at(1, 15, 10) < at(1, 20, 10), 'falloff blends monotonically');
  for (let i = 0; i < res * res; i++) {
    assert.ok(near(plain.weights[0][i] + plain.weights[1][i], 1), 'two-layer sum stays 1');
  }
  // Uncovered fallback: restrictive-only setup (base gets remainder).
  const only = splatWeights(heights, res, {
    worldSize: 10,
    layers: [{ height: [1.5, 3] }],
    baseLayer: 0,
  });
  assert.ok(near(only.weights[0][0 + res * 10], 1), 'uncovered texel falls back to base layer fully');
  assert.throws(() => splatWeights(heights, res, { layers: [] }), /at least one layer/);
  assert.throws(() => splatWeights(heights, res, { layers: [{}], baseLayer: 2 }), /out of range/);
});
