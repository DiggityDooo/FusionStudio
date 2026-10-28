import test from 'node:test';
import assert from 'node:assert/strict';
import { makeClip, makeTrack, clipActive, clipSourceFrame, evaluateNla } from '../src/nla-eval.js';

const constSampler = (values) => (clip) => values[clip.name];

test('clip time mapping stretches source across the strip and wraps on repeat', () => {
  const clip = makeClip({ name: 'A', start: 10, stripLength: 10, sourceStart: 100, sourceLength: 20 });
  // timeScale = 2: frame 10 -> 100, frame 12 -> 104, frame 19.5 -> 119.
  assert.equal(clipSourceFrame(clip, 10), 100);
  assert.equal(clipSourceFrame(clip, 12), 104);
  assert.ok(Math.abs(clipSourceFrame(clip, 19.5) - 119) < 1e-9);
  assert.ok(clipActive(clip, 10) && clipActive(clip, 19.99) && !clipActive(clip, 20));
  const looping = makeClip({ name: 'L', start: 0, stripLength: 10, sourceStart: 0, sourceLength: 10, repeat: 3 });
  assert.equal(clipSourceFrame(looping, 25), 5, 'third repeat wraps');
  assert.ok(clipActive(looping, 29.9) && !clipActive(looping, 30), 'repeat extends activity');
});

test('single clip evaluates to its sampled value; empty stack is the rest value', () => {
  const clip = makeClip({ name: 'A', start: 0, stripLength: 10, sourceStart: 0, sourceLength: 10 });
  const track = makeTrack({ clips: [clip] });
  assert.equal(evaluateNla([track], 5, (c, f) => f * 2, 99), 10, 'source frame 5 * 2');
  assert.equal(evaluateNla([track], 50, () => 1, 99), 99, 'outside strip: rest');
  assert.equal(evaluateNla([], 5, () => 1, 99), 99);
  assert.throws(() => makeClip({ stripLength: 0 }), RangeError);
});

test('overlapping clips crossfade by normalized weights', () => {
  const a = makeClip({ name: 'A', start: 0, stripLength: 20, sourceStart: 0, sourceLength: 20 });
  const b = makeClip({ name: 'B', start: 10, stripLength: 20, sourceStart: 0, sourceLength: 20 });
  const sampler = constSampler({ A: 0, B: 10 });
  const track = makeTrack({ clips: [a, b] });
  // Overlap is [10, 20): at 12.5 A is 25% faded out, B 25% faded in relative
  // to the crossfade proportions -> normalized mix weights 0.75/0.25 of the
  // envelope sum: value = (0*0.75... envelopes: A fadeOut=10 -> (20-12.5)/10
  // = 0.75; B fadeIn=10 -> (12.5-10)/10 = 0.25. Normalized: 7.5*... value:
  const v = evaluateNla([track], 12.5, sampler, 0);
  assert.ok(Math.abs(v - (0 * 0.75 + 10 * 0.25) / 1.0) < 1e-9, `crossfade ${v}`);
  const mid = evaluateNla([track], 15, sampler, 0);
  assert.ok(Math.abs(mid - 5) < 1e-9, `midpoint ${mid}`);
  // Before overlap: pure A. After A's end: pure B.
  assert.equal(evaluateNla([track], 5, sampler, 99), 0);
  assert.equal(evaluateNla([track], 25, sampler, 99), 10);
});

test('track stacking: upper override track blends by its influence', () => {
  const lower = makeTrack({ name: 'base', clips: [makeClip({ name: 'A', start: 0, stripLength: 10, sourceStart: 0, sourceLength: 10 })] });
  const upper = makeTrack({ name: 'over', weight: 0.5, clips: [makeClip({ name: 'B', start: 0, stripLength: 10, sourceStart: 0, sourceLength: 10 })] });
  const sampler = constSampler({ A: 2, B: 10 });
  // Lower gives 2; upper influence 0.5 -> 2*0.5 + 10*0.5 = 6.
  assert.equal(evaluateNla([lower, upper], 5, sampler, 0), 6);
  upper.muted = true;
  assert.equal(evaluateNla([lower, upper], 5, sampler, 0), 2, 'muted track skipped');
});

test('additive clips offset relative to their reference', () => {
  const base = makeTrack({ clips: [makeClip({ name: 'A', start: 0, stripLength: 10, sourceStart: 0, sourceLength: 10 })] });
  const add = makeTrack({ clips: [makeClip({ name: 'C', start: 0, stripLength: 10, sourceStart: 0, sourceLength: 10, mode: 'additive', reference: 1 })] });
  const sampler = constSampler({ A: 4, C: 3 });
  // Base 4, additive contributes (3 - 1) = +2 -> 6.
  assert.equal(evaluateNla([base, add], 5, sampler, 0), 6);
  // Default reference is the rest value.
  const addDefault = makeTrack({ clips: [makeClip({ name: 'C', start: 0, stripLength: 10, sourceStart: 0, sourceLength: 10, mode: 'additive' })] });
  assert.equal(evaluateNla([base, addDefault], 5, sampler, 10), 4 + (3 - 10), 'reference defaults to rest');
});

test('explicit fades shape influence ramps; clip weight scales contribution', () => {
  const clip = makeClip({ name: 'A', start: 0, stripLength: 10, sourceStart: 0, sourceLength: 10, fadeIn: 4, weight: 0.8 });
  const track = makeTrack({ clips: [clip] });
  const sampler = () => 10;
  // At frame 2 envelope = (2/4) * 0.8 = 0.4; single-clip track influence
  // 0.4 over rest 0 -> normalized value 10 * ... trackValue = 10 (normalized),
  // influence = min(1, 0.4) * 1 = 0.4 -> acc = 0*0.6 + 10*0.4 = 4.
  assert.ok(Math.abs(evaluateNla([track], 2, sampler, 0) - 4) < 1e-9);
  assert.ok(Math.abs(evaluateNla([track], 8, sampler, 0) - 8) < 1e-9, 'full envelope, weight 0.8 influence');
});
