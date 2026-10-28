// Assembled Electron workflow using original detailed geometry only.
const {_electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output','animation-sculpt-'+Date.now());fs.mkdirSync(output,{recursive:true});
(async()=>{
 const app=await _electron.launch({args:[root],env:{...process.env,FUSION_DATA_DIR:output},timeout:60000}),errors=[];
 try{
  const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
  if(process.env.FUSION_TEST_BUILD){await page.waitForURL('**/dist/index.html');await page.waitForLoadState('domcontentloaded');await page.goto(require('node:url').pathToFileURL(path.resolve(root,process.env.FUSION_TEST_BUILD,'index.html')).href);}
  await page.waitForFunction(()=>window.fusionEditor&&window.fusionOperators,null,{timeout:60000});if(await page.locator('#recovery-skip').count())await page.locator('#recovery-skip').click();
  const detail=await page.evaluate(async()=>{
   const e=fusionEditor;e.template('blank');const hero=await e.primitive('sphere');hero.name='Hero detail';hero.geometry=new hero.geometry.constructor(.5,256,200);
   const shape=hero.geometry.attributes.position.clone();for(let i=0;i<shape.count;i++)shape.setX(i,shape.getX(i)*1.1);hero.geometry.morphAttributes.position=[shape];hero.updateMorphTargets();
   window.integrityHero=hero.uuid;const t=e.timeline;hero.position.set(0,.7,0);hero.morphTargetInfluences[0]=0;t.frame=1;t.insert();hero.position.x=1;hero.morphTargetInfluences[0]=1;t.frame=6;t.insert();hero.position.x=2;hero.morphTargetInfluences[0]=0;t.frame=11;t.insert();
   return {triangles:hero.geometry.index.count/3,vertices:shape.count};
  });assert.ok(detail.triangles>=100000);
  await page.locator('[data-workspace="Animation"]').click();await page.locator('#anim-lib-capture').click();
  await page.evaluate(async()=>{const e=fusionEditor,prop=await e.primitive('cube');prop.name='Stepped prop';window.integrityProp=prop.uuid;e.timeline.frame=31;prop.position.x=7;e.timeline.insert({interp:'stepped'});e.timeline.frame=41;prop.position.x=9;e.timeline.insert({interp:'stepped'});e.timeline.frame=31;});
  await page.locator('#anim-lib-apply').click();await page.waitForFunction(()=>fusionEditor.timeline.keys().some(k=>k.frame===36&&k.tracks[integrityHero])&&!fusionOperators.running);
  let shared=await page.evaluate(()=>{const k=fusionEditor.timeline.keys().find(k=>k.frame===31);return {prop:k.tracks[integrityProp],hero:k.tracks[integrityHero],keys:fusionEditor.timeline.keys().length};});assert.equal(shared.prop.position[0],7);assert.equal(shared.prop.interp,'stepped');assert.equal(shared.hero.interp,'linear');
  await page.evaluate(()=>fusionEditor.undo());assert.equal(await page.evaluate(()=>!!fusionEditor.timeline.keys().find(k=>k.frame===31)?.tracks[integrityHero]),false);
  await page.evaluate(()=>fusionEditor.redo());assert.equal(await page.evaluate(()=>!!fusionEditor.timeline.keys().find(k=>k.frame===31)?.tracks[integrityHero]),true);
  const before=await page.evaluate(()=>{fusionEditor.timeline.frame=34;return {keys:JSON.stringify(fusionEditor.timeline.keys()),cursor:fusionEditor.journal.cursor};});
  await page.locator('#anim-lib-apply').click();await page.locator('#anim-clip-cancel').click();assert.deepEqual(await page.evaluate(()=>({keys:JSON.stringify(fusionEditor.timeline.keys()),cursor:fusionEditor.journal.cursor})),before);
  await page.locator('#anim-lib-apply').click();await page.locator('#anim-clip-replace').click();await page.waitForFunction(()=>fusionEditor.timeline.keys().some(k=>k.frame===39&&k.tracks[integrityHero])&&!fusionOperators.running);
  assert.equal(await page.evaluate(()=>!!fusionEditor.timeline.keys().find(k=>k.frame===41)?.tracks[integrityProp]),true);
  await page.locator('#anim-reduce').click();assert.equal(await page.evaluate(()=>fusionEditor.timeline.keys().find(k=>k.frame===39)?.tracks[integrityHero].morph[0]),1);
  const exchange=await page.evaluate(async()=>{
   const e=fusionEditor,data=await e.glb(),bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0)),view=new DataView(bytes.buffer),json=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+view.getUint32(12,true))));
   const node=json.nodes.findIndex(n=>n.name==='Stepped_prop'||n.name==='Stepped prop'),channel=json.animations[0].channels.find(c=>c.target.node===node&&c.target.path==='translation'),sampler=json.animations[0].samplers[channel.sampler];
   const exported=await fusion.exportGltf({data,name:'Animation integrity'}),loaded=await e.importGLB(data,'Integrity GLB roundtrip'),loadedHero=loaded.getObjectByName('Hero_detail')||loaded.getObjectByName('Hero detail'),loadedProp=loaded.getObjectByName('Stepped_prop')||loaded.getObjectByName('Stepped prop');
   let error=0;for(const frame of [1,4,6,8,11,31,35,39,40,41,44]){e.timeline.evaluate(frame,{strict:true});const hero=e.root.getObjectByProperty('uuid',integrityHero),prop=e.root.getObjectByProperty('uuid',integrityProp);error=Math.max(error,Math.abs(loadedHero.position.x-hero.position.x),Math.abs(loadedHero.morphTargetInfluences[0]-hero.morphTargetInfluences[0]),Math.abs(loadedProp.position.x-prop.position.x));}
   return {step:sampler.interpolation,error,report:json.scenes[0].extras.fusion_animation_export,bytes:bytes.length,output:exported.output,validation:exported.validation};
  });assert.equal(exchange.step,'STEP');assert.ok(exchange.error<1e-4,JSON.stringify(exchange));assert.ok(exchange.bytes>1000000);
  const stampBefore=await page.evaluate(async()=>{const e=fusionEditor,mesh=await e.primitive('sphere');mesh.name='UV stamp detail';mesh.geometry=new mesh.geometry.constructor(.5,256,200);mesh.geometry.deleteAttribute('normal');window.integrityStamp=mesh.uuid;window.integrityStampPositions=Array.from(mesh.geometry.attributes.position.array);e.commit();return {count:mesh.geometry.attributes.position.count,index:mesh.geometry.index.count};});
  await page.locator('[data-workspace="Sculpting"]').click();await page.locator('#sa-u').fill('0.25');await page.locator('#sa-v').fill('0.75');await page.locator('#sa-radius').fill('0.2');await page.locator('#sa-stamp').click();
  await page.waitForFunction(()=>!fusionOperators.running&&fusionEditor.root.getObjectByProperty('uuid',integrityStamp).geometry.attributes.normal);
  const stamp=await page.evaluate(()=>{const m=fusionEditor.root.getObjectByProperty('uuid',integrityStamp),p=m.geometry.attributes.position;return {changed:Array.from(p.array).filter((v,i)=>v!==integrityStampPositions[i]).length,count:p.count,index:m.geometry.index.count};});assert.ok(stamp.changed>1000);assert.equal(stamp.count,stampBefore.count);assert.equal(stamp.index,stampBefore.index);
  await page.evaluate(()=>fusionEditor.undo());assert.equal(await page.evaluate(()=>Array.from(fusionEditor.root.getObjectByProperty('uuid',integrityStamp).geometry.attributes.position.array).every((v,i)=>v===integrityStampPositions[i])),true);
  await page.evaluate(()=>fusionEditor.redo());
  const reopened=await page.evaluate(async()=>{const e=fusionEditor;e.timeline.fps=30;e.timeline.loopMode='pingpong';e.timeline.defaultInterp='spline';const doc=e.document('Animation and UV stamp integrity'),saved=await fusion.save(doc);await e.load(await fusion.loadRecent(saved.path));return {fps:e.timeline.fps,loop:e.timeline.loopMode,interp:e.timeline.defaultInterp,prop:e.timeline.keys().find(k=>k.frame===41)?.tracks[integrityProp].interp,morph:e.timeline.keys().find(k=>k.frame===39)?.tracks[integrityHero].morph[0],stamp:Array.from(e.root.getObjectByProperty('uuid',integrityStamp).geometry.attributes.position.array).filter((v,i)=>v!==integrityStampPositions[i]).length};});
  assert.deepEqual(reopened,{fps:30,loop:'pingpong',interp:'spline',prop:'stepped',morph:1,stamp:stamp.changed});
  await page.screenshot({path:path.join(output,'workflow.png')});assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({passed:true,detail,exchange,stamp,reopened,errors},null,2));console.log('Animation/sculpt desktop PASS:',output);
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
