import test from 'node:test';
import assert from 'node:assert/strict';
import { framesToTimecode, timecodeToFrames, addFrames, syncDeltaFrames, durationFrames } from '../src/timecode.js';

test('non-drop rates are plain base conversions', () => {
  assert.equal(framesToTimecode(0, { rate: '25' }), '00:00:00:00');
  assert.equal(framesToTimecode(25 * 61 + 7, { rate: '25' }), '00:01:01:07');
  assert.equal(timecodeToFrames('00:01:01:07', { rate: '25' }), 25 * 61 + 7);
  assert.equal(timecodeToFrames('01:00:00:00', { rate: '24' }), 24 * 3600);
  assert.equal(framesToTimecode(24 * 3600, { rate: '24' }), '01:00:00:00');
});

test('drop-frame anchors: skipped numbers and the 10-minute exception', () => {
  const rate = { rate: '29.97' };
  assert.equal(framesToTimecode(0, rate), '00:00:00;00');
  // The first minute boundary skips ;00 and ;01 numbers.
  assert.equal(timecodeToFrames('00:01:00;02', rate), 1800);
  assert.equal(framesToTimecode(1800, rate), '00:01:00;02');
  assert.equal(framesToTimecode(1799, rate), '00:00:59;29');
  // Minute 10 is NOT dropped: numbers run straight through.
  assert.equal(timecodeToFrames('00:10:00;00', rate), 17982);
  assert.equal(framesToTimecode(17982, rate), '00:10:00;00');
  // One drop-frame hour = 107892 real frames.
  assert.equal(timecodeToFrames('01:00:00;00', rate), 107892);
  assert.equal(framesToTimecode(107892, rate), '01:00:00;00');
  // Nonexistent timecodes are rejected, not silently mapped.
  assert.throws(() => timecodeToFrames('00:01:00;00', rate), /does not exist/);
  assert.throws(() => timecodeToFrames('00:01:00;01', rate), /does not exist/);
  assert.equal(timecodeToFrames('00:10:00;01', rate), 17983, 'minute 10 keeps its low numbers');
});

test('round-trips hold across rates and long durations', () => {
  for (const rate of ['23.976', '24', '25', '29.97', '30', '50', '59.94', '60']) {
    for (const f of [0, 1, 59, 60, 1799, 1800, 1801, 107892, 250000, 1234567]) {
      const tc = framesToTimecode(f, { rate });
      assert.equal(timecodeToFrames(tc, { rate }), f, `${rate} frame ${f} via ${tc}`);
    }
  }
  // 59.94 drops 4 numbers per minute.
  assert.equal(timecodeToFrames('00:01:00;04', { rate: '59.94' }), 3600);
  assert.equal(framesToTimecode(3600, { rate: '59.94' }), '00:01:00;04');
});

test('arithmetic and durations work across minute/hour boundaries', () => {
  assert.equal(addFrames('00:00:59:20', 10, { rate: '25' }), '00:01:00:05');
  assert.equal(addFrames('00:01:00:05', -10, { rate: '25' }), '00:00:59:20');
  assert.equal(addFrames('00:00:59;29', 1, { rate: '29.97' }), '00:01:00;02', 'stepping over the drop');
  assert.equal(durationFrames('00:00:10:00', '00:00:12:12', { rate: '25' }), 62);
  assert.throws(() => addFrames('00:00:00:05', -10, { rate: '25' }), /before 00:00:00:00/);
});

test('sync deltas wrap at half a day like genlock phase', () => {
  assert.equal(syncDeltaFrames('00:00:01:00', '00:00:00:00', { rate: '25' }), 25);
  assert.equal(syncDeltaFrames('00:00:00:00', '00:00:01:00', { rate: '25' }), -25);
  // 23:59:59:24 is one frame BEFORE midnight, not ~24h after.
  assert.equal(syncDeltaFrames('23:59:59:24', '00:00:00:00', { rate: '25' }), -1);
  assert.equal(syncDeltaFrames('00:00:00:01', '23:59:59:24', { rate: '25' }), 2);
});

test('validation errors are explicit', () => {
  assert.throws(() => framesToTimecode(-1), /non-negative integer/);
  assert.throws(() => framesToTimecode(1.5), /non-negative integer/);
  assert.throws(() => timecodeToFrames('1:2:3', { rate: '25' }), /cannot parse/);
  assert.throws(() => timecodeToFrames('00:00:61:00', { rate: '25' }), /out of range/);
  assert.throws(() => timecodeToFrames('00:00:00:25', { rate: '25' }), /out of range/);
  assert.throws(() => framesToTimecode(0, { rate: '13' }), /unsupported rate/);
});
