import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createDetailedCharacter,changeCreator} from '../src/character-creator.js';
import {appendEvaluatedMeshPositions} from '../src/mesh-evaluation.js';
import {evaluatedCharacterTriangles} from '../src/deformation.js';
const definition=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../public/characters/makehuman-v1.json.gz',import.meta.url))));
const bytes=values=>Buffer.from(Float64Array.from(values).buffer);
function reference(mesh){const result=[],point=new THREE.Vector3();for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld);result.push(point.x,point.y,point.z);}return result;}
function posed(sex='female',shapes=8){
 const root=createDetailedCharacter(definition,{sex}),recipe=structuredClone(root.userData.fusion_creator.recipe),ids=[...new Set(root.getObjectByName('Body').geometry.attributes._fusion_source_vertex.array)].slice(0,32);
 recipe.shapes=Array.from({length:shapes},(_,i)=>({id:'evaluation-'+i,name:'Evaluation '+i,min:-1,max:1,value:i%3===0?-.2:i%3===1?0:.35,deltas:ids.flatMap((id,j)=>[id,(i%3-1)*.0002,(j%5-2)*.0001,-0])}));changeCreator(root,recipe,{deferAttachments:true});
 root.position.set(.7,-.1,.4);root.rotation.set(.1,.4,-.2);root.scale.set(1.1,.8,1.3);root.getObjectByName('upperarm_l').rotation.set(.2,-.3,.4);root.getObjectByName('upperarm_l').position.x+=.02;root.getObjectByName('upperarm_l').scale.set(1.2,.8,1.1);root.updateWorldMatrix(true,false);root.updateMatrixWorld(true);return root;
}
function compare(mesh,mode='batched-linear'){
 const expected=reference(mesh),actual=[123],before=mesh.geometry.attributes.position.array.slice(),result=appendEvaluatedMeshPositions(mesh,actual);assert.equal(actual.shift(),123);assert.equal(result.mode,mode);assert.ok(bytes(actual).equals(bytes(expected)),'all world positions match CPU reference byte-for-byte');assert.deepEqual(mesh.geometry.attributes.position.array,before);return {actual,result};
}
test('detailed adult morph/pose extraction caches double bone products with exact world positions',()=>{
 for(const sex of ['female','male'])for(const shapes of [0,8,64]){
  const root=posed(sex,shapes),body=root.getObjectByName('Body');assert.ok(body.geometry.index.count/3>=26000);const {actual,result}=compare(body);assert.ok(result.cachedBoneMatrices>0&&result.cachedBoneMatrices<=body.skeleton.bones.length);
  const collision=evaluatedCharacterTriangles(root);assert.ok(bytes(collision.positions).equals(bytes(actual)));assert.deepEqual(collision.triangles,Array.from(body.geometry.index.array));
 }
});
test('absolute shapes, detached nonidentity binds and pose changes do not reuse stale matrices',()=>{
 const root=posed('male',8),body=root.getObjectByName('Body'),g=body.geometry;
 g.morphAttributes.position=g.morphAttributes.position.map(a=>{const values=Float32Array.from(a.array,(v,i)=>v+g.attributes.position.array[i]);return new THREE.BufferAttribute(values,3);});g.morphTargetsRelative=false;
 body.bindMode='detached';body.bindMatrix.compose(new THREE.Vector3(.1,-.2,.3),new THREE.Quaternion().setFromEuler(new THREE.Euler(.2,-.1,.3)),new THREE.Vector3(1.2,.8,1.1));root.updateWorldMatrix(true,false);root.updateMatrixWorld(true);
 const first=compare(body).actual,saved=[...first];root.getObjectByName('head').rotation.x+=.4;root.getObjectByName('upperarm_l').position.y+=.05;root.updateWorldMatrix(true,false);root.updateMatrixWorld(true);const second=compare(body).actual;assert.ok(!bytes(first).equals(bytes(second)));assert.deepEqual(first,saved);
});
test('interleaved positions, normalized skin weights and float16 positions preserve CPU semantics',()=>{
 const root=posed(),body=root.getObjectByName('Body'),g=body.geometry,p=g.attributes.position,interleaved=new Float32Array(p.count*5);
 for(let i=0;i<p.count;i++){interleaved[i*5+1]=p.getX(i);interleaved[i*5+2]=p.getY(i);interleaved[i*5+3]=p.getZ(i);}g.setAttribute('position',new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(interleaved,5),3,1));
 const weights=Uint16Array.from(g.attributes.skinWeight.array,v=>Math.round(v*65535));g.setAttribute('skinWeight',new THREE.Uint16BufferAttribute(weights,4,true));compare(body);
 const half=Uint16Array.from(p.array,v=>THREE.DataUtils.toHalfFloat(v));g.setAttribute('position',new THREE.Float16BufferAttribute(half,3));compare(body);
});
test('custom vertex/skin/attribute methods and rigid meshes retain reference evaluation',()=>{
 const root=posed(),body=root.getObjectByName('Body'),original=body.getVertexPosition;
 body.getVertexPosition=function(i,p){original.call(this,i,p);p.x+=.003;return p;};compare(body,'reference');delete body.getVertexPosition;
 const skin=body.applyBoneTransform;body.applyBoneTransform=function(i,p){skin.call(this,i,p);p.y-=.002;return p;};compare(body,'reference');delete body.applyBoneTransform;
 const attribute=body.geometry.attributes.position,getX=attribute.getX;attribute.getX=function(i){return getX.call(this,i)+.001;};compare(body,'reference');delete attribute.getX;
 const worldFields=body.skeleton.bones.map(bone=>({bone,descriptor:Object.getOwnPropertyDescriptor(bone,'matrixWorld')}));let reads=0;
 try{for(const {bone,descriptor}of worldFields)Object.defineProperty(bone,'matrixWorld',{configurable:true,get(){reads++;return descriptor.value;}});reference(body);const expectedReads=reads;reads=0;const output=[];assert.equal(appendEvaluatedMeshPositions(body,output).mode,'reference');assert.equal(reads,expectedReads,'eligibility does not pre-read callback-backed matrices');}
 finally{for(const {bone,descriptor}of worldFields)Object.defineProperty(bone,'matrixWorld',descriptor);}
 const rigid=new THREE.Mesh(body.geometry,body.material);rigid.updateMatrixWorld(true);compare(rigid,'reference');
});
test('real Genesis material primitives match the original CPU extraction without changing private source',async t=>{
 const reportFile=new URL('../test-output/dson-integration-results.json',import.meta.url);if(!fs.existsSync(reportFile)){t.skip('Private Genesis regression result unavailable');return;}const report=JSON.parse(fs.readFileSync(reportFile));if(!fs.existsSync(report.output)){t.skip('Private Genesis GLB unavailable');return;}const source=fs.readFileSync(report.output),scene=(await new GLTFLoader().parseAsync(source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength),'')).scene;
 scene.position.set(.4,.1,-.2);scene.scale.set(1.2,.8,1.1);scene.updateWorldMatrix(true,false);scene.updateMatrixWorld(true);let vertices=0,triangles=0,skinned=0;
 scene.traverse(mesh=>{if(!mesh.isMesh)return;vertices+=mesh.geometry.attributes.position.count;triangles+=(mesh.geometry.index?.count||mesh.geometry.attributes.position.count)/3;if(mesh.isSkinnedMesh){skinned++;compare(mesh);}else compare(mesh,'reference');});assert.ok(vertices>=25000&&triangles>=50000&&skinned>=7);assert.ok(fs.readFileSync(report.output).equals(source));
});
test('empty indexed parts do not add phantom collision surfaces and incomplete triangles reject',()=>{
 const character=posed(),group=new THREE.Group();group.add(character);const body=character.getObjectByName('Body'),before=evaluatedCharacterTriangles(group),original=body.geometry.attributes.position.array.slice(),geometry=body.geometry.clone();
 geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(),1));const empty=new THREE.Mesh(geometry,body.material);empty.position.x=1000;group.add(empty);
 const after=evaluatedCharacterTriangles(group);assert.equal(after.triangles.length,before.triangles.length,'an empty indexed part adds no triangles');assert.deepEqual(after.triangles,before.triangles);assert.ok(bytes(after.positions).equals(bytes(before.positions)),'an empty part adds no collision vertices');
 geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from([0,1,2,0]),1));assert.throws(()=>evaluatedCharacterTriangles(group),/complete triangle/);assert.deepEqual(body.geometry.attributes.position.array,original);assert.equal(geometry.index.count,4);
});
