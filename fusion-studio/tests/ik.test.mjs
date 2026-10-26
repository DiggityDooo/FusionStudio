import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCharacter} from '../src/character.js';
import {createIK,solveIK,bonesOf,pathNode,solveSceneIK} from '../src/ik.js';
import {Editor} from '../src/editor.js';
import {Timeline} from '../src/timeline.js';
const vector=()=>new THREE.Vector3();
test('two-bone IK reaches the target, follows the pole, preserves length and deforms weighted geometry',()=>{
 const owner=createCharacter(),end=owner.getObjectByName('Hand_L'),mid=end.parent,upper=mid.parent,control=createIK(owner,end),body=owner.children[0];
 const handIndex=body.skeleton.bones.indexOf(end),index=Array.from(body.geometry.attributes.skinIndex.array).findIndex((v,i)=>i%4===0&&v===handIndex)/4;body.skeleton.update();const before=body.getVertexPosition(index,vector()).clone();
 const lengths=[upper.position.distanceTo(upper.position.clone().add(mid.position)),end.position.length()];control.target=[.33,1.43,.3];control.pole=[.7,1.2,.1];owner.userData.fusion_ik=[control];
 assert.ok(solveIK(owner,control).distance<1e-5);assert.ok(end.getWorldPosition(vector()).distanceTo(new THREE.Vector3(...control.target))<1e-5);
 assert.ok(Math.abs(upper.getWorldPosition(vector()).distanceTo(mid.getWorldPosition(vector()))-lengths[0])<1e-5);assert.ok(Math.abs(mid.getWorldPosition(vector()).distanceTo(end.getWorldPosition(vector()))-lengths[1])<1e-5);
 const elbow=mid.getWorldPosition(vector());control.pole=[-.5,1.7,.1];assert.ok(solveIK(owner,control).distance<1e-5);assert.ok(mid.getWorldPosition(vector()).distanceTo(elbow)>.1);
 body.skeleton.update();assert.ok(body.getVertexPosition(index,vector()).distanceTo(before)>.1);
});
test('IK clamps unreachable targets, handles uniform owner transforms, rejects invalid scales and overlapping chains',()=>{
 const owner=createCharacter(),end=owner.getObjectByName('Foot_L');owner.position.set(3,0,2);owner.rotation.y=.4;owner.scale.setScalar(1.3);const control=createIK(owner,end);control.target=[.2,.45,.15];owner.userData.fusion_ik=[control];assert.ok(solveIK(owner,control).distance<1e-5);
 control.target=[100,100,100];const result=solveIK(owner,control);assert.equal(result.clamped,true);assert.ok(Number.isFinite(result.distance));assert.ok(bonesOf(owner).every(b=>b.quaternion.toArray().every(Number.isFinite)));
 assert.throws(()=>createIK(owner,end),/already drives/);control.enabled=false;owner.scale.x=2;assert.throws(()=>createIK(owner,end),/uniform scale/);
});
test('long-chain solve, serialization and hierarchy-based duplicated controls remain functional',async()=>{
 const owner=createCharacter(),end=owner.getObjectByName('Hand_R'),control=createIK(owner,end,3);control.target=[-.3,1.4,.1];owner.userData.fusion_ik=[control];assert.ok(solveIK(owner,control).distance<.002);
 const restored=await new THREE.ObjectLoader().parseAsync(owner.toJSON());assert.ok(solveSceneIK(restored)[0].distance<.002);assert.equal(pathNode(restored,control.end).name,'Hand_R');
 const copy=restored.clone(true);copy.position.x=3;copy.userData.fusion_ik[0].target=[-.25,1.5,.2];assert.ok(solveSceneIK(copy)[0].distance<.002);
});
test('rig deltas undo through geometry snapshots without retaining geometry per pose',async()=>{
 const e=Object.create(Editor.prototype);e.root=new THREE.Group();e.scene=new THREE.Scene();e.scene.add(e.root);e.root.add(createCharacter());e.selected=e.root.children[0];e.history=[];e.historyAt=-1;e.change=()=>{};e.meshTools={setMode(){}};e.timeline={reset(){}};e.select=function(o){this.selected=o;};e.wire=()=>{};e.ensureHistory();
 const owner=e.selected,end=owner.getObjectByName('Hand_L'),control=createIK(owner,end);const geometry=owner.children[0].geometry;
 e.editRig(owner,()=>{owner.userData.fusion_ik=[control];solveIK(owner,control);},'Add IK');
 const initial=end.getWorldPosition(vector()).clone();e.editRig(owner,()=>{control.target=[.3,1.5,.2];solveIK(owner,control);},'Move IK');assert.equal(e.journal.entries.at(-1).type,'rig');assert.equal(owner.children[0].geometry,geometry);assert.ok(e.journal.deltaBytes<60000);
 const posed=end.getWorldPosition(vector()).clone();owner.name='Renamed';e.commit();await e._undo();assert.ok(e.root.children[0].getObjectByName('Hand_L').getWorldPosition(vector()).distanceTo(posed)<1e-5);await e._undo();assert.ok(e.root.children[0].getObjectByName('Hand_L').getWorldPosition(vector()).distanceTo(initial)<1e-5);await e._redo();assert.ok(e.root.children[0].getObjectByName('Hand_L').getWorldPosition(vector()).distanceTo(posed)<1e-5);
});

test('IK animation bakes evaluated frames, including animated enable, without changing the current pose',()=>{
 const root=new THREE.Group(),owner=createCharacter();root.add(owner);const e={root,selected:owner,commit(){},change(){}};const timeline=new Timeline(e);e.timeline=timeline;timeline.end=24;
 const end=owner.getObjectByName('Hand_L'),c=createIK(owner,end);owner.userData.fusion_ik=[c];c.target=[.3,1.5,.2];solveIK(owner,c);timeline.insert();
 timeline.frame=24;c.target=[.4,1.4,-.2];solveIK(owner,c);timeline.insert();
 const expected=[];for(let f=1;f<=24;f++){timeline.evaluate(f);expected.push(end.getWorldPosition(vector()).clone());}
 timeline.evaluate(9);const state=JSON.stringify(owner.toJSON()),current=timeline.frame;
 const [clip]=timeline.exportClips();assert.equal(clip.name,'Fusion IK baked');assert.equal(timeline.frame,current);assert.equal(JSON.stringify(owner.toJSON()),state);
 assert.ok(clip.tracks.every(t=>t.times.length===24));const copy=owner.clone(true),original=[],cloned=[];owner.traverse(n=>original.push(n));copy.traverse(n=>cloned.push(n));cloned.forEach((n,i)=>n.uuid=original[i].uuid);delete copy.userData.fusion_ik;
 const mixer=new THREE.AnimationMixer(copy),action=mixer.clipAction(clip);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
 for(let f=1;f<=24;f++){mixer.setTime((f-1)/24);copy.updateMatrixWorld(true);assert.ok(copy.getObjectByName('Hand_L').getWorldPosition(vector()).distanceTo(expected[f-1])<1e-5,`frame ${f}`);}
 timeline.keys().at(-1).tracks[owner.uuid].ik[0].enabled=false;timeline.evaluate(24);assert.equal(owner.userData.fusion_ik[0].enabled,false);assert.equal(timeline.needsIKBake(),true);assert.ok(timeline.exportClips().length);
});

test('invalid edits and overlapping re-enabled controls restore all rig channels',()=>{
 const e=Object.create(Editor.prototype);e.root=new THREE.Group();e.root.add(createCharacter());e.selected=e.root.children[0];e.history=[];e.change=()=>{};e.select=function(o){this.selected=o;};e.ensureHistory();
 const owner=e.selected,end=owner.getObjectByName('Hand_L'),a=createIK(owner,end);owner.userData.fusion_ik=[a];a.enabled=false;const b=createIK(owner,end);owner.userData.fusion_ik.push(b);const before=JSON.stringify(e.captureRig(owner));
 assert.throws(()=>e.editRig(owner,()=>{a.enabled=true;solveSceneIK(owner);}),/overlap/);assert.equal(JSON.stringify(e.captureRig(owner)),before);
 assert.throws(()=>e._transformField('scale','x',2),/uniform scale/);assert.equal(owner.scale.x,1);
 assert.throws(()=>e.poseJoint(end.parent,'z',20),/Disable the IK/);
});
