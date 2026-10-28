import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutRoom, validateLayout } from '../src/layout.js';

test('first-fit placement matches the hand-computed layout', () => {
  // Room 4x3. Largest first: sofa 2x1 (wall), table 1x1, shelf 1.5x0.4 (wall).
  const room = { width: 4, depth: 3 };
  const items = [
    { id: 'table', w: 1, d: 1 },
    { id: 'sofa', w: 2, d: 1, againstWall: true },
    { id: 'shelf', w: 1.5, d: 0.4, againstWall: true },
  ];
  const { placed, unplaced } = layoutRoom({ room, items });
  assert.deepEqual(unplaced, []);
  const byId = Object.fromEntries(placed.map((p) => [p.id, p]));
  // Sofa (area 2) scans z=0, x=0 first: touches wall, placed at origin.
  assert.deepEqual([byId.sofa.x, byId.sofa.z, byId.sofa.rotated], [0, 0, false]);
  // Table (area 1): candidates z=0: x=0 blocked by sofa; x=2 free.
  assert.deepEqual([byId.table.x, byId.table.z], [2, 0]);
  // Shelf (area 0.6): z=0 row: x=0 sofa, x=2 table; x=3 exceeds (3+1.5>4);
  // its own candidate x = 4-1.5 = 2.5 overlaps table (2..3 x, 0..1 z).
  // Next z candidate 1 (sofa/table depth): x=0 touches wall via z? z=1 not
  // a wall; x=0 is a wall, so (0, 1) is valid and first in scan order.
  assert.deepEqual([byId.shelf.x, byId.shelf.z], [0, 1]);
  assert.deepEqual(validateLayout({ room, items, placed }), []);
});

test('door keep-out is never overlapped; unplaceable items are reported', () => {
  const room = { width: 3, depth: 3 };
  const keepOuts = [{ x: 0, z: 0, w: 1, d: 1 }]; // door swing
  const items = [
    { id: 'wardrobe', w: 2, d: 2 },
    { id: 'huge', w: 4, d: 1 }, // wider than the room in both orientations
  ];
  const { placed, unplaced } = layoutRoom({ room, keepOuts, items });
  assert.deepEqual(unplaced, ['huge']);
  const wardrobe = placed.find((p) => p.id === 'wardrobe');
  // z=0 row: x=0 hits the door zone; x=1 touches it edge-on (allowed).
  assert.deepEqual([wardrobe.x, wardrobe.z], [1, 0]);
  assert.deepEqual(validateLayout({ room, keepOuts, items, placed }), []);
  // The validator catches a hand-made bad layout.
  const bad = validateLayout({ room, keepOuts, items, placed: [{ id: 'wardrobe', x: 0, z: 0, w: 2, d: 2, rotated: false }] });
  assert.ok(bad.some((v) => v.includes('keep-out')), JSON.stringify(bad));
});

test('rotation is used when the unrotated footprint cannot fit', () => {
  const room = { width: 1.1, depth: 2.2 };
  const items = [{ id: 'bench', w: 2, d: 1 }];
  const { placed, unplaced } = layoutRoom({ room, items });
  assert.deepEqual(unplaced, []);
  assert.equal(placed[0].rotated, true);
  assert.deepEqual([placed[0].w, placed[0].d], [1, 2]);
  const noRotate = layoutRoom({ room, items: [{ id: 'bench', w: 2, d: 1, allowRotate: false }] });
  assert.deepEqual(noRotate.unplaced, ['bench']);
});

test('larger furnished room: everything placed is valid, deterministic across runs', () => {
  const room = { width: 6, depth: 5 };
  const keepOuts = [
    { x: 0, z: 0, w: 1.2, d: 1.2 }, // entry swing
    { x: 5.4, z: 0, w: 0.6, d: 2 }, // window/ radiator strip stays clear
  ];
  const items = [
    { id: 'bed', w: 2.1, d: 1.6, againstWall: true },
    { id: 'desk', w: 1.6, d: 0.8, againstWall: true },
    { id: 'wardrobe', w: 1.8, d: 0.6, againstWall: true },
    { id: 'bookshelf', w: 1.2, d: 0.35, againstWall: true },
    { id: 'rug-runner', w: 2.4, d: 0.9 },
    { id: 'chair', w: 0.5, d: 0.5 },
    { id: 'plant', w: 0.45, d: 0.45 },
    { id: 'tv-stand', w: 1.8, d: 0.45, againstWall: true },
  ];
  const first = layoutRoom({ room, keepOuts, items });
  const second = layoutRoom({ room, keepOuts, items });
  assert.deepEqual(first, second, 'same input, same layout');
  assert.deepEqual(validateLayout({ room, keepOuts, items, placed: first.placed }), []);
  assert.ok(first.placed.length >= 6, `placed ${first.placed.length} of ${items.length} (unplaced: ${first.unplaced})`);
  for (const p of first.placed) {
    const item = items.find((i) => i.id === p.id);
    if (item.againstWall) {
      const touches = p.x === 0 || p.z === 0 || p.x + p.w === room.width || p.z + p.d === room.depth;
      assert.ok(touches, `${p.id} touches a wall`);
    }
  }
  assert.throws(() => layoutRoom({ room: { width: 0, depth: 3 }, items: [] }), /room size/);
  assert.throws(() => layoutRoom({ room, items: [{ id: 'x', w: -1, d: 1 }] }), /size must be positive/);
});
