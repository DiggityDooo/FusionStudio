const {_electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
(async()=>{
 const runtime=path.join(output,'lighting-ui-'+Date.now()),env={...process.env,FUSION_DATA_DIR:runtime};let app;const errors=[];
 try{
  app=await _electron.launch({args:[root],env,timeout:30000});const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>window.fusionEditor);if(await page.locator('#recovery-skip').count())await page.locator('#recovery-skip').click();
  await page.evaluate(()=>fusionEditor.template('blank'));await page.locator('[data-primitive="cube"]').click();await page.waitForFunction(()=>fusionEditor.root.children.length===1&&!fusionOperators.running);
  await page.locator('#add-menu').click();assert.ok(await page.locator('[data-menu]',{hasText:/^Disk Light$/}).count());
  await page.locator('[data-menu]',{hasText:/^Disk Light$/}).click();await page.waitForFunction(()=>!fusionOperators.running);
  await page.locator('#light-panel').waitFor();assert.equal(await page.evaluate(()=>fusionEditor.selected.userData.fusion_light),'disk');
  await page.locator('#light-unit').selectOption('nits');assert.equal(await page.evaluate(()=>fusionEditor.selected.userData.fusion_unit),'nits');
  await page.locator('#light-portal').check();assert.equal(await page.evaluate(()=>fusionEditor.selected.userData.fusion_portal),true);
  await page.locator('[data-light-ray="shadow"]').uncheck();assert.equal(await page.evaluate(()=>fusionEditor.selected.userData.fusion_rays.shadow),false);
  await page.locator('[data-light-rig="three-point"]').click();await page.waitForFunction(()=>fusionEditor.root.children.filter(o=>o.isLight).length>=4);
  const groups=await page.evaluate(()=>[...new Set(fusionEditor.root.children.filter(o=>o.isLight).map(o=>o.userData.fusion_group).filter(Boolean))].sort());
  assert.deepEqual(groups,['Fill','Key','Rim']);
  await page.locator('[data-mixer="Key"]').evaluate(el=>{el.value='1.5';el.dispatchEvent(new Event('input'));el.dispatchEvent(new Event('change'));});
  assert.equal(await page.evaluate(()=>fusionEditor.root.userData.fusion_light_mixer.Key),1.5);
  await page.locator('#light-paint').click();assert.equal(await page.evaluate(()=>fusionEditor.lightPaint),'point');
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>fusionEditor.lightPaint),null);
  await page.evaluate(()=>{const cube=fusionEditor.root.children.find(o=>o.isMesh);fusionEditor.select(cube);});
  await page.locator('#mesh-light').click();assert.equal(await page.evaluate(()=>fusionEditor.selected.userData.fusion_mesh_light),true);
  await page.locator('[data-workspace="Shading"]').click();assert.ok(await page.locator('#lightmap-bake').count());
  await page.locator('[data-workspace="Rendering"]').click();
  await page.locator('#sunsky-enabled').check();await page.locator('#render-caustics').check();await page.locator('#render-contact').check();
  await page.locator('#world-volume').fill('0.2');await page.locator('#world-volume').press('Tab');
  const settings=await page.evaluate(()=>({sky:fusionEditor.renderSettings.render.world.sunSky.enabled,caustics:fusionEditor.renderSettings.render.caustics,contact:fusionEditor.renderSettings.render.contactShadows,volume:fusionEditor.renderSettings.render.world.volume}));
  assert.deepEqual(settings,{sky:true,caustics:true,contact:true,volume:.2});
  const side=await page.evaluate(()=>fusionEditor.lightingSidecar());assert.ok(side.lights.some(l=>l.kind==='disk'&&l.portal));assert.ok(side.meshes.length>=1);
  await page.screenshot({path:path.join(output,'lighting-ui.png')});
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'lighting-ui-results.json'),JSON.stringify({passed:true,checks:['Disk light in Add menu','nits unit','portal and light-path flags','three-point rig groups','mixer','paint cancel','mesh light','sun/sky caustics contact volume'],sidecar:side,errors,runtime},null,2));console.log('Lighting desktop PASS');
 }finally{if(app)await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
