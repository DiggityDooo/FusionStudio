'use strict';
// Collision proxy generation (A19 "Collision proxies and collision
// shapes"): fit sphere / AABB / OBB / capsule proxies to point sets
// (mesh vertices). Every fitter guarantees containment: each input
// point lies inside the returned proxy.

import { jacobiEigen } from './camera-solve.js';

function toPoints(flat) {
  const pts = [];
  for (let i = 0; i + 2 < flat.length; i += 3) pts.push([flat[i], flat[i + 1], flat[i + 2]]);
  return pts;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const dist = (a, b) => Math.hypot(...sub(a, b));

/** Ritter bounding sphere: near-minimal, guaranteed containing. */
export function fitSphere(flat) {
  const pts = toPoints(flat);
  if (!pts.length) throw new Error('proxy: no points');
  // Initial sphere from the farthest pair (sampled extremes per axis).
  let p0 = pts[0], p1 = pts[0], best = -1;
  for (const axis of [0, 1, 2]) {
    let lo = pts[0], hi = pts[0];
    for (const p of pts) { if (p[axis] < lo[axis]) lo = p; if (p[axis] > hi[axis]) hi = p; }
    if (dist(lo, hi) > best) { best = dist(lo, hi); p0 = lo; p1 = hi; }
  }
  let center = p0.map((v, i) => (v + p1[i]) / 2);
  let radius = best / 2;
  // Grow to include every point (Ritter expansion).
  for (const p of pts) {
    const d = dist(p, center);
    if (d > radius) {
      const newRadius = (radius + d) / 2;
      const t = (newRadius - radius) / (d || 1);
      center = center.map((v, i) => v + (p[i] - center[i]) * t);
      radius = newRadius;
    }
  }
  // Ritter alone can sit ~35% above optimal on adversarial orders
  // (measured 2.34 vs sqrt(3) on a cube). Refine the 1-center
  // problem: step toward the farthest point with a harmonic step,
  // recomputing the exact containing radius each iteration. Near
  // the optimum the radius excess is second-order in center error,
  // so this converges tightly while never losing containment.
  const maxDist = () => {
    let f = null, fd = -1;
    for (const p of pts) { const d = dist(p, center); if (d > fd) { fd = d; f = p; } }
    return { point: f, distance: fd };
  };
  radius = maxDist().distance;
  for (let k = 1; k <= 600; k++) {
    const { point, distance } = maxDist();
    radius = distance;
    if (distance < 1e-15) break;
    const step = Math.min(radius / (k + 1), distance * 0.5);
    center = center.map((v, i) => v + ((point[i] - v) / distance) * step);
  }
  radius = maxDist().distance;
  return { type: 'sphere', center, radius };
}

export function fitAABB(flat) {
  const pts = toPoints(flat);
  if (!pts.length) throw new Error('proxy: no points');
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], p[i]); max[i] = Math.max(max[i], p[i]); }
  return {
    type: 'aabb', min, max,
    center: min.map((v, i) => (v + max[i]) / 2),
    halfExtents: min.map((v, i) => (max[i] - v) / 2),
  };
}

function pcaAxes(pts) {
  const n = pts.length;
  const c = [0, 0, 0];
  for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  const cen = c.map((v) => v / n);
  const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) {
    const d = sub(p, cen);
    for (let r = 0; r < 3; r++) for (let col = 0; col < 3; col++) cov[r][col] += d[r] * d[col] / n;
  }
  const { values, vectors } = jacobiEigen(cov);
  const order = [0, 1, 2].sort((a, b) => values[b] - values[a]);
  const axes = order.map((j) => [vectors[0][j], vectors[1][j], vectors[2][j]]);
  // Right-handed frame.
  const crossZ = [
    axes[0][1] * axes[1][2] - axes[0][2] * axes[1][1],
    axes[0][2] * axes[1][0] - axes[0][0] * axes[1][2],
    axes[0][0] * axes[1][1] - axes[0][1] * axes[1][0],
  ];
  if (dot(crossZ, axes[2]) < 0) axes[2] = axes[2].map((v) => -v);
  return { center: cen, axes, values: order.map((j) => values[j]) };
}

/** PCA-aligned oriented bounding box (contains all points). */
export function fitOBB(flat) {
  const pts = toPoints(flat);
  if (!pts.length) throw new Error('proxy: no points');
  const { center, axes } = pcaAxes(pts);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) {
    const d = sub(p, center);
    for (let i = 0; i < 3; i++) {
      const proj = dot(d, axes[i]);
      min[i] = Math.min(min[i], proj); max[i] = Math.max(max[i], proj);
    }
  }
  const halfExtents = min.map((v, i) => (max[i] - v) / 2);
  const boxCenter = center.map((v, i) => v + axes[0][i] * ((min[0] + max[0]) / 2) + axes[1][i] * ((min[1] + max[1]) / 2) + axes[2][i] * ((min[2] + max[2]) / 2));
  return { type: 'obb', center: boxCenter, axes, halfExtents };
}

/** Capsule along the principal axis (contains all points). */
export function fitCapsule(flat) {
  const pts = toPoints(flat);
  if (!pts.length) throw new Error('proxy: no points');
  const { center, axes } = pcaAxes(pts);
  const axis = axes[0];
  let minProj = Infinity, maxProj = -Infinity;
  for (const p of pts) {
    const proj = dot(sub(p, center), axis);
    minProj = Math.min(minProj, proj); maxProj = Math.max(maxProj, proj);
  }
  const a = center.map((v, i) => v + axis[i] * minProj);
  const b = center.map((v, i) => v + axis[i] * maxProj);
  let radius = 0;
  for (const p of pts) radius = Math.max(radius, distancePointToSegment(p, a, b));
  return { type: 'capsule', a, b, radius };
}

export function distancePointToSegment(p, a, b) {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  const t = len2 < 1e-18 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2));
  const closest = a.map((v, i) => v + ab[i] * t);
  return dist(p, closest);
}

/** Signed containment margin (< 0 inside) of a point vs a proxy. */
export function containmentMargin(proxy, p) {
  if (proxy.type === 'sphere') return dist(p, proxy.center) - proxy.radius;
  if (proxy.type === 'aabb') {
    let m = -Infinity;
    for (let i = 0; i < 3; i++) m = Math.max(m, Math.abs(p[i] - proxy.center[i]) - proxy.halfExtents[i]);
    return m;
  }
  if (proxy.type === 'obb') {
    const d = sub(p, proxy.center);
    let m = -Infinity;
    for (let i = 0; i < 3; i++) m = Math.max(m, Math.abs(dot(d, proxy.axes[i])) - proxy.halfExtents[i]);
    return m;
  }
  if (proxy.type === 'capsule') return distancePointToSegment(p, proxy.a, proxy.b) - proxy.radius;
  throw new Error(`proxy: unknown type ${proxy.type}`);
}

/** Worst (largest) containment margin over a point set; <= 0 means contained. */
export function worstContainment(proxy, flat) {
  const pts = toPoints(flat);
  let worst = -Infinity;
  for (const p of pts) worst = Math.max(worst, containmentMargin(proxy, p));
  return worst;
}

export function proxyVolume(proxy) {
  if (proxy.type === 'sphere') return (4 / 3) * Math.PI * proxy.radius ** 3;
  if (proxy.type === 'aabb' || proxy.type === 'obb') {
    return 8 * proxy.halfExtents[0] * proxy.halfExtents[1] * proxy.halfExtents[2];
  }
  if (proxy.type === 'capsule') {
    const len = dist(proxy.a, proxy.b);
    return Math.PI * proxy.radius * proxy.radius * len + (4 / 3) * Math.PI * proxy.radius ** 3;
  }
  throw new Error(`proxy: unknown type ${proxy.type}`);
}
