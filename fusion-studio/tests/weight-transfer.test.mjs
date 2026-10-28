import test from 'node:test';
import assert from 'node:assert/strict';
import { closestPointOnTriangle, transferWeights } from '../src/weight-transfer.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// Two-triangle unit quad in the z=0 plane, one joint per corner blend.
const QUAD = {
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
  indices: Uint32Array.from([0, 1, 2, 0, 2, 3]),
};
function makeSkin(rows, stride = 4) {
  const indices = new Int32Array(rows.length * stride).fill(-1);
  const weights = new Float32Array(rows.length * stride);
  rows.forEach((row, v) => row.forEach(([joint, w], s) => {
    indices[v * stride + s] = joint;
    weights[v * stride + s] = w;
  }));
  return { indices, weights, stride };
}
const QUAD_SKIN = makeSkin([
  [[0, 1]],
  [[1, 1]],
  [[0, 0.5], [1, 0.5]],
  [[1, 1]],
]);
const rowOf = (skin, v) => {
  const out = [];
  for (let s = 0; s < skin.stride; s++) {
    const w = skin.weights[v * skin.stride + s];
    if (w > 0) out.push([skin.indices[v * skin.stride + s], w]);
  }
  return out;
};

test('closest point regions: face interior, edge, and vertex are exact', () => {
  const a = [0, 0, 0], b = [1, 0, 0], c = [0, 1, 0];
  const face = closestPointOnTriangle([0.25, 0.25, 2], a, b, c);
  assert.ok(near(face.point[2], 0) && near(face.barycentric[0], 0.5) && near(face.barycentric[1], 0.25) && near(face.barycentric[2], 0.25),
    JSON.stringify(face));
  const edge = closestPointOnTriangle([0.5, -1, 0.5], a, b, c);
  assert.deepEqual(edge.point, [0.5, 0, 0]);
  assert.ok(near(edge.barycentric[0], 0.5) && near(edge.barycentric[1], 0.5), 'edge midpoint barycentric');
  const vertex = closestPointOnTriangle([2, -1, 0], a, b, c);
  assert.deepEqual(vertex.point, [1, 0, 0]);
  assert.deepEqual(vertex.barycentric, [0, 1, 0]);
});

test('identity transfer reproduces the source weights exactly', () => {
  const { skin, stats } = transferWeights(QUAD, QUAD_SKIN, QUAD.positions);
  for (let v = 0; v < 4; v++) {
    const expected = rowOf(QUAD_SKIN, v).map(([j, w]) => [j, w]);
    const actual = rowOf(skin, v);
    assert.equal(actual.length, expected.length, `vertex ${v} influence count`);
    actual.forEach(([joint, w], i) => {
      assert.equal(joint, expected[i][0]);
      assert.ok(near(w, expected[i][1], 1e-6), `vertex ${v} joint ${joint}: ${w} vs ${expected[i][1]}`);
    });
  }
  assert.deepEqual([stats.transferred, stats.fallback], [4, 0]);
  assert.ok(near(stats.maxDistance, 0, 1e-6), 'identity transfer distance is zero');
});

test('centroid and offset targets get exact barycentric blends and distances', () => {
  // Centroid of triangle (0,1,2) = (2/3, 1/3, 0): weights average
  // the corners: joint0 = (1 + 0 + 0.5)/3 = 0.5, joint1 = 0.5.
  const centroid = new Float32Array([2 / 3, 1 / 3, 0.25]); // hovered 0.25 above
  const { skin, stats } = transferWeights(QUAD, QUAD_SKIN, centroid);
  const row = rowOf(skin, 0);
  assert.ok(near(row.find(([j]) => j === 0)[1], 0.5) && near(row.find(([j]) => j === 1)[1], 0.5),
    `centroid blend ${JSON.stringify(row)}`);
  assert.ok(near(stats.meanDistance, 0.25, 1e-6), 'hover distance reported');
  // A garment shell offset 0.1 along +Z everywhere keeps the
  // underlying weights exactly and reports distance 0.1.
  const shell = new Float32Array(QUAD.positions);
  for (let i = 2; i < shell.length; i += 3) shell[i] += 0.1;
  const shellResult = transferWeights(QUAD, QUAD_SKIN, shell);
  for (let v = 0; v < 4; v++) {
    const expected = rowOf(QUAD_SKIN, v);
    const actual = rowOf(shellResult.skin, v);
    assert.equal(actual.length, expected.length);
    actual.forEach(([joint, w], i) => assert.ok(joint === expected[i][0] && near(w, expected[i][1], 1e-6)));
  }
  assert.ok(near(shellResult.stats.meanDistance, 0.1, 1e-6));
});

test('far targets fall back to the nearest vertex and are counted', () => {
  const far = new Float32Array([5, 5, 5]);
  const capped = transferWeights(QUAD, QUAD_SKIN, far, { maxDistance: 0.5 });
  assert.deepEqual([capped.stats.transferred, capped.stats.fallback], [0, 1]);
  // Nearest vertex to (5,5,5) is corner 2 (1,1,0) with 0.5/0.5.
  const row = rowOf(capped.skin, 0);
  assert.ok(near(row.find(([j]) => j === 0)[1], 0.5) && near(row.find(([j]) => j === 1)[1], 0.5), 'fallback copies nearest vertex');
  // Without a cap the same point transfers from the surface.
  const uncapped = transferWeights(QUAD, QUAD_SKIN, far);
  assert.deepEqual([uncapped.stats.transferred, uncapped.stats.fallback], [1, 0]);
  assert.ok(uncapped.stats.maxDistance > 6, 'distance to the far point reported');
  assert.throws(() => transferWeights(QUAD, QUAD_SKIN, far, { maxDistance: 0 }), /positive/);
});
