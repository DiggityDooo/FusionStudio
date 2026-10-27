const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {AssetCatalog, DEFAULT_ROOTS} = require('../electron/assets.cjs');

test('default library roots derive from this machine, never a hardcoded user profile', () => {
  assert.ok(DEFAULT_ROOTS.length >= 5);
  for (const [, dir] of DEFAULT_ROOTS) {
    assert.ok(dir.startsWith(process.env.PUBLIC || 'C:\\Users\\Public') || dir.startsWith(os.homedir()), `root should derive from PUBLIC or the user home: ${dir}`);
  }
  const catalog = new AssetCatalog();
  for (const root of catalog.roots) assert.ok(fs.existsSync(root.directory), 'catalog only keeps roots that exist on this machine');
});

test('product sources contain no hardcoded user-profile paths', () => {
  const offenders = [];
  const scan = dir => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (/\.(js|mjs|cjs|py|json)$/.test(entry.name)) {
        const text = fs.readFileSync(file, 'utf8');
        if (/C:\\\\Users\\\\(?!Public\\\\)[^\\\\]+\\\\/.test(text) || /C:\/Users\/(?!Public\/)[^/]+\//.test(text)) offenders.push(path.relative(path.join(__dirname, '..'), file));
      }
    }
  };
  scan(path.join(__dirname, '../src'));
  scan(path.join(__dirname, '../electron'));
  assert.deepEqual(offenders, [], `hardcoded profile paths in product sources: ${offenders.join(', ')}`);
});
