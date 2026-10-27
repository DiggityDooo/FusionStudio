const {_electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
(async()=>{
 const runtime=path.join(output,'viewport-tools-ui-'+Date.now()),env={...process.env,FUSION_DATA_DIR:runtime};let app;const errors=[];
 try{
  app=await _electron.launch({args:[root],env,timeout:30000});const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>window.fusionKeyboard&&window.fusionEditor);if(await page.locator('#recovery-skip').count())await page.locator('#recovery-skip').click();
  await page.evaluate(()=>{fusionKeyboard.set({preset:'blender'});fusionEditor.template('blank');});await page.locator('[data-primitive="cube"]').click();await page.waitForFunction(()=>fusionEditor.root.children.length===1&&!fusionOperators.running);
  const view=async label=>{await page.locator('#view-menu').click();await page.locator('[data-menu]',{hasText:label}).click();};
  const cam=()=>page.evaluate(()=>[...fusionEditor.camera.position.toArray(),...fusionEditor.orbit.target.toArray()].map(v=>Math.round(v*1e6)/1e6));
  // Saved views: bookmark, move away, recall, survive project save/reopen.
  await view('Save view bookmark');const saved=await cam();
  await page.evaluate(()=>{fusionEditor.camera.position.set(9,1,-4);fusionEditor.orbit.target.set(1,0,0);});
  await view('View bookmarks');await page.getByRole('menu',{name:'View bookmarks'}).waitFor();await page.getByRole('menuitem',{name:'View 1'}).click();assert.deepEqual(await cam(),saved);
  const reopened=await page.evaluate(async()=>{const doc=fusionEditor.document('views');await fusionEditor.load(JSON.parse(JSON.stringify(doc)));return fusionEditor.bookmarks.map(b=>b.name);});assert.deepEqual(reopened,['View 1']);
  assert.match(await page.evaluate(async()=>{try{await fusionEditor.load({...fusionEditor.document('bad'),views:[{name:'x',position:[0,0],target:[0,0,0]}]});return 'loaded';}catch(e){return e.message;}}),/bookmarks are invalid/);
  // Turntable rotates without input and stops when toggled off (via F3 search).
  await view('Turntable preview');const a=await cam();await page.waitForTimeout(600);const b=await cam();assert.notDeepEqual(a,b,'turntable orbits');
  await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.press('F3');await page.locator('#command-query').fill('Turntable');await page.getByRole('button',{name:/^Turntable preview/}).click();
  await page.waitForTimeout(700);const c=await cam();await page.waitForTimeout(400);assert.deepEqual(await cam(),c,'turntable stopped');
  // Section cutaway (Blender Alt+B): clipped half is not drawn or pickable.
  await page.evaluate(()=>{fusionEditor.select(null);fusionEditor.view('front');document.activeElement?.blur();});await page.waitForTimeout(300);await page.keyboard.press('Alt+b');await page.getByRole('group',{name:'Section cutaway'}).waitFor();
  await page.locator('#section-axis').selectOption('x');await page.locator('#section-offset').evaluate(s=>{s.value='0';s.dispatchEvent(new Event('input'));});
  assert.equal(await page.evaluate(()=>fusionEditor.renderer.clippingPlanes.length),1);
  const at=x=>page.evaluate(x=>{const p=fusionEditor.root.children[0].position.clone();p.x+=x;p.project(fusionEditor.camera);const r=fusionEditor.viewRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};},x);
  let p=await at(.3);await page.mouse.click(p.x,p.y);assert.equal(await page.evaluate(()=>fusionEditor.selected),null,'clipped half is not pickable');
  p=await at(-.3);await page.mouse.click(p.x,p.y);assert.equal(await page.evaluate(()=>fusionEditor.selected?.name),'Cube','kept half is pickable');
  await page.locator('#section-flip').check();assert.ok(await page.evaluate(()=>fusionEditor.section.plane.distanceToPoint({x:.3,y:0,z:0,isVector3:true})>0));
  await page.screenshot({path:path.join(output,'viewport-tools-ui.png')});
  await page.locator('#section-close').click();assert.equal(await page.evaluate(()=>fusionEditor.renderer.clippingPlanes.length),0);assert.equal(await page.locator('#section-panel').count(),0);
  assert.ok(!(JSON.stringify(await page.evaluate(()=>fusionEditor.serialize()))).includes('clippingPlanes'),'section is never saved into materials');
  await page.evaluate(()=>localStorage.removeItem('fusion-keymap-v1'));
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'viewport-tools-ui-results.json'),JSON.stringify({passed:true,checks:['view bookmark save/recall','bookmarks persist in project document and are validated','turntable on/off (F3 search covers keymap actions)','Alt+B section cutaway clips drawing and picking, flip, close','section not serialized'],errors,runtime},null,2));console.log('Viewport tools desktop PASS');
 }finally{if(app)await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
