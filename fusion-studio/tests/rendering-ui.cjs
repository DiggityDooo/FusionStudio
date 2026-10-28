const {_electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
(async()=>{
 const runtime=path.join(output,'rendering-ui-'+Date.now()),env={...process.env,FUSION_DATA_DIR:runtime};let app;const errors=[];
 try{
  app=await _electron.launch({args:[root],env,timeout:30000});const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>window.fusionEditor);if(await page.locator('#recovery-skip').count())await page.locator('#recovery-skip').click();
  await page.evaluate(()=>fusionEditor.template('blank'));await page.locator('[data-primitive="cube"]').click();await page.waitForFunction(()=>fusionEditor.root.children.length===1&&!fusionOperators.running);
  await page.locator('#object-holdout').check();await page.locator('#object-proxy').check();
  const flags=await page.evaluate(()=>{const o=fusionEditor.selected;return {holdout:!!o.userData.fusion_holdout,proxy:!!o.userData.fusion_proxy};});
  assert.equal(flags.holdout,true);assert.equal(flags.proxy,true);
  await page.locator('[data-workspace="Rendering"]').click();
  await page.locator('#render-engine').selectOption('EEVEE');
  await page.locator('#render-device').selectOption('HIP');
  await page.locator('#render-npr').check();
  await page.locator('#render-region').check();
  await page.locator('#region-x').fill('0.2');await page.locator('#region-x').press('Tab');
  await page.locator('#render-ipr').check();
  await page.locator('#anim-output').selectOption('jpeg');
  await page.locator('[data-pass="shadow"]').check();
  await page.locator('[data-pass="wireframe"]').check();
  await page.locator('#queue-add').click();
  const state=await page.evaluate(()=>{const s=fusionEditor.renderSettings,q=fusionEditor.renderQueue;return {engine:s.render.engine,device:s.device,npr:s.render.npr,region:s.render.region,ipr:fusionEditor.ipr,iprAccum:fusionEditor.iprAccum,output:s.sequence.output,passes:s.render.passes,queue:q.length,estimate:document.querySelector('#render-estimate')?.textContent||''};});
  assert.equal(state.engine,'EEVEE');assert.equal(state.device,'HIP');assert.equal(state.npr,true);assert.ok(state.region&&state.region.w>0);
  assert.equal(state.ipr,true);assert.ok(state.iprAccum>=0);assert.equal(state.output,'jpeg');
  assert.ok(state.passes.includes('shadow'));assert.ok(state.passes.includes('wireframe'));
  assert.equal(state.queue,1);assert.match(state.estimate,/Estimate/i);
  await page.screenshot({path:path.join(output,'rendering-ui.png')});
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'rendering-ui-results.json'),JSON.stringify({passed:true,checks:['holdout and viewport proxy','EEVEE HIP NPR region IPR','JPEG sequence option','shadow and wireframe AOVs','render queue and time estimate'],state,errors,runtime},null,2));console.log('Rendering desktop PASS');
 }finally{if(app)await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
