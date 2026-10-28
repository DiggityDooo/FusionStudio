// Real assembled desktop smoke for the October 27 review fixes. No vendor or
// private asset is loaded. Optional FUSION_TEST_BUILD targets an isolated Vite build.
const {_electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output','review-ui-'+Date.now());
fs.mkdirSync(output,{recursive:true});
const text=`HIERARCHY
ROOT Hips { OFFSET 0 0 0 CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
JOINT Spine { OFFSET 0 100 0 CHANNELS 3 Zrotation Xrotation Yrotation End Site { OFFSET 0 20 0 } } }
MOTION
Frames: 3
Frame Time: 0.05
0 0 0 0 0 0 0 0 0
10 0 0 0 0 0 0 0 20
20 0 0 0 0 0 0 0 40
`;
(async()=>{
  const app=await _electron.launch({args:[root],env:{...process.env,FUSION_DATA_DIR:output},timeout:60000}),errors=[];
  try{
    const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
    if(process.env.FUSION_TEST_BUILD){await page.waitForURL('**/dist/index.html');await page.waitForLoadState('domcontentloaded');await page.goto(require('node:url').pathToFileURL(path.resolve(root,process.env.FUSION_TEST_BUILD,'index.html')).href);}
    await page.waitForFunction(()=>window.fusionEditor&&window.fusionOperators,null,{timeout:60000});
    if(await page.locator('#recovery-skip').count())await page.locator('#recovery-skip').click();
    await page.evaluate(async()=>{fusionEditor.template('blank');const box=await fusionEditor.primitive('cube');box.position.x=3;fusionEditor.timeline.insert();window.reviewBoxId=box.uuid;});
    await page.locator('[data-workspace="Animation"]').click();
    await page.locator('#anim-bvh-units').selectOption('cm');
    const file=page.waitForEvent('filechooser');await page.locator('#anim-bvh-import').click();
    await (await file).setFiles({name:'original-motion.bvh',mimeType:'text/plain',buffer:Buffer.from(text)});
    await page.waitForFunction(()=>fusionEditor.root.children.some(n=>n.userData.fusion_bvh)&&!fusionOperators.running);
    const imported=await page.evaluate(()=>{const e=fusionEditor,bvh=e.root.children.find(n=>n.userData.fusion_bvh);window.reviewBvhId=bvh.uuid;return {units:bvh.userData.fusion_bvh.units,scale:bvh.userData.fusion_bvh.scale,source:bvh.userData.fusion_bvh.text,original:e.timeline.keys().find(k=>k.frame===1).tracks[reviewBoxId].position};});
    assert.equal(imported.units,'cm');assert.equal(imported.scale,.01);assert.equal(imported.source,text);assert.deepEqual(imported.original,[3,.7,0]);
    await page.evaluate(()=>fusionEditor.undo());assert.equal(await page.evaluate(()=>!!fusionEditor.root.getObjectByProperty('uuid',reviewBvhId)),false);
    await page.evaluate(()=>fusionEditor.redo());assert.equal(await page.evaluate(()=>!!fusionEditor.root.getObjectByProperty('uuid',reviewBvhId)),true);
    // Real scene foundation + actual ComponentEditor, including markers.
    const selection=await page.evaluate(()=>{const e=fusionEditor,mesh=e.root.getObjectByProperty('uuid',reviewBoxId);e.select(mesh);e.meshTools.setMode('edit');e.components.mesh=mesh;e.components.kind='vertex';e.components.ids=new Set([0]);e.components.update();e.foundation.growComponentSelection(e.components);const grown=[...e.components.ids];e.foundation.shrinkComponentSelection(e.components);return {grown,shrunk:[...e.components.ids]};});
    assert.ok(selection.grown.length>1);assert.ok(selection.shrunk.length<selection.grown.length);
    // Build a nested, transformed binding fixture from editor-native objects.
    const bind=await page.evaluate(async()=>{const e=fusionEditor;e.meshTools.setMode('object');const rig=await fusionOperators.run('rig.armature_add',{template:'biped'}),mesh=e.root.getObjectByProperty('uuid',reviewBoxId),offset=new e.root.constructor();offset.position.set(10,2,3);offset.rotation.y=.4;offset.scale.set(2,1,.5);rig.add(offset);offset.add(mesh);e.root.updateMatrixWorld(true);const before=mesh.matrixWorld.toArray(),id=mesh.uuid;e.commit();await fusionOperators.run('character.weights',{projectId:e.root.uuid,action:'bind',targetId:rig.uuid,meshId:id,mode:'smooth'});e.root.updateMatrixWorld(true);const bound=e.root.getObjectByProperty('uuid',id);window.reviewRigId=rig.uuid;return {before,after:bound.matrixWorld.toArray(),id,skinned:bound.isSkinnedMesh,parent:bound.parent.uuid,expectedParent:offset.uuid};});
    assert.ok(bind.skinned);assert.equal(bind.parent,bind.expectedParent);assert.ok(bind.after.every((v,i)=>Math.abs(v-bind.before[i])<1e-7));
    await page.evaluate(()=>fusionEditor.undo());assert.equal(await page.evaluate(id=>fusionEditor.root.getObjectByProperty('uuid',id).isSkinnedMesh,bind.id),undefined);
    await page.evaluate(()=>fusionEditor.redo());assert.equal(await page.evaluate(id=>fusionEditor.root.getObjectByProperty('uuid',id).isSkinnedMesh,bind.id),true);
    const saved=await page.evaluate(async()=>{const e=fusionEditor,col=e.foundation.createCollection('Review rig');e.foundation.assignCollection(e.root.getObjectByProperty('uuid',reviewRigId),col.id);e.foundation.setUnits({system:'imperial',unit:'in',scale:.0254});e.foundation.setSnap({enabled:true,mode:'grid',increment:.25});const result=await fusion.save(e.document('Review recovery'));const doc=await fusion.loadRecent(result.path);await e.load(doc);const mesh=e.root.getObjectByProperty('uuid',reviewBoxId);e.root.updateMatrixWorld(true);return {matrix:mesh.matrixWorld.toArray(),skinned:mesh.isSkinnedMesh,bvh:!!e.root.getObjectByProperty('uuid',reviewBvhId),tracks:e.timeline.keys().some(k=>k.tracks[reviewBoxId]),units:e.foundation.state.units.unit,snap:e.foundation.state.snap.increment,collection:e.foundation.state.collections.find(c=>c.id===col.id)?.name};});
    assert.ok(saved.skinned&&saved.bvh&&saved.tracks);assert.ok(saved.matrix.every((v,i)=>Math.abs(v-bind.before[i])<1e-6));
    assert.equal(saved.units,'in');assert.equal(saved.snap,.25);assert.equal(saved.collection,'Review rig');
    assert.ok((await page.locator('#snap').getAttribute('class')).split(/\s+/).includes('active'),'snap toolbar reflects restored settings');
    await page.locator('#snap').click();assert.equal(await page.evaluate(()=>fusionEditor.foundation.state.snap.enabled),false,'first click after reopen must disable restored snapping');
    const exportBytes=await page.evaluate(async()=>{const data=await fusionEditor.glb(false,{includeAnimations:false});return data.length;});assert.ok(exportBytes>1000);
    await page.screenshot({path:path.join(output,'regressions.png')});assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({passed:true,checks:['app bootstrap','UI BVH file import and units','animation retention','BVH undo/redo','topological component selection','nested binding preservation','binding undo/redo','project save/reopen','collection/unit/snap persistence','GLB serialization'],errors},null,2));
    console.log('Desktop review regressions PASS:',output);
  }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
