import test from 'node:test';
import assert from 'node:assert/strict';
import { createRope, createCable, simulateRope, stepRope, getPoint, currentLength, pinPoint } from '../src/rope.js';

// Solve the catenary parameter a for span d and length L:
// L/2 = a * sinh(d / (2a)); sag = a * (cosh(d / (2a)) - 1).
function catenarySag(span, length) {
  let lo = 1e-6, hi = 1e6;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const val = mid * Math.sinh(span / (2 * mid));
    if (val < length / 2) hi = mid; else lo = mid;
  }
  const a = (lo + hi) / 2;
  return a * (Math.cosh(span / (2 * a)) - 1);
}

test('a hanging chain settles to the analytic catenary sag', () => {
  const span = 8, segments = 40, segmentLength = 0.25; // total length 10
  const rope = createCable([0, 0, 0], [span, 0, 0], segments, { segmentLength, damping: 0.995 });
  simulateRope(rope, { duration: 6, dt: 1 / 60, iterations: 40 });
  const mid = getPoint(rope, segments / 2);
  const expectedSag = catenarySag(span, segments * segmentLength);
  assert.ok(Math.abs(-mid[1] - expectedSag) / expectedSag < 0.03,
    `midpoint sag ${-mid[1]} vs catenary ${expectedSag}`);
  assert.ok(Math.abs(mid[0] - span / 2) < 0.05, 'midpoint stays centered');
  assert.ok(Math.abs(mid[2]) < 1e-6, 'planar setup stays planar');
  // Symmetry: quarter point mirrors three-quarter point.
  const q1 = getPoint(rope, segments / 4);
  const q3 = getPoint(rope, (3 * segments) / 4);
  assert.ok(Math.abs(q1[1] - q3[1]) < 0.02, `symmetric sag ${q1[1]} vs ${q3[1]}`);
});

test('segment lengths and total length are preserved under load', () => {
  const rope = createCable([0, 0, 0], [5, 0, 0], 20, { segmentLength: 0.3 });
  simulateRope(rope, { duration: 3, dt: 1 / 60, iterations: 30 });
  assert.ok(Math.abs(currentLength(rope) - 6) / 6 < 0.01, `length ${currentLength(rope)} vs 6`);
  for (let i = 0; i < rope.count - 1; i++) {
    const a = getPoint(rope, i), b = getPoint(rope, i + 1);
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    assert.ok(Math.abs(seg - 0.3) / 0.3 < 0.02, `segment ${i} length ${seg}`);
  }
  // Pins are exact.
  assert.deepEqual(getPoint(rope, 0), [0, 0, 0]);
  assert.deepEqual(getPoint(rope, 20), [5, 0, 0]);
});

test('a two-point rope is a pendulum with the analytic period', () => {
  const L = 2, g = 9.81;
  const angle = 0.12; // small-angle regime
  const rope = createRope(
    [[0, 0, 0], [L * Math.sin(angle), -L * Math.cos(angle), 0]],
    { pinned: [0], gravity: [0, -g, 0], damping: 1 },
  );
  // Measure period from successive same-direction zero crossings of x.
  const crossings = [];
  let prevX = getPoint(rope, 1)[0];
  const dt = 1 / 240;
  let t = 0;
  for (let s = 0; s < 240 * 8 && crossings.length < 3; s++) {
    stepRope(rope, dt, { iterations: 8 });
    t += dt;
    const x = getPoint(rope, 1)[0];
    if (prevX < 0 && x >= 0) crossings.push(t);
    prevX = x;
  }
  assert.equal(crossings.length, 3, 'observed three swings');
  const measured = crossings[2] - crossings[0];
  const expected = 2 * Math.PI * Math.sqrt(L / g);
  const periods = measured / 2;
  assert.ok(Math.abs(periods - expected) / expected < 0.02,
    `period ${periods}s vs analytic ${expected}s`);
});

test('sphere colliders push rope points out; unpinned rope falls and rests on a sphere', () => {
  const rope = createCable([-2, 2, 0], [2, 2, 0], 16, { damping: 0.99 });
  // Unpin the ends so the whole rope drapes over the sphere.
  rope.pinned.clear();
  simulateRope(rope, { duration: 3, dt: 1 / 60, iterations: 30, colliders: [{ center: [0, 0, 0], radius: 1.2 }] });
  for (let i = 0; i < rope.count; i++) {
    const p = getPoint(rope, i);
    const d = Math.hypot(p[0], p[1], p[2]);
    assert.ok(d >= 1.2 - 1e-3, `point ${i} inside sphere: d=${d}`);
  }
  const mid = getPoint(rope, 8);
  assert.ok(mid[1] > 0.9, 'midpoint rests on top of the sphere, not fallen through');
});

test('re-pinning mid-simulation holds the point exactly; validation errors', () => {
  const rope = createCable([0, 0, 0], [4, 0, 0], 8);
  simulateRope(rope, { duration: 0.5, dt: 1 / 60 });
  pinPoint(rope, 4, [2, 0.5, 0]);
  simulateRope(rope, { duration: 0.5, dt: 1 / 60 });
  assert.deepEqual(getPoint(rope, 4), [2, 0.5, 0]);
  assert.throws(() => createRope([[0, 0, 0]]), /at least 2 points/);
  assert.throws(() => createCable([0, 0, 0], [1, 0, 0], 0), /positive integer/);
  assert.throws(() => stepRope(rope, 0), /dt must be positive/);
});
