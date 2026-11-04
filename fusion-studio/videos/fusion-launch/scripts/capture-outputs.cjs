// Fresh packaged-app viewport pixels, deterministic camera poses, no synthetic UI.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const workspace=path.resolve(__dirname,'..'),root=path.resolve(workspace,'../..');
const {_electron}=require(path.join(root,'node_modules/playwright')),{candidateLaunch}=require(path.join(root,'tests/candidate-launch.cjs'));
const ffmpeg=path.join(root,'test-output/media-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const run=path.join(workspace,'local',`outputs-${Date.now()}`),dest=path.join(workspace,'local/outputs');fs.mkdirSync(run,{recursive:true});
const prior=process.env.FUSION_CAPTURE_RUN||JSON.parse(fs.readFileSync(path.join(workspace,'local/last-capture.json'))).path;
const files=[];function walk(p){for(const f of fs.readdirSync(p,{withFileTypes:true})){const q=path.join(p,f.name);if(f.isDirectory())walk(q);else files.push(q);}}walk(path.join(prior,'app/jobs'));
const find=name=>{const file=files.find(p=>path.basename(p)===name);assert.ok(file,'Missing verified output '+name);return file;};
const mesh=find('Fusion launch - editable study.glb'),native=find('Fusion character study.png');
const capture=JSON.parse(fs.readFileSync(path.join(prior,'capture.json')));assert.ok(capture.passed);assert.ok(capture.exported.some(e=>e.sha256===hash(mesh)));
const blend=path.join(root,'test-output/github-showcase/fixtures/fusion-optical-instrument.blend');
assert.equal(hash(blend),capture.sources.find(s=>s.file===path.basename(blend)).sha256);
const garment=JSON.parse(fs.readFileSync(path.join(root,'test-output/rc-20261103/dson-manifest.json'))).fixtures.find(f=>f.id==='dson-7');assert.equal(hash(garment.source),garment.sha256);
const receipt={passed:false,method:'Packaged Fusion viewport screenshots at 30 deterministic camera poses per second; no interpolation or generated pixels. Cropped to viewport, downsampled to 1920x1080.',clips:[],native:{file:'native-output.png',sha256:hash(native),origin:'Verified preserved Blender Cycles render'},checks:[]};
let app,page;
(async()=>{
 const exe=path.join(root,require(path.join(root,'package.json')).build.directories.output,'win-unpacked/Fusion Studio.exe');receipt.asarSha256=hash(path.join(path.dirname(exe),'resources/app.asar'));assert.equal(receipt.asarSha256,capture.asarSha256);
 app=await _electron.launch({...candidateLaunch(root,{packaged:true}),env:{...process.env,FUSION_DATA_DIR:path.join(run,'app')},timeout:60000});page=await app.firstWindow();page.setDefaultTimeout(180000);await page.setViewportSize({width:2880,height:1620});await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));await page.waitForFunction(()=>window.fusionOperators);
 for(const item of [{id:'optics-orbit',source:blend,mode:'interchange',target:[0,1.3,0],radius:5.5,height:2.8},{id:'garment-orbit',source:garment.source},{id:'sculpt-orbit',source:mesh,target:[0,1.4,0],radius:4.9,height:1.9}]){
  await page.evaluate(()=>fusionEditor.template('blank'));await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},item.source);await page.locator('#import-model').click();await page.locator('#confirm-import').waitFor();if(item.mode)await page.locator('#blend-mode').selectOption(item.mode);await page.locator('#confirm-import').click();await page.waitForFunction(()=>!fusionOperators.running&&!document.querySelector('#app').classList.contains('busy')&&fusionEditor.root.children.length);
  const geometry=await page.evaluate(()=>{let vertices=0,bones=0;fusionEditor.root.traverse(n=>{if(n.isMesh)vertices+=n.geometry.attributes.position.count;if(n.isBone)bones++;});return {vertices,bones};});assert.ok(geometry.vertices>0);if(item.id==='garment-orbit')assert.equal(geometry.bones,24);
  const pose=await page.evaluate(item=>{const e=fusionEditor;e.select(e.root.children[0]);e.frame();if(item.target){e.orbit.target.set(...item.target);e.camera.position.set(0,item.height,item.radius);}else e.camera.position.sub(e.orbit.target).multiplyScalar(1.45).add(e.orbit.target);const p={target:e.orbit.target.toArray(),position:e.camera.position.toArray()};e.select(null);return p;},item);
  const viewport=page.locator('#viewport'),box=await viewport.boundingBox();assert.ok(box.width>=1920&&box.height>=1080);const folder=path.join(run,item.id);fs.mkdirSync(folder);
  for(let frame=0;frame<150;frame++){
   await page.evaluate(async({pose,frame})=>{const e=fusionEditor,dx=pose.position[0]-pose.target[0],dz=pose.position[2]-pose.target[2],r=Math.hypot(dx,dz),a=Math.atan2(dx,dz)-.4+.8*frame/149;e.camera.position.set(pose.target[0]+Math.sin(a)*r,pose.position[1],pose.target[2]+Math.cos(a)*r);e.camera.lookAt(e.orbit.target);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));},{pose,frame});
   await viewport.screenshot({path:path.join(folder,String(frame).padStart(4,'0')+'.png')});
  }
  const file=item.id+'.mp4';execFileSync(ffmpeg,['-y','-hide_banner','-loglevel','error','-framerate','30','-i',path.join(folder,'%04d.png'),'-vf','scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080','-c:v','libx264','-crf','17','-pix_fmt','yuv420p','-an',path.join(run,file)],{windowsHide:true});
  receipt.clips.push({id:item.id,file,sha256:hash(path.join(run,file)),frames:150,width:1920,height:1080,sourceSha256:hash(item.source),geometry,capturedViewport:{width:box.width,height:box.height}});console.log('Captured '+item.id);
 }
 receipt.passed=true;receipt.checks=['Frozen packaged ASAR matches original proof','Fresh imports have geometry; DAZ retains 24 bones','Sculpt output source matches verified export hash','450 independently rendered viewport poses; no frame duplication to fabricate motion'];fs.mkdirSync(dest,{recursive:true});for(const clip of receipt.clips)fs.copyFileSync(path.join(run,clip.file),path.join(dest,clip.file));fs.copyFileSync(native,path.join(dest,'native-output.png'));fs.writeFileSync(path.join(dest,'outputs.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({passed:true,clips:3}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{await app?.close();});
