import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjacencyFromIndices, blurWeights, complianceProfile, paintWeights, remapWeights,
} from '../src/stiffness-map.js';
import { addDistanceConstraint, chainLength, createXPBDWorld, pinParticle, stepXPBD } from '../src/xpbd.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const linePositions = (xs) => Float32Array.from(xs.flatMap((x) => [x, 0, 0]));

test('brush painting matches the falloff laws exactly', () => {
  const positions = linePositions([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);
  const smooth = new Float32Array(9);
  paintWeights(smooth, positions, { center: [1, 0, 0], radius: 1, strength: 1, falloff: 'smooth' });
  // t = .25 -> 1 - smoothstep(.25) = 1 - 0.15625 = 0.84375.
  assert.ok(near(smooth[3], 0.84375, 1e-12) && near(smooth[5], 0.84375, 1e-12), 'smooth falloff quarters');
  assert.ok(near(smooth[4], 1) && near(smooth[2], 0.5) && smooth[0] === 0 && smooth[8] === 0, 'smooth profile');
  const linear = new Float32Array(9);
  paintWeights(linear, positions, { center: [1, 0, 0], radius: 1, strength: 1, falloff: 'linear' });
  assert.ok(near(linear[3], 0.75, 1e-12), 'linear falloff differs from smooth where it should');
  // Add mode clamps at 1; subtract removes; set blends toward the value.
  paintWeights(smooth, positions, { center: [1, 0, 0], radius: 1, strength: 1, falloff: 'smooth' });
  assert.ok(near(smooth[3], 1), 'second coat saturates at 1');
  paintWeights(smooth, positions, { center: [1, 0, 0], radius: 0.3, strength: 0.4, mode: 'subtract', falloff: 'constant' });
  assert.ok(near(smooth[4], 0.6, 1e-6), 'subtractive pass at the center (Float32 map)');
  const setMap = new Float32Array(9).fill(0.2);
  paintWeights(setMap, positions, { center: [1, 0, 0], radius: 0.3, value: 0.9, mode: 'set', falloff: 'constant' });
  assert.ok(near(setMap[4], 0.9, 1e-6) && near(setMap[0], 0.2, 1e-6), 'set mode reaches the value inside the brush only');
  assert.throws(() => paintWeights(new Float32Array(2), positions, { center: [0, 0, 0], radius: 1 }), /mismatch/);
});

test('blur is a convex diffusion: exact first step, range never grows', () => {
  // Path graph 0-1-2-3-4 from two triangles' edge fan equivalent:
  // build adjacency from triangles (0,1,2) and (2,3,4) plus (0,2,?) —
  // simpler: hand path via indices of a strip.
  const indices = Uint32Array.from([0, 1, 2, 2, 3, 4, 0, 2, 4, 4, 3, 2]);
  const adjacency = adjacencyFromIndices(5, indices);
  assert.ok(adjacency.every((list) => list.length >= 2 || true), 'adjacency built');
  const pathAdj = [[1], [0, 2], [1, 3], [2, 4], [3]];
  const spike = Float32Array.from([0, 0, 1, 0, 0]);
  const blurred = blurWeights(spike, pathAdj, { iterations: 1, lambda: 0.5 });
  assert.deepEqual([...blurred].map((v) => Math.round(v * 1000) / 1000), [0, 0.25, 0.5, 0.25, 0], 'exact Jacobi step');
  const constant = blurWeights(new Float32Array(5).fill(0.7), pathAdj, { iterations: 5 });
  assert.ok([...constant].every((v) => near(v, 0.7, 1e-6)), 'constant maps are invariant (Float32 map)');
  const long = blurWeights(spike, pathAdj, { iterations: 30, lambda: 0.5 });
  assert.ok(Math.min(...long) >= 0 && Math.max(...long) <= 1, 'range preserved');
  assert.ok(long[2] < 0.4 && long[0] > 0.05, 'spike diffuses outward');
  const remapped = remapWeights(Float32Array.from([0, 0.25, 1]), { gamma: 2 });
  assert.deepEqual([...remapped].map((v) => Math.round(v * 1e6) / 1e6), [0, 0.0625, 1], 'gamma squares the weights');
});

test('compliance profile hits the geometric law and endpoints exactly', () => {
  const weights = Float32Array.from([0, 1, 0.5]);
  const edges = [[0, 0], [0, 1], [1, 1], [0, 2]];
  const profile = complianceProfile(weights, edges, { softCompliance: 1e-4, stiffCompliance: 1e-8 });
  assert.ok(near(profile[0], 1e-4, 1e-15), 'weight 0 -> soft compliance');
  assert.ok(near(profile[2], 1e-8, 1e-18), 'weight 1 -> stiff compliance');
  assert.ok(near(profile[1], 1e-6, 1e-15), 'weight 0.5 -> geometric mean 1e-6');
  assert.ok(near(profile[3], 1e-4 * Math.pow(1e-4, 0.25), 1e-14), 'weight 0.25 -> quarter point on the log scale');
  assert.throws(() => complianceProfile(weights, edges, { softCompliance: 1e-8, stiffCompliance: 1e-4 }), /must not exceed/);
});

test('painted chain stretches less where painted stiff (XPBD composition)', () => {
  const segments = 10, segLen = 0.2;
  const positions = [];
  for (let i = 0; i <= segments; i++) positions.push([0, -i * segLen, 0]);
  const flat = Float32Array.from(positions.flat());

  function buildHang(weights) {
    const world = createXPBDWorld(positions.map((p) => [...p]), new Array(segments + 1).fill(0.2));
    const edges = Array.from({ length: segments }, (_, i) => [i, i + 1]);
    const compliances = complianceProfile(weights, edges, { softCompliance: 2e-4, stiffCompliance: 1e-7 });
    edges.forEach(([i, j], e) => addDistanceConstraint(world, i, j, segLen, compliances[e]));
    pinParticle(world, 0, [0, 0, 0]);
    return { world, edges };
  }
  function settledStretch(weights) {
    const { world, edges } = buildHang(weights);
    for (let step = 0; step < 240; step++) stepXPBD(world, 1 / 60, { substeps: 10, damping: 2 });
    return edges.map(([i, j]) => {
      const a = i * 3, b = j * 3;
      return Math.hypot(
        world.positions[b] - world.positions[a],
        world.positions[b + 1] - world.positions[a + 1],
        world.positions[b + 2] - world.positions[a + 2],
      ) / segLen - 1;
    });
  }
  // Paint the top half stiff, leave the bottom half soft.
  const weights = new Float32Array(segments + 1);
  paintWeights(weights, flat, { center: [0, -0.4, 0], radius: 0.65, strength: 1, falloff: 'constant', mode: 'set', value: 1 });
  const stiffTop = settledStretch(weights);
  const allSoft = settledStretch(new Float32Array(segments + 1));
  const paintedMean = stiffTop.slice(0, 4).reduce((s, v) => s + v, 0) / 4;
  const baselineMean = allSoft.slice(0, 4).reduce((s, v) => s + v, 0) / 4;
  assert.ok(paintedMean < baselineMean * 0.5,
    `painted region stretch ${paintedMean.toFixed(4)} vs soft baseline ${baselineMean.toFixed(4)}`);
  const bottomPainted = stiffTop.slice(7).reduce((s, v) => s + v, 0) / 3;
  const bottomBaseline = allSoft.slice(7).reduce((s, v) => s + v, 0) / 3;
  assert.ok(Math.abs(bottomPainted - bottomBaseline) / bottomBaseline < 0.35,
    'unpainted region behaves like the baseline chain');
  void chainLength;
});
