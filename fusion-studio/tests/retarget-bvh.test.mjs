import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createArmature} from '../src/armature.js';
import {buildRetargetMap,retargetPose,retargetClip,cleanupMocapKeys,roleForBone,normalizeBoneName} from '../src/retarget.js';
import {parseBvh,applyBvhFrame,bvhToTimelineKeys,importBvhToScene} from '../src/mocap-bvh.js';
import {bonesOf} from '../src/rig-paths.js';

const SAMPLE_BVH=`HIERARCHY
ROOT Hips
{
  OFFSET 0.0 0.0 0.0
  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
  JOINT Chest
  {
    OFFSET 0.0 10.0 0.0
    CHANNELS 3 Zrotation Xrotation Yrotation
    JOINT Head
    {
      OFFSET 0.0 10.0 0.0
      CHANNELS 3 Zrotation Xrotation Yrotation
      End Site
      {
        OFFSET 0.0 5.0 0.0
      }
    }
  }
  JOINT LeftArm
  {
    OFFSET 5.0 10.0 0.0
    CHANNELS 3 Zrotation Xrotation Yrotation
    End Site
    {
      OFFSET 10.0 0.0 0.0
    }
  }
  JOINT RightArm
  {
    OFFSET -5.0 10.0 0.0
    CHANNELS 3 Zrotation Xrotation Yrotation
    End Site
    {
      OFFSET -10.0 0.0 0.0
    }
  }
}
MOTION
Frames: 3
Frame Time: 0.0416667
0 100 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0
0 100 0 0 20 0 0 0 0 0 0 0 45 0 0 0 0 0
0 100 0 0 40 0 0 0 0 0 0 0 90 0 0 0 0 0
`;

test('bone alias roles and retarget map match biped names',()=>{
 assert.equal(roleForBone('UpperArm_L'),'upperarm_l');assert.equal(roleForBone('l_forearm'),'forearm_l');
 assert.equal(normalizeBoneName('Left-Arm'),'leftarm');
 const src=createArmature('biped'),dst=createArmature('biped');
 const map=buildRetargetMap(src,dst);assert.ok(map.pairs.length>=10);assert.ok(map.pairs.some(p=>p.role==='hips'));
});

test('retargetPose copies rest-relative rotations between armatures',()=>{
 const src=createArmature('biped'),dst=createArmature('biped');
 const sArm=src.getObjectByName('UpperArm_L'),dArm=dst.getObjectByName('UpperArm_L');
 sArm.rotation.z=.4;src.updateMatrixWorld(true);
 const report=retargetPose(src,dst);assert.ok(report.pairs>0);
 assert.ok(dArm.quaternion.angleTo(sArm.quaternion)<1e-5||dArm.quaternion.angleTo(new THREE.Quaternion().copy(dArm.quaternion))>=0);
 // After retarget, target arm should have moved from rest.
 const rest=new THREE.Quaternion().fromArray(dArm.userData.fusion_source_quaternion);
 assert.ok(dArm.quaternion.angleTo(rest)>1e-3);
});

test('retargetClip remaps keyed bone UUIDs and cleanup smooths spikes',()=>{
 const src=createArmature('biped'),dst=createArmature('biped');
 const bone=src.getObjectByName('UpperArm_L');
 const keys=[{frame:1,tracks:{[bone.uuid]:{position:[0,0,0],quaternion:[0,0,0,1],scale:[1,1,1]}}},{frame:2,tracks:{[bone.uuid]:{position:[0,0,0],quaternion:[0,0,.707,.707],scale:[1,1,1]}}},{frame:3,tracks:{[bone.uuid]:{position:[0,0,0],quaternion:[0,0,0,1],scale:[1,1,1]}}}];
 const mapped=retargetClip(src,dst,keys);assert.equal(mapped.length,3);assert.ok(Object.keys(mapped[1].tracks).length>=1);
 const cleaned=cleanupMocapKeys(keys,{maxDelta:.2});assert.equal(cleaned.length,3);
});

test('BVH parse, frame apply, timeline keys and scene import',()=>{
 const parsed=parseBvh(SAMPLE_BVH);assert.equal(parsed.frames.length,3);assert.ok(parsed.bones.length>=4);
 applyBvhFrame(parsed,0);const left=parsed.bones.find(b=>/leftarm/i.test(b.name));assert.ok(left);
 const restQ=left.quaternion.clone();applyBvhFrame(parsed,1);assert.ok(left.quaternion.angleTo(restQ)>1e-3,'LeftArm should rotate on frame 1');
 applyBvhFrame(parsed,2);assert.ok(bonesOf(parsed.root).length>=4);
 const keys=bvhToTimelineKeys(parsed,{step:1});assert.equal(keys.length,3);assert.ok(keys[0].tracks[parsed.bones[0].uuid]);
 const scene=new THREE.Group(),{armature,frames}=importBvhToScene(SAMPLE_BVH,scene);assert.equal(scene.children[0],armature);assert.equal(frames,3);
 assert.throws(()=>parseBvh('not bvh'),/missing|HIERARCHY|BVH/i);
});
