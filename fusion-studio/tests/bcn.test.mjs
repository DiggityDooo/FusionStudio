import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeBC1Block, decodeBC1Block, encodeBC3Block, decodeBC3Block,
  encodeBC1Texture, decodeBC1Texture, encodeBC3Texture, decodeBC3Texture,
} from '../src/bcn.js';

function image(width, height, fn) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const [r, g, b, a] = fn(x, y);
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = a;
    }
  }
  return data;
}

test('byte layout: black/white block has exact endpoints and indices', () => {
  const pixels = [];
  for (let i = 0; i < 16; i++) pixels.push(i < 8 ? [255, 255, 255, 255] : [0, 0, 0, 255]);
  const block = encodeBC1Block(pixels);
  assert.equal(block.length, 8);
  const view = new DataView(block.buffer);
  assert.equal(view.getUint16(0, true), 0xffff, 'c0 = white (larger endpoint first)');
  assert.equal(view.getUint16(2, true), 0x0000, 'c1 = black');
  // First 8 pixels pick palette 0 (white), last 8 pick palette 1 (black).
  const decoded = decodeBC1Block(block);
  assert.deepEqual(decoded[0], [255, 255, 255, 255]);
  assert.deepEqual(decoded[15], [0, 0, 0, 255]);
  assert.deepEqual(decoded[7], [255, 255, 255, 255]);
  assert.deepEqual(decoded[8], [0, 0, 0, 255]);
});

test('solid color round-trips within RGB565 quantization error', () => {
  const pixels = Array.from({ length: 16 }, () => [200, 100, 50, 255]);
  const decoded = decodeBC1Block(encodeBC1Block(pixels));
  for (const p of decoded) {
    assert.ok(Math.abs(p[0] - 200) <= 8, `r ${p[0]}`);
    assert.ok(Math.abs(p[1] - 100) <= 4, `g ${p[1]}`);
    assert.ok(Math.abs(p[2] - 50) <= 8, `b ${p[2]}`);
    assert.equal(p[3], 255);
  }
});

test('BC1 transparent mode: alpha < 128 pixels decode to alpha 0', () => {
  const pixels = Array.from({ length: 16 }, (_, i) => (i % 2 ? [255, 0, 0, 255] : [0, 0, 255, 0]));
  const decoded = decodeBC1Block(encodeBC1Block(pixels));
  for (let i = 0; i < 16; i++) {
    if (i % 2) assert.deepEqual(decoded[i], [255, 0, 0, 255], 'opaque red is exact in 565');
    else assert.equal(decoded[i][3], 0, 'transparent texel decodes transparent');
  }
});

test('BC3 carries a smooth alpha ramp and color together', () => {
  const pixels = Array.from({ length: 16 }, (_, i) => [255, 255, 255, i * 17]);
  const decoded = decodeBC3Block(encodeBC3Block(pixels));
  for (let i = 0; i < 16; i++) {
    assert.ok(Math.abs(decoded[i][3] - i * 17) <= 20, `alpha ${i}: got ${decoded[i][3]}, want ~${i * 17}`);
    assert.deepEqual(decoded[i].slice(0, 3), [255, 255, 255]);
  }
  // Extremes are exact: endpoints are max/min alpha.
  assert.equal(decoded[15][3], 255);
  assert.equal(decoded[0][3], 0);
});

test('gradient image round-trip: bounded error, exact dimensions and size', () => {
  const data = image(16, 16, (x, y) => [x * 17, y * 17, 128, 255]);
  const tex = encodeBC1Texture(16, 16, data);
  assert.equal(tex.blocksWide, 4);
  assert.equal(tex.data.length, 16 * 8, '16 blocks * 8 bytes');
  const back = decodeBC1Texture(tex);
  let maxErr = 0, sum = 0;
  for (let i = 0; i < data.length; i++) {
    const err = Math.abs(back.data[i] - data[i]);
    maxErr = Math.max(maxErr, err);
    sum += err;
  }
  assert.ok(maxErr <= 48, `max channel error ${maxErr}`);
  assert.ok(sum / data.length < 8, `mean channel error ${sum / data.length}`);
  assert.equal(back.width, 16);
});

test('non-multiple-of-4 images pad by edge clamping and crop back', () => {
  const data = image(6, 5, (x, y) => [x * 40, y * 50, 99, 255]);
  const tex = encodeBC3Texture(6, 5, data);
  assert.equal(tex.blocksWide, 2);
  assert.equal(tex.blocksHigh, 2);
  assert.equal(tex.data.length, 4 * 16);
  const back = decodeBC3Texture(tex);
  assert.equal(back.data.length, 6 * 5 * 4);
  // Corner pixel is a solid region representative: close after 565 quantize.
  const o = 0;
  assert.ok(Math.abs(back.data[o] - 0) <= 8);
  assert.ok(Math.abs(back.data[o + 2] - 99) <= 8);
});
