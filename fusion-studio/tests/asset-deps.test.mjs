import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAssetPath, isAbsoluteAssetPath, assetDirname, resolveAssetPath,
  relativeAssetPath, createDependencyGraph, packageAssets, relinkAssets,
} from '../src/asset-deps.js';

test('path normalization is canonical and lexical', () => {
  assert.equal(normalizeAssetPath('a\\b//c/./d/../e'), 'a/b/c/e');
  assert.equal(normalizeAssetPath('/a/b/'), '/a/b');
  assert.equal(normalizeAssetPath('C:\\x\\..\\y'), 'C:/y');
  assert.equal(normalizeAssetPath('../a/../b'), '../b');
  assert.equal(normalizeAssetPath('/../a'), '/a', 'cannot escape root');
  assert.ok(isAbsoluteAssetPath('/a/b') && isAbsoluteAssetPath('C:/a') && !isAbsoluteAssetPath('a/b'));
  assert.equal(assetDirname('/a/b/c.png'), '/a/b');
  assert.equal(assetDirname('C:/a.png'), 'C:/');
  assert.throws(() => normalizeAssetPath(''), TypeError);
});

test('resolve and relativize round-trip', () => {
  assert.equal(resolveAssetPath('/a/b', '../c/d.png'), '/a/c/d.png');
  assert.equal(resolveAssetPath('/a/b', '/x/y.png'), '/x/y.png');
  assert.equal(relativeAssetPath('/a/b/c', '/a/d/e.f'), '../../d/e.f');
  assert.equal(relativeAssetPath('/a/b', '/a/b/e.f'), 'e.f');
  assert.equal(relativeAssetPath('/a/b', '/a/b/c/d.f'), 'c/d.f');
  assert.equal(relativeAssetPath('C:/a', 'D:/b'), 'D:/b', 'different roots stay absolute');
  // Round trip: resolve(dir, relative(dir, target)) == target.
  const dir = '/projects/show/scenes';
  const target = '/projects/show/tex/wood.png';
  assert.equal(resolveAssetPath(dir, relativeAssetPath(dir, target)), target);
});

test('dependency graph: load order, impact, leaves, packaging', () => {
  const graph = createDependencyGraph({
    'scene.main': ['char.hero', 'env.room'],
    'char.hero': ['tex.skin', 'rig.hero'],
    'env.room': ['tex.wood'],
  });
  const order = graph.loadOrder();
  assert.ok(order.indexOf('tex.skin') < order.indexOf('char.hero'), 'deps before dependents');
  assert.ok(order.indexOf('char.hero') < order.indexOf('scene.main'));
  assert.ok(order.indexOf('tex.wood') < order.indexOf('env.room'));
  assert.deepEqual(graph.affectedBy(['tex.skin']), ['char.hero', 'scene.main']);
  assert.deepEqual(graph.affectedBy(['tex.wood', 'rig.hero']), ['char.hero', 'env.room', 'scene.main']);
  assert.deepEqual(graph.leafDependencies(), ['rig.hero', 'tex.skin', 'tex.wood']);
  assert.deepEqual(graph.missingDependencies(['scene.main', 'char.hero', 'env.room', 'tex.skin', 'rig.hero']), ['tex.wood']);
  assert.deepEqual(graph.dependenciesOf('char.hero'), ['rig.hero', 'tex.skin']);
  const pkg = packageAssets(graph, 'char.hero');
  assert.deepEqual(pkg.files, ['rig.hero', 'tex.skin', 'char.hero'], 'closure in load order');
});

test('cycles are found and block load order', () => {
  const graph = createDependencyGraph({ a: ['b'], b: ['c'], c: ['a'], d: ['a'] });
  const cycle = graph.findCycle();
  assert.ok(cycle && cycle[0] === cycle.at(-1), 'cycle path closes');
  assert.ok(cycle.includes('a') && cycle.includes('b') && cycle.includes('c'));
  assert.throws(() => graph.loadOrder(), /dependency cycle/);
  const dag = createDependencyGraph({ a: ['b'], b: [] });
  assert.equal(dag.findCycle(), null);
});

test('relinking matches unique basenames and reports ambiguity honestly', () => {
  const available = [
    '/show/tex/wood.png', '/show/tex/metal.png', '/alt/wood.png', '/show/rig/hero.fbx',
  ];
  const [metal, wood, ghost] = relinkAssets(
    ['C:/old/metal.png', 'textures/wood.png', 'tex/ghost.png'], available);
  assert.equal(metal.status, 'relinked');
  assert.equal(metal.path, '/show/tex/metal.png');
  assert.equal(wood.status, 'ambiguous');
  assert.deepEqual(wood.candidates, ['/alt/wood.png', '/show/tex/wood.png']);
  assert.equal(ghost.status, 'missing');
  // Case-insensitive basename matching.
  const [upper] = relinkAssets(['x/METAL.PNG'], available);
  assert.equal(upper.status, 'relinked');
});
