import test from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest, compareSemver, satisfiesRange, createPluginRegistry, KNOWN_PERMISSIONS } from '../src/plugins.js';

const GOOD = {
  id: 'com.example.retopo-helper', name: 'Retopo Helper', version: '1.2.0',
  api: { min: '1.0.0', max: '2.0.0' }, permissions: ['scene:read', 'mesh:edit'], tools: ['retopoHelper'],
};

test('semver comparison and range satisfaction', () => {
  assert.equal(compareSemver('1.2.0', '1.10.0'), -1, 'numeric, not lexicographic');
  assert.equal(compareSemver('2.0.0', '2.0.0'), 0);
  assert.equal(compareSemver('1.0.1', '1.0.0'), 1);
  assert.ok(satisfiesRange('1.4.2', '^1.2.0'));
  assert.ok(!satisfiesRange('2.0.0', '^1.2.0'));
  assert.ok(!satisfiesRange('1.1.0', '^1.2.0'));
  assert.ok(satisfiesRange('1.2.9', '~1.2.0'));
  assert.ok(!satisfiesRange('1.3.0', '~1.2.0'));
  assert.ok(satisfiesRange('3.0.0', '>=2.0.0'));
  assert.ok(satisfiesRange('3.0.0', '*'));
  assert.ok(satisfiesRange('1.2.3', '1.2.3'));
  assert.ok(!satisfiesRange('1.2.4', '1.2.3'));
  assert.throws(() => satisfiesRange('1.2', '*'), /bad semver/);
  assert.throws(() => satisfiesRange('1.2.3', 'banana'), /unsupported range/);
});

test('manifest validation reports every problem at once', () => {
  assert.deepEqual(validateManifest(GOOD), { ok: true, errors: [] });
  const bad = validateManifest({
    id: 'Bad ID!', version: 'v1', api: {}, permissions: ['root:everything'], dependsOn: { 'Bad ID!': 'banana' },
  });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.length >= 5, `got ${bad.errors.length}: ${bad.errors.join('; ')}`);
  assert.ok(bad.errors.some((e) => /unknown permission/.test(e)));
  assert.equal(validateManifest(null).ok, false);
  assert.ok(validateManifest({ ...GOOD, dependsOn: { [GOOD.id]: '*' } }).errors.some((e) => /itself/.test(e)));
});

test('registration enforces host API compatibility and duplicates', () => {
  const reg = createPluginRegistry({ hostApiVersion: '1.5.0' });
  assert.equal(reg.register(GOOD).ok, true);
  assert.equal(reg.register(GOOD).ok, false, 'duplicate id rejected');
  assert.match(reg.register(GOOD).errors[0], /duplicate/);
  const tooNew = reg.register({ ...GOOD, id: 'com.example.future', api: { min: '2.0.0' } });
  assert.equal(tooNew.ok, false);
  assert.match(tooNew.errors[0], /requires API >= 2.0.0/);
  const tooOld = reg.register({ ...GOOD, id: 'com.example.legacy', api: { min: '0.9.0', max: '1.0.0' } });
  assert.equal(tooOld.ok, false);
  assert.match(tooOld.errors[0], /requires API <= 1.0.0/);
  const invalid = reg.register({ id: 'x' });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.length > 1);
});

test('permission grants follow policy: deny by default, safe excludes files/network', () => {
  const reg = createPluginRegistry({ hostApiVersion: '1.5.0' });
  const manifest = { ...GOOD, permissions: ['scene:read', 'files:write', 'network:fetch'] };
  reg.register(manifest);
  assert.equal(reg.hasPermission(GOOD.id, 'scene:read'), false, 'default deny grants nothing');

  const reg2 = createPluginRegistry({ hostApiVersion: '1.5.0' });
  const res = reg2.register(manifest, { permissions: 'declared-safe' });
  assert.deepEqual(res.granted.sort(), ['scene:read']);
  assert.equal(reg2.hasPermission(GOOD.id, 'files:write'), false);
  assert.equal(reg2.hasPermission(GOOD.id, 'network:fetch'), false);

  const reg3 = createPluginRegistry({ hostApiVersion: '1.5.0' });
  const res3 = reg3.register(manifest, { permissions: ['files:write'] });
  assert.deepEqual(res3.granted, ['files:write'], 'explicit grant list is honored exactly');
  assert.ok(KNOWN_PERMISSIONS.includes('scene:read'));
});

test('dependency ordering, enable gating, and cycle detection', () => {
  const reg = createPluginRegistry({ hostApiVersion: '1.5.0' });
  const base = { id: 'com.example.base', name: 'Base', version: '1.0.0', api: { min: '1.0.0' } };
  const mid = { id: 'com.example.mid', name: 'Mid', version: '1.1.0', api: { min: '1.0.0' }, dependsOn: { 'com.example.base': '^1.0.0' } };
  const top = { id: 'com.example.top', name: 'Top', version: '2.0.0', api: { min: '1.0.0' }, dependsOn: { 'com.example.mid': '>=1.0.0' } };
  reg.register(top); reg.register(mid); reg.register(base); // registration order shuffled
  assert.deepEqual(reg.enableOrder(), ['com.example.base', 'com.example.mid', 'com.example.top']);

  assert.throws(() => reg.setEnabled('com.example.top', true), /needs 'com.example.mid' enabled first/);
  reg.setEnabled('com.example.base', true);
  reg.setEnabled('com.example.mid', true);
  reg.setEnabled('com.example.top', true);
  assert.equal(reg.get('com.example.top').enabled, true);
  assert.throws(() => reg.setEnabled('com.example.base', false), /depends on 'com.example.base' and is enabled/);

  // Version range enforced at enable time.
  const reg2 = createPluginRegistry({ hostApiVersion: '1.5.0' });
  reg2.register({ ...base, version: '2.0.0' });
  reg2.register(mid);
  reg2.setEnabled('com.example.base', true);
  assert.throws(() => reg2.setEnabled('com.example.mid', true), /needs com.example.base \^1.0.0, have 2.0.0/);

  const reg3 = createPluginRegistry({ hostApiVersion: '1.5.0' });
  reg3.register({ id: 'a.x', name: 'A', version: '1.0.0', api: { min: '1.0.0' }, dependsOn: { 'b.x': '*' } });
  reg3.register({ id: 'b.x', name: 'B', version: '1.0.0', api: { min: '1.0.0' }, dependsOn: { 'a.x': '*' } });
  assert.throws(() => reg3.enableOrder(), /dependency cycle/);
  assert.deepEqual(reg3.list().map((p) => p.id), ['a.x', 'b.x']);
});
