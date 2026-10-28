import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {parseBvh,applyBvhFrame,bvhToTimelineKeys,importBvhToScene} from '../src/mocap-bvh.js';
import {registerAnimationTools} from '../src/animation-ui.js';

const clip=`HIERARCHY
ROOT Hips
{
 OFFSET 1 2 3
 CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
 JOINT Spine
 {
  OFFSET 0 10 0
  CHANNELS 3 Yrotation Xrotation Zrotation
  End Site { OFFSET 0 5 0 }
 }
}
MOTION
Frames: 3
Frame Time: 0.05
0 0 0 0 0 0 0 0 0
2 4 6 30 20 10 40 15 5
4 8 12 60 40 20 80 30 10
`;

test('BVH preserves offsets, declared rotation orders and explicit source scale',()=>{
  const parsed=parseBvh(clip,{scale:.01,units:'cm'});applyBvhFrame(parsed,1);
  const [hip,spine,end]=parsed.bones;
  assert.ok(hip.position.distanceTo(new THREE.Vector3(.03,.06,.09))<1e-10);
  assert.ok(spine.position.distanceTo(new THREE.Vector3(0,.1,0))<1e-10);
  assert.ok(end.position.distanceTo(new THREE.Vector3(0,.05,0))<1e-10);
  const d=THREE.MathUtils.degToRad;
  assert.ok(hip.quaternion.angleTo(new THREE.Quaternion().setFromEuler(new THREE.Euler(d(20),d(10),d(30),'ZXY')))<1e-7);
  assert.ok(spine.quaternion.angleTo(new THREE.Quaternion().setFromEuler(new THREE.Euler(d(15),d(40),d(5),'YXZ')))<1e-7);
  assert.equal(parsed.root.userData.fusion_bvh.text,clip);
  assert.equal(parsed.root.userData.fusion_bvh.units,'cm');
});

test('BVH sampling resamples time without leaving the rig at a different pose',()=>{
  const parsed=parseBvh(clip);applyBvhFrame(parsed,2);
  const before=parsed.bones.map(b=>b.matrix.toArray()),keys=bvhToTimelineKeys(parsed,{fps:40,startFrame:7});
  assert.deepEqual(keys.map(k=>k.frame),[7,8,9,10,11]);
  assert.deepEqual(keys[1].tracks[parsed.bones[0].uuid].position,[2,4,6]);
  assert.equal(parsed.frame,2);assert.deepEqual(parsed.bones.map(b=>b.matrix.toArray()),before);
  assert.equal(bvhToTimelineKeys(parseBvh(clip.replace('0.05','0.0416667'))).length,3,'rounded 24 Hz header must not add an extra frame');
});

test('malformed or oversized BVH leaves the destination scene unchanged',()=>{
  const scene=new THREE.Group(),existing=new THREE.Object3D();scene.add(existing);
  for(const text of [clip.replace('Frames: 3','Frames: 4'),clip.replace('30 20 10','NaN 20 10'),clip.replace('Zrotation Xrotation Yrotation','Zrotation Xrotation Xrotation'),clip.replace('Frames: 3','Frames: 999999')])assert.throws(()=>importBvhToScene(text,scene),/BVH/);
  assert.throws(()=>importBvhToScene(clip,scene,{fps:1000}),/BVH/);
  assert.deepEqual(scene.children,[existing]);
});

test('motion import merges tracks and preserves the existing timeline and source rate',()=>{
  const root=new THREE.Group(),object=new THREE.Object3D();root.add(object);
  const authored={frame:10,interp:'constant',tracks:{[object.uuid]:{position:[9,8,7],quaternion:[0,0,0,1],scale:[1,1,1]}}};
  root.userData.fusion_timeline=[structuredClone(authored)];
  const editor={root,timeline:{fps:20,frame:10,end:120,keys:()=>root.userData.fusion_timeline},select(o){this.selected=o;},commit(){this.commits=(this.commits||0)+1;}};
  const ops=new Map();registerAnimationTools({register:op=>ops.set(op.id,op)},editor);
  const result=ops.get('anim.bvh_import').execute(null,{text:clip,scale:.01,units:'cm'});
  assert.equal(result.frames,3);assert.equal(editor.commits,1);
  const merged=root.userData.fusion_timeline.find(k=>k.frame===10);
  assert.deepEqual(merged.tracks[object.uuid],{...authored.tracks[object.uuid],interp:'constant'});assert.equal(merged.interp,'constant');
  assert.equal(merged.tracks[editor.selected.children[0].uuid].interp,'linear');assert.equal(editor.timeline.fps,20);
});

test('invalid destination animation cannot leave a partially imported armature',()=>{
 const root=new THREE.Group(),object=new THREE.Object3D();root.add(object);root.userData.fusion_timeline=[{frame:1,tracks:{[object.uuid]:{position:[NaN,0,0],quaternion:[0,0,0,1],scale:[1,1,1]}}}];
 const before=root.userData.fusion_timeline,editor={root,timeline:{fps:24,frame:1,end:120,keys:()=>root.userData.fusion_timeline},select(){throw Error('Must not select a partial import.');},commit(){throw Error('Must not commit a partial import.');}},ops=new Map();registerAnimationTools({register:op=>ops.set(op.id,op)},editor);
 assert.throws(()=>ops.get('anim.bvh_import').execute(null,{text:clip,scale:.01,units:'cm'}),/finite/);assert.deepEqual(root.children,[object]);assert.equal(root.userData.fusion_timeline,before);
});
