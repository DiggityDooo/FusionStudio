// Extra real viewport views. Source files and capture frames stay local.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const workspace=path.resolve(__dirname,'..'),root=path.resolve(workspace,'../..');
const {_electron}=require(path.join(root,'node_modules/playwright')),{candidateLaunch}=require(path.join(root,'tests/candidate-launch.cjs'));
const ffmpeg=path.join(root,'test-output/media-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const preview=process.argv.includes('--preview'),catalogue=process.argv.includes('--catalogue'),group=catalogue?'catalogue':'variety',run=path.join(workspace,'local',`${group}-${Date.now()}`),dest=path.join(workspace,'local',group);fs.mkdirSync(run,{recursive:true});
const inventory=JSON.parse(fs.readFileSync(path.join(root,'test-output/rc-20261103/freeze-inventory.json')));
const bmw=inventory.originals.find(s=>s.path.endsWith('bmw27_cpu.blend'));
const hair=JSON.parse(fs.readFileSync(path.join(root,'test-output/rc-20261103/dson-manifest.json'))).fixtures.find(f=>f.id==='dson-8');
const optics=path.join(root,'test-output/github-showcase/fixtures/fusion-optical-instrument.blend');
const prior=JSON.parse(fs.readFileSync(path.join(workspace,'local/outputs/outputs.json')));
assert.equal(hash(bmw.path),bmw.sha256);assert.equal(hash(hair.source),hair.sha256);
const items=catalogue?JSON.parse(fs.readFileSync(path.join(workspace,'src/catalogue.json'))).map(row=>({...row,source:path.join(process.env.FUSION_DAZ_LIBRARY||'C:/Users/Public/Documents/My DAZ 3D Library',row.relative)})):[
 {id:'bmw-orbit',source:bmw.path,mode:'interchange',azimuth:2.35,elevation:.28,distance:1.6,exclude:['Floor','Light'],isolate:'carShell',label:'BMW / SHADED'},
 {id:'bmw-wire',source:bmw.path,mode:'interchange',azimuth:1.2,elevation:.55,distance:1.6,exclude:['Floor','Light'],isolate:'carShell',wire:true,label:'BMW / WIREFRAME'},
 {id:'hair-orbit',source:hair.source,azimuth:2.65,elevation:.05,distance:2.1,label:'DAZ MESH HAIR / REAR DETAIL'},
 {id:'optics-wire',source:optics,mode:'interchange',azimuth:-.65,elevation:.62,distance:2.2,exclude:['Studio_floor'],wire:true,label:'OPTICS / ELEVATED WIREFRAME'}
];
for(const item of items)if(item.sha256)assert.equal(hash(item.source),item.sha256,'Source changed '+item.id);
const inputHashes=items.map(item=>({source:item.source,sha256:hash(item.source)}));
const receipt={passed:false,method:'Actual frozen packaged Fusion viewport. 150 independently rendered deterministic camera poses per clip. Native wireframe toggle, original imported materials, no generated geometry or UI.',clips:[],checks:[]};
let app,page;const messages=[];
(async()=>{
 const launch=candidateLaunch(root,{packaged:true});receipt.asarSha256=hash(path.join(path.dirname(launch.executablePath),'resources/app.asar'));assert.equal(receipt.asarSha256,prior.asarSha256);
 app=await _electron.launch({...launch,env:{...process.env,FUSION_DATA_DIR:path.join(run,'app')},timeout:60000});page=await app.firstWindow();page.on('console',m=>messages.push(m.text()));page.on('pageerror',e=>messages.push(e.message));page.setDefaultTimeout(180000);await page.setViewportSize({width:2880,height:1620});await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));await page.waitForFunction(()=>window.fusionOperators);
 for(const item of items){
  await page.evaluate(()=>{fusionEditor.template('blank');fusionEditor.wire(false);});await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},item.source);
  await page.locator('#import-model').click();await page.locator('#confirm-import').waitFor();if(item.mode)await page.locator('#blend-mode').selectOption(item.mode);await page.locator('#confirm-import').click();await page.waitForFunction(()=>!fusionOperators.running&&!document.querySelector('#app').classList.contains('busy')&&fusionEditor.root.children.length);
  const state=await page.evaluate(item=>{const e=fusionEditor;e.root.updateMatrixWorld(true);const subject=item.isolate?e.root.getObjectByName(item.isolate):null;if(subject)subject.geometry.computeBoundingBox();const subjectBounds=subject?.geometry.boundingBox.clone().applyMatrix4(subject.matrixWorld).expandByScalar(.2);const meshes=[];e.root.traverse(n=>{if(n.isMesh){if(item.exclude?.some(s=>n.name===s||n.name.startsWith(s+'.'))||(subjectBounds&&(()=>{n.geometry.computeBoundingBox();const b=n.geometry.boundingBox.clone().applyMatrix4(n.matrixWorld);return !subjectBounds.containsPoint(b.getCenter(e.orbit.target.clone()));})()))n.visible=false;meshes.push({name:n.name,vertices:n.geometry.attributes.position.count,visible:n.visible});}});e.root.updateMatrixWorld(true);let bounds=null;for(const m of meshes.filter(m=>m.visible)){const n=e.root.getObjectByName(m.name);n.geometry.computeBoundingBox();const b=n.geometry.boundingBox.clone().applyMatrix4(n.matrixWorld);if(bounds)bounds.union(b);else bounds=b;}if(!bounds)throw Error('No visible geometry');const center=e.orbit.target.clone(),size=center.clone();bounds.getCenter(center);bounds.getSize(size);const distance=Math.max(size.x,size.y,size.z)*item.distance;e.settleOrbit();e.orbit.target.copy(center);e.select(null);e.grid.visible=false;return {meshes,center:center.toArray(),size:size.toArray(),distance};},item);
  assert.ok(state.meshes.some(m=>m.visible&&m.vertices>0));if(item.wire){await page.locator('#wireframe').click();assert.equal(await page.evaluate(()=>fusionEditor.wireframe),true);}
  const viewport=page.locator('#viewport'),box=await viewport.boundingBox();assert.ok(box.width>=1920&&box.height>=1080);const folder=path.join(run,item.id);fs.mkdirSync(folder);
  for(let frame=0;frame<(preview?1:150);frame++){
   await page.evaluate(async({item,state,frame})=>{const e=fusionEditor,a=item.azimuth-.3+.6*frame/149,r=state.distance,el=item.elevation+.04*Math.sin(frame/149*Math.PI);e.camera.position.set(state.center[0]+Math.sin(a)*r*Math.cos(el),state.center[1]+Math.sin(el)*r,state.center[2]+Math.cos(a)*r*Math.cos(el));e.camera.lookAt(e.orbit.target);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));},{item,state,frame});
   await viewport.screenshot({path:path.join(folder,String(frame).padStart(4,'0')+'.png')});
  }
  if(!preview){const file=item.id+'.mp4';execFileSync(ffmpeg,['-y','-hide_banner','-loglevel','error','-framerate','30','-i',path.join(folder,'%04d.png'),'-vf','scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080','-c:v','libx264','-crf','17','-pix_fmt','yuv420p','-an',path.join(run,file)],{windowsHide:true});receipt.clips.push({id:item.id,file,sha256:hash(path.join(run,file)),frames:150,width:1920,height:1080,sourceFile:path.basename(item.source),sourceSha256:hash(item.source),wireframe:!!item.wire,camera:{azimuth:item.azimuth,elevation:item.elevation,distance:state.distance,sweepRadians:.6},hiddenSceneObjects:item.exclude||[],geometry:state.meshes,capturedViewport:{width:box.width,height:box.height}});}
  fs.writeFileSync(path.join(folder,'view.json'),JSON.stringify(state,null,2));console.log('Captured '+item.id);
 }
 if(!preview){receipt.passed=true;for(const item of inputHashes)assert.equal(hash(item.source),item.sha256);assert.equal(hash(path.join(path.dirname(candidateLaunch(root,{packaged:true}).executablePath),'resources/app.asar')),receipt.asarSha256);receipt.checks=['Frozen ASAR unchanged','Source hashes checked before and after capture',`${items.length} fresh imports retain visible geometry`,'Wireframe uses actual app toggle',`${items.length*150} distinct camera poses rendered from actual viewport`];fs.mkdirSync(dest,{recursive:true});for(const clip of receipt.clips)fs.copyFileSync(path.join(run,clip.file),path.join(dest,clip.file));fs.writeFileSync(path.join(dest,group+'.json'),JSON.stringify(receipt,null,2)+'\n');}
 console.log(JSON.stringify({passed:true,preview,path:run,clips:items.length}));
})().catch(async e=>{console.error(e.stack);fs.writeFileSync(path.join(run,'failure.json'),JSON.stringify({error:e.stack,messages},null,2));await page?.screenshot({path:path.join(run,'failure.png')}).catch(()=>{});process.exitCode=1;}).finally(async()=>{await app?.close();});
