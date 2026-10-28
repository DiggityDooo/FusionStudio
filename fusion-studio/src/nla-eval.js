'use strict';
// NLA (non-linear animation) evaluation kernel: maps timeline frames into
// clip source frames, computes crossfade envelopes for overlapping clips,
// and mixes a track stack into a single channel value.
//
// Semantics (documented, deterministic):
// - A clip is active on [start, start + stripLength * repeat). Its source
//   frame is sourceStart + ((frame - start) * timeScale mod sourceLength)
//   where timeScale = sourceLength / stripLength: strips play their source
//   range once per repeat, stretched to the strip length.
// - Envelope: fadeIn/fadeOut explicit if set, else the overlap with the
//   neighbouring clip on the same track (0 = hard cut).
// - Override clips on a track mix by normalized weights; the track's total
//   influence is min(1, sum of weights) * track.weight, applied over the
//   accumulated value from lower tracks.
// - Additive clips contribute (sample - reference) * envelope * weight;
//   reference defaults to the evaluation's rest value.
// sampleClip(clip, sourceFrame) -> value is injected by the caller, which
// keeps this kernel independent of any keyframe representation.

export function makeClip({
  name = 'Clip', start = 1, stripLength = 24, sourceStart = 1, sourceLength = 24,
  repeat = 1, weight = 1, mode = 'override', reference = null, fadeIn = null, fadeOut = null, muted = false,
} = {}) {
  if (!(stripLength > 0) || !(sourceLength > 0) || !(repeat >= 1)) throw new RangeError('clip lengths must be positive');
  if (weight < 0 || weight > 1) throw new RangeError('clip weight 0-1');
  if (!['override', 'additive'].includes(mode)) throw new RangeError('clip mode override|additive');
  return { name, start, stripLength, sourceStart, sourceLength, repeat, weight, mode, reference, fadeIn, fadeOut, muted };
}

export function makeTrack({ name = 'Track', weight = 1, muted = false, clips = [] } = {}) {
  return { name, weight, muted, clips };
}

const clipEnd = (clip) => clip.start + clip.stripLength * clip.repeat;

/** Is the clip active at this frame? [start, end) */
export function clipActive(clip, frame) {
  return !clip.muted && frame >= clip.start && frame < clipEnd(clip);
}

/** Source frame for a timeline frame inside the clip (wrap per repeat). */
export function clipSourceFrame(clip, frame) {
  const timeScale = clip.sourceLength / clip.stripLength;
  const local = (frame - clip.start) * timeScale;
  const wrapped = ((local % clip.sourceLength) + clip.sourceLength) % clip.sourceLength;
  return clip.sourceStart + wrapped;
}

function envelope(clip, frame, track) {
  let fadeIn = clip.fadeIn;
  let fadeOut = clip.fadeOut;
  if (fadeIn === null || fadeOut === null) {
    // Derive from overlaps with neighbours on the same track.
    let prevEnd = -Infinity, nextStart = Infinity;
    for (const other of track.clips) {
      if (other === clip || other.muted) continue;
      if (clipEnd(other) <= clipEnd(clip) && clipEnd(other) > clip.start) prevEnd = Math.max(prevEnd, clipEnd(other));
      if (other.start >= clip.start && other.start < clipEnd(clip)) nextStart = Math.min(nextStart, other.start);
    }
    if (fadeIn === null) fadeIn = prevEnd > clip.start ? prevEnd - clip.start : 0;
    if (fadeOut === null) fadeOut = nextStart < clipEnd(clip) ? clipEnd(clip) - nextStart : 0;
  }
  let w = 1;
  if (fadeIn > 0) w = Math.min(w, (frame - clip.start) / fadeIn);
  if (fadeOut > 0) w = Math.min(w, (clipEnd(clip) - frame) / fadeOut);
  return Math.max(0, Math.min(1, w)) * clip.weight;
}

/**
 * Evaluate the stack at a frame. tracks are ordered bottom-first.
 * sampleClip(clip, sourceFrame) returns the clip's channel value.
 * Returns the mixed value; restValue when nothing contributes.
 */
export function evaluateNla(tracks, frame, sampleClip, restValue = 0) {
  let acc = restValue;
  for (const track of tracks) {
    if (track.muted) continue;
    let sumW = 0, sumV = 0, additive = 0;
    for (const clip of track.clips) {
      if (!clipActive(clip, frame)) continue;
      const w = envelope(clip, frame, track);
      if (w <= 0) continue;
      const value = sampleClip(clip, clipSourceFrame(clip, frame));
      if (clip.mode === 'additive') {
        additive += (value - (clip.reference ?? restValue)) * w;
      } else {
        sumW += w;
        sumV += w * value;
      }
    }
    if (sumW > 0) {
      const trackValue = sumV / sumW;
      const influence = Math.min(1, sumW) * track.weight;
      acc = acc * (1 - influence) + trackValue * influence;
    }
    acc += additive * track.weight;
  }
  return acc;
}
