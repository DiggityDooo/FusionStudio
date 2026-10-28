import test from 'node:test';
import assert from 'node:assert/strict';
import { bilateralFilter, gaussianBlur, gaussianKernel, medianFilter, upscale } from '../src/image-filter.js';

function makeBuffer(width, height, fill) {
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = fill(x, y);
      data.set([r, g, b, a], (x + width * y) * 4);
    }
  }
  return { width, height, data, aovs: {} };
}
const px = (buffer, x, y) => {
  const i = (x + buffer.width * y) * 4;
  return [buffer.data[i], buffer.data[i + 1], buffer.data[i + 2], buffer.data[i + 3]];
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('gaussian blur: constant invariance and the exact impulse response', () => {
  const constant = makeBuffer(6, 5, () => [0.4, 0.2, 0.9, 1]);
  const blurred = gaussianBlur(constant, 1.3);
  for (let i = 0; i < blurred.data.length; i++) {
    assert.ok(near(blurred.data[i], constant.data[i], 1e-7), 'constant image unchanged');
  }
  // Impulse at the center: response = normalized kernel outer
  // product (separable), total energy 1.
  const impulse = makeBuffer(15, 15, (x, y) => (x === 7 && y === 7 ? [1, 1, 1, 1] : [0, 0, 0, 0]));
  const response = gaussianBlur(impulse, 1);
  const { weights, radius } = gaussianKernel(1);
  const w0 = weights[radius];
  assert.ok(near(px(response, 7, 7)[0], w0 * w0, 1e-7), `center tap ${px(response, 7, 7)[0]} vs w0^2 ${w0 * w0}`);
  assert.ok(near(px(response, 8, 7)[0], weights[radius + 1] * w0, 1e-7), 'neighbor tap is the product kernel');
  let energy = 0;
  for (let i = 0; i < response.data.length; i += 4) energy += response.data[i];
  assert.ok(near(energy, 1, 1e-6), `impulse energy conserved (${energy})`);
  assert.throws(() => gaussianKernel(0), /positive/);
});

test('bilateral filter preserves a step edge and degenerates to gaussian blur', () => {
  const step = makeBuffer(9, 9, (x) => (x < 4 ? [0, 0, 0, 1] : [1, 1, 1, 1]));
  const preserved = bilateralFilter(step, { spatialSigma: 1.5, rangeSigma: 0.05 });
  assert.ok(px(preserved, 3, 4)[0] < 1e-6, `dark side stays dark (${px(preserved, 3, 4)[0]})`);
  assert.ok(px(preserved, 4, 4)[0] > 1 - 1e-6, 'bright side stays bright');
  const blurred = bilateralFilter(step, { spatialSigma: 1.5, rangeSigma: 100 });
  assert.ok(near(px(blurred, 4, 4)[0], px(gaussianBlur(step, 1.5), 4, 4)[0], 0.03),
    'huge range sigma approaches the gaussian result');
  // First white pixel blurs to ~0.635, its dark mirror to ~0.365
  // (they sum to 1 by symmetry); the edge is genuinely blurred.
  assert.ok(px(blurred, 4, 4)[0] > 0.55 && px(blurred, 4, 4)[0] < 0.7, `edge blurred (${px(blurred, 4, 4)[0]})`);
  assert.ok(near(px(blurred, 4, 4)[0] + px(blurred, 3, 4)[0], 1, 1e-6), 'mirror pixels sum to 1');
  const flat = bilateralFilter(makeBuffer(4, 4, () => [0.3, 0.6, 0.9, 1]), { rangeSigma: 0.1 });
  assert.ok(near(px(flat, 1, 1)[0], 0.3, 1e-7), 'constant image invariant');
});

test('median filter deletes salt noise, keeps edges, upscalers sample exactly', () => {
  const noisy = makeBuffer(7, 7, (x, y) => (x === 3 && y === 3 ? [1, 1, 1, 1] : [0, 0, 0, 1]));
  const cleaned = medianFilter(noisy, 1);
  assert.ok(px(cleaned, 3, 3)[0] === 0, 'single-pixel spike removed exactly');
  const step = makeBuffer(6, 4, (x) => (x < 3 ? [0, 0, 0, 1] : [1, 1, 1, 1]));
  const stepMedian = medianFilter(step, 1);
  assert.ok(px(stepMedian, 2, 1)[0] === 0 && px(stepMedian, 3, 1)[0] === 1, 'step edge untouched by median');
  // 2x2 -> 4x4 bilinear: dst(1,1) samples src (0.25, 0.25):
  // 0*.5625 + 1*.1875 + 2*.1875 + 3*.0625 = 0.75.
  const tiny = makeBuffer(2, 2, (x, y) => [x + 2 * y, 0, 0, 1]);
  const up = upscale(tiny, { factor: 2 });
  assert.equal(up.width, 4);
  assert.ok(near(px(up, 1, 1)[0], 0.75, 1e-7), `bilinear center ${px(up, 1, 1)[0]}`);
  assert.ok(near(px(up, 0, 0)[0], 0), 'corner clamps to the corner texel');
  assert.ok(near(px(up, 3, 3)[0], 3), 'far corner reaches the last texel');
  const nearest = upscale(tiny, { factor: 2, method: 'nearest' });
  assert.deepEqual([px(nearest, 0, 0)[0], px(nearest, 1, 0)[0], px(nearest, 2, 0)[0], px(nearest, 3, 0)[0]], [0, 0, 1, 1],
    'nearest replicates 2x blocks');
  assert.throws(() => upscale(tiny, { factor: 0 }), /positive integers/);
  assert.throws(() => medianFilter(tiny, 0), /positive integer/);
});
