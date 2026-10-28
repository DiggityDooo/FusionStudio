import test from 'node:test';
import assert from 'node:assert/strict';
import { createPropertySchema, createPropertySet, propertySetFromJSON, diffPropertySets } from '../src/custom-properties.js';

const SCHEMA_DEFS = [
  { name: 'lodBias', type: 'float', default: 1, min: 0, max: 4 },
  { name: 'segments', type: 'int', default: 8, min: 1, max: 64, clamp: true },
  { name: 'label', type: 'string', default: '' },
  { name: 'visible', type: 'bool', default: true },
  { name: 'tint', type: 'color', default: [1, 1, 1] },
  { name: 'anchor', type: 'vec3', default: [0, 0, 0] },
  { name: 'quality', type: 'enum', options: ['low', 'med', 'high'], default: 'med' },
];

test('defaults layer under explicit values; unset restores the default', () => {
  const schema = createPropertySchema(SCHEMA_DEFS);
  const props = createPropertySet(schema);
  assert.equal(props.get('lodBias'), 1);
  assert.equal(props.isSet('lodBias'), false);
  props.set('lodBias', 2.5);
  assert.equal(props.get('lodBias'), 2.5);
  assert.equal(props.isSet('lodBias'), true);
  props.unset('lodBias');
  assert.equal(props.get('lodBias'), 1);
  assert.deepEqual(props.effective(), {
    lodBias: 1, segments: 8, label: '', visible: true, tint: [1, 1, 1], anchor: [0, 0, 0], quality: 'med',
  });
});

test('type and range validation reject bad writes with precise errors', () => {
  const schema = createPropertySchema(SCHEMA_DEFS);
  const props = createPropertySet(schema);
  assert.throws(() => props.set('lodBias', 'fast'), /'lodBias': expected a finite number/);
  assert.throws(() => props.set('lodBias', 99), /above max 4/);
  assert.throws(() => props.set('segments', 2.5), /expected an integer/);
  assert.throws(() => props.set('visible', 1), /expected a boolean/);
  assert.throws(() => props.set('tint', [2, 0, 0]), /components in 0\.\.1/);
  assert.throws(() => props.set('tint', [1, 0]), /\[r,g,b\]/);
  assert.throws(() => props.set('anchor', [0, NaN, 0]), /finite numbers/);
  assert.throws(() => props.set('quality', 'ultra'), /one of low, med, high/);
  assert.throws(() => props.set('nope', 1), /unknown property 'nope'/);
  // Failed writes leave prior state intact.
  assert.equal(props.get('lodBias'), 1);
});

test('clamp:true properties clamp instead of rejecting', () => {
  const schema = createPropertySchema(SCHEMA_DEFS);
  const props = createPropertySet(schema);
  props.set('segments', 500);
  assert.equal(props.get('segments'), 64);
  props.set('segments', -3);
  assert.equal(props.get('segments'), 1);
  props.set('segments', 12);
  assert.equal(props.get('segments'), 12);
});

test('array values are copied on write and read (no aliasing)', () => {
  const schema = createPropertySchema(SCHEMA_DEFS);
  const props = createPropertySet(schema);
  const tint = [0.5, 0.25, 0.125, 1];
  props.set('tint', tint);
  tint[0] = 9;
  assert.equal(props.get('tint')[0], 0.5);
  const read = props.get('tint');
  read[0] = 9;
  assert.equal(props.get('tint')[0], 0.5);
});

test('serialization stores only the explicit layer and round-trips', () => {
  const schema = createPropertySchema(SCHEMA_DEFS);
  const props = createPropertySet(schema, { label: 'hero', quality: 'high' });
  props.set('anchor', [1, 2, 3]);
  assert.deepEqual(props.toJSON(), { label: 'hero', quality: 'high', anchor: [1, 2, 3] });
  const restored = propertySetFromJSON(schema, JSON.parse(JSON.stringify(props.toJSON())));
  assert.deepEqual(restored.effective(), props.effective());
  assert.throws(() => propertySetFromJSON(schema, { quality: 'ultra' }), /one of/);
});

test('diff reports exactly the changed properties, array-aware', () => {
  const schema = createPropertySchema(SCHEMA_DEFS);
  const a = createPropertySet(schema, { label: 'a', tint: [1, 0, 0] });
  const b = createPropertySet(schema, { label: 'b', tint: [1, 0, 0], visible: false });
  const diffs = diffPropertySets(a, b);
  assert.deepEqual(diffs.map((d) => d.name), ['label', 'visible']);
  assert.deepEqual(diffs[0], { name: 'label', from: 'a', to: 'b' });
  assert.deepEqual(diffPropertySets(a, a), []);
});

test('schema construction validates itself', () => {
  assert.throws(() => createPropertySchema([{ name: 'x', type: 'wat' }]), /unknown type/);
  assert.throws(() => createPropertySchema([{ name: 'x', type: 'enum' }]), /needs options/);
  assert.throws(() => createPropertySchema([{ name: 'x', type: 'float', default: 'a' }]), /default for 'x'/);
  assert.throws(() => createPropertySchema([
    { name: 'x', type: 'float' }, { name: 'x', type: 'int' },
  ]), /duplicate property/);
  const empty = createPropertySchema([]);
  assert.deepEqual(empty.names(), []);
});
