import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addFeature, applyVariant, buildFeatureTree, createFeatureTree,
  defineVariant, meshBounds, meshSurfaceArea, meshVolume, setParameter,
  suppressFeature,
} from '../src/feature-tree.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

function flangeTree() {
  const tree = createFeatureTree();
  setParameter(tree, 'plateW', 40);
  setParameter(tree, 'bossR', 5);
  addFeature(tree, { id: 'plate', type: 'box', params: { size: [{ param: 'plateW' }, { param: 'plateW' }, 4] } });
  addFeature(tree, { id: 'boss', type: 'cylinder', params: { radius: { param: 'bossR' }, height: 10 } });
  addFeature(tree, { id: 'bossRow', type: 'patternLinear', base: 'boss', params: { count: 3, spacing: [12, 0, 0] } });
  return tree;
}

test('feature tree builds parametric solids with exact volumes', () => {
  const tree = flangeTree();
  const built = buildFeatureTree(tree);
  const plate = built.get('plate');
  assert.ok(near(meshVolume(plate), 40 * 40 * 4, 1e-3), `plate volume ${meshVolume(plate)}`);
  const boss = built.get('boss');
  // Faceted cylinder: volume approaches pi r^2 h from below.
  assert.ok(Math.abs(meshVolume(boss) - Math.PI * 25 * 10) < 4, `boss volume ${meshVolume(boss)}`);
  assert.equal(built.get('bossRow').indices.length, boss.indices.length * 3);
});

test('editing a parameter rebuilds downstream geometry', () => {
  const tree = flangeTree();
  const before = meshBounds(buildFeatureTree(tree).get('plate')).size[0];
  setParameter(tree, 'plateW', 60);
  const after = meshBounds(buildFeatureTree(tree).get('plate')).size[0];
  assert.ok(near(before, 40) && near(after, 60));
});

test('variants switch configurations (design tables)', () => {
  const tree = flangeTree();
  defineVariant(tree, 'compact', { plateW: 30, bossR: 3 });
  defineVariant(tree, 'large', { plateW: 80, bossR: 8 });
  applyVariant(tree, 'compact');
  assert.ok(near(meshBounds(buildFeatureTree(tree).get('plate')).size[0], 30));
  applyVariant(tree, 'large');
  const boss = buildFeatureTree(tree).get('boss');
  assert.ok(Math.abs(meshVolume(boss) - Math.PI * 64 * 10) < 12);
  assert.throws(() => applyVariant(tree, 'missing'), /Unknown variant/);
});

test('suppression and rollback change the build predictably', () => {
  const tree = flangeTree();
  suppressFeature(tree, 'bossRow');
  const built = buildFeatureTree(tree);
  assert.ok(!built.has('bossRow') && built.has('boss'));
  const partial = buildFeatureTree(tree, { upto: 'plate' });
  assert.deepEqual([...partial.keys()], ['plate']);
});

test('extruded profile volume equals area times depth (with a concave corner)', () => {
  const tree = createFeatureTree();
  // L profile: 4x4 square minus 2x2 notch -> area 12.
  const profile = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]];
  addFeature(tree, { id: 'l', type: 'extrude', params: { profile, depth: 3 } });
  const built = buildFeatureTree(tree).get('l');
  assert.ok(near(meshVolume(built), 36, 1e-6), `volume ${meshVolume(built)}`);
  assert.ok(near(meshSurfaceArea(built), 2 * 12 + 16 * 3, 1e-6), `area ${meshSurfaceArea(built)}`);
});

test('revolved profile and mirrored feature keep positive volume', () => {
  const tree = createFeatureTree();
  addFeature(tree, { id: 'vase', type: 'revolve', params: { profile: [[2, 0], [3, 1], [3, 4], [2, 5]], segments: 64 } });
  const vase = buildFeatureTree(tree).get('vase');
  assert.ok(meshVolume(vase) > 0, `vase volume ${meshVolume(vase)}`);
  addFeature(tree, { id: 'half', type: 'box', params: { size: [4, 2, 2] } });
  addFeature(tree, { id: 'halfMirror', type: 'mirror', base: 'half', params: { axis: 'x' } });
  const mirrored = buildFeatureTree(tree).get('halfMirror');
  assert.ok(near(meshVolume(mirrored), 16, 1e-6), 'mirror keeps orientation/volume');
});

test('broken references and unknown parameters fail clearly', () => {
  const tree = createFeatureTree();
  addFeature(tree, { id: 'orphan', type: 'transform', base: 'nope', params: { offset: [1, 0, 0] } });
  assert.throws(() => buildFeatureTree(tree), /missing\/suppressed base/);
  const tree2 = createFeatureTree();
  addFeature(tree2, { id: 'bad', type: 'box', params: { size: [{ param: 'ghost' }, 1, 1] } });
  assert.throws(() => buildFeatureTree(tree2), /Unknown parameter/);
});
