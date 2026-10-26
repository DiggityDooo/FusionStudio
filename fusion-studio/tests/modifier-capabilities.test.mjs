import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as THREE from 'three';
import {modifierCapability,stackRequirements} from '../src/modifier-capabilities.js';
import {stackSnapshot,stackExportObject} from '../src/modifier-stack.js';
import {checkCompatibility} from '../src/compatibility.js';
import {remapGeometry} from '../src/component-edit.js';
const require=createRequire(import.meta.url),{Engine}=require('../electron/core.cjs');
test('modifier capability preflight distinguishes connectivity from static exchange',()=>{
 assert.equal(modifierCapability('twist').topology,'preserves');assert.equal(modifierCapability('remesh').uv,'drops');
 const report=checkCompatibility('smooth',{skinned:1},{editableStack:true});assert.ok(report.blocked);assert.match(report.issues.find(i=>i.severity==='block').detail,/preserves mesh connectivity/);assert.ok(report.issues.some(i=>i.title==='Editable modifier working copy'));assert.ok(!report.issues.some(i=>i.title==='Baked mesh working copy'));
 assert.deepEqual(stackRequirements([{action:'twist',enabled:true},{action:'remesh',enabled:false}]),{topology:'preserves',uv:'preserves',materials:'preserves',mapping:'preserves'});
 assert.equal(stackRequirements([{action:'remesh',enabled:true}]).mapping,'unavailable');
});
test('stack snapshots freeze detailed edited buffers and exclude recursive stack metadata',async()=>{
 const mesh=new THREE.Mesh(new THREE.TorusKnotGeometry(.7,.15,384,48),new THREE.MeshStandardMaterial());mesh.geometry.attributes.position.setX(10,.987);mesh.userData.modifierStack={source:{large:'retained'}};
 const source=stackSnapshot(mesh);assert.equal(source.object.userData?.modifierStack,undefined);assert.equal(source.geometries[0].type,'BufferGeometry');
 const restored=await new THREE.ObjectLoader().parseAsync(source);assert.ok(Math.abs(restored.geometry.attributes.position.getX(10)-.987)<1e-6);assert.equal(restored.geometry.index.count/3,36864);
 mesh.geometry.attributes.position.setX(10,.4);assert.ok(Math.abs(restored.geometry.attributes.position.getX(10)-.987)<1e-6);
});
test('source display exports evaluated geometry with the current owner transform',async()=>{
 const owner=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()),evaluated=new THREE.Mesh(new THREE.SphereGeometry(1,96,64),owner.material);
 owner.position.set(.5,1,.3);owner.scale.setScalar(.7);owner.userData.modifierStack={editSource:true,evaluated:stackSnapshot(evaluated)};
 const result=await stackExportObject(owner);assert.equal(result.uuid,owner.uuid);assert.equal(result.geometry.index.count,evaluated.geometry.index.count);assert.deepEqual(result.position.toArray(),owner.position.toArray());assert.deepEqual(result.scale.toArray(),owner.scale.toArray());assert.notEqual(result,owner);assert.equal(owner.geometry.index.count,36);
});
test('worker rejects duplicate, missing and malformed persistent entry identities',()=>{
 const engine=new Engine('test-output/stack-validation','scripts/blender_worker.py');
 try{for(const ids of [[undefined],['duplicate','duplicate'],['bad/path']])assert.throws(()=>engine.run({action:'stack',params:{stack:ids.map(id=>({id,action:'smooth',enabled:true,params:{}}))}}),/unique stable/);}finally{engine.close();}
});
test('component remapping preserves normalized integer attributes and interpolates encoded colors',()=>{
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));g.setAttribute('color',new THREE.BufferAttribute(new Uint8Array([255,128,0,0,64,255,255,255,255]),3,true));g.setIndex([0,1,2]);
 const result=remapGeometry(g,{positions:[[0,0,0],[1,0,0],[0,1,0],[.5,0,0]],faces:[[0,3,2],[3,1,2]],faceSources:[0,0],vertexSources:[[[0,1]],[[1,1]],[[2,1]],[[0,.5],[1,.5]]]});
 assert.deepEqual(Array.from(result.attributes.color.array.slice(0,9)),Array.from(g.attributes.color.array));assert.deepEqual(Array.from(result.attributes.color.array.slice(9)),[128,96,128]);assert.equal(result.attributes.color.normalized,true);
});
