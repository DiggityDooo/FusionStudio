import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {kelvinToRGB,createLight,createCamera,editSceneObject,applyKelvin} from '../src/scene-objects.js';

test('colour temperature follows the blackbody curve',()=>{
  const [r1,g1,b1]=kelvinToRGB(2000),[r2,g2,b2]=kelvinToRGB(6600),[r3,,b3]=kelvinToRGB(10000);
  assert.ok(r1===1&&g1<r1&&b1<g1,'warm light is orange');assert.ok(Math.min(r2,g2,b2)>.95,'6600 K is near white');assert.ok(b3===1&&r3<b3,'cool light is blue');
});

test('lights carry physical units, aimable targets and Cycles extras',()=>{
  for(const kind of ['point','spot','sun','area']){const light=createLight(kind);assert.equal(light.userData.fusion_light,kind);assert.ok(light.castShadow);
    if(kind!=='point'){assert.equal(light.target.parent,light,'target is a child so direction exports with the node');assert.deepEqual(light.target.position.toArray(),[0,0,-1]);}}
  assert.equal(createLight('area').userData.fusion_area,1);assert.throws(()=>createLight('laser'),/Unknown light/);
  const spot=createLight('spot');assert.ok(editSceneObject(spot,'light-angle',60));assert.ok(Math.abs(spot.angle-Math.PI/6)<1e-12,'UI cone angle is the full cone');
  assert.equal(editSceneObject(spot,'light-intensity',-1),false);assert.equal(editSceneObject(spot,'light-kelvin',500),false);
  applyKelvin(spot,3000);assert.equal(spot.userData.fusion_kelvin,3000);assert.ok(editSceneObject(spot,'light-color','#00ff00'));assert.equal(spot.userData.fusion_kelvin,undefined,'manual colour clears temperature');
});

test('cameras keep focal length, sensor and depth of field settings',()=>{
  const view=new THREE.PerspectiveCamera(38,1.5);view.position.set(1,2,3);const camera=createCamera(view,1.2);
  assert.deepEqual(camera.position.toArray(),[1,2,3]);assert.equal(camera.fov,38);
  assert.ok(editSceneObject(camera,'camera-focal',50));assert.ok(Math.abs(camera.getFocalLength()-50)<1e-9);
  assert.ok(editSceneObject(camera,'camera-sensor',24));assert.ok(Math.abs(camera.getFocalLength()-50)<1e-9,'sensor change keeps focal length');
  assert.equal(editSceneObject(camera,'camera-far',.001),false,'far must exceed near');
  assert.ok(editSceneObject(camera,'camera-dof',true));assert.ok(editSceneObject(camera,'camera-fstop',1.4));assert.deepEqual([camera.userData.fusion_dof,camera.userData.fusion_fstop],[true,1.4]);
  assert.ok(editSceneObject(camera,'camera-blades',6));assert.ok(editSceneObject(camera,'camera-iso',400));assert.equal(editSceneObject(camera,'camera-focal',2),false);
});

test('lights and cameras survive project serialization with their targets',async()=>{
  const root=new THREE.Group(),spot=createLight('spot'),camera=createCamera(new THREE.PerspectiveCamera(),1.2);root.add(spot,camera);spot.position.set(1,2,3);spot.lookAt(0,0,0);
  const loaded=await new THREE.ObjectLoader().parseAsync(JSON.parse(JSON.stringify(root.toJSON())));const s=loaded.children.find(o=>o.isSpotLight);
  assert.equal(s.target.parent,s);assert.equal(s.userData.fusion_light,'spot');assert.ok(loaded.children.find(o=>o.isCamera).userData.fusion_camera);
});
