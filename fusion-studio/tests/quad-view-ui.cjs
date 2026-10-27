const {_electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
(async()=>{
 const runtime=path.join(output,'quad-view-ui-'+Date.now()),env={...process.env,FUSION_DATA_DIR:runtime};let app;const errors=[];
 try{
  app=await _electron.launch({args:[root],env,timeout:30000});const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>window.fusionKeyboard&&window.fusionEditor);if(await page.locator('#recovery-skip').count())await page.locator('#recovery-skip').click();
  await page.evaluate(()=>{fusionKeyboard.set({preset:'fusion'});fusionEditor.template('blank');});await page.locator('[data-primitive="cube"]').click();await page.waitForFunction(()=>fusionEditor.root.children.length===1&&!fusionOperators.running);
  const box=await page.locator('#viewport canvas').boundingBox(),quadrant=(i,fx=.5,fy=.5)=>({x:box.x+box.width*((i%2)*.5+fx*.5),y:box.y+box.height*((i>1?.5:0)+fy*.5)});
  const settle=()=>page.waitForTimeout(600),state=()=>page.evaluate(()=>({active:fusionEditor.quad?.active??null,ortho:!!fusionEditor.camera.isOrthographicCamera,q:fusionEditor.camera.quaternion.toArray(),p:fusionEditor.camera.position.toArray()}));
  await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.press('Control+Alt+q');
  assert.equal(await page.evaluate(()=>fusionEditor.quad.views.length),4);assert.equal(await page.locator('.quad-overlay>div').count(),4);assert.equal((await state()).active,3);
  // The quadrant under the pointer becomes active, with its own camera and label.
  const top=quadrant(0);await page.mouse.move(top.x,top.y);let s=await state();assert.equal(s.active,0);assert.ok(s.ortho);assert.equal(await page.locator('#view-label').textContent(),'Top Orthographic');
  assert.deepEqual(await page.evaluate(([x,y])=>{const p=fusionEditor.ndc({clientX:x,clientY:y});return [Math.round(p.x*1e6)/1e6,Math.round(p.y*1e6)/1e6];},[top.x,top.y]),[0,0],'picking is relative to the active quadrant');
  // The gizmo drags in the view plane: from Top, the cube moves over the ground and keeps its height.
  const y0=await page.evaluate(()=>fusionEditor.selected.position.y);await page.mouse.down();await page.mouse.move(top.x+60,top.y+30,{steps:5});await page.mouse.up();await page.waitForFunction(()=>!fusionOperators.running);
  const dragged=await page.evaluate(()=>fusionEditor.selected.position.toArray());assert.ok(Math.abs(dragged[1]-y0)<1e-3&&dragged[0]>.1&&dragged[2]>.05,'top-view gizmo drag stays in the ground plane: '+dragged);
  // Side views do not rotate; they still pan.
  const corner=quadrant(0,.1,.9),q0=(await state()).q;await page.mouse.move(corner.x,corner.y);await page.mouse.down();await page.mouse.move(corner.x+60,corner.y-30,{steps:5});await page.mouse.up();await settle();
  assert.deepEqual((await state()).q.map(v=>v.toFixed(6)),q0.map(v=>v.toFixed(6)),'left drag does not rotate the top view');
  await page.mouse.move(top.x,top.y);await page.mouse.down({button:'right'});await page.mouse.move(top.x+60,top.y+30,{steps:5});await page.mouse.up({button:'right'});await settle();s=await state();
  assert.deepEqual(s.q.map(v=>v.toFixed(6)),q0.map(v=>v.toFixed(6)),'top view orientation is locked');
  // Select the cube by clicking it in the front view.
  await page.evaluate(()=>fusionEditor.select(null));const front=quadrant(1);await page.mouse.move(front.x,front.y);
  const hit=await page.evaluate(()=>{const v=fusionEditor.quad.views[1],o=fusionEditor.root.children[0].position.clone().project(v.camera),r=fusionEditor.viewRect();return {x:r.left+(o.x+1)*r.width/2,y:r.top+(1-o.y)*r.height/2};});
  await page.mouse.click(hit.x,hit.y);if(process.env.QUAD_DEBUG)console.log(hit,await page.evaluate(()=>({active:fusionEditor.quad.active,pos:fusionEditor.root.children[0].position.toArray(),n:fusionEditor.root.children.length,el:document.elementFromPoint(0,0)})));assert.equal(await page.evaluate(()=>fusionEditor.selected?.name),'Cube','click-select inside the front quadrant');
  // The user quadrant still orbits.
  const user=quadrant(3,.15,.85);await page.mouse.move(user.x,user.y);const before=await state();assert.equal(before.active,3);assert.ok(!before.ortho);
  await page.mouse.down();await page.mouse.move(user.x+70,user.y-20,{steps:6});await page.mouse.up();await settle();assert.notDeepEqual((await state()).p,before.p,'user view orbits');
  await page.screenshot({path:path.join(output,'quad-view-ui.png')});
  await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.press('Control+Alt+q');s=await state();assert.equal(s.active,null);assert.ok(!s.ortho);assert.equal(await page.locator('.quad-overlay').count(),0);
  // Maya Space tap toggles single / four views; 3ds Max Alt+W too.
  await page.evaluate(()=>{fusionKeyboard.set({preset:'maya'});document.activeElement?.blur();});await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.keyboard.press('Space');assert.ok(await page.evaluate(()=>!!fusionEditor.quad));await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>fusionEditor.quad),null);
  await page.evaluate(()=>fusionKeyboard.set({preset:'max'}));await page.keyboard.press('Alt+w');assert.ok(await page.evaluate(()=>!!fusionEditor.quad));await page.keyboard.press('Alt+w');
  await page.evaluate(()=>localStorage.removeItem('fusion-keymap-v1'));
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'quad-view-ui-results.json'),JSON.stringify({passed:true,checks:['four scissored views with overlay','hover activates quadrant camera and label','quadrant-relative picking','side views locked to pan/zoom','click-select in front view','user view orbits','toggle back restores single perspective','Maya Space tap and Max Alt+W toggle quad view'],errors,runtime},null,2));console.log('Quad view desktop PASS');
 }finally{if(app)await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
