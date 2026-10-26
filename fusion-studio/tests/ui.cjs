const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
  const output=path.join(root,'test-output');fs.mkdirSync(output,{recursive:true});
  const app=await electron.launch({args:[root],env:{...process.env,FUSION_DATA_DIR:path.join(output,'ui-'+Date.now())},timeout:30000});
  const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.waitForFunction(()=>window.fusionEditor?.root.children.length>0);
    await page.waitForTimeout(1400);
    assert.equal(await page.locator('#app-count').textContent(),'4/4');
    const count=await page.evaluate(()=>fusionEditor.root.children.length);
    await page.locator('[data-primitive="cube"]').click();
    assert.equal(await page.evaluate(()=>fusionEditor.root.children.length),count+1);
    await page.locator('#position-x').fill('1.25');await page.locator('#position-x').press('Tab');
    assert.equal(await page.evaluate(()=>fusionEditor.selected.position.x),1.25);
    await page.locator('#duplicate').click();assert.equal(await page.evaluate(()=>fusionEditor.root.children.length),count+2);
    await page.locator('#delete').click();assert.equal(await page.evaluate(()=>fusionEditor.root.children.length),count+1);
    await page.locator('#undo').click();await page.waitForFunction(n=>fusionEditor.root.children.length===n,count+2);
    await page.locator('#redo').click();await page.waitForFunction(n=>fusionEditor.root.children.length===n,count+1);
    await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Version saved');
    const recent=await page.evaluate(()=>fusion.recent());assert.equal(recent.length,1);
    const original=fs.readFileSync(recent[0].path,'utf8');await page.locator('#save').click();await page.waitForTimeout(500);
    assert.equal(fs.readFileSync(recent[0].path,'utf8'),original);
    await page.locator('[data-tab="workflow"]').click();await page.locator('[data-workflow="marvelous"]').click();
    await page.getByRole('dialog').waitFor();assert.match(await page.getByRole('dialog').textContent(),/Shape the wardrobe/);await page.locator('#close-modal').click();
    await page.locator('[data-tab="model"]').click();
    // Restore the original starter scene, select its jacket, and capture the delivered canvas.
    await page.evaluate(()=>fusionEditor.template('character'));
    await page.evaluate(()=>fusionEditor.select(fusionEditor.root.children.find(o=>o.name==='Jacket shell')));
    await page.waitForTimeout(600);await page.evaluate(()=>document.querySelector('#toast').hidden=true);await page.screenshot({path:path.join(output,'studio-ui.png')});
    const data=await page.evaluate(()=>fusionEditor.glb());fs.writeFileSync(path.join(output,'starter.glb'),Buffer.from(data,'base64'));
    const before=await page.evaluate(()=>fusionEditor.root.children.length);
    const saved=await page.evaluate(()=>fusionEditor.document('Roundtrip'));
    await page.evaluate(async doc=>{await fusionEditor.load(doc);},saved);
    assert.equal(await page.evaluate(()=>fusionEditor.root.children.length),before);
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'ui-results.json'),JSON.stringify({passed:true,checks:['4 installed tools','primitive creation','numeric transform','duplicate/delete','undo/redo','versioned save','workflow dialog','project roundtrip','GLB generation'],errors},null,2));
    console.log('UI PASS: viewport, editing, save versions, workflows, project reload, GLB export.');
  }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
