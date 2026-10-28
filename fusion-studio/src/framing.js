'use strict';
// Stage/blocking previz (A22 "Stage/blocking previz tools"):
// screen-space framing analysis for a posed subject — where the
// subject lands in frame, how much of the frame it covers, how
// close its center sits to a rule-of-thirds intersection, headroom
// above a head point, horizon roll, and clipping warnings. Image
// coordinates follow the repo camera convention (projectPoint in
// ./camera-solve.js; v grows downward).

import { projectPoint } from './camera-solve.js';

/** Project a 3D point to normalized image fractions (0..1 across). */
export function projectToImage(P, point, imageSize) {
  const [u, v, w] = projectPoint(P, point);
  return {
    x: u / imageSize.width,
    y: v / imageSize.height,
    behind: w >= 0, // repo convention: in-front points have w < 0
    pixels: [u, v],
  };
}

const THIRDS = [1 / 3, 2 / 3];

/**
 * Framing report for a subject (list of 3D points, e.g. a posed
 * character's joints or bounding corners).
 * options: { headPoint, maxHeadroom = 0.3, minCoverage = 0.05,
 *   maxCoverage = 0.95 }
 */
export function framingReport(P, imageSize, subjectPoints, options = {}) {
  if (!subjectPoints?.length) throw new Error('framing: subject points required');
  const projected = subjectPoints.map((p) => projectToImage(P, p, imageSize));
  if (projected.some((p) => p.behind)) throw new Error('framing: subject point behind the camera');
  const xs = projected.map((p) => p.x), ys = projected.map((p) => p.y);
  const bbox = {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys),
  };
  const center = { x: (bbox.minX + bbox.maxX) / 2, y: (bbox.minY + bbox.maxY) / 2 };
  const coverage = Math.max(0, bbox.maxX - bbox.minX) * Math.max(0, bbox.maxY - bbox.minY);
  let thirdsDistance = Infinity, thirdsPoint = null;
  for (const tx of THIRDS) for (const ty of THIRDS) {
    const d = Math.hypot(center.x - tx, center.y - ty);
    if (d < thirdsDistance) { thirdsDistance = d; thirdsPoint = { x: tx, y: ty }; }
  }
  const clipped = bbox.minX < 0 || bbox.maxX > 1 || bbox.minY < 0 || bbox.maxY > 1;
  const head = options.headPoint ? projectToImage(P, options.headPoint, imageSize) : null;
  const headroom = head ? head.y : null; // fraction from the top edge
  const warnings = [];
  if (clipped) warnings.push('subject clipped by frame edge');
  if (headroom !== null && headroom > (options.maxHeadroom ?? 0.3)) warnings.push('excess headroom');
  if (headroom !== null && headroom < 0.02) warnings.push('head too close to top of frame');
  if (coverage < (options.minCoverage ?? 0.05)) warnings.push('subject very small in frame');
  if (coverage > (options.maxCoverage ?? 0.95)) warnings.push('subject fills the frame');
  return { bbox, center, coverage, thirdsDistance, thirdsPoint, headroom, clipped, warnings };
}

/** Camera roll in degrees: tilt of the camera right-vector against the world horizon. */
export function horizonRollDeg(R) {
  const right = R[0];
  return Math.atan2(right[1], Math.hypot(right[0], right[2])) * (180 / Math.PI);
}

/**
 * Simple blocking suggestion: the dolly distance scale factor
 * that would make the subject cover `targetCoverage` of the frame
 * (area scales with 1/distance^2, so distance scales with
 * sqrt(current/target)). > 1 means dolly in.
 */
export function dollyFactorForCoverage(currentCoverage, targetCoverage) {
  if (!(currentCoverage > 0) || !(targetCoverage > 0)) throw new Error('framing: coverages must be positive');
  return Math.sqrt(targetCoverage / currentCoverage);
}
