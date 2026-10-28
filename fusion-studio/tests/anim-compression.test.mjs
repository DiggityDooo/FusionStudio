import test from 'node:test';
import assert from 'node:assert/strict';
import { compressScalarCurve, compressTrack, sampleKeys, maxDeviation, compressionReport } from '../src/anim-compression.js';

function sineSamples(frames = 241, freq = 2) {
  return Array.from({ length: frames }, (_, i) => ({ t: i / 60, v: Math.sin((i / 60) * freq * Math.PI) }));
}

test('the epsilon bound is guaranteed against resampling every frame', () => {
  const samples = sineSamples();
  for (const eps of [0.1, 0.01, 0.001]) {
    const keys = compressScalarCurve(samples, eps);
    const deviation = maxDeviation(samples, keys);
    assert.ok(deviation <= eps + 1e-12, `eps ${eps}: deviation ${deviation}`);
    assert.ok(keys.length < samples.length, 'compression actually reduces keys');
    assert.ok(keys.length >= 2);
  }
  const coarse = compressScalarCurve(samples, 0.1);
  const fine = compressScalarCurve(samples, 0.001);
  assert.ok(coarse.length < fine.length, 'tighter epsilon keeps more keys');
  const report = compressionReport(samples.length, compressScalarCurve(samples, 0.01));
  assert.ok(report.savedPercent > 40, `sine at eps 0.01 saves ${report.savedPercent.toFixed(1)}% of keys`);
});

test('piecewise-linear input compresses to exactly its corners at epsilon 0', () => {
  const samples = [];
  for (let i = 0; i <= 40; i++) {
    const t = i;
    const v = t <= 10 ? t : t <= 30 ? 10 - (t - 10) * 0.5 : 0;
    samples.push({ t, v });
  }
  const keys = compressScalarCurve(samples, 0);
  assert.deepEqual(keys.map((k) => k.t), [0, 10, 30, 40], 'only true corners survive');
  assert.equal(maxDeviation(samples, keys), 0);
});

test('constant and two-point curves pass through untouched', () => {
  const flat = Array.from({ length: 30 }, (_, i) => ({ t: i, v: 4 }));
  assert.deepEqual(compressScalarCurve(flat, 0.01).map((k) => k.t), [0, 29]);
  assert.deepEqual(compressScalarCurve([{ t: 0, v: 1 }, { t: 1, v: 2 }], 0.5), [{ t: 0, v: 1 }, { t: 1, v: 2 }]);
  assert.equal(sampleKeys([{ t: 0, v: 2 }, { t: 2, v: 6 }], 1), 4);
  assert.equal(sampleKeys([{ t: 0, v: 2 }, { t: 2, v: 6 }], -5), 2, 'clamps before the first key');
  assert.equal(sampleKeys([{ t: 0, v: 2 }, { t: 2, v: 6 }], 99), 6, 'clamps after the last key');
});

test('multi-channel tracks share key times with per-channel bounds', () => {
  // Channel 0: smooth sine (compressible). Channel 1: sharp zigzag
  // (needs many keys). Union of key times must satisfy both.
  const samples = Array.from({ length: 121 }, (_, i) => ({
    t: i / 60,
    values: [Math.sin(i / 10), (i % 10 === 0 ? 1 : -1) * (i % 20 === 0 ? 1 : 0.2)],
  }));
  const keys = compressTrack(samples, [0.01, 0.05]);
  assert.ok(keys.length < samples.length);
  assert.equal(keys[0].t, 0);
  assert.equal(keys[keys.length - 1].t, 2);
  for (let c = 0; c < 2; c++) {
    const scalarSamples = samples.map((s) => ({ t: s.t, v: s.values[c] }));
    const scalarKeys = keys.map((k) => ({ t: k.t, v: k.values[c] }));
    const eps = [0.01, 0.05][c];
    assert.ok(maxDeviation(scalarSamples, scalarKeys) <= eps + 1e-12, `channel ${c} within eps`);
  }
  // The smooth channel alone needs far fewer keys than the shared set.
  const smoothOnly = compressScalarCurve(samples.map((s) => ({ t: s.t, v: s.values[0] })), 0.01);
  assert.ok(smoothOnly.length < keys.length, 'zigzag channel drives the shared key count up');
});

test('validation errors are explicit', () => {
  assert.throws(() => compressScalarCurve([], 0.1), /at least one sample/);
  assert.throws(() => compressScalarCurve([{ t: 0, v: 0 }, { t: 0, v: 1 }], 0.1), /strictly increasing/);
  assert.throws(() => compressScalarCurve([{ t: 0, v: 0 }], -1), /epsilon must be >= 0/);
  assert.throws(() => compressTrack([{ t: 0, values: [1, 2] }], [0.1]), /per channel mismatch/);
});
