const {_electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
(async()=>{
 const packaged=process.argv.includes('--packaged');const runtime=path.join(output,'foundation-ui-'+Date.now()),env={...process.env,FUSION_DATA_DIR:runtime};let app;const errors=[];
 const launch=async()=>{app=await _electron.launch({...packaged?{executablePath:path.join(root,'release-v0.7.0/win-unpacked/Fusion Studio.exe')}:{args:[root]},env,timeout:30000});const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>window.fusionAreas&&window.fusionEditor);if(await page.locator('#recovery-skip').count())await page.locator('#recovery-skip').click();return page;};
 try{
  let page=await launch();await page.evaluate(()=>fusionEditor.template('blank'));
  await page.locator('[data-primitive="cube"]').click();await page.waitForFunction(()=>fusionEditor.root.children.length===1&&!fusionOperators.running);
  await page.locator('#position-x').fill('1.25');await page.locator('#position-x').press('Tab');await page.waitForFunction(()=>fusionEditor.selected.position.x===1.25&&!fusionOperators.running);assert.equal(await page.evaluate(()=>fusionEditor.journal.entries.at(-1).type),'transform');
  await page.locator('#undo').click();await page.waitForFunction(()=>fusionEditor.selected.position.x===0&&!fusionOperators.running);await page.locator('#redo').click();await page.waitForFunction(()=>fusionEditor.selected.position.x===1.25&&!fusionOperators.running);
  const historyCount=await page.evaluate(()=>fusionEditor.journal.entries.length);await page.evaluate(()=>document.activeElement.blur());await page.keyboard.press('F9');await page.getByRole('dialog',{name:'Adjust Last Transform'}).waitFor();await page.locator('#operator-transform-value').fill('2.25');await page.locator('#operator-transform-apply').click();await page.waitForFunction(()=>fusionEditor.selected.position.x===2.25&&!fusionOperators.running);assert.equal(await page.evaluate(()=>fusionEditor.journal.entries.length),historyCount);
  await page.evaluate(()=>fusionEditor.undo());assert.equal(await page.evaluate(()=>fusionEditor.selected.position.x),0);await page.evaluate(()=>fusionEditor.redo());assert.equal(await page.evaluate(()=>fusionEditor.selected.position.x),2.25);
  // Real split, keyboard-resize, editor swap and maximize/restore controls.
  await page.getByRole('button',{name:'Split ↔',exact:true}).click();assert.equal(await page.locator('.editor-area').count(),2);
  const divider=page.getByRole('separator',{name:'Resize editor areas'});await divider.focus();await divider.press('ArrowLeft');
  const ratio=await page.evaluate(()=>fusionAreas.tree.ratio);assert.equal(ratio,.625);
  await page.getByRole('combobox',{name:'Editor type'}).first().selectOption('log');assert.equal(await page.evaluate(()=>fusionAreas.leaves().filter(n=>n.type==='viewport').length),1);
  const viewportId=await page.evaluate(()=>fusionAreas.leaves().find(n=>n.type==='viewport').id);await page.locator(`[data-area="${viewportId}"]`).getByRole('button',{name:'Maximize',exact:true}).click();assert.equal(await page.locator('.editor-area').count(),1);await page.getByRole('button',{name:'Restore',exact:true}).click();assert.equal(await page.locator('.editor-area').count(),2);
  const saved=await page.evaluate(()=>JSON.stringify(fusionAreas.tree));await app.close();app=null;page=await launch();assert.equal(await page.evaluate(()=>JSON.stringify(fusionAreas.tree)),saved);
  await page.evaluate(async()=>{const e=fusionEditor;e.template('blank');const cube=await e.primitive('cube');cube.material=[cube.material,cube.material.clone()];e.commit();e.meshTools.setMode('edit');e.meshTools.activeMesh=cube;e.meshTools.faceIndex=0;});
  const before=await page.evaluate(()=>JSON.stringify(fusionEditor.serialize()));
  await page.evaluate(()=>{window.operatorResult='pending';fusionOperators.run('mesh.extrude_region',{distance:.2}).then(result=>window.operatorResult=result);});
  await page.getByRole('dialog',{name:'Operator compatibility'}).waitFor();await page.keyboard.press('Escape');await page.waitForFunction(()=>window.operatorResult===null&&!fusionOperators.running);assert.equal(await page.evaluate(()=>JSON.stringify(fusionEditor.serialize())),before);
  await page.evaluate(()=>{window.operatorResult='pending';fusionOperators.run('mesh.extrude_region',{distance:.2}).then(()=>window.operatorResult='complete');});
  await page.locator('#operator-proceed').click();await page.waitForFunction(()=>window.operatorResult==='complete'&&!fusionOperators.running);assert.equal(await page.evaluate(()=>fusionEditor.root.children.length),2);assert.equal(await page.evaluate(()=>fusionEditor.selected.geometry.index.count/3),20);
  await page.evaluate(()=>fusionEditor.undo());assert.equal(await page.evaluate(()=>fusionEditor.root.children.length),1);await page.evaluate(()=>fusionEditor.redo());assert.equal(await page.evaluate(()=>fusionEditor.root.children.length),2);
  await page.locator('#command-search').click();await page.locator('#command-query').fill('Add sphere');assert.equal(await page.getByRole('button',{name:'Add sphere',exact:true}).count(),1);await page.getByRole('button',{name:'Add sphere',exact:true}).click();await page.waitForFunction(()=>fusionEditor.selected.name==='Sphere'&&!fusionOperators.running);
  await page.screenshot({path:path.join(output,packaged?'foundation-packaged.png':'foundation-ui.png')});
  // Invoke the migrated Render operator through its real menu control.
  await page.locator('#render-menu').click();await page.getByRole('dialog',{name:'Render Result'}).waitFor({timeout:120000});assert.ok(await page.locator('.render-preview').getAttribute('src'));await page.locator('#close-modal').click();
  const logId=await page.evaluate(()=>fusionAreas.leaves().find(n=>n.type==='log').id);await page.locator(`[data-area="${logId}"]`).getByRole('button',{name:'Join',exact:true}).click();assert.equal(await page.locator('.editor-area').count(),1);
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,packaged?'foundation-packaged-results.json':'foundation-ui-results.json'),JSON.stringify({passed:true,checks:['primitive/operator routes','numeric transform delta undo/redo and F9 adjustment','split/resize/swap/maximize/join','layout restored after app restart','Escape cancels compatibility without execution','working-copy extrusion is one undo step','F3 registry entry','real Render operator'],errors,runtime},null,2));console.log('Foundation desktop PASS');
 }finally{if(app)await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
