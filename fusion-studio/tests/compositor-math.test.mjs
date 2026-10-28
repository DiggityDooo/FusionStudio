import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCompTree, addCompNode, linkCompNodes, createImageBuffer, attachAovs,
  liftGammaGain, applyToneCurve, createLut, applyLut, exportLut, importLutCube,
  tonemap, bloom, chromaticAberration, sharpen, denoisePass, zDepthFog,
  defocusDof, vectorBlur, cryptomatteMask, keyingMatte, rotoShape,
  matchmoveCamera, evaluateCompositor, createPostVolume, applyPostVolume,
} from '../src/compositor.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

function bufferFrom(w, h, fn) {
  const buf = createImageBuffer(w, h, [0, 0, 0, 1]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b, a] = fn(x, y);
    const i = (y * w + x) * 4;
    buf.data[i] = r; buf.data[i + 1] = g; buf.data[i + 2] = b; buf.data[i + 3] = a ?? 1;
  }
  return buf;
}

test('lift/gamma/gain matches the CDL-style formula exactly', () => {
  const img = createImageBuffer(1, 1, [0.25, 0.5, 1, 0.75]);
  const out = liftGammaGain(img, { lift: [0.1, 0, -0.2], gamma: [2, 1, 1], gain: [1.5, 2, 1] });
  assert.ok(near(out.data[0], Math.pow(0.35, 0.5) * 1.5, 1e-6), `r ${out.data[0]}`);
  assert.ok(near(out.data[1], 0.5 * 2, 1e-6));
  assert.ok(near(out.data[2], 0.8, 1e-6));
  assert.equal(out.data[3], 0.75, 'alpha untouched');
  const id = liftGammaGain(img, {});
  assert.ok(near(id.data[0], 0.25) && near(id.data[1], 0.5), 'identity defaults');
});

test('tonemappers hit their analytic values', () => {
  const img = createImageBuffer(1, 1, [1, 3, 0, 1]);
  const reinhard = tonemap(img, { mode: 'reinhard' });
  assert.ok(near(reinhard.data[0], 0.5) && near(reinhard.data[1], 0.75));
  const aces = tonemap(img, { mode: 'aces' });
  assert.ok(near(aces.data[0], 2.54 / 3.16, 1e-6), `aces(1) ${aces.data[0]}`);
  assert.equal(aces.data[2], 0, 'black stays black');
  const exposed = tonemap(img, { mode: 'none', exposure: 0.25 });
  assert.ok(near(exposed.data[0], 0.25));
  assert.throws(() => tonemap(img, { mode: 'aces', exposure: 32 }), /exposure/);
});

test('tone curve is quantized identity and hits knots approximately', () => {
  const img = bufferFrom(4, 1, (x) => [x / 3, x / 3, x / 3]);
  const id = applyToneCurve(img, [[0, 0], [1, 1]]);
  for (let x = 0; x < 4; x++) assert.ok(near(id.data[x * 4], x / 3, 1 / 255 + 1e-6), `identity ${x}`);
  const mid = applyToneCurve(createImageBuffer(1, 1, [0.5, 0.5, 0.5, 1]), [[0, 0], [0.5, 0.25], [1, 1]]);
  assert.ok(Math.abs(mid.data[0] - 0.25) < 0.01, `knot ${mid.data[0]}`);
});

test('identity LUT reproduces input exactly (trilinear, not nearest)', () => {
  const size = 8;
  const data = new Float32Array(size * size * size * 3);
  for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) {
    const i = ((b * size + g) * size + r) * 3;
    data[i] = r / (size - 1); data[i + 1] = g / (size - 1); data[i + 2] = b / (size - 1);
  }
  const img = createImageBuffer(1, 1, [0.37, 0.62, 0.11, 1]);
  const out = applyLut(img, { size, data });
  assert.ok(near(out.data[0], 0.37, 1e-6) && near(out.data[1], 0.62, 1e-6) && near(out.data[2], 0.11, 1e-6),
    `identity LUT gave ${out.data[0]}, ${out.data[1]}, ${out.data[2]}`);
});

test('.cube export/import round-trips LUT data', () => {
  const lut = createLut(8, { contrast: 1.2 });
  const back = importLutCube(exportLut(lut));
  assert.equal(back.size, 8);
  for (let i = 0; i < lut.data.length; i++) assert.ok(near(back.data[i], lut.data[i], 1e-5), `entry ${i}`);
  assert.throws(() => importLutCube('not a lut'), /Invalid/);
});

test('bloom: threshold gates exactly, glow is symmetric and energy-true', () => {
  const flat = createImageBuffer(8, 8, [0.5, 0.5, 0.5, 1]);
  const flatOut = bloom(flat, { threshold: 0.7, strength: 1 });
  for (let i = 0; i < flatOut.data.length; i += 4) assert.ok(near(flatOut.data[i], 0.5, 1e-7), 'below threshold unchanged');

  const imp = bufferFrom(9, 9, (x, y) => (x === 4 && y === 4 ? [10, 10, 10] : [0, 0, 0]));
  const out = bloom(imp, { threshold: 0.7, strength: 1 });
  const px = (x, y) => out.data[(y * 9 + x) * 4];
  assert.ok(px(4, 4) > 10, 'center gains blurred self-energy');
  assert.ok(near(px(3, 4), px(5, 4), 1e-6) && near(px(4, 3), px(4, 5), 1e-6), 'symmetric spread');
  assert.ok(px(3, 4) > px(2, 4) && px(2, 4) > 0, 'falloff with distance');
  // Added energy = strength * bright-pass energy (blur kernel normalized).
  let added = 0;
  for (let i = 0; i < out.data.length; i += 4) added += out.data[i] - imp.data[i];
  assert.ok(near(added, 10 * (1 - 0.7 / 10), 0.05), `energy ${added}`);
});

test('chromatic aberration shifts red out and blue in, on both axes', () => {
  const w = 16, h = 16;
  const img = bufferFrom(w, h, (x, y) => [x / (w - 1), y / (h - 1), (x + y) / (w + h - 2)]);
  const out = chromaticAberration(img, { amount: 0.25 });
  const at = (buf, x, y, c) => buf.data[(y * w + x) * 4 + c];
  // Right-of-center: red samples farther out (larger), green untouched.
  assert.ok(at(out, 12, 8, 0) > at(img, 12, 8, 0), 'red expands');
  assert.ok(near(at(out, 12, 8, 1), at(img, 12, 8, 1), 1e-7), 'green untouched');
  // Below-center: blue samples nearer center on the y axis too (row 11 < 12).
  assert.ok(at(out, 8, 12, 2) < at(img, 8, 12, 2) - 0.02, `blue contracts: ${at(out, 8, 12, 2)} vs ${at(img, 8, 12, 2)}`);
  const center = chromaticAberration(img, { amount: 0 });
  for (let i = 0; i < img.data.length; i++) assert.ok(near(center.data[i], img.data[i], 1e-7), 'zero amount is identity');
});

test('sharpen and denoise have exact impulse responses', () => {
  const imp = bufferFrom(5, 5, (x, y) => (x === 2 && y === 2 ? [1, 1, 1] : [0, 0, 0]));
  const sharp = sharpen(imp, { amount: 0.5 });
  assert.ok(near(sharp.data[(2 * 5 + 2) * 4], 1.5, 1e-6), 'center boosted');
  assert.ok(near(sharp.data[(2 * 5 + 3) * 4], -0.125, 1e-6), 'negative lobe');
  const flat = createImageBuffer(4, 4, [0.4, 0.4, 0.4, 1]);
  assert.ok(near(sharpen(flat, { amount: 2 }).data[5], 0.4, 1e-7), 'flat field unchanged');
  const den = denoisePass(imp, { strength: 0.5 });
  assert.ok(near(den.data[(2 * 5 + 2) * 4], 0.6, 1e-6), 'denoise mixes toward 5-tap mean');
});

test('z-depth fog follows the exponential falloff exactly', () => {
  const img = createImageBuffer(2, 1, [0.2, 0.4, 0.6, 1]);
  attachAovs(img, { depth: new Float32Array([5, 0]) });
  const out = zDepthFog(img, { density: 0.05, color: [1, 1, 1] });
  const f = 1 - Math.exp(-0.25);
  assert.ok(near(out.data[0], 0.2 + (1 - 0.2) * f, 1e-6), `fog ${out.data[0]}`);
  assert.ok(near(out.data[4], 0.2, 1e-7), 'zero depth untouched');
  assert.throws(() => zDepthFog(createImageBuffer(1, 1)), /Depth AOV/);
});

test('cryptomatte and keying produce exact mattes', () => {
  const img = createImageBuffer(3, 1, [0, 1, 0, 1]);
  attachAovs(img, { cryptomatte: new Uint16Array([7, 3, 7]) });
  const mask = cryptomatteMask(img, 7);
  assert.deepEqual(Array.from(mask.data), [1, 0, 1]);
  const keyed = keyingMatte(img, { key: [0, 1, 0], tolerance: 0.3 });
  assert.equal(keyed.data[0], 0, 'exact key color keyed out');
  const colored = bufferFrom(2, 1, (x) => (x === 0 ? [0.9, 0.1, 0.1] : [0, 0.9, 0.1]));
  assert.equal(keyingMatte(colored, { key: [0, 1, 0], tolerance: 0.3 }).data[0], 1, 'far color kept');
});

test('roto rasterizes the actual polygon, including concavity', () => {
  // Chevron (concave): notch at top-center must be OUTSIDE.
  const chevron = [[0.1, 0.1], [0.5, 0.4], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]];
  const mask = rotoShape(32, 32, chevron);
  const at = (x, y) => mask.data[y * 32 + x];
  assert.equal(at(16, 4), 0, 'notch excluded (bounding box would include it)');
  assert.equal(at(16, 28), 1, 'body included');
  assert.equal(at(2, 2), 0, 'outside corner excluded');
  const tri = rotoShape(64, 64, [[0.1, 0.1], [0.9, 0.1], [0.5, 0.9]]);
  const frac = tri.data.reduce((s, v) => s + v, 0) / (64 * 64);
  assert.ok(Math.abs(frac - 0.32) < 0.03, `triangle coverage ${frac} vs 0.32`);
});

test('vector blur smears along the motion vector; zero vector is identity', () => {
  const img = bufferFrom(8, 1, (x) => [x, x, x]);
  attachAovs(img, { vector: new Float32Array(8 * 2).fill(0).map((_, i) => (i % 2 === 0 ? 2 : 0)) });
  const out = vectorBlur(img, { amount: 1 });
  // taps at -2..2: out(3) = mean(1,2,3,4,5) = 3; out(0) clamps: mean(0,0,0,1,2)=0.6
  assert.ok(near(out.data[3 * 4], 3, 1e-6), `smear ${out.data[3 * 4]}`);
  assert.ok(near(out.data[0], 0.6, 1e-6));
  const still = bufferFrom(4, 1, (x) => [x * 0.25, 0, 0]);
  attachAovs(still, { vector: new Float32Array(8) });
  const id = vectorBlur(still, { amount: 1 });
  for (let i = 0; i < still.data.length; i++) assert.ok(near(id.data[i], still.data[i], 1e-7), 'identity');
});

test('defocus keeps focus depth sharp and blurs far depth', () => {
  const imp = bufferFrom(5, 5, (x, y) => (x === 2 && y === 2 ? [1, 1, 1] : [0, 0, 0]));
  attachAovs(imp, { depth: new Float32Array(25).fill(0.5) });
  const sharp = defocusDof(imp, { focus: 0.5, blur: 1 });
  for (let i = 0; i < imp.data.length; i++) assert.ok(near(sharp.data[i], imp.data[i], 1e-7), 'at focus = identity');
  attachAovs(imp, { depth: new Float32Array(25).fill(10) });
  const blurred = defocusDof(imp, { focus: 0.5, blur: 1 });
  assert.ok(blurred.data[(2 * 5 + 2) * 4] < 0.2, `far depth blurs impulse: ${blurred.data[(2 * 5 + 2) * 4]}`);
  assert.ok(blurred.data[(2 * 5 + 3) * 4] > 0, 'energy spreads to neighbors');
});

test('evaluateCompositor honors link order and rejects cycles', () => {
  const tree = createCompTree();
  const tone = addCompNode(tree, 'tonemap', { mode: 'aces' });
  const bal = addCompNode(tree, 'color_balance', { gain: [2, 2, 2] });
  linkCompNodes(tree, bal.id, tone.id); // balance BEFORE tonemap despite insertion order
  const img = createImageBuffer(2, 2, [0.4, 0.4, 0.4, 1]);
  const out = evaluateCompositor(tree, { beauty: img });
  const manual = tonemap(liftGammaGain(img, { gain: [2, 2, 2] }), { mode: 'aces' });
  for (let i = 0; i < out.data.length; i++) assert.ok(near(out.data[i], manual.data[i], 1e-6), 'link order respected');
  const cyc = createCompTree();
  const a = addCompNode(cyc, 'tonemap', {});
  const b = addCompNode(cyc, 'vignette', {});
  linkCompNodes(cyc, a.id, b.id);
  linkCompNodes(cyc, b.id, a.id);
  assert.throws(() => evaluateCompositor(cyc, { beauty: img }), /cycle/);
});

test('matchmove reports honest diagnostics instead of a fake solve', () => {
  const mm = matchmoveCamera([[0, 0], [1, 0], [0, 1], [1, 1]]);
  assert.equal(mm.solved, false);
  assert.equal(mm.camera, null);
  assert.deepEqual(mm.diagnostics.centroid, [0.5, 0.5]);
  assert.ok(near(mm.diagnostics.maxSpread, Math.hypot(0.5, 0.5), 1e-9));
});

test('post volume applies exposure through the tonemap path', () => {
  const img = createImageBuffer(1, 1, [0.3, 0.3, 0.3, 1]);
  const out = applyPostVolume(img, createPostVolume({ exposure: 2 }));
  assert.ok(near(out.data[0], 0.6, 1e-6));
});
