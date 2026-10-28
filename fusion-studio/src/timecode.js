'use strict';
// Timecode & sync (A22 "Timecode and genlock synchronization"):
// frame <-> timecode conversion including NTSC drop-frame counting
// (29.97 = 30000/1001 skips frame numbers 0-1 at each minute except
// every tenth; 59.94 skips 0-3), timecode arithmetic, and signed sync
// deltas between devices. All math is on frame counts, so genlock
// offsets are exact.

export const RATES = {
  '23.976': { nominal: 24, drop: 0 },
  '24': { nominal: 24, drop: 0 },
  '25': { nominal: 25, drop: 0 },
  '29.97': { nominal: 30, drop: 2 },
  '30': { nominal: 30, drop: 0 },
  '50': { nominal: 50, drop: 0 },
  '59.94': { nominal: 60, drop: 4 },
  '60': { nominal: 60, drop: 0 },
};

function rateSpec(rate) {
  const spec = RATES[String(rate)];
  if (!spec) throw new Error(`timecode: unsupported rate '${rate}' (have ${Object.keys(RATES).join(', ')})`);
  return spec;
}

const pad = (n) => String(n).padStart(2, '0');

/** Frames (integer >= 0) to 'HH:MM:SS:FF' (drop-frame uses ';' before FF by convention if separator given). */
export function framesToTimecode(frames, { rate = '25', separator = null } = {}) {
  const { nominal, drop } = rateSpec(rate);
  if (!Number.isInteger(frames) || frames < 0) throw new Error('timecode: frames must be a non-negative integer');
  let nominalFrames = frames;
  if (drop > 0) {
    // Expand the count to nominal numbers (re-insert skipped numbers).
    const framesPer10Min = nominal * 600 - drop * 9;
    const framesPerMinDropped = nominal * 60 - drop;
    const d = Math.floor(frames / framesPer10Min);
    const m = frames % framesPer10Min;
    let extra;
    if (m < nominal * 60) extra = drop * 9 * d;
    else extra = drop * (9 * d + Math.floor((m - nominal * 60) / framesPerMinDropped) + 1);
    nominalFrames = frames + extra;
  }
  const totalSeconds = Math.floor(nominalFrames / nominal);
  const ff = nominalFrames % nominal;
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  const sep = separator || (drop > 0 ? ';' : ':');
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}${sep}${pad(ff)}`;
}

/** Parse 'HH:MM:SS:FF' or 'HH:MM:SS;FF' to a frame count. */
export function timecodeToFrames(tc, { rate = '25' } = {}) {
  const { nominal, drop } = rateSpec(rate);
  const match = String(tc).match(/^(\d+):(\d{2}):(\d{2})[:;](\d{2})$/);
  if (!match) throw new Error(`timecode: cannot parse '${tc}' (want HH:MM:SS:FF)`);
  const [, hh, mm, ss, ff] = match.map(Number);
  if (mm >= 60 || ss >= 60 || ff >= nominal) throw new Error(`timecode: component out of range in '${tc}'`);
  let frames = ((hh * 3600 + mm * 60 + ss) * nominal) + ff;
  if (drop > 0) {
    const totalMinutes = hh * 60 + mm;
    if (ss === 0 && ff < drop && totalMinutes % 10 !== 0) {
      throw new Error(`timecode: '${tc}' does not exist in drop-frame counting (frame numbers ${pad(0)}-${pad(drop - 1)} are skipped at minute boundaries)`);
    }
    frames -= drop * (totalMinutes - Math.floor(totalMinutes / 10));
  }
  return frames;
}

/** Add (or subtract, with negative delta) frames to a timecode string. */
export function addFrames(tc, delta, options = {}) {
  const frames = timecodeToFrames(tc, options) + delta;
  if (frames < 0) throw new Error('timecode: result before 00:00:00:00');
  return framesToTimecode(frames, options);
}

/** Signed frame delta A - B wrapped to ± half a day (genlock phase). */
export function syncDeltaFrames(tcA, tcB, { rate = '25' } = {}) {
  const { nominal, drop } = rateSpec(rate);
  const dayFrames = 24 * 3600 * nominal - (drop > 0 ? drop * (24 * 60 - 24 * 6) : 0);
  let delta = timecodeToFrames(tcA, { rate }) - timecodeToFrames(tcB, { rate });
  if (delta > dayFrames / 2) delta -= dayFrames;
  if (delta < -dayFrames / 2) delta += dayFrames;
  return delta;
}

/** Duration in frames between two timecodes (B - A, no wrap). */
export function durationFrames(startTc, endTc, options = {}) {
  return timecodeToFrames(endTc, options) - timecodeToFrames(startTc, options);
}
