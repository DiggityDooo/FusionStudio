const {candidateLaunch}=require('./candidate-launch.cjs');
const {_electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
(async()=>{
 const {starterPattern,migratePattern}=await import('../src/patterns.js'),doc=migratePattern(starterPattern());doc.particleDistance=.011;
 doc.panels[0].holes=[{id:'opening',points:[[-.06,.2],[.06,.2],[.06,.34],[-.06,.34]],segments:[0,1,2,3].map(i=>({id:'opening_'+i,type:'line'}))}];doc.panels[0].internalLines=[{id:'fold',points:[[-.2,.1],[-.2,.5]]}];
 doc.seams=[{id:'partial',a:{panel:'front',segment:'front_s1',start:.17,end:.83},b:{panel:'back',segment:'back_s3',start:.09,end:.91},reverse:true}];
 const runtime=path.join(output,'pattern-apply-ui-'+Date.now()),app=await _electron.launch({...candidateLaunch(root),env:{...process.env,FUSION_DATA_DIR:runtime},timeout:30000}),page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const idle=()=>page.waitForFunction(()=>!fusionOperators.running&&!document.querySelector('#app').classList.contains('busy'),{},{timeout:40000});
 const state=()=>page.evaluate(()=>({scene:JSON.stringify(fusionEditor.serialize()),history:fusionEditor.journal.cursor,entries:fusionEditor.journal.entries.length,frame:fusionEditor.timeline.frame}));
 const start=async(doc,targetId=null)=>page.evaluate(({doc,targetId})=>{window.patternTask=fusionOperators.run('cloth.apply_pattern',{doc,targetId}).then(g=>({id:g.uuid,quality:structuredClone(g.userData.patternMeshQuality)}),e=>({error:e.message}));},{doc,targetId});
 const finish=async()=>{const result=await page.evaluate(()=>patternTask);await idle();return result;};
 const interrupted=async(action,document,targetId)=>{
  const opened=page.waitForEvent('worker',{predicate:w=>w.url().includes('surface-preparation-worker')});await start(document,targetId);const worker=await opened;
  const closed=new Promise(resolve=>{const timer=setTimeout(()=>resolve(false),5000);worker.once('close',()=>{clearTimeout(timer);resolve(true);});});
  await page.waitForFunction(()=>fusionOperators.running?.phase==='meshing');
  if(action==='cancel')await page.locator('#cancel-operation').click();else await page.evaluate(()=>fusionEditor.evaluation.invalidate());
  const result=await finish();assert.match(result.error,/cancelled|scene changed|changed during meshing/);assert.equal(await closed,true,'actual browser worker closes');return result.error;
 };
 try{
  await app.evaluate(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows())w.webContents.setBackgroundThrottling(false);});await page.waitForFunction(()=>window.fusionOperators);await page.evaluate(()=>fusionEditor.template('blank'));await page.locator('[data-workspace="Clothing"]').click();
  await page.evaluate(()=>{
   const Native=window.Worker;window.patternWorkerMessages=[];window.patternWorkerTerminations=0;
   window.Worker=class extends Native{constructor(url,options){const fault=window.patternWorkerFault;window.patternWorkerFault=null;super(fault==='load'?new URL('missing-pattern-worker.js',url):url,options);this.fault=fault;}
    postMessage(message){if(message.action==='patternMesh'){window.patternWorkerMessages.push(structuredClone(message.context));if(this.fault==='foreign')message={...message,context:{...message.context,revision:message.context.revision+1}};}super.postMessage(message);}
    terminate(){window.patternWorkerTerminations++;super.terminate();}};
  });
  const before=await state(),cancelled=await interrupted('cancel',doc);assert.deepEqual(await state(),before);
  const stale=await interrupted('stale',doc);assert.deepEqual(await state(),before);
  const failureRows=[];
  for(const fault of ['load','foreign']){await page.evaluate(fault=>{window.patternWorkerFault=fault;},fault);await start(doc);const result=await finish();assert.match(result.error,/failed|does not match/);assert.deepEqual(await state(),before);failureRows.push({fault,error:result.error});}
  await start({...doc,particleDistance:0});assert.match((await finish()).error,/Particle distance/);assert.deepEqual(await state(),before);
  await page.evaluate(()=>{window.frameGaps=[];window.frameRunning=true;let last=performance.now(),was=false;const tick=now=>{const running=!!fusionOperators.running;if(running||was)frameGaps.push(now-last);last=now;was=running;if(frameRunning)requestAnimationFrame(tick);};requestAnimationFrame(tick);});
  const began=performance.now();await start(doc);const applied=await finish();assert.equal(applied.error,undefined);const applyMilliseconds=performance.now()-began;assert.ok(applied.quality.triangles>=20000);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const frames=await page.evaluate(()=>{frameRunning=false;return frameGaps;});assert.ok(frames.length>=3);assert.ok(Math.max(...frames)<500,'meshing does not freeze the UI for the whole computation');
  const first=await state();assert.equal(first.history,before.history+1);assert.match(await page.locator('#pattern-mesh-status').textContent(),/Authored rest mesh/);
  await page.locator('#undo').click();await idle();assert.equal((await state()).scene,before.scene);await page.locator('#redo').click();await idle();assert.equal((await state()).scene,first.scene);
  await page.evaluate(id=>{const e=fusionEditor,g=e.root.getObjectByProperty('uuid',id);g.position.set(.2,.1,-.05);g.rotation.y=.12;g.scale.setScalar(.9);g.name='Detailed authored panels';e.select(g);e.commit();},applied.id);
  const prior=await state(),identity=await page.evaluate(()=>({uuid:fusionEditor.selected.uuid,id:fusionEditor.selected.userData.fusion_id,position:fusionEditor.selected.position.toArray(),quaternion:fusionEditor.selected.quaternion.toArray(),scale:fusionEditor.selected.scale.toArray()}));
  await interrupted('cancel',{...doc,color:'#a47748'},applied.id);assert.deepEqual(await state(),prior);
  await start({...doc,color:'#a47748'},applied.id);await page.waitForFunction(()=>fusionOperators.running?.phase==='meshing');await page.evaluate(()=>{fusionEditor.selected.position.x+=.01;});const concurrentlyChanged=await state(),changed=await finish();assert.match(changed.error,/changed during meshing/);assert.deepEqual(await state(),concurrentlyChanged);await page.evaluate(position=>fusionEditor.selected.position.fromArray(position),identity.position);
  await start({...doc,color:'#a47748'},applied.id);const updated=await finish();assert.equal(updated.id,applied.id);assert.deepEqual(await page.evaluate(()=>({uuid:fusionEditor.selected.uuid,id:fusionEditor.selected.userData.fusion_id,position:fusionEditor.selected.position.toArray(),quaternion:fusionEditor.selected.quaternion.toArray(),scale:fusionEditor.selected.scale.toArray()})),identity);
  const changedScene=await state();assert.equal(changedScene.history,prior.history+1);await page.locator('#undo').click();await idle();assert.equal((await state()).scene,prior.scene);await page.locator('#redo').click();await idle();assert.equal((await state()).scene,changedScene.scene);
  await page.evaluate(()=>{const e=fusionEditor;window.patternPriorCommands=e.journal.entries.slice();window.patternRealCommit=e.commit;e.commit=function(){patternRealCommit.call(this);this.journal.entries.splice(0,this.journal.entries.length-1);this.journal.onChange();throw Error('Injected pattern post-commit failure');};});
  let commitFailure;try{await start({...doc,color:'#629b86'},applied.id);commitFailure=await finish();}finally{await page.evaluate(()=>{fusionEditor.commit=patternRealCommit;});}assert.match(commitFailure.error,/pattern post-commit failure/);assert.deepEqual(await state(),changedScene);assert.equal(await page.evaluate(()=>fusionEditor.journal.entries.every((entry,i)=>entry===patternPriorCommands[i])&&fusionEditor.historyImages.pins.size===0),true);
  await page.locator('#undo').click();await idle();assert.equal((await state()).scene,prior.scene);await page.locator('#redo').click();await idle();assert.equal((await state()).scene,changedScene.scene);
  const safe=await state(),invalidTarget=await page.evaluate(async doc=>{try{await fusionOperators.run('cloth.apply_pattern',{doc,targetId:fusionEditor.root.uuid});return 'accepted';}catch(e){return e.message;}},doc);assert.match(invalidTarget,/authored flat pattern/);assert.deepEqual(await state(),safe);
  const saved=await page.evaluate(()=>fusion.save(fusionEditor.document('Responsive detailed pattern')));await page.evaluate(async file=>{await fusionEditor.load(await fusion.loadRecent(file));fusionEditor.select(fusionEditor.root.children.find(n=>n.userData.patternProject));},saved.path);assert.equal((await state()).scene,safe.scene);
  const metadata=await page.evaluate(()=>structuredClone(fusionEditor.selected.userData.patternMeshQuality));assert.deepEqual(metadata,updated.quality);
  const auditBefore=await state(),audit=await page.evaluate(()=>fusionOperators.run('hybrid.contact_audit'));assert.equal(audit.complete,true);assert.equal(audit.crossings,0);assert.equal(audit.coplanarOverlaps,0);await page.locator('#cloth-contact-close').click();assert.deepEqual(await state(),auditBefore);
  await page.evaluate(()=>{fusionEditor.selected.userData.simulationApplied=true;fusionEditor.commit();});const bakedBefore=await state();await interrupted('cancel',doc,applied.id);assert.deepEqual(await state(),bakedBefore);
  await start(doc,applied.id);const copy=await finish();assert.notEqual(copy.id,applied.id);assert.equal(await page.evaluate(id=>fusionEditor.root.getObjectByProperty('uuid',id).visible,applied.id),false);assert.equal(await page.evaluate(()=>fusionEditor.root.children.length),2);
  await page.bringToFront();await page.screenshot({path:path.join(output,'pattern-apply-ui.png')});assert.deepEqual(errors,[]);
  const report={passed:true,runtime,saved:saved.path,quality:metadata,audit,cancelled,stale,failureRows,commitFailure:commitFailure.error,applyMilliseconds,workflowMilliseconds:performance.now()-began,frameSamples:frames.length,maximumFrameGapMs:Math.max(...frames),meanFrameGapMs:frames.reduce((a,b)=>a+b,0)/frames.length,workers:await page.evaluate(()=>({requests:patternWorkerMessages,terminations:patternWorkerTerminations})),checks:['actual worker closes after cancel and stale revision','real missing-module failure recovery','foreign scene reply rejected','deep validation leaves no history','detailed holes/internal lines/partial sewing','UI frames continue during meshing','one undo/redo transaction','target identity and transforms retained','post-commit failure restores scene, pruned command identities and subsequent undo/redo','non-pattern replacement rejected','save/reopen quality metadata','baked source retained until success'],errors};fs.writeFileSync(path.join(output,'pattern-apply-ui-results.json'),JSON.stringify(report,null,2));console.log('Pattern apply desktop PASS',JSON.stringify({triangles:metadata.triangles,frames:frames.length,maximumFrameGapMs:report.maximumFrameGapMs}));
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
