import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {setJointLimit,removeJointLimit,enforceJointLimits,jointLocalAngles,jointLimit,validateJointLimit,jointLimitReport} from '../src/joint-limits.js';
import {createIK,solveIK,solveSceneIK} from '../src/ik.js';
import {Editor} from '../src/editor.js';
import {Timeline} from '../src/timeline.js';
import {evaluatedCharacterTriangles} from '../src/deformation.js';
const V=()=>new THREE.Vector3(),DEG=180/Math.PI;
const bounds=(z=[0,45])=>({x:{enabled:true,min:0,max:0},y:{enabled:true,min:0,max:0},z:{enabled:true,min:z[0],max:z[1]}});
function chain(count=2){const root=new THREE.Group(),bones=[];for(let i=0;i<=count;i++){const bone=new THREE.Bone();bone.name='Joint_'+i;if(i)bone.position.x=1;else root.add(bone);if(i)bones[i-1].add(bone);bones.push(bone);}root.updateMatrixWorld(true);return {root,bones,end:bones.at(-1)};}
function editor(owner){const e=Object.create(Editor.prototype);e.root=new THREE.Group();e.root.add(owner);e.scene=new THREE.Scene();e.scene.add(e.root);e.selected=owner;e.history=[];e.change=()=>{};e.meshTools={setMode(){}};e.timeline=new Timeline(e);e.select=function(n){this.selected=n;};e.wire=()=>{};e.ensureHistory();return e;}
test('authored local limits clamp relative to reference and disabled axes remain free',()=>{
 const {root,bones}=chain(),bone=bones[1],reference=new THREE.Quaternion().setFromEuler(new THREE.Euler(.2,-.1,.3));bone.userData.fusion_source_quaternion=reference.toArray();
 const b=bounds([-15,25]);b.x.enabled=false;setJointLimit(root,bone,{bounds:b});bone.quaternion.copy(reference).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(.35,0,80/DEG)));
 const report=enforceJointLimits(root),angles=jointLocalAngles(root,bone);assert.equal(report.corrections.length,1);assert.ok(Math.abs(angles.z-25)<1e-6);assert.ok(Math.abs(angles.x-.35*DEG)<1e-6);assert.ok(Math.abs(angles.y)<1e-6);
 setJointLimit(root,bone,{enabled:false,bounds:b});bone.quaternion.copy(reference).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0,0,1)));assert.equal(enforceJointLimits(root).corrections.length,0);assert.ok(jointLocalAngles(root,bone).z>50);
 removeJointLimit(root,bone);assert.equal(jointLimit(root,bone),null);
});
test('constrained two-joint IK reaches feasible targets and reports residual for infeasible targets',()=>{
 const {root,bones,end}=chain();setJointLimit(root,bones[0],{bounds:bounds([0,0])});setJointLimit(root,bones[1],{bounds:bounds([0,45])});const c=createIK(root,end);c.target=[1,1,0];c.keepOrientation=false;
 const result=solveIK(root,c);assert.equal(result.limited,true);assert.equal(result.clamped,true);assert.ok(result.distance>.7&&result.distance<.8);assert.ok(Math.abs(jointLocalAngles(root,bones[1]).z-45)<1e-5);assert.ok(Math.abs(bones[0].getWorldPosition(V()).distanceTo(bones[1].getWorldPosition(V()))-1)<1e-7);
 c.target=[1+Math.SQRT1_2,Math.SQRT1_2,0];assert.ok(solveIK(root,c).distance<1e-5);const first=bones.map(b=>b.quaternion.toArray());solveIK(root,c);assert.deepEqual(bones.map(b=>b.quaternion.toArray()),first);
});
test('longer constrained IK chains remain finite, bounded and solve a reachable target',()=>{
 const {root,bones,end}=chain(3);for(const bone of bones.slice(0,-1))setJointLimit(root,bone,{bounds:bounds([-50,50])});const c=createIK(root,end,3);c.keepOrientation=false;c.target=[2.3,.7,0];const result=solveIK(root,c);assert.ok(result.distance<.002,JSON.stringify(result));for(const b of bones.slice(0,-1)){const a=jointLocalAngles(root,b);assert.ok(a.z>=-50.000001&&a.z<=50.000001);assert.ok(Math.abs(a.x)<1e-6&&Math.abs(a.y)<1e-6);}
});
test('joint-limit changes and FK clamps survive rig deltas, snapshots, undo and reload',async()=>{
 const {root,bones}=chain(),e=editor(root),bone=bones[1],boneId=bone.uuid,ownerId=root.uuid;
 e.editRig(root,()=>{setJointLimit(root,bone,{bounds:bounds([-10,20])});solveSceneIK(root);},'Author limit');assert.equal(e.journal.entries.length,1);assert.equal(e.journal.entries[0].type,'rig');
 e.poseJoint(bone,'z',70);assert.ok(Math.abs(e.jointAngles(bone).z-20)<1e-6);root.name='Snapshot boundary';e.commit();await e._undo();await e._undo();e.select(e.root.getObjectByProperty('uuid',ownerId));assert.ok(Math.abs(e.jointAngles(e.selected.getObjectByProperty('uuid',boneId)).z)<1e-6);await e._undo();assert.equal(e.selected.userData.fusion_joint_limits,undefined);await e._redo();assert.equal(e.selected.userData.fusion_joint_limits.length,1);await e._redo();assert.ok(Math.abs(e.jointAngles(e.selected.getObjectByProperty('uuid',boneId)).z-20)<1e-6);
 const parsed=await new THREE.ObjectLoader().parseAsync(e.serialize());const restored=parsed.getObjectByProperty('uuid',ownerId);assert.equal(restored.userData.fusion_joint_limits.length,1);assert.equal(jointLimitReport(restored).constrained,1);assert.ok(Math.abs(jointLocalAngles(restored,restored.getObjectByProperty('uuid',boneId)).z-20)<1e-6);
});
test('timeline and sampled animation constrain every frame and export without changing the current pose',()=>{
 const {root,bones}=chain(),e=editor(root),bone=bones[1];e.timeline.end=21;e.timeline.insert();bone.rotation.z=1.5;e.timeline.frame=21;e.timeline.insert();setJointLimit(root,bone,{bounds:bounds([0,25])});const expected=[];for(let f=1;f<=21;f++){e.timeline.evaluate(f);assert.ok(jointLocalAngles(root,bone).z<=25.000001);expected.push(bone.quaternion.clone());}
 e.timeline.evaluate(9);const before=JSON.stringify(root.toJSON()),[clip]=e.timeline.exportClips();assert.equal(e.timeline.frame,9);assert.equal(JSON.stringify(root.toJSON()),before);const track=clip.tracks.find(t=>t.name===bone.uuid+'.quaternion');assert.equal(track.times.length,21);for(let i=0;i<21;i++)assert.ok(new THREE.Quaternion().fromArray(track.values,i*4).angleTo(expected[i])<.0005);
});
test('malformed bounds, duplicate limits and stale hierarchy reject before partial clamping or load',async()=>{
 const {root,bones}=chain(),b=bone=>setJointLimit(root,bone,{bounds:bounds([0,20])});const first=b(bones[0]),second=b(bones[1]);bones[0].rotation.z=1;second.path=[999];root.userData.fusion_joint_limits[1].path=[999];const before=bones[0].quaternion.toArray();assert.throws(()=>enforceJointLimits(root),/hierarchy changed/);assert.deepEqual(bones[0].quaternion.toArray(),before);
 assert.throws(()=>validateJointLimit({...first,bounds:{...first.bounds,y:{enabled:true,min:-90,max:90}}}),/89.9/);assert.throws(()=>validateJointLimit({...first,reference:[0,0,0,0]}),/unit quaternion/);
 const stale=root.userData.fusion_joint_limits;root.userData.fusion_joint_limits=[first,structuredClone(first)];assert.throws(()=>enforceJointLimits(root),/Duplicate joint limit/);assert.deepEqual(bones[0].quaternion.toArray(),before);root.userData.fusion_joint_limits=stale;
 const e=editor(new THREE.Group()),old=e.root;await assert.rejects(e.restore(root.toJSON()),/hierarchy changed/);assert.equal(e.root,old,'Malformed incoming limits must not replace the open scene');
});
test('real Genesis 9 limits constrain skin/collision geometry and preserve original bytes',async t=>{
 const fixturePath=path.resolve('test-output/dson-integration-results.json');assert.ok(fs.existsSync(fixturePath),'Genesis fixture required');const fixture=JSON.parse(fs.readFileSync(fixturePath)),bytes=fs.readFileSync(fixture.output),gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');const root=gltf.scene;root.traverse(n=>{if(n.isBone)n.userData.fusion_source_quaternion=n.quaternion.toArray();});const e=editor(root),bone=root.getObjectByName('l_forearm');assert.ok(bone?.isBone);const baseline=evaluatedCharacterTriangles(root),before=bone.quaternion.clone(),start=performance.now();
 setJointLimit(root,bone,{bounds:{x:{enabled:true,min:-10,max:10},y:{enabled:true,min:-20,max:20},z:{enabled:true,min:-15,max:15}}});e.poseJoint(bone,'x',80);assert.ok(Math.abs(jointLocalAngles(root,bone).x-10)<1e-5);const expected=before.clone().normalize().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(10/DEG,0,0)));assert.ok(bone.quaternion.clone().normalize().angleTo(expected)<1e-6);const result=evaluatedCharacterTriangles(root);assert.equal(result.triangles.length,baseline.triangles.length);assert.ok(result.triangles.length/3>=50000);assert.ok(result.positions.every(Number.isFinite));assert.notDeepEqual(result.positions,baseline.positions);assert.deepEqual(fs.readFileSync(fixture.output),bytes);
 t.diagnostic(`Genesis: ${result.triangles.length/3} collision triangles, FK clamp/collision evaluation ${(performance.now()-start).toFixed(1)} ms; quaternion error ${bone.quaternion.angleTo(expected)} rad.`);
});
