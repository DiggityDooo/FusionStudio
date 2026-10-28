import test from 'node:test';
import assert from 'node:assert/strict';
import { volumePreservingScale, scaleVolume, stretchFactor, solveStretchyLimb, createSquashSpring } from '../src/squash-stretch.js';

test('volume is preserved exactly for any stretch and axis', () => {
  for (const stretch of [0.25, 0.5, 0.9, 1, 1.7, 3, 8]) {
    for (const axis of [0, 1, 2]) {
      const scale = volumePreservingScale(stretch, axis);
      assert.ok(Math.abs(scaleVolume(scale) - 1) < 1e-12, `stretch ${stretch} axis ${axis}`);
      assert.equal(scale[axis], stretch);
      const perp = scale[(axis + 1) % 3];
      assert.ok(Math.abs(perp - 1 / Math.sqrt(stretch)) < 1e-12);
      assert.equal(scale[(axis + 1) % 3], scale[(axis + 2) % 3], 'perpendicular axes stay equal');
    }
  }
  assert.throws(() => volumePreservingScale(0, 1), /must be positive/);
  assert.throws(() => volumePreservingScale(1, 3), /axis must be/);
});

test('stretchy limb reaches exactly until maxStretch, then soft-limits', () => {
  const inside = solveStretchyLimb(2, 3, { axis: 1, maxStretch: 2 });
  assert.equal(inside.stretch, 1.5);
  assert.equal(inside.reached, true);
  assert.equal(inside.reachedDistance, 3);
  assert.ok(Math.abs(scaleVolume(inside.scale) - 1) < 1e-12, 'still volume-preserving');

  const beyond = solveStretchyLimb(2, 100, { axis: 1, maxStretch: 2, softRange: 0.5 });
  assert.equal(beyond.reached, false);
  assert.ok(beyond.stretch > 2 && beyond.stretch <= 2.5, `soft limit bounded by maxStretch + softRange: ${beyond.stretch}`);
  const moderate = stretchFactor(6, 2, { maxStretch: 2, softRange: 0.5 });
  assert.ok(Math.abs(moderate - (2 + 0.5 * Math.tanh(2))) < 1e-12, 'tanh ease shape exact at moderate overage');
  // Monotonic in distance, and continuous at the maxStretch boundary.
  const atBoundary = stretchFactor(4, 2, { maxStretch: 2, softRange: 0.5 });
  const justBeyond = stretchFactor(4.0001, 2, { maxStretch: 2, softRange: 0.5 });
  assert.ok(Math.abs(atBoundary - 2) < 1e-9);
  assert.ok(Math.abs(justBeyond - atBoundary) < 1e-3, 'no snap at the boundary');
  let prev = 0;
  for (let d = 0; d <= 20; d += 0.5) {
    const f = stretchFactor(d, 2, { maxStretch: 2, softRange: 0.5 });
    assert.ok(f >= prev, 'monotonic');
    prev = f;
  }
  // Compression (distance < rest) squashes below 1 with volume kept.
  const squashed = solveStretchyLimb(2, 1, { axis: 0 });
  assert.equal(squashed.stretch, 0.5);
  assert.ok(squashed.scale[1] > 1, 'perpendicular bulge on compression');
});

test('impact squash springs back through stretch and settles at 1', () => {
  const squash = createSquashSpring({ omega: 14, zeta: 0.15 });
  squash.impact(0.55);
  let maxStretch = 0;
  let value = 0;
  for (let s = 0; s < 60 * 3; s++) {
    value = squash.update(1 / 60);
    maxStretch = Math.max(maxStretch, value);
    const scale = squash.scale(1);
    assert.ok(Math.abs(scaleVolume(scale) - 1) < 1e-9, 'volume preserved throughout the bounce');
  }
  assert.ok(maxStretch > 1.1, `recovery overshoots into stretch (${maxStretch.toFixed(3)})`);
  assert.ok(Math.abs(value - 1) < 0.01, `settles at rest (${value})`);
  assert.throws(() => squash.impact(0), /impact amount/);
  assert.throws(() => squash.impact(2.5), /impact amount/);
});
