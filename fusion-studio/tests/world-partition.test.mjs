import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorldPartition, registerObject, unregisterObject, cellsForAABB,
  queryObjects, streamingUpdate, applyStreamingDiff, loadedObjects, cellKey,
} from '../src/world-partition.js';

const box = (x0, z0, x1, z1) => ({ min: [x0, 0, z0], max: [x1, 1, z1] });

test('cell assignment: spanning objects land in exactly the overlapped cells', () => {
  const p = createWorldPartition({ cellSize: 10, origin: [0, 0] });
  // Object fully inside cell (0,0).
  assert.deepEqual(registerObject(p, 'a', box(1, 1, 5, 5)), ['0:0']);
  // Object spanning the corner of 4 cells.
  const spanning = registerObject(p, 'b', box(8, 8, 12, 12)).sort();
  assert.deepEqual(spanning, ['0:0', '0:1', '1:0', '1:1']);
  // Negative coordinates floor correctly.
  assert.deepEqual(registerObject(p, 'c', box(-5, -5, -1, -1)), ['-1:-1']);
  // An object exactly on a boundary belongs to both sides (its max
  // edge touches the next cell): [0..10] covers cells 0 and 1.
  assert.deepEqual(registerObject(p, 'd', box(0, 0, 10, 10)).sort(), ['0:0', '0:1', '1:0', '1:1']);
  assert.throws(() => createWorldPartition({ cellSize: 0 }), /positive/);
});

test('queries: exact filtering removes cell-level false positives', () => {
  const p = createWorldPartition({ cellSize: 10 });
  registerObject(p, 'near', box(1, 1, 3, 3));
  registerObject(p, 'sameCellFar', box(7, 7, 9, 9)); // same cell (0,0), no overlap with query
  registerObject(p, 'other', box(21, 21, 23, 23));
  const query = box(0, 0, 5, 5);
  assert.deepEqual(queryObjects(p, query), ['near'], 'exact query returns only true overlaps');
  assert.deepEqual(queryObjects(p, query, { exact: false }).sort(), ['near', 'sameCellFar'], 'cell query is a superset');
  // Re-registering moves the object; unregistering removes it.
  registerObject(p, 'near', box(21, 21, 22, 22));
  assert.deepEqual(queryObjects(p, query), []);
  assert.deepEqual(queryObjects(p, box(20, 20, 25, 25)).sort(), ['near', 'other']);
  assert.ok(unregisterObject(p, 'near'));
  assert.deepEqual(queryObjects(p, box(20, 20, 25, 25)), ['other']);
  assert.equal(unregisterObject(p, 'ghost'), false);
});

test('streaming: deterministic diffs, hysteresis stops border thrash', () => {
  const p = createWorldPartition({ cellSize: 10 });
  registerObject(p, 'a', box(1, 1, 5, 5));
  registerObject(p, 'b', box(41, 1, 45, 5));
  const loaded = new Set();
  const view1 = box(0, 0, 20, 20);
  const diff1 = streamingUpdate(p, view1, loaded, { hysteresis: 5 });
  assert.deepEqual(diff1.toUnload, []);
  assert.ok(diff1.toLoad.includes('0:0') && diff1.toLoad.includes('1:1'), 'view cells load');
  applyStreamingDiff(loaded, diff1);
  assert.deepEqual(loadedObjects(p, loaded), ['a']);
  // Small camera move across a cell border: with hysteresis the old
  // cells stay loaded and the diff is empty (no thrash).
  const view2 = box(2, 0, 22, 20);
  const diff2 = streamingUpdate(p, view2, loaded, { hysteresis: 5 });
  const before = new Set(loaded);
  applyStreamingDiff(loaded, diff2);
  assert.deepEqual([...loaded].sort(), [...before].sort(), 'no churn for a borderline move');
  // A teleport: old cells unload, new cells load, object set swaps.
  const view3 = box(35, 0, 55, 20);
  const diff3 = streamingUpdate(p, view3, loaded, { hysteresis: 5 });
  assert.ok(diff3.toUnload.includes('0:0'), 'old cell unloads after teleport');
  assert.ok(diff3.toLoad.includes('4:0'), 'new cell loads');
  applyStreamingDiff(loaded, diff3);
  assert.deepEqual(loadedObjects(p, loaded), ['b']);
  // Streaming is deterministic: same inputs, same diff.
  const again = streamingUpdate(p, view3, new Set(loaded), { hysteresis: 5 });
  assert.deepEqual(again, { toLoad: [], toUnload: [] }, 'steady state produces an empty diff');
});

test('cell key helpers are consistent', () => {
  const p = createWorldPartition({ cellSize: 10, origin: [100, 100] });
  assert.deepEqual(cellsForAABB(p, box(100, 100, 105, 105)), [cellKey(0, 0)]);
  assert.deepEqual(cellsForAABB(p, box(95, 100, 105, 105)).sort(), ['-1:0', '0:0']);
});
