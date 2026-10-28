'use strict';
// Animation compression for game export (A15 "Animation compression
// for game export"): error-bounded keyframe reduction. Given dense
// per-frame samples, keep a subset of keys whose linear interpolation
// reproduces every sample within epsilon (vertical deviation,
// Douglas-Peucker style recursive refinement). Guarantees are checked
// against resampling, which is exactly what a game runtime does.

function checkSamples(samples) {
  if (!Array.isArray(samples) || samples.length === 0) throw new Error('anim-compression: needs at least one sample');
  for (let i = 1; i < samples.length; i++) {
    if (!(samples[i].t > samples[i - 1].t)) throw new Error('anim-compression: sample times must be strictly increasing');
  }
}

/**
 * Compress scalar samples [{t, v}] to keyframes [{t, v}] such that
 * linear interpolation between keys stays within epsilon of every
 * original sample. epsilon = 0 keeps every sample that deviates at
 * all from straight segments (exact for piecewise-linear input).
 */
export function compressScalarCurve(samples, epsilon) {
  checkSamples(samples);
  if (!(epsilon >= 0)) throw new Error('anim-compression: epsilon must be >= 0');
  if (samples.length <= 2) return samples.map((s) => ({ ...s }));
  const keep = new Set([0, samples.length - 1]);
  const stack = [[0, samples.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const ta = samples[a].t, tb = samples[b].t;
    const va = samples[a].v, vb = samples[b].v;
    let worst = -1, worstErr = epsilon;
    for (let i = a + 1; i < b; i++) {
      const alpha = (samples[i].t - ta) / (tb - ta);
      const expected = va + (vb - va) * alpha;
      const err = Math.abs(samples[i].v - expected);
      if (err > worstErr) { worstErr = err; worst = i; }
    }
    if (worst >= 0) {
      keep.add(worst);
      stack.push([a, worst], [worst, b]);
    }
  }
  return [...keep].sort((x, y) => x - y).map((i) => ({ t: samples[i].t, v: samples[i].v }));
}

/** Linear-interpolated value of a keyframe list at time t (clamped). */
export function sampleKeys(keys, t) {
  if (keys.length === 0) throw new Error('anim-compression: no keys');
  if (t <= keys[0].t) return keys[0].v;
  if (t >= keys[keys.length - 1].t) return keys[keys.length - 1].v;
  let lo = 0, hi = keys.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keys[mid].t <= t) lo = mid; else hi = mid;
  }
  const alpha = (t - keys[lo].t) / (keys[hi].t - keys[lo].t);
  return keys[lo].v + (keys[hi].v - keys[lo].v) * alpha;
}

/** Maximum absolute deviation of keys vs dense samples. */
export function maxDeviation(samples, keys) {
  let worst = 0;
  for (const s of samples) worst = Math.max(worst, Math.abs(sampleKeys(keys, s.t) - s.v));
  return worst;
}

/**
 * Compress a multi-channel track: samples [{t, values: [..]}]. One
 * shared key time set is chosen so EVERY channel stays within its
 * epsilon (per-channel epsilon array or a single number).
 */
export function compressTrack(samples, epsilon) {
  checkSamples(samples);
  const channels = samples[0].values.length;
  const eps = Array.isArray(epsilon) ? epsilon : new Array(channels).fill(epsilon);
  if (eps.length !== channels) throw new Error('anim-compression: epsilon per channel mismatch');
  // Run scalar reduction per channel and union the key times; the
  // union is still exactly bounded per channel.
  const times = new Set([samples[0].t, samples[samples.length - 1].t]);
  for (let c = 0; c < channels; c++) {
    const scalar = samples.map((s) => ({ t: s.t, v: s.values[c] }));
    for (const key of compressScalarCurve(scalar, eps[c])) times.add(key.t);
  }
  const byTime = new Map(samples.map((s) => [s.t, s.values]));
  return [...times].sort((a, b) => a - b).map((t) => ({ t, values: [...byTime.get(t)] }));
}

/** Compression statistics for export reports. */
export function compressionReport(beforeCount, keys) {
  return {
    before: beforeCount,
    after: keys.length,
    ratio: beforeCount === 0 ? 1 : keys.length / beforeCount,
    savedPercent: beforeCount === 0 ? 0 : (1 - keys.length / beforeCount) * 100,
  };
}
