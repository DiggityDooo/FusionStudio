const test = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {isolatedEnv} = require('../electron/core.cjs');
const TEMP_ROOT = path.join(__dirname, '../test-output/tmp');
fs.mkdirSync(TEMP_ROOT, {recursive: true});

const hashFile = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const verdictOf = (run, prefix) => {
  const line = (run.stdout || '').split(/\r?\n/).find(l => l.startsWith(prefix));
  assert.ok(line, `no verdict line ${prefix}.\n${(run.stdout || '').slice(-2000)}\n${(run.stderr || '').slice(-1000)}`);
  return JSON.parse(line);
};

const BLENDER = 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe';

function runBlender(work, mode) {
  const script = path.join(__dirname, 'native-inventory.py');
  const run = spawnSync(BLENDER, ['-b', '--factory-startup', '--disable-autoexec', '--python-exit-code', '1', '-P', script, '--', mode, work], {encoding: 'utf8', timeout: 240000, env: isolatedEnv(work), windowsHide: true});
  return run;
}

test('preserved .blend source cage reopens with identical ordered hierarchy', {skip: !fs.existsSync(BLENDER) && 'Blender 5.2 not installed'}, () => {
  const work = fs.mkdtempSync(path.join(TEMP_ROOT, 'fusion-cage-'));
  const build = runBlender(work, 'build');
  assert.equal(build.status, 0, (build.stdout || '').slice(-1500) + (build.stderr || '').slice(-1000));
  const builtLine = (build.stdout || '').split(/\r?\n/).find(l => l.startsWith('{"built"'));
  assert.ok(builtLine, 'build produced no verdict');
  const warnings = JSON.parse(builtLine).warnings || [];
  assert.ok(warnings.some(w => w.includes('Prototype instance') && w.includes('PropsInstance')), `prototype instances must warn as render-only, got: ${JSON.stringify(warnings)}`);
  const check = runBlender(work, 'check');
  const line = (check.stdout || '').split(/\r?\n/).find(l => l.startsWith('{"ok"'));
  assert.ok(line, `inventory check produced no verdict.\n${(check.stdout || '').slice(-2000)}\n${(check.stderr || '').slice(-1000)}`);
  const verdict = JSON.parse(line);
  assert.equal(verdict.ok, true, verdict.problems?.join('\n'));
  assert.ok(verdict.objects >= 3 && verdict.collections >= 3);
});

test('authored shape-key, material, transform, UV, camera and armature edits on a copied .blend preserve unrelated native data', {skip: !fs.existsSync(BLENDER) && 'Blender 5.2 not installed'}, () => {
  const work = fs.mkdtempSync(path.join(TEMP_ROOT, 'fusion-cage-edit-'));
  const build = runBlender(work, 'editbuild');
  assert.equal(build.status, 0, (build.stdout || '').slice(-1500) + (build.stderr || '').slice(-1000));
  const originalHash = hashFile(path.join(work, 'fixture.blend'));
  const apply = runBlender(work, 'editapply');
  assert.equal(apply.status, 0, (apply.stdout || '').slice(-1500) + (apply.stderr || '').slice(-1000));
  assert.equal(verdictOf(apply, '{"edited"').edited, true);
  const check = runBlender(work, 'editcheck');
  assert.equal(check.status, 0, (check.stdout || '').slice(-2000) + (check.stderr || '').slice(-1000));
  const verdict = verdictOf(check, '{"ok"');
  assert.equal(verdict.ok, true, verdict.problems?.join('\n'));
  assert.equal(hashFile(path.join(work, 'fixture.blend')), originalHash, 'the original .blend must never be written by an edit on its copy');
});
