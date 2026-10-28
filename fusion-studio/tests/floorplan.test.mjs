import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFloorPlan, wallPieces, floorPlanVolume } from '../src/floorplan.js';
import { meshVolume } from '../src/mesh-section.js';

const WALL = {
  from: [0, 0], to: [6, 0], height: 2.7, thickness: 0.15,
  openings: [
    { offset: 1, width: 0.9, height: 2.1 }, // door (sill 0)
    { offset: 3.5, width: 1.5, height: 1.2, sill: 0.9 }, // window
  ],
};

test('volume accounting is exact: boxes minus opening voids', () => {
  const { mesh } = buildFloorPlan([WALL]);
  const analytic = floorPlanVolume([WALL]);
  const expected = 6 * 2.7 * 0.15 - (0.9 * 2.1 + 1.5 * 1.2) * 0.15;
  assert.ok(Math.abs(analytic - expected) < 1e-12);
  // Mesh is a union of closed boxes (corner overlaps none for one
  // wall): divergence volume must match the analytic value.
  assert.ok(Math.abs(Math.abs(meshVolume(mesh)) - expected) < 1e-6,
    `mesh volume ${Math.abs(meshVolume(mesh))} vs analytic ${expected}`);
});

test('openings are really open: no geometry inside the voids', () => {
  const { mesh, pieces } = buildFloorPlan([WALL]);
  // Pieces decompose as: run, lintel(door), run, sill, lintel, run.
  assert.deepEqual(pieces.map((p) => p.kind), ['run', 'lintel', 'run', 'sill', 'lintel', 'run']);
  // Door void spans y 0..2.1 at along 1..1.9; window void y 0.9..2.1
  // at along 3.5..5. Check every emitted vertex stays out of the
  // voids' interiors (vertices may sit ON void boundaries).
  const voids = [
    { along: [1, 1.9], vertical: [0, 2.1] },
    { along: [3.5, 5], vertical: [0.9, 2.1] },
  ];
  for (const piece of pieces) {
    for (const v of voids) {
      const alongOverlap = Math.min(piece.along[1], v.along[1]) - Math.max(piece.along[0], v.along[0]);
      const vertOverlap = Math.min(piece.vertical[1], v.vertical[1]) - Math.max(piece.vertical[0], v.vertical[0]);
      assert.ok(!(alongOverlap > 1e-9 && vertOverlap > 1e-9),
        `${piece.kind} piece ${piece.along}x${piece.vertical} intrudes into a void`);
    }
  }
  // Mesh extends exactly the wall bounds.
  let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    minX = Math.min(minX, mesh.positions[i]);
    maxX = Math.max(maxX, mesh.positions[i]);
    maxY = Math.max(maxY, mesh.positions[i + 1]);
  }
  assert.ok(Math.abs(minX) < 1e-6 && Math.abs(maxX - 6) < 1e-6 && Math.abs(maxY - 2.7) < 1e-6); // Float32 storage
});

test('multi-wall plans build; openings are validated', () => {
  const plan = [
    { from: [0, 0], to: [6, 0], height: 2.7, thickness: 0.15, openings: [{ offset: 2, width: 1, height: 2.1 }] },
    { from: [6, 0], to: [6, 4], height: 2.7, thickness: 0.15 },
    { from: [6, 4], to: [0, 4], height: 2.7, thickness: 0.15 },
    { from: [0, 4], to: [0, 0], height: 2.7, thickness: 0.15 },
  ];
  const { mesh, pieces } = buildFloorPlan(plan);
  assert.ok(mesh.indices.length > 0 && pieces.length >= 5);
  // Every opening lintel/sill bookkeeping: wall 0 has run+lintel+run.
  assert.equal(pieces.filter((p) => p.wallIndex === 0).length, 3);
  assert.throws(() => buildFloorPlan([{ from: [0, 0], to: [3, 0], height: 2.7, thickness: 0.15, openings: [{ offset: 2.5, width: 1, height: 2 }] }]), /outside the wall/);
  assert.throws(() => buildFloorPlan([{ from: [0, 0], to: [3, 0], height: 2.7, thickness: 0.15, openings: [{ offset: 0.5, width: 1.5, height: 2 }, { offset: 1.5, width: 1, height: 2 }] }]), /overlapping/);
  assert.throws(() => buildFloorPlan([{ from: [1, 1], to: [1, 1], height: 2.7, thickness: 0.15 }]), /zero-length/);
  assert.throws(() => wallPieces({ from: [0, 0], to: [3, 0], height: 2, thickness: 0.1, openings: [{ offset: 0, width: 1, height: 2.5 }] }), /exceeds wall height/);
});
