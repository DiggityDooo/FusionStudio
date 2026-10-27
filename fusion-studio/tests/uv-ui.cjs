const {_electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
(async()=>{
 const runtime=path.join(output,'uv-ui-'+Date.now()),env={...process.env,FUSION_DATA_DIR:runtime};let app;const errors=[];
 try{
  app=await _electron.launch({args:[root],env,timeout:30000});const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>window.fusionEditor);if(await page.locator('#recovery-skip').count())await page.locator('#recovery-skip').click();
  await page.evaluate(()=>fusionEditor.template('blank'));await page.locator('[data-primitive="cube"]').click();await page.waitForFunction(()=>fusionEditor.root.children.length===1&&!fusionOperators.running);
  await page.locator('[data-workspace="UV Editing"]').click();
  assert.match(await page.locator('#uv-density').textContent(),/Texel density 2048 px\/m at 2048 px · UV area used 600%/);
  await page.locator('#uv-texture-size').selectOption('1024');assert.match(await page.locator('#uv-density').textContent(),/1024 px\/m at 1024 px/);
  // Checker overlay is display-only.
  const pixel=()=>page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const e=fusionEditor;e.frame(e.selected);e.settleOrbit();const p=e.selected.localToWorld(new e.selected.position.constructor(.2,.2,.5)).project(e.camera),r=e.renderer,c=r.domElement,gl=r.getContext(),px=new Uint8Array(4);gl.readPixels(Math.round((p.x+1)/2*c.width),Math.round((p.y+1)/2*c.height),1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);done([...px]);}))));
  const plain=await pixel();await page.locator('#uv-checker').check();const checked=await pixel();assert.notDeepEqual(checked,plain,'checker grid drawn');
  assert.ok(!JSON.stringify(await page.evaluate(()=>fusionEditor.serialize())).includes('"map"'),'checker never saved');await page.locator('#uv-checker').uncheck();
  // Lightmap UVs through the panel: a second UV set appears and can be shown.
  const runJob=async(job,fill={})=>{await page.locator(`#library [data-job="${job}"]`).click();for(const [k,v] of Object.entries(fill))await page.locator('#mesh-param-'+k).selectOption(v);await page.locator('#mesh-settings-apply').click();await page.locator('#compat-copy').click();await page.waitForFunction(()=>!fusionOperators.running&&!document.querySelector('.busy'));};
  await runJob('uv_lightmap');await page.waitForFunction(()=>!!fusionEditor.selected?.isMesh||!!fusionEditor.selected);
  await page.waitForFunction(()=>{let m;fusionEditor.selected.traverse(n=>{if(!m&&n.isMesh)m=n;});return !!m?.geometry.attributes.uv1;},null,{timeout:120000});
  assert.ok(await page.evaluate(()=>{let m;fusionEditor.selected.traverse(n=>{if(!m&&n.isMesh)m=n;});return new Set(Array.from(m.geometry.attributes.uv1.array,v=>v.toFixed(3))).size>4;}),'lightmap set holds packed islands');
  assert.ok(await page.evaluate(()=>{let m;fusionEditor.selected.traverse(n=>{if(!m&&n.isMesh)m=n;});return new Set(Array.from(m.geometry.attributes.uv1.array,v=>v.toFixed(3))).size>4;}),'lightmap set holds packed islands');
  await page.locator('#refresh-uv').click();await page.locator('#uv-set').selectOption('uv1');assert.equal(await page.locator('#uv-set').inputValue(),'uv1');
  // Unwrap (conformal, seams from sharp angles) replaces the texture UVs.
  const before=await page.evaluate(()=>{let m;fusionEditor.selected.traverse(n=>{if(!m&&n.isMesh)m=n;});return Array.from(m.geometry.attributes.uv.array.slice(0,12));});
  await runJob('uv_unwrap',{method:'Conformal',seams:'From sharp angles'});
  await page.waitForFunction(b=>{let m;fusionEditor.selected.traverse(n=>{if(!m&&n.isMesh)m=n;});return m&&JSON.stringify(Array.from(m.geometry.attributes.uv.array.slice(0,12)))!==JSON.stringify(b);},before,{timeout:120000});
  await page.screenshot({path:path.join(output,'uv-ui.png')});
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'uv-ui-results.json'),JSON.stringify({passed:true,checks:['texel density and UV area readout follow texture size','UV checker overlay changes pixels and is never saved','Lightmap UVs add a second UV set selectable in the UV editor','Conformal unwrap with seams from sharp angles replaces UVs'],errors,runtime},null,2));console.log('UV desktop PASS');
 }finally{if(app)await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
