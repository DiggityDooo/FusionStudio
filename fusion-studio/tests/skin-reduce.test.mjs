import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLodSkin, jointUsage, pruneInfluences, selectJointPalette } from '../src/skin-reduce.js';

function makeSkin(rows, stride = 4) {
  const indices = new Int32Array(rows.length * stride).fill(-1);
  const weights = new Float32Array(rows.length * stride);
  rows.forEach((row, v) => row.forEach(([joint, w], s) => {
    indices[v * stride + s] = joint;
    weights[v * stride + s] = w;
  }));
  return { indices, weights, stride };
}
const rowOf = (skin, v) => {
  const out = [];
  for (let s = 0; s < skin.stride; s++) {
    const w = skin.weights[v * skin.stride + s];
    if (w > 0) out.push([skin.indices[v * skin.stride + s], w]);
  }
  return out;
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('influence pruning renormalizes exactly and reports dropped mass', () => {
  const skin = makeSkin([
    [[0, 0.5], [1, 0.3], [2, 0.15], [3, 0.05]],
    [[0, 0.6], [1, 0.39], [2, 0.01]],
    [[0, 0.004], [1, 0.003], [2, 0.003]],
  ]);
  const { skin: out, stats } = pruneInfluences(skin, { keep: 2, epsilon: 0.02 });
  const [a, b] = rowOf(out, 0);
  assert.equal(a[0], 0);
  assert.ok(near(a[1], 0.625) && near(b[1], 0.375), 'top-2 renormalized 0.5/0.8, 0.3/0.8');
  const [c, d] = rowOf(out, 1);
  assert.ok(near(c[1], 0.6 / 0.99) && near(d[1], 0.39 / 0.99), 'epsilon-dropped weight renormalized');
  assert.deepEqual(rowOf(out, 2), [[0, 1]], 'all-tiny vertex falls back to its strongest joint');
  assert.ok(near(stats.droppedMass, 0.22, 1e-6), `dropped mass ${stats.droppedMass}`); // 0.20 cap drop + 2x 0.01 epsilon drops
  assert.equal(stats.verticesChanged, 3);
  for (let v = 0; v < 3; v++) {
    const sum = rowOf(out, v).reduce((s, [, w]) => s + w, 0);
    assert.ok(near(sum, 1), `row ${v} sums to 1`);
  }
  assert.throws(() => pruneInfluences(skin, { keep: 5 }), /within \[1, stride\]/);
});

test('joint usage and palette selection are mass-ranked and deterministic', () => {
  const skin = makeSkin([
    [[0, 1]],
    [[0, 0.5], [1, 0.5]],
    [[1, 0.25], [2, 0.75]],
    [[2, 1]],
  ]);
  const { mass, vertices } = jointUsage(skin, 3);
  assert.ok(near(mass[0], 1.5) && near(mass[1], 0.75) && near(mass[2], 1.75), 'joint masses');
  assert.deepEqual([...vertices], [2, 2, 2], 'influenced vertex counts');
  assert.ok(near(mass[0] + mass[1] + mass[2], 4), 'total mass equals the vertex count');
  const { palette } = selectJointPalette(skin, { budget: 2 });
  assert.deepEqual(palette, [0, 2], 'two heaviest joints kept');
  const withRequired = selectJointPalette(skin, { budget: 2, required: [1] });
  assert.deepEqual(withRequired.palette, [1, 2], 'required joint displaces the lighter optional one');
  assert.throws(() => selectJointPalette(skin, { budget: 1, required: [0, 1] }), /exceed the budget/);
});

test('LOD build: palette pruning, influence cap, and orphan fallback hold invariants', () => {
  // Joint masses: 0 -> 1.84, 1 -> 1.63, 2 -> 1.53, 3 -> 1.0, so a
  // budget of 3 deterministically drops joint 3.
  const skin = makeSkin([
    [[0, 1]],
    [[1, 1]],
    [[2, 1]],
    [[3, 1]], // orphan-to-be: references only the dropped joint
    [[0, 0.5], [1, 0.3], [2, 0.2]],
    [[0, 0.34], [1, 0.33], [2, 0.33]],
  ]);
  const lod = buildLodSkin(skin, { maxInfluences: 2, jointBudget: 3, epsilon: 0.001 });
  assert.deepEqual(lod.palette, [0, 1, 2]);
  assert.equal(lod.stats.jointsBefore, 4);
  assert.equal(lod.stats.jointsAfter, 3);
  for (let v = 0; v < 6; v++) {
    const row = rowOf(lod.skin, v);
    assert.ok(row.length <= 2, `vertex ${v} respects the influence cap`);
    assert.ok(near(row.reduce((s, [, w]) => s + w, 0), 1), `vertex ${v} normalized`);
    for (const [joint] of row) assert.ok(lod.palette.includes(joint), 'only palette joints remain');
  }
  // Vertex 3 referenced only joint 3: falls back to the heaviest
  // palette joint (joint 0, mass 1.84).
  assert.deepEqual(rowOf(lod.skin, 3), [[0, 1]], 'orphan falls back to the heaviest palette joint');
  // No budget: identity palette, influences still capped.
  const cappedOnly = buildLodSkin(skin, { maxInfluences: 1 });
  assert.equal(cappedOnly.palette, null);
  assert.deepEqual(rowOf(cappedOnly.skin, 0), [[0, 1]], 'cap 1 keeps the strongest influence at full weight');
});
