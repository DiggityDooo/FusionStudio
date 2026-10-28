import test from 'node:test';
import assert from 'node:assert/strict';
import { createDriverSystem } from '../src/drivers.js';

test('drivers evaluate in dependency order regardless of declaration order', () => {
  const sys = createDriverSystem();
  sys.addProperty('jawOpen', 0.5);
  sys.addDriver('teethGap', 'jaw * 0.2');           // depends on driven 'jaw'
  sys.addDriver('jaw', 'jawOpen * 30');             // declared after its dependent
  sys.addDriver('browRaise', 'jawOpen > 0.3 ? 0.8 : 0.1');
  const values = sys.evaluate();
  assert.equal(values.get('jaw'), 15);
  assert.ok(Math.abs(values.get('teethGap') - 3) < 1e-12);
  assert.equal(values.get('browRaise'), 0.8);
  assert.deepEqual(sys.evaluationOrder(), ['jaw', 'teethGap', 'browRaise']);
  sys.setManual('jawOpen', 0.1);
  assert.equal(sys.get('browRaise'), 0.1, 'manual input re-drives the chain');
  assert.ok(Math.abs(sys.get('teethGap') - 0.6) < 1e-12);
});

test('a realistic rig: wheel rotation and suspension from travel', () => {
  const sys = createDriverSystem();
  sys.addProperty('travel', 0);
  sys.addProperty('wheelRadius', 0.33);
  sys.addDriver('wheelAngle', 'travel / wheelRadius * 57.2958');
  sys.addDriver('suspension', 'clamp(0.1 - travel * 0.001, 0.02, 0.1)');
  sys.setManual('travel', 10);
  assert.ok(Math.abs(sys.get('wheelAngle') - (10 / 0.33) * 57.2958) < 1e-9);
  assert.ok(Math.abs(sys.get('suspension') - 0.09) < 1e-12);
});

test('transient overrides feed expressions without becoming properties', () => {
  const sys = createDriverSystem();
  sys.addProperty('speed', 2);
  sys.addDriver('blur', 'speed * frame * 0.01');
  assert.ok(Math.abs(sys.get('blur', { frame: 24 }) - 0.48) < 1e-12);
  assert.throws(() => sys.get('frame'), /unknown variable 'frame'/, 'override did not persist as a property');
  assert.ok(Math.abs(sys.get('blur', { frame: 0 })) < 1e-12);
});

test('cycles, driven writes, and unknown variables are explicit errors', () => {
  const sys = createDriverSystem();
  sys.addDriver('a', 'b + 1');
  sys.addDriver('b', 'a + 1');
  assert.throws(() => sys.evaluate(), /cycle detected: a -> b -> a|b -> a -> b/);

  const sys2 = createDriverSystem();
  sys2.addProperty('x', 1);
  sys2.addDriver('y', 'x * 2');
  assert.throws(() => sys2.setManual('y', 5), /is driven by/);
  assert.throws(() => sys2.addProperty('y', 5), /is driven/);
  assert.equal(sys2.removeDriver('y'), true);
  sys2.setManual('y', 5);
  assert.equal(sys2.get('y'), 5);
  assert.equal(sys2.removeDriver('y'), false);

  const sys3 = createDriverSystem();
  sys3.addDriver('z', 'missing * 2');
  assert.throws(() => sys3.evaluate(), /unknown variable 'missing'/);
});

test('diamond dependencies evaluate once per pass and stay consistent', () => {
  const sys = createDriverSystem();
  sys.addProperty('base', 3);
  sys.addDriver('left', 'base * 2');
  sys.addDriver('right', 'base + 10');
  sys.addDriver('combined', 'left * right');
  assert.equal(sys.get('combined'), 6 * 13);
  sys.setManual('base', 1);
  assert.equal(sys.get('combined'), 2 * 11, 'both branches see the same base value');
});
