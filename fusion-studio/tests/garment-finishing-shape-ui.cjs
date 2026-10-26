const {_electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
(async()=>{
 const fixture=JSON.parse(fs.readFileSync(path.join(output,'garment-finishing-ui-results.json'),'utf8')),source=fixture.finalSaved,bytes=fs.readFileSync(source),doc=JSON.parse(bytes),runtime=path.join(output,'garment-finishing-shape-'+Date.now());
 const app=await _electron.launch({args:[root],env:{...process.env,FUSION_DATA_DIR:runtime},timeout:30000}),page=await app.firstWindow(),errors=[];let phase='load';page.on('pageerror',e=>errors.push(e.message));
 const idle=()=>page.waitForFunction(()=>!fusionOperators.running&&!document.querySelector('#app').classList.contains('busy'),{},{timeout:180000});
 const state=()=>page.evaluate(async()=>{
  const e=fusionEditor,g=e.root.children.find(n=>n.userData.liveGarment),c=e.root.children.find(n=>n.userData.fusion_id===g.userData.liveGarment.characterId);
  const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),v=>v.toString(16).padStart(2,'0')).join('');
  return {scene:await hash(e.serialize()),history:e.journal.cursor,frame:e.timeline.frame,finish:structuredClone(g.userData.liveGarment.finish),grading:structuredClone(g.userData.liveGarment.fittedDiagnostics.grading),sourcePositions:await hash(g.children[0].geometry.userData.garmentFinishSource.source.positions),width:c.userData.fusion_deformation.channels.find(p=>p.id==='fusion_width_fixture').value};
 });
 const liveState=()=>page.evaluate(()=>structuredClone(fusionEditor.root.children.find(n=>n.userData.liveGarment).userData.liveGarment));
 try{
  await page.waitForFunction(()=>window.fusionOperators);
  await page.evaluate(async doc=>{const e=fusionEditor;await e.load(doc);const g=e.root.children.find(n=>n.userData.liveGarment),c=e.root.children.find(n=>n.userData.fusion_id===g.userData.liveGarment.characterId);e.select(c);e.timeline.frame=9;},doc);
  await page.locator('[data-workspace="Character"]').click();const before=await state();assert.equal(before.width,1);
  phase='shape';console.log('Detailed shaping fixture loaded.');
  await page.evaluate(()=>fusionOperators.run('character.deform',{targetId:fusionEditor.selected.uuid,action:'set',channel:'fusion_width_fixture',value:.75}));await idle();
  const shaped=await state(),initialLive=await liveState();assert.equal(shaped.width,.75);assert.equal(shaped.history,before.history+1);assert.deepEqual(shaped.finish,before.finish);assert.notEqual(shaped.sourcePositions,before.sourcePositions);assert.notEqual(shaped.grading.circumferenceScale,before.grading.circumferenceScale);
  const linkedSummary=await page.locator('#linked-garment-fit-summary').textContent();assert.match(linkedSummary,/Maximum local strain/);if(!initialLive.diagnostics.converged)assert.match(linkedSummary,/Needs refinement/);
  console.log('Shaped default metrics',JSON.stringify({metrics:initialLive.metrics,diagnostics:initialLive.diagnostics}));
  await page.getByRole('button',{name:'Inspect garment fit',exact:true}).click();assert.equal(await page.evaluate(()=>!!fusionEditor.selected.userData.liveGarment),true);
  phase='refine';
  await page.getByText('Drape settings',{exact:true}).click();await page.locator('#hybrid-drape-iterations').fill('20');await page.locator('#hybrid-drape-apply').click();await idle();
  const changed=await state(),live=await liveState();assert.equal(changed.history,shaped.history+1);assert.equal(live.settings.iterations,20);assert.equal(live.settings.steps,initialLive.settings.steps);assert.deepEqual(changed.finish,before.finish);
  console.log('Explicitly refined shaping metrics',JSON.stringify({metrics:live.metrics,quality:live.quality,diagnostics:live.diagnostics,grading:live.fittedDiagnostics.grading}));
  assert.ok(live.metrics.triangles>=6000);assert.ok(live.quality.minAngleDegrees>=20);assert.ok(live.metrics.maxStrain<.5);assert.ok(live.metrics.seamGapAfter<.005);
  for(const key of ['bodyFaceIntersections','bodyInsideVertices','triangleClearanceViolations','pinDrift'])assert.equal(live.metrics[key],0,key);assert.equal(live.diagnostics.converged,true);
  assert.equal(live.finishDiagnostics.skippedPairs,0,'contact recovery must not open sewing pairs');assert.ok(live.finishDiagnostics.maximumSewingGap<=.0005,'every sewn pair stays inside the selected finishing tolerance');
  phase='audit';const audit=await page.evaluate(()=>fusionOperators.run('hybrid.contact_audit'));assert.equal(audit.complete,true);for(const key of ['crossings','coplanarOverlaps','clearanceViolations'])assert.equal(audit[key],0,key);await page.locator('#cloth-contact-close').click();
  phase='history';
  await page.locator('#undo').click();await idle();assert.equal((await state()).scene,shaped.scene);
  await page.locator('#undo').click();await idle();const undone=await state();assert.equal(undone.scene,before.scene);assert.equal(undone.frame,9);
  await page.locator('#redo').click();await idle();assert.equal((await state()).scene,shaped.scene);
  await page.locator('#redo').click();await idle();assert.equal((await state()).scene,changed.scene);
  phase='save';const saved=await page.evaluate(()=>fusion.save(fusionEditor.document('Shaped finished garment')));
  await page.evaluate(async file=>{const e=fusionEditor;await e.load(await fusion.loadRecent(file));const g=e.root.children.find(n=>n.userData.liveGarment);e.select(e.root.children.find(n=>n.userData.fusion_id===g.userData.liveGarment.characterId));},saved.path);assert.equal((await state()).scene,changed.scene);
  phase='render';const render=await page.evaluate(async()=>{const e=fusionEditor;return fusion.job({action:'render',name:'Shaped finished garment',data:await e.glb(false,{includeAnimations:false}),params:{samples:32,width:960,height:720,device:'CPU',camera:{position:[.9,1.65,1.9],target:[0,1.35,0],fov:32}}});});
  assert.ok(fs.statSync(render.output).size>10000);assert.deepEqual(fs.readFileSync(source),bytes);assert.deepEqual(errors,[]);
  const report={passed:true,runtime,source,sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'),saved:saved.path,render:render.output,widthBefore:before.width,widthAfter:changed.width,gradingBefore:before.grading,gradingAfter:changed.grading,finish:changed.finish,diagnostics:live.finishDiagnostics,metrics:live.metrics,quality:live.quality,defaultDrape:{metrics:initialLive.metrics,diagnostics:initialLive.diagnostics},refinedSettings:live.settings,audit,checks:['authored morph on detailed Genesis','linked fit diagnostics visible while shaping','explicit higher-iteration refinement on the same dense mesh','neutral grading and finishing retained','two gestures and frame-preserving undo/redo','raw simulation body and cloth contact gates','save/reopen','same-scene render','reference project unchanged'],errors};
  fs.writeFileSync(path.join(output,'garment-finishing-shape-results.json'),JSON.stringify(report,null,2));console.log('Finished garment shaping PASS',JSON.stringify(report));
 }catch(error){const project=await page.evaluate(()=>fusionEditor.document('Finishing shape failure')).catch(()=>null);fs.writeFileSync(path.join(output,'garment-finishing-shape-failure.json'),JSON.stringify({runtime,phase,error:error.message,stack:error.stack,project},null,2));await page.screenshot({path:path.join(output,'garment-finishing-shape-failure.png')}).catch(()=>{});throw error;}finally{await app.close().catch(()=>{});}
})().catch(error=>{console.error(error);process.exitCode=1;});
