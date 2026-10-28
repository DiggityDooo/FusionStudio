import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPatch, deepEqual, diffScenes, diffSummary, invertPatch } from '../src/scene-diff.js';

const sceneA = {
  name: 'Shot 010',
  fps: 24,
  objects: [
    { id: 'hero', type: 'mesh', position: [0, 1, 0], tags: ['main'] },
    { id: 'rock', type: 'mesh', position: [2, 0, 0] },
    { id: 'cam', type: 'camera', fov: 40 },
  ],
  settings: { renderer: 'pathtrace', samples: 128 },
};
const sceneB = {
  name: 'Shot 010',
  fps: 30,
  objects: [
    { id: 'hero', type: 'mesh', position: [0, 1.5, 0], tags: ['main', 'hero'] },
    { id: 'cam', type: 'camera', fov: 35 },
    { id: 'light1', type: 'light', intensity: 3 },
  ],
  settings: { renderer: 'pathtrace', samples: 256, denoiser: true },
};

test('diff/patch round-trips a realistic scene edit, invertibly, without mutation', () => {
  const before = JSON.stringify(sceneA);
  const ops = diffScenes(sceneA, sceneB);
  // Expected edits: fps set, hero.position set, hero.tags set
  // (plain array), rock removed, cam.fov set, light1 added,
  // settings.samples set, settings.denoiser added.
  assert.equal(ops.length, 8, JSON.stringify(ops.map((o) => [o.op, JSON.stringify(o.path)])));
  assert.deepEqual(diffSummary(ops), { set: 7, remove: 1, total: 8 });
  const patched = applyPatch(sceneA, ops);
  assert.ok(deepEqual(patched, sceneB), 'patched scene equals the target');
  assert.deepEqual(patched, sceneB);
  // Patch is JSON-safe (paths with { id } segments serialize).
  const revived = JSON.parse(JSON.stringify(ops));
  assert.ok(deepEqual(applyPatch(sceneA, revived), sceneB), 'JSON round-tripped patch applies');
  // Inversion restores the original.
  const restored = applyPatch(sceneB, invertPatch(ops));
  assert.ok(deepEqual(restored, sceneA), 'inverted patch restores scene A');
  // Inputs untouched, result is a fresh tree.
  assert.equal(JSON.stringify(sceneA), before, 'source scene not mutated');
  assert.notEqual(patched, sceneA);
  assert.deepEqual(diffScenes(sceneA, sceneA), [], 'self-diff is empty');
  assert.deepEqual(diffScenes(sceneB, patched), [], 'no residual diff after patching');
});

test('id-keyed arrays match by id; reordering falls back to a wholesale set', () => {
  const x = { objects: [{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'c', v: 3 }] };
  const y = { objects: [{ id: 'c', v: 3 }, { id: 'a', v: 9 }] };
  const ops = diffScenes(x, y);
  // b removed, a.v modified, and order of shared (a, c) changed
  // (a,c) vs (c,a) -> reorder triggers one wholesale set for the
  // array plus nothing else: assert exactly one set op at the
  // array path and the round trip holds.
  assert.equal(ops.filter((o) => o.op === 'set' && o.path.length === 1).length, 1, JSON.stringify(ops));
  assert.ok(deepEqual(applyPatch(x, ops), y), 'reorder round trip');
  // Pure value edit without reorder stays surgical.
  const z = { objects: [{ id: 'a', v: 1 }, { id: 'b', v: 5 }, { id: 'c', v: 3 }] };
  const surgical = diffScenes(x, z);
  assert.deepEqual(surgical.map((o) => [o.op, o.path.length]), [['set', 3]]);
  assert.deepEqual(surgical[0].path, ['objects', { id: 'b' }, 'v']);
  assert.equal(surgical[0].value, 5);
  assert.equal(surgical[0].previous, 2);
  // Nested plain arrays compare element-wise at equal length.
  const w = { objects: [{ id: 'a', v: 1, p: [0, 0, 0] }, { id: 'b', v: 2 }, { id: 'c', v: 3 }] };
  const w2 = { objects: [{ id: 'a', v: 1, p: [0, 4, 0] }, { id: 'b', v: 2 }, { id: 'c', v: 3 }] };
  const posOps = diffScenes(w, w2);
  assert.deepEqual(posOps.map((o) => o.path), [['objects', { id: 'a' }, 'p', 1]], 'only the changed coordinate is patched');
  assert.ok(deepEqual(applyPatch(w, posOps), w2));
});

test('patch validation and root replacement behave', () => {
  assert.throws(() => applyPatch({ a: 1 }, [{ op: 'remove', path: ['missing', 'deep'], previous: 1 }]), /path not found/);
  assert.throws(() => applyPatch({ objects: [] }, [{ op: 'remove', path: ['objects', { id: 'ghost' }], previous: {} }]), /no element with id/);
  const rootOps = diffScenes({ a: 1 }, { b: 2 });
  assert.ok(deepEqual(applyPatch({ a: 1 }, rootOps), { b: 2 }), 'object key churn at the root');
  const replaced = applyPatch({ a: 1 }, [{ op: 'set', path: [], value: [1, 2], previous: { a: 1 } }]);
  assert.deepEqual(replaced, [1, 2], 'root set replaces the document');
  assert.ok(deepEqual(null, null) && !deepEqual({ a: [1] }, { a: [1, 2] }), 'deepEqual basics');
});
