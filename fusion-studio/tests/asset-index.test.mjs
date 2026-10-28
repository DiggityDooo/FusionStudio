import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssetIndex, searchAssets, tagCounts, tokenize } from '../src/asset-index.js';

const ASSETS = [
  { id: 'a1', name: 'Oak Tree 01', type: 'mesh', tags: ['nature', 'tree', 'outdoor'], metadata: { biome: 'forest' } },
  { id: 'a2', name: 'PineTreeTall', type: 'mesh', tags: ['nature', 'tree'], metadata: { biome: 'forest' } },
  { id: 'a3', name: 'Oak Table', type: 'mesh', tags: ['furniture', 'wood'], metadata: { room: 'dining' } },
  { id: 'a4', name: 'Granite Rock', type: 'mesh', tags: ['nature', 'rock'], metadata: { biome: 'mountain' } },
  { id: 'a5', name: 'Forest Floor Texture', type: 'texture', tags: ['nature', 'ground'], metadata: { biome: 'forest' } },
  { id: 'a6', name: 'Tree Swing Rig', type: 'rig', tags: ['tree', 'playground'], metadata: { room: 'garden' } },
];
const index = createAssetIndex(ASSETS);
const ids = (results) => results.map((r) => r.id);

test('tokenization splits words, camelCase, and digit boundaries', () => {
  assert.deepEqual(tokenize('PineTreeTall'), ['pine', 'tree', 'tall']);
  assert.deepEqual(tokenize('Oak Tree 01'), ['oak', 'tree', '01']);
  assert.deepEqual(tokenize('rock_2-large'), ['rock', '2', 'large']);
});

test('search ranks exact name tokens above tags above substrings, deterministically', () => {
  // 'tree': a1 name token (3) + tag (already counted once per term at
  // best weight 3); a2 name token 3; a6 name token 3; a5/a3/a4 no match.
  const tree = searchAssets(index, 'tree');
  assert.deepEqual(ids(tree), ['a1', 'a2', 'a6'], 'name-token matches, name order within ties');
  assert.ok(tree.every((r) => r.score === 3), 'name token scores 3');
  // 'nature' is tag-only for a1/a2/a4/a5 -> score 2, alphabetical by name.
  assert.deepEqual(ids(searchAssets(index, 'nature')), ['a5', 'a4', 'a1', 'a2']);
  // 'forest': a name token in a5 (score 3), metadata-only in a1/a2 (score 1).
  const forest = searchAssets(index, 'forest');
  assert.deepEqual(ids(forest), ['a5', 'a1', 'a2']);
  assert.deepEqual(forest.map((r) => r.score), [3, 1, 1], 'name token beats metadata substring');
  // Multi-term AND: both must hit.
  assert.deepEqual(ids(searchAssets(index, 'oak tree')), ['a1'], 'a3 has oak but no tree');
  // Phrase search against names.
  assert.deepEqual(ids(searchAssets(index, '"oak tree"')), ['a1']);
  assert.deepEqual(searchAssets(index, 'nonexistent'), []);
});

test('filters and exclusions compose with ranking', () => {
  assert.deepEqual(ids(searchAssets(index, 'tree type:mesh')), ['a1', 'a2']);
  assert.deepEqual(ids(searchAssets(index, 'tree tag:outdoor')), ['a1']);
  assert.deepEqual(ids(searchAssets(index, 'tree -rig')), ['a1', 'a2'], 'exclusion drops the swing rig by name token');
  assert.deepEqual(ids(searchAssets(index, 'nature -tag:rock')), ['a5', 'a1', 'a2'], 'negated tag filter');
  assert.equal(searchAssets(index, '', { limit: 2 }).length, 2, 'limit applies to the empty query too');
  const all = searchAssets(index, '');
  assert.equal(all.length, 6, 'empty query ranks everything at score 0');
  assert.deepEqual(ids(all), ['a5', 'a4', 'a3', 'a1', 'a2', 'a6'], 'alphabetical at equal score');
});

test('tag counts and index integrity checks', () => {
  assert.deepEqual(tagCounts(index), [
    { tag: 'nature', count: 4 },
    { tag: 'tree', count: 3 },
    { tag: 'ground', count: 1 },
    { tag: 'outdoor', count: 1 },
    { tag: 'playground', count: 1 },
    { tag: 'rock', count: 1 },
    { tag: 'wood', count: 1 },
    { tag: 'furniture', count: 1 },
  ].sort((x, y) => (y.count - x.count) || x.tag.localeCompare(y.tag)));
  assert.throws(() => createAssetIndex([{ id: 'x', name: 'A' }, { id: 'x', name: 'B' }]), /duplicate id/);
  assert.throws(() => createAssetIndex([{ name: 'No id' }]), /id and name/);
  assert.throws(() => searchAssets(index, 'x', { limit: 0 }), /positive integer/);
});
