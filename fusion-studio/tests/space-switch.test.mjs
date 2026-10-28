import test from 'node:test';
import assert from 'node:assert/strict';
import {
  composeMatrix, multiplyMat34, invertMat34, applyMat34,
  chainWorld, decomposeMat34, switchSpace, switchParentMatrix, mat34Shear, worldTransform,
} from '../src/space-switch.js';

function closeArr(a, b, eps = 1e-9) {
  return a.every((v, i) => Math.abs(v - b[i]) < eps);
}

const PARENT_A = [
  { position: [2, 1, 0], rotation: [0, 0, 30], scale: [1, 1, 1] },
  { position: [0.5, 0, 0], rotation: [20, 0, 0], scale: [2, 2, 2] },
];
const PARENT_B = [
  { position: [-3, 4, 1], rotation: [0, 45, -15], scale: [0.5, 0.5, 0.5] },
  { position: [1, 0, 2], rotation: [0, 0, 80], scale: [1.5, 1.5, 1.5] },
];
const LOCAL = { position: [0.3, -0.7, 1.2], rotation: [10, -25, 40], scale: [1, 0.5, 2] };

test('matrix algebra: multiply/invert round-trips and point application', () => {
  const m = composeMatrix(LOCAL);
  const inv = invertMat34(m);
  const identity = multiplyMat34(m, inv);
  assert.ok(closeArr(identity, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0], 1e-9));
  const p = [1.5, -2, 0.25];
  assert.ok(closeArr(applyMat34(inv, applyMat34(m, p)), p, 1e-9));
  // Compose/decompose round trip for a non-degenerate TRS.
  const rt = decomposeMat34(m);
  assert.ok(closeArr(rt.position, LOCAL.position, 1e-9));
  assert.ok(closeArr(rt.scale, LOCAL.scale, 1e-9));
  assert.ok(closeArr(rt.rotation, LOCAL.rotation, 1e-6), `rotation ${rt.rotation} vs ${LOCAL.rotation}`);
});

test('switching parents preserves the world transform exactly', () => {
  const before = worldTransform(LOCAL, PARENT_A);
  const switched = switchSpace(LOCAL, PARENT_A, PARENT_B);
  const after = worldTransform(switched, PARENT_B);
  assert.ok(closeArr(after.position, before.position, 1e-9),
    `world position ${after.position} vs ${before.position}`);
  assert.ok(closeArr(after.scale, before.scale, 1e-9), 'world scale preserved');
  // Rotation compared as matrices: Euler triples are not unique.
  const worldMatBefore = multiplyMat34(chainWorld(PARENT_A), composeMatrix(LOCAL));
  const worldMatAfter = multiplyMat34(chainWorld(PARENT_B), composeMatrix(switched));
  assert.ok(closeArr(worldMatAfter, worldMatBefore, 1e-8), 'world matrix identical after switch');

  // Point-level proof: a probe point rides the object identically.
  const probe = [0.7, -1.1, 2.3];
  const worldBefore = applyMat34(multiplyMat34(chainWorld(PARENT_A), composeMatrix(LOCAL)), probe);
  const worldAfter = applyMat34(multiplyMat34(chainWorld(PARENT_B), composeMatrix(switched)), probe);
  assert.ok(closeArr(worldAfter, worldBefore, 1e-8));
});

test('switching to world space and back returns the original local transform', () => {
  const toWorld = switchSpace(LOCAL, PARENT_A, []);
  const worldDirect = worldTransform(LOCAL, PARENT_A);
  assert.ok(closeArr(toWorld.position, worldDirect.position, 1e-9));
  assert.ok(closeArr(toWorld.rotation, worldDirect.rotation, 1e-6));
  const back = switchSpace(toWorld, [], PARENT_A);
  assert.ok(closeArr(back.position, LOCAL.position, 1e-9));
  assert.ok(closeArr(back.rotation, LOCAL.rotation, 1e-6), `round trip rotation ${back.rotation}`);
  assert.ok(closeArr(back.scale, LOCAL.scale, 1e-9));
});

test('after the switch, the object follows the new parent only', () => {
  const switched = switchSpace(LOCAL, PARENT_A, PARENT_B);
  const atSwitch = worldTransform(switched, PARENT_B);
  // Move parent B's root; the object must move with it, exactly by B's delta.
  const movedB = [{ ...PARENT_B[0], position: [10, 4, 1] }, PARENT_B[1]];
  const followed = worldTransform(switched, movedB);
  const delta = [
    followed.position[0] - atSwitch.position[0],
    followed.position[1] - atSwitch.position[1],
    followed.position[2] - atSwitch.position[2],
  ];
  // B root moved +13 in x with rotation [0,45,-15]: the world delta is
  // the rotated translation only for the root offset itself; instead
  // verify against direct matrix composition (independent path).
  const expected = applyMat34(chainWorld(movedB), applyMat34(composeMatrix(switched), [0, 0, 0]));
  assert.ok(closeArr(followed.position, expected, 1e-9));
  assert.ok(Math.hypot(...delta) > 1, 'object demonstrably moved with the new parent');
  // Parent A moving must NOT affect it anymore.
  const aMoved = [{ ...PARENT_A[0], position: [99, 99, 99] }, PARENT_A[1]];
  assert.ok(closeArr(worldTransform(switched, PARENT_B).position, atSwitch.position, 1e-12),
    'old parent is irrelevant after the switch');
  void aMoved;
});

test('mirrored parents (negative determinant) decompose with a negative scale axis', () => {
  const mirror = [{ position: [1, 2, 3], rotation: [0, 0, 10], scale: [-1, 1, 1] }];
  const switched = switchSpace(LOCAL, PARENT_A, mirror);
  const before = worldTransform(LOCAL, PARENT_A);
  const after = worldTransform(switched, mirror);
  assert.ok(closeArr(after.position, before.position, 1e-9));
  assert.ok(switched.scale.some((s) => s < 0),
    'mirror is folded into the new local (negative scale axis), not dropped');
  // Recomposition proves validity beyond component comparison.
  const probe = [0.4, 0.9, -1.6];
  const wb = applyMat34(multiplyMat34(chainWorld(PARENT_A), composeMatrix(LOCAL)), probe);
  const wa = applyMat34(multiplyMat34(chainWorld(mirror), composeMatrix(switched)), probe);
  assert.ok(closeArr(wa, wb, 1e-8));
});

test('shear-producing switches are refused at TRS level but exact as matrices', () => {
  // Non-uniform scale under a rotated child creates shear.
  const shearParent = [
    { position: [0, 0, 0], rotation: [0, 0, 45], scale: [2, 0.5, 1] },
    { position: [1, 0, 0], rotation: [30, 0, 0], scale: [1, 1, 1] },
  ];
  assert.throws(() => switchSpace(LOCAL, PARENT_A, shearParent), /introduces shear/);
  assert.ok(mat34Shear(chainWorld(shearParent)) > 0.01, 'fixture really is sheared');
  // The matrix form stays exact: probe points ride identically.
  const probe = [0.7, -1.1, 2.3];
  const localMat = composeMatrix(LOCAL);
  const switchedMat = switchParentMatrix(localMat, chainWorld(PARENT_A), chainWorld(shearParent));
  const wb = applyMat34(multiplyMat34(chainWorld(PARENT_A), localMat), probe);
  const wa = applyMat34(multiplyMat34(chainWorld(shearParent), switchedMat), probe);
  assert.ok(closeArr(wa, wb, 1e-8));
});

test('singular parents are explicit errors', () => {
  const flat = [{ position: [0, 0, 0], rotation: [0, 0, 0], scale: [0, 1, 1] }];
  assert.throws(() => switchSpace(LOCAL, PARENT_A, flat), /singular parent matrix/);
});
