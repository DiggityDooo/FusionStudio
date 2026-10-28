'use strict';
// Signed-distance-field modeling (A4 "Volumes, VDB and SDF
// modeling", "Field-based operations"): exact SDF primitives,
// CSG composition (hard and smooth), domain transforms, sphere
// tracing, gradient normals, dense grid sampling, and surface
// extraction through the marching-tetrahedra polygonizer in
// ./metaballs.js. Convention: negative inside, zero on surface.
// SDFs are functions ([x, y, z]) => distance.

import { polygonizeField } from './metaballs.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function sdfSphere(center, radius) {
  if (!(radius > 0)) throw new Error('sdf: sphere radius must be positive');
  return (p) => Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2]) - radius;
}

export function sdfBox(center, half) {
  return (p) => {
    const q = [Math.abs(p[0] - center[0]) - half[0], Math.abs(p[1] - center[1]) - half[1], Math.abs(p[2] - center[2]) - half[2]];
    const outside = Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0));
    const inside = Math.min(Math.max(q[0], Math.max(q[1], q[2])), 0);
    return outside + inside;
  };
}

export function sdfRoundedBox(center, half, radius) {
  if (!(radius >= 0)) throw new Error('sdf: rounded box radius must be >= 0');
  const inner = half.map((h) => h - radius);
  return (p) => {
    const q = [Math.abs(p[0] - center[0]) - inner[0], Math.abs(p[1] - center[1]) - inner[1], Math.abs(p[2] - center[2]) - inner[2]];
    const outside = Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0));
    const inside = Math.min(Math.max(q[0], Math.max(q[1], q[2])), 0);
    return outside + inside - radius;
  };
}

/** Torus around the Y axis through `center`, ring radius R, tube radius r. */
export function sdfTorus(center, R, r) {
  if (!(R > 0 && r > 0)) throw new Error('sdf: torus radii must be positive');
  return (p) => {
    const dx = p[0] - center[0], dy = p[1] - center[1], dz = p[2] - center[2];
    const qx = Math.hypot(dx, dz) - R;
    return Math.hypot(qx, dy) - r;
  };
}

export function sdfCapsule(a, b, radius) {
  if (!(radius > 0)) throw new Error('sdf: capsule radius must be positive');
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  return (p) => {
    const t = len2 <= 1e-15 ? 0 : clamp(dot(sub(p, a), ab) / len2, 0, 1);
    const closest = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
    return Math.hypot(p[0] - closest[0], p[1] - closest[1], p[2] - closest[2]) - radius;
  };
}

/** Cylinder along Y, capped, centered at `center`. */
export function sdfCylinder(center, radius, height) {
  if (!(radius > 0 && height > 0)) throw new Error('sdf: cylinder radius/height must be positive');
  return (p) => {
    const dx = Math.hypot(p[0] - center[0], p[2] - center[2]) - radius;
    const dy = Math.abs(p[1] - center[1]) - height / 2;
    return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  };
}

export function sdfGroundPlane(height = 0) {
  return (p) => p[1] - height;
}

// --- CSG composition -------------------------------------------------

export function sdfUnion(...sdfs) {
  if (!sdfs.length) throw new Error('sdf: union needs at least one field');
  return (p) => Math.min(...sdfs.map((f) => f(p)));
}

export function sdfIntersect(...sdfs) {
  if (!sdfs.length) throw new Error('sdf: intersection needs at least one field');
  return (p) => Math.max(...sdfs.map((f) => f(p)));
}

export function sdfSubtract(base, ...tools) {
  if (!tools.length) throw new Error('sdf: subtract needs at least one tool field');
  return (p) => Math.max(base(p), ...tools.map((f) => -f(p)));
}

/** Polynomial smooth-min union (negative-inside convention). */
export function sdfSmoothUnion(a, b, k) {
  if (!(k > 0)) throw new Error('sdf: smooth union k must be positive');
  return (p) => {
    const da = a(p), db = b(p);
    const h = clamp(0.5 + 0.5 * (db - da) / k, 0, 1);
    return db * (1 - h) + da * h - k * h * (1 - h);
  };
}

/** Hollow shell of the given wall thickness around a field. */
export function sdfShell(sdf, thickness) {
  if (!(thickness > 0)) throw new Error('sdf: shell thickness must be positive');
  return (p) => Math.abs(sdf(p)) - thickness / 2;
}

// --- Domain transforms -----------------------------------------------

export function sdfTranslate(sdf, offset) {
  return (p) => sdf([p[0] - offset[0], p[1] - offset[1], p[2] - offset[2]]);
}

/** Uniform scale about the origin (exact for uniform scale). */
export function sdfScale(sdf, s) {
  if (!(s > 0)) throw new Error('sdf: scale must be positive');
  return (p) => sdf([p[0] / s, p[1] / s, p[2] / s]) * s;
}

/** Rotate the shape by rotation matrix R (rows, orthonormal). */
export function sdfRotate(sdf, R) {
  // Evaluate in shape space: p' = R^T p.
  return (p) => sdf([
    R[0][0] * p[0] + R[1][0] * p[1] + R[2][0] * p[2],
    R[0][1] * p[0] + R[1][1] * p[1] + R[2][1] * p[2],
    R[0][2] * p[0] + R[1][2] * p[1] + R[2][2] * p[2],
  ]);
}

/**
 * Infinite domain repetition with cell size. Distances are exact
 * near cell centers and approximate near cell boundaries (the
 * standard repetition caveat).
 */
export function sdfRepeat(sdf, cell) {
  if (cell.some((c) => !(c > 0))) throw new Error('sdf: repeat cell must be positive');
  return (p) => sdf(p.map((v, i) => v - cell[i] * Math.round(v / cell[i])));
}

// --- Field queries -----------------------------------------------------

/** Outward surface normal from the SDF gradient (central differences). */
export function sdfNormal(sdf, p, eps = 1e-4) {
  const g = [0, 1, 2].map((axis) => {
    const plus = [...p], minus = [...p];
    plus[axis] += eps;
    minus[axis] -= eps;
    return (sdf(plus) - sdf(minus)) / (2 * eps);
  });
  const len = Math.hypot(...g) || 1;
  return g.map((v) => v / len);
}

/**
 * Sphere-trace a ray. Returns { t, point, steps } on hit (within
 * eps of the surface) or null on miss / maxDist / step budget.
 */
export function raymarch(sdf, origin, direction, { maxDist = 100, maxSteps = 512, eps = 1e-6 } = {}) {
  const len = Math.hypot(...direction);
  if (len < 1e-15) throw new Error('sdf: ray direction must be non-zero');
  const dir = direction.map((v) => v / len);
  let t = 0;
  for (let step = 0; step < maxSteps; step++) {
    const p = origin.map((v, i) => v + dir[i] * t);
    const d = sdf(p);
    if (d < eps) return { t, point: p, steps: step + 1 };
    t += d;
    if (t > maxDist) return null;
  }
  return null;
}

/** Dense SDF grid sample (voxel volume; not a sparse VDB tree). */
export function sampleSdfGrid(sdf, { min, max, res }) {
  if (!Number.isInteger(res) || res < 1) throw new Error('sdf: grid res must be a positive integer');
  const n = res + 1;
  const values = new Float32Array(n * n * n);
  const step = [0, 1, 2].map((i) => (max[i] - min[i]) / res);
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    values[i + n * (j + n * k)] = sdf([min[0] + i * step[0], min[1] + j * step[1], min[2] + k * step[2]]);
  }
  return { values, min: [...min], max: [...max], res, step };
}

/**
 * Extract the zero isosurface as an indexed mesh with gradient
 * normals, via ./metaballs.js polygonizeField (which expects a
 * positive-inside field, hence the negation).
 */
export function sdfToMesh(sdf, { min, max, res = 32 } = {}) {
  const mesh = polygonizeField((x, y, z) => -sdf([x, y, z]), { min, max, res, iso: 0 });
  const normals = new Float32Array(mesh.positions.length);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const n = sdfNormal(sdf, [mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]]);
    normals[i] = n[0];
    normals[i + 1] = n[1];
    normals[i + 2] = n[2];
  }
  return { positions: mesh.positions, normals, indices: mesh.indices };
}
