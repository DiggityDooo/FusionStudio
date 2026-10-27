const {_electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
(async()=>{
 const runtime=path.join(output,'keymap-ui-'+Date.now()),env={...process.env,FUSION_DATA_DIR:runtime};let app;const errors=[];
 const launch=async()=>{app=await _electron.launch({args:[root],env,timeout:30000});const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>window.fusionKeyboard&&window.fusionEditor);if(await page.locator('#recovery-skip').count())await page.locator('#recovery-skip').click();return page;};
 const read=page=>page.evaluate(()=>({p:fusionEditor.camera.position.toArray(),t:fusionEditor.orbit.target.toArray(),ortho:!!fusionEditor.camera.isOrthographicCamera}));
 // Orbit damping keeps easing after a drag; sample only once the view is at rest.
 const cam=async page=>{let last=await read(page);for(let i=0;i<60;i++){await page.waitForTimeout(100);const next=await read(page);if(Math.hypot(...next.p.map((v,j)=>v-last.p[j]))<1e-5)return next;last=next;}return last;};
 const moved=(a,b)=>Math.hypot(...a.p.map((v,i)=>v-b.p[i]))>1e-3;
 try{
  let page=await launch();await page.evaluate(()=>{localStorage.removeItem('fusion-keymap-v1');fusionEditor.template('blank');});
  await page.locator('[data-primitive="cube"]').click();await page.waitForFunction(()=>fusionEditor.root.children.length===1&&!fusionOperators.running);
  const canvas=page.locator('#viewport canvas'),box=await canvas.boundingBox(),corner={x:box.x+40,y:box.y+box.height-60};
  const drag=async(button,mods=[])=>{for(const m of mods)await page.keyboard.down(m);await page.mouse.move(corner.x,corner.y);await page.mouse.down({button});await page.mouse.move(corner.x+90,corner.y-40,{steps:6});await page.mouse.up({button});for(const m of mods)await page.keyboard.up(m);await page.waitForTimeout(150);};
  const focus=()=>page.evaluate(()=>document.activeElement?.blur());
  // Fusion default: original keys and navigation (middle drag orbits).
  await focus();await page.keyboard.press('r');assert.equal(await page.evaluate(()=>fusionEditor.transform.mode),'rotate');await page.keyboard.press('g');assert.equal(await page.evaluate(()=>fusionEditor.transform.mode),'translate');
  let before=await cam(page);await drag('middle');assert.ok(moved(before,await cam(page)),'Fusion middle drag orbits');
  await page.locator('#help').click();assert.ok(await page.getByRole('dialog',{name:'Fusion Studio Controls'}).getByText('Frame selected').count());await page.locator('#close-modal').click();
  // Preferences: switch to Maya.
  await page.locator('#edit-menu').click();await page.getByRole('button',{name:'Preferences…'}).click();await page.locator('#keymap-preset').selectOption('maya');
  assert.match(await page.locator('#keymap-navigation-hint').textContent(),/Alt LMB orbit/);await page.locator('#close-modal').click();
  await focus();await page.keyboard.press('e');assert.equal(await page.evaluate(()=>fusionEditor.transform.mode),'rotate');await page.keyboard.press('w');assert.equal(await page.evaluate(()=>fusionEditor.transform.mode),'translate');
  await page.keyboard.press('q');assert.equal(await page.evaluate(()=>fusionEditor.transform.object),undefined);await page.keyboard.press('w');assert.ok(await page.evaluate(()=>!!fusionEditor.transform.object));
  before=await cam(page);await drag('left');assert.ok(!moved(before,await cam(page)),'Maya plain left drag does not orbit');
  await drag('left',['Alt']);const orbited=await cam(page);assert.ok(moved(before,orbited),'Maya Alt+left drag orbits');
  await drag('right',['Alt']);const zoomed=await cam(page);assert.notEqual(Math.hypot(...zoomed.p.map((v,i)=>v-zoomed.t[i])).toFixed(4),Math.hypot(...orbited.p.map((v,i)=>v-orbited.t[i])).toFixed(4),'Maya Alt+right drag dollies');
  // Blender: numpad views, ortho toggle, local view, hide/reveal.
  await page.evaluate(()=>fusionKeyboard.set({...fusionKeyboard.settings,preset:'blender'}));await focus();
  await page.keyboard.press('Numpad1');let c=await cam(page);assert.ok(Math.abs(c.p[0]-c.t[0])<1e-6&&Math.abs(c.p[1]-c.t[1])<1e-6&&c.p[2]>c.t[2],'Numpad 1 front view');
  const dist=Math.hypot(...c.p.map((v,i)=>v-c.t[i]));await page.keyboard.press('Numpad5');c=await cam(page);assert.ok(c.ortho);assert.match(await page.locator('#view-label').textContent(),/Front Orthographic/);
  await page.keyboard.press('Numpad5');c=await cam(page);assert.ok(!c.ortho);assert.ok(Math.abs(Math.hypot(...c.p.map((v,i)=>v-c.t[i]))-dist)<1e-6,'ortho round-trip keeps framing');
  await page.keyboard.press('Control+Numpad7');c=await cam(page);assert.ok(c.p[1]<c.t[1],'Ctrl+Numpad 7 bottom view');
  await page.locator('[data-primitive="sphere"]').click();await page.waitForFunction(()=>fusionEditor.root.children.length===2&&!fusionOperators.running);await focus();
  await page.keyboard.press('NumpadDivide');assert.equal(await page.evaluate(()=>fusionEditor.localView?.size),1);
  assert.ok(await page.evaluate(()=>fusionEditor.serialize().object.children.every(o=>o.visible!==false)),'local view never saves objects hidden');
  await page.keyboard.press('NumpadDivide');assert.equal(await page.evaluate(()=>fusionEditor.localView),null);
  await page.keyboard.press('h');assert.equal(await page.evaluate(()=>fusionEditor.root.children.filter(o=>!o.visible).length),1);
  await page.keyboard.press('Alt+h');assert.equal(await page.evaluate(()=>fusionEditor.root.children.filter(o=>!o.visible).length),0);
  await page.keyboard.press('Control+z');await page.waitForFunction(()=>!fusionOperators.running);assert.equal(await page.evaluate(()=>fusionEditor.root.children.filter(o=>!o.visible).length),1,'reveal is undoable');
  before=await cam(page);await drag('middle');assert.ok(moved(before,await cam(page)),'Blender middle drag orbits');
  await page.locator('#timeline-scrub').fill('30');assert.equal(await page.evaluate(()=>fusionEditor.timeline.frame),30);await focus();await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>fusionEditor.timeline.frame),31);await page.keyboard.press('Shift+ArrowLeft');assert.equal(await page.evaluate(()=>fusionEditor.timeline.frame),1);
  await focus();await page.keyboard.press('Shift+a');await page.getByRole('dialog',{name:'Add'}).waitFor();await page.locator('#close-modal').click();
  // Unreal / Unity: right-button fly with WASD.
  await page.evaluate(()=>fusionKeyboard.set({...fusionKeyboard.settings,preset:'game'}));await focus();
  before=await cam(page);await page.mouse.move(corner.x,corner.y);await page.mouse.down({button:'right'});await page.keyboard.down('w');await page.waitForTimeout(400);await page.keyboard.up('w');await page.mouse.up({button:'right'});
  c=await cam(page);assert.ok(moved(before,c),'RMB + W flies');assert.equal(await page.evaluate(()=>fusionEditor.transform.mode),'translate','W during fly does not switch tools');
  // Custom binding through the editor, persisted across restart.
  await page.locator('#edit-menu').click();await page.getByRole('button',{name:'Preferences…'}).click();await page.locator('#keymap-filter').fill('grid');
  await page.locator('[data-bind="view.toggle_grid"]').click();await page.keyboard.press('k');assert.match(await page.locator('#keymap-message').textContent(),/K → Toggle grid/);
  await page.locator('[data-bind="view.toggle_grid"]').click();await page.keyboard.press('w');assert.match(await page.locator('#keymap-message').textContent(),/replaced Move/);
  await page.locator('#close-modal').click();await focus();const grid=await page.evaluate(()=>fusionEditor.grid.visible);await page.keyboard.press('k');assert.equal(await page.evaluate(()=>fusionEditor.grid.visible),!grid);
  await app.close();app=null;page=await launch();
  assert.deepEqual(await page.evaluate(()=>fusionKeyboard.settings.overrides),{k:'view.toggle_grid',w:'view.toggle_grid'});assert.equal(await page.evaluate(()=>fusionKeyboard.settings.preset),'game');
  await page.screenshot({path:path.join(output,'keymap-ui.png')});
  await page.evaluate(()=>localStorage.removeItem('fusion-keymap-v1'));
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'keymap-ui-results.json'),JSON.stringify({passed:true,checks:['Fusion keys and middle-drag orbit preserved','help lists active bindings','Maya QWER and Alt navigation; plain LMB does not orbit','Blender numpad views, ortho toggle round trip, bottom view','local view is display-only','hide/reveal undoable','Unreal/Unity RMB+WASD fly','custom binding with conflict report persists across restart'],errors,runtime},null,2));console.log('Keymap desktop PASS');
 }finally{if(app)await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
