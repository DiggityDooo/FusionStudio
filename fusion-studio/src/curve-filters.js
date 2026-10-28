'use strict';
// F-curve filters (A15 "F-curves, tangents, handle editing and
// curve filters"): single-channel key curves [{ frame, value }]
// with piecewise-linear evaluation. Provides smoothing filters
// (moving average, Gaussian, median), uniform resampling, and
// key simplification with a certified value-error bound (the
// deviation between two piecewise-linear curves sharing segment
// endpoints peaks at the original key times, so bounding the
// error there bounds it everywhere).

function prepare(keys) {
  if (!Array.isArray(keys)) throw new Error('curve: keys must be an array');
  const sorted = [...keys].sort((a, b) => a.frame - b.frame);
  for (let i = 0; i < sorted.length; i++) {
    if (!Number.isFinite(sorted[i].frame) || !Number.isFinite(sorted[i].value)) {
      throw new Error('curve: keys need finite frame/value');
    }
    if (i > 0 && sorted[i].frame === sorted[i - 1].frame) throw new Error('curve: duplicate key frame');
  }
  return sorted;
}

/** Piecewise-linear curve value at a frame (clamped outside). */
export function evaluateCurve(keys, frame) {
  const ks = prepare(keys);
  if (!ks.length) throw new Error('curve: no keys');
  if (frame <= ks[0].frame) return ks[0].value;
  if (frame >= ks[ks.length - 1].frame) return ks[ks.length - 1].value;
  let lo = 0, hi = ks.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ks[mid].frame <= frame) lo = mid; else hi = mid;
  }
  const a = ks[lo], b = ks[hi];
  const t = (frame - a.frame) / (b.frame - a.frame);
  return a.value + (b.value - a.value) * t;
}

/** Max |A - B| over the key range, densely sampled. */
export function maxCurveError(keysA, keysB, { samplesPerSegment = 16 } = {}) {
  const A = prepare(keysA), B = prepare(keysB);
  const start = Math.max(A[0].frame, B[0].frame);
  const end = Math.min(A[A.length - 1].frame, B[B.length - 1].frame);
  let max = 0;
  const frames = new Set([start, end]);
  for (const k of [...A, ...B]) if (k.frame > start && k.frame < end) frames.add(k.frame);
  const sorted = [...frames].sort((a, b) => a - b);
  for (let s = 0; s + 1 < sorted.length; s++) {
    for (let i = 0; i <= samplesPerSegment; i++) {
      const f = sorted[s] + (sorted[s + 1] - sorted[s]) * (i / samplesPerSegment);
      const e = Math.abs(evaluateCurve(A, f) - evaluateCurve(B, f));
      if (e > max) max = e;
    }
  }
  return max;
}

/**
 * Remove keys while guaranteeing the piecewise-linear value
 * error stays <= epsilon at every original key time (and hence
 * everywhere). Endpoints always survive.
 */
export function simplifyKeysBounded(keys, epsilon) {
  if (!(epsilon >= 0)) throw new Error('curve: epsilon must be >= 0');
  const ks = prepare(keys);
  if (ks.length < 3) return ks.map((k) => ({ ...k }));
  const keep = new Uint8Array(ks.length);
  keep[0] = keep[ks.length - 1] = 1;
  const stack = [[0, ks.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    const a = ks[lo], b = ks[hi];
    let worst = -1, worstErr = epsilon;
    for (let i = lo + 1; i < hi; i++) {
      const t = (ks[i].frame - a.frame) / (b.frame - a.frame);
      const predicted = a.value + (b.value - a.value) * t;
      const err = Math.abs(ks[i].value - predicted);
      if (err > worstErr) { worstErr = err; worst = i; }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([lo, worst], [worst, hi]);
    }
  }
  return ks.filter((_, i) => keep[i]).map((k) => ({ ...k }));
}

function indexWindow(ks, i, radius) {
  return [Math.max(0, i - radius), Math.min(ks.length - 1, i + radius)];
}

/** Centered moving average over a key-index window (shrinks at the ends). */
export function movingAverageKeys(keys, radius = 1) {
  if (!Number.isInteger(radius) || radius < 0) throw new Error('curve: radius must be a non-negative integer');
  const ks = prepare(keys);
  return ks.map((k, i) => {
    const [lo, hi] = indexWindow(ks, i, radius);
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += ks[j].value;
    return { frame: k.frame, value: sum / (hi - lo + 1) };
  });
}

/** Gaussian smoothing with weights over frame distance (3-sigma truncation). */
export function gaussianKeys(keys, sigma) {
  if (!(sigma > 0)) throw new Error('curve: sigma must be positive');
  const ks = prepare(keys);
  const reach = 3 * sigma;
  return ks.map((k) => {
    let sum = 0, wsum = 0;
    for (const other of ks) {
      const d = other.frame - k.frame;
      if (Math.abs(d) > reach) continue;
      const w = Math.exp(-(d * d) / (2 * sigma * sigma));
      sum += other.value * w;
      wsum += w;
    }
    return { frame: k.frame, value: sum / wsum };
  });
}

/** Median filter over a key-index window: removes single-key spikes exactly. */
export function medianKeys(keys, radius = 1) {
  if (!Number.isInteger(radius) || radius < 0) throw new Error('curve: radius must be a non-negative integer');
  const ks = prepare(keys);
  return ks.map((k, i) => {
    const [lo, hi] = indexWindow(ks, i, radius);
    const window = ks.slice(lo, hi + 1).map((o) => o.value).sort((a, b) => a - b);
    const mid = window.length >> 1;
    const value = window.length % 2 ? window[mid] : (window[mid - 1] + window[mid]) / 2;
    return { frame: k.frame, value };
  });
}

/** Resample at a uniform frame step (last key always included exactly). */
export function resampleKeys(keys, step) {
  if (!(step > 0)) throw new Error('curve: step must be positive');
  const ks = prepare(keys);
  if (ks.length < 2) return ks.map((k) => ({ ...k }));
  const start = ks[0].frame, end = ks[ks.length - 1].frame;
  const out = [];
  for (let f = start; f < end; f += step) out.push({ frame: f, value: evaluateCurve(ks, f) });
  out.push({ frame: end, value: ks[ks.length - 1].value });
  return out;
}
