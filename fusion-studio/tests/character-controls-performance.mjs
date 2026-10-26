// Local, private-fixture benchmark. Copies increase evaluated mesh work without
// inventing additional rig identities or modifying the owned source asset.
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {capturePosePreset,applyPosePreset} from '../src/pose-library.js';
import {setJointLimit,enforceJointLimits,jointLocalAngles} from '../src/joint-limits.js';
import {evaluatedCharacterTriangles} from '../src/deformation.js';
const fixture=JSON.parse(fs.readFileSync('test-output/dson-integration-results.json')),bytes=fs.readFileSync(fixture.output),hash=b=>createHash('sha256').update(b).digest('hex'),rows=[];
for(const factor of [1,2,3]){
 const {scene:root}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');root.traverse(n=>{if(n.isBone)n.userData.fusion_source_quaternion=n.quaternion.toArray();});root.updateWorldMatrix(true,true);const meshes=[];root.traverse(n=>{if(n.isSkinnedMesh)meshes.push(n);});
 for(let copy=1;copy<factor;copy++)for(const source of meshes){const mesh=source.clone(false),matrix=root.matrixWorld.clone().invert().multiply(source.matrixWorld);matrix.decompose(mesh.position,mesh.quaternion,mesh.scale);root.add(mesh);}
 const bone=root.getObjectByName('l_forearm');setJointLimit(root,bone,{bounds:{x:{enabled:true,min:-10,max:10},y:{enabled:false,min:-89.9,max:89.9},z:{enabled:false,min:-180,max:180}}});const start=performance.now(),preset=await capturePosePreset(root),captureMs=performance.now()-start;
 const limitStart=performance.now();bone.quaternion.fromArray(bone.userData.fusion_source_quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(80*Math.PI/180,0,0)));enforceJointLimits(root);const limitMs=performance.now()-limitStart;assert.ok(Math.abs(jointLocalAngles(root,bone).x-10)<1e-5);
 const applyStart=performance.now();await applyPosePreset(root,preset);const applyMs=performance.now()-applyStart,collisionStart=performance.now(),surface=evaluatedCharacterTriangles(root),collisionMs=performance.now()-collisionStart;assert.equal(surface.triangles.length/3,50312*factor);assert.ok(surface.positions.every(Number.isFinite));
 rows.push({meshCopies:factor,joints:preset.bones.length,vertices:surface.positions.length/3,triangles:surface.triangles.length/3,captureMs,limitMs,applyMs,collisionMs});
}
assert.equal(hash(fs.readFileSync(fixture.output)),hash(bytes));assert.equal(hash(fs.readFileSync(fixture.source)),fixture.sourceSha256);
const report={passed:true,cpu:os.cpus()[0].model,node:process.version,fixture:'Owned Genesis 9 base-resolution mesh, repeated material primitives sharing one skeleton',rows,limits:['Up to 200,000 character collision triangles; larger inputs require simplification or an explicit higher evaluation bound.','Rotational constraint projection is measured separately from collision extraction.','Copied coincident meshes measure evaluation cost; they are not layered-cloth quality fixtures.','Timing is a single local sample per size; it is not an interactive performance guarantee.']};fs.writeFileSync('test-output/character-controls-performance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
