const {_electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
(async()=>{
 const runtime=path.join(output,'cameras-ui-'+Date.now()),env={...process.env,FUSION_DATA_DIR:runtime};let app;const errors=[];
 try{
  app=await _electron.launch({args:[root],env,timeout:30000});const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>window.fusionEditor);if(await page.locator('#recovery-skip').count())await page.locator('#recovery-skip').click();
  await page.evaluate(()=>fusionEditor.template('blank'));await page.locator('[data-primitive="cube"]').click();await page.waitForFunction(()=>fusionEditor.root.children.length===1&&!fusionOperators.running);
  await page.locator('#add-menu').click();assert.ok(await page.locator('[data-menu]',{hasText:/^Orthographic Camera$/}).count());
  await page.locator('[data-menu]',{hasText:/^Camera$/}).click();await page.waitForFunction(()=>!fusionOperators.running);
  await page.locator('#camera-panel').waitFor();
  await page.locator('#camera-blades').fill('6');await page.locator('#camera-blades').press('Tab');
  await page.locator('#camera-iso').fill('400');await page.locator('#camera-iso').press('Tab');
  await page.locator('#camera-motion-blur').check();
  await page.locator('[data-camera-guide="thirds"]').check();
  await page.locator('#camera-preset').selectOption('50mm');
  const cam=await page.evaluate(()=>{const c=fusionEditor.selected;return {blades:c.userData.fusion_blades,iso:c.userData.fusion_iso,blur:c.userData.fusion_motion_blur,guides:c.userData.fusion_guides,focal:c.getFocalLength(),name:c.name};});
  assert.equal(cam.blades,6);assert.equal(cam.iso,400);assert.equal(cam.blur,true);assert.ok(cam.guides.includes('thirds'));assert.ok(Math.abs(cam.focal-50)<.01);
  await page.locator('[data-camera-preset="85mm portrait"]').click();await page.waitForFunction(()=>fusionEditor.selected?.userData.fusion_dof===true);
  await page.locator('#add-ortho-camera').click();await page.waitForFunction(()=>fusionEditor.selected?.isOrthographicCamera);
  await page.locator('#camera-look').click();assert.equal(await page.evaluate(()=>fusionEditor.camera.isOrthographicCamera),true);
  await page.locator('[data-camera-rig="dolly"]').click();await page.waitForFunction(()=>fusionEditor.root.children.some(o=>o.userData.fusion_camera_rig==='dolly'));
  await page.locator('[data-workspace="Rendering"]').click();
  await page.locator('#render-iso').fill('200');await page.locator('#render-iso').press('Tab');
  await page.locator('#render-motion-blur').check();
  const settings=await page.evaluate(()=>({iso:fusionEditor.renderSettings.render.iso,blur:fusionEditor.renderSettings.render.motionBlur}));
  assert.equal(settings.iso,200);assert.equal(settings.blur,true);
  const side=await page.evaluate(()=>fusionEditor.cameraSidecar());assert.ok(side.cameras.some(c=>c.blades===6||c.iso===400||c.ortho));
  await page.screenshot({path:path.join(output,'cameras-ui.png')});
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'cameras-ui-results.json'),JSON.stringify({passed:true,checks:['Add camera and ortho camera','bokeh blades ISO motion blur','thirds guides','50mm and 85mm presets','look-through ortho','dolly rig','render ISO and shutter'],sidecar:side,errors,runtime},null,2));console.log('Cameras desktop PASS');
 }finally{if(app)await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
