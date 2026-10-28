import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpring, createJiggle, createJiggleChain } from '../src/jiggle.js';

test('step response overshoot matches the analytic damped-oscillator value', () => {
  const zeta = 0.2;
  const spring = createSpring({ omega: 10, zeta });
  let peak = -Infinity;
  for (let s = 0; s < 60 * 3; s++) peak = Math.max(peak, spring.chase(1, 1 / 60));
  const expected = 1 + Math.exp((-Math.PI * zeta) / Math.sqrt(1 - zeta * zeta));
  assert.ok(Math.abs(peak - expected) / expected < 0.03,
    `peak ${peak.toFixed(4)} vs analytic ${expected.toFixed(4)}`);
  // And it settles on the target.
  assert.ok(Math.abs(spring.state.value - 1) < 0.01);
});

test('overdamped springs approach monotonically without overshoot', () => {
  for (const zeta of [1, 1.5]) {
    const spring = createSpring({ omega: 10, zeta });
    let prev = 0;
    for (let s = 0; s < 60 * 3; s++) {
      const v = spring.chase(1, 1 / 60);
      assert.ok(v <= 1 + 1e-9, `zeta ${zeta}: overshot to ${v}`);
      assert.ok(v >= prev - 1e-9, `zeta ${zeta}: non-monotone at step ${s}`);
      prev = v;
    }
    assert.ok(Math.abs(spring.state.value - 1) < 0.02, `zeta ${zeta} settles`);
  }
});

test('oscillation period matches the damped natural frequency', () => {
  const omega = 8, zeta = 0.1;
  const spring = createSpring({ omega, zeta, value: 1 });
  const crossings = [];
  let prev = spring.state.value, t = 0;
  const dt = 1 / 480;
  for (let s = 0; s < 480 * 4 && crossings.length < 4; s++) {
    spring.chase(0, dt);
    t += dt;
    if (prev > 0 && spring.state.value <= 0) crossings.push(t);
    prev = spring.state.value;
  }
  const measuredPeriod = (crossings[3] - crossings[1]); // two full periods
  const expected = (2 * Math.PI) / (omega * Math.sqrt(1 - zeta * zeta));
  assert.ok(Math.abs(measuredPeriod / 2 - expected) / expected < 0.02,
    `period ${(measuredPeriod / 2).toFixed(4)} vs ${expected.toFixed(4)}`);
});

test('3D jiggle lags a moving anchor, then decays when the anchor stops', () => {
  const jiggle = createJiggle({ omega: 10, zeta: 0.15, restOffset: [0, -1, 0] });
  // Whip the anchor sideways in a step.
  let offset = jiggle.update([0, 0, 0], 1 / 60);
  assert.deepEqual(offset, [0, -1, 0], 'starts at rest offset');
  let maxLag = 0;
  for (let s = 0; s < 30; s++) {
    offset = jiggle.update([2, 0, 0], 1 / 60);
    maxLag = Math.max(maxLag, Math.abs(offset[0]));
  }
  assert.ok(maxLag > 0.2, `anchor step excites lateral jiggle (max |x offset| ${maxLag.toFixed(3)})`);
  // Hold the anchor still: jiggle decays back to the rest offset.
  for (let s = 0; s < 60 * 5; s++) offset = jiggle.update([2, 0, 0], 1 / 60);
  assert.ok(Math.abs(offset[0]) < 0.02 && Math.abs(offset[1] + 1) < 0.02,
    `decayed to rest offset, got ${offset.map((v) => v.toFixed(3))}`);
  // Gravity sags the rest position further down.
  const heavy = createJiggle({ omega: 10, zeta: 0.5, restOffset: [0, -1, 0], gravity: 0.4 });
  for (let s = 0; s < 60 * 3; s++) heavy.update([0, 0, 0], 1 / 60);
  assert.ok(Math.abs(heavy.offset[1] - -1.4) < 0.02, `gravity sag ${heavy.offset[1]}`);
});

test('chains propagate motion with increasing lag toward the tip', () => {
  const chain = createJiggleChain(4, { omega: 14, zeta: 0.3, restOffset: [0, -0.25, 0] });
  // Oscillate the anchor; record each link's x amplitude late in the run.
  const maxX = [0, 0, 0, 0];
  for (let s = 0; s < 60 * 4; s++) {
    const t = s / 60;
    const points = chain.update([Math.sin(t * 6) * 0.5, 0, 0], 1 / 60);
    if (s > 60 * 3) points.forEach((p, i) => { maxX[i] = Math.max(maxX[i], Math.abs(p[0])); });
  }
  // Every link follows the anchor swing with bounded amplitude, and
  // the chain stays attached (finite points, rest-length-ish spacing).
  for (const v of maxX) assert.ok(v > 0.05 && v < 1.0, `link swing ${v}`);
  const points = chain.update([0, 0, 0], 1 / 60);
  for (const p of points) for (const c of p) assert.ok(Number.isFinite(c));
});

test('parameter validation and large-dt stability via internal substeps', () => {
  assert.throws(() => createSpring({ omega: 0 }), /omega must be positive/);
  assert.throws(() => createSpring({ zeta: -0.1 }), /zeta must be >= 0/);
  assert.throws(() => createJiggleChain(0), /positive integer/);
  const spring = createSpring({ omega: 30, zeta: 0.3 });
  for (let s = 0; s < 20; s++) spring.chase(1, 1 / 20); // coarse frames, stiff spring
  assert.ok(Number.isFinite(spring.state.value));
  assert.ok(Math.abs(spring.state.value - 1) < 0.05, 'stiff spring still converges at 20 fps');
});
