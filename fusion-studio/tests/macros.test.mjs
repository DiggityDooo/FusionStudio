import test from 'node:test';
import assert from 'node:assert/strict';
import { createMacro, macroFromJSON, concatMacros } from '../src/macros.js';

function makeRig() {
  // A tiny deterministic "scene": replay applies steps to it.
  return {
    scene: { objects: [], log: [] },
    executor() {
      return (name, params) => {
        if (name === 'addCube') this.scene.objects.push({ type: 'cube', size: params.size ?? 1 });
        else if (name === 'scaleAll') for (const o of this.scene.objects) o.size *= params.factor;
        else if (name === 'note') this.scene.log.push(params.text);
        else throw new Error(`no tool ${name}`);
        return this.scene.objects.length;
      };
    },
  };
}

test('record + replay reproduces the recorded history deterministically', () => {
  const rigA = makeRig();
  const macro = createMacro('demo');
  macro.record('addCube', { size: 2 });
  macro.record('addCube', { size: 3 });
  macro.record('scaleAll', { factor: 10 });
  macro.record('note', { text: 'done' });
  const counts = macro.replay(rigA.executor());
  assert.deepEqual(counts, [1, 2, 2, 2]);
  assert.deepEqual(rigA.scene.objects.map((o) => o.size), [20, 30]);
  assert.deepEqual(rigA.scene.log, ['done']);

  // Fresh rig, same macro -> identical scene.
  const rigB = makeRig();
  macro.replay(rigB.executor());
  assert.deepEqual(rigB.scene, rigA.scene);
});

test('recorded params are deep-cloned: later caller edits cannot rewrite history', () => {
  const macro = createMacro();
  const params = { size: 5, nested: { x: 1 } };
  macro.record('addCube', params);
  params.size = 999;
  params.nested.x = 999;
  assert.equal(macro.steps()[0].params.size, 5);
  assert.equal(macro.steps()[0].params.nested.x, 1);
});

test('history re-authoring: edit params, delete, reorder, truncate', () => {
  const macro = createMacro('edit-me');
  macro.record('addCube', { size: 1 });
  macro.record('addCube', { size: 2 });
  macro.record('scaleAll', { factor: 2 });
  macro.setParams(2, { factor: 100 });
  const rig = makeRig();
  macro.replay(rig.executor());
  assert.deepEqual(rig.scene.objects.map((o) => o.size), [100, 200]);

  macro.deleteStep(0);
  const rig2 = makeRig();
  macro.replay(rig2.executor());
  assert.deepEqual(rig2.scene.objects.map((o) => o.size), [200]);

  // Reorder: scale before adding the second cube.
  const macro2 = createMacro();
  macro2.record('addCube', { size: 1 });
  macro2.record('addCube', { size: 2 });
  macro2.record('scaleAll', { factor: 10 });
  macro2.moveStep(2, 1);
  const rig3 = makeRig();
  macro2.replay(rig3.executor());
  assert.deepEqual(rig3.scene.objects.map((o) => o.size), [10, 2]);

  macro2.truncate(1);
  assert.equal(macro2.length(), 1);
  assert.throws(() => macro.setParams(99, {}), /no step/);
  assert.throws(() => macro.deleteStep(99), /no step/);
});

test('replay overrides: by index and by tool name; ranged replay', () => {
  const macro = createMacro();
  macro.record('addCube', { size: 1 });
  macro.record('addCube', { size: 1 });
  macro.record('scaleAll', { factor: 2 });

  const rig = makeRig();
  macro.replay(rig.executor(), { overrides: { 0: { size: 7 }, scaleAll: { factor: 5 } } });
  assert.deepEqual(rig.scene.objects.map((o) => o.size), [35, 5]);

  const rig2 = makeRig();
  macro.replay(rig2.executor(), { from: 1, to: 2 });
  assert.deepEqual(rig2.scene.objects.map((o) => o.size), [1], 'range replay runs only those steps');
});

test('executor errors are tagged with the failing step and stop replay', () => {
  const macro = createMacro();
  macro.record('addCube', { size: 1 });
  macro.record('explodeEverything', {});
  macro.record('addCube', { size: 1 });
  const rig = makeRig();
  assert.throws(
    () => macro.replay(rig.executor()),
    (err) => err.stepIndex === 1 && err.stepName === 'explodeEverything',
  );
  assert.equal(rig.scene.objects.length, 1, 'steps after the failure never ran');
});

test('JSON round-trip, concatenation, and validation', () => {
  const macro = createMacro('saved');
  macro.record('addCube', { size: 4 });
  macro.record('note', { text: 'hi' });
  const restored = macroFromJSON(JSON.parse(JSON.stringify(macro.toJSON())));
  assert.deepEqual(restored.steps(), macro.steps());
  assert.equal(restored.name, 'saved');

  const other = createMacro('other');
  other.record('scaleAll', { factor: 3 });
  const combined = concatMacros([restored, other], 'combo');
  assert.deepEqual(combined.steps().map((s) => s.name), ['addCube', 'note', 'scaleAll']);
  const rig = makeRig();
  combined.replay(rig.executor());
  assert.deepEqual(rig.scene.objects.map((o) => o.size), [12]);

  assert.throws(() => macroFromJSON({ kind: 'something-else' }), /fusion-macro/);
  assert.throws(() => createMacro().record('', {}), /non-empty name/);
  assert.throws(() => createMacro().record('x', 42), /params must be an object/);
});
