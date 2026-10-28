import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as THREE from 'three';
import {surfaceRecord,SURFACE_PRESETS,applySurface,applyPreset,specularGlossinessToMetallic,metallicToSpecularGlossiness,materialXDocument,oslSource,surfaceSidecar,stampRenderIds,rayVisibility,applyRayVisibility,addVertexColors,shareInstance,makeUnique,applyObjectOverride,defaultGraph,readSurface} from '../src/materials.js';
const require=createRequire(import.meta.url),{surfaceMaterials}=require('../electron/surface-materials.cjs'),{Engine}=require('../electron/core.cjs');

test('surface records fill a Principled uber BSDF and reject out-of-range values',()=>{
  const s=surfaceRecord();assert.equal(s.workflow,'metallic-roughness');assert.equal(s.model,'principled');assert.equal(s.ior,1.5);
  assert.throws(()=>surfaceRecord({ior:.5}),/ior/i);assert.throws(()=>surfaceRecord({workflow:'phong'}),/workflow/);assert.throws(()=>surfaceRecord({version:2}),/version/);
});

test('specular-glossiness converts to metallic-roughness and back without dropping energy',()=>{
  const mr=specularGlossinessToMetallic({color:'#406080',specularColor:'#ffffff',specular:.8,glossiness:.7});
  assert.ok(mr.metalness>0&&Math.abs(mr.roughness-.3)<1e-9);const sg=metallicToSpecularGlossiness({color:'#c0c0c0',metalness:1,roughness:.2});
  assert.equal(sg.glossiness,.8);assert.ok(sg.specular>0.5);
});

test('presets write physical, toon, hair and volume parameters onto viewport materials',()=>{
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({color:'#888888'}));
  applyPreset(mesh,'Glass');assert.ok(mesh.material.isMeshPhysicalMaterial);assert.equal(mesh.material.transmission,1);assert.ok(Math.abs(mesh.material.ior-1.45)<1e-6);
  applyPreset(mesh,'Toon');assert.ok(mesh.material.isMeshToonMaterial);applyPreset(mesh,'Hair');assert.ok(mesh.material.anisotropy>.5);
  applyPreset(mesh,'Fog');assert.equal(readSurface(mesh.material).model,'volume');assert.ok(readSurface(mesh.material).volumeDensity>0);
  applyPreset(mesh,'Car paint');assert.equal(mesh.material.clearcoat,1);applyPreset(mesh,'Skin');assert.ok(readSurface(mesh.material).subsurface>0);
  applyPreset(mesh,'Emission');assert.ok(mesh.material.emissiveIntensity>1);
});

test('material instancing shares one GPU material and uniqueness clones it',()=>{
  const a=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshPhysicalMaterial()),b=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshPhysicalMaterial()),root=new THREE.Group();
  applySurface(a.material,{instanceId:'shared-1',color:'#ff0000'},a);applySurface(b.material,{instanceId:'shared-1',color:'#00ff00'},b);root.add(a,b);
  assert.equal(shareInstance(root,a.material),1);assert.equal(b.material,a.material);makeUnique(b);assert.notEqual(b.material,a.material);assert.notEqual(b.material.userData.fusion_surface.instanceId,'shared-1');
});

test('overrides, vertex colours, ray visibility and shader documents stay on the sidecar',()=>{
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(.5,8,6),new THREE.MeshPhysicalMaterial());mesh.uuid='mesh-1';applySurface(mesh.material,{color:'#808080'},mesh);mesh.material.uuid='mat-1';
  addVertexColors(mesh.geometry,'#ffaa00');applySurface(mesh.material,{...readSurface(mesh.material),vertexColor:true},mesh);stampRenderIds(mesh);
  assert.equal(surfaceSidecar(mesh).materials[0].vertexColor,true);
  applyRayVisibility(mesh,{camera:true,shadow:false});applyObjectOverride(mesh,SURFACE_PRESETS.Glass);
  const side=surfaceSidecar(mesh);assert.equal(side.materials.length,1);assert.equal(side.materials[0].override.transmission,1);assert.equal(side.materials[0].rayVisibility.shadow,false);
  const mtlx=materialXDocument(SURFACE_PRESETS.Glass);assert.match(mtlx,/standard_surface/);assert.match(mtlx,/transmission/);assert.match(oslSource(SURFACE_PRESETS.Metal),/microfacet_ggx/);
  const g=defaultGraph(surfaceRecord({weathering:.4,ao:.2,vertexColor:true,volumeDensity:1}));assert.ok(g.nodes.some(n=>n.type==='weathering')&&g.nodes.some(n=>n.type==='volume')&&g.links.length>=3);
});

test('engine validates surface sidecars and refuses baking as a live modifier',()=>{
  const engine=new Engine('test-output/surface-validation','scripts/blender_worker.py');
  try{
    assert.throws(()=>engine.run({action:'subdivide',params:{surfaceMaterials:{version:1,materials:[{version:1,objectId:'bad id',materialId:'x'}]}}}),/identity|surface/i);
    assert.throws(()=>engine.run({action:'stack',params:{stack:[{id:'a',action:'shader_bake',enabled:true,params:{type:'Combined',size:1024}}]}}),/Invalid stack/);
    const ok=surfaceMaterials({version:1,materials:[{version:1,objectId:'obj1',materialId:'mat1',surface:surfaceRecord(SURFACE_PRESETS.Glass)}]});
    assert.equal(ok.materials[0].surface.transmission,1);
  }finally{engine.close();}
});
