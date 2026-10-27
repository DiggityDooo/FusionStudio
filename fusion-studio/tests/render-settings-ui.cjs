const {_electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
function writeSky(file){const w=64,h=32,header=Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${h} +X ${w}\n`,'latin1'),pixels=Buffer.alloc(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)pixels.set(y<h/2?[200,170,120,129]:[20,30,60,128],(y*w+x)*4);fs.writeFileSync(file,Buffer.concat([header,pixels]));return file;}
(async()=>{
 const runtime=path.join(output,'render-settings-ui-'+Date.now()),env={...process.env,FUSION_DATA_DIR:runtime};fs.mkdirSync(runtime,{recursive:true});const sky=writeSky(path.join(runtime,'studio-sky.hdr'));let app;const errors=[];
 try{
  app=await _electron.launch({args:[root],env,timeout:30000});const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>window.fusionEditor&&window.fusionKeyboard);if(await page.locator('#recovery-skip').count())await page.locator('#recovery-skip').click();
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},sky);
  await page.evaluate(()=>fusionEditor.template('blank'));await page.locator('[data-primitive="sphere"]').click();await page.waitForFunction(()=>fusionEditor.root.children.length===1&&!fusionOperators.running);
  await page.locator('[data-workspace="Rendering"]').click();
  const settings=()=>page.evaluate(()=>structuredClone(fusionEditor.renderSettings));
  // Quality preset, passes, EXR depth, transparency, shadow catcher floor and colour management.
  await page.locator('#render-quality').selectOption('draft');let s=await settings();assert.deepEqual([s.samples,s.render.adaptive,s.render.denoise],[16,.1,true]);assert.equal(await page.locator('#render-samples').inputValue(),'16');
  await page.locator('#render-samples').fill('9999');await page.locator('#render-samples').press('Tab');assert.equal((await settings()).samples,16,'out-of-range samples rejected');
  for(const pass of ['z','normal','crypto_object'])await page.locator(`[data-pass="${pass}"]`).check();await page.locator('#render-exr').selectOption('16');
  await page.locator('#render-transparent').check();await page.locator('#render-floor').selectOption('shadow_catcher');await page.locator('#render-view').selectOption('Standard');
  await page.locator('#render-size').selectOption('1920,1080');await page.locator('#render-width').fill('480');await page.locator('#render-width').press('Tab');await page.locator('#render-height').fill('270');await page.locator('#render-height').press('Tab');
  // HDRI world with viewport preview.
  await page.locator('#world-hdri').click();await page.waitForFunction(()=>fusionEditor.renderSettings.render.world.hdri);assert.match(await page.locator('#world-hdri-name').textContent(),/studio-sky\.hdr/);
  await page.locator('#world-strength').fill('1.5');await page.locator('#world-strength').press('Tab');await page.locator('#world-preview').check();
  await page.waitForFunction(()=>fusionEditor.scene.environment?.isTexture&&fusionEditor.scene.background===fusionEditor.environment);
  assert.equal(await page.evaluate(()=>fusionEditor.scene.environmentIntensity),1.5);
  // The environment alone lights the sphere (studio lights are off): its centre pixel is clearly lit.
  const lit=await page.evaluate(()=>new Promise(done=>{const e=fusionEditor;e.frame(e.root.children[0]);e.settleOrbit();requestAnimationFrame(()=>requestAnimationFrame(()=>{const r=e.renderer,gl=r.getContext(),c=r.domElement,px=new Uint8Array(4);gl.readPixels(Math.round(c.width/2),Math.round(c.height/2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);done([...px]);}));}));
  assert.ok(lit[0]+lit[1]+lit[2]>120,'environment lighting reaches surfaces: '+lit);await page.waitForFunction(()=>!fusionEditor.studioLights.key.visible&&fusionEditor.studioLights.ambient.intensity===0);
  s=await settings();assert.deepEqual(s.render.passes,['z','normal','crypto_object']);assert.equal(s.render.exr,'16');assert.deepEqual([s.width,s.height],[480,270]);
  // Settings persist in the project and invalid saved settings are rejected before loading.
  const doc=await page.evaluate(()=>JSON.parse(JSON.stringify(fusionEditor.document('render'))));assert.deepEqual(doc.render.render.passes,['z','normal','crypto_object']);
  assert.match(await page.evaluate(async d=>{try{await fusionEditor.load({...d,render:{...d.render,render:{...d.render.render,passes:['script']}}});return 'loaded';}catch(e){return e.message;}},doc),/render settings are invalid/);
  await page.evaluate(async d=>{fusionEditor.renderSettings.samples=99;await fusionEditor.load(d);},doc);assert.equal((await settings()).samples,16,'reopening restores saved settings');
  // Render: EXR beside the PNG with the chosen passes, transparent film, HDRI world.
  await page.locator('#render-panel').click();const dialog=page.getByRole('dialog',{name:'Render Result'});await dialog.waitFor({timeout:180000});assert.match(await dialog.textContent(),/multilayer EXR with 3 passes/);
  const jobs=path.join(runtime,'jobs'),job=fs.readdirSync(jobs).filter(d=>d.startsWith('render-')).sort().at(-1),result=JSON.parse(fs.readFileSync(path.join(jobs,job,'result.json'),'utf8'));
  assert.ok(fs.existsSync(result.exr));assert.deepEqual(result.passes,['z','normal','crypto_object']);assert.equal(result.transparent,true);assert.equal(result.view_transform,'Standard');assert.equal(path.basename(result.world.hdri),'studio-sky.hdr');assert.deepEqual(result.shadow_catchers,['Fusion studio floor']);
  assert.equal(fs.readFileSync(result.output)[25],6,'RGBA PNG');const header=fs.readFileSync(result.exr).subarray(0,32768).toString('latin1');for(const layer of ['Depth','Normal','CryptoObject00'])assert.ok(header.includes('ViewLayer.'+layer+'.'));
  fs.copyFileSync(result.output,path.join(output,'render-settings-render.png'));await page.locator('#close-modal').click();await page.screenshot({path:path.join(output,'render-settings-ui.png')});
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'render-settings-ui-results.json'),JSON.stringify({passed:true,checks:['quality presets and bounded samples','passes and multilayer EXR depth','transparent film, shadow catcher floor, view transform','custom output size','HDRI chooser, strength and viewport environment preview','settings saved in project, invalid saved settings rejected','UI render writes RGBA PNG and EXR with requested layers using the HDRI world'],errors,runtime},null,2));console.log('Render settings desktop PASS');
 }finally{if(app)await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
