/* Full character -> clothing workflow, driven through the real Electron UI.
   Produces docs/showcase/w1..w6 step images. Not part of npm test. */
const {_electron} = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'docs', 'showcase');
fs.mkdirSync(out, {recursive: true});
const waitIdle = page => page.waitForFunction(() => !window.fusionOperators?.running, undefined, {timeout: 120000}).catch(() => {});

(async () => {
  const runtime = path.join(root, 'test-output', 'workflow-' + Date.now());
  const app = await _electron.launch({args: [root], env: {...process.env, FUSION_DATA_DIR: runtime}, timeout: 60000});
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({width: 1440, height: 900});
    await page.waitForFunction(() => window.fusionEditor && window.fusionAreas);
    if (await page.locator('#recovery-skip').count()) await page.locator('#recovery-skip').click();
    await page.evaluate(() => fusionEditor.template('blank'));

    // 1) Create the character and shape the body.
    await page.locator('[data-workspace="Character"]').click();
    await page.locator('[data-creator-create="female"]').click();
    await page.waitForFunction(() => window.fusionEditor.selected?.userData.fusion_creator, undefined, {timeout: 90000});
    await waitIdle(page);
    for (const [id, value] of [['height', '1.72'], ['muscle', '0.62'], ['weight', '0.42']]) {
      const input = page.locator(`input[data-creator-number="${id}"]`);
      await input.fill(value);
      await input.press('Tab');
      await waitIdle(page);
      await page.waitForTimeout(500);
    }
    await page.evaluate(() => fusionEditor.frame());
    await page.waitForTimeout(600);
    await page.screenshot({path: path.join(out, 'w1-body.png')});

    // 2) Face tab: adjust the first face control, then frame a real portrait.
    await page.locator('[data-creator-tab="Face"]').click();
    await page.waitForTimeout(500);
    const face = page.locator('input[data-creator-number]').first();
    if (await face.count()) { await face.fill('0.35'); await face.press('Tab'); await waitIdle(page); await page.waitForTimeout(700); }
    await page.locator('#creator-portrait').click();
    await page.waitForTimeout(700);
    await page.screenshot({path: path.join(out, 'w2-face.png')});
    await page.locator('#creator-fullbody').click();
    await page.waitForTimeout(500);

    // 3) Skin tone, then long hair.
    await page.locator('[data-creator-tab="Skin"]').click();
    await page.waitForTimeout(400);
    await page.locator('[data-creator-tone="10"]').click();
    await waitIdle(page);
    await page.locator('[data-creator-tab="Hair"]').click();
    await page.waitForTimeout(400);
    await page.locator('#creator-hair-style').selectOption('long');
    await waitIdle(page);
    await page.waitForTimeout(1800);
    await page.locator('#creator-portrait').click();
    await page.waitForTimeout(700);
    await page.screenshot({path: path.join(out, 'w3-skin-hair.png')});
    await page.locator('#creator-fullbody').click();
    await page.waitForTimeout(500);

    // 4) Clothing FIRST in the neutral pose: fit a live T-shirt and drape it.
    await page.locator('[data-workspace="Clothing"]').click();
    await page.waitForTimeout(600);
    await page.locator('#hybrid-link').click();
    await page.waitForTimeout(800);
    const proceed = page.locator('#hybrid-proceed');
    if (await proceed.count()) { await proceed.click(); }
    await page.waitForFunction(() => window.fusionEditor.selected?.userData.liveGarment, undefined, {timeout: 180000});
    await waitIdle(page);
    await page.waitForTimeout(1200);
    await page.evaluate(() => fusionEditor.frame());
    await page.waitForTimeout(600);
    await page.screenshot({path: path.join(out, 'w4-garment.png')});

    // 5) THEN pose: the linked garment re-drapes itself onto the posed body.
    await page.locator('[data-workspace="Character"]').click();
    await page.waitForTimeout(500);
    await page.evaluate(() => { const c = fusionEditor.root.children.find(o => o.userData.fusion_creator); if (c) fusionEditor.select(c); });
    await page.waitForTimeout(500);
    await page.locator('[data-creator-tab="Pose"]').click();
    await page.waitForTimeout(400);
    await page.locator('[data-creator-pose="contrapposto"]').click();
    await waitIdle(page);
    await page.waitForTimeout(1500);
    await page.evaluate(() => fusionEditor.frame());
    await page.waitForTimeout(600);
    await page.screenshot({path: path.join(out, 'w5-posed-clothing.png')});

    // 6) Change the body and let the linked garment re-grade/re-drape itself.
    // (The garment is selected after fitting, so pick the character in the Outliner first.)
    await page.locator('[data-workspace="Character"]').click();
    await page.waitForTimeout(500);
    await page.evaluate(() => { const c = fusionEditor.root.children.find(o => o.userData.fusion_creator); if (c) fusionEditor.select(c); });
    await page.waitForTimeout(600);
    await page.locator('[data-creator-tab="Body"]').click();
    await page.waitForTimeout(400);
    const height = page.locator('input[data-creator-number="height"]');
    await height.fill('1.78');
    await height.press('Tab');
    await waitIdle(page);
    await page.waitForTimeout(1500);
    await page.locator('[data-workspace="Clothing"]').click();
    await page.waitForTimeout(800);
    await page.evaluate(() => fusionEditor.frame());
    await page.waitForTimeout(600);
    await page.screenshot({path: path.join(out, 'w6-refit.png')});

    // 7) Inspect the fit with strain colors (select the garment first).
    await page.evaluate(() => { const g = fusionEditor.root.children.find(o => o.userData.liveGarment); if (g) fusionEditor.select(g); });
    await page.waitForTimeout(700);
    const strain = page.locator('#hybrid-strain');
    if (await strain.count()) { await strain.click(); await page.waitForTimeout(900); }
    await page.screenshot({path: path.join(out, 'w7-strain.png')});
    console.log('Workflow showcase written to', out);
  } finally {
    await app.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
