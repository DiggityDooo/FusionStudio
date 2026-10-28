import test from 'node:test';
import assert from 'node:assert/strict';
import { createNodeGraph } from '../src/node-graph.js';

test('a procedural bounce graph evaluates exactly', () => {
  // height = mix(0.2, 2.0, abs(sin(t * 3))) clamped to [0, 1.5]
  const g = createNodeGraph();
  const t = g.addNode('const', { value: 0.5 });
  const speed = g.addNode('const', { value: 3 });
  const phase = g.addNode('mul');
  g.connect(t, 'out', phase, 'a');
  g.connect(speed, 'out', phase, 'b');
  const wave = g.addNode('expression', { source: 'abs(sin(phase))' });
  g.connect(phase, 'out', wave, 'phase');
  const height = g.addNode('mix');
  const lo = g.addNode('const', { value: 0.2 });
  const hi = g.addNode('const', { value: 2.0 });
  g.connect(lo, 'out', height, 'a');
  g.connect(hi, 'out', height, 'b');
  g.connect(wave, 'out', height, 't');
  const clamped = g.addNode('clamp');
  const cap = g.addNode('const', { value: 1.5 });
  g.connect(height, 'out', clamped, 'x');
  g.connect(cap, 'out', clamped, 'hi');

  const expected = Math.min(1.5, 0.2 + 1.8 * Math.abs(Math.sin(1.5)));
  assert.ok(Math.abs(g.output(clamped) - expected) < 1e-12);
});

test('diamond dependencies evaluate once per evaluate() call (memoized)', () => {
  const g = createNodeGraph();
  let evaluations = 0;
  g.defineType('counted', {
    params: { value: 0 },
    outputs: ['out'],
    evaluate: (inputs, params) => { evaluations++; return { out: params.value }; },
  });
  const src = g.addNode('counted', { value: 2 });
  const left = g.addNode('mul');
  const right = g.addNode('add');
  g.connect(src, 'out', left, 'a');
  g.connect(src, 'out', left, 'b');
  g.connect(src, 'out', right, 'a');
  g.connect(src, 'out', right, 'b');
  const sum = g.addNode('add');
  g.connect(left, 'out', sum, 'a');
  g.connect(right, 'out', sum, 'b');
  assert.equal(g.output(sum), 4 + 4);
  assert.equal(evaluations, 1, 'shared upstream node computed once');
  g.evaluate();
  assert.equal(evaluations, 2, 'a fresh evaluate() recomputes');
});

test('unconnected inputs fall back to socket defaults; relinking replaces', () => {
  const g = createNodeGraph();
  const add = g.addNode('add');
  const five = g.addNode('const', { value: 5 });
  g.connect(five, 'out', add, 'a');
  assert.equal(g.output(add), 5, 'b defaults to 0');
  const seven = g.addNode('const', { value: 7 });
  g.connect(seven, 'out', add, 'a');
  assert.equal(g.output(add), 7, 'second link to the same input wins');
  const m = g.addNode('mix');
  assert.equal(g.output(m), 0, 'all defaults: mix(0, 1, 0)');
});

test('cycles are detected and reported with their path', () => {
  const g = createNodeGraph();
  const a = g.addNode('add');
  const b = g.addNode('add');
  g.connect(a, 'out', b, 'a');
  g.connect(b, 'out', a, 'a');
  assert.throws(() => g.evaluate(), /cycle detected: n\d+ -> n\d+ -> n\d+/);
});

test('custom node types, params, and select logic compose', () => {
  const g = createNodeGraph();
  g.defineType('remap', {
    inputs: { x: 0 },
    params: { inLo: 0, inHi: 1, outLo: 0, outHi: 1 },
    outputs: ['out'],
    evaluate: (i, p) => ({ out: p.outLo + (p.outHi - p.outLo) * ((i.x - p.inLo) / (p.inHi - p.inLo)) }),
  });
  const src = g.addNode('const', { value: 15 });
  const remapped = g.addNode('remap', { inLo: 10, inHi: 20, outLo: 0, outHi: 100 });
  g.connect(src, 'out', remapped, 'x');
  assert.equal(g.output(remapped), 50);
  g.setParam(remapped, 'outHi', 200);
  assert.equal(g.output(remapped), 100, 'param edits take effect on re-evaluation');

  const gate = g.addNode('select');
  const on = g.addNode('const', { value: 1 });
  const yes = g.addNode('const', { value: 'yes' });
  const no = g.addNode('const', { value: 'no' });
  g.connect(on, 'out', gate, 'cond');
  g.connect(yes, 'out', gate, 'a');
  g.connect(no, 'out', gate, 'b');
  assert.equal(g.output(gate), 'yes');
});

test('graph validation errors are explicit', () => {
  const g = createNodeGraph();
  assert.throws(() => g.addNode('nope'), /unknown node type/);
  const a = g.addNode('add');
  const c = g.addNode('const', { value: 1 });
  assert.throws(() => g.connect(c, 'bogus', a, 'a'), /has no output 'bogus'/);
  assert.throws(() => g.connect(c, 'out', a, 'bogus'), /has no input 'bogus'/);
  assert.throws(() => g.setParam(a, 'bogus', 1), /has no param/);
  assert.throws(() => g.connect(c, 'out', 'ghost', 'a'), /no node 'ghost'/);

  g.defineType('broken', { outputs: ['out'], evaluate: () => ({}) });
  const broken = g.addNode('broken');
  assert.throws(() => g.output(broken), /did not produce 'out'/);
});
