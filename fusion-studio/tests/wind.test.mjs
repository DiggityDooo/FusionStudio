import test from 'node:test';
import assert from 'node:assert/strict';
import { bendByWind, gustStrength } from '../src/wind.js';
import { interpretLSystem } from '../src/l-system.js';

function chain(n, step = 1) {
  return interpretLSystem('F'.repeat(n), { step, decay: 1 });
}
function tipOf(segments) { return segments[segments.length - 1].b; }
function lengthOf(s) { return Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]); }

test('uniform wind bends a straight stem onto the analytic circular arc', () => {
  const segments = chain(6, 1);
  const theta = 0.1; // per-joint angle: strength 1 * flexibility 0.1
  const bent = bendByWind(segments, { strength: 1, flexibility: theta, windDirection: [1, 0, 0] });
  // Independent arc oracle: direction after k joints is rotated by
  // (k+1)*theta from +Y toward +X; positions are partial sums.
  let expected = [0, 0, 0];
  for (let k = 0; k < 6; k++) {
    const a = (k + 1) * theta;
    expected = [expected[0] + Math.sin(a), expected[1] + Math.cos(a), expected[2]];
  }
  const tip = tipOf(bent);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(tip[i] - expected[i]) < 1e-9,
    `tip axis ${i}: ${tip[i]} vs arc ${expected[i]}`);
  // Root base is anchored and lengths are exact.
  assert.deepEqual(bent[0].a, [0, 0, 0]);
  for (let i = 0; i < 6; i++) assert.ok(Math.abs(lengthOf(bent[i]) - 1) < 1e-9);
});

test('zero wind is the identity; deflection grows monotonically with strength', () => {
  const segments = chain(5, 1);
  const still = bendByWind(segments, { strength: 0, flexibility: 0.2 });
  assert.deepEqual(still.map((s) => s.b), segments.map((s) => s.b));
  let prevX = -1;
  for (const strength of [0.2, 0.5, 1, 1.6]) {
    const bent = bendByWind(segments, { strength, flexibility: 0.15, windDirection: [1, 0, 0] });
    const tip = tipOf(bent);
    assert.ok(tip[0] > prevX, `tip x grows with strength (${tip[0]} > ${prevX})`);
    assert.ok(tip[1] < 5, 'tip drops as it bends');
    prevX = tip[0];
  }
  // Wind from -X bends the other way.
  const west = bendByWind(segments, { strength: 1, flexibility: 0.15, windDirection: [-1, 0, 0] });
  assert.ok(tipOf(west)[0] < 0);
});

test('branched plants bend coherently: connectivity and lengths survive', () => {
  const plant = interpretLSystem('F[+F][-F]F', { step: 1, angleDeg: 35, decay: 1 });
  const bent = bendByWind(plant, { strength: 0.9, flexibility: 0.1, windDirection: [1, 0, 0] });
  assert.equal(bent.length, plant.length);
  for (let i = 0; i < plant.length; i++) {
    assert.ok(Math.abs(lengthOf(bent[i]) - lengthOf(plant[i])) < 1e-9, `segment ${i} length preserved`);
    assert.equal(bent[i].depth, plant[i].depth);
  }
  // Connectivity: every non-root segment starts where its parent ends.
  const ends = new Set(bent.map((s) => s.b.map((v) => Math.round(v * 1e6)).join(',')));
  let connected = 0;
  for (const s of bent) {
    if (ends.has(s.a.map((v) => Math.round(v * 1e6)).join(','))) connected++;
  }
  assert.ok(connected >= bent.length - 1, 'the tree stays joined (only roots unmatched)');
  // Every endpoint shifts downwind relative to the unbent plant.
  for (let i = 0; i < plant.length; i++) {
    assert.ok(bent[i].b[0] > plant[i].b[0] + 0.05,
      `segment ${i} tip moved downwind (${plant[i].b[0].toFixed(2)} -> ${bent[i].b[0].toFixed(2)})`);
  }
});

test('gust field varies in space and time, deterministically', () => {
  const a = gustStrength([0, 0, 0], 1.0);
  assert.equal(a, gustStrength([0, 0, 0], 1.0), 'deterministic');
  const later = gustStrength([0, 0, 0], 2.5);
  assert.notEqual(a, later, 'time-varying');
  const downwind = gustStrength([8, 0, 0], 1.0);
  assert.notEqual(a, downwind, 'traveling wave varies along the wind');
  // Bending with the gust field animates: same plant, different pose per time.
  const plant = chain(5, 1);
  const t1 = bendByWind(plant, { time: 0.5, flexibility: 0.1 });
  const t2 = bendByWind(plant, { time: 3.0, flexibility: 0.1 });
  assert.notDeepEqual(tipOf(t1), tipOf(t2));
  for (const s of [...t1, ...t2]) assert.ok(Math.abs(lengthOf(s) - 1) < 1e-9);
});

test('validation: degenerate wind direction rejected', () => {
  assert.throws(() => bendByWind(chain(2), { windDirection: [0, 0, 0] }), /non-zero/);
});
