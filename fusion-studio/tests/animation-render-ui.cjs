const {_electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
(async()=>{
 const runtime=path.join(output,'animation-render-ui-'+Date.now()),env={...process.env,FUSION_DATA_DIR:runtime};let app;const errors=[];
 try{
  app=await _electron.launch({args:[root],env,timeout:30000});const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>window.fusionEditor&&window.fusionKeyboard);if(await page.locator('#recovery-skip').count())await page.locator('#recovery-skip').click();
  await page.evaluate(()=>{fusionKeyboard.set({preset:'blender'});fusionEditor.template('blank');});await page.locator('[data-primitive="cube"]').click();await page.waitForFunction(()=>fusionEditor.root.children.length===1&&!fusionOperators.running);
  // Keyframe the cube on the Fusion timeline: x -1 at frame 1, +1 at frame 4.
  await page.evaluate(async()=>{const e=fusionEditor,c=e.selected;c.position.x=-1;e.timeline.evaluate(1);await e.timeline.insert();e.timeline.evaluate(4);c.position.x=1;await e.timeline.insert();});
  await page.locator('[data-workspace="Rendering"]').click();
  const set=async(id,v)=>{await page.locator('#'+id).fill(String(v));await page.locator('#'+id).press('Tab');};
  await set('render-samples',4);await set('render-width',160);await set('render-height',128);
  await page.locator('#anim-mode').selectOption('timeline');await page.locator('#anim-timeline').click();assert.deepEqual(await page.evaluate(()=>[fusionEditor.renderSettings.sequence.start,fusionEditor.renderSettings.sequence.end]),[1,120]);
  await set('anim-end',4);await page.locator('#anim-output').selectOption('png');
  await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.press('Control+F12');
  const dialog=page.getByRole('dialog',{name:'Animation Render Result'});await dialog.waitFor({timeout:300000});assert.match(await dialog.textContent(),/4 PNG frames · 4 frames at 24 fps · timeline animation/);
  const jobs=path.join(runtime,'jobs'),latest=()=>JSON.parse(fs.readFileSync(path.join(jobs,fs.readdirSync(jobs).filter(d=>d.startsWith('render-')).sort().at(-1),'result.json'),'utf8'));
  const seq=latest();assert.equal(seq.frames.length,4);assert.notEqual(fs.readFileSync(seq.frames[0]).toString('base64'),fs.readFileSync(seq.frames[3]).toString('base64'),'keyed motion renders');
  await page.locator('#close-modal').click();
  // Turntable to MP4 through the panel button.
  await page.locator('#anim-mode').selectOption('turntable');await page.locator('#anim-output').selectOption('mp4');await set('anim-end',6);
  await page.locator('#render-animation').click();await dialog.waitFor({timeout:300000});assert.match(await dialog.textContent(),/MP4 video \(H\.264\) · 6 frames/);
  const turn=latest();assert.equal(turn.mode,'turntable');assert.equal(fs.readFileSync(turn.video).subarray(4,8).toString('latin1'),'ftyp');await page.locator('#close-modal').click();
  const saved=await page.evaluate(()=>fusionEditor.document('anim').render.sequence);assert.deepEqual(saved,{mode:'turntable',start:1,end:6,fps:24,output:'mp4'});
  fs.copyFileSync(seq.frames[3],path.join(output,'animation-render-ui-frame4.png'));
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'animation-render-ui-results.json'),JSON.stringify({passed:true,checks:['timeline keys render as a 4-frame PNG sequence via Ctrl+F12','use timeline range','turntable MP4 (H.264) from the panel button','animation settings saved in the project'],errors,runtime},null,2));console.log('Animation render desktop PASS');
 }finally{if(app)await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
