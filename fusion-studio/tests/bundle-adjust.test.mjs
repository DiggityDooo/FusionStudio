import test from 'node:test';
import assert from 'node:assert/strict';
import { bundleAdjust, reprojectionStats, rodrigues } from '../src/bundle-adjust.js';
import { composeCamera, projectPoint } from '../src/camera-solve.js';
import { mulberry32 } from '../src/scatter.js';

const K = [[800, 0, 320], [0, 800, 240], [0, 0, 1]];

function lookAt(center, target = [0, 0, 0]) {
  // OpenCV-style basis: z backward (center - target), x = up x z, y = z x x.
  const zRaw = center.map((v, i) => v - target[i]);
  const zl = Math.hypot(...zRaw);
  const z = zRaw.map((v) => v / zl);
  const xRaw = [z[2], 0, -z[0]]; // cross([0,1,0], z)
  const xl = Math.hypot(...xRaw) || 1;
  const x = xRaw.map((v) => v / xl);
  const y = [
    z[1] * x[2] - z[2] * x[1],
    z[2] * x[0] - z[0] * x[2],
    z[0] * x[1] - z[1] * x[0],
  ];
  return [x, y, z];
}

function makeScene() {
  const rng = mulberry32(42);
  const points = [];
  for (let i = 0; i < 24; i++) points.push([rng() * 3 - 1.5, rng() * 3 - 1.5, rng() * 3 - 1.5]);
  const centers = [[8, 2, 6], [-7, 3, 7], [-6, -2, -7], [7, -3, -6]];
  const cameras = centers.map((center) => ({ K: K.map((r) => [...r]), R: lookAt(center), center: [...center] }));
  const observations = [];
  cameras.forEach((cam, ci) => {
    const P = composeCamera(cam.K, cam.R, cam.center);
    points.forEach((p, pi) => {
      const [u, v, w] = projectPoint(P, p);
      assert.ok(w < 0, 'scene point in front of camera (repo -Z forward convention)');
      observations.push({ camera: ci, point: pi, uv: [u, v] });
    });
  });
  return { cameras, points, observations };
}

function perturb(scene, rng, { camRot = 0.02, camShift = 0.05, pointNoise = 0.03 } = {}) {
  const cameras = scene.cameras.map((cam, i) => {
    if (i === 0) return { K: cam.K.map((r) => [...r]), R: cam.R.map((r) => [...r]), center: [...cam.center] };
    const dR = rodrigues([(rng() - 0.5) * 2 * camRot, (rng() - 0.5) * 2 * camRot, (rng() - 0.5) * 2 * camRot]);
    const R = dR.map((row) => cam.R[0].map((_, j) => row.reduce((s, v, k) => s + v * cam.R[k][j], 0)));
    return { K: cam.K.map((r) => [...r]), R, center: cam.center.map((v) => v + (rng() - 0.5) * 2 * camShift) };
  });
  const points = scene.points.map((p) => p.map((v) => v + (rng() - 0.5) * 2 * pointNoise));
  return { cameras, points };
}

function alignedPointRms(recovered, truth, c0, c1r, c1t) {
  const s = Math.hypot(...c1r.map((v, i) => v - c0[i])) / Math.hypot(...c1t.map((v, i) => v - c0[i]));
  let sum = 0;
  recovered.forEach((p, i) => {
    const aligned = p.map((v, k) => c0[k] + s * (v - c0[k]));
    sum += Math.hypot(...aligned.map((v, k) => v - truth[i][k])) ** 2;
  });
  return Math.sqrt(sum / recovered.length);
}

test('rodrigues builds proper rotations', () => {
  const R = rodrigues([0, 0, Math.PI / 2]);
  const v = [R[0][0] * 1 + R[0][1] * 0, R[1][0] * 1 + R[1][1] * 0, 0];
  assert.ok(Math.abs(v[0]) < 1e-12 && Math.abs(v[1] - 1) < 1e-12, 'x axis rotates to y');
  const det = R[0][0] * (R[1][1] * R[2][2] - R[1][2] * R[2][1])
    - R[0][1] * (R[1][0] * R[2][2] - R[1][2] * R[2][0])
    + R[0][2] * (R[1][0] * R[2][1] - R[1][1] * R[2][0]);
  assert.ok(Math.abs(det - 1) < 1e-12);
  assert.deepEqual(rodrigues([0, 0, 0]), [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
});

test('noise-free bundle adjustment recovers the scene to numerical precision', () => {
  const scene = makeScene();
  const rng = mulberry32(7);
  const start = perturb(scene, rng);
  const before = JSON.stringify({ cameras: start.cameras, points: start.points });
  const result = bundleAdjust({ cameras: start.cameras, points: start.points, observations: scene.observations });
  assert.ok(result.initialRms > 1, `perturbed start is genuinely off (${result.initialRms.toFixed(2)} px)`);
  assert.ok(result.rms < 1e-8, `final rms ${result.rms} px`);
  assert.ok(result.maxError < 1e-6, `max error ${result.maxError}`);
  // Gauge: camera 0 is the fixed anchor and inputs are not mutated.
  assert.deepEqual(result.cameras[0], start.cameras[0]);
  assert.equal(JSON.stringify({ cameras: start.cameras, points: start.points }), before, 'inputs untouched');
  // Structure recovered up to the residual similarity scale. The
  // absolute bound is set by scene conditioning (narrow depth
  // range at ~10 units with an 800 px focal leaves a flat valley
  // along the viewing rays), so the sharp oracle is the large
  // improvement over the perturbed start at machine-precision
  // reprojection.
  const startRms = alignedPointRms(start.points, scene.points, scene.cameras[0].center, start.cameras[1].center, scene.cameras[1].center);
  const rms = alignedPointRms(result.points, scene.points, scene.cameras[0].center, result.cameras[1].center, scene.cameras[1].center);
  assert.ok(rms < 0.005, `aligned point rms ${rms}`);
  assert.ok(rms < startRms / 5, `structure improves ${startRms.toFixed(4)} -> ${rms.toFixed(4)}`);
});

test('noisy observations: BA beats the perturbed start and stays near the noise floor', () => {
  const scene = makeScene();
  const rng = mulberry32(99);
  const gauss = () => (rng() + rng() + rng() + rng() - 2) * 0.3; // approx N(0, 0.3)
  const noisyObs = scene.observations.map((o) => ({ ...o, uv: [o.uv[0] + gauss(), o.uv[1] + gauss()] }));
  const start = perturb(scene, mulberry32(5));
  const startStats = reprojectionStats(start.cameras, start.points, noisyObs);
  const startPointRms = alignedPointRms(start.points, scene.points, scene.cameras[0].center, start.cameras[1].center, scene.cameras[1].center);
  const result = bundleAdjust({ cameras: start.cameras, points: start.points, observations: noisyObs });
  assert.ok(result.rms < startStats.rms / 5, `rms ${startStats.rms.toFixed(2)} -> ${result.rms.toFixed(3)}`);
  assert.ok(result.rms < 0.5, `near the 0.3 px noise floor (${result.rms.toFixed(3)})`);
  const pointRms = alignedPointRms(result.points, scene.points, scene.cameras[0].center, result.cameras[1].center, scene.cameras[1].center);
  assert.ok(pointRms < startPointRms * 0.5, `point rms ${startPointRms.toFixed(4)} -> ${pointRms.toFixed(4)}`);
  assert.ok(pointRms < 0.02, `absolute point rms ${pointRms.toFixed(4)}`);
});

test('bundle adjustment validates its input', () => {
  const scene = makeScene();
  assert.throws(() => bundleAdjust({ cameras: [], points: scene.points, observations: scene.observations }), /required/);
  assert.throws(() => bundleAdjust({
    cameras: scene.cameras, points: scene.points,
    observations: [{ camera: 9, point: 0, uv: [0, 0] }],
  }), /out of range/);
});
