import test from 'node:test';
import assert from 'node:assert/strict';
import { compileExpression, evaluateExpression, parseExpression } from '../src/expressions.js';

test('precedence and associativity follow math conventions', () => {
  assert.equal(evaluateExpression('2 + 3 * 4'), 14);
  assert.equal(evaluateExpression('(2 + 3) * 4'), 20);
  assert.equal(evaluateExpression('2 ^ 3 ^ 2'), 512, 'power is right-associative');
  assert.equal(evaluateExpression('-2 ^ 2'), -4, 'python-style: power binds tighter than unary minus');
  assert.equal(evaluateExpression('2 ^ -2'), 0.25);
  assert.equal(evaluateExpression('10 % 3'), 1);
  assert.equal(evaluateExpression('7 / 2'), 3.5);
  assert.equal(evaluateExpression('1e3 + 2.5e-1'), 1000.25);
  assert.equal(evaluateExpression('- -5'), 5);
});

test('variables, constants, and dependency extraction', () => {
  const compiled = compileExpression('a * 2 + sin(b) - frame / 24');
  assert.deepEqual(compiled.variables, ['a', 'b', 'frame']);
  assert.ok(Math.abs(compiled.evaluate({ a: 3, b: Math.PI / 2, frame: 48 }) - (6 + 1 - 2)) < 1e-12);
  assert.ok(Math.abs(evaluateExpression('pi * r ^ 2', { r: 1 }) - Math.PI) < 1e-12);
  assert.equal(evaluateExpression('tau / 4'), Math.PI / 2);
  // Re-evaluation against new contexts reuses the parse.
  assert.equal(compiled.evaluate({ a: 0, b: 0, frame: 0 }), 0);
});

test('builtins: interpolation, clamping, smoothing', () => {
  assert.equal(evaluateExpression('clamp(15, 0, 10)'), 10);
  assert.equal(evaluateExpression('clamp(-3, 0, 10)'), 0);
  assert.equal(evaluateExpression('mix(10, 20, 0.25)'), 12.5);
  assert.equal(evaluateExpression('smoothstep(0, 10, 5)'), 0.5);
  assert.equal(evaluateExpression('smoothstep(0, 10, -1)'), 0);
  assert.equal(evaluateExpression('min(4, 2, 8)'), 2);
  assert.equal(evaluateExpression('max(4, 2, 8)'), 8);
  assert.equal(evaluateExpression('step(0.5, 0.4)'), 0);
  assert.equal(evaluateExpression('step(0.5, 0.6)'), 1);
  assert.ok(Math.abs(evaluateExpression('atan2(1, 1)') - Math.PI / 4) < 1e-12);
  assert.equal(evaluateExpression('fract(2.75)'), 0.75);
});

test('comparisons, logic, and ternary drive conditional parameters', () => {
  assert.equal(evaluateExpression('speed > 3 ? 10 : 1', { speed: 5 }), 10);
  assert.equal(evaluateExpression('speed > 3 ? 10 : 1', { speed: 2 }), 1);
  assert.equal(evaluateExpression('a >= 2 && b < 5', { a: 2, b: 4 }), true);
  assert.equal(evaluateExpression('a >= 2 && b < 5', { a: 1, b: 4 }), false);
  assert.equal(evaluateExpression('!flag', { flag: false }), true);
  assert.equal(evaluateExpression('mode == 2 || mode == 3', { mode: 3 }), true);
  // Nested ternary associates to the right.
  assert.equal(evaluateExpression('x < 0 ? -1 : x > 0 ? 1 : 0', { x: 0 }), 0);
  assert.equal(evaluateExpression('x < 0 ? -1 : x > 0 ? 1 : 0', { x: 7 }), 1);
});

test('a realistic driver expression evaluates per frame', () => {
  // Wheel rotation from travel distance, plus a wobble gated by speed.
  const driver = compileExpression('dist / radius * 57.2958 + (speed > 0.1 ? sin(frame * 0.5) * 2 : 0)');
  const v = driver.evaluate({ dist: 10, radius: 0.5, speed: 1, frame: 3 });
  assert.ok(Math.abs(v - (20 * 57.2958 + Math.sin(1.5) * 2)) < 1e-9);
  const still = driver.evaluate({ dist: 10, radius: 0.5, speed: 0, frame: 3 });
  assert.ok(Math.abs(still - 20 * 57.2958) < 1e-9, 'gate closes at rest');
});

test('errors are explicit: unknown names, bad syntax, no code execution', () => {
  assert.throws(() => evaluateExpression('nope + 1'), /unknown variable 'nope'/);
  assert.throws(() => evaluateExpression('nosuchfn(1)'), /unknown function/);
  assert.throws(() => evaluateExpression('1 +'), /unexpected token/);
  assert.throws(() => evaluateExpression('(1 + 2'), /expected '\)'/);
  assert.throws(() => evaluateExpression('1 2'), /trailing input/);
  assert.throws(() => evaluateExpression('a.b', { a: { b: 1 } }), Error, 'no member access / code execution');
  assert.throws(() => parseExpression('x @ 2'), /unexpected character/);
});

test('IEEE edge semantics are the documented behavior', () => {
  assert.equal(evaluateExpression('1 / 0'), Infinity);
  assert.ok(Number.isNaN(evaluateExpression('sqrt(-1)')));
  assert.equal(evaluateExpression('0 / 0 == 0 / 0'), false, 'NaN comparisons follow IEEE via JS');
});
