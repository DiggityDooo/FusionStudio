const test = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BLENDER = 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe';

function runBlender(work, mode) {
  const script = path.join(__dirname, 'native-inventory.py');
  const run = spawnSync(BLENDER, ['-b', '--factory-startup', '--python-exit-code', '1', '-P', script, '--', mode, work], {encoding: 'utf8', timeout: 240000});
  return run;
}

test('preserved .blend source cage reopens with identical ordered hierarchy', {skip: !fs.existsSync(BLENDER) && 'Blender 5.2 not installed'}, () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'fusion-cage-'));
  const build = runBlender(work, 'build');
  assert.equal(build.status, 0, (build.stdout || '').slice(-1500) + (build.stderr || '').slice(-1000));
  const check = runBlender(work, 'check');
  const line = (check.stdout || '').split(/\r?\n/).find(l => l.startsWith('{"ok"'));
  assert.ok(line, `inventory check produced no verdict.\n${(check.stdout || '').slice(-2000)}\n${(check.stderr || '').slice(-1000)}`);
  const verdict = JSON.parse(line);
  assert.equal(verdict.ok, true, verdict.problems?.join('\n'));
  assert.ok(verdict.objects >= 3 && verdict.collections >= 3);
});
