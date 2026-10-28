import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createArmature,addBone,orientBonesTowardChildren,mirrorPose,mirrorName,addConstraint,evaluateConstraints,setIkBlend,setControlShape,CONTROL_SHAPES,setCustomAttr,setBoneLayer,setLayerVisible,addTwistJoint,setStretch,createFootRoll,setSpace,RIG_TEMPLATES} from '../src/armature.js';
import {createIK,solveIK,bonesOf,solveSceneIK} from '../src/ik.js';
import {createCharacter} from '../src/character.js';

test('biped and quadruped templates create oriented joint trees',()=>{
  const biped=createArmature('biped');assert.equal(biped.userData.fusion_armature,true);
  const bones=bonesOf(biped);assert.ok(bones.length>=15);assert.ok(bones.some(b=>b.name==='Hand_L'));
  assert.ok(bones.find(b=>b.name==='Hips').parent===biped);
  const hand=bones.find(b=>b.name==='Hand_L');assert.ok(hand.parent.name==='ForeArm_L');
  const quad=createArmature('quadruped');assert.ok(bonesOf(quad).some(b=>b.name==='Tail2'));
  assert.throws(()=>createArmature('dragon'),/template/i);
  assert.ok(Object.keys(RIG_TEMPLATES).length>=2);
});

test('add bone, layers, control shapes, custom attrs and space',()=>{
  const root=createArmature('biped'),hips=bonesOf(root).find(b=>b.name==='Hips');
  const bone=addBone(root,hips,'Extra',[0,.1,0]);assert.equal(bone.parent,hips);assert.ok(bone.isBone);
  setBoneLayer(bone,'secondary');assert.equal(bone.userData.fusion_rig_layer,'secondary');
  setLayerVisible(root,'secondary',false);assert.equal(bone.visible,false);
  setControlShape(root,bone,'circle');assert.equal(root.userData.fusion_control_shapes[bone.uuid].shape,'circle');
  assert.ok(CONTROL_SHAPES.diamond);
  setCustomAttr(root,'roll',.25);assert.equal(root.userData.fusion_custom_attrs.roll.value,.25);
  assert.throws(()=>setCustomAttr(root,'1bad',0),/identifier/i);
  setSpace(root,bone,{space:'local'});assert.equal(bone.userData.fusion_space.space,'local');
});

test('pose mirroring agrees with independent matrix reflection on every axis and is an involution',()=>{
  assert.equal(mirrorName('Hand_L'),'Hand_R');assert.equal(mirrorName('LeftArm'),'RightArm');
  assert.equal(mirrorName('upperarm_l'),'upperarm_r');assert.equal(mirrorName('lForeArm'),'rForeArm');
  for(const axis of ['x','y','z']){
    const root=new THREE.Group(),l=new THREE.Bone(),r=new THREE.Bone();l.name='Hand_L';r.name='Hand_R';root.add(l,r);root.rotation.set(.3,.4,-.2);
    l.rotation.set(.6,.2,-.1);r.rotation.set(-.3,.1,.4);const beforeL=l.quaternion.clone(),beforeR=r.quaternion.clone(),scale={x:1,y:1,z:1};scale[axis]=-1;
    const s=new THREE.Matrix4().makeScale(scale.x,scale.y,scale.z),reflect=q=>new THREE.Quaternion().setFromRotationMatrix(s.clone().multiply(new THREE.Matrix4().makeRotationFromQuaternion(q)).multiply(s));
    mirrorPose(root,{axis});assert.ok(r.quaternion.angleTo(reflect(beforeL))<1e-7);assert.ok(l.quaternion.angleTo(reflect(beforeR))<1e-7);
    mirrorPose(root,{axis});assert.ok(l.quaternion.angleTo(beforeL)<1e-7);assert.ok(r.quaternion.angleTo(beforeR)<1e-7);
  }
});

test('pose mirroring maps rolled rest axes without changing a neutral rig and rejects ambiguous rigs atomically',()=>{
 const root=createArmature('biped'),bones=bonesOf(root),rest=bones.map(b=>b.quaternion.clone());mirrorPose(root);bones.forEach((b,i)=>assert.ok(b.quaternion.angleTo(rest[i])<1e-7));
 const left=root.getObjectByName('UpperArm_L'),right=root.getObjectByName('UpperArm_R');left.rotateY(.45);right.rotateX(-.2);const before=bones.map(b=>b.quaternion.clone());mirrorPose(root);mirrorPose(root);bones.forEach((b,i)=>assert.ok(b.quaternion.angleTo(before[i])<1e-7));
 const duplicate=new THREE.Bone();duplicate.name=left.name;root.add(duplicate);assert.throws(()=>mirrorPose(root),/unique bone names/);bones.forEach((b,i)=>assert.ok(b.quaternion.angleTo(before[i])<1e-7));root.remove(duplicate);
 root.userData.fusion_ik=[{enabled:true}];assert.throws(()=>mirrorPose(root),/Disable active IK/);delete root.userData.fusion_ik;
 left.userData.fusion_source_quaternion=[0,0,0,0];assert.throws(()=>mirrorPose(root),/unit rest/);bones.forEach((b,i)=>assert.ok(b.quaternion.angleTo(before[i])<1e-7));
});

test('constraints aim and point evaluate',()=>{
  const root=createArmature('biped'),head=bonesOf(root).find(b=>b.name==='Head'),hand=bonesOf(root).find(b=>b.name==='Hand_L');
  addConstraint(root,{kind:'aim',owner:head,target:hand,weight:1});
  const before=head.quaternion.clone();evaluateConstraints(root);
  assert.ok(head.quaternion.angleTo(before)>1e-6);
  addConstraint(root,{kind:'point',owner:head,target:hand,weight:.5});
  assert.equal(evaluateConstraints(root)>=1,true);
});

test('FK/IK blend and stretch flags',()=>{
  const owner=createCharacter(),end=owner.getObjectByName('Hand_L'),control=createIK(owner,end);
  control.target=[.33,1.43,.3];owner.userData.fusion_ik=[control];
  setIkBlend(control,1);assert.ok(solveIK(owner,control).distance<1e-4);
  const full=end.getWorldPosition(new THREE.Vector3());
  // Capture FK at rest then blend 0 should stay nearer rest than full IK.
  control.enabled=false;solveSceneIK(owner);const rest=end.getWorldPosition(new THREE.Vector3()).clone();
  control.enabled=true;setIkBlend(control,0);solveIK(owner,control);
  const blended=end.getWorldPosition(new THREE.Vector3());
  assert.ok(blended.distanceTo(rest)<=full.distanceTo(rest)+1e-3);
  control.stretch=true;const upper=end.parent.parent;setStretch(upper,{enabled:true,axis:'y',min:.5,max:2});
  setIkBlend(control,1);solveIK(owner,control);assert.ok(upper.userData.fusion_stretch.enabled);
});

test('twist joint and foot roll',()=>{
  const root=createArmature('biped'),fore=bonesOf(root).find(b=>b.name==='ForeArm_L');
  const twist=addTwistJoint(fore,'ForeTwist_L',.5);assert.equal(twist.parent,fore);assert.ok(twist.children.some(c=>c.isBone));
  const foot=bonesOf(root).find(b=>b.name==='Foot_L');createFootRoll(root,foot);
  assert.ok(bonesOf(root).some(b=>b.userData.fusion_foot_roll));
});
