// Private acceptance case: requires locally generated DSON integration output.
// Remains in default test discovery; portable hosted CI excludes this file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {evaluateCharacter,setMorph,evaluatedCharacterTriangles,bakeCharacterExchange} from '../src/deformation.js';

test('real Genesis imports 20 verified drivers and eye controls move exactly three degrees without drift',async t=>{
 const file=JSON.parse(fs.readFileSync('test-output/dson-integration-results.json')),bytes=fs.readFileSync(file.output),{scene:root}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');root.traverse(n=>{if(n.isBone)n.userData.fusion_source_quaternion=n.quaternion.toArray();});const start=performance.now(),report=evaluateCharacter(root),eye=root.getObjectByName('l_eye'),before=eye.quaternion.clone(),snapshot=JSON.stringify(root.userData.fusion_deformation.rotationState);assert.equal(report.valid,true,JSON.stringify(report.errors));assert.equal(report.verifiedRotationFrames,137);assert.equal(report.statistics.formulas,20);assert.equal(report.rotations.length,16);assert.deepEqual(report.warnings,[]);for(let i=0;i<100;i++)evaluateCharacter(root);assert.ok(eye.quaternion.angleTo(before)<1e-7);assert.equal(JSON.stringify(root.userData.fusion_deformation.rotationState),snapshot);setMorph(root,'facs_ctrl_EyeRestingFocalPoint',0);assert.ok(Math.abs(eye.quaternion.angleTo(before)-3*Math.PI/180)<1e-6);const shape=evaluatedCharacterTriangles(root);assert.equal(shape.triangles.length/3,50312);assert.ok(shape.positions.every(Number.isFinite));assert.deepEqual(fs.readFileSync(file.output),bytes);t.diagnostic(`Genesis 20 formulas / 16 joints / 50312 triangles; 100 evaluations and collision ${(performance.now()-start).toFixed(1)} ms; eye delta ${(eye.quaternion.angleTo(before)*180/Math.PI).toFixed(6)}°.`);
 bakeCharacterExchange(root);let nativeFrames=0,graphs=0;root.traverse(n=>{nativeFrames+=!!n.userData.fusion_dson_rotation;graphs+=!!n.userData.fusion_deformation;});assert.equal(nativeFrames,0);assert.equal(graphs,0);const exported=evaluateCharacter(root);assert.equal(exported.valid,true);assert.equal(exported.rotations.length,0);assert.equal(root.userData.fusion_deformation.channels.length,2);assert.ok(eye.quaternion.angleTo(new THREE.Quaternion().fromArray(eye.userData.fusion_source_quaternion))<1e-5);
});
