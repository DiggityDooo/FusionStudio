import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRule, applyRuleParallel, derive, findMatches, kochRule,
  shapeLength, squareSubdivisionRule,
} from '../src/shape-grammar.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('Koch derivation multiplies segments and length by 4/3 per level', () => {
  const initial = [[[0, 0], [3, 0]]];
  const level1 = applyRuleParallel(initial, kochRule());
  assert.equal(level1.shape.length, 4);
  assert.ok(near(shapeLength(level1.shape), 4, 1e-9), `length ${shapeLength(level1.shape)}`);
  const level2 = applyRuleParallel(level1.shape, kochRule());
  assert.equal(level2.shape.length, 16);
  assert.ok(near(shapeLength(level2.shape), 16 / 3, 1e-9));
  // Endpoints of the whole curve are preserved.
  const xs = level2.shape.flatMap((s) => s.map((p) => p[0]));
  assert.ok(near(Math.min(...xs), 0, 1e-9) && near(Math.max(...xs), 3, 1e-9));
  // The bump rises above the baseline.
  const ys = level2.shape.flatMap((s) => s.map((p) => p[1]));
  assert.ok(Math.max(...ys) > 0.8);
});

test('square subdivision recurses into the four sub-squares', () => {
  const initial = [[[0, 0], [1, 0]], [[1, 0], [1, 1]], [[1, 1], [0, 1]], [[0, 1], [0, 0]]];
  const once = applyRuleParallel(initial, squareSubdivisionRule());
  assert.equal(once.shape.length, 12, `segments ${once.shape.length}`);
  assert.ok(near(shapeLength(once.shape), 6, 1e-9));
  const twice = applyRuleParallel(once.shape, squareSubdivisionRule());
  assert.equal(twice.applied, 4, 'all four sub-squares matched');
  assert.equal(twice.shape.length, 40, `segments ${twice.shape.length}`);
  assert.ok(near(shapeLength(twice.shape), 10, 1e-9));
});

test('matching honours rotation, scale and reflection', () => {
  // Unequal arms (4 and 2) make the corner's chirality meaningful.
  const shape = [[[0, 0], [4, 0]], [[4, 0], [4, 2]]]; // CCW corner, arms 4 + 2
  const ccw = [[[0, 0], [2, 0]], [[2, 0], [2, 1]]]; // same chirality, half scale
  assert.ok(findMatches(shape, ccw, { allowMirror: false }).length >= 1, 'rotated/scaled match');
  const cw = [[[0, 0], [2, 0]], [[2, 0], [2, -1]]]; // opposite chirality
  assert.equal(findMatches(shape, cw, { allowMirror: false }).length, 0, 'mirror rejected when off');
  assert.ok(findMatches(shape, cw, { allowMirror: true }).length >= 1, 'mirror match allowed');
});

test('derive is deterministic, bounded, and reports no-match', () => {
  const initial = [[[0, 0], [1, 0]]];
  const a = derive(initial, [kochRule()], { steps: 3 });
  const b = derive(initial, [kochRule()], { steps: 3 });
  assert.deepEqual(a.shape, b.shape);
  assert.equal(a.applied, 3);
  const triangle = { lhs: [[[0, 0], [1, 0]], [[1, 0], [0.5, 1]], [[0.5, 1], [0, 0]]], rhs: [[[0, 0], [1, 0]]] };
  const none = derive(initial, [triangle], { steps: 4 });
  assert.equal(none.applied, 0);
  assert.deepEqual(none.shape, initial);
  assert.equal(applyRule(initial, triangle), null);
});
