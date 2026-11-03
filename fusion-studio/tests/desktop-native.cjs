const {candidateLaunch}=require('./candidate-launch.cjs');
const {_electron:electron}=require('playwright');const assert=require('node:assert/strict');const path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
(async()=>{
 const output=path.join(root,'test-output'),packaged=process.argv.includes('--packaged')||!!process.env.FUSION_TEST_EXECUTABLE;const args=candidateLaunch(root,{packaged});
 const app=await electron.launch({...args,env:{...process.env,FUSION_DATA_DIR:path.join(output,'native-desktop-'+Date.now())},timeout:30000});const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.waitForFunction(()=>window.fusionEditor?.root.children.length>0);
  await page.evaluate(()=>fusionEditor.template('blank'));await page.locator('[data-workspace="Assets"]').click();
  await page.waitForFunction(()=>document.querySelector('#asset-count')?.textContent.includes('indexed')&&!document.querySelector('#asset-count')?.textContent.startsWith('0'),{},{timeout:120000});
  await page.locator('#asset-search').fill('Genesis 9.duf');await page.locator('[data-load-asset="7d8c17a236ad9321d55aadcd"]').click();await page.getByRole('dialog',{name:'Import Compatibility'}).waitFor({timeout:30000});
  const warnings=await page.getByRole('dialog').textContent();assert.match(warnings,/HD/);assert.match(warnings,/formula/);
  assert.equal(await page.evaluate(()=>fusionEditor.root.children.length),0);
  await page.locator('#confirm-import').click();await page.waitForFunction(()=>fusionEditor.selected?.userData.dazNative,{},{timeout:120000});
  const stats=await page.evaluate(()=>fusionCompatibility.inspectObject(fusionEditor.selected));assert.ok(stats.skinned>0);assert.ok(stats.morphs>0);assert.ok(stats.triangles>20000);
  await page.locator('[data-workspace="Character"]').click();assert.equal(await page.locator('#native-0').count(),1);assert.ok(await page.locator('#pose-joint option').count()>100);
  await page.locator('#native-0').fill('0');await page.locator('#native-0').dispatchEvent('input');await page.locator('#native-0').dispatchEvent('change');assert.equal(await page.evaluate(()=>fusionEditor.selected.userData.dazNative.properties[0].value),0);
  assert.ok(await page.evaluate(()=>{let ok=false;fusionEditor.selected.traverse(n=>{if(n.morphTargetDictionary?.['Navel HD']!==undefined&&n.morphTargetInfluences[n.morphTargetDictionary['Navel HD']]===0)ok=true;});return ok;}));
  const count=await page.evaluate(()=>fusionEditor.root.children.length);await page.locator('#editor-mode').selectOption('sculpt');await page.getByRole('dialog',{name:/Mesh compatibility/}).waitFor();assert.equal(await page.evaluate(()=>fusionEditor.root.children.length),count);await page.locator('#compat-cancel').click();
  await page.evaluate(()=>{const original=fusionEditor.selected;const frozen=fusionEditor.staticDuplicate();const s=fusionCompatibility.inspectObject(frozen);if(s.skinned||s.morphs)throw Error('Frozen copy retained deformation bindings');fusionEditor.root.remove(frozen);original.visible=true;fusionEditor.select(original);fusionEditor.commit();});
  const source=await page.evaluate(()=>fusionEditor.selected.userData.nativeSource),sourceHash=crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');assert.equal(sourceHash,'e20b4f3cfbdbfe0f9ef4be685ec3d35853aaac2ad7dbb4d6a5b3448e3406b9a2');
  await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Saved');await page.evaluate(()=>{fusionEditor.frame();document.querySelector('#toast').hidden=true;});await page.waitForTimeout(500);await page.screenshot({path:path.join(output,packaged?'packaged-native-ui.png':'native-asset-ui.png')});
  const result=await page.evaluate(async()=>{const data=await fusionEditor.glb();return await fusion.job({action:'render',data,name:'Native character render',params:{samples:16,width:800,height:800}});});assert.ok(fs.existsSync(result.output));
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,packaged?'packaged-native-results.json':'native-desktop-results.json'),JSON.stringify({passed:true,stats,originalSourceSha256:sourceHash,source,warningsBeforeImport:true,cancelPreservesScene:true,render:result.output,errors},null,2));console.log((packaged?'Packaged':'Development')+' native desktop PASS: asset browser, direct Genesis import, preflight warnings, rig/morphs, shaping cancellation, save, render.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

