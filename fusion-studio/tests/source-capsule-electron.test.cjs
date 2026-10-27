const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {capsuleForFile, adapterForName, copyOriginal, withDsonInventory} = require('../electron/source-capsule.cjs');

test('main-process capsule hashes the real file and classifies by header', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fusion-capsule-'));
  const file = path.join(dir, 'renamed.obj');
  const bytes = Buffer.from('BLENDER-v502 actual blend bytes under a wrong suffix');
  fs.writeFileSync(file, bytes);
  const capsule = await capsuleForFile(file);
  assert.equal(capsule.formatId, 'blend');
  assert.equal(capsule.detectedFormat, 'blend');
  assert.equal(capsule.sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.equal(capsule.byteLength, bytes.length);
  assert.equal(capsule.completeness, 'complete');
  assert.equal(adapterForName('tool.ZPR').id, 'zbrush');
  assert.equal(adapterForName('gown.zprj').id, 'marvelous');
});

test('DSON inventory lands on the capsule with hashes and unsupported fields', () => {
  const capsule = {dependencies: [], completeness: 'complete'};
  const out = withDsonInventory(capsule, {
    dependencies: [{path: 'C:/lib/data/figure.dsf', kind: 'dson', sha256: 'a'.repeat(64), bytes: 1234}, {path: 'C:/lib/tex.png', kind: 'texture', bytes: 55}],
    unsupported_fields: ['image.gamma', 'studio/node/custom'],
  });
  assert.equal(out.dependencies.length, 2);
  assert.equal(out.dependencies[0].status, 'found');
  assert.equal(out.dependencies[0].sha256, 'a'.repeat(64));
  assert.equal(out.dependencies[0].byteLength, 1234);
  assert.deepEqual(out.unsupportedFields, ['image.gamma', 'studio/node/custom']);
  assert.equal(withDsonInventory(null, {}), null);
  assert.deepEqual(withDsonInventory({dependencies: []}, null).dependencies, []);
});

test('text .gltf capsule inventories external buffers and textures, missing ones included', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fusion-capsule-gltf-'));
  const bin = Buffer.from([1, 2, 3, 4]), png = Buffer.from([137, 80, 78, 71]);
  fs.writeFileSync(path.join(dir, 'scene.bin'), bin);
  fs.writeFileSync(path.join(dir, 'skin texture.png'), png);
  const doc = {asset: {version: '2.0'}, buffers: [{uri: 'scene.bin', byteLength: 4}], images: [{uri: 'skin%20texture.png'}, {uri: 'missing.png'}, {uri: 'data:image/png;base64,iVBORw0KGgo='}]};
  const file = path.join(dir, 'scene.gltf');
  fs.writeFileSync(file, JSON.stringify(doc));
  const capsule = await capsuleForFile(file);
  assert.equal(capsule.formatId, 'gltf');
  assert.equal(capsule.dependencies.length, 3, 'embedded data: payloads are not external dependencies');
  const byId = Object.fromEntries(capsule.dependencies.map(d => [d.id, d]));
  assert.equal(byId['scene.bin'].status, 'found');
  assert.equal(byId['scene.bin'].role, 'buffer');
  assert.equal(byId['scene.bin'].sha256, crypto.createHash('sha256').update(bin).digest('hex'));
  assert.equal(byId['skin%20texture.png'].status, 'found', 'URI-escaped texture paths resolve');
  assert.equal(byId['missing.png'].status, 'missing');
  assert.equal(byId['missing.png'].role, 'texture');
  assert.equal(capsule.completeness, 'missing-dependencies', 'a missing texture must never read as fully preserved');
});

test('Export Original copies byte-exact to a new file and refuses in-place or overwrite', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fusion-original-'));
  const source = path.join(dir, 'scene.blend');
  const bytes = Buffer.from('BLENDER-v502 untouched original');
  fs.writeFileSync(source, bytes);
  const destination = path.join(dir, 'exported.blend');
  const result = await copyOriginal(source, destination);
  assert.equal(result.sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(fs.readFileSync(destination), bytes);
  await assert.rejects(() => copyOriginal(source, source), /different destination/);
  await assert.rejects(() => copyOriginal(source, destination), /EEXIST|exist/);
});
