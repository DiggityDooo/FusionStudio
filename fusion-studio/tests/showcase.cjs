/* Generates README showcase media by driving the real Electron UI. Not part of npm test. */
const {_electron} = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'docs', 'showcase');
const frames = path.join(out, 'frames');
fs.mkdirSync(frames, {recursive: true});

(async () => {
  const runtime = path.join(root, 'test-output', 'showcase-' + Date.now());
  const app = await _electron.launch({args: [root], env: {...process.env, FUSION_DATA_DIR: runtime}, timeout: 60000});
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({width: 1440, height: 900});
    await page.waitForFunction(() => window.fusionEditor && window.fusionAreas);
    if (await page.locator('#recovery-skip').count()) await page.locator('#recovery-skip').click();
    await page.evaluate(() => fusionEditor.template('blank'));
    await page.locator('[data-primitive="sphere"]').click();
    await page.waitForFunction(() => fusionEditor.root.children.length === 1 && !fusionOperators.running);
    await page.evaluate(() => { fusionEditor.frame(); });
    await page.waitForTimeout(600);
    await page.screenshot({path: path.join(out, '01-layout.png')});

    // Sculpting workspace: pick Clay, enter Sculpt Mode, drag real strokes on the sphere.
    await page.locator('[data-workspace="Sculpting"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-brush="draw"]').click();
    await page.locator('#brush-radius').fill('0.35');
    await page.locator('#brush-strength').fill('0.045');
    await page.locator('#enter-sculpt').click();
    await page.waitForTimeout(400);
    const vp = await page.locator('#viewport').boundingBox();
    const cx = vp.x + vp.width / 2, cy = vp.y + vp.height / 2;
    let frame = 0;
    const shot = async () => page.screenshot({path: path.join(frames, `f${String(frame++).padStart(2, '0')}.png`), clip: {x: vp.x, y: vp.y, width: vp.width, height: vp.height}});
    await shot();
    await page.mouse.move(cx - 90, cy - 40);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(cx - 90 + i * 18, cy - 40 + Math.sin(i / 2) * 22, {steps: 2});
      await page.waitForTimeout(90);
      await shot();
    }
    await page.mouse.up();
    await page.mouse.move(cx + 60, cy + 70);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(cx + 60 - i * 10, cy + 70 - i * 8, {steps: 2});
      await page.waitForTimeout(90);
      await shot();
    }
    await page.mouse.up();
    await page.waitForTimeout(400);
    await page.evaluate(() => { document.querySelectorAll('.left-panel,.right-panel').forEach(el => el.scrollTop = 0); });
    await page.waitForTimeout(200);
    await page.screenshot({path: path.join(out, '02-sculpting.png')});

    await page.locator('[data-workspace="Character"]').click();
    await page.waitForTimeout(700);
    await page.screenshot({path: path.join(out, '03-character.png')});

    await page.locator('[data-workspace="Clothing"]').click();
    await page.waitForTimeout(500);
    await page.screenshot({path: path.join(out, '04-clothing.png')});

    await page.locator('[data-workspace="Shading"]').click();
    await page.waitForTimeout(400);
    await page.screenshot({path: path.join(out, '05-shading.png')});
    console.log('Showcase screenshots written to', out);
  } finally {
    await app.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
