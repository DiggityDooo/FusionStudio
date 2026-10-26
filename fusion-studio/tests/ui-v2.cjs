const {_electron:electron}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
 const output=path.join(root,'test-output');fs.mkdirSync(output,{recursive:true});const app=await electron.launch({args:[root],env:{...process.env,FUSION_DATA_DIR:path.join(output,'ui-v2-'+Date.now())},timeout:30000});const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.waitForFunction(()=>window.fusionEditor?.root.children.length>0);await page.waitForTimeout(700);
  await page.locator('[data-workspace="Character"]').click();await page.evaluate(()=>fusionEditor.select(fusionEditor.root.children.find(n=>n.userData.fusion_kind==='character')));
  const before=await page.evaluate(()=>fusionEditor.selected.userData.character.shoulders);
  await page.locator('#character-shoulders').fill('1.25');await page.locator('#character-shoulders').dispatchEvent('change');assert.equal(await page.evaluate(()=>fusionEditor.selected.userData.character.shoulders),1.25);
  await page.locator('[data-pose="wave"]').click();assert.ok(await page.evaluate(()=>fusionEditor.selected.userData.pose.UpperArm_L[2]>100));
  await page.locator('#editor-mode').selectOption('sculpt');await page.getByRole('dialog',{name:/Mesh compatibility/}).waitFor();assert.match(await page.getByRole('dialog').textContent(),/Rig or morph data/);await page.locator('#compat-cancel').click();assert.equal(await page.evaluate(()=>fusionEditor.meshTools.mode),'object');
  await page.locator('[data-workspace="Clothing"]').click();await page.evaluate(()=>fusionEditor.select(fusionEditor.root.children.find(n=>n.userData.fusion_kind==='garment')));await page.locator('#garment-length').fill('0.72');await page.locator('#garment-length').dispatchEvent('change');assert.equal(await page.evaluate(()=>fusionEditor.selected.userData.garment.length),.72);
  await page.locator('[data-workspace="Modeling"]').click();await page.locator('[data-primitive="cube"]').click();
  await page.locator('#position-x').fill('1.5');await page.locator('#position-x').press('Tab');assert.equal(await page.evaluate(()=>fusionEditor.selected.position.x),1.5);
  await page.locator('#insert-key').click();await page.locator('#frame-number').fill('25');await page.locator('#frame-number').press('Tab');await page.locator('#position-x').fill('3.5');await page.locator('#position-x').press('Tab');await page.locator('#insert-key').click();await page.locator('#frame-number').fill('13');await page.locator('#frame-number').press('Tab');assert.equal(await page.evaluate(()=>fusionEditor.selected.position.x),2.5);
  const snapshot=Buffer.from(await page.evaluate(()=>fusionEditor.glb(false,{includeAnimations:false})),'base64');const scene=JSON.parse(snapshot.subarray(20,20+snapshot.readUInt32LE(12)).toString().trim());assert.equal(scene.animations,undefined);assert.ok(scene.nodes.some(n=>n.name==='Cube'&&Math.abs((n.translation?.[0]??n.matrix?.[12]??0)-2.5)<.001));
  await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Saved');const doc=await page.evaluate(()=>fusionEditor.document('Roundtrip v2'));await page.evaluate(d=>fusionEditor.load(d),doc);assert.equal(await page.evaluate(()=>fusionEditor.timeline.keys().length),2);
  await page.locator('#coverage-button').click();assert.match(await page.getByRole('dialog').textContent(),/Parity still pending/);await page.locator('#close-modal').click();
  await page.evaluate(()=>{fusionEditor.template('studio');fusionEditor.select(fusionEditor.root.children.find(n=>n.userData.fusion_kind==='character'));document.querySelector('#toast').hidden=true;});await page.locator('[data-workspace="Character"]').click();await page.waitForTimeout(700);await page.screenshot({path:path.join(output,'studio-v2-ui.png')});
  const data=await page.evaluate(()=>fusionEditor.glb());fs.writeFileSync(path.join(output,'studio-v2.glb'),Buffer.from(data,'base64'));
  await page.evaluate(()=>{fusionEditor.select(fusionEditor.root.children.find(n=>n.userData.fusion_kind==='garment'));});const target=await page.evaluate(()=>fusionEditor.selected.userData.fusion_id);fs.writeFileSync(path.join(output,'studio-v2-cloth.json'),JSON.stringify({targetId:target}));
  // Topology jobs must use the same static-copy path required by compatibility.
  const staticData=await page.evaluate(async()=>{for(const original of [...fusionEditor.root.children]){fusionEditor.select(original);fusionEditor.staticDuplicate();}return fusionEditor.glb(false,{includeAnimations:false});});
  fs.writeFileSync(path.join(output,'studio-v2-static.glb'),Buffer.from(staticData,'base64'));
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'ui-v2-results.json'),JSON.stringify({passed:true,checks:['Blender-style workspaces','character proportions','rig pose','pre-operation compatibility warning','garment pattern changes','transforms','keyframes and interpolation','project roundtrip','coverage disclosure'],errors},null,2));console.log('UI v2 PASS');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
