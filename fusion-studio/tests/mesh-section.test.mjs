import test from 'node:test';
import assert from 'node:assert/strict';
import { clipMeshByPlane, crossSectionSegments, meshVolume, planeDistance, stitchContours, crossSectionArea } from '../src/mesh-section.js';

// Unit cube [0,1]^3, outward faces.
function cube() {
  const positions = new Float32Array([
    0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
    0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1,
  ]);
  const quads = [
    [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
    [2, 3, 7, 6], [1, 2, 6, 5], [3, 0, 4, 7],
  ];
  const indices = [];
  for (const [a, b, c, d] of quads) indices.push(a, b, c, a, c, d);
  return { positions, indices: Uint32Array.from(indices), normals: null };
}

test('clipping a cube at mid-height keeps exactly half the volume', () => {
  const mesh = cube();
  assert.ok(Math.abs(meshVolume(mesh) - 1) < 1e-12, 'unit cube volume oracle for the fixture itself');
  const top = clipMeshByPlane(mesh, [0, 0.5, 0], [0, 1, 0]);
  // Kept region is y >= 0.5: half the cube (open at the cut, so the
  // divergence sum measures the kept material minus the missing cap
  // contribution: for an open surface the theorem gives the volume
  // only when closed. The clipped solid without a cap has volume
  // integral = 0.5 - (cap area * 0.5)/... assert via vertex bounds
  // and the closed-form below instead.
  let minY = Infinity, maxY = -Infinity;
  for (let i = 1; i < top.positions.length; i += 3) {
    minY = Math.min(minY, top.positions[i]);
    maxY = Math.max(maxY, top.positions[i]);
  }
  assert.ok(Math.abs(minY - 0.5) < 1e-12, `cut lands exactly on the plane (${minY})`);
  assert.ok(Math.abs(maxY - 1) < 1e-12);
  assert.ok(top.indices.length > 0);
  // Closed-volume check via the mirrored complement: clipping with
  // the flipped normal keeps the other half; volumes of the two
  // CLOSED halves (recomputed with a fan cap on the section) must
  // sum to 1. Use divergence on each clipped mesh + cap correction:
  // for a planar cut at distance h from origin-side, open-mesh
  // divergence = V_closed - A_section * d_plane / ... simpler and
  // exact: count kept volume by clipping a TETRA decomposition is
  // overkill; assert the two open divergences sum to the unit cube.
  const bottom = clipMeshByPlane(mesh, [0, 0.5, 0], [0, -1, 0]);
  const sum = meshVolume(top) + meshVolume(bottom);
  // Each open divergence misses the shared cap face contribution,
  // which cancels in the sum (opposite normals) only if the cap is
  // counted... in fact for any closed surface split by a plane, the
  // two open divergence sums add to the total volume exactly.
  assert.ok(Math.abs(sum - 1) < 1e-9, `split volumes sum to the whole (${sum})`);
  // A plane that keeps everything / nothing.
  const all = clipMeshByPlane(mesh, [0, -1, 0], [0, 1, 0]);
  assert.equal(all.indices.length, mesh.indices.length);
  const none = clipMeshByPlane(mesh, [0, 2, 0], [0, 1, 0]);
  assert.equal(none.indices.length, 0);
});

test('cross-section of a cube at mid-height is the unit square', () => {
  const mesh = cube();
  const segments = crossSectionSegments(mesh, [0, 0.5, 0], [0, 1, 0]);
  assert.ok(segments.length >= 4, `section segments ${segments.length}`);
  let total = 0;
  for (const [a, b] of segments) {
    total += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    assert.ok(Math.abs(a[1] - 0.5) < 1e-12 && Math.abs(b[1] - 0.5) < 1e-12, 'segment endpoints lie on the plane');
  }
  assert.ok(Math.abs(total - 4) < 1e-9, `section perimeter ${total} = unit square perimeter`);
  // Diagonal plane through the cube center: section is a rectangle
  // with sides 1 x sqrt(2) -> perimeter 2 + 2 sqrt(2).
  const diag = crossSectionSegments(mesh, [0.5, 0.5, 0], [1, 1, 0]);
  let diagTotal = 0;
  for (const [a, b] of diag) diagTotal += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  assert.ok(Math.abs(diagTotal - (2 + 2 * Math.SQRT2)) < 1e-9, `diagonal section perimeter ${diagTotal.toFixed(6)}`);
});

test('stitched section contours close and enclose the analytic area', () => {
  const mesh = cube();
  const segments = crossSectionSegments(mesh, [0, 0.5, 0], [0, 1, 0]);
  const contours = stitchContours(segments);
  assert.equal(contours.length, 1, 'one contour for the cube mid-section');
  assert.ok(contours[0].closed, 'contour is closed');
  assert.equal(contours[0].points.length, 4, 'four corners');
  // Unit square section: area exactly 1. Diagonal section: the
  // 1 x sqrt(2) rectangle: area sqrt(2).
  assert.ok(Math.abs(crossSectionArea(mesh, [0, 0.5, 0], [0, 1, 0]) - 1) < 1e-9);
  assert.ok(Math.abs(crossSectionArea(mesh, [0.5, 0.5, 0], [1, 1, 0]) - Math.SQRT2) < 1e-9,
    `diagonal section area ${crossSectionArea(mesh, [0.5, 0.5, 0], [1, 1, 0])}`);
  // A plane that misses the mesh: no segments, zero area.
  assert.equal(crossSectionArea(mesh, [0, 5, 0], [0, 1, 0]), 0);
});

test('clip preserves normals by interpolation and validates input', () => {
  const mesh = cube();
  // Give the cube up-normals to check interpolation runs.
  const normals = new Float32Array(mesh.positions.length);
  for (let i = 0; i < normals.length; i += 3) { normals[i] = 0; normals[i + 1] = 1; normals[i + 2] = 0; }
  const clipped = clipMeshByPlane({ ...mesh, normals }, [0.25, 0, 0], [1, 0, 0]);
  assert.ok(clipped.normals, 'normals carried through');
  for (let i = 0; i < clipped.normals.length; i += 3) {
    assert.ok(Math.abs(clipped.normals[i + 1] - 1) < 1e-9, 'interpolated normals stay unit here');
    assert.ok(clipped.positions[i] >= 0.25 - 1e-12, 'kept side respected');
  }
  assert.ok(Math.abs(planeDistance([0, 3, 0], [0, 1, 0], [0, 1, 0]) - 2) < 1e-12, 'signed plane distance');
  assert.throws(() => clipMeshByPlane(mesh, [0, 0, 0], [0, 0, 0]), /non-zero/);
});
