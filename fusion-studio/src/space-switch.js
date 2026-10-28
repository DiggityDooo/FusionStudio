'use strict';
// Space switching (A13 "Space switching"): reparenting a control
// between animated parent spaces (world, body, hand, prop...) while
// preserving its world transform at the switch frame. Works in the
// repo transform convention: {position, rotation (Euler XYZ degrees),
// scale} and 3x4 row-major matrices from mograph-kernel.composeMatrix.
// newLocal = inverse(newParentWorld) * oldParentWorld * oldLocal.

import { composeMatrix } from './mograph-kernel.js';

export { composeMatrix };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Multiply 3x4 affine matrices: result applies b first, then a. */
export function multiplyMat34(a, b) {
  const out = new Array(12);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c];
    }
    out[r * 4 + 3] = a[r * 4] * b[3] + a[r * 4 + 1] * b[7] + a[r * 4 + 2] * b[11] + a[r * 4 + 3];
  }
  return out;
}

/** Invert a 3x4 affine matrix. Throws on (near-)singular matrices. */
export function invertMat34(m) {
  const a = m[0], b = m[1], c = m[2];
  const d = m[4], e = m[5], f = m[6];
  const g = m[8], h = m[9], i = m[10];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) throw new Error('space-switch: singular parent matrix (zero scale?) cannot be inverted');
  const inv = [
    (e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det,
    (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det,
    (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det,
  ];
  const t = [m[3], m[7], m[11]];
  const invT = [
    -(inv[0] * t[0] + inv[1] * t[1] + inv[2] * t[2]),
    -(inv[3] * t[0] + inv[4] * t[1] + inv[5] * t[2]),
    -(inv[6] * t[0] + inv[7] * t[1] + inv[8] * t[2]),
  ];
  return [
    inv[0], inv[1], inv[2], invT[0],
    inv[3], inv[4], inv[5], invT[1],
    inv[6], inv[7], inv[8], invT[2],
  ];
}

export function applyMat34(m, p) {
  return [
    m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
    m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
    m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
  ];
}

/** World matrix of a parent-first chain of TRS transforms. */
export function chainWorld(transforms) {
  return transforms.reduce(
    (acc, trs) => multiplyMat34(acc, composeMatrix(trs)),
    [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
  );
}

/**
 * Decompose a 3x4 back to {position, rotation (deg XYZ), scale}.
 * Negative-determinant matrices fold the mirror into scale[0].
 * Near gimbal lock (|sin ry| ~ 1) rz is set to 0.
 */
export function decomposeMat34(m) {
  const position = [m[3], m[7], m[11]];
  const cols = [
    [m[0], m[4], m[8]],
    [m[1], m[5], m[9]],
    [m[2], m[6], m[10]],
  ];
  const scale = cols.map((c) => Math.hypot(c[0], c[1], c[2]));
  const det =
    m[0] * (m[5] * m[10] - m[6] * m[9]) -
    m[1] * (m[4] * m[10] - m[6] * m[8]) +
    m[2] * (m[4] * m[9] - m[5] * m[8]);
  if (det < 0) scale[0] = -scale[0];
  const r = cols.map((c, idx) => c.map((v) => v / (scale[idx] || 1)));
  // r is now the rotation with columns r[0], r[1], r[2]; rebuild rows.
  const row = [
    [r[0][0], r[1][0], r[2][0]],
    [r[0][1], r[1][1], r[2][1]],
    [r[0][2], r[1][2], r[2][2]],
  ];
  const sinY = clamp(-row[2][0], -1, 1);
  let rx, ry = Math.asin(sinY), rz;
  if (Math.abs(sinY) > 0.9999) {
    rz = 0;
    rx = Math.atan2(-row[1][2], row[1][1]);
  } else {
    rx = Math.atan2(row[2][1], row[2][2]);
    rz = Math.atan2(row[1][0], row[0][0]);
  }
  const deg = 180 / Math.PI;
  return { position, rotation: [rx * deg, ry * deg, rz * deg], scale };
}

/** New local matrix for a switch between two parent world matrices. */
export function switchParentMatrix(localMat, oldParentWorld, newParentWorld) {
  return multiplyMat34(invertMat34(newParentWorld), multiplyMat34(oldParentWorld, localMat));
}

/**
 * Shear magnitude of a 3x4: how far its linear part is from any
 * rotation*scale decomposition (0 = exactly TRS-representable).
 */
export function mat34Shear(m) {
  const trs = decomposeMat34(m);
  const recomposed = composeMatrix(trs);
  let worst = 0;
  for (let i = 0; i < 12; i++) {
    if (i % 4 === 3) continue;
    worst = Math.max(worst, Math.abs(recomposed[i] - m[i]));
  }
  return worst;
}

/**
 * Switch a TRS transform from one parent chain to another, preserving
 * its world transform. Parent chains are parent-first TRS arrays
 * (empty array = world space). Throws when the switch would introduce
 * shear (rotated non-uniform parent scales), which TRS cannot
 * represent -- use switchParentMatrix in that case.
 */
export function switchSpace(transform, oldParentChain, newParentChain) {
  const localMat = composeMatrix(transform);
  const switched = switchParentMatrix(localMat, chainWorld(oldParentChain), chainWorld(newParentChain));
  const shear = mat34Shear(switched);
  if (shear > 1e-6) {
    throw new Error(`space-switch: switch introduces shear (${shear.toFixed(4)}); TRS cannot represent it -- keep the matrix form (switchParentMatrix)`);
  }
  return decomposeMat34(switched);
}

/** World transform (TRS) of a local transform under a parent chain. */
export function worldTransform(transform, parentChain) {
  return decomposeMat34(multiplyMat34(chainWorld(parentChain), composeMatrix(transform)));
}
