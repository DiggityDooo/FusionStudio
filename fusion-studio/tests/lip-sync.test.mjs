import test from 'node:test';
import assert from 'node:assert/strict';
import { createLipSync, PHONEME_TO_VISEME, VISEMES } from '../src/lip-sync.js';

const SENTENCE = [
  { phoneme: 'hh', start: 0.0, duration: 0.08 },
  { phoneme: 'eh', start: 0.08, duration: 0.12 },
  { phoneme: 'l', start: 0.20, duration: 0.08 },
  { phoneme: 'ow', start: 0.28, duration: 0.18 },
  { phoneme: 'sil', start: 0.46, duration: 0.2 },
];

test('phonemes map to visemes and reach full dominance mid-phoneme', () => {
  const track = createLipSync(SENTENCE, { fps: 60 });
  assert.equal(track.leadAt(0.14), 'E', 'middle of eh');
  assert.equal(track.leadAt(0.37), 'O', 'middle of ow');
  assert.equal(track.leadAt(0.56), 'sil');
  assert.ok(Math.abs(track.sampleAt(0.14).E - 1) < 1e-9, 'full weight at phoneme center');
  assert.ok(Math.abs(track.sampleAt(0.37).O - 1) < 1e-9);
  // Frames cover the whole duration at the requested rate.
  assert.equal(track.frames[track.frames.length - 1].t >= 0.66 - 1 / 60, true);
  for (const frame of track.frames) {
    assert.deepEqual(Object.keys(frame.weights).sort(), [...VISEMES].sort(), 'every viseme present every frame');
    for (const w of Object.values(frame.weights)) assert.ok(w >= 0 && w <= 1);
  }
});

test('coarticulation: dominance rises before onset and crosses between neighbors', () => {
  const track = createLipSync(SENTENCE, { coarticulation: 0.06, fps: 60 });
  const before = track.sampleAt(0.25); // before ow onset (0.28), after l
  assert.ok(before.O > 0, 'upcoming vowel already influences the mouth');
  assert.ok(before.O < 1);
  // At the l/ow boundary the weights genuinely blend.
  const atBoundary = track.sampleAt(0.28);
  assert.ok(atBoundary.NN > 0 && atBoundary.O > 0, `blend at boundary: NN=${atBoundary.NN.toFixed(2)} O=${atBoundary.O.toFixed(2)}`);
  // Zero coarticulation removes anticipation entirely.
  const hard = createLipSync(SENTENCE, { coarticulation: 0, fps: 60 });
  assert.equal(hard.sampleAt(0.25).O, 0);
  // Weights are monotone rising through the anticipation window.
  const t1 = track.sampleAt(0.235).O, t2 = track.sampleAt(0.255).O, t3 = track.sampleAt(0.275).O;
  assert.ok(t1 < t2 && t2 < t3, `rising: ${t1} < ${t2} < ${t3}`);
});

test('silence rests at sil=1 outside and between utterances', () => {
  const track = createLipSync([
    { phoneme: 'aa', start: 0.5, duration: 0.2 },
  ], { fps: 30 });
  assert.equal(track.sampleAt(0).sil, 1);
  assert.equal(track.sampleAt(0.25).sil, 1, 'gap before the phoneme is silent (beyond coarticulation)');
  assert.equal(track.leadAt(0.6), 'AA');
  const after = track.sampleAt(0.9);
  assert.equal(after.sil, 1);
});

test('the phoneme table covers consonant families distinctly', () => {
  assert.equal(PHONEME_TO_VISEME.p, 'PP');
  assert.equal(PHONEME_TO_VISEME.m, 'PP');
  assert.equal(PHONEME_TO_VISEME.f, 'FF');
  assert.equal(PHONEME_TO_VISEME.s, 'SS');
  assert.equal(PHONEME_TO_VISEME.k, 'KK');
  assert.equal(PHONEME_TO_VISEME.uw, 'U');
  assert.ok(VISEMES.includes('sil') && VISEMES.length >= 12);
});

test('validation: unknown phonemes, bad durations, overlaps', () => {
  assert.throws(() => createLipSync([{ phoneme: 'xx', start: 0, duration: 0.1 }]), /unknown phoneme 'xx'/);
  assert.throws(() => createLipSync([{ phoneme: 'aa', start: 0, duration: 0 }]), /positive duration/);
  assert.throws(() => createLipSync([
    { phoneme: 'aa', start: 0, duration: 0.3 },
    { phoneme: 'eh', start: 0.2, duration: 0.1 },
  ]), /overlapping phonemes/);
  // Out-of-order input is sorted, not rejected.
  const track = createLipSync([
    { phoneme: 'eh', start: 0.3, duration: 0.1 },
    { phoneme: 'aa', start: 0.0, duration: 0.1 },
  ]);
  assert.equal(track.leadAt(0.05), 'AA');
  assert.equal(track.duration, 0.4);
});
