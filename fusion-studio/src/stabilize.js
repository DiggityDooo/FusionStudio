'use strict';
// Stabilization (A21 "Stabilization and distortion correction"):
// track points across frames, compose per-frame affine motions into
// a camera trajectory, smooth the trajectory, and derive correction
// transforms that warp each frame onto the smoothed path. Builds on
// src/patch-tracker.js.

import { trackPoints, estimateAffine, affineResidual, sampleBilinear } from './patch-tracker.js';

export const IDENTITY_AFFINE = [[1, 0, 0], [0, 1, 0]];

export function composeAffine(outer, inner) {
  return [
    [
      outer[0][0] * inner[0][0] + outer[0][1] * inner[1][0],
      outer[0][0] * inner[0][1] + outer[0][1] * inner[1][1],
      outer[0][0] * inner[0][2] + outer[0][1] * inner[1][2] + outer[0][2],
    ],
    [
      outer[1][0] * inner[0][0] + outer[1][1] * inner[1][0],
      outer[1][0] * inner[0][1] + outer[1][1] * inner[1][1],
      outer[1][0] * inner[0][2] + outer[1][1] * inner[1][2] + outer[1][2],
    ],
  ];
}

export function invertAffine([[a, b, tx], [c, d, ty]]) {
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) throw new Error('stabilize: singular affine');
  const ia = d / det, ib = -b / det, ic = -c / det, id = a / det;
  return [[ia, ib, -(ia * tx + ib * ty)], [ic, id, -(ic * tx + id * ty)]];
}

/**
 * Camera trajectory: trajectory[i] maps frame-0 coordinates into
 * frame-i coordinates, composed from frame-to-frame tracking.
 * Frames with too few tracked points repeat the previous motion.
 */
export function computeTrajectory(frames, points, options = {}) {
  if (frames.length < 1) throw new Error('stabilize: no frames');
  const trajectory = [IDENTITY_AFFINE.map((r) => [...r])];
  let current = trajectory[0];
  // Features must be tracked from where they ARE in the previous
  // frame, not from their frame-0 positions — carry positions forward.
  let prevPositions = points.map((p) => [...p]);
  for (let i = 1; i < frames.length; i++) {
    const tracked = trackPoints(frames[i - 1], frames[i], prevPositions, options);
    const src = [], dst = [];
    tracked.forEach((p, k) => { if (p) { src.push(prevPositions[k]); dst.push(p); } });
    let step = IDENTITY_AFFINE.map((r) => [...r]);
    if (src.length >= 3) {
      step = estimateAffine(src, dst);
      if (affineResidual(step, src, dst) > 2) step = IDENTITY_AFFINE.map((r) => [...r]);
    }
    current = composeAffine(step, current);
    trajectory.push(current);
    prevPositions = tracked.map((p, k) => p ?? prevPositions[k]);
  }
  return trajectory;
}

/** Moving-average smoothing of an affine trajectory (per element). */
export function smoothTrajectory(trajectory, radius = 2) {
  const n = trajectory.length;
  return trajectory.map((_, i) => {
    const out = [[0, 0, 0], [0, 0, 0]];
    let count = 0;
    for (let k = Math.max(0, i - radius); k <= Math.min(n - 1, i + radius); k++) {
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) out[r][c] += trajectory[k][r][c];
      count++;
    }
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) out[r][c] /= count;
    return out;
  });
}

/**
 * Correction transforms: applying correction[i] as a warp to frame i
 * puts its content on the smoothed trajectory.
 * correction[i] = trajectory[i] ∘ smoothed[i]^-1 (maps output pixel
 * coords into frame-i sample coords; see warpImage).
 */
export function correctionTransforms(trajectory, smoothed) {
  return trajectory.map((t, i) => composeAffine(t, invertAffine(smoothed[i])));
}

/** Warp an image: out(p) = img(affine(p)), bilinear, 0 outside. */
export function warpImage(img, affine) {
  const out = new Float32Array(img.width * img.height);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const sx = affine[0][0] * x + affine[0][1] * y + affine[0][2];
      const sy = affine[1][0] * x + affine[1][1] * y + affine[1][2];
      const v = sampleBilinear(img, sx, sy);
      out[y * img.width + x] = v === null ? 0 : v;
    }
  }
  return { data: out, width: img.width, height: img.height };
}

/** Mean squared difference between two same-size images (interior). */
export function imageDifference(a, b, margin = 8) {
  let sum = 0, count = 0;
  for (let y = margin; y < a.height - margin; y++) {
    for (let x = margin; x < a.width - margin; x++) {
      const d = a.data[y * a.width + x] - b.data[y * b.width + x];
      sum += d * d; count++;
    }
  }
  return Math.sqrt(sum / count);
}
