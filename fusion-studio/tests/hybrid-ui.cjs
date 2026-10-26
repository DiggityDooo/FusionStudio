const {_electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
(async()=>{
 const packaged=process.argv.includes('--packaged'),runtime=path.join(output,'hybrid-ui-'+Date.now());
 const app=await _electron.launch({...packaged?{executablePath:path.join(root,'release-v0.8.0/win-unpacked/Fusion Studio.exe')}:{args:[root]},env:{...process.env,FUSION_DATA_DIR:runtime},timeout:30000});
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.waitForFunction(()=>window.fusionOperators);await page.evaluate(()=>fusionEditor.template('blank'));await page.locator('[data-workspace="Character"]').click();
  await page.locator('#hybrid-create').click();await page.getByRole('dialog',{name:'Live garment compatibility'}).waitFor();assert.match(await page.getByRole('dialog').textContent(),/folds.*(?:intersect|fail)/);await page.locator('#hybrid-cancel').click();await page.waitForFunction(()=>!fusionOperators.running);assert.equal(await page.evaluate(()=>fusionEditor.root.children.length),0);
  await page.locator('#hybrid-create').click();await page.locator('#hybrid-proceed').click();await page.waitForFunction(()=>fusionEditor.root.children.some(n=>n.userData.liveGarment)&&!fusionOperators.running,{},{timeout:30000});
  if(!packaged){
    const beforeLimit=await page.evaluate(()=>JSON.stringify(fusionEditor.serialize())),limit=await page.evaluate(async()=>{try{await fusionOperators.run('hybrid.body',{height:2.1});return 'accepted';}catch(e){return e.message;}});assert.match(limit,/preview work limit/);assert.equal(await page.evaluate(()=>JSON.stringify(fusionEditor.serialize())),beforeLimit);
    await page.evaluate(()=>fusionEditor.select(fusionEditor.root.children.find(n=>n.userData.liveGarment)));await page.locator('[data-workspace="Clothing"]').click();await page.getByText('Drape settings',{exact:true}).click();await page.locator('#hybrid-drape-iterations').fill('6');const settingsHistory=await page.evaluate(()=>fusionEditor.journal.cursor);await page.locator('#hybrid-drape-apply').click();await page.waitForFunction(()=>!fusionOperators.running&&fusionEditor.selected.userData.liveGarment.settings.iterations===6);assert.equal(await page.evaluate(()=>fusionEditor.journal.cursor),settingsHistory+1);
    await page.locator('#undo').click();await page.waitForFunction(()=>!fusionOperators.running);assert.equal(await page.evaluate(()=>fusionEditor.selected.userData.liveGarment.settings.iterations),10);await page.locator('#redo').click();await page.waitForFunction(()=>!fusionOperators.running);assert.equal(await page.evaluate(()=>fusionEditor.selected.userData.liveGarment.settings.iterations),6);
    await page.evaluate(()=>fusionEditor.select(fusionEditor.root.children.find(n=>n.userData.character)));await page.locator('[data-workspace="Character"]').click();
  }
  const state=()=>page.evaluate(()=>{const character=fusionEditor.root.children.find(n=>n.userData.character),g=fusionEditor.root.children.find(n=>n.userData.liveGarment);return {height:character.userData.character.height,id:character.userData.fusion_id,garment:g.userData.liveGarment,positions:Array.from(g.children[0].geometry.attributes.position.array),history:fusionEditor.journal.cursor};});
  const first=await state();assert.equal(first.garment.characterId,first.id);assert.ok(first.garment.metrics.seamGapAfter<.01);
  await page.locator('#character-height').evaluate(n=>{n.value='2.1';n.dispatchEvent(new Event('change',{bubbles:true}));});await page.waitForFunction(()=>!fusionOperators.running&&fusionEditor.selected.userData.character.height===2.1);
  const tall=await state();assert.equal(tall.garment.body.height,2.1);assert.deepEqual(tall.garment.basePattern,first.garment.basePattern);assert.notDeepEqual(tall.positions,first.positions);assert.equal(tall.history,first.history+1);
  await page.locator('#undo').click();await page.waitForFunction(()=>!fusionOperators.running);const undone=await state();assert.equal(undone.height,1.8);assert.deepEqual(undone.positions,first.positions);
  await page.locator('#redo').click();await page.waitForFunction(()=>!fusionOperators.running);assert.deepEqual((await state()).positions,tall.positions);
  await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Saved');
  await page.evaluate(async()=>{const [p]=await fusion.recent();await fusionEditor.load(await fusion.loadRecent(p.path));fusionEditor.select(fusionEditor.root.children.find(n=>n.userData.character));});
  assert.deepEqual((await state()).positions,tall.positions);
  await page.locator('#character-height').evaluate(n=>{n.value='1.8';n.dispatchEvent(new Event('change',{bubbles:true}));});await page.waitForFunction(()=>!fusionOperators.running&&fusionEditor.selected.userData.character.height===1.8);
  assert.deepEqual((await state()).positions,first.positions);
  await page.locator('[data-pose="relaxed"]').click();await page.waitForFunction(()=>!fusionOperators.running);const posed=await state();assert.notDeepEqual(posed.positions,first.positions);
  await page.locator('[data-pose="T pose"]').click();await page.waitForFunction(()=>!fusionOperators.running);assert.deepEqual((await state()).positions,first.positions);
  // Inject a worker failure and verify atomic rollback of body and garment together.
  const before=await state();await page.evaluate(()=>{const g=fusionEditor.root.children.find(n=>n.userData.liveGarment);g.userData.liveGarment.settings.steps=999;});
  await page.locator('#character-height').evaluate(n=>{n.value='2';n.dispatchEvent(new Event('change',{bubbles:true}));});await page.waitForFunction(()=>!fusionOperators.running);const failed=await state();assert.equal(failed.height,before.height);assert.deepEqual(failed.positions,before.positions);
  await page.evaluate(()=>{const g=fusionEditor.root.children.find(n=>n.userData.liveGarment);g.userData.liveGarment.settings.steps=160;fusionEditor.select(g);});
  await page.locator('[data-workspace="Clothing"]').click();await page.locator('#hybrid-refit').click();await page.waitForFunction(()=>!fusionOperators.running);
  assert.match(await page.locator('#live-fit-status').textContent(),/Rust XPBD/);
  const panelBefore=await state();const objectId=await page.evaluate(()=>fusionEditor.selected.uuid);
  await page.locator('#pattern-designer').click();assert.match(await page.getByRole('dialog').textContent(),/reference size/);await page.locator('#pattern-name').fill('Discard me');await page.locator('#pattern-cancel').click();assert.deepEqual((await state()).positions,panelBefore.positions);
  await page.locator('#pattern-designer').click();
  for(const panel of ['front','back']){await page.locator('#pattern-panel').selectOption(panel);for(const i of [0,1]){const input=page.getByRole('spinbutton',{name:'Vertex '+i+' Y',exact:true});await input.fill('-.06');await input.press('Tab');}}
  await page.locator('#pattern-apply').click();await page.waitForFunction(()=>!fusionOperators.running);
  const panelAfter=await state();assert.notDeepEqual(panelAfter.positions,panelBefore.positions);assert.equal(await page.evaluate(()=>fusionEditor.root.children.length),2);assert.equal(await page.evaluate(()=>fusionEditor.selected.uuid),objectId);assert.equal(panelAfter.garment.basePattern.panels[0].points[0][1],-.06);
  await page.locator('#undo').click();await page.waitForFunction(()=>!fusionOperators.running);assert.deepEqual((await state()).positions,panelBefore.positions);
  await page.locator('#redo').click();await page.waitForFunction(()=>!fusionOperators.running);assert.deepEqual((await state()).positions,panelAfter.positions);
  await page.evaluate(()=>fusionEditor.select(fusionEditor.root.children.find(n=>n.userData.liveGarment)));
  await page.locator('#hybrid-strain').click();await page.waitForFunction(()=>!fusionOperators.running);assert.ok(await page.evaluate(()=>fusionEditor.selected.children[0].geometry.attributes.color));
  await page.evaluate(()=>document.querySelector('#toast').hidden=true);
  await page.screenshot({path:path.join(output,packaged?'hybrid-strain-packaged.png':'hybrid-strain.png')});
  await page.evaluate(async()=>{const doc=fusionEditor.document('Strain review');await fusionEditor.load(doc);fusionEditor.select(fusionEditor.root.children.find(n=>n.userData.liveGarment));});assert.equal(await page.evaluate(()=>fusionEditor.selected.userData.liveGarment.heatmap),true);
  await page.locator('#hybrid-strain').click();await page.waitForFunction(()=>!fusionOperators.running);assert.equal(await page.evaluate(()=>!!fusionEditor.selected.children[0].geometry.attributes.color),false);
  await page.evaluate(()=>document.querySelector('#toast').hidden=true);
  await page.screenshot({path:path.join(output,packaged?'hybrid-packaged.png':'hybrid-ui.png')});
  const render=await page.evaluate(async()=>{const r=await fusionOperators.run('render.image');return {output:r.output,metadata:r.metadata};});assert.ok(fs.statSync(render.output).size>10000);
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,packaged?'hybrid-packaged-results.json':'hybrid-ui-results.json'),JSON.stringify({passed:true,checks:['warning and cancel','native linked T-shirt','height regrade/drape','single-step undo/redo','save/reload and deterministic re-fit','pose and drape','worker failure rollback','Cycles render of current drape'],baseline:first.garment.metrics,tall:tall.garment.metrics,posed:posed.garment.metrics,render,runtime,errors},null,2));console.log('Hybrid UI PASS');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
