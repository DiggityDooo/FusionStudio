import test from 'node:test';
import assert from 'node:assert/strict';
import { trackPatch, trackPoints, estimateAffine, applyAffine, affineResidual, sampleBilinear } from '../src/patch-tracker.js';

function makeImage(width, height, fn) {
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = fn(x, y);
  return { data, width, height };
}
// Smooth blobby texture: trackable anywhere, no aliasing.
const texture = (x, y) => Math.sin(x * 0.31 + 1.7) * Math.cos(y * 0.23) + Math.sin((x + y) * 0.11) * 1.4 + Math.cos(x * 0.07 - y * 0.13) * 0.8;
const base = makeImage(96, 96, texture);

// Shifted copy of the base image by (dx, dy) image content.
function shiftedImage(dx, dy) {
  return makeImage(96, 96, (x, y) => {
    const v = sampleBilinear(base, x - dx, y - dy);
    return v === null ? 0 : v;
  });
}

test('integer translation is recovered exactly', () => {
  const moved = shiftedImage(3, -2);
  const hit = trackPatch(base, moved, 48, 48, { radius: 6, search: 8 });
  assert.ok(hit, 'track found');
  assert.deepEqual(hit.integerOffset, [3, -2]);
  assert.ok(Math.abs(hit.x - 51) < 0.25 && Math.abs(hit.y - 46) < 0.25, `subpixel (${hit.x.toFixed(2)}, ${hit.y.toFixed(2)})`);
  assert.ok(hit.score > 0.99, `score ${hit.score}`);
});

test('subpixel translation is recovered within a fraction of a pixel', () => {
  const moved = shiftedImage(1.4, 0.6);
  const hit = trackPatch(base, moved, 48, 48, { radius: 6, search: 6 });
  assert.ok(hit);
  assert.ok(Math.abs(hit.x - 49.4) < 0.2, `x ${hit.x.toFixed(3)} vs 49.4`);
  assert.ok(Math.abs(hit.y - 48.6) < 0.2, `y ${hit.y.toFixed(3)} vs 48.6`);
});

test('unrelated content and flat patches are reported lost, not guessed', () => {
  const other = makeImage(96, 96, (x, y) => Math.sin(y * 0.9) * 2);
  assert.equal(trackPatch(base, other, 48, 48, { radius: 6, search: 8 }), null);
  const flat = makeImage(96, 96, () => 0.5);
  assert.equal(trackPatch(flat, flat, 48, 48, { radius: 4, search: 4 }), null, 'featureless patch cannot track');
  assert.throws(() => trackPatch(base, base, 2, 2, { radius: 6 }), /leaves the frame/);
});

test('affine estimation is exact for noiseless correspondences', () => {
  const truth = [[1.2, 0.3, 5], [-0.2, 0.9, -3]];
  const src = [[0, 0], [10, 0], [0, 10], [10, 10], [4, 7], [-3, 5]];
  const dst = src.map((p) => applyAffine(truth, p));
  const recovered = estimateAffine(src, dst);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
    assert.ok(Math.abs(recovered[r][c] - truth[r][c]) < 1e-9, `[${r}][${c}] ${recovered[r][c]} vs ${truth[r][c]}`);
  }
  assert.ok(affineResidual(recovered, src, dst) < 1e-9);
  assert.throws(() => estimateAffine([[0, 0], [1, 1]], [[0, 0], [1, 1]]), />= 3/);
  assert.throws(() => estimateAffine([[0, 0], [1, 1], [2, 2]], [[0, 0], [1, 1], [2, 2]]), /collinear/);
});

test('tracking + affine recovers object motion across a frame pair', () => {
  const moved = shiftedImage(2.5, 1.5);
  const points = [[30, 30], [60, 30], [30, 60], [60, 60], [45, 45]];
  const tracked = trackPoints(base, moved, points, { radius: 6, search: 8 });
  assert.ok(tracked.every(Boolean), 'all points tracked');
  const affine = estimateAffine(points, tracked);
  // Oracle: pure translation (2.5, 1.5), linear part = identity.
  assert.ok(Math.abs(affine[0][0] - 1) < 0.02 && Math.abs(affine[1][1] - 1) < 0.02, 'linear part ~ identity');
  assert.ok(Math.abs(affine[0][2] - 2.5) < 0.2, `tx ${affine[0][2].toFixed(3)}`);
  assert.ok(Math.abs(affine[1][2] - 1.5) < 0.2, `ty ${affine[1][2].toFixed(3)}`);
  assert.ok(affineResidual(affine, points, tracked) < 0.15, 'points agree on one rigid story');
});
