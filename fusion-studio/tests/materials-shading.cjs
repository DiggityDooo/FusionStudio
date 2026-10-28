const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Engine}=require('../electron/core.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
global.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();});}};
(async()=>{
 const THREE=await import('three'),{GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
 const {applySurface,surfaceSidecar,stampRenderIds,surfaceRecord,SURFACE_PRESETS}=await import('../src/materials.js');
 const scene=new THREE.Scene(),mat=new THREE.MeshPhysicalMaterial({color:0x111111,emissive:0xffeeaa,emissiveIntensity:8,roughness:1,metalness:0});
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),mat);mesh.name='Emitter';mesh.userData.fusion_id='subject';mesh.uuid='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';mat.uuid='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
 applySurface(mat,{...SURFACE_PRESETS.Emission,emission:'#ffeeaa',emissionIntensity:8},mesh);stampRenderIds(mesh);scene.add(mesh);
 const data=Buffer.from(await new GLTFExporter().parseAsync(scene,{binary:true})).toString('base64');
 const engine=new Engine(path.join(output,'materials-shading-'+Date.now()),path.join(root,'scripts/blender_worker.py'));
 const sidecar=surfaceSidecar(scene);
 const doc=r=>{const b=Buffer.from(r.data,'base64'),len=b.readUInt32LE(12);return {json:JSON.parse(b.subarray(20,20+len).toString()),bin:b.subarray(28+len)};};
 try{
  const baked=await engine.run({action:'shader_bake',data,name:'Emit bake',params:{targetId:'subject',type:'Emit',size:256,surfaceMaterials:sidecar}});
  const {json}=doc(baked);
  assert.ok(json.images?.length>0,'bake writes an image');
  assert.ok(json.textures?.length>0,'bake is referenced as a texture');
  assert.ok(baked.metadata.surfaceMaterials.applied>=1,'Cycles received the surface sidecar');
  const glass=surfaceRecord(SURFACE_PRESETS.Glass),glassSide={version:1,materials:[{version:1,objectId:mesh.uuid,materialId:mat.uuid,surface:glass}]};
  const rendered=await engine.run({action:'render',data,name:'Glass probe',params:{width:256,height:256,samples:16,device:'CPU',surfaceMaterials:glassSide}});
  assert.ok(fs.statSync(rendered.output).size>2000,'glass render produced an image');
  fs.writeFileSync(path.join(output,'materials-shading-results.json'),JSON.stringify({passed:true,bakeImages:json.images.length,bakeType:baked.metadata.action,surfaceApplied:baked.metadata.surfaceMaterials,renderBytes:fs.statSync(rendered.output).size},null,2));
  console.log('Materials shading PASS');
 }finally{engine.dispose?.();engine.close?.();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>setTimeout(()=>process.exit(),100));
