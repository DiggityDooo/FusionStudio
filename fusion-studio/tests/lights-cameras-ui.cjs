const {_electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
(async()=>{
 const runtime=path.join(output,'lights-cameras-ui-'+Date.now()),env={...process.env,FUSION_DATA_DIR:runtime};let app;const errors=[];
 try{
  app=await _electron.launch({args:[root],env,timeout:30000});const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>window.fusionKeyboard&&window.fusionEditor);if(await page.locator('#recovery-skip').count())await page.locator('#recovery-skip').click();
  await page.evaluate(()=>{fusionKeyboard.set({preset:'blender'});fusionEditor.template('blank');});await page.locator('[data-primitive="cube"]').click();await page.waitForFunction(()=>fusionEditor.root.children.length===1&&!fusionOperators.running);
  const add=async label=>{await page.locator('#add-menu').click();await page.locator('[data-menu]',{hasText:new RegExp('^'+label+'$')}).click();await page.waitForFunction(()=>!fusionOperators.running);};
  const edit=async(id,value)=>{const f=page.locator('#'+id);if(typeof value==='boolean'){await f.setChecked(value);}else{await f.fill(String(value));await f.press('Tab');}};
  // Point light: inspector edits are undoable; colour temperature drives colour; studio key/rim step aside.
  await add('Point Light');assert.equal(await page.evaluate(()=>fusionEditor.selected.isPointLight),true);await page.locator('#light-panel').waitFor();
  await page.waitForFunction(()=>!fusionEditor.studioLights.key.visible&&!fusionEditor.studioLights.rim.visible);
  await edit('light-intensity',80);assert.equal(await page.evaluate(()=>fusionEditor.selected.intensity),80);await page.evaluate(()=>fusionEditor.undo());assert.equal(await page.evaluate(()=>fusionEditor.root.children.find(o=>o.isLight).intensity),40);
  await page.evaluate(()=>fusionEditor.select(fusionEditor.root.children.find(o=>o.isLight)));await edit('light-use-kelvin',true);await edit('light-kelvin',2700);
  const warm=await page.evaluate(()=>fusionEditor.selected.color.toArray());assert.ok(warm[0]>warm[2]*2,'2700 K is warm: '+warm);
  await page.locator('#light-intensity').fill('-5');await page.locator('#light-intensity').press('Tab');assert.equal(await page.evaluate(()=>fusionEditor.selected.intensity),40,'invalid values are rejected');
  await add('Spot Light');await edit('light-angle',60);assert.ok(Math.abs(await page.evaluate(()=>fusionEditor.selected.angle)-Math.PI/6)<1e-9);
  await add('Area Light');await edit('light-area',2);assert.equal(await page.evaluate(()=>fusionEditor.selected.userData.fusion_area),2);
  // Lights are picked through their viewport proxy.
  await page.evaluate(()=>{fusionEditor.root.children.find(o=>o.isPointLight).position.set(-1.2,2.2,1);fusionEditor.select(null);document.activeElement?.blur();});await page.waitForTimeout(200);
  const at=await page.evaluate(()=>{const l=fusionEditor.root.children.find(o=>o.isPointLight),p=l.getWorldPosition(l.position.clone()).project(fusionEditor.camera),r=fusionEditor.viewRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};});
  await page.mouse.click(at.x,at.y);assert.equal(await page.evaluate(()=>fusionEditor.selected?.isPointLight),true,'clicking the proxy selects the light');
  // Camera: first camera becomes active; Numpad 0 looks through it; Ctrl+Alt+Numpad 0 aligns it to the view (undoable).
  await add('Camera');const cam=await page.evaluate(()=>({id:fusionEditor.selected.uuid,active:fusionEditor.activeCamera()?.uuid}));assert.equal(cam.active,cam.id);
  await edit('camera-focal',50);await edit('camera-dof',true);await edit('camera-fstop',2);
  await page.evaluate(()=>{const c=fusionEditor.selected;c.position.set(4,2,6);c.lookAt(0,.5,0);c.updateMatrixWorld(true);fusionEditor.commit();document.activeElement?.blur();});
  await page.keyboard.press('Numpad0');assert.deepEqual(await page.evaluate(()=>fusionEditor.camera.position.toArray().map(v=>+v.toFixed(5))),[4,2,6]);assert.equal(await page.locator('#view-label').textContent(),'Camera Perspective');
  assert.ok(Math.abs(await page.evaluate(()=>fusionEditor.camera.fov-fusionEditor.activeCamera().fov))<1e-9);await page.keyboard.press('Numpad1');assert.equal(await page.evaluate(()=>fusionEditor.camera.fov),await page.evaluate(()=>fusionEditor.viewFov),'leaving camera view restores the viewport lens');
  await page.evaluate(()=>{fusionEditor.camera.position.set(-3,3,3);fusionEditor.orbit.update();});await page.keyboard.press('Control+Alt+Numpad0');await page.waitForFunction(()=>!fusionOperators.running);
  assert.deepEqual(await page.evaluate(()=>fusionEditor.activeCamera().position.toArray().map(v=>+v.toFixed(4))),await page.evaluate(()=>fusionEditor.camera.position.toArray().map(v=>+v.toFixed(4))));
  await page.evaluate(()=>fusionEditor.undo());assert.deepEqual(await page.evaluate(()=>fusionEditor.activeCamera().position.toArray().map(v=>+v.toFixed(5))),[4,2,6],'align is one undo step');
  // Persistence and glTF interchange.
  const reopened=await page.evaluate(async()=>{await fusionEditor.load(JSON.parse(JSON.stringify(fusionEditor.document('lights'))));const r=fusionEditor.root;return {lights:r.children.filter(o=>o.isLight).map(o=>o.userData.fusion_light).sort(),kelvin:r.children.find(o=>o.isPointLight).userData.fusion_kelvin,active:fusionEditor.activeCamera()?.userData.fusion_dof};});
  assert.deepEqual(reopened,{lights:['area','point','spot'],kelvin:2700,active:true});
  const gltf=await page.evaluate(async()=>{const bin=atob(await fusionEditor.glb()),b=Uint8Array.from(bin,c=>c.charCodeAt(0)),len=new DataView(b.buffer).getUint32(12,true);return JSON.parse(new TextDecoder().decode(b.subarray(20,20+len)));});
  assert.ok(gltf.extensionsUsed.includes('KHR_lights_punctual'));assert.equal(gltf.extensions.KHR_lights_punctual.lights.length,3);assert.equal(gltf.cameras.length,1);
  // Full render from the UI with the active scene camera.
  await page.locator('[data-workspace="Rendering"]').click();await page.locator('#render-camera').selectOption('scene');await page.locator('#render-samples').fill('16');await page.locator('#render-samples').press('Tab');
  await page.locator('#render-panel').click();await page.getByRole('dialog',{name:'Render Result'}).waitFor({timeout:180000});
  const jobs=path.join(runtime,'jobs'),job=fs.readdirSync(jobs).filter(d=>d.startsWith('render-')).sort().at(-1),result=JSON.parse(fs.readFileSync(path.join(jobs,job,'result.json'),'utf8'));
  assert.equal(result.camera.name,'Camera');assert.equal(result.camera.dof,true);assert.ok(Math.abs(result.camera.fstop-2)<1e-6);assert.deepEqual(result.lights.filter(l=>!l.studio).map(l=>l.type).sort(),['AREA','POINT','SPOT']);
  fs.copyFileSync(result.output,path.join(output,'lights-cameras-render.png'));await page.locator('#close-modal').click();await page.screenshot({path:path.join(output,'lights-cameras-ui.png')});
  await page.evaluate(()=>localStorage.removeItem('fusion-keymap-v1'));
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'lights-cameras-ui-results.json'),JSON.stringify({passed:true,checks:['Add menu point/spot/area lights and camera','undoable inspector edits with range validation','Kelvin colour temperature','studio key/rim yield to authored lights','proxy click selects lights','Numpad 0 camera view and lens restore','Ctrl+Alt+Numpad 0 align camera to view, one undo','project roundtrip keeps lights, temperature, active camera and DOF','GLB exports KHR_lights_punctual and camera','UI Cycles render uses the active camera with DOF and authored lights'],render:result.camera,errors,runtime},null,2));console.log('Lights and cameras desktop PASS');
 }finally{if(app)await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
