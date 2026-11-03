const {candidateLaunch}=require('./candidate-launch.cjs');
const {_electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
(async()=>{
 const packaged=process.argv.includes('--packaged')||!!process.env.FUSION_TEST_EXECUTABLE,runtime=path.join(output,'modeling-ui-'+Date.now());
 const app=await _electron.launch({...candidateLaunch(root,{packaged}),env:{...process.env,FUSION_DATA_DIR:runtime},timeout:30000});
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const settled=()=>page.waitForFunction(()=>!fusionOperators.running&&!document.querySelector('#app').classList.contains('busy'));
 try{
  await page.waitForFunction(()=>window.fusionOperators);await page.evaluate(async()=>{fusionEditor.template('blank');await fusionEditor.primitive('cube');});
  await page.locator('[data-workspace="Modeling"]').click();
  const snapshot=await page.evaluate(()=>JSON.stringify(fusionEditor.serialize())),history=await page.evaluate(()=>fusionEditor.journal.entries.length);
  await page.locator('[data-job="array"]').click();await page.getByRole('dialog',{name:'Array Settings',exact:true}).waitFor();
  await page.locator('#mesh-param-count').fill('4');await page.locator('#mesh-param-axis').selectOption('X');await page.locator('#mesh-settings-apply').click();
  await page.getByRole('dialog',{name:'Mesh compatibility — array',exact:true}).waitFor();assert.match(await page.getByRole('dialog').textContent(),/Editable modifier working copy/);
  await page.keyboard.press('Escape');await settled();assert.equal(await page.evaluate(()=>JSON.stringify(fusionEditor.serialize())),snapshot);
  assert.equal(await page.evaluate(()=>fusionEditor.journal.entries.length),history);
  await page.locator('[data-job="array"]').click();assert.equal(await page.locator('#mesh-param-count').inputValue(),'4');await page.locator('#mesh-settings-apply').click();await page.locator('#compat-copy').click();
  await page.waitForFunction(()=>fusionEditor.root.children.length===2&&!fusionOperators.running);assert.equal(await page.evaluate(()=>fusionEditor.stats(fusionEditor.selected).triangles),48);
  assert.equal(await page.evaluate(()=>fusionEditor.journal.entries.length),history+1);
  assert.equal(await page.evaluate(()=>fusionEditor.root.children.filter(n=>n.visible).length),1);
  await page.locator('#undo').click();await settled();assert.equal(await page.evaluate(()=>JSON.stringify(fusionEditor.serialize())),snapshot);
  await page.locator('#redo').click();await settled();assert.equal(await page.evaluate(()=>fusionEditor.root.children.length),2);
  await page.evaluate(()=>fusionEditor.select(fusionEditor.root.children.find(n=>n.visible)));
  // Search reaches the same configurable operator, and no duplicate command exists.
  await page.locator('#command-search').click();await page.locator('#command-query').fill('Twist');assert.equal(await page.locator('#command-list').getByRole('button',{name:'Twist',exact:true}).count(),1);await page.locator('#command-list').getByRole('button',{name:'Twist',exact:true}).click();await page.getByRole('dialog',{name:'Twist Settings',exact:true}).waitFor();await page.locator('#mesh-settings-cancel').click();
  // IPC validation failure after accepting a working copy rolls the entire scene back.
  const beforeFailure=await page.evaluate(()=>JSON.stringify(fusionEditor.serialize())),historyBefore=await page.evaluate(()=>fusionEditor.journal.entries.length);
  await page.evaluate(()=>{window.testFailure=null;fusionOperators.run('mesh.process_array',{count:3.5}).catch(e=>window.testFailure=e.message);});await page.locator('#compat-copy').click();await page.waitForFunction(()=>!!window.testFailure&&!fusionOperators.running);assert.match(await page.evaluate(()=>window.testFailure),/Invalid Copies/);
  assert.equal(await page.evaluate(()=>JSON.stringify(fusionEditor.serialize())),beforeFailure);assert.equal(await page.evaluate(()=>fusionEditor.journal.entries.length),historyBefore);
  // Rigged data requires an explicit static copy, before a job exists.
  await page.evaluate(()=>{fusionEditor.template('studio');fusionEditor.select(fusionEditor.root.children.find(n=>n.userData.fusion_kind==='character'));});
  await page.locator('[data-job="taper"]').click();await page.locator('#mesh-settings-apply').click();await page.locator('#compat-static').waitFor();assert.match(await page.getByRole('dialog').textContent(),/Rig or morph data/);await page.locator('#compat-cancel').click();await settled();
  // Save/reload retains the new geometry and hidden source.
  await page.evaluate(async()=>{fusionEditor.template('blank');await fusionEditor.primitive('cube');});await page.locator('[data-job="wireframe"]').click();await page.locator('#mesh-param-amount').fill('0.04');await page.locator('#mesh-settings-apply').click();await page.locator('#compat-copy').click();await page.waitForFunction(()=>fusionEditor.root.children.length===2&&!fusionOperators.running);
  const tris=await page.evaluate(()=>fusionEditor.stats().triangles);await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Saved');await page.evaluate(async()=>{const projects=await fusion.recent();await fusionEditor.load(await fusion.loadRecent(projects[0].path));});assert.equal(await page.evaluate(()=>fusionEditor.stats().triangles),tris);
  await page.evaluate(()=>fusionEditor.select(fusionEditor.root.children.find(n=>n.visible)));await page.locator('[data-job="twist"]').click();await page.screenshot({path:path.join(output,packaged?'modeling-packaged.png':'modeling-ui.png')});await page.locator('#mesh-settings-cancel').click();
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,packaged?'modeling-packaged-results.json':'modeling-ui-results.json'),JSON.stringify({passed:true,checks:['editable settings','warning before mutation','Escape preserves scene','array changes geometry','one-step undo/redo','F3 command','invalid job rolls back copy','rig preflight','saved geometry roundtrip'],runtime,errors},null,2));console.log('Modeling desktop PASS');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
