import test from 'node:test';
import assert from 'node:assert/strict';
import { offsetPolygon, pocketToolpath, profileToolpath, signedArea, polygonPerimeter, isSimplePolygon } from '../src/toolpath.js';

const SQUARE = [[0, 0], [10, 0], [10, 10], [0, 10]];

test('square offsets match the analytic (s +- 2d)^2 areas exactly', () => {
  const out = offsetPolygon(SQUARE, 2);
  assert.ok(Math.abs(Math.abs(signedArea(out)) - 196) < 1e-9, `outward area ${signedArea(out)}`);
  const inward = offsetPolygon(SQUARE, -2);
  assert.ok(Math.abs(Math.abs(signedArea(inward)) - 36) < 1e-9, `inward area ${signedArea(inward)}`);
  // Vertices land exactly on the expanded square.
  const xs = out.map((p) => p[0]), ys = out.map((p) => p[1]);
  assert.ok(Math.abs(Math.min(...xs) + 2) < 1e-9 && Math.abs(Math.max(...xs) - 12) < 1e-9);
  assert.ok(Math.abs(Math.min(...ys) + 2) < 1e-9 && Math.abs(Math.max(...ys) - 12) < 1e-9);
  // CW input winding is normalized to the same result.
  const cw = offsetPolygon([...SQUARE].reverse(), 2);
  assert.ok(Math.abs(Math.abs(signedArea(cw)) - 196) < 1e-9);
  // Offsetting inward past the center collapses to null, not garbage.
  assert.equal(offsetPolygon(SQUARE, -5), null);
  assert.equal(offsetPolygon(SQUARE, -7), null);
});

test('regular polygon offset tracks the circle area law', () => {
  const n = 64, r = 5;
  const circle = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    circle.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const out = offsetPolygon(circle, 1);
  const expected = Math.PI * 36;
  assert.ok(Math.abs(Math.abs(signedArea(out)) - expected) / expected < 0.01,
    `offset circle area ${Math.abs(signedArea(out)).toFixed(1)} vs ${expected.toFixed(1)}`);
  const inward = offsetPolygon(circle, -1);
  const expectedIn = Math.PI * 16;
  assert.ok(Math.abs(Math.abs(signedArea(inward)) - expectedIn) / expectedIn < 0.01);
});

test('pocket toolpath: exact ring count, length, and cleared area on a square', () => {
  const { rings, totalLength, clearedArea, stockArea } = pocketToolpath(SQUARE, { toolDiameter: 1, stepover: 0.5 });
  // Rings at insets 0.5..4.5 -> sides 9..1, perimeters 36..4.
  assert.equal(rings.length, 9);
  assert.ok(Math.abs(totalLength - 180) < 1e-9, `total length ${totalLength}`);
  assert.equal(stockArea, 100);
  assert.ok(Math.abs(clearedArea - 99) < 1e-9, `conservative cleared ${clearedArea}`);
  for (const ring of rings) assert.ok(isSimplePolygon(ring), 'every ring is a valid simple polygon');
  assert.throws(() => pocketToolpath(SQUARE, { toolDiameter: 0 }), /positive/);
});

test('concave L pocket clears with simple rings; profile offsets both sides', () => {
  const L = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]];
  assert.ok(Math.abs(signedArea(L) - 64) < 1e-9);
  const { rings, clearedArea } = pocketToolpath(L, { toolDiameter: 1, stepover: 0.7 });
  assert.ok(rings.length >= 3, `L pocket rings ${rings.length}`);
  for (const ring of rings) assert.ok(isSimplePolygon(ring), 'concave rings stay simple until collapse');
  assert.ok(clearedArea > 50, `L cleared ${clearedArea.toFixed(1)} of 64`);
  const outside = profileToolpath(SQUARE, { toolDiameter: 2, side: 'outside' });
  assert.ok(Math.abs(outside.length - 48) < 1e-9, `outside profile perimeter ${outside.length}`);
  const inside = profileToolpath(SQUARE, { toolDiameter: 2, side: 'inside' });
  assert.ok(Math.abs(inside.length - 32) < 1e-9);
  assert.throws(() => profileToolpath(SQUARE, { toolDiameter: 30, side: 'inside' }), /collapsed/);
});

test('acute corners are miter-clamped, not spiked', () => {
  // Needle triangle: the apex miter would be enormous unclamped.
  const needle = [[0, 0], [10, 0.5], [0, 1]];
  const out = offsetPolygon(needle, 0.5, { miterLimit: 2 });
  assert.ok(out, 'offset produced');
  for (const [x, y] of out) {
    assert.ok(Math.abs(x) < 12 && Math.abs(y) < 3, `no spike vertex (${x}, ${y})`);
  }
  assert.ok(isSimplePolygon(out));
  assert.throws(() => offsetPolygon([[0, 0], [1, 1]]), />= 3/);
});
