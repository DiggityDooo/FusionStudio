/* Documentation capture, not a product feature. Uses real UI gestures and isolated
 * FUSION_DATA_DIR. CDP frames are actual app pixels; titles are added outside the UI.
 * Prerequisites: build, local CC0 foundation, fixture generator, local ffmpeg.
 */
const {_electron} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const scratch = path.join(root, 'test-output/github-showcase');
const output = path.join(root, 'docs/showcase/2026-10-26');
const ffmpeg = process.env.FUSION_MEDIA_FFMPEG || path.join(scratch, '../media-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe');
const mode = process.argv[2] || 'all';
fs.mkdirSync(output, {recursive:true});
fs.mkdirSync(scratch, {recursive:true});
for (const [from,to] of [['segoeui.ttf','regular.ttf'],['seguisb.ttf','semibold.ttf']]) {
  fs.copyFileSync(path.join(process.env.SystemRoot || 'C:/Windows','Fonts',from),path.join(scratch,to));
}
const posDigest = async page => page.evaluate(async()=>{
  // JSON preserves numerical geometry, but canonicalizes -0 to +0. Compare
  // canonical numeric positions, not that semantically irrelevant sign bit.
  const source=fusionEditor.selected.geometry.attributes.position.array;
  const a=new Float32Array(source.length);for(let i=0;i<a.length;i++)a[i]=source[i]===0?0:source[i];
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a))).map(v=>v.toString(16).padStart(2,'0')).join('');
});
const manifest = {date:'2026-10-26',appVersion:require('../package.json').version,
  capture:'Real Electron UI; 1920×960 source, chapter titles outside UI; output 1920×1080 H.264 at 30 fps. No generated UI or synthetic render replacements.',
  sources:['Original procedural optical instrument and stoneware fixtures','Verified CC0 MakeHuman/MPFB starter assets; no private Genesis or paid library content'],workflows:[]};
let app,page,cdp;
const pause = ms=>page.waitForTimeout(ms);
const idle = ()=>page.waitForFunction(()=>!fusionOperators.running&&!document.querySelector('#app').classList.contains('busy'),null,{timeout:180000});
const cleanHelpers = ()=>page.evaluate(()=>{fusionEditor.outline.visible=false;fusionEditor.transform.detach();});
const shot = async name=>{await cleanHelpers();await pause(300);await page.screenshot({path:path.join(output,name+'.png')});};
const change = async(selector,value)=>{await page.locator(selector).fill(String(value));await page.locator(selector).press('Tab');await idle();await pause(550);};

async function record(name,title,subtitle,action){
  const dir=path.join(scratch,name);fs.mkdirSync(dir,{recursive:true});
  const frames=[],writes=[];let active=true,last=-Infinity;
  const onframe=event=>{
    cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(()=>{});
    const time=event.metadata.timestamp;
    if(!active||time-last<1/31)return;
    last=time;
    const file=path.join(dir,`frame-${String(frames.length).padStart(5,'0')}.jpg`);
    frames.push({file,time});writes.push(fs.promises.writeFile(file,Buffer.from(event.data,'base64')));
  };
  cdp.on('Page.screencastFrame',onframe);
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:92,maxWidth:1920,maxHeight:960,everyNthFrame:1});
  const started=Date.now();
  try{await pause(700);await action();await pause(1700);}finally{
    active=false;await cdp.send('Page.stopScreencast');cdp.off('Page.screencastFrame',onframe);await Promise.all(writes);
  }
  assert.ok(frames.length>2,`${name} must contain real captured motion`);
  let concat='';
  for(let i=0;i<frames.length;i++){
    concat+=`file '${path.basename(frames[i].file)}'\nduration ${i+1<frames.length?Math.min(3,Math.max(1/60,frames[i+1].time-frames[i].time)):1.2}\n`;
  }
  concat+=`file '${path.basename(frames.at(-1).file)}'\n`;
  fs.writeFileSync(path.join(dir,'frames.txt'),concat);
  fs.writeFileSync(path.join(scratch,'title.txt'),title);
  fs.writeFileSync(path.join(scratch,'subtitle.txt'),subtitle);
  const rel = file=>path.relative(root,file).replaceAll('\\','/');
  const filter=`fps=30,pad=1920:1080:0:120:color=0x111822,drawtext=fontfile=${rel(path.join(scratch,'semibold.ttf'))}:textfile=${rel(path.join(scratch,'title.txt'))}:fontcolor=0xf2f5f7:fontsize=38:x=36:y=18,drawtext=fontfile=${rel(path.join(scratch,'regular.ttf'))}:textfile=${rel(path.join(scratch,'subtitle.txt'))}:fontcolor=0xaabccd:fontsize=23:x=38:y=72`;
  const target=path.join(scratch,name+'.mp4');
  execFileSync(ffmpeg,['-y','-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',path.join(dir,'frames.txt'),'-vf',filter,'-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart','-an',target],{cwd:root,timeout:180000});
  const result={name,title,subtitle,frames:frames.length,wallSeconds:+((Date.now()-started)/1000).toFixed(2),bytes:fs.statSync(target).size};
  console.log(JSON.stringify(result));return result;
}

async function movie(name,parts){
  const file=path.join(scratch,name+'-parts.txt');
  fs.writeFileSync(file,parts.map(p=>`file '${p.name}.mp4'`).join('\n')+'\n');
  const dest=path.join(output,name+'.mp4');
  execFileSync(ffmpeg,['-y','-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',file,'-c','copy','-movflags','+faststart',dest],{timeout:180000});
  return {video:path.basename(dest),bytes:fs.statSync(dest).size,chapters:parts};
}

async function importFile(file){
  await app.evaluate(({dialog},filename)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[filename]});},file);
  await page.locator('[data-workspace="Layout"]').click();
  await page.locator('#import-model').click();
  await page.locator('#confirm-import').waitFor({timeout:120000});
}

async function character(){
  await page.evaluate(()=>fusionEditor.template('blank'));
  await page.locator('[data-workspace="Character"]').click();
  await page.locator('[data-creator-create="male"]').click();
  await page.waitForFunction(()=>fusionEditor.selected?.userData.fusion_creator,null,{timeout:120000});
  await idle();
  // Set public-facing coverage before any recording. Real creator appearance controls.
  await page.locator('[data-creator-tab="Anatomy & Clothing"]').click();
  await page.locator('#creator-coverage').selectOption('clothed');await idle();
  await page.locator('[data-creator-tab="Hair"]').click();
  await page.locator('#creator-hair-style').selectOption('short');await idle();
  await page.locator('[data-creator-tab="Body"]').click();
  await page.locator('#creator-fullbody').click();
  await page.evaluate(()=>{const e=fusionEditor;e.orbit.target.set(0,.95,0);e.camera.position.set(.3,1.35,3.4);});
  await cleanHelpers();
  const parts=[];
  parts.push(await record('character-01','01 / Character design','Adult CC0 foundation · measured height and independent body controls',async()=>{
    await change('[data-creator-number="height"]',1.85);
    await change('[data-creator-number="muscle"]',.7);
    await change('[data-creator-number="weight"]',.43);await cleanHelpers();
  }));
  await shot('character-body');
  await page.locator('[data-creator-tab="Face"]').click();
  await page.locator('#creator-portrait').click();await cleanHelpers();
  parts.push(await record('character-02','02 / Portrait proportions','Searchable face morphs · stable source topology · one completed edit per history step',async()=>{
    const first=page.locator('[data-creator-number]').first();
    await first.fill('.24');await first.press('Tab');await idle();await cleanHelpers();
  }));
  await page.locator('[data-creator-tab="Skin"]').click();
  parts.push(await record('character-03','03 / Skin appearance','24 tone presets · texture detail retained · preview subsurface shading is approximate',async()=>{
    await page.locator('[data-creator-tone="13"]').click();await idle();await pause(1400);
    await page.locator('[data-creator-tone="8"]').click();await idle();
    await change('[data-creator-number="appearance.roughness"]',.55);await cleanHelpers();
  }));
  await shot('character-skin');
  await page.locator('[data-creator-tab="Hair"]').click();
  parts.push(await record('character-04','04 / Fitted hair and roots','Scalp-bound strand preview · greying controls · no long-hair collision claim',async()=>{
    await change('[data-creator-number="appearance.grey"]',.24);await cleanHelpers();
    await page.mouse.move(850,450);await page.mouse.down({button:'middle'});await page.mouse.move(925,465,{steps:28});await page.mouse.up({button:'middle'});
  }));
  await shot('character-portrait');
  await page.locator('[data-creator-tab="Pose"]').click();
  await page.locator('#creator-fullbody').click();
  await page.evaluate(()=>{const e=fusionEditor;e.orbit.target.set(0,.95,0);e.camera.position.set(.25,1.3,3.5);});
  parts.push(await record('character-05','05 / Pose and retain the recipe','Contrapposto preset · fitted coverage preview · save and reopen in Fusion',async()=>{
    await page.locator('[data-creator-pose="contrapposto"]').click();await idle();
    await page.locator('#project-name').fill('Studio character study');
    await page.locator('#save').click();await idle();await cleanHelpers();
  }));
  await shot('character-pose');
  await page.locator('[data-creator-tab="Shape Keys"]').click();
  await page.locator('#creator-shape-name').fill('Cheek contour');
  await page.locator('#creator-new-shape').click();await idle();
  await page.locator('[data-shape-action="edit"]').first().click();
  await page.waitForFunction(()=>!!fusionEditor.creatorShapeSession);
  await page.evaluate(()=>{const e=fusionEditor,g=e.selected.geometry;g.computeBoundingBox();const y=g.boundingBox.max.y-.15;e.orbit.target.set(0,y,.02);e.camera.position.set(.045,y+.01,.72);});
  await change('[data-creator-number="brush.radius"]',.035);
  await change('[data-creator-number="brush.strength"]',.002);
  await page.locator('#creator-brush').selectOption('inflate');await cleanHelpers();
  const neutralBefore=await posDigest(page);
  parts.push(await record('character-06','06 / Author a custom shape key','Isolated neutral cage · topology-preserving cheek sculpt · pose and controls retained',async()=>{
    const vp=await page.locator('#viewport').boundingBox(),x=vp.x+vp.width*.54,y=vp.y+vp.height*.59;
    await page.mouse.move(x,y);await page.mouse.down();
    for(let i=1;i<=12;i++){await page.mouse.move(x+i*.8,y-i*2,{steps:2});await pause(45);}
    await page.mouse.up();assert.notEqual(await posDigest(page),neutralBefore,'neutral shape edit must move actual vertices');
    await shot('character-shape-authoring');
  }));
  // Chapter cut: apply the neutral-space edit and reframe the posed owner.
  // The editable cage and posed character have different coordinate scales.
  await page.locator('#creator-apply-shape').click();await idle();
  await page.locator('#creator-portrait').click();await cleanHelpers();
  const deltas=await page.evaluate(()=>fusionEditor.selected.userData.fusion_creator.recipe.shapes[0].deltas.length);
  assert.ok(deltas>0,'custom shape must retain sparse deltas');
  parts.push(await record('character-07','07 / Mix and save the authored shape','Custom influence 0.65 · character keyframe · editable recipe verified after reopen',async()=>{
    await change('[data-creator-number^="shape."]',.65);
    await page.locator('#creator-key').click();await idle();
    await page.locator('#save').click();await idle();await cleanHelpers();
  }));
  await shot('character-shape-mixing');
  const before=await page.evaluate(()=>JSON.stringify(fusionEditor.selected.userData.fusion_creator.recipe));
  await page.evaluate(async()=>{const [recent]=await fusion.recent();await fusionEditor.load(await fusion.loadRecent(recent.path));fusionEditor.select(fusionEditor.root.children.find(n=>n.userData.fusion_creator));});
  assert.equal(await page.evaluate(()=>JSON.stringify(fusionEditor.selected.userData.fusion_creator.recipe)),before,'saved character recipe survives reopen');
  const stats=await page.evaluate(()=>{let tris=0;fusionEditor.root.traverse(o=>{if(o.isMesh)tris+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});return {triangles:tris,controls:fusionEditor.selected.userData.fusion_creator.definition.controls.length};});
  manifest.workflows.push({id:'character',...(await movie('character-workflow',parts)),checks:['actual body/face/skin/hair/pose UI edits','public full-body captures use clothing coverage','neutral-space shape stroke changes positions and retains sparse deltas','custom shape mixing and character keyframe','recipe equality after project reopen'],shapeDeltaEntries:deltas/4,...stats});
}

async function sculpt(){
  await page.evaluate(()=>fusionEditor.template('blank'));
  await importFile(path.join(scratch,'fixtures/aster-stoneware.glb'));
  await page.locator('#confirm-import').click();await idle();
  await page.waitForFunction(()=>fusionEditor.root.children.length>0);
  await page.evaluate(()=>{const e=fusionEditor;let mesh;e.root.traverse(o=>{if(o.isMesh&&!mesh)mesh=o;});e.select(mesh);e.orbit.target.set(0,1.4,0);e.camera.position.set(.15,1.8,5.1);e.commit();});
  await page.locator('[data-workspace="Sculpting"]').click();
  await page.locator('[data-brush="draw-sharp"]').click();
  await page.locator('#brush-radius').fill('0.18');
  await page.locator('#brush-strength').fill('0.008');
  await page.locator('#enter-sculpt').click();await cleanHelpers();
  const before=await posDigest(page);
  const vp=await page.locator('#viewport').boundingBox();
  const center={x:vp.x+vp.width/2,y:vp.y+vp.height/2};
  const stroke=async(points)=>{await page.mouse.move(points[0][0],points[0][1]);await page.mouse.down();for(const [x,y]of points.slice(1)){await page.mouse.move(x,y,{steps:3});await pause(40);}await page.mouse.up();};
  const parts=[];
  parts.push(await record('sculpt-01','01 / Detailed surface sculpting','Stoneware study · real Draw Sharp strokes on a dense editable mesh',async()=>{
    const pts=Array.from({length:19},(_,i)=>[center.x-160+i*17,center.y-50+Math.sin(i/18*Math.PI)*50]);
    await stroke(pts);await cleanHelpers();
  }));
  const after=await posDigest(page);assert.notEqual(before,after,'real sculpt stroke changes position bytes');
  await shot('sculpt-detail');
  parts.push(await record('sculpt-02','02 / One gesture, one undo','Undo restores the source vertex positions; redo restores the edited positions',async()=>{
    await page.locator('#undo').click();await pause(1300);
    assert.equal(await posDigest(page),before);
    await page.locator('#redo').click();await pause(900);
    assert.equal(await posDigest(page),after);await cleanHelpers();
  }));
  parts.push(await record('sculpt-03','03 / Refine and inspect','Smooth brush · six falloff profiles · viewport orbit on the same detailed mesh',async()=>{
    await page.locator('[data-workspace="Sculpting"]').click();
    await page.locator('[data-brush="smooth"]').click();
    await page.locator('#enter-sculpt').click();
    await page.locator('#brush-strength').fill('0.01');
    assert.equal(await page.evaluate(()=>fusionEditor.meshTools.mode),'sculpt');
    assert.equal(await page.evaluate(()=>fusionEditor.meshTools.brush.type),'smooth');
    const preSmooth=await posDigest(page);
    await stroke(Array.from({length:14},(_,i)=>[center.x-80+i*12,center.y-16+Math.sin(i/13*Math.PI)*20]));
    assert.notEqual(await posDigest(page),preSmooth,'actual Smooth kernel must change surface positions');
    await page.mouse.move(center.x+60,center.y);await page.mouse.down({button:'middle'});await page.mouse.move(center.x+180,center.y-25,{steps:35});await page.mouse.up({button:'middle'});await cleanHelpers();
  }));
  const triangles=await page.evaluate(()=>fusionEditor.selected.geometry.index.count/3);
  manifest.workflows.push({id:'sculpt',...(await movie('sculpt-workflow',parts)),triangles,checks:['real pointer-driven deformation changes position SHA-256','undo matches baseline numeric positions','redo matches edited numeric positions','Smooth kernel selection and actual surface deformation verified'],comparison:'SHA-256 over Float32 positions with signed zero canonicalized; JSON projects do not preserve the sign bit of zero.',limitations:['demonstrates Draw Sharp and Smooth; does not certify every brush or topology path']});
}

async function native(){
  await page.evaluate(()=>fusionEditor.template('blank'));
  const source=path.join(scratch,'fixtures/fusion-optical-instrument.blend');
  const sha=()=>crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
  const before=sha();await importFile(source);
  await shot('native-import-review');
  const parts=[];
  parts.push(await record('native-01','01 / Native scene preservation','Read-only .blend source · compatibility review · evaluated viewport with native render attachment',async()=>{
    await page.locator('#confirm-import').click();await idle();
    await page.waitForFunction(()=>!!fusionEditor.selected?.userData.nativeBlend,null,{timeout:180000});
    await page.evaluate(()=>{const e=fusionEditor;e.orbit.target.set(0,1.3,0);e.camera.position.set(3.9,3.1,5.5);});await cleanHelpers();
  }));
  await shot('native-workspace');
  await page.locator('#project-name').fill('Optical instrument - preserved source');
  await page.locator('[data-workspace="Rendering"]').click();
  await page.locator('#render-device').selectOption('OPTIX');
  await page.locator('#render-size').selectOption('1920,1080');
  await page.locator('#render-samples').selectOption('64');
  await cleanHelpers();
  // Rendering is real. Final footage is its own chapter, not a time estimate.
  parts.push(await record('native-02','02 / Render the retained Blender scene','Cycles OptiX · original camera, lighting and materials · render computed in Fusion',async()=>{
    await page.evaluate(()=>{window.galleryRenderError=null;window.galleryRenderResult=null;fusionOperators.run('render.image').then(r=>window.galleryRenderResult=r).catch(e=>window.galleryRenderError=e.message);});
    await page.waitForFunction(()=>window.galleryRenderResult||window.galleryRenderError,null,{timeout:240000});
    const error=await page.evaluate(()=>window.galleryRenderError);assert.equal(error,null);
    await page.getByRole('dialog',{name:'Render Result'}).waitFor();
  }));
  await shot('native-render');
  const rendered=await page.evaluate(()=>({metadata:galleryRenderResult.metadata,output:galleryRenderResult.output}));
  fs.copyFileSync(rendered.output,path.join(output,'optical-instrument-render.png'));
  assert.equal(sha(),before,'native source SHA-256 unchanged after import/render');
  manifest.workflows.push({id:'native',...(await movie('native-workflow',parts)),checks:['preserved native attachment present','Cycles render completes through Fusion','original source SHA-256 unchanged'],sourceSha256:before,render:{backend:rendered.metadata.backend,nativeScene:rendered.metadata.native_scene},limitations:['native rendering is demonstrated; arbitrary lossless native editing is not claimed']});
}

(async()=>{
  app=await _electron.launch({args:[root],env:{...process.env,FUSION_DATA_DIR:path.join(scratch,'session-'+Date.now())},timeout:60000});
  page=await app.firstWindow();await page.setViewportSize({width:1920,height:960});
  await page.waitForFunction(()=>window.fusionEditor&&window.fusionOperators,null,{timeout:120000});
  if(await page.locator('#recovery-skip').count())await page.locator('#recovery-skip').click();
  cdp=await app.context().newCDPSession(page);
  if(mode==='all'||mode==='character')await character();
  if(mode==='all'||mode==='sculpt')await sculpt();
  if(mode==='all'||mode==='native')await native();
  const manifestPath=path.join(output,'capture-manifest.json');
  if(fs.existsSync(manifestPath)){
    const prior=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
    manifest.workflows=[...prior.workflows.filter(p=>!manifest.workflows.some(n=>n.id===p.id)),...manifest.workflows];
  }
  fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  console.log('Gallery capture complete:',mode);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await app?.close();});
