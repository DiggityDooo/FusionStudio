const {_electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const output=path.join(root,'test-output');

(async()=>{
  const fixture=JSON.parse(fs.readFileSync(path.join(output,'dson-integration-results.json'),'utf8'));
  assert.equal(fixture.originalsUnchanged,true);
  const sourceHash=fixture.sourceSha256;
  const data=fs.readFileSync(fixture.output).toString('base64');
  const runtime=path.join(output,'pro-workflow-'+Date.now());
  const executable=process.env.FUSION_TEST_EXECUTABLE;
  const app=await _electron.launch({...(executable?{executablePath:executable}:{args:[root]}),env:{...process.env,FUSION_DATA_DIR:runtime},timeout:30000});
  const page=await app.firstWindow();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const idle=()=>page.waitForFunction(()=>!fusionOperators.running&&!document.querySelector('#app').classList.contains('busy'),{},{timeout:180000});
  try{
    await page.waitForFunction(()=>window.fusionEditor&&window.fusionOperators);
    const imported=await page.evaluate(async glb=>{
      fusionEditor.template('blank');
      const character=await fusionEditor.importGLB(glb,'Genesis 9 integrated workflow');
      character.userData.fusion_id=character.uuid;
      fusionEditor.commit();
      fusionEditor.select(character);
      fusionEditor.frame(character);
      let meshes=0,triangles=0,bones=0;
      character.traverse(node=>{if(node.isMesh){meshes++;triangles+=node.geometry.index.count/3;}if(node.isBone)bones++;});
      return {id:character.uuid,meshes,triangles,bones};
    },data);
    assert.ok(imported.triangles>25000,JSON.stringify(imported));
    assert.ok(imported.bones>100,JSON.stringify(imported));

    await page.locator('[data-workspace="Character"]').click();
    await page.locator('#body-measure-open').click();
    await page.waitForFunction(()=>!document.querySelector('#measurement-save').disabled);
    await page.locator('#measurement-save').click();await idle();
    const measurements=await page.evaluate(()=>{const r=fusionEditor.selected.userData.fusion_body_measurements.report;return {valid:r.valid,sourceTriangles:r.sourceTriangles,girths:Object.fromEntries(Object.entries(r.sections).map(([name,s])=>[name,s.circumference]))};});
    assert.equal(measurements.valid,true);assert.equal(measurements.sourceTriangles,50312);

    await page.evaluate(id=>{window.proLink=fusionOperators.run('hybrid.link',{characterId:id});},imported.id);
    await page.getByRole('dialog',{name:'Live garment compatibility'}).waitFor();
    await page.locator('#hybrid-proceed').click();
    await idle();
    const first=await page.evaluate(()=>{const g=fusionEditor.selected;return {id:g.uuid,characterId:g.userData.liveGarment.characterId,metrics:g.userData.liveGarment.metrics,quality:g.userData.liveGarment.quality,points:g.userData.liveGarment.basePattern.panels.reduce((n,p)=>n+p.points.length,0)};});
    assert.equal(first.characterId,imported.id);
    assert.ok(first.points>=20);
    assert.equal(first.metrics.triangleContact,true);
    assert.equal(first.metrics.solidContact,true);assert.ok(first.quality.minAngleDegrees>=20);assert.equal(first.metrics.bodyInsideVertices,0);assert.equal(first.metrics.bodyFaceIntersections,0);

    await page.evaluate(id=>fusionEditor.select(fusionEditor.root.getObjectByProperty('uuid',id)),imported.id);
    await page.locator('[data-workspace="Character"]').click();
    await page.locator('#deformation-panel').waitFor();
    await page.evaluate(async id=>{
      const character=fusionEditor.root.getObjectByProperty('uuid',id);
      fusionEditor.select(character);
      await fusionOperators.run('character.deform',{targetId:id,action:'set',channel:'body_bs_Navel_HD3',value:.35});
    },imported.id);
    await idle();
    assert.equal(await page.evaluate(id=>fusionEditor.root.getObjectByProperty('uuid',id).userData.fusion_deformation.channels.find(c=>c.id==='body_bs_Navel_HD3').value,imported.id),.35);
    const preset=await page.evaluate(async id=>{const saved=await fusionOperators.run('character.preset',{targetId:id,action:'capture',name:'Integrated character shape'});await fusionOperators.run('character.preset',{targetId:id,action:'apply',preset:saved.preset});return {name:saved.preset.name,triangles:saved.preset.source.triangles};},imported.id);
    await idle();assert.equal(preset.triangles,imported.triangles);
    const drivers=await page.evaluate(async id=>{const c=fusionEditor.root.getObjectByProperty('uuid',id),before=c.getObjectByName('l_eye').quaternion.clone();await fusionOperators.run('character.deform',{targetId:id,action:'set',channel:'facs_ctrl_EyeRestingFocalPoint',value:.4});return {formulas:c.userData.fusion_deformation.formulas.length,eyeDeltaRadians:before.angleTo(c.getObjectByName('l_eye').quaternion.clone().normalize())};},imported.id);assert.equal(drivers.formulas,20);assert.ok(Math.abs(drivers.eyeDeltaRadians-1.8*Math.PI/180)<1e-6);

    const skin=await page.evaluate(async id=>{
      const e=fusionEditor,c=e.root.getObjectByProperty('uuid',id);e.select(c);await e.weightPaint.start();const m=e.weightPaint.model,bone=c.getObjectByName('l_forearmtwist1'),row=[...m.rows.values()].find(r=>{const w=r.weights.get(bone.uuid)||0;return w>.05&&w<.9;});if(!row)throw Error('No blended Genesis forearm twist vertex found.');const previous=row.weights.get(bone.uuid),target=Math.min(.95,previous+.05),patch={version:1,rootId:id,inputHash:m.inputHash,edits:[{key:row.key,boneId:bone.uuid,value:target}]};
      const result=await fusionOperators.run('character.weights',{targetId:id,projectId:e.root.uuid,action:'paint',patch});await e.weightPaint.start();const applied=e.weightPaint.model.value(row.key,bone.uuid);e.weightPaint.stop();return {sourceVertex:row.id,key:row.key,joint:bone.name,previous,target,applied,...result};
    },imported.id);assert.ok(Math.abs(skin.applied-skin.target)<1e-6);assert.ok(skin.changedVertices>0);

    const pose=await page.evaluate(async id=>{
      const character=fusionEditor.root.getObjectByProperty('uuid',id);
      fusionEditor.select(character);
      let joint=null;character.traverse(n=>{if(n.isBone&&n.name==='l_forearm')joint=n;});
      if(!joint)throw Error('Genesis l_forearm joint is missing.');
      await fusionOperators.run('rig.joint_limits',{boneId:joint.uuid,enabled:true,bounds:{x:{enabled:false,min:-180,max:180},y:{enabled:false,min:-89.9,max:89.9},z:{enabled:true,min:-12,max:12}}});
      await fusionOperators.run('character.pose',{jointId:joint.uuid,axis:'z',degrees:45});
      const saved=await fusionOperators.run('character.pose_preset',{targetId:id,action:'capture',name:'Integrated bounded pose'});
      await fusionOperators.run('character.pose_preset',{targetId:id,action:'apply',preset:saved.preset});
      return {joint:joint.name,angle:joint.rotation.z,localAngleDegrees:fusionEditor.jointAngles(joint).z,savedJoints:saved.preset.bones.length};
    },imported.id);
    await idle();
    assert.ok(Math.abs(pose.angle)>.1,JSON.stringify(pose));
    assert.ok(Math.abs(pose.localAngleDegrees-12)<1e-5,JSON.stringify(pose));assert.equal(pose.savedJoints,138);

    const garment=await page.evaluate(()=>fusionEditor.root.children.find(n=>n.userData.liveGarment).uuid);
    await page.evaluate(async id=>{
      const old=fusionEditor.root.getObjectByProperty('uuid',id),doc=structuredClone(old.userData.liveGarment.basePattern);
      for(const panel of doc.panels)for(const point of panel.points)if(point[1]===Math.min(...panel.points.map(p=>p[1])))point[1]-=.025;
      await fusionOperators.run('hybrid.pattern',{targetId:id,doc});
    },garment);
    await idle();
    const sewn=await page.evaluate(()=>{const g=fusionEditor.selected,l=g.userData.liveGarment;return {id:g.uuid,seams:l.basePattern.seams.length,metrics:l.metrics,diagnostics:l.diagnostics};});
    assert.equal(sewn.id,garment);
    assert.ok(sewn.seams>=2);
    assert.equal(sewn.metrics.bodyInsideVertices,0);assert.equal(sewn.metrics.bodyFaceIntersections,0);
    if(sewn.metrics.maxStrain>.5||sewn.metrics.seamGapAfter>.005||sewn.metrics.triangleClearanceViolations>0){assert.equal(sewn.diagnostics.converged,false);assert.ok(sewn.diagnostics.issues.length>0);}

    const accessory=await page.evaluate(()=>{const a=fusionEditor._primitive('torus');a.name='Integrated accessory';a.position.set(.42,1.18,.08);a.scale.setScalar(.075);fusionEditor.select(a);fusionEditor.commit();return a.uuid;});
    await page.evaluate(()=>{window.proStack=fusionOperators.run('mesh.stack',{kind:'add',action:'bevel',params:{width:.006,segments:2}});});
    await page.getByRole('dialog',{name:/Mesh compatibility/}).waitFor();
    await page.locator('#compat-copy').click();
    await idle();
    assert.equal(await page.evaluate(()=>fusionEditor.selected.userData.modifierStack.entries[0].action),'bevel');
    await page.evaluate(async()=>{await fusionOperators.run('mesh.stack',{kind:'source'});const e=fusionEditor;e.components.mesh=e.components.target();e.components.setKind('vertex');e.components.ids=new Set([20,21]);await fusionOperators.run('mesh.components',{operation:'transform',matrix:[1,0,0,0,0,1,0,0,0,0,1,0,.005,0,0,1]});});await idle();assert.equal(await page.evaluate(()=>fusionEditor.selected.userData.modifierStack.editSource),true);

    await page.locator('#save').click();
    await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Saved',{},{timeout:60000});
    const saved=await page.evaluate(async()=>{const [project]=await fusion.recent();const doc=await fusion.loadRecent(project.path);await fusionEditor.load(doc);return {projectId:doc.projectId,version:doc.version,characters:fusionEditor.root.children.filter(n=>{let rig=false;n.traverse(c=>{if(c.isSkinnedMesh)rig=true;});return rig;}).length,garments:fusionEditor.root.children.filter(n=>n.userData.liveGarment).length,stacks:fusionEditor.root.children.filter(n=>n.userData.modifierStack).length,limits:fusionEditor.root.children.reduce((n,c)=>n+(c.userData.fusion_joint_limits?.length||0),0),poses:fusionEditor.root.children.reduce((n,c)=>n+(c.userData.fusion_pose_presets?.length||0),0)};});
    assert.equal(saved.version,2);
    assert.ok(saved.projectId);
    assert.deepEqual({characters:saved.characters,garments:saved.garments,stacks:saved.stacks},{characters:1,garments:1,stacks:1});
    assert.equal(saved.limits,1);assert.equal(saved.poses,1);
    assert.deepEqual(await page.evaluate(id=>{const r=fusionEditor.root.getObjectByProperty('uuid',id).userData.fusion_body_measurements.report;return Object.fromEntries(Object.entries(r.sections).map(([name,s])=>[name,s.circumference]));},imported.id),measurements.girths);
    const reopenedSkin=await page.evaluate(async({id,key,joint})=>{const e=fusionEditor,c=e.root.getObjectByProperty('uuid',id);e.select(c);await e.weightPaint.start();const result={edited:c.userData.fusion_skin_edit.edited,value:e.weightPaint.model.value(key,c.getObjectByName(joint).uuid)};e.weightPaint.stop();return result;},{id:imported.id,key:skin.key,joint:skin.joint});assert.equal(reopenedSkin.edited,true);assert.ok(Math.abs(reopenedSkin.value-skin.target)<1e-6);

    const rendered=await page.evaluate(async()=>{fusionEditor.frame(fusionEditor.root);const data=await fusionEditor.glb(false,{includeAnimations:false});return fusion.job({action:'render',data,name:'Integrated Genesis garment workflow',params:{samples:16,width:640,height:360,device:'CPU',camera:{position:fusionEditor.camera.position.toArray(),target:fusionEditor.orbit.target.toArray(),fov:fusionEditor.camera.fov}}});});
    assert.equal(rendered.status,'complete');
    assert.ok(fs.statSync(rendered.output).size>10000);
    assert.deepEqual(errors,[]);
    const packageSha256=executable?require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(path.dirname(executable),'resources/app.asar'))).digest('hex'):null;
    const report={passed:true,executable:executable||'development',packageSha256,sourceHash,imported,measurements,preset,drivers,skin,reopenedSkin,garment:{initial:first,edited:sewn},pose,accessory,saved,render:{output:rendered.output,bytes:fs.statSync(rendered.output).size},runtime,errors};
    fs.writeFileSync(path.join(output,'pro-workflow-results.json'),JSON.stringify(report,null,2));
    console.log('Professional integrated workflow PASS',JSON.stringify(report));
  }finally{
    await app.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
