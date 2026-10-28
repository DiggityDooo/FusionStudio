import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePath, makeRelative, relinkPaths, planPackage } from '../src/path-relink.js';

test('normalizePath unifies separators and collapses dot segments', () => {
  assert.equal(normalizePath('C:\\proj\\tex\\..\\tex\\wood.png'), 'C:/proj/tex/wood.png');
  assert.equal(normalizePath('/a//b/./c/'), '/a/b/c');
  assert.equal(normalizePath('tex/./wood.png'), 'tex/wood.png');
  assert.equal(normalizePath('../shared/wood.png'), '../shared/wood.png');
  assert.equal(normalizePath('a/../../b.png'), '../b.png', 'relative .. past the start is preserved');
  assert.equal(normalizePath('/../a.png'), '/a.png', 'absolute .. at root is clamped');
  assert.equal(normalizePath(''), '.');
});

test('makeRelative computes portable relative paths', () => {
  assert.equal(makeRelative('/proj/scenes', '/proj/tex/wood.png'), '../tex/wood.png');
  assert.equal(makeRelative('/proj/scenes', '/proj/scenes/sub/a.fsn'), 'sub/a.fsn');
  assert.equal(makeRelative('/proj/scenes', '/proj/scenes'), '.');
  assert.equal(makeRelative('C:/proj/scenes', 'D:/tex/wood.png'), 'D:/tex/wood.png', 'cross-drive stays absolute');
  assert.equal(makeRelative('/a/b/c', '/a/x.png'), '../../x.png');
});

test('relinkPaths: longest whole-segment prefix wins; drive case-insensitive', () => {
  const rules = [
    { from: 'D:/old', to: '/new' },
    { from: 'D:/old/tex', to: '/new/textures' },
  ];
  const { results, unresolved, collisions } = relinkPaths([
    'd:/old/tex/wood.png',
    'D:\\old\\models\\chair.fsn',
    'D:/oldtex/notmatched.png',
    'E:/elsewhere/x.png',
  ], rules);
  assert.deepEqual(results.map((r) => r.target), ['/new/textures/wood.png', '/new/models/chair.fsn']);
  assert.deepEqual(unresolved, ['D:/oldtex/notmatched.png', 'E:/elsewhere/x.png'], 'segment boundary respected');
  assert.deepEqual(collisions, []);
});

test('collisions are reported when two sources map to one target', () => {
  const { results, collisions } = relinkPaths(
    ['/a/tex/wood.png', '/b/tex/wood.png', '/a/tex/stone.png'],
    [{ from: '/a', to: '/pkg' }, { from: '/b', to: '/pkg' }],
  );
  assert.equal(results.length, 3);
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0].target, '/pkg/tex/wood.png');
  assert.deepEqual(collisions[0].sources.sort(), ['/a/tex/wood.png', '/b/tex/wood.png']);
});

test('planPackage rewrites under a new root and relativizes to the scene dir', () => {
  const plan = planPackage(
    ['D:/work/proj/tex/wood.png', 'D:/work/proj/models/chair.fsn', 'D:/other/loose.png'],
    { oldRoot: 'D:/work/proj', newRoot: '/Users/sean/FusionPack', sceneDir: '/Users/sean/FusionPack/scenes' },
  );
  assert.equal(plan.results.length, 2);
  assert.equal(plan.results[0].target, '/Users/sean/FusionPack/tex/wood.png');
  assert.equal(plan.results[0].relative, '../tex/wood.png');
  assert.equal(plan.results[1].relative, '../models/chair.fsn');
  assert.deepEqual(plan.unresolved, ['D:/other/loose.png']);
  assert.deepEqual(plan.collisions, []);
});
