import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as THREE from 'three';
import {createCamera,editSceneObject,CAMERA_PRESETS,CAMERA_RIGS} from '../src/scene-objects.js';
import {cameraSidecar,cameraRecord,applyCameraPreset,interpolateTrack,validateCameraTrack,guideMarkup,assembleCameraRig,applyCameraProcedural,applyTiltShift} from '../src/cameras.js';
const require=createRequire(import.meta.url),{cameras}=require('../electron/cameras.cjs'),{renderQuality}=require('../electron/core.cjs');

test('cinematic presets set focal length and portrait DOF',()=>{
  const camera=createCamera(new THREE.PerspectiveCamera(38,1.2),1.2);
  applyCameraPreset(camera,'50mm');
  assert.ok(Math.abs(camera.getFocalLength()-50)<1e-6);
  applyCameraPreset(camera,'85mm portrait');
  assert.equal(camera.userData.fusion_dof,true);assert.equal(camera.userData.fusion_fstop,1.8);
  assert.deepEqual(Object.keys(CAMERA_PRESETS).length>=6,true);
  assert.throws(()=>applyCameraPreset(camera,'imax'),/preset/i);
});

test('orthographic cameras and tilt-shift extras',()=>{
  const camera=createCamera(new THREE.PerspectiveCamera(),1.5,{ortho:true,orthoHeight:6});
  assert.equal(camera.isOrthographicCamera,true);assert.equal(camera.userData.fusion_ortho,true);
  assert.ok(editSceneObject(camera,'camera-ortho-height',8));assert.equal(camera.top,4);
  assert.equal(editSceneObject(camera,'camera-focal',50),false);
  const persp=createCamera(new THREE.PerspectiveCamera(),1.2);
  persp.userData.fusion_shift_x=.4;applyTiltShift(persp);assert.ok(Math.abs(persp.filmOffset-7.2)<1e-6);
});

test('sidecar carries bokeh, motion blur, ISO, guides and tracks',()=>{
  const root=new THREE.Group(),camera=createCamera(new THREE.PerspectiveCamera(),1.2);
  camera.userData.fusion_id='shot-1';Object.assign(camera.userData,{fusion_blades:8,fusion_motion_blur:true,fusion_shutter:90,fusion_iso:400,fusion_guides:['thirds','safe'],fusion_distortion:.2});
  camera.userData.fusion_track=validateCameraTrack({frames:[{frame:1,position:[0,1,4],quaternion:[0,0,0,1]},{frame:10,position:[2,1,4],quaternion:[0,0,0,1]}]});
  root.add(camera);
  const side=cameraSidecar(root);assert.equal(side.version,1);assert.equal(side.cameras[0].blades,8);assert.equal(side.cameras[0].iso,400);
  assert.equal(side.cameras[0].guides[0],'thirds');assert.equal(side.cameras[0].track.length,2);
  const checked=cameras(side);assert.equal(checked.cameras[0].objectId,'shot-1');
  assert.throws(()=>cameras({version:1,cameras:[{objectId:'x',iso:-1}]}),/iso/i);
  const mid=interpolateTrack(side.cameras[0].track,5.5);assert.ok(Math.abs(mid.position[0]-1)<1e-9);
});

test('camera rigs parent a camera and shake offsets from rest',()=>{
  assert.deepEqual(Object.keys(CAMERA_RIGS),['dolly','crane','orbit','path']);
  const camera=createCamera(new THREE.PerspectiveCamera(),1.2),empty=assembleCameraRig('dolly',camera,new THREE.Vector3(0,1,0));
  assert.equal(empty.userData.fusion_camera_rig,'dolly');assert.equal(camera.parent,empty);
  camera.userData.fusion_shake_amp=.5;camera.userData.fusion_shake_hz=8;camera.userData.fusion_rest={position:[0,0,4],quaternion:[0,0,0,1]};
  applyCameraProcedural(camera,13,24);assert.notEqual(camera.position.x,0);
  assert.ok(guideMarkup(['thirds','safe']).includes('g-safe'));
});

test('render quality accepts ISO, white balance and shutter',()=>{
  const out=renderQuality({iso:800,whiteBalance:5600,motionBlur:true,shutter:180,exposure:.5});
  assert.equal(out.iso,800);assert.equal(out.whiteBalance,5600);assert.equal(out.motionBlur,true);
  assert.throws(()=>renderQuality({iso:1}),/iso/i);
  const rec=cameraRecord(createCamera(new THREE.PerspectiveCamera(),1));assert.equal(rec.pano,'none');
});
