const {_electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
(async()=>{
 const runtime=path.join(output,'radial-menu-ui-'+Date.now()),env={...process.env,FUSION_DATA_DIR:runtime};let app;const errors=[];
 try{
  app=await _electron.launch({args:[root],env,timeout:30000});const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>window.fusionKeyboard&&window.fusionRadial);if(await page.locator('#recovery-skip').count())await page.locator('#recovery-skip').click();
  const use=preset=>page.evaluate(p=>{fusionKeyboard.set({preset:p});document.activeElement?.blur();},preset);
  const menu=name=>page.getByRole('menu',{name});
  const item=label=>page.getByRole('menuitem',{name:new RegExp('^'+label)});
  const box=await page.locator('#viewport canvas').boundingBox(),at={x:box.x+box.width*.25,y:box.y+box.height*.6};
  await page.evaluate(()=>fusionEditor.template('blank'));await page.locator('[data-primitive="cube"]').click();await page.waitForFunction(()=>fusionEditor.root.children.length===1&&!fusionOperators.running);
  await use('blender');await page.mouse.move(at.x,at.y);
  // Tap opens the pie for clicking.
  await page.keyboard.press('z');await menu('Shading').waitFor();await item('Wireframe shading').click();assert.equal(await page.evaluate(()=>fusionEditor.wireframe),true);assert.equal(await menu('Shading').count(),0);
  // Hold, aim at a sector, release: runs the aimed item.
  await page.keyboard.down('z');await menu('Shading').waitFor();const solid=await item('Solid shading').boundingBox();await page.mouse.move(solid.x+solid.width/2,solid.y+solid.height/2,{steps:5});await page.waitForTimeout(300);await page.keyboard.up('z');
  assert.equal(await page.evaluate(()=>fusionEditor.wireframe),false);assert.equal(await menu('Shading').count(),0);
  await page.mouse.move(at.x,at.y);await page.keyboard.press('Backquote');await menu('View').waitFor();await page.keyboard.press('1');
  let c=await page.evaluate(()=>[fusionEditor.camera.position.x-fusionEditor.orbit.target.x,fusionEditor.camera.position.y-fusionEditor.orbit.target.y]);assert.ok(Math.abs(c[0])<1e-6&&Math.abs(c[1])<1e-6,'digit picks Front view');
  await page.evaluate(()=>{fusionEditor.selected.position.set(.234,.71,-.36);});await page.keyboard.press('Shift+s');await item('Selection to grid').click();await page.waitForFunction(()=>!fusionOperators.running);
  assert.deepEqual(await page.evaluate(()=>fusionEditor.selected.position.toArray()),[.2,.7,-.4]);await page.evaluate(()=>fusionEditor.undo());assert.equal(await page.evaluate(()=>fusionEditor.selected.position.x),.234,'snap is one undo step');
  await page.keyboard.press('Comma');await item('Local orientation').click();assert.equal(await page.evaluate(()=>fusionEditor.transform.space),'local');
  await page.keyboard.press('Control+Tab');await item('Edit mode').click();await page.waitForFunction(()=>fusionEditor.meshTools.mode==='edit'&&!fusionOperators.running);
  await page.mouse.click(at.x,at.y,{button:'right'});await menu('Edit').waitFor();assert.ok(await item('Extrude').count());await page.keyboard.press('Escape');assert.equal(await menu('Edit').count(),0);
  await page.keyboard.press('Control+Tab');await item('Object mode').click();await page.waitForFunction(()=>fusionEditor.meshTools.mode==='object');
  // Blender RMB context list stays open after a click.
  await page.mouse.click(at.x,at.y,{button:'right'});await menu('Object').waitFor();await item('Hide selected').click();assert.equal(await page.evaluate(()=>fusionEditor.root.children[0].visible),false);
  await page.keyboard.press('Alt+h');await page.evaluate(()=>fusionEditor.select(fusionEditor.root.children[0]));
  // Maya marking menu: hold right button, drag to an item, release.
  await use('maya');await page.mouse.move(at.x,at.y);await page.mouse.down({button:'right'});await menu('Object').waitFor();const dup=await item('Duplicate').boundingBox();await page.mouse.move(dup.x+dup.width/2,dup.y+dup.height/2,{steps:6});await page.mouse.up({button:'right'});
  await page.waitForFunction(()=>fusionEditor.root.children.length===2);assert.equal(await menu('Object').count(),0);
  // Maya Space: tap maximizes, hold opens the filterable hotbox.
  await page.keyboard.press('Space');assert.ok(await page.evaluate(()=>!!fusionEditor.quad),'Space tap toggles four views');await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>fusionEditor.quad),null);
  await page.keyboard.down('Space');await menu('Hotbox').waitFor();await page.keyboard.type('drop to');await page.keyboard.press('Enter');await page.keyboard.up('Space');
  await page.waitForFunction(()=>!fusionOperators.running);assert.ok(Math.abs(await page.evaluate(()=>fusionEditor.selected.position.y)-.5)<1e-6,'hotbox Drop to floor rests the unit cube on y=0');
  // 3ds Max quad menu.
  await use('max');await page.mouse.click(at.x,at.y,{button:'right'});await menu('Object').waitFor();assert.equal(await page.locator('.radial-quadrant').count(),4);assert.ok(await page.locator('.radial-quadrant.top-right').getByRole('menuitem',{name:/^Duplicate/}).count());await page.keyboard.press('Escape');
  // ZBrush brush popup with type-to-filter.
  await use('zbrush');await page.keyboard.press('b');await menu('Sculpt brush').waitFor();await page.keyboard.type('clay');await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>fusionEditor.meshTools.brush.type),'clay');
  // Fusion default keeps right-drag pan without a context menu.
  await use('fusion');const before=await page.evaluate(()=>fusionEditor.orbit.target.toArray());await page.mouse.move(at.x,at.y);await page.mouse.down({button:'right'});await page.mouse.move(at.x+80,at.y+30,{steps:6});await page.mouse.up({button:'right'});await page.waitForTimeout(400);
  assert.equal(await page.locator('.radial-menu').count(),0);assert.notDeepEqual(await page.evaluate(()=>fusionEditor.orbit.target.toArray()),before);
  await page.screenshot({path:path.join(output,'radial-menu-ui.png')});await page.evaluate(()=>localStorage.removeItem('fusion-keymap-v1'));
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'radial-menu-ui-results.json'),JSON.stringify({passed:true,checks:['Blender Z shading pie tap+click and hold+aim+release','` view pie digit selection','Shift+S snap pie (single undo)',', orientation pie','Ctrl+Tab mode pie','edit/object RMB context lists','Maya RMB marking menu drag-release','Maya Space tap four views / hold hotbox with filter','3ds Max quad menu','ZBrush B brush popup filter','Fusion RMB still pans'],errors,runtime},null,2));console.log('Radial menu desktop PASS');
 }finally{if(app)await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
