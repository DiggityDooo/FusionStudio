import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldVector, combinedFieldVector, fieldDivergence } from '../src/force-fields.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mag = (a) => Math.hypot(a[0], a[1], a[2]);

test('gravity and wind are exact directional fields', () => {
  assert.deepEqual(fieldVector({ type: 'gravity', direction: [0, -2, 0], strength: 5 }, [3, 4, 5]), [0, -5, 0]);
  const gust = { type: 'wind', direction: [2, 0, 0], strength: 4, gustAmount: 0.5, gustFrequency: 0.25 };
  // sin(2*pi*0.25*t) = 1 at t = 1: strength * 1.5.
  const v = fieldVector(gust, [0, 0, 0], 1);
  assert.ok(Math.abs(v[0] - 6) < 1e-12 && v[1] === 0 && v[2] === 0, `gust ${v}`);
  const calm = fieldVector(gust, [0, 0, 0], 0);
  assert.ok(Math.abs(calm[0] - 4) < 1e-12, 'no gust at t=0');
});

test('vortex is tangential with peak speed at the core radius', () => {
  const vortex = { type: 'vortex', center: [0, 0, 0], axis: [0, 1, 0], strength: 3, core: 0.5 };
  const atCore = fieldVector(vortex, [0.5, 0, 0]);
  assert.ok(Math.abs(dot(atCore, [1, 0, 0])) < 1e-12, 'perpendicular to radius');
  assert.ok(Math.abs(dot(atCore, [0, 1, 0])) < 1e-12, 'perpendicular to axis');
  assert.ok(atCore[2] !== 0, 'tangential component present');
  // |F| = strength * r / (r^2 + core^2): at r = core this is strength/(2*core) = 3.
  assert.ok(Math.abs(mag(atCore) - 3) < 1e-9, `core speed ${mag(atCore)}`);
  const inner = mag(fieldVector(vortex, [0.25, 0, 0]));
  const outer = mag(fieldVector(vortex, [1.0, 0, 0]));
  assert.ok(inner < mag(atCore) && outer < mag(atCore), 'core is the peak');
  assert.ok(Math.abs(inner - outer) < 1e-9, 'log-symmetric falloff');
});

test('attractor is inverse-square toward its center', () => {
  const att = { type: 'attractor', center: [0, 0, 0], strength: 8, softening: 0 };
  const near = fieldVector(att, [1, 0, 0]);
  const far = fieldVector(att, [2, 0, 0]);
  assert.ok(near[0] < 0, 'pulls toward center');
  assert.ok(Math.abs(mag(near) / mag(far) - 4) < 1e-9, 'inverse-square ratio');
  assert.deepEqual(fieldVector(att, [0, 0, 0]), [0, 0, 0], 'singular point is safe');
  const repel = fieldVector({ ...att, strength: -8 }, [1, 0, 0]);
  assert.ok(repel[0] > 0, 'negative strength repels');
});

test('radial field has constant magnitude', () => {
  const radial = { type: 'radial', center: [1, 1, 1], strength: 2.5 };
  assert.ok(Math.abs(mag(fieldVector(radial, [2, 1, 1])) - 2.5) < 1e-12);
  assert.ok(Math.abs(mag(fieldVector(radial, [1, 5, 1])) - 2.5) < 1e-12);
});

test('curl noise is divergence-free, deterministic, and seed-dependent', () => {
  const field = { type: 'curlNoise', scale: 0.6, seed: 42, strength: 1.5 };
  let maxDiv = 0, maxMag = 0;
  for (const p of [[0, 0, 0], [1.3, -2.1, 0.7], [-4, 3, 2], [10, 10, -5]]) {
    maxDiv = Math.max(maxDiv, Math.abs(fieldDivergence(field, p)));
    maxMag = Math.max(maxMag, mag(fieldVector(field, p)));
  }
  assert.ok(maxMag > 0.1, `field is alive: ${maxMag}`);
  // Finite-difference curl: measured divergence converges to ~3e-5 as the
  // sampling step shrinks (probe-verified); at the default step it is 8.7e-4.
  assert.ok(maxDiv < 2e-3, `divergence ${maxDiv}`);
  assert.ok(maxDiv / maxMag < 5e-4, 'divergence is negligible relative to field strength');
  const a = fieldVector(field, [1, 2, 3]);
  assert.deepEqual(fieldVector(field, [1, 2, 3]), a, 'deterministic');
  const b = fieldVector({ ...field, seed: 43 }, [1, 2, 3]);
  assert.notDeepEqual(b, a, 'seed changes the field');
});

test('fields combine by superposition; unknown types throw', () => {
  const fields = [
    { type: 'gravity', direction: [0, -1, 0], strength: 9.81 },
    { type: 'wind', direction: [1, 0, 0], strength: 2 },
  ];
  assert.deepEqual(combinedFieldVector(fields, [5, 5, 5]), [2, -9.81, 0]);
  assert.throws(() => fieldVector({ type: 'nope' }, [0, 0, 0]), /unknown field type/);
});
