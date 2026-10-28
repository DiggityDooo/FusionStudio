import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateCurve, gaussianKeys, maxCurveError, medianKeys, movingAverageKeys,
  resampleKeys, simplifyKeysBounded,
} from '../src/curve-filters.js';

const keys = (fn, n = 65) => Array.from({ length: n }, (_, i) => ({ frame: i, value: fn(i) }));
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('simplification is certified: dense error never exceeds epsilon', () => {
  const sine = keys((i) => Math.sin(i / 8));
  for (const epsilon of [0.1, 0.01, 0.001]) {
    const simplified = simplifyKeysBounded(sine, epsilon);
    assert.ok(simplified.length < sine.length && simplified.length > 4,
      `epsilon ${epsilon}: kept ${simplified.length}`);
    assert.ok(near(simplified[0].value, sine[0].value) && near(simplified.at(-1).value, sine.at(-1).value), 'endpoints kept');
    const err = maxCurveError(sine, simplified, { samplesPerSegment: 24 });
    assert.ok(err <= epsilon + 1e-12, `certified bound: dense error ${err} <= ${epsilon}`);
    assert.equal(maxCurveError(simplified, simplified), 0, 'self-error zero');
  }
  // A straight line collapses to its endpoints even at epsilon 0.
  const line = keys((i) => 2 * i + 1, 11);
  assert.equal(simplifyKeysBounded(line, 0).length, 2);
  // epsilon 0 keeps every non-collinear key of a sine.
  assert.equal(simplifyKeysBounded(sine, 0).length, sine.length);
  assert.throws(() => simplifyKeysBounded(sine, -1), />= 0/);
});

test('smoothing filters: exact on constants and ramps, spike behavior is exact', () => {
  const constant = keys(() => 3.5, 9);
  for (const out of [movingAverageKeys(constant, 2), gaussianKeys(constant, 1.5), medianKeys(constant, 2)]) {
    assert.ok(out.every((k) => near(k.value, 3.5)), 'constant passes every filter unchanged');
  }
  const ramp = keys((i) => 0.5 * i + 1, 21);
  const averaged = movingAverageKeys(ramp, 3);
  for (let i = 3; i < 18; i++) {
    assert.ok(near(averaged[i].value, ramp[i].value), 'moving average exact on ramp interior');
  }
  const gaussed = gaussianKeys(ramp, 2);
  for (let i = 6; i < 15; i++) {
    assert.ok(near(gaussed[i].value, ramp[i].value, 1e-9), 'gaussian exact on ramp interior (symmetric weights)');
  }
  // Spike [0,0,10,0,0]: moving average gives exactly 10/3 on the
  // three covered keys; median removes it entirely; gaussian
  // attenuates the peak below the box filter and stays symmetric.
  const spike = [0, 0, 10, 0, 0].map((v, i) => ({ frame: i, value: v }));
  assert.deepEqual(movingAverageKeys(spike, 1).map((k) => k.value), [0, 10 / 3, 10 / 3, 10 / 3, 0]);
  assert.deepEqual(medianKeys(spike, 1).map((k) => k.value), [0, 0, 0, 0, 0], 'median deletes the spike');
  const g = gaussianKeys(spike, 1);
  // Closed form: 10 * w0 / (w0 + 2 w1 + 2 w2), w = exp(-d^2 / 2).
  const expectedPeak = 10 / (1 + 2 * Math.exp(-0.5) + 2 * Math.exp(-2));
  assert.ok(near(g[2].value, expectedPeak, 1e-9), `gaussian peak ${g[2].value} vs closed form ${expectedPeak}`);
  assert.ok(near(g[0].value, g[4].value, 1e-12) && near(g[1].value, g[3].value, 1e-12), 'gaussian output symmetric');
  assert.ok(g[1].value > g[0].value, 'gaussian diffuses outward monotonically here');
  // Median preserves a step edge exactly.
  const step = [0, 0, 0, 1, 1, 1].map((v, i) => ({ frame: i, value: v }));
  assert.deepEqual(medianKeys(step, 1).map((k) => k.value), [0, 0, 0, 1, 1, 1]);
});

test('resampling is value-exact and lands the final key precisely', () => {
  const curve = keys((i) => Math.sin(i / 5) * 2 + i * 0.1, 41);
  // Resampling ON the keys (step 1) or at segment midpoints (step
  // 0.5) is lossless for a piecewise-linear curve; an off-key step
  // like 2.5 cuts chords and is not (asserted below).
  assert.equal(maxCurveError(curve, resampleKeys(curve, 1), { samplesPerSegment: 8 }), 0, 'on-key resample is lossless');
  assert.ok(maxCurveError(curve, resampleKeys(curve, 0.5), { samplesPerSegment: 8 }) < 1e-12, 'midpoint resample is lossless up to fp rounding');
  const resampled = resampleKeys(curve, 2.5);
  assert.ok(maxCurveError(curve, resampled, { samplesPerSegment: 8 }) > 0, 'off-key resample cuts chords (documented)');
  assert.equal(resampled.at(-1).frame, 40);
  assert.ok(near(resampled.at(-1).value, curve.at(-1).value));
  const coarse = resampleKeys(curve, 3);
  assert.deepEqual(coarse.map((k) => k.frame), [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 40],
    'non-aligned step still ends exactly on the last frame');
  assert.equal(evaluateCurve(curve, -5), curve[0].value, 'evaluation clamps below');
  assert.equal(evaluateCurve(curve, 999), curve.at(-1).value, 'evaluation clamps above');
  assert.throws(() => resampleKeys(curve, 0), /positive/);
  assert.throws(() => evaluateCurve([{ frame: 0, value: 0 }, { frame: 0, value: 1 }], 0), /duplicate/);
});
