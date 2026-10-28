import test from 'node:test';
import assert from 'node:assert/strict';
import { offAxisFrustum, multiplyMat4, projectPoint, ledWallSetup } from '../src/led-volume.js';

const WALL = { pa: [-4, 0, 0], pb: [4, 0, 0], pc: [-4, 3, 0] };

function close(a, b, eps = 1e-9) { return a.every((v, i) => Math.abs(v - b[i]) < eps); }

test('screen corners project exactly to the NDC cube corners for any eye', () => {
  for (const eye of [[0, 1.5, 5], [2.5, 2, 3], [-3, 0.5, 8], [0.1, 1.4, 1.2]]) {
    const { view, projection } = offAxisFrustum({ ...WALL, eye, near: 0.1, far: 100 });
    const mvp = multiplyMat4(projection, view);
    assert.ok(close(projectPoint(mvp, WALL.pa).slice(0, 2), [-1, -1], 1e-9), `pa for eye ${eye}`);
    assert.ok(close(projectPoint(mvp, WALL.pb).slice(0, 2), [1, -1], 1e-9), 'pb');
    assert.ok(close(projectPoint(mvp, WALL.pc).slice(0, 2), [-1, 1], 1e-9), 'pc');
    const pd = [WALL.pb[0], WALL.pc[1], 0]; // top-right corner of the screen
    assert.ok(close(projectPoint(mvp, pd).slice(0, 2), [1, 1], 1e-9), 'fourth corner');
  }
});

test('centered eye reduces to a symmetric frustum; off-center eye shears it', () => {
  const centered = offAxisFrustum({ ...WALL, eye: [0, 1.5, 5] });
  assert.ok(Math.abs(centered.frustum.left + centered.frustum.right) < 1e-9, 'symmetric horizontally');
  assert.ok(Math.abs(centered.frustum.bottom + centered.frustum.top) < 1e-9, 'symmetric vertically');
  const shifted = offAxisFrustum({ ...WALL, eye: [2, 1.5, 5] });
  assert.ok(shifted.frustum.left < centered.frustum.left, 'frustum window slides as the eye moves');
  assert.ok(Math.abs((shifted.frustum.right - shifted.frustum.left) - (centered.frustum.right - centered.frustum.left)) < 1e-9,
    'frustum width (angular size class) changes only via distance, not lateral shift');
});

test('parallax: a scene point behind the wall shifts against the screen as the eye moves', () => {
  const scenePoint = [0, 1.5, -6]; // 6m behind the wall plane
  const proj = (eye) => {
    const { view, projection } = offAxisFrustum({ ...WALL, eye });
    return projectPoint(multiplyMat4(projection, view), scenePoint);
  };
  const center = proj([0, 1.5, 5]);
  assert.ok(close(center.slice(0, 2), [0, 0], 1e-9), 'dead ahead from the centered eye');
  // On a wall-locked display the rendered background must shift WITH
  // the eye so the wall reads as a window (ray through the point
  // pierces the wall at x = 3 - 3*5/11 = 1.64 -> NDC +0.41).
  const right = proj([3, 1.5, 5]);
  assert.ok(right[0] > 0.05, `eye right -> background shifts right on the wall (x=${right[0].toFixed(3)})`);
  assert.ok(Math.abs(right[0] - (3 - 3 * (5 / 11)) / 4) < 1e-9, 'matches the ray-pierce computation');
  const left = proj([-3, 1.5, 5]);
  assert.ok(left[0] < -0.05, 'eye left -> background shifts left');
  // A point ON the wall never moves in NDC (it is glued to the screen).
  const onWall = [1, 1, 0];
  const a = (() => { const s = offAxisFrustum({ ...WALL, eye: [3, 2, 4] }); return projectPoint(multiplyMat4(s.projection, s.view), onWall); })();
  const b = (() => { const s = offAxisFrustum({ ...WALL, eye: [-2, 0.5, 6] }); return projectPoint(multiplyMat4(s.projection, s.view), onWall); })();
  assert.ok(close(a.slice(0, 2), b.slice(0, 2), 1e-9), 'wall-locked content is eye-independent in screen space (depth still varies by eye distance)');
});

test('rotated screens work: corners still land on the NDC corners', () => {
  // Wall rotated 30 degrees about Y, centered at (0, 1.5, -2).
  const cos = Math.cos(Math.PI / 6), sin = Math.sin(Math.PI / 6);
  const place = ([x, y, z]) => [x * cos + z * sin, y + 1.5, -x * sin + z * cos - 2];
  const pa = place([-4, -1.5, 0]), pb = place([4, -1.5, 0]), pc = place([-4, 1.5, 0]);
  const eye = [1, 2, 4];
  const { view, projection } = offAxisFrustum({ pa, pb, pc, eye });
  const mvp = multiplyMat4(projection, view);
  assert.ok(close(projectPoint(mvp, pa).slice(0, 2), [-1, -1], 1e-9));
  assert.ok(close(projectPoint(mvp, pb).slice(0, 2), [1, -1], 1e-9));
  assert.ok(close(projectPoint(mvp, pc).slice(0, 2), [-1, 1], 1e-9));
});

test('depth maps near/far to NDC -1/+1 and invalid setups throw', () => {
  const { view, projection, frustum } = offAxisFrustum({ ...WALL, eye: [0, 1.5, 5], near: 0.5, far: 50 });
  const mvp = multiplyMat4(projection, view);
  const inward = [0, 0, 1]; // screen normal toward the eye is +z here
  const nearPoint = [0, 1.5, 5 - 0.5];
  const farPoint = [0, 1.5, 5 - 50];
  assert.ok(Math.abs(projectPoint(mvp, nearPoint)[2] - -1) < 1e-9, 'near plane at NDC -1');
  assert.ok(Math.abs(projectPoint(mvp, farPoint)[2] - 1) < 1e-6, 'far plane at NDC +1');
  assert.ok(frustum.near === 0.5 && frustum.far === 50);
  void inward;
  assert.throws(() => offAxisFrustum({ ...WALL, eye: [0, 1.5, -5] }), /not in front/);
  assert.throws(() => offAxisFrustum({ ...WALL, eye: [0, 1.5, 5], near: 5, far: 1 }), /near < far/);
  const setup = ledWallSetup({ width: 8, height: 3, eye: [0, 1.5, 5] });
  assert.ok(close(projectPoint(setup.mvp, setup.pa).slice(0, 2), [-1, -1], 1e-9));
});
