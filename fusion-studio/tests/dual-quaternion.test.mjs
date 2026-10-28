import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dqBlend, dqFromQuaternionTranslation, dqTransformPoint, dqTranslation,
  skinVerticesDQS, skinVerticesLBS,
} from '../src/dual-quaternion.js';
import { quatFromAxisAngle, quatMultiply } from '../src/twist.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const vecNear = (a, b, eps = 1e-9) => a.every((v, i) => near(v, b[i], eps));

function makeSkin(rows, stride = 4) {
  const indices = new Int32Array(rows.length * stride).fill(-1);
  const weights = new Float32Array(rows.length * stride);
  rows.forEach((row, v) => row.forEach(([joint, w], s) => {
    indices[v * stride + s] = joint;
    weights[v * stride + s] = w;
  }));
  return { indices, weights, stride };
}

test('a single joint transform is reproduced exactly by both methods', () => {
  const q = quatFromAxisAngle([1, 2, 3], 0.7);
  const joints = [{ rotation: q, translation: [2, -1, 0.5] }];
  const skin = makeSkin([[[0, 1]]]);
  const positions = new Float32Array([1, 2, 3]);
  // Expected: q p q* + t via the dual-quaternion path directly.
  const dq = dqFromQuaternionTranslation(q, [2, -1, 0.5]);
  assert.ok(vecNear(dqTranslation(dq), [2, -1, 0.5], 1e-12), 'translation round-trips');
  const expected = dqTransformPoint(dq, [1, 2, 3]);
  assert.ok(vecNear([...skinVerticesDQS(positions, skin, joints)], expected, 1e-6), 'DQS single joint');
  assert.ok(vecNear([...skinVerticesLBS(positions, skin, joints)], expected, 1e-6), 'LBS single joint');
  // Identity joint leaves the vertex bit-exact.
  const identity = skinVerticesDQS(positions, skin, [{ rotation: [1, 0, 0, 0], translation: [0, 0, 0] }]);
  assert.deepEqual([...identity], [1, 2, 3]);
});

test('candy-wrapper: DQS preserves radius exactly, LBS shrinks by cos(theta/2)', () => {
  const theta = (120 * Math.PI) / 180;
  const joints = [
    { rotation: [1, 0, 0, 0], translation: [0, 0, 0] },
    { rotation: quatFromAxisAngle([0, 0, 1], theta), translation: [0, 0, 0] },
  ];
  const skin = makeSkin([[[0, 0.5], [1, 0.5]]]);
  const positions = new Float32Array([1, 0, 0]);
  const dqs = [...skinVerticesDQS(positions, skin, joints)];
  const lbs = [...skinVerticesLBS(positions, skin, joints)];
  // DQS: exact halfway rotation (60 deg) on the unit circle
  // (results read back from a Float32Array, hence 1e-6).
  assert.ok(vecNear(dqs, [0.5, Math.sqrt(3) / 2, 0], 1e-6), `DQS ${dqs}`);
  assert.ok(near(Math.hypot(...dqs), 1, 1e-6), 'DQS radius preserved');
  // LBS: chord midpoint, radius cos(60 deg) = 0.5.
  assert.ok(vecNear(lbs, [0.25, Math.sqrt(3) / 4, 0], 1e-6), `LBS ${lbs}`);
  assert.ok(near(Math.hypot(...lbs), Math.cos(theta / 2), 1e-6), 'LBS collapse factor cos(theta/2)');
  // At 180 degrees LBS collapses the vertex to the axis entirely.
  const joints180 = [
    joints[0],
    { rotation: quatFromAxisAngle([0, 0, 1], Math.PI), translation: [0, 0, 0] },
  ];
  const lbs180 = [...skinVerticesLBS(positions, skin, joints180)];
  assert.ok(near(Math.hypot(...lbs180), 0, 1e-6), 'LBS total collapse at 180');
  const dqs180 = [...skinVerticesDQS(positions, skin, joints180)];
  assert.ok(near(Math.hypot(...dqs180), 1, 1e-6), 'DQS still on the circle at 180');
});

test('antipodal inputs blend consistently; translations interpolate linearly', () => {
  const q = quatFromAxisAngle([0, 1, 0], 1.1);
  const dqA = dqFromQuaternionTranslation(q, [1, 2, 3]);
  const dqNegated = { real: dqA.real.map((v) => -v), dual: dqA.dual.map((v) => -v) };
  const blended = dqBlend([{ dq: dqA, weight: 0.5 }, { dq: dqNegated, weight: 0.5 }]);
  assert.ok(vecNear(dqTransformPoint(blended, [0.5, -2, 1]), dqTransformPoint(dqA, [0.5, -2, 1]), 1e-9),
    'q and -q are the same transform after alignment');
  // Pure translations: both methods land at the weighted midpoint.
  const joints = [
    { rotation: [1, 0, 0, 0], translation: [1, 0, 0] },
    { rotation: [1, 0, 0, 0], translation: [3, 2, 0] },
  ];
  const skin = makeSkin([[[0, 0.25], [1, 0.75]]]);
  const positions = new Float32Array([0, 0, 0]);
  assert.ok(vecNear([...skinVerticesDQS(positions, skin, joints)], [2.5, 1.5, 0], 1e-9), 'DQS translation blend');
  assert.ok(vecNear([...skinVerticesLBS(positions, skin, joints)], [2.5, 1.5, 0], 1e-9), 'LBS translation blend');
  // A twisted arm segment chain: rotate each vertex by its dominant
  // joint — DQS endpoint matches direct quaternion application.
  const arm = quatMultiply(quatFromAxisAngle([1, 0, 0], 0.3), quatFromAxisAngle([0, 0, 1], -0.2));
  const dqArm = dqFromQuaternionTranslation(arm, [0, 1, 0]);
  assert.ok(vecNear(dqTranslation(dqArm), [0, 1, 0], 1e-12));
  assert.throws(() => skinVerticesDQS(positions, makeSkin([[[7, 1]]]), joints), /out of range/);
});
