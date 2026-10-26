const {_electron:electron}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..'),pkg=require('../package.json');
(async()=>{
 const output=path.join(root,'test-output');const results={};
 const executable=process.env.FUSION_TEST_EXECUTABLE||path.join(root,pkg.build.directories.output,'win-unpacked','Fusion Studio.exe');
 const app=await electron.launch({executablePath:executable,env:{...process.env,FUSION_DATA_DIR:path.join(output,'packaged-'+Date.now())},timeout:30000});
 const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
   await page.waitForFunction(()=>window.fusionEditor?.root.children.length>0);
   assert.equal(await page.locator('.brand span').textContent(),pkg.version);
   await page.locator('[data-primitive="cube"]').click();
   const before=await page.evaluate(()=>fusionEditor.stats(fusionEditor.selected).triangles);
   await page.locator('[data-job="subdivide"]').click();
   await page.locator('#mesh-settings-apply').click();
   await page.locator('#compat-copy').click();
   await page.waitForFunction(()=>!document.querySelector('#app').classList.contains('busy'),{},{timeout:120000});
   const after=await page.evaluate(()=>fusionEditor.stats(fusionEditor.selected).triangles);assert.ok(after>before);
   results.subdivision={before,after};
   await page.locator('#undo').click();await page.waitForTimeout(500);
   const doc=await page.evaluate(()=>fusionEditor.document('Packaged project'));assert.equal(doc.version,2);assert.ok(doc.projectId);
   const saved=await page.evaluate(d=>fusion.save(d),doc);assert.ok(fs.existsSync(saved.path));
   // Verify packaged worker, Blender scene helpers, and re-import without the huge studio floor.
   const data=await page.evaluate(()=>fusionEditor.glb());
   const blend=await page.evaluate(d=>fusion.job({action:'blend',data:d,name:'Packaged scene'}),data);results.blend=blend.output;
   const render=await page.evaluate(d=>fusion.job({action:'render',data:d,name:'Packaged render'}),data);results.render=render.output;
   const src=await page.evaluate(f=>fusion.image(f),render.output);assert.ok(src.startsWith('data:image/png;base64,'));
   // Exercise failure and cancellation through the actual IPC boundary.
   const bad=await page.evaluate(async()=>{try{await fusion.job({action:'eval'});return null;}catch(e){return e.message;}});assert.match(bad,/Unsupported/);
   const concurrent=await page.evaluate(async d=>{const first=fusion.job({action:'render',data:d,name:'Cancel test'}).catch(e=>e.message);await new Promise(r=>setTimeout(r,100));const second=await fusion.job({action:'glb',data:d}).catch(e=>e.message);await fusion.cancel();return {second,first:await first};},data);
   assert.match(concurrent.second,/already running/);assert.match(concurrent.first,/cancelled/);results.cancelled=true;
   await page.evaluate(()=>{fusionEditor.select(fusionEditor.root.children.find(o=>o.name==='Jacket shell'));document.querySelector('#toast').hidden=true;});
   await page.waitForTimeout(500);await page.screenshot({path:path.join(output,'packaged-ui.png')});
   assert.deepEqual(errors,[]);results.passed=true;
   fs.writeFileSync(path.join(output,'packaged-results.json'),JSON.stringify(results,null,2));console.log('Packaged app PASS: mesh operation, project save, BLEND, Cycles, invalid request, concurrency, cancellation.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
