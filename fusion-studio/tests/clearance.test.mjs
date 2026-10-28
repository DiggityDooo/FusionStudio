import test from 'node:test';
import assert from 'node:assert/strict';
import { meshClearance, clearanceViolations, clearanceReport } from '../src/clearance.js';

function box(cx, cy, cz, s) {
  const h = s / 2;
  const corners = [];
  for (const dx of [-h, h]) for (const dy of [-h, h]) for (const dz of [-h, h]) corners.push([cx + dx, cy + dy, cz + dz]);
  // 12 triangles over 8 corners (indices into the corner list).
  const faces = [
    [0, 1, 3, 0, 3, 2], [4, 6, 7, 4, 7, 5], [0, 4, 5, 0, 5, 1],
    [2, 3, 7, 2, 7, 6], [0, 2, 6, 0, 6, 4], [1, 5, 7, 1, 7, 3],
  ];
  const positions = [], indices = [];
  const remap = new Map();
  for (const face of faces) {
    for (const ci of face) {
      if (!remap.has(ci)) { remap.set(ci, positions.length / 3); positions.push(...corners[ci]); }
      indices.push(remap.get(ci));
    }
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

test('two cubes 1mm apart report exactly 1mm clearance with witnesses', () => {
  const a = box(0, 0, 0, 2);       // spans x -1..1
  const b = box(3, 0, 0, 2);       // spans x 2..4 -> gap 1
  const { distance, pointA, pointB } = meshClearance(a, b);
  assert.ok(Math.abs(distance - 1) < 1e-9, `distance ${distance}`);
  assert.ok(Math.abs(pointA[0] - 1) < 1e-9 && Math.abs(pointB[0] - 2) < 1e-9, 'witnesses on the facing surfaces');
});

test('clearance obeys 3D geometry: diagonal separation', () => {
  const a = box(0, 0, 0, 2);
  const b = box(3, 4, 0, 2); // closest corners (1,1,0)-(2,3,0): dx=1, dy=2
  const { distance } = meshClearance(a, b);
  assert.ok(Math.abs(distance - Math.hypot(1, 2)) < 1e-9, `diagonal distance ${distance}`);
});

test('touching meshes report zero; containment is a documented blind spot', () => {
  const a = box(0, 0, 0, 2);
  const touching = box(2, 0, 0, 2); // faces meet at x=1
  assert.ok(meshClearance(a, touching).distance < 1e-9);
  // A cube fully inside another: vertex-to-surface distance is the
  // wall gap (0.75), NOT an intersection signal. This is the stated
  // limitation of the method, asserted so it cannot silently change.
  const nested = box(0, 0, 0, 0.5);
  assert.ok(Math.abs(meshClearance(a, nested).distance - 0.75) < 1e-9);
});

test('reports pass/fail against a required tolerance with margin', () => {
  const a = box(0, 0, 0, 2);
  const b = box(2.3, 0, 0, 2); // gap 0.3
  const ok = clearanceReport(a, b, { required: 0.2 });
  assert.equal(ok.passes, true);
  assert.ok(Math.abs(ok.margin - 0.1) < 1e-6, 'margin within Float32 fixture precision');
  const tight = clearanceReport(a, b, { required: 0.5 });
  assert.equal(tight.passes, false);
  assert.ok(tight.margin < 0);
  const violations = clearanceViolations(a, b, 0.5);
  assert.ok(violations.aTooClose > 0 && violations.bTooClose > 0, 'facing vertices flagged on both parts');
  const roomy = clearanceViolations(a, b, 0.1);
  assert.equal(roomy.aTooClose, 0);
  assert.throws(() => clearanceViolations(a, b, -1), /tolerance must be/);
});
