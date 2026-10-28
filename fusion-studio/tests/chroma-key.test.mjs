import test from 'node:test';
import assert from 'node:assert/strict';
import { keyness, chromaAlpha, despillPixel, chromaKeyImage, premultiply, compositeOver } from '../src/chroma-key.js';

const GREEN = [0, 255, 0];

test('pure key color is fully transparent; neutral colors fully opaque', () => {
  assert.equal(chromaAlpha(GREEN, GREEN), 0);
  assert.equal(chromaAlpha([128, 128, 128], GREEN), 1, 'gray has no green excess');
  assert.equal(chromaAlpha([255, 0, 0], GREEN), 1, 'red is maximally not-green');
  assert.equal(chromaAlpha([200, 30, 30], GREEN), 1);
  assert.ok(Math.abs(keyness([0, 128, 0], GREEN) - 128 / 255) < 1e-9, 'half-strength green, half keyness');
  // Blue screen works symmetrically via its dominant channel.
  assert.equal(chromaAlpha([0, 0, 255], [0, 0, 255]), 0);
  assert.equal(chromaAlpha([0, 255, 0], [0, 0, 255]), 1);
});

test('the blend band is a smooth ramp between similarity-blend and similarity', () => {
  const opts = { similarity: 0.6, blend: 0.2 };
  // keyness 0.4 -> alpha 1 (below band); 0.6 -> 0; 0.5 -> ~0.5.
  const px = (g) => [0, g, 0];
  assert.equal(chromaAlpha(px(0.4 * 255), GREEN, opts), 1);
  assert.equal(chromaAlpha(px(0.6 * 255), GREEN, opts), 0);
  const mid = chromaAlpha(px(0.5 * 255), GREEN, opts);
  assert.ok(mid > 0.4 && mid < 0.6, `mid-band alpha ${mid}`);
  // Monotone across the band.
  let prev = Infinity;
  for (let k = 0.4; k <= 0.601; k += 0.02) {
    const a = chromaAlpha(px(k * 255), GREEN, opts);
    assert.ok(a <= prev + 1e-9, 'alpha never rises as keyness grows');
    prev = a;
  }
});

test('despill caps the key channel at the strongest other channel', () => {
  const spilled = [40, 220, 60];
  const fixed = despillPixel(spilled, GREEN, 1);
  assert.deepEqual(fixed, [40, 60, 60], 'green clamped to max(r, b) = 60');
  const partial = despillPixel(spilled, GREEN, 0.5);
  assert.equal(partial[1], 140, 'half strength moves halfway');
  assert.deepEqual(despillPixel([200, 30, 30], GREEN, 1), [200, 30, 30], 'non-green pixels untouched');
});

test('image keying: a synthetic green-screen shot composites cleanly', () => {
  // 3x1: green backdrop, skin-tone subject, green-spilled edge pixel.
  const img = {
    width: 3, height: 1,
    data: new Uint8Array([0, 255, 0, 230, 180, 150, 90, 200, 80]),
  };
  const keyed = chromaKeyImage(img, { key: GREEN, similarity: 0.55, blend: 0.2 });
  assert.equal(keyed.data[3], 0, 'backdrop keyed out');
  assert.equal(keyed.data[7], 255, 'subject opaque');
  assert.deepEqual([keyed.data[4], keyed.data[5], keyed.data[6]], [230, 180, 150], 'subject color untouched');
  const edgeAlpha = keyed.data[11];
  assert.ok(edgeAlpha < 255 && edgeAlpha > 0, 'edge pixel is semi-transparent');
  assert.ok(keyed.data[9] <= Math.max(keyed.data[8], keyed.data[10]), 'edge despilled: g <= max(r,b)');

  const bg = { width: 3, height: 1, data: new Uint8Array([10, 20, 200, 10, 20, 200, 10, 20, 200]) };
  const comp = compositeOver(keyed, bg);
  assert.deepEqual([comp.data[0], comp.data[1], comp.data[2]], [10, 20, 200], 'background shows through the keyed area');
  assert.deepEqual([comp.data[3], comp.data[4], comp.data[5]], [230, 180, 150], 'subject over background');

  const premul = premultiply(keyed);
  assert.equal(premul.data[7], 255);
  assert.equal(premul.data[4], 230, 'opaque pixels unchanged by premultiply');
  assert.equal(premul.data[3], 0, 'transparent pixels premultiply to black');
});

test('validation errors are explicit', () => {
  assert.throws(() => chromaAlpha([1, 2, 3], [100, 100, 100]), /no dominant channel/);
  assert.throws(() => chromaAlpha([1, 2, 3], GREEN, { similarity: 0 }), /similarity must be/);
  assert.throws(() => chromaKeyImage({ width: 1, height: 1, data: new Uint8Array(2) }, {}), /RGB or RGBA/);
  assert.throws(() => compositeOver(
    { width: 1, height: 1, data: new Uint8Array(4) },
    { width: 2, height: 1, data: new Uint8Array(6) }), /size mismatch/);
});
