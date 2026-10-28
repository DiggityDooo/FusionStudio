import test from 'node:test';
import assert from 'node:assert/strict';
import { directionToUV, uvToDirection, renderPointsEquirect, pixelDirection } from '../src/panorama.js';

function close(a, b, eps = 1e-9) { return a.every((v, i) => Math.abs(v - b[i]) < eps); }

test('cardinal directions land at their documented UV positions', () => {
  assert.ok(close(directionToUV([0, 0, -1]), [0.5, 0.5]), 'north at u=0.5, horizon v=0.5');
  assert.ok(close(directionToUV([1, 0, 0]), [0.75, 0.5]), 'east at u=0.75');
  assert.ok(close(directionToUV([0, 0, 1]), [0, 0.5]) || close(directionToUV([0, 0, 1]), [1, 0.5]), 'south wraps u');
  assert.ok(close(directionToUV([-1, 0, 0]), [0.25, 0.5]), 'west at u=0.25');
  assert.ok(close(directionToUV([0, 1, 0]), [0.5, 0]), 'zenith v=0');
  assert.ok(close(directionToUV([0, -1, 0]), [0.5, 1]), 'nadir v=1');
});

test('UV and direction round-trip across the sphere', () => {
  const dirs = [
    [0.3, 0.5, -0.8], [-0.9, -0.2, 0.4], [0.1, -0.95, 0.1], [5, 1, 5], [-0.001, 0.4, -1],
  ];
  for (const d of dirs) {
    const len = Math.hypot(...d);
    const unit = d.map((v) => v / len);
    const back = uvToDirection(...directionToUV(unit));
    assert.ok(close(back, unit, 1e-9), `${unit} -> ${back}`);
  }
  // And the inverse direction: sampled UVs map back.
  for (const [u, v] of [[0.13, 0.71], [0.97, 0.05], [0.5, 0.99]]) {
    const [u2, v2] = directionToUV(uvToDirection(u, v));
    assert.ok(Math.abs(u2 - u) < 1e-9 && Math.abs(v2 - v) < 1e-9, `uv ${u},${v}`);
  }
});

test('the reference renderer splats points at exact pixels with depth occlusion', () => {
  const img = renderPointsEquirect({
    width: 8, height: 4,
    points: [
      { position: [0, 0, -5], color: [255, 0, 0] },   // north, far
      { position: [0, 0, -2], color: [0, 255, 0] },   // north, near -> wins
      { position: [5, 0, 0], color: [0, 0, 255] },    // east
    ],
    background: [9, 9, 9],
  });
  const pixel = (px, py) => {
    const o = (py * img.width + px) * 3;
    return [img.data[o], img.data[o + 1], img.data[o + 2]];
  };
  // North maps to u 0.5 -> px 4; horizon v 0.5 -> py 2.
  assert.deepEqual(pixel(4, 2), [0, 255, 0], 'nearer green occludes farther red');
  assert.ok(Math.abs(img.depth[2 * 8 + 4] - 2) < 1e-9);
  assert.deepEqual(pixel(6, 2), [0, 0, 255], 'east at u 0.75 -> px 6');
  assert.deepEqual(pixel(0, 0), [9, 9, 9], 'background elsewhere');
  assert.equal(img.depth[0], Infinity);
  // pixelDirection agrees with where points land.
  const dir = pixelDirection(8, 4, 6, 2);
  const [u, v] = [(6 + 0.5) / 8, (2 + 0.5) / 4];
  assert.ok(close(dir, uvToDirection(u, v), 1e-12));
});

test('validation and seam behavior', () => {
  assert.throws(() => directionToUV([0, 0, 0]), /zero direction/);
  assert.throws(() => renderPointsEquirect({ width: 0 }), /positive integers/);
  // Continuity across the u seam: directions just either side of south.
  const a = directionToUV([0.001, 0, 1])[0];
  const b = directionToUV([-0.001, 0, 1])[0];
  assert.ok(Math.abs(a - b) < 0.01 || Math.abs(Math.abs(a - b) - 1) < 0.01, 'seam neighbors');
});
