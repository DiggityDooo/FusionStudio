const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Engine}=require('../electron/core.cjs');
global.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();});}};
(async()=>{
 const {starterPattern,tshirtPattern,createPatternObject,patternPayload}=await import('../src/patterns.js'),{GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js'),THREE=await import('three'),{createCharacter}=await import('../src/character.js');
 const root=path.resolve(__dirname,'..'),runtime=path.join(root,'test-output','pattern-engine-'+Date.now()),engine=new Engine(runtime,path.join(root,'scripts/blender_worker.py'));
 try{const reports=[];for(const fabric of ['cotton','silk','denim']){
  const doc=starterPattern();doc.fabric=fabric;const garment=createPatternObject(doc),payload=patternPayload(garment),data=Buffer.from(await new GLTFExporter().parseAsync(garment,{binary:true})).toString('base64');
  const r=await engine.run({action:'cloth',name:'Sewn '+fabric,data,params:{targetId:garment.userData.fusion_id,patternCloth:payload,frames:60}}),seam=r.metadata.sewing;
  console.log(fabric,JSON.stringify(seam));assert.equal(seam.spring_count,18);assert.ok(seam.mean_gap_after<seam.mean_gap_before*.85,'seams must close measurably');assert.ok(seam.max_pin_displacement<.00001,'pinned edges stay fixed');assert.ok(r.metadata.cloth_max_displacement>.01);reports.push({fabric,...r.metadata});
 }
 assert.notEqual(reports[0].cloth_max_displacement,reports[2].cloth_max_displacement);
 const doc=tshirtPattern(),garment=createPatternObject(doc),scene=new THREE.Scene();scene.add(createCharacter(),garment);
 const data=Buffer.from(await new GLTFExporter().parseAsync(scene,{binary:true})).toString('base64');
 const shirt=await engine.run({action:'cloth',name:'T-shirt on character',data,params:{targetId:garment.userData.fusion_id,patternCloth:patternPayload(garment),frames:80}});
 assert.ok(shirt.metadata.mesh_count>1);assert.ok(shirt.metadata.sewing.mean_gap_after<shirt.metadata.sewing.mean_gap_before*.85);assert.equal(shirt.metadata.sewing.max_pin_displacement,0);reports.push({fixture:'T-shirt and character collider',...shirt.metadata});console.log('T-shirt with body',JSON.stringify(shirt.metadata.sewing));
 fs.writeFileSync(path.join(root,'test-output','pattern-engine-results.json'),JSON.stringify({passed:true,reports},null,2));console.log('Pattern sewing engine PASS');
 }finally{engine.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
