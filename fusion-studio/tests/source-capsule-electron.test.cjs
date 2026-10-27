const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {capsuleForFile, adapterForName} = require('../electron/source-capsule.cjs');

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
