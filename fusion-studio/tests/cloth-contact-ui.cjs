const {_electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
(async()=>{
 const {starterPattern,migratePattern,buildPattern}=await import('../src/patterns.js');
 const doc=migratePattern(starterPattern());doc.seams=[];doc.particleDistance=.025;
 for(const panel of doc.panels){panel.position=[0,.8,.0];panel.flip=false;panel.pins=[];}
 const triangles=buildPattern(doc).faces.length;assert.ok(triangles>=4000);
 const runtime=path.join(output,'cloth-contact-ui-'+Date.now()),app=await _electron.launch({args:[root],env:{...process.env,FUSION_DATA_DIR:runtime},timeout:30000}),page=await app.firstWindow(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const state=()=>page.evaluate(()=>({scene:JSON.stringify(fusionEditor.serialize()),cursor:fusionEditor.journal.cursor,entries:fusionEditor.journal.entries.length,frame:fusionEditor.timeline.frame}));
 const idle=()=>page.waitForFunction(()=>!fusionOperators.running&&!document.querySelector('#app').classList.contains('busy'),{},{timeout:30000});
 try{
  await app.evaluate(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows())w.webContents.setBackgroundThrottling(false);});
  await page.waitForFunction(()=>window.fusionOperators);await page.evaluate(()=>fusionEditor.template('blank'));
  await page.evaluate(doc=>fusionOperators.run('cloth.apply_pattern',{doc}).then(()=>null),doc);
  await page.locator('[data-workspace="Clothing"]').click();assert.equal(await page.locator('#hybrid-contact-audit').count(),1);
  const before=await state(),glb=await page.evaluate(()=>fusionEditor.glb(false,{includeAnimations:false}));
  const overlap=await page.evaluate(()=>fusionOperators.run('hybrid.contact_audit'));
  assert.equal(overlap.complete,true);assert.ok(overlap.coplanarOverlaps>1000);assert.ok(overlap.clearanceViolations>0);
  assert.match(await page.getByRole('dialog').textContent(),/Needs refinement/);assert.match(await page.getByRole('dialog').textContent(),/same plane/);
  assert.deepEqual(await state(),before);await page.locator('#cloth-contact-show').click();
  assert.equal(await page.evaluate(()=>!!fusionEditor.clothContactHighlights),true);
  assert.equal(await page.evaluate(()=>fusionEditor.root.children.includes(fusionEditor.clothContactHighlights.overlay)),false);
  assert.deepEqual(await state(),before);assert.equal(await page.evaluate(()=>fusionEditor.glb(false,{includeAnimations:false})),glb);
  await page.screenshot({path:path.join(output,'cloth-contact-overlap.png')});await page.keyboard.press('Escape');await page.waitForFunction(()=>!fusionEditor.clothContactHighlights);
  // A later scene revision removes the old overlay instead of presenting stale faces.
  await page.evaluate(()=>fusionOperators.run('hybrid.contact_audit'));await page.locator('#cloth-contact-show').click();await page.evaluate(()=>fusionEditor.evaluation.invalidate());await page.waitForFunction(()=>!fusionEditor.clothContactHighlights);assert.deepEqual(await state(),before);
  await page.evaluate(()=>fusionOperators.run('hybrid.contact_audit'));await page.evaluate(()=>fusionEditor.evaluation.invalidate());await page.locator('#cloth-contact-show').click();assert.match(await page.getByRole('dialog').textContent(),/garment changed/);await page.locator('#cloth-contact-close').click();assert.equal(await page.evaluate(()=>!!fusionEditor.clothContactHighlights),false);assert.deepEqual(await state(),before);
  const cancelled=await page.evaluate(async()=>{const pending=fusionOperators.run('hybrid.contact_audit');setTimeout(()=>fusionOperators.cancel(),10);try{await pending;return 'accepted';}catch(e){return e.message;}});
  assert.match(cancelled,/cancelled|scene changed/);await idle();assert.deepEqual(await state(),before);
  // Invalidation during topology preparation/native work must not open a result dialog.
  const stale=await page.evaluate(async()=>{const pending=fusionOperators.run('hybrid.contact_audit');setTimeout(()=>fusionEditor.evaluation.invalidate(),10);try{await pending;return 'accepted';}catch(e){return e.message;}});
  assert.match(stale,/cancelled|scene changed/);assert.deepEqual(await state(),before);assert.equal(await page.getByRole('dialog').count(),0);
  // A real detailed character garment remains immutable and inspectable.
  const prior=JSON.parse(fs.readFileSync(path.join(output,'physical-spine-ui-results.json'),'utf8')),project=JSON.parse(fs.readFileSync(prior.saved,'utf8'));
  await page.evaluate(async doc=>{await fusionEditor.load(doc);fusionEditor.select(fusionEditor.root.children.find(n=>n.userData.liveGarment?.fittedSurface));},project);
  await page.locator('[data-workspace="Clothing"]').click();const characterBefore=await state();await page.locator('#hybrid-contact-audit').click();await idle();
  assert.match(await page.getByRole('dialog').textContent(),/No measured non-adjacent cloth contacts/);const text=await page.getByRole('dialog').textContent();await page.locator('#cloth-contact-close').click();assert.deepEqual(await state(),characterBefore);
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'cloth-contact-ui-results.json'),JSON.stringify({passed:true,runtime,triangles,overlap,cancelled,stale,characterInspection:text,checks:['detailed overlapping panels','plain-pattern action in Clothing','read-only scene/history/frame','contact highlights excluded from project and identical GLB','Escape and revision clearing','stale highlights rejected with visible explanation','cancelled preparation','stale preparation','saved posed Genesis shirt inspection']},null,2));console.log('Cloth contact desktop PASS');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
