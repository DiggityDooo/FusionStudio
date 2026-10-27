import test from 'node:test';
import assert from 'node:assert/strict';
import {FORMAT_ADAPTERS, adapterForName, probeFormat, createCapsule, verifyCapsule, capsuleSummary} from '../src/source-capsule.js';

const enc = s => new TextEncoder().encode(s);

test('built-in adapters are versioned and the summary names the adapter version', async () => {
  for (const a of FORMAT_ADAPTERS) { assert.ok(Number.isInteger(a.version) && a.version >= 1, `adapter ${a.id} needs a capability version`); }
  assert.equal(new Set(FORMAT_ADAPTERS.map(a => a.id)).size, FORMAT_ADAPTERS.length, 'adapter ids unique');
  const capsule = await createCapsule({name: 'hero.blend', bytes: new TextEncoder().encode('BLENDER...')});
  assert.match(capsuleSummary(capsule), /Adapter: blend v1 \(built-in\)/);
});

test('registry keeps .zpr (ZBrush) and .zprj (Marvelous) as separate adapters', () => {
  assert.equal(adapterForName('figure.ZPR').id, 'zbrush');
  assert.equal(adapterForName('dress.zprj').id, 'marvelous');
  assert.equal(adapterForName('scene.blend').id, 'blend');
  assert.equal(adapterForName('figure.duf').id, 'dson');
  assert.equal(adapterForName('mystery.xyz'), null);
  for (const a of FORMAT_ADAPTERS) assert.ok(a.label && a.kind && a.editable);
});

test('probe trusts content over suffix', () => {
  const blendBytes = enc('BLENDER-v502rest');
  assert.equal(probeFormat(blendBytes, 'lying.obj').detected, 'blend');
  assert.equal(probeFormat(blendBytes, 'lying.obj').adapter.id, 'blend');
  assert.equal(probeFormat(enc('{"file_version":"1.0"}'), 'figure.duf').detected, 'json');
  assert.equal(probeFormat(new Uint8Array([0x1f, 0x8b, 0, 0]), 'figure.duf').detected, 'gzip');
  assert.equal(probeFormat(enc('????'), 'a.zpr').adapter.id, 'zbrush');
});

test('capsule hashes bytes, verifies, and reports tampering', async () => {
  const bytes = enc('original-native-bytes');
  const capsule = await createCapsule({name: 'scene.blend', bytes});
  assert.equal(capsule.schema, 1);
  assert.equal(capsule.byteLength, bytes.length);
  assert.match(capsule.sha256, /^[0-9a-f]{64}$/);
  assert.equal(capsule.completeness, 'complete');
  assert.equal(await verifyCapsule(capsule, bytes), true);
  assert.equal(await verifyCapsule(capsule, enc('original-native-bytex')), false);
  assert.equal(await verifyCapsule(capsule, enc('short')), false);
});

test('missing dependencies and opaque formats are never called fully preserved', async () => {
  const incomplete = await createCapsule({name: 'scene.blend', bytes: enc('BLENDERx'), dependencies: [{id: 'tex', originalLocator: 'textures/skin.png', role: 'texture', status: 'missing', private: false}]});
  assert.equal(incomplete.completeness, 'missing-dependencies');
  assert.match(capsuleSummary(incomplete), /not fully preserved/);
  const opaque = await createCapsule({name: 'tool.zpr', bytes: enc('unknown-zbrush-bytes')});
  assert.equal(opaque.editable, 'none');
  assert.match(capsuleSummary(opaque), /preservation only/);
  await assert.rejects(() => createCapsule({name: 'x.blend'}), /needs an original name and its bytes/);
});
