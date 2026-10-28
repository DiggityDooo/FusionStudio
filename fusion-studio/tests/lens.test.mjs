import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applySimilarity2D, chromaticAberration, distortPoint, distortPoints,
  estimateSimilarity2D, undistortPoint, vignette, warpImageBuffer,
} from '../src/lens.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const vecNear = (a, b, eps = 1e-9) => near(a[0], b[0], eps) && near(a[1], b[1], eps);

test('distortion matches the Brown-Conrady closed form at hand-computed points', () => {
  // Pure k1: point (1, 0), k1 = 0.1 -> r2 = 1, L = 1.1 -> (1.1, 0).
  assert.ok(vecNear(distortPoint([1, 0], { k1: 0.1 }), [1.1, 0], 1e-12), 'radial term at r=1');
  // Point (0.5, 0.5), k1 = -0.2: r2 = 0.5, L = 0.9.
  assert.ok(vecNear(distortPoint([0.5, 0.5], { k1: -0.2 }), [0.45, 0.45], 1e-12), 'barrel negative k');
  // Pure tangential p1 = 0.1 at (1, 0): xd += p1 (r2 + 0) = 0.1, yd += 2 p1 x y = 0.
  assert.ok(vecNear(distortPoint([1, 0], { p1: 0.1 }), [1.1, 0], 1e-12), 'p1 at (1,0)');
  // p1 = 0.1 at (0, 1): xd += p1 (r2 + 2) = 0.3, yd += 0.
  assert.ok(vecNear(distortPoint([0, 1], { p1: 0.1 }), [0.3, 1], 1e-12), 'p1 at (0,1)');
  // Identity lens leaves every point bit-exact.
  assert.deepEqual(distortPoint([0.3, -0.7], {}), [0.3, -0.7]);
  // k2/k3 contribute r^4/r^6 exactly: at (1,0) with k2=0.01,k3=0.001: L=1.011.
  assert.ok(vecNear(distortPoint([1, 0], { k2: 0.01, k3: 0.001 }), [1.011, 0], 1e-12), 'higher order terms');
});

test('undistortion inverts distortion to numerical precision across the frame', () => {
  const lens = { k1: -0.25, k2: 0.08, k3: -0.01, p1: 0.002, p2: -0.001 };
  const points = [];
  for (let i = 0; i <= 8; i++) {
    for (let j = 0; j <= 8; j++) points.push([-0.9 + 0.225 * i, -0.9 + 0.225 * j]);
  }
  for (const p of points) {
    const roundTrip = undistortPoint(distortPoint(p, lens), lens);
    assert.ok(vecNear(roundTrip, p, 1e-8), `round trip at ${p}: ${roundTrip}`);
  }
  // Stronger pincushion inverts too.
  const strong = { k1: 0.35, k2: 0.1 };
  for (const p of [[0.2, 0.1], [-0.6, 0.4], [0.8, -0.8], [0, 0]]) {
    assert.ok(vecNear(undistortPoint(distortPoint(p, strong), strong), p, 1e-8), `strong round trip ${p}`);
  }
  // Batch API agrees elementwise with the scalar API.
  const batch = distortPoints(points.slice(0, 4), lens);
  batch.forEach((d, i) => assert.deepEqual(d, distortPoint(points[i], lens), 'batch == scalar'));
});

test('image warp: identity is exact and distort->undistort restores a linear image', () => {
  // Linear ramp image: bilinear resampling of a linear field is
  // exact, so the warp round trip is limited only by the point
  // inversion (1e-8-level).
  const width = 32, height = 24;
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (x + width * y) * 4;
      data[i] = x / width;
      data[i + 1] = y / height;
      data[i + 2] = (x + y) / (width + height);
      data[i + 3] = 1;
    }
  }
  const buffer = { width, height, data, aovs: {} };
  const identity = warpImageBuffer(buffer, {}, { mode: 'undistort' });
  assert.deepEqual([...identity.data], [...data], 'identity lens warp is a bit-exact copy');
  const lens = { k1: -0.18, k2: 0.04, p1: 0.001 };
  const distorted = warpImageBuffer(buffer, lens, { mode: 'distort' });
  const restored = warpImageBuffer(distorted, lens, { mode: 'undistort' });
  let maxErr = 0;
  // Interior only: edge clamping loses information at the border.
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      const i = (x + width * y) * 4;
      for (let c = 0; c < 3; c++) maxErr = Math.max(maxErr, Math.abs(restored.data[i + c] - data[i + c]));
    }
  }
  assert.ok(maxErr < 0.01, `warp round trip max error ${maxErr}`);
  assert.throws(() => warpImageBuffer(buffer, lens, { mode: 'sideways' }), /unknown warp mode/);
});

test('Procrustes similarity estimation recovers known transforms exactly', () => {
  const from = [[0, 0], [1, 0], [0, 2], [3, 1], [-1, -2], [2, -1]];
  const truth = { scale: 2, angle: (30 * Math.PI) / 180, translation: [5, -3] };
  const to = from.map((p) => applySimilarity2D(truth, p));
  const est = estimateSimilarity2D(from, to);
  assert.ok(near(est.scale, 2, 1e-9) && near(est.angle, truth.angle, 1e-9), `scale/angle ${est.scale}, ${est.angle}`);
  assert.ok(vecNear(est.translation, [5, -3], 1e-9), 'translation recovered');
  assert.ok(est.rms < 1e-9, `residual rms ${est.rms}`);
  for (let i = 0; i < from.length; i++) {
    assert.ok(vecNear(applySimilarity2D(est, from[i]), to[i], 1e-9), 'mapped points land on targets');
  }
  // Pure translation + noisy target: params stay close, rms reports the noise.
  const shifted = from.map(([x, y]) => [x + 1, y - 2]);
  const estT = estimateSimilarity2D(from, shifted);
  assert.ok(near(estT.scale, 1, 1e-9) && near(estT.angle, 0, 1e-9) && vecNear(estT.translation, [1, -2], 1e-9));
  assert.throws(() => estimateSimilarity2D([[1, 1], [1, 1]], [[0, 0], [1, 1]]), /degenerate/);
});

test('vignette and chromatic aberration follow their definitions', () => {
  assert.equal(vignette(0, { strength: 0.6 }), 1, 'center untouched');
  assert.equal(vignette(0.5, { strength: 0.6, start: 0.6, end: 1.4 }), 1, 'before start untouched');
  assert.ok(near(vignette(2, { strength: 0.6 }), 0.4), 'full falloff past the end');
  // Smoothstep midpoint: t=0.5 -> s=0.5.
  assert.ok(near(vignette(1.0, { strength: 0.8, start: 0.6, end: 1.4 }), 0.6, 1e-12), 'midpoint half strength');
  const [r, g, b] = chromaticAberration([0.5, -0.25], [1.01, 1, 0.99]);
  assert.ok(vecNear(r, [0.505, -0.2525], 1e-12) && vecNear(g, [0.5, -0.25], 1e-15) && vecNear(b, [0.495, -0.2475], 1e-12),
    'channels scale radially about the center');
  assert.throws(() => vignette(1, { strength: 2 }), /\[0, 1\]/);
  assert.throws(() => chromaticAberration([0, 0], [1, 1]), /three positive/);
});
