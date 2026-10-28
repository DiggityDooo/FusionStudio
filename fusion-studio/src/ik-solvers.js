'use strict';
// Additional IK solvers (pure math, no scene graph): FABRIK for multi-joint
// chains, and spline IK -- joints placed by arc length along a Catmull-Rom
// curve with parallel-transport frames (twist-stable). The two-bone
// analytic solver lives in src/ik.js; this module covers the spline /
// multi-chain entries of the solver list. HIK and spring dynamics are not
// claimed here.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * FABRIK solve. jointPositions: [[x,y,z],...] rest/current positions
 * (segment lengths are taken from them and preserved). Root stays pinned
 * unless pinnedRoot is false. Returns new positions (input not mutated).
 */
export function solveFabrik(jointPositions, target, options = {}) {
  const maxIterations = options.maxIterations ?? 50;
  const tolerance = options.tolerance ?? 1e-4;
  const n = jointPositions.length;
  if (n < 2) throw new RangeError('FABRIK needs at least 2 joints');
  const lengths = [];
  let total = 0;
  for (let i = 0; i + 1 < n; i++) {
    const l = len(sub(jointPositions[i + 1], jointPositions[i]));
    lengths.push(l);
    total += l;
  }
  const pos = jointPositions.map((p) => [p[0], p[1], p[2]]);
  const root = [...pos[0]];
  const rootToTarget = len(sub(target, root));
  if (rootToTarget > total) {
    // Unreachable: stretch the chain straight at the target.
    const dir = norm(sub(target, root));
    for (let i = 1; i < n; i++) {
      pos[i] = add(pos[i - 1], scale(dir, lengths[i - 1]));
    }
    return pos;
  }
  for (let iter = 0; iter < maxIterations; iter++) {
    // Backward: end to target, walk to root.
    pos[n - 1] = [target[0], target[1], target[2]];
    for (let i = n - 2; i >= 0; i--) {
      const dir = norm(sub(pos[i], pos[i + 1]));
      pos[i] = add(pos[i + 1], scale(dir, lengths[i]));
    }
    // Forward: root pinned, walk to end.
    pos[0] = [...root];
    for (let i = 1; i < n; i++) {
      const dir = norm(sub(pos[i], pos[i - 1]));
      pos[i] = add(pos[i - 1], scale(dir, lengths[i - 1]));
    }
    if (len(sub(pos[n - 1], target)) < tolerance) break;
  }
  return pos;
}

/** Catmull-Rom spline point (uniform, passes through all control points). */
export function catmullRomPoint(points, t) {
  const n = points.length;
  if (n < 2) throw new RangeError('need at least 2 control points');
  const ft = Math.max(0, Math.min(n - 1, t * (n - 1)));
  const i = Math.min(n - 2, Math.floor(ft));
  const u = ft - i;
  const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(n - 1, i + 2)];
  const out = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    out[a] = 0.5 * (
      2 * p1[a]
      + (-p0[a] + p2[a]) * u
      + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * u * u
      + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * u * u * u
    );
  }
  return out;
}

/** Numerical arc length of the curve segment [0, t]. */
function arcLength(points, t, samplesPerSpan = 32) {
  const spans = points.length - 1;
  const steps = Math.max(1, Math.round(t * spans * samplesPerSpan));
  let total = 0;
  let prev = catmullRomPoint(points, 0);
  for (let s = 1; s <= steps; s++) {
    const p = catmullRomPoint(points, (s / steps) * t);
    total += len(sub(p, prev));
    prev = p;
  }
  return total;
}

/** Total curve length. */
export function catmullRomLength(points) {
  return arcLength(points, 1);
}

// Find t such that arcLength(0..t) == target (binary search on the
// monotone arc-length function).
function tAtArcLength(points, target, totalLength) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (arcLength(points, mid) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function anyPerpendicular(tangent) {
  const axis = Math.abs(tangent[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  return norm(cross(tangent, axis));
}

// Rotate v by the rotation taking unit a to unit b (Rodrigues).
function rotateAlign(v, a, b) {
  const axis = cross(a, b);
  const s = len(axis);
  const c = Math.max(-1, Math.min(1, dot(a, b)));
  if (s < 1e-9) {
    if (c > 0) return [v[0], v[1], v[2]];
    // 180-degree flip about any axis perpendicular to a.
    const k = anyPerpendicular(a);
    return sub(scale(k, 2 * dot(k, v)), v);
  }
  const k = norm(axis);
  return add(
    add(scale(v, c), scale(cross(k, v), s)),
    scale(k, dot(k, v) * (1 - c)),
  );
}

/**
 * Spline IK: place joints along the curve at the given segment lengths
 * (arc-length parameterized), with parallel-transport frames.
 * Returns {positions, tangents, normals, binormals} with
 * segmentLengths.length + 1 entries.
 */
export function splineIk(controlPoints, segmentLengths, options = {}) {
  const totalCurve = catmullRomLength(controlPoints);
  const totalChain = segmentLengths.reduce((s, l) => s + l, 0);
  if (totalChain > totalCurve + 1e-6) {
    throw new RangeError(`chain (${totalChain}) longer than curve (${totalCurve})`);
  }
  const positions = [];
  const tangents = [];
  let travelled = 0;
  const count = segmentLengths.length + 1;
  for (let j = 0; j < count; j++) {
    const t = j === 0 ? 0 : tAtArcLength(controlPoints, travelled, totalCurve);
    const p = catmullRomPoint(controlPoints, t);
    positions.push(p);
    const ahead = catmullRomPoint(controlPoints, Math.min(1, t + 0.001));
    const behind = catmullRomPoint(controlPoints, Math.max(0, t - 0.001));
    tangents.push(norm(sub(ahead, behind)));
    if (j < segmentLengths.length) travelled += segmentLengths[j];
  }
  // Parallel transport: carry the normal along, rotating by the tangent
  // change only -- no twist is introduced by the frame field itself.
  let normal = options.initialNormal
    ? norm(sub(options.initialNormal, scale(tangents[0], dot(options.initialNormal, tangents[0]))))
    : anyPerpendicular(tangents[0]);
  const normals = [];
  const binormals = [];
  for (let j = 0; j < count; j++) {
    if (j > 0) {
      normal = rotateAlign(normal, tangents[j - 1], tangents[j]);
      // Re-orthogonalize against the current tangent (drift control).
      normal = norm(sub(normal, scale(tangents[j], dot(normal, tangents[j]))));
    }
    normals.push(normal);
    binormals.push(norm(cross(tangents[j], normal)));
  }
  return { positions, tangents, normals, binormals };
}
