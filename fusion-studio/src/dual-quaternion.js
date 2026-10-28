'use strict';
// Dual quaternion skinning (A14 "Linear blend skinning, dual
// quaternion skinning"): rigid-transform blending without the
// volume loss of matrix LBS. A dual quaternion is
// { real: [w,x,y,z], dual: [w,x,y,z] } with dual = 0.5 * t * q
// for translation t (as a pure quaternion) and rotation q.
// Skin data uses the packed indices/weights layout from
// ./skin-reduce.js.

import { quatConjugate, quatMultiply, quatNormalize } from './twist.js';

export function dqFromQuaternionTranslation(q, t) {
  const real = quatNormalize(q);
  const tq = quatMultiply([0, t[0], t[1], t[2]], real);
  return { real, dual: tq.map((v) => v * 0.5) };
}

/** Translation encoded in a (unit) dual quaternion. */
export function dqTranslation(dq) {
  const m = quatMultiply(dq.dual, quatConjugate(dq.real));
  return [2 * m[1], 2 * m[2], 2 * m[3]];
}

export function dqNormalize(dq) {
  const len = Math.hypot(...dq.real) || 1;
  return {
    real: dq.real.map((v) => v / len),
    dual: dq.dual.map((v) => v / len),
  };
}

/**
 * Weighted blend with sign alignment: quaternions q and -q are
 * the same rotation, so every input is flipped into the first
 * input's hemisphere before summing.
 */
export function dqBlend(entries) {
  if (!entries?.length) throw new Error('dq: blend needs at least one entry');
  const ref = entries[0].dq.real;
  const real = [0, 0, 0, 0], dual = [0, 0, 0, 0];
  for (const { dq, weight } of entries) {
    const dot = dq.real.reduce((s, v, i) => s + v * ref[i], 0);
    const sign = dot < 0 ? -1 : 1;
    for (let i = 0; i < 4; i++) {
      real[i] += sign * weight * dq.real[i];
      dual[i] += sign * weight * dq.dual[i];
    }
  }
  return dqNormalize({ real, dual });
}

function rotateByQuat(q, p) {
  const [w, x, y, z] = q;
  // p' = p + 2 * cross(qv, cross(qv, p) + w * p)
  const uvx = y * p[2] - z * p[1], uvy = z * p[0] - x * p[2], uvz = x * p[1] - y * p[0];
  const uuvx = y * uvz - z * uvy, uuvy = z * uvx - x * uvz, uuvz = x * uvy - y * uvx;
  return [
    p[0] + 2 * (uvx * w + uuvx),
    p[1] + 2 * (uvy * w + uuvy),
    p[2] + 2 * (uvz * w + uuvz),
  ];
}

export function dqTransformPoint(dq, p) {
  const rotated = rotateByQuat(dq.real, p);
  const t = dqTranslation(dq);
  return [rotated[0] + t[0], rotated[1] + t[1], rotated[2] + t[2]];
}

function skinRows(skin, vertexCount) {
  const { indices, weights, stride } = skin;
  const rows = [];
  for (let v = 0; v < vertexCount; v++) {
    const entries = [];
    for (let s = 0; s < stride; s++) {
      const joint = indices[v * stride + s];
      const w = weights[v * stride + s];
      if (joint >= 0 && w > 0) entries.push({ joint, weight: w });
    }
    rows.push(entries);
  }
  return rows;
}

/**
 * Skin vertices with dual quaternions. joints: [{ rotation:
 * [w,x,y,z], translation: [x,y,z] }]. Returns Float32Array of
 * skinned positions (same layout as input).
 */
export function skinVerticesDQS(positions, skin, joints) {
  const vertexCount = positions.length / 3;
  const jointDqs = joints.map((j) => dqFromQuaternionTranslation(j.rotation, j.translation));
  const rows = skinRows(skin, vertexCount);
  const out = new Float32Array(positions.length);
  rows.forEach((entries, v) => {
    if (!entries.length) throw new Error(`dq: vertex ${v} has no influences`);
    const blended = dqBlend(entries.map(({ joint, weight }) => {
      if (!jointDqs[joint]) throw new Error(`dq: joint index ${joint} out of range`);
      return { dq: jointDqs[joint], weight };
    }));
    const p = [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
    const skinned = dqTransformPoint(blended, p);
    out.set(skinned, v * 3);
  });
  return out;
}

/** Classic linear blend skinning over the same inputs (for comparison). */
export function skinVerticesLBS(positions, skin, joints) {
  const vertexCount = positions.length / 3;
  const rows = skinRows(skin, vertexCount);
  const out = new Float32Array(positions.length);
  rows.forEach((entries, v) => {
    if (!entries.length) throw new Error(`dq: vertex ${v} has no influences`);
    const p = [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
    const acc = [0, 0, 0];
    for (const { joint, weight } of entries) {
      const j = joints[joint];
      if (!j) throw new Error(`dq: joint index ${joint} out of range`);
      const rotated = rotateByQuat(quatNormalize(j.rotation), p);
      acc[0] += weight * (rotated[0] + j.translation[0]);
      acc[1] += weight * (rotated[1] + j.translation[1]);
      acc[2] += weight * (rotated[2] + j.translation[2]);
    }
    out.set(acc, v * 3);
  });
  return out;
}
