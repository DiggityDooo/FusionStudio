import test from 'node:test';
import assert from 'node:assert/strict';
import { clipAndCap, clipMeshByPlane, crossSectionArea, meshVolume, triangulateContour } from '../src/mesh-section.js';

// Unit cube [0,1]^3, outward faces (same fixture as mesh-section tests).
function cube(origin = [0, 0, 0], size = 1, flip = false) {
  const [ox, oy, oz] = origin;
  const s = size;
  const positions = new Float32Array([
    ox, oy, oz, ox + s, oy, oz, ox + s, oy + s, oz, ox, oy + s, oz,
    ox, oy, oz + s, ox + s, oy, oz + s, ox + s, oy + s, oz + s, ox, oy + s, oz + s,
  ]);
  const quads = [
    [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
    [2, 3, 7, 6], [1, 2, 6, 5], [3, 0, 4, 7],
  ];
  const indices = [];
  for (const [a, b, c, d] of quads) {
    if (flip) indices.push(a, c, b, a, d, c);
    else indices.push(a, b, c, a, c, d);
  }
  return { positions, indices: Uint32Array.from(indices), normals: null };
}

const keyOf = (p, i) => [0, 1, 2].map((k) => Math.round(p[i * 3 + k] / 1e-6)).join(',');

function assertWatertight(mesh, label) {
  const directed = new Map();
  const { positions, indices } = mesh;
  for (let t = 0; t + 2 < indices.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = keyOf(positions, indices[t + e]);
      const b = keyOf(positions, indices[t + ((e + 1) % 3)]);
      const k = `${a}->${b}`;
      directed.set(k, (directed.get(k) || 0) + 1);
    }
  }
  for (const [k, count] of directed) {
    const [a, b] = k.split('->');
    assert.equal(count, 1, `${label}: directed edge ${k} used ${count}x`);
    assert.equal(directed.get(`${b}->${a}`), 1, `${label}: edge ${k} lacks its opposite twin`);
  }
  return directed.size / 2;
}

test('capped mid-height clip is a watertight solid of exactly half volume', () => {
  const solid = clipAndCap(cube(), [0, 0.5, 0], [0, 1, 0]);
  assert.ok(Math.abs(meshVolume(solid) - 0.5) < 1e-9, `capped volume ${meshVolume(solid)}`);
  const edges = assertWatertight(solid, 'half cube');
  assert.ok(edges > 0);
  // Cap: the section contour keeps the face-diagonal midpoints
  // (8 points), so ear clipping emits 6 triangles on y = 0.5.
  let capTris = 0;
  for (let t = 0; t + 2 < solid.indices.length; t += 3) {
    const ys = [0, 1, 2].map((e) => solid.positions[solid.indices[t + e] * 3 + 1]);
    if (ys.every((y) => Math.abs(y - 0.5) < 1e-6)) capTris++;
  }
  assert.equal(capTris, 6);
});

test('diagonal capped clip: exact prism volume and cap area', () => {
  const mesh = cube();
  // Plane x + y = 1.1 (offset from the centroid plane so no mesh
  // vertex lies exactly on it). Kept solid is a triangular prism:
  // xy legs 0.9 -> base area 0.405, extruded over z in [0,1].
  const solid = clipAndCap(mesh, [0.55, 0.55, 0], [1, 1, 0]);
  assert.ok(Math.abs(meshVolume(solid) - 0.405) < 1e-6, `diagonal capped volume ${meshVolume(solid)}`); // Float32 inputs
  assertWatertight(solid, 'diagonal prism');
  // Cap tris: all vertices on the plane x + y = 1.1; section is a
  // 0.9*sqrt(2) by 1 rectangle.
  let capArea = 0;
  const { positions, indices } = solid;
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const pts = [0, 1, 2].map((e) => {
      const i = indices[t + e] * 3;
      return [positions[i], positions[i + 1], positions[i + 2]];
    });
    if (pts.every((p) => Math.abs(p[0] + p[1] - 1.1) < 1e-6)) {
      const [a, b, c] = pts;
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      capArea += 0.5 * Math.hypot(...cross);
      // Cap faces away from the kept side: normal . n < 0. Only
      // genuine cap-facing triangles count (the degenerate ear on
      // the z=0 edge has a +/-Z normal and zero winding signal).
      const dotN = (cross[0] + cross[1]) * Math.SQRT1_2;
      if (Math.abs(dotN) > 1e-9) {
        assert.ok(dotN < 0, 'cap winding faces the removed side');
      }
    }
  }
  assert.ok(Math.abs(capArea - 0.9 * Math.SQRT2) < 1e-6, `cap area ${capArea} vs 0.9*sqrt(2)`);
  assert.ok(Math.abs(capArea - crossSectionArea(mesh, [0.55, 0.55, 0], [1, 1, 0])) < 1e-6);
});

test('ear clipping triangulates a non-convex L contour exactly, either winding', () => {
  const L = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]]; // area 3
  const inL = (x, z) => (x > 0.01 && x < 1.99 && z > 0.01 && z < 0.99) || (x > 0.01 && x < 0.99 && z > 0.01 && z < 1.99);
  for (const pts of [L, [...L].reverse()]) {
    const points3 = pts.map(([x, z]) => [x, 0, z]);
    const tris = triangulateContour(points3, [0, 1, 0]);
    assert.equal(tris.length, 4, 'L hexagon -> 4 triangles');
    let area = 0;
    for (const [ia, ib, ic] of tris) {
      const a = points3[ia], b = points3[ib], c = points3[ic];
      const ab = [b[0] - a[0], 0, b[2] - a[2]];
      const ac = [c[0] - a[0], 0, c[2] - a[2]];
      const crossY = ab[2] * ac[0] - ab[0] * ac[2];
      area += 0.5 * Math.abs(crossY);
      assert.ok(crossY < 0, 'cap normal faces -n (down for +Y section normal)');
      const cx = (a[0] + b[0] + c[0]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
      assert.ok(inL(cx, cz), `triangle centroid (${cx}, ${cz}) inside the L`);
    }
    assert.ok(Math.abs(area - 3) < 1e-12, `L cap area ${area}`);
  }
});

test('nested section contours are rejected; a missing plane needs no cap', () => {
  const outer = cube();
  const inner = cube([0.25, 0.25, 0.25], 0.5, true); // hollow shell
  const hollow = {
    positions: Float32Array.from([...outer.positions, ...inner.positions]),
    indices: Uint32Array.from([...outer.indices, ...inner.indices.map((i) => i + 8)]),
    normals: null,
  };
  assert.throws(() => clipAndCap(hollow, [0, 0.5, 0], [0, 1, 0]), /nested section contours/);
  // Plane missing the mesh entirely: plain clipped result, no throw.
  const empty = clipAndCap(cube(), [0, 5, 0], [0, 1, 0]);
  assert.equal(empty.indices.length, 0);
  const full = clipAndCap(cube(), [0, -1, 0], [0, 1, 0]);
  assert.equal(full.indices.length, cube().indices.length);
  // Uncapped clip stays open: its divergence misses the cap term
  // (r.n = -0.5 over unit area -> open = 0.5 + 1/6), while the two
  // open halves still sum exactly to the whole cube.
  const openTop = clipMeshByPlane(cube(), [0, 0.5, 0], [0, 1, 0]);
  const openBottom = clipMeshByPlane(cube(), [0, 0.5, 0], [0, -1, 0]);
  assert.ok(Math.abs(meshVolume(openTop) - 2 / 3) < 1e-9, `open divergence ${meshVolume(openTop)}`);
  assert.ok(Math.abs(meshVolume(openTop) + meshVolume(openBottom) - 1) < 1e-9);
});
