import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateCameraMatrix, decomposeCamera, reprojectionError, composeCamera, projectPoint, jacobiEigen,
  refineCameraMatrix,
} from '../src/camera-solve.js';
import { mulberry32 } from '../src/scatter.js';
import { quaternionToMatrix } from '../src/icp.js';

function rotationFromAxisAngle(axis, angleDeg) {
  const l = Math.hypot(...axis);
  const [x, y, z] = axis.map((v) => v / l);
  const a = (angleDeg * Math.PI) / 360;
  const flat = quaternionToMatrix([Math.cos(a), x * Math.sin(a), y * Math.sin(a), z * Math.sin(a)]);
  return [flat.slice(0, 3), flat.slice(3, 6), flat.slice(6, 9)];
}
const K_TRUE = [[900, 0, 320], [0, 920, 240], [0, 0, 1]];
const CENTER_TRUE = [2.5, 1.2, 6.0];
// lookAt rotation: camera at CENTER_TRUE aimed at the origin.
const R_TRUE = (() => {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };
  const zc = norm(sub(CENTER_TRUE, [0, 0, 0]));
  const xc = norm(cross([0, 1, 0], zc));
  const yc = cross(zc, xc);
  return [xc, yc, zc];
})();
const P_TRUE = composeCamera(K_TRUE, R_TRUE, CENTER_TRUE);

function scenePoints(count = 24, seed = 17) {
  const rng = mulberry32(seed);
  const pts = [];
  for (let i = 0; i < count; i++) pts.push([(rng() - 0.5) * 4, (rng() - 0.5) * 3, (rng() - 0.5) * 2]);
  return pts;
}

test('jacobi eigensolver diagonalizes a symmetric matrix', () => {
  const A = [[4, 1, 2], [1, 3, 0.5], [2, 0.5, 5]];
  const { values, vectors } = jacobiEigen(A);
  // A v = lambda v for column 0.
  const v = [vectors[0][0], vectors[1][0], vectors[2][0]];
  const Av = A.map((row) => row.reduce((s, x, k) => s + x * v[k], 0));
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(Av[i] - values[0] * v[i]) < 1e-10);
  assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-10);
});

test('DLT recovers the synthetic camera: pose, center, and intrinsics', () => {
  const pts = scenePoints();
  const uv = pts.map((p) => projectPoint(P_TRUE, p).slice(0, 2));
  // lookAt convention: camera looks down -Z, so in-front points have
  // negative w in the raw projection (image still forms correctly).
  assert.ok(pts.every((p) => projectPoint(P_TRUE, p)[2] < 0), 'fixture: points in front');
  const P = estimateCameraMatrix(pts, uv);
  assert.ok(reprojectionError(P, pts, uv) < 1e-6, `reprojection ${reprojectionError(P, pts, uv)}`);
  const { K, R, center } = decomposeCamera(P);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(center[i] - CENTER_TRUE[i]) < 1e-6, `center[${i}] ${center[i]} vs ${CENTER_TRUE[i]}`);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    assert.ok(Math.abs(R[r][c] - R_TRUE[r][c]) < 1e-6, `R[${r}][${c}]`);
  }
  assert.ok(Math.abs(K[0][0] - 900) < 0.5, `fx ${K[0][0]}`);
  assert.ok(Math.abs(K[1][1] - 920) < 0.5, `fy ${K[1][1]}`);
  assert.ok(Math.abs(K[0][2] - 320) < 0.5, `cx ${K[0][2]}`);
  assert.ok(Math.abs(K[1][2] - 240) < 0.5, `cy ${K[1][2]}`);
  assert.ok(Math.abs(K[2][2] - 1) < 1e-12);
});

test('recovered camera generalizes to unseen points and noisy observations degrade gracefully', () => {
  const train = scenePoints(18, 23);
  const uvTrain = train.map((p) => projectPoint(P_TRUE, p).slice(0, 2));
  const P = estimateCameraMatrix(train, uvTrain);
  const held = scenePoints(10, 99);
  const uvHeld = held.map((p) => projectPoint(P_TRUE, p).slice(0, 2));
  assert.ok(reprojectionError(P, held, uvHeld) < 1e-6, 'held-out points reproject exactly');
  // Half-pixel observation noise: solution stays close.
  const rng = mulberry32(5);
  const noisyUv = uvTrain.map(([u, v]) => [u + (rng() - 0.5), v + (rng() - 0.5)]);
  const noisyP = estimateCameraMatrix(train, noisyUv);
  const err = reprojectionError(noisyP, train, noisyUv);
  assert.ok(err < 0.5, `noisy fit residual ${err} consistent with 0.5px noise`);
  const { center } = decomposeCamera(noisyP);
  const centerErr = Math.hypot(center[0] - CENTER_TRUE[0], center[1] - CENTER_TRUE[1], center[2] - CENTER_TRUE[2]);
  assert.ok(centerErr < 0.25, `noisy center error ${centerErr}`);
});

test('validation: too few correspondences rejected', () => {
  assert.throws(() => estimateCameraMatrix([[0, 0, 0]], [[0, 0]]), />= 6/);
});

test('non-linear refinement (bundle-adjustment core) improves on the DLT solution', () => {
  const pts = scenePoints(24, 31);
  const uvClean = pts.map((p) => projectPoint(P_TRUE, p).slice(0, 2));
  const rng = mulberry32(47);
  const uvNoisy = uvClean.map(([u, v]) => [u + (rng() - 0.5), v + (rng() - 0.5)]);
  const dlt = estimateCameraMatrix(pts, uvNoisy);
  const dltError = reprojectionError(dlt, pts, uvNoisy);
  const refined = refineCameraMatrix(dlt, pts, uvNoisy, { iterations: 40 });
  // LM minimizes exactly this objective, so it must not do worse than
  // its DLT start, and the residual must sit at the noise floor
  // (uniform +-0.5 px noise has 2D RMS ~= 0.40).
  assert.ok(refined.error < dltError, `refined ${refined.error.toFixed(4)} < DLT ${dltError.toFixed(4)}`);
  assert.ok(refined.error < 0.41, `refined at noise floor (${refined.error.toFixed(4)})`);
  // Strong oracle: from a deliberately perturbed camera (5% entry
  // noise, as from a rough solve), refinement against clean
  // observations recovers the true camera.
  const rngPerturb = mulberry32(3);
  const perturbed = P_TRUE.map((row) => row.map((v) => v * (1 + (rngPerturb() - 0.5) * 0.1)));
  const startError = reprojectionError(perturbed, pts, uvClean);
  assert.ok(startError > 1, `perturbed start is genuinely off (${startError.toFixed(2)} px)`);
  const recovered = refineCameraMatrix(perturbed, pts, uvClean, { iterations: 60 });
  assert.ok(recovered.error < 0.01, `recovered to ${recovered.error.toFixed(5)} px`);
  const { center } = decomposeCamera(recovered.P);
  const centerError = Math.hypot(center[0] - CENTER_TRUE[0], center[1] - CENTER_TRUE[1], center[2] - CENTER_TRUE[2]);
  assert.ok(centerError < 0.01, `recovered center error ${centerError.toFixed(5)}`);
  // On noiseless data refinement must not hurt the exact DLT solve.
  const dltClean = estimateCameraMatrix(pts, uvClean);
  const refinedClean = refineCameraMatrix(dltClean, pts, uvClean, { iterations: 10 });
  assert.ok(refinedClean.error < 1e-6, `noiseless refined ${refinedClean.error}`);
});
