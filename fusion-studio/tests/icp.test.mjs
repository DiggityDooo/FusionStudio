import test from 'node:test';
import assert from 'node:assert/strict';
import { kabsch, icp, applyTransform, quaternionToMatrix } from '../src/icp.js';
import { mulberry32 } from '../src/scatter.js';

function rotationFromAxisAngle(axis, angleDeg) {
  const l = Math.hypot(...axis);
  const [x, y, z] = axis.map((v) => v / l);
  const a = (angleDeg * Math.PI) / 180;
  const w = Math.cos(a / 2), s = Math.sin(a / 2);
  return quaternionToMatrix([w, x * s, y * s, z * s]);
}
function cloud(count, seed, scale = 2) {
  const rng = mulberry32(seed);
  const pts = [];
  for (let i = 0; i < count; i++) pts.push([(rng() - 0.5) * scale, (rng() - 0.5) * scale, (rng() - 0.5) * scale]);
  return pts;
}
const flat = (pts) => pts.flatMap((p) => p);
const matVec = (R, t, p) => applyTransform(R, t, p);

test('kabsch recovers a known rigid transform exactly', () => {
  const pts = cloud(40, 11);
  const R = rotationFromAxisAngle([1, 2, 3], 37);
  const t = [0.5, -1.2, 2.0];
  const moved = pts.map((p) => matVec(R, t, p));
  const { rotation, translation } = kabsch(flat(pts), flat(moved));
  for (let i = 0; i < 9; i++) assert.ok(Math.abs(rotation[i] - R[i]) < 1e-9, `R[${i}]`);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(translation[i] - t[i]) < 1e-9, `t[${i}]`);
  assert.throws(() => kabsch([0, 0, 0, 1, 0, 0], [0, 0, 0, 1, 0, 0]), />= 3/);
});

test('icp aligns an unregistered cloud onto its transformed copy', () => {
  const pts = cloud(120, 23);
  const R = rotationFromAxisAngle([0, 1, 0.4], 18);
  const t = [0.3, 0.1, -0.4];
  const target = pts.map((p) => matVec(R, t, p));
  // ICP estimates source -> target... we align the TRANSFORMED cloud
  // back onto the original, so the recovered map is the inverse.
  const result = icp(flat(target), flat(pts), { maxIterations: 80 });
  assert.ok(result.rmse < 1e-6, `rmse ${result.rmse}`);
  const aligned = target.map((p) => applyTransform(result.rotation, result.translation, p));
  let maxErr = 0;
  for (let i = 0; i < pts.length; i++) {
    maxErr = Math.max(maxErr, Math.hypot(aligned[i][0] - pts[i][0], aligned[i][1] - pts[i][1], aligned[i][2] - pts[i][2]));
  }
  assert.ok(maxErr < 1e-4, `max point error ${maxErr}`);
  assert.ok(result.iterations < 80, 'converged before the cap');
});

test('icp tolerates noise and rejects far outliers via maxPairDistance', () => {
  const rng = mulberry32(31);
  const pts = cloud(90, 29);
  const R = rotationFromAxisAngle([1, 0, 0], 12);
  const t = [0.2, 0.3, 0.1];
  const noisy = pts.map((p) => {
    const m = matVec(R, t, p);
    return [m[0] + (rng() - 0.5) * 0.01, m[1] + (rng() - 0.5) * 0.01, m[2] + (rng() - 0.5) * 0.01];
  });
  // Add gross outliers far from the shape.
  const withOutliers = [...noisy, [9, 9, 9], [-8, 7, 6], [7, -9, 8]];
  const result = icp(flat(withOutliers), flat(pts), { maxIterations: 80, maxPairDistance: 0.5 });
  assert.ok(result.rmse < 0.02, `noisy rmse ${result.rmse}`);
  // Without the distance gate the outliers poison the fit measurably.
  const ungated = icp(flat(withOutliers), flat(pts), { maxIterations: 80 });
  assert.ok(ungated.rmse > result.rmse, 'gating helps');
  assert.throws(() => icp([0, 0, 0], flat(pts)), />= 3 points/);
});

test('icp on identical clouds is the identity with zero error', () => {
  const pts = cloud(30, 41);
  const result = icp(flat(pts), flat(pts));
  assert.ok(result.rmse < 1e-9);
  assert.ok(Math.abs(result.translation[0]) < 1e-9 && Math.abs(result.translation[1]) < 1e-9);
  assert.ok(Math.abs(result.rotation[0] - 1) < 1e-9 && Math.abs(result.rotation[4] - 1) < 1e-9);
});
