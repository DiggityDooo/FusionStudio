import test from 'node:test';
import assert from 'node:assert/strict';
import { hydraulicErosion, thermalErosion, totalVariation } from '../src/terrain-erosion.js';

function grid(res, fn) {
  const h = new Float32Array(res * res);
  for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) h[y * res + x] = fn(x, y);
  return h;
}
const sum = (h) => h.reduce((s, v) => s + v, 0);

test('hydraulic erosion leaves a flat plain exactly untouched', () => {
  const h = grid(16, () => 2.5);
  const before = Float32Array.from(h);
  const audit = hydraulicErosion(h, 16, { droplets: 500, seed: 3 });
  // On a plain the gradient is zero; droplets wander but dh = 0 everywhere,
  // so they can only deposit what they carry -- and they carry nothing.
  assert.equal(audit.eroded, 0);
  for (let i = 0; i < h.length; i++) assert.equal(h[i], before[i]);
});

test('droplet erosion lowers peaks, smooths, and balances its sediment audit', () => {
  const res = 32;
  const h = grid(res, (x, y) => {
    const dx = x - 16, dy = y - 16;
    return 5 * Math.exp(-(dx * dx + dy * dy) / 40) + 0.02 * x;
  });
  const peakBefore = Math.max(...h);
  const tvBefore = totalVariation(h, res);
  const sumBefore = sum(h);
  const audit = hydraulicErosion(h, res, { droplets: 3000, seed: 7 });
  assert.ok(audit.eroded > 0, 'material was eroded');
  assert.ok(Math.max(...h) < peakBefore, `peak ${peakBefore} -> ${Math.max(...h)}`);
  // Stability envelope: an earlier uncapped-capacity version of this solver
  // exploded to 1e24 via spike/pit feedback at these settings.
  assert.ok(Math.min(...h) > -0.5, `no pit explosion: min ${Math.min(...h)}`);
  assert.ok(totalVariation(h, res) < tvBefore, 'terrain got smoother');
  // Audit identity: net height change = deposited - eroded, and the
  // difference eroded - deposited is exactly what left the map.
  const net = sum(h) - sumBefore;
  assert.ok(Math.abs(net - (audit.deposited - audit.eroded)) < 1e-3, `net ${net}`);
  assert.ok(Math.abs((audit.eroded - audit.deposited) - audit.exported) < 1e-3,
    `exported ${audit.exported} vs balance ${audit.eroded - audit.deposited}`);
  assert.ok(net <= 1e-6, 'erosion never creates net material');
});

test('hydraulic erosion is deterministic per seed', () => {
  const mk = () => grid(16, (x, y) => Math.sin(x * 0.4) * Math.cos(y * 0.3) + 2);
  const a = mk(), b = mk();
  hydraulicErosion(a, 16, { droplets: 300, seed: 11 });
  hydraulicErosion(b, 16, { droplets: 300, seed: 11 });
  assert.deepEqual(a, b);
});

test('thermal erosion enforces the talus slope and conserves material', () => {
  const res = 16;
  // A cliff: west half high, east half low.
  const h = grid(res, (x) => (x < 8 ? 4 : 0));
  const sumBefore = sum(h);
  thermalErosion(h, res, { talus: 0.25, maxIterations: 500 });
  let maxSlope = 0;
  for (let y = 0; y < res; y++) for (let x = 0; x < res - 1; x++) {
    maxSlope = Math.max(maxSlope, Math.abs(h[y * res + x + 1] - h[y * res + x]));
  }
  assert.ok(maxSlope <= 0.25 + 1e-3, `max slope ${maxSlope}`);
  assert.ok(Math.abs(sum(h) - sumBefore) < 1e-4, 'thermal moves, never creates');
  // The cliff became a ramp: mid columns hold intermediate heights.
  assert.ok(h[4 * res + 8] > 0.1 && h[4 * res + 8] < 3.9, 'ramp formed');
});

test('thermal erosion leaves a gentle slope untouched', () => {
  const h = grid(8, (x) => x * 0.1); // slope 0.1 < talus 0.5 everywhere
  const before = Float32Array.from(h);
  thermalErosion(h, 8, { talus: 0.5 });
  assert.deepEqual(h, before);
});
