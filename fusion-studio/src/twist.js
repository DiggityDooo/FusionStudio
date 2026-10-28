'use strict';
// Twist and corrective joints (A13 "Twist joints and corrective
// joints"): swing-twist decomposition of quaternions ([w,x,y,z],
// the repo convention) so twist can be measured, redistributed
// across helper joints along a bone, and converted into
// corrective-shape weights.

export function quatNormalize(q) {
  const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return q.map((v) => v / len);
}

export function quatMultiply(a, b) {
  const [aw, ax, ay, az] = a;
  const [bw, bx, by, bz] = b;
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}

export function quatConjugate(q) {
  return [q[0], -q[1], -q[2], -q[3]];
}

export function quatFromAxisAngle(axis, angle) {
  const len = Math.hypot(...axis);
  if (len < 1e-15) throw new Error('twist: axis must be non-zero');
  const s = Math.sin(angle / 2) / len;
  return [Math.cos(angle / 2), axis[0] * s, axis[1] * s, axis[2] * s];
}

const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Decompose q into swing * twist about `axis` (unit): twist is
 * the rotation component around the axis, swing the remainder.
 * twistAngle is the signed twist in (-pi, pi].
 */
export function swingTwistDecompose(q, axis) {
  const alen = Math.hypot(...axis);
  if (alen < 1e-15) throw new Error('twist: axis must be non-zero');
  const ax = axis.map((v) => v / alen);
  const [w, x, y, z] = quatNormalize(q);
  const proj = x * ax[0] + y * ax[1] + z * ax[2];
  let twist = quatNormalize([w, ax[0] * proj, ax[1] * proj, ax[2] * proj]);
  if (Math.hypot(twist[0] - 1) < 1e-15 && Math.hypot(twist[1], twist[2], twist[3]) < 1e-12) {
    twist = [1, 0, 0, 0];
  }
  const swing = quatNormalize(quatMultiply([w, x, y, z], quatConjugate(twist)));
  const twistAngle = wrapPi(2 * Math.atan2(proj, w));
  return { swing, twist, twistAngle };
}

/** Split a twist angle across helper joints by weights (sums exactly). */
export function distributeTwist(angle, weights) {
  if (!Array.isArray(weights) || !weights.length) throw new Error('twist: weights required');
  const total = weights.reduce((s, w) => s + w, 0);
  if (!(total > 0)) throw new Error('twist: weights must sum to a positive value');
  return weights.map((w) => (angle * w) / total);
}

/**
 * Per-joint twist quaternions for a helper chain: joint i applies
 * quatFromAxisAngle(axis, angles[i]) about the bone axis, so the
 * composed chain equals the full twist.
 */
export function twistChainQuaternions(axis, angle, weights) {
  return distributeTwist(angle, weights).map((a) => quatFromAxisAngle(axis, a));
}

/**
 * Corrective-shape weight for a bend angle: 0 at/below `start`,
 * 1 at/above `full`, smoothstep in between (angles in radians,
 * sign-insensitive: bending either way drives the corrective).
 */
export function correctiveWeight(angle, { start, full }) {
  if (!(full > start)) throw new Error('twist: corrective full must exceed start');
  const a = Math.abs(angle);
  if (a <= start) return 0;
  if (a >= full) return 1;
  const t = (a - start) / (full - start);
  return t * t * (3 - 2 * t);
}
