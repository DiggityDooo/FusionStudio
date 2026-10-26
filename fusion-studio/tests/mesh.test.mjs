import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCharacter,applyPose,POSES} from '../src/character.js';
import {createGarment} from '../src/garments.js';
import {inspectObject,checkCompatibility} from '../src/compatibility.js';
import {extrudeRegion,deleteRegion,sculptGeometry} from '../src/mesh-tools.js';
import {Timeline} from '../src/timeline.js';

test('character has a real skeleton and responds to a pose',()=>{
  const character=createCharacter(),body=character.children[0];assert.ok(body.isSkinnedMesh);assert.equal(body.skeleton.bones.length,17);
  for(let i=0;i<body.geometry.attributes.skinWeight.count;i+=37)assert.equal(body.geometry.attributes.skinWeight.getX(i),1);
  const arm=body.skeleton.bones.find(b=>b.name==='UpperArm_L');applyPose(character,POSES.wave);assert.ok(arm.rotation.z>2);
  body.skeleton.update();const p=new THREE.Vector3();body.getVertexPosition(0,p);assert.ok(Number.isFinite(p.x));
});
test('garment patterns have editable UVs and pinned upper edges',()=>{
  const garment=createGarment(),mesh=garment.children[0];assert.equal(mesh.geometry.index.count/3,48*28*2);assert.equal(mesh.userData.fusion_pin.length,49);assert.equal(mesh.geometry.attributes.uv.count,mesh.geometry.attributes.position.count);
});
test('coplanar cube face extrusion closes its boundary',()=>{
  const source=new THREE.BoxGeometry(1,1,1),result=extrudeRegion(source,0,.2);assert.equal(result.index.count/3,20);result.computeBoundingBox();assert.ok(Math.abs(result.boundingBox.max.x-.7)<1e-5);
  const deleted=deleteRegion(source,0);assert.equal(deleted.index.count/3,10);
});
test('sculpt brush changes mesh data and bounds',()=>{
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),new THREE.MeshStandardMaterial());const count=sculptGeometry(mesh,new THREE.Vector3(0,1,0),.3,.05);assert.ok(count>0);assert.ok(mesh.geometry.boundingBox.max.y>1.04);
});
test('risky mesh operations warn or block before execution',()=>{
  const stats=inspectObject(createCharacter());assert.equal(checkCompatibility('sculpt',stats).blocked,true);assert.equal(checkCompatibility('subdivide',stats).blocked,true);assert.ok(checkCompatibility('obj',stats).warnings>0);
  assert.equal(checkCompatibility('subdivide',{triangles:300001}).blocked,true);assert.equal(checkCompatibility('cloth',{garment:false}).blocked,true);
  assert.ok(checkCompatibility('bevel',{meshes:1,triangles:12,materials:1}).issues.some(i=>i.title==='Baked mesh working copy'));
  assert.equal(checkCompatibility('array',{triangles:40000},{count:32}).blocked,true);
  assert.equal(checkCompatibility('subdivide',{triangles:20000},{levels:3}).blocked,true);
  for(const action of ['array','wireframe','weld','smooth','twist','bend','taper','stretch','uv'])assert.equal(checkCompatibility(action,stats).blocked,true);
});
test('timeline interpolates keyed transforms and exports animation tracks',()=>{
  const root=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());root.add(mesh);
  const t=new Timeline({root,selected:mesh,commit(){},change(){}});t.insert();t.frame=25;mesh.position.x=10;t.insert();t.evaluate(13);assert.equal(mesh.position.x,5);assert.equal(t.exportClips()[0].tracks.length,3);
});
