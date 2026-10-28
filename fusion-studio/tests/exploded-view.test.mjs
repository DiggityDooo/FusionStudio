import test from 'node:test';
import assert from 'node:assert/strict';
import { explodedView, explodedAt } from '../src/exploded-view.js';

const PARTS = [
  { name: 'base', center: [0, 0, 0] },
  { name: 'right', center: [3, 0, 0] },
  { name: 'top', center: [0, 4, 0] },
  { name: 'diag', center: [3, 4, 0] },
];
const ORIGIN = [0, 0, 0];

function byName(result) { return Object.fromEntries(result.map((r) => [r.name, r])); }

test('factor 0 is assembled; radial explosion scales distances linearly', () => {
  const assembled = byName(explodedView(PARTS, { factor: 0, origin: ORIGIN }));
  for (const p of PARTS) assert.deepEqual(assembled[p.name].position, p.center);
  const exploded = byName(explodedView(PARTS, { factor: 1, origin: ORIGIN }));
  assert.deepEqual(exploded.right.position, [6, 0, 0], 'distance doubles at factor 1');
  assert.deepEqual(exploded.top.position, [0, 8, 0]);
  const diag = exploded.diag.position;
  assert.ok(Math.abs(Math.hypot(diag[0], diag[1]) - 10) < 1e-9, '5-length diagonal -> 10');
  assert.ok(Math.abs(diag[0] / diag[1] - 0.75) < 1e-9, 'direction preserved');
  assert.deepEqual(exploded.base.offset, [0, 0, 0], 'part at the origin has no direction and stays');
  // Halfway interpolation is exactly halfway.
  const half = byName(explodedAt(PARTS, { factor: 1, origin: ORIGIN }, 0.5));
  assert.deepEqual(half.right.position, [4.5, 0, 0]);
});

test('default origin is the parts centroid', () => {
  const result = explodedView([{ name: 'a', center: [0, 0, 0] }, { name: 'b', center: [4, 0, 0] }], { factor: 1 });
  const r = byName(result);
  assert.deepEqual(r.a.position, [-2, 0, 0], 'centroid at x=2: a pushed to -2');
  assert.deepEqual(r.b.position, [6, 0, 0]);
});

test('axis mode separates parts along the axis by their depth order', () => {
  const parts = [
    { name: 'low', center: [5, 1, 0] },
    { name: 'mid', center: [-2, 2, 0] },
    { name: 'high', center: [0, 3, 0] },
  ];
  const r = byName(explodedView(parts, { factor: 2, mode: 'axis', axis: [0, 1, 0], origin: [0, 0, 0] }));
  assert.deepEqual(r.low.position, [5, 3, 0], 'y=1 -> +2');
  assert.deepEqual(r.mid.position, [-2, 6, 0], 'y=2 -> +4');
  assert.deepEqual(r.high.position, [0, 9, 0], 'y=3 -> +6');
  // Lateral positions untouched; ordering preserved and gaps grow.
  assert.ok(r.low.position[1] < r.mid.position[1] && r.mid.position[1] < r.high.position[1]);
});

test('groups separate first, then parts within their group', () => {
  const parts = [
    { name: 'g1a', center: [4, 0, 0], group: 'g1' },
    { name: 'g1b', center: [6, 0, 0], group: 'g1' },
    { name: 'solo', center: [-5, 0, 0] },
  ];
  // groupFactor 0 freezes group separation: only local spread applies.
  const localOnly = byName(explodedView(parts, { factor: 1, groupFactor: 0, origin: ORIGIN }));
  assert.deepEqual(localOnly.g1a.position, [3, 0, 0], 'group center x=5: a moves -1 locally');
  assert.deepEqual(localOnly.g1b.position, [7, 0, 0]);
  // Full: position = center + groupOffset (+5) + localOffset (-+1).
  const full = byName(explodedView(parts, { factor: 1, origin: ORIGIN }));
  assert.deepEqual(full.g1a.position, [8, 0, 0]);
  assert.deepEqual(full.g1b.position, [12, 0, 0]);
  assert.deepEqual(full.solo.position, [-10, 0, 0], 'ungrouped part explodes from the origin directly');
  const gapBefore = 2, gapAfter = full.g1b.position[0] - full.g1a.position[0];
  assert.equal(gapAfter, gapBefore * 2, 'within-group spacing doubles');
});

test('custom directions are honored and normalized', () => {
  const parts = [
    { name: 'lid', center: [0, 1, 0], direction: [0, 10, 0] },
    { name: 'drawer', center: [0, 0, 1], direction: [0, 0, 1] },
  ];
  const r = byName(explodedView(parts, { factor: 0.5, mode: 'custom', origin: ORIGIN }));
  assert.deepEqual(r.lid.offset, [0, 0.5, 0], 'direction normalized; distance 1 * factor');
  assert.deepEqual(r.drawer.position, [0, 0, 1.5]);
  assert.throws(() => explodedView([{ name: 'x', center: [0, 0, 0] }], { mode: 'custom' }), /needs a direction/);
  assert.throws(() => explodedView(PARTS, { mode: 'spiral' }), /unknown mode/);
  assert.throws(() => explodedView([], {}), /at least one part/);
});
