import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateOrientation, findBestOrientation, candidateDirections } from '../src/print-orient.js';

// Hemisphere dome (flat side in XZ plane at y=0, dome toward +Y).
function domeFixture(radius = 1, rings = 6, segs = 12) {
  const positions = [];
  const indices = [];
  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * (Math.PI / 2); // 0 at rim (XZ plane) -> PI/2 top
    for (let s = 0; s < segs; s++) {
      const theta = (s / segs) * Math.PI * 2;
      positions.push(
        Math.cos(phi) * Math.cos(theta) * radius,
        Math.sin(phi) * radius,
        Math.cos(phi) * Math.sin(theta) * radius,
      );
    }
  }
  // Bottom cap fan center.
  const centerIndex = positions.length / 3;
  positions.push(0, 0, 0);
  for (let r = 0; r < rings; r++) for (let s = 0; s < segs; s++) {
    const a = r * segs + s, b = r * segs + ((s + 1) % segs), c = a + segs, d = b + segs;
    indices.push(a, c, b, b, c, d);
  }
  for (let s = 0; s < segs; s++) {
    indices.push(centerIndex, ((s + 1) % segs), s);
  }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices), normals: null };
}

function boxMesh(sx = 10, sy = 1, sz = 10) {
  const positions = Float32Array.from([
    0, 0, 0, sx, 0, 0, sx, sy, 0, 0, sy, 0,
    0, 0, sz, sx, 0, sz, sx, sy, sz, 0, sy, sz,
  ]);
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [3, 0, 4, 7]];
  const indices = [];
  for (const [a, b, c, d] of quads) indices.push(a, b, c, a, c, d);
  return { positions, indices: Uint32Array.from(indices), normals: null };
}

test('cube and plate: axis directions need zero support (plate exemption)', () => {
  const cube = boxMesh(2, 2, 2);
  for (const up of [[0, 1, 0], [1, 0, 0], [0, 0, 1]]) {
    const ev = evaluateOrientation(cube, up);
    assert.equal(ev.supportArea, 0, `cube on axis ${up} needs no support`);
    assert.ok(Math.abs(ev.height - 2) < 1e-9);
  }
  // Slight tilt: only the bottom face (area 4) points steeply down,
  // and it is not plate-exempt (only one corner touches). A body
  // diagonal, by contrast, leaves every face steeper than the 45
  // degree self-support angle -> zero support (verified behavior).
  const tilted = evaluateOrientation(cube, [0.2, 1, 0.2]);
  assert.ok(Math.abs(tilted.supportArea - 4) < 1e-6, `tilted support ${tilted.supportArea}`);
  assert.equal(evaluateOrientation(cube, [1, 1, 1]).supportArea, 0);
  assert.throws(() => evaluateOrientation(cube, [0, 0, 0]), /zero/);
});

test('dome: flat-side-down needs no support; flipped needs plenty', () => {
  const dome = domeFixture();
  const flatDown = evaluateOrientation(dome, [0, 1, 0]);
  assert.equal(flatDown.supportArea, 0, 'dome on its flat side: outer normals never point steeply down');
  const flipped = evaluateOrientation(dome, [0, -1, 0]);
  assert.ok(flipped.supportArea > 1.5, `flipped dome support ${flipped.supportArea.toFixed(2)} (curved surface hangs)`);
  const best = findBestOrientation(dome, {});
  assert.ok(Math.abs(best.up[1] - 1) < 0.2, `optimizer finds flat-down (up = ${best.up.map((v) => v.toFixed(2))})`);
  assert.equal(best.supportArea, 0);
});

test('thin plate: optimizer lays it flat (zero support, minimal height)', () => {
  const plate = boxMesh(10, 1, 10);
  const best = findBestOrientation(plate, {});
  assert.equal(best.supportArea, 0);
  assert.ok(Math.abs(best.height - 1) < 0.35, `flat height ~1 (got ${best.height.toFixed(2)})`);
  // Standing the plate on edge also has zero support (vertical
  // faces) but 10x the height: the tie-break must choose flat.
  const onEdge = evaluateOrientation(plate, [1, 0, 0]);
  assert.equal(onEdge.supportArea, 0);
  assert.ok(Math.abs(onEdge.height - 10) < 1e-9);
  assert.ok(best.height < onEdge.height, 'height tie-break picks flat');
});

test('candidate directions cover the sphere deterministically', () => {
  const a = candidateDirections(50);
  const b = candidateDirections(50);
  assert.deepEqual(a, b);
  assert.equal(a.length, 56);
  for (const d of a) assert.ok(Math.abs(Math.hypot(...d) - 1) < 1e-9, 'unit directions');
});
