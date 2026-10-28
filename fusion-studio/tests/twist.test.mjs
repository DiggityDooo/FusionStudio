import test from 'node:test';
import assert from 'node:assert/strict';
import {
  correctiveWeight, distributeTwist, quatFromAxisAngle, quatMultiply,
  quatNormalize, swingTwistDecompose, twistChainQuaternions,
} from '../src/twist.js';
import { quaternionToMatrix } from '../src/icp.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const D2R = Math.PI / 180;

function assertSameRotation(qa, qb, label) {
  const A = quaternionToMatrix(quatNormalize(qa));
  const B = quaternionToMatrix(quatNormalize(qb));
  for (let i = 0; i < 9; i++) assert.ok(near(A[i], B[i], 1e-9), `${label}: matrix[${i}] ${A[i]} vs ${B[i]}`);
}

test('swing-twist decomposition reconstructs the rotation exactly', () => {
  const cases = [
    { q: quatMultiply(quatFromAxisAngle([0, 1, 0], 40 * D2R), quatFromAxisAngle([1, 0, 0], 30 * D2R)), axis: [1, 0, 0] },
    { q: quatFromAxisAngle([1, 2, 3], 77 * D2R), axis: [1, 2, 3] },
    { q: quatFromAxisAngle([0, 0, 1], -120 * D2R), axis: [0, 1, 0] },
    { q: quatMultiply(quatFromAxisAngle([1, 1, 0], 55 * D2R), quatFromAxisAngle([0, 0, 1], 170 * D2R)), axis: [0, 0, 1] },
  ];
  for (const { q, axis } of cases) {
    const { swing, twist } = swingTwistDecompose(q, axis);
    assertSameRotation(quatMultiply(swing, twist), q, 'swing * twist == q');
    // The swing part carries no twist about the axis.
    const swingTwist = swingTwistDecompose(swing, axis);
    assert.ok(near(swingTwist.twistAngle, 0, 1e-9), `swing is twist-free (${swingTwist.twistAngle})`);
    // The twist part is a pure rotation about the axis.
    const m = quaternionToMatrix(twist);
    const ax = axis.map((v) => v / Math.hypot(...axis));
    const rotated = [0, 1, 2].map((r) => m[r * 3] * ax[0] + m[r * 3 + 1] * ax[1] + m[r * 3 + 2] * ax[2]);
    for (let i = 0; i < 3; i++) assert.ok(near(rotated[i], ax[i], 1e-9), 'twist leaves its axis fixed');
  }
});

test('twist angles: pure twist recovered, pure swing zero, wrap handled', () => {
  const about = swingTwistDecompose(quatFromAxisAngle([1, 0, 0], 30 * D2R), [1, 0, 0]);
  assert.ok(near(about.twistAngle, 30 * D2R, 1e-12), `pure twist ${about.twistAngle / D2R} deg`);
  const swingOnly = swingTwistDecompose(quatFromAxisAngle([0, 1, 0], 50 * D2R), [1, 0, 0]);
  assert.ok(near(swingOnly.twistAngle, 0, 1e-12), 'perpendicular rotation has no twist');
  const wrapped = swingTwistDecompose(quatFromAxisAngle([0, 0, 1], 350 * D2R), [0, 0, 1]);
  assert.ok(near(wrapped.twistAngle, -10 * D2R, 1e-9), `350 deg wraps to -10 (${wrapped.twistAngle / D2R})`);
  const half = swingTwistDecompose(quatFromAxisAngle([1, 0, 0], 180 * D2R), [1, 0, 0]);
  assert.ok(near(Math.abs(half.twistAngle), Math.PI, 1e-9), 'half-turn twist is +/- pi');
  // Twist of a composed rotation about the bone axis is additive.
  const composed = quatMultiply(quatFromAxisAngle([1, 0, 0], 20 * D2R), quatFromAxisAngle([0, 1, 0], 65 * D2R));
  const after = quatMultiply(quatFromAxisAngle([1, 0, 0], 15 * D2R), composed);
  const d1 = swingTwistDecompose(composed, [1, 0, 0]).twistAngle;
  const d2 = swingTwistDecompose(after, [1, 0, 0]).twistAngle;
  assert.ok(near(d2 - d1, 15 * D2R, 1e-9), 'pre-twisting adds its angle to the measured twist');
  assert.throws(() => swingTwistDecompose([1, 0, 0, 0], [0, 0, 0]), /non-zero/);
});

test('twist distribution and helper chains compose to the full twist', () => {
  const angles = distributeTwist(90 * D2R, [0.25, 0.5, 0.25]);
  assert.deepEqual(angles.map((a) => a / D2R), [22.5, 45, 22.5]);
  assert.ok(near(angles.reduce((s, a) => s + a, 0), 90 * D2R, 1e-15), 'distributed angles sum exactly');
  const chain = twistChainQuaternions([0, 1, 0], 80 * D2R, [1, 2, 1, 1]);
  let composed = [1, 0, 0, 0];
  for (const q of chain) composed = quatMultiply(q, composed);
  assertSameRotation(composed, quatFromAxisAngle([0, 1, 0], 80 * D2R), 'chain product == full twist');
  assert.equal(chain.length, 4);
  assert.throws(() => distributeTwist(1, [0, 0]), /positive/);
  assert.throws(() => distributeTwist(1, []), /required/);
});

test('corrective weights follow the smoothstep drive curve', () => {
  const drive = { start: 45 * D2R, full: 90 * D2R };
  assert.equal(correctiveWeight(30 * D2R, drive), 0);
  assert.equal(correctiveWeight(90 * D2R, drive), 1);
  assert.equal(correctiveWeight(120 * D2R, drive), 1, 'clamps after full');
  assert.ok(near(correctiveWeight(67.5 * D2R, drive), 0.5, 1e-12), 'smoothstep midpoint is exactly 0.5');
  assert.equal(correctiveWeight(-90 * D2R, drive), 1, 'sign-insensitive');
  assert.throws(() => correctiveWeight(1, { start: 2, full: 1 }), /exceed/);
});
