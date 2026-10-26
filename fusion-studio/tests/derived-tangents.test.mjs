import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as MikkTSpace from 'three/addons/libs/mikktspace.module.js';
import {addExchangeTangents} from '../src/derived-tangents.js';
import {validateTangentInput,validateTangents} from '../src/tangent-data.js';
async function compute(input){await MikkTSpace.ready;const tangents=MikkTSpace.generateTangents(input.positions,input.normals,input.uvs);for(let i=3;i<tangents.length;i+=4)tangents[i]*=-1;return {tangents};}
function mapped(geometry){return new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({normalMap:new THREE.DataTexture(new Uint8Array([128,128,255,255]),1,1)}));}
test('detailed MikkTSpace export copy retains UV, material, source, weights and morph correspondence',async()=>{
 const g=new THREE.TorusKnotGeometry(.7,.18,192,48),count=g.attributes.position.count;g.addGroup(0,g.index.count/2,0);g.addGroup(g.index.count/2,g.index.count/2,1);g.setAttribute('_fusion_source_vertex',new THREE.Uint32BufferAttribute(Array.from({length:count},(_,i)=>i),1));g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(count*4),4));const w=new Float32Array(count*4);for(let i=0;i<count;i++)w[i*4]=1;g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(w,4));g.morphTargetsRelative=true;g.morphAttributes.position=[new THREE.Float32BufferAttribute(new Float32Array(count*3).fill(.01),3)];
 const before=JSON.stringify(g.toJSON()),mesh=mapped(g),root=new THREE.Group();root.add(mesh);const expected=g.toNonIndexed(),report=await addExchangeTangents(root,{compute});assert.equal(JSON.stringify(g.toJSON()),before);assert.equal(report.generated[0].triangles,18432);assert.equal(mesh.geometry.index,null);assert.equal(mesh.geometry.attributes.tangent.count,expected.attributes.position.count);assert.deepEqual(mesh.geometry.groups,expected.groups);
 for(const [name,a]of Object.entries(expected.attributes))assert.deepEqual(mesh.geometry.attributes[name].array,a.array,name);assert.deepEqual(mesh.geometry.morphAttributes.position[0].array,expected.morphAttributes.position[0].array);assert.equal(mesh.geometry.morphTargetsRelative,true);
});
test('mirrored UV tangent handedness matches the analytic plane and authored tangents are retained',async()=>{
 const p=new Float32Array([0,0,0,1,0,0,0,1,0,2,0,0,3,0,0,2,1,0]),n=new Float32Array([0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1]),uv=new Float32Array([0,0,1,0,0,1,0,0,-1,0,0,1]),input={positions:p,normals:n,uvs:uv};assert.equal(validateTangentInput(input).mirroredUVTriangles,1);const {tangents}=await compute(input);validateTangents(tangents,input);assert.deepEqual(Array.from(tangents.slice(0,4)),[1,0,0,-1]);assert.deepEqual(Array.from(tangents.slice(12,16)),[-1,0,0,1]);
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setAttribute('normal',new THREE.BufferAttribute(n,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setAttribute('tangent',new THREE.BufferAttribute(tangents,4));const m=mapped(g),root=new THREE.Group();root.add(m);const r=await addExchangeTangents(root,{compute:()=>{throw Error('must retain authored tangents');}});assert.equal(r.preservedAuthored,1);assert.equal(m.geometry,g);
});
test('invalid UVs, non-unit normals, bad replies, limits and cancellation cannot mutate source geometry',async()=>{
 const g=new THREE.TorusGeometry(.5,.1,32,128),m=mapped(g),root=new THREE.Group();root.add(m);const before=JSON.stringify(g.toJSON());await assert.rejects(addExchangeTangents(root,{compute:()=>({tangents:new Float32Array(4)})}),/Invalid MikkTSpace/);assert.equal(m.geometry,g);assert.equal(JSON.stringify(g.toJSON()),before);
 const signal=AbortSignal.abort();await assert.rejects(addExchangeTangents(root,{signal,compute}),/cancelled/);g.attributes.uv.array.fill(0);await assert.rejects(addExchangeTangents(root,{compute}),/collapsed UV/);assert.equal(m.geometry,g);g.attributes.normal.setXYZ(0,0,0,0);await assert.rejects(addExchangeTangents(root,{compute}),/unit normals/);
 m.material.normalMap.channel=1;await assert.rejects(addExchangeTangents(root,{compute}),/UV0/);m.material.normalMap.channel=0;m.material.normalMap.rotation=.5;await assert.rejects(addExchangeTangents(root,{compute}),/texture-coordinate/);assert.equal(m.geometry,g);
});
