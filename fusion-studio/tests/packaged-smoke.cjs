// Packaged-executable verification (plan M8): drives the real packaged exe
// through character creation, a sculpt stroke, Escape-cancel, project save,
// GLB export and an engine import-convert. Skips honestly without a package.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {_electron} = require('playwright');

const EXE = process.env.FUSION_TEST_EXECUTABLE || path.join(__dirname, '..', require('../package.json').build.directories.output, 'win-unpacked/Fusion Studio.exe');

test('packaged candidate exe: create, sculpt, cancel, save, export, import-convert', {skip: !fs.existsSync(EXE) && 'candidate package not built', timeout: 600000}, async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fusion-packaged-'));
  const app = await _electron.launch({executablePath: EXE, args: [], env: {...process.env, FUSION_DATA_DIR: dataDir}});
  const page = await app.firstWindow();
  const digest = () => page.evaluate(() => {
    const g = fusionEditor.selected?.geometry; if (!g) return null;
    const a = g.attributes.position.array; let h = 2166136261 >>> 0;
    for (let i = 0; i < a.length; i += 11) { h ^= Math.round(a[i] * 1e5); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16) + ':' + a.length;
  });
  try {
    await page.waitForFunction(() => window.fusionOperators, null, {timeout: 120000});
    await page.evaluate(() => fusionEditor.template('blank'));
    // Character creation through the real creator UI.
    await page.locator('[data-workspace="Character"]').click();
    await page.locator('[data-creator-create="female"]').click();
    await page.waitForFunction(() => fusionEditor.selected?.userData.fusion_creator, null, {timeout: 180000});
    // Sculpt stroke on a primitive through the real viewport (showcase-proven flow).
    await page.evaluate(() => fusionEditor.template('blank'));
    await page.locator('[data-workspace="Layout"]').click();
    await page.locator('[data-primitive="sphere"]').click();
    await page.waitForFunction(() => fusionEditor.root.children.length === 1 && !fusionOperators.running, null, {timeout: 60000});
    await page.evaluate(() => fusionEditor.frame());
    await page.locator('[data-workspace="Sculpting"]').click();
    await page.locator('[data-brush="draw"]').click();
    await page.locator('#brush-radius').fill('0.35');
    await page.locator('#brush-strength').fill('0.045');
    await page.locator('#enter-sculpt').click();
    await page.waitForTimeout(500);
    const before = await digest();
    const vp = await page.locator('#viewport').boundingBox();
    const cx = vp.x + vp.width / 2, cy = vp.y + vp.height / 2;
    await page.mouse.move(cx - 60, cy - 30); await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(cx - 60 + i * 16, cy - 30 + Math.sin(i / 2) * 18, {steps: 2});
    await page.mouse.up();
    const stroked = await digest();
    assert.notEqual(stroked, before, 'packaged sculpt stroke must displace geometry');
    // Escape mid-stroke cancels back to the stroked state without a history entry.
    const historyAt = await page.evaluate(() => fusionEditor.historyAt);
    await page.mouse.move(cx + 50, cy + 50); await page.mouse.down();
    await page.mouse.move(cx + 90, cy + 70, {steps: 3});
    await page.keyboard.press('Escape');
    await page.mouse.up();
    assert.equal(await digest(), stroked, 'Escape must restore the pre-stroke geometry in the packaged app');
    assert.equal(await page.evaluate(() => fusionEditor.historyAt), historyAt, 'cancelled stroke must not add a history entry');
    // Project save through the real IPC path.
    const saved = await page.evaluate(() => fusion.save(fusionEditor.document('Packaged smoke study')));
    assert.ok(saved?.path && fs.existsSync(saved.path), 'project save must produce a .fusion file');
    // GLB export through the operator.
    const exportResult = await page.evaluate(() => fusionOperators.run('interchange.export_glb', {}));
    assert.ok(exportResult, 'GLB export operator must complete');
    const exported = [];
    const walk = dir => { for (const e of fs.readdirSync(dir, {withFileTypes: true})) { const f = path.join(dir, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith('.glb')) exported.push(f); } };
    walk(dataDir);
    assert.ok(exported.length >= 1, 'export must write a GLB into the packaged data dir');
    const glb = exported[0];
    assert.equal(fs.readFileSync(glb).subarray(0, 4).toString('latin1'), 'glTF', 'exported file must be a binary glTF');
    // Import-convert the exported GLB through the packaged engine. Only the
    // OS file dialog is stubbed; the real choose-import registration and the
    // picker's path guard run exactly as for a user-picked file.
    await app.evaluate(({dialog}, file) => { dialog.showOpenDialog = async () => ({canceled: false, filePaths: [file]}); }, glb);
    const chosen = await page.evaluate(() => fusion.chooseImport());
    assert.equal(chosen?.path, glb, 'choose-import must register the picked file');
    const job = await page.evaluate(source => fusion.job({action: 'convert', source, name: 'Packaged reimport', params: {}}), glb);
    assert.ok(job?.output && fs.existsSync(job.output), 'packaged engine must convert the exported GLB');
    console.log(JSON.stringify({exe: EXE, saved: saved.path, exported: glb, reimported: job.output}));
  } finally {
    await app.close();
  }
});
