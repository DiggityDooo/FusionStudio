import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameGraph } from '../src/frame-graph.js';

function standardGraph() {
  const g = createFrameGraph();
  g.addPass('shadow', { writes: ['shadowMap'] });
  g.addPass('gbuffer', { writes: ['albedo', 'normal', 'depth'] });
  g.addPass('lighting', { reads: ['albedo', 'normal', 'depth', 'shadowMap'], writes: ['hdr'] });
  g.addPass('bloom', { reads: ['hdr'], writes: ['bloomTex'] });
  g.addPass('tonemap', { reads: ['hdr', 'bloomTex'], writes: ['backbuffer'], sideEffect: true });
  return g;
}

test('compilation orders producers before consumers', () => {
  const { order, culled } = standardGraph().compile();
  assert.deepEqual(culled, []);
  const pos = Object.fromEntries(order.map((n, i) => [n, i]));
  assert.ok(pos.shadow < pos.lighting);
  assert.ok(pos.gbuffer < pos.lighting);
  assert.ok(pos.lighting < pos.bloom && pos.lighting < pos.tonemap);
  assert.ok(pos.bloom < pos.tonemap);
  assert.equal(order[order.length - 1], 'tonemap');
});

test('unused passes are culled transitively; side-effect passes survive', () => {
  const g = standardGraph();
  g.addPass('debugNormals', { reads: ['normal'], writes: ['debugTex'] });
  g.addPass('debugBlur', { reads: ['debugTex'], writes: ['debugBlurred'] });
  g.addPass('screenshot', { reads: ['backbuffer'], sideEffect: true });
  const { order, culled } = g.compile();
  assert.deepEqual(culled.sort(), ['debugBlur', 'debugNormals'], 'the whole dead chain is culled');
  assert.ok(order.includes('screenshot'), 'declared side effect keeps a consumer-less pass');
  assert.ok(!order.includes('debugNormals'));
});

test('resource lifetimes and transient slot aliasing are exact', () => {
  const { resources, slots, slotCount } = standardGraph().compile();
  // Order is declaration-stable here, so positions are known.
  assert.deepEqual(resources.shadowMap.writers, ['shadow']);
  assert.deepEqual(resources.hdr.readers.sort(), ['bloom', 'tonemap']);
  assert.ok(resources.albedo.firstUse < resources.albedo.lastUse);
  // shadowMap dies at lighting; bloomTex is born after: disjoint
  // lifetimes may share a slot. albedo/normal/depth overlap -> distinct.
  const trio = [slots.albedo, slots.normal, slots.depth];
  assert.equal(new Set(trio).size, 3, 'simultaneously-live resources get distinct slots');
  assert.ok(slotCount < Object.keys(slots).length, 'aliasing actually reuses memory');
  assert.equal(slots.backbuffer !== undefined, true, 'final resource still gets a transient slot unless external');
});

test('external inputs satisfy reads and receive no transient slot', () => {
  const g = createFrameGraph();
  g.addPass('composite', { reads: ['cameraColor', 'hud'], writes: ['backbuffer'], sideEffect: true });
  const { resources, slots } = g.compile({ external: ['cameraColor', 'hud'] });
  assert.equal(resources.cameraColor.firstUse, -1);
  assert.equal(slots.cameraColor, undefined);
  assert.throws(() => g.compile(), /no live pass writes and is not external/);
});

test('write-after-write and write-after-read hazards keep declaration order', () => {
  const g = createFrameGraph();
  g.addPass('first', { writes: ['target'] });
  g.addPass('reader', { reads: ['target'], writes: ['copy'] });
  g.addPass('second', { writes: ['target'] });
  g.addPass('present', { reads: ['target', 'copy'], sideEffect: true });
  const { order } = g.compile();
  const pos = Object.fromEntries(order.map((n, i) => [n, i]));
  assert.ok(pos.first < pos.second, 'WAW ordered');
  assert.ok(pos.reader < pos.second, 'WAR: reader runs before the overwrite');
  assert.ok(pos.second < pos.present && pos.reader < pos.present);
});

test('cycles and duplicate passes are explicit errors', () => {
  const g = createFrameGraph();
  g.addPass('a', { reads: ['rb'], writes: ['ra'], sideEffect: true });
  g.addPass('b', { reads: ['ra'], writes: ['rb'], sideEffect: true });
  assert.throws(() => g.compile(), /dependency cycle involving/);
  assert.throws(() => g.addPass('a', {}), /duplicate pass 'a'/);
});
