import test from 'node:test';
import assert from 'node:assert/strict';
import { validateNames, makeUnique, sanitizeName, applyFixes, DEFAULT_RULES } from '../src/naming.js';

test('validation flags duplicates, charset, pattern, and suffix issues', () => {
  const scene = [
    { name: 'Chair_GEO', type: 'mesh' },
    { name: 'Chair_GEO', type: 'mesh' },
    { name: 'bad name!', type: 'mesh' },
    { name: 'table', type: 'mesh' },
    { name: 'spine_01', type: 'bone' },
    { name: 'Key_LGT', type: 'light' },
  ];
  const issues = validateNames(scene);
  const byRule = (r) => issues.filter((i) => i.rule === r);
  assert.equal(byRule('unique').length, 1);
  assert.equal(byRule('unique')[0].name, 'Chair_GEO');
  assert.ok(byRule('charset').some((i) => i.name === 'bad name!'));
  assert.ok(byRule('suffix').some((i) => i.name === 'table'));
  assert.ok(byRule('pattern').some((i) => i.name === 'table'), 'lowercase mesh name breaks the pattern too');
  assert.ok(!issues.some((i) => i.name === 'spine_01'), 'valid bone name is clean');
  assert.ok(!issues.some((i) => i.name === 'Key_LGT'), 'valid light name is clean');
});

test('duplicate-numbered names (.001) are not false duplicates or pattern breaks', () => {
  const scene = [
    { name: 'Rock_GEO', type: 'mesh' },
    { name: 'Rock_GEO.001', type: 'mesh' },
    { name: 'Rock_GEO.002', type: 'mesh' },
  ];
  assert.deepEqual(validateNames(scene), []);
});

test('sanitizeName repairs charset, case, and suffix per category', () => {
  assert.equal(sanitizeName('my chair!', 'mesh'), 'My_chair_GEO');
  assert.equal(sanitizeName('WOOD', 'material'), 'WOOD_MAT');
  assert.equal(sanitizeName('Spine_01', 'bone'), 'spine_01');
  assert.equal(sanitizeName('hero', 'camera'), 'Hero_CAM');
  assert.equal(sanitizeName('', 'mesh'), 'Unnamed_GEO');
  assert.equal(sanitizeName('already_GEO', 'mesh'), 'Already_GEO');
});

test('makeUnique follows Blender numbering and respects existing numbers', () => {
  const taken = new Set(['Rock_GEO', 'Rock_GEO.001']);
  assert.equal(makeUnique('Rock_GEO', taken), 'Rock_GEO.002');
  assert.equal(makeUnique('New_GEO', taken), 'New_GEO');
  assert.equal(makeUnique('Rock_GEO.001', taken), 'Rock_GEO.002', 'renumbering starts from the base');
});

test('applyFixes yields a fully valid, unique scene and keeps good names', () => {
  const scene = [
    { name: 'Chair_GEO', type: 'mesh' },
    { name: 'chair', type: 'mesh' },
    { name: 'Chair_GEO', type: 'mesh' },
    { name: 'bad name', type: 'material' },
    { name: 'Key_LGT', type: 'light' },
  ];
  const renames = applyFixes(scene);
  assert.deepEqual(renames.map((r) => r.newName), [
    'Chair_GEO', 'Chair_GEO.001', 'Chair_GEO.002', 'Bad_name_MAT', 'Key_LGT',
  ]);
  const renamed = renames.map((r) => ({ name: r.newName, type: r.type }));
  assert.deepEqual(validateNames(renamed), [], 'fixed scene validates clean');
  // Idempotent: fixing an already-fixed scene changes nothing.
  const again = applyFixes(renamed);
  assert.deepEqual(again.map((r) => r.newName), renames.map((r) => r.newName));
});

test('custom rules replace the defaults wholesale', () => {
  const rules = {
    forbiddenChars: /[^a-z0-9_]/g,
    categories: { mesh: { pattern: /^[a-z0-9_]+$/, suffix: '_m', example: 'rock_m' }, other: { pattern: /^[a-z0-9_]+$/, suffix: '', example: 'thing' } },
  };
  assert.equal(sanitizeName('Rock', 'mesh', rules), 'rock_m');
  const issues = validateNames([{ name: 'Rock', type: 'mesh' }], rules);
  assert.ok(issues.some((i) => i.rule === 'pattern'));
  assert.ok(issues.some((i) => i.rule === 'suffix'));
  assert.equal(DEFAULT_RULES.categories.mesh.suffix, '_GEO', 'defaults untouched');
});
