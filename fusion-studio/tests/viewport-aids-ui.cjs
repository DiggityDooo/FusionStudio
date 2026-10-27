const {_electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
(async()=>{
 const runtime=path.join(output,'viewport-aids-ui-'+Date.now()),env={...process.env,FUSION_DATA_DIR:runtime};let app;const errors=[];
 try{
  app=await _electron.launch({args:[root],env,timeout:30000});const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>window.fusionKeyboard&&window.fusionEditor);if(await page.locator('#recovery-skip').count())await page.locator('#recovery-skip').click();
  await page.evaluate(()=>{fusionKeyboard.set({preset:'blender'});fusionEditor.template('blank');});await page.locator('[data-primitive="cube"]').click();await page.waitForFunction(()=>fusionEditor.root.children.length===1&&!fusionOperators.running);
  await page.locator('[data-primitive="capsule"]').click();await page.waitForFunction(()=>fusionEditor.selected?.name==='Capsule'&&!fusionOperators.running);assert.ok(await page.evaluate(()=>fusionEditor.selected.geometry.type==='CapsuleGeometry'));await page.evaluate(()=>fusionEditor.undo());assert.equal(await page.evaluate(()=>fusionEditor.root.children.length),1);
  await page.evaluate(()=>{const e=fusionEditor;e.select(null);e.view('front');e.frame(e.root);document.activeElement?.blur();});await page.waitForTimeout(800);
  const at=(x,y=0)=>page.evaluate(([x,y])=>{const p=fusionEditor.root.children[0].position.clone();p.x+=x;p.y+=y;p.z+=.5;p.project(fusionEditor.camera);const r=fusionEditor.viewRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};},[x,y]);
  const pixel=pt=>page.evaluate(({x,y})=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const r=fusionEditor.renderer,c=r.domElement,b=c.getBoundingClientRect(),gl=r.getContext(),px=new Uint8Array(4),k=c.width/b.width;gl.readPixels(Math.round((x-b.left)*k),Math.round(c.height-(y-b.top)*k),1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);done([...px]);}))),pt);
  // X-ray (Blender Alt+Z) changes what is drawn but never the saved materials.
  const center=await at(0);const solid=await pixel(center);await page.keyboard.press('Alt+z');assert.equal(await page.evaluate(()=>fusionEditor.xray),true);
  const seeThrough=await pixel(center);assert.ok(seeThrough.slice(0,3).some((v,i)=>Math.abs(v-solid[i])>12),`X-ray blends the surface: ${solid} -> ${seeThrough}`);
  const saved=await page.evaluate(()=>fusionEditor.serialize().materials.map(m=>[m.transparent??false,m.opacity??1,m.depthWrite??true]));assert.ok(saved.every(([t,o,d])=>t===false&&o===1&&d===true),'X-ray never saved: '+JSON.stringify(saved));
  await page.keyboard.press('Alt+z');assert.deepEqual(await pixel(center),solid,'X-ray off restores the solid draw');
  // Ruler (Fusion M): two surface clicks measure a known 0.6 m span on the cube's front face.
  await page.evaluate(()=>{fusionKeyboard.set({preset:'fusion'});document.activeElement?.blur();});await page.keyboard.press('m');assert.equal(await page.evaluate(()=>fusionEditor.measure.active),true);
  const a=await at(-.3),b=await at(.3);await page.mouse.click(a.x,a.y);await page.mouse.click(b.x,b.y);
  assert.ok(Math.abs(await page.evaluate(()=>fusionEditor.measure.items[0].distance)-.6)<1e-3);assert.equal(await page.locator('.measure-labels span').first().textContent(),'0.600 m');
  assert.equal(await page.evaluate(()=>fusionEditor.selected),null,'measuring does not select');await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>fusionEditor.measure.active),false);
  assert.ok(!JSON.stringify(await page.evaluate(()=>fusionEditor.serialize())).includes('Measurements'),'measurements stay out of the document');
  await page.locator('#view-menu').click();await page.locator('[data-menu]',{hasText:'Clear measurements'}).click();assert.equal(await page.locator('.measure-labels span').count(),0);
  // Reference image: imported as a view-facing, undoable plane that saves with the project but never exports or renders.
  const image=path.join(root,'docs','showcase','02-sculpting.png');await page.locator('#add-menu').click();const chooser=page.waitForEvent('filechooser');await page.locator('[data-menu]',{hasText:'Reference Image'}).click();await (await chooser).setFiles(image);
  await page.waitForFunction(()=>fusionEditor.root.children.some(o=>o.userData.fusion_reference));
  const ref=await page.evaluate(()=>{const o=fusionEditor.root.children.find(o=>o.userData.fusion_reference);return {name:o.name,map:!!o.material.map?.image,facing:o.quaternion.angleTo(fusionEditor.camera.quaternion)};});assert.equal(ref.name,'02-sculpting');assert.ok(ref.map);assert.ok(ref.facing<1e-6);
  const refs=()=>page.evaluate(()=>fusionEditor.root.children.filter(o=>o.userData.fusion_reference).length);await page.evaluate(()=>fusionEditor.undo());assert.equal(await refs(),0,'undo removes the reference');await page.evaluate(()=>fusionEditor.redo());assert.equal(await refs(),1,'redo restores it');
  const exported=await page.evaluate(async()=>{const bin=atob(await fusionEditor.glb()),bytes=Uint8Array.from(bin,c=>c.charCodeAt(0)),len=new DataView(bytes.buffer).getUint32(12,true),json=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+len)));return (json.nodes||[]).map(n=>n.name);});
  assert.ok(exported.includes('Cube')&&!exported.includes('02-sculpting'),'reference excluded from GLB/render: '+exported);
  const reopened=await page.evaluate(async()=>{await fusionEditor.load(JSON.parse(JSON.stringify(fusionEditor.document('ref'))));const o=fusionEditor.root.children.find(o=>o.userData.fusion_reference);return !!o?.material.map?.image;});assert.ok(reopened,'reference image survives save/reopen');
  await page.screenshot({path:path.join(output,'viewport-aids-ui.png')});await page.evaluate(()=>localStorage.removeItem('fusion-keymap-v1'));
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'viewport-aids-ui-results.json'),JSON.stringify({passed:true,checks:['Alt+Z X-ray changes drawn pixels, never saved materials, restores exactly','M ruler measures 0.600 m on a unit cube face without selecting','measurements not serialized; View > Clear measurements','reference image plane faces the view, excluded from GLB/render, survives save/reopen'],errors,runtime},null,2));console.log('Viewport aids desktop PASS');
 }finally{if(app)await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
