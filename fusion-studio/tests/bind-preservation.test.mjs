import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {smoothBind,rigidBind} from '../src/skin-weights.js';

function fixture(){
  const scene=new THREE.Group(),armature=new THREE.Group(),bone=new THREE.Bone(),tip=new THREE.Bone();tip.position.y=1;bone.name='Root';tip.name='Tip';bone.add(tip);armature.add(bone);scene.add(armature);
  const parent=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());parent.position.set(10,2,3);parent.scale.set(2,1,.5);parent.rotation.z=.4;mesh.position.set(1,2,3);mesh.rotation.y=.7;parent.add(mesh);armature.add(parent);
  mesh.name='Imported source';mesh.userData.sourceCapsule={sourceId:'fixture',sha256:'immutable'};
  scene.updateMatrixWorld(true);return {scene,armature,parent,mesh};
}
const point=(mesh,i)=>mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);

test('binding preserves source world geometry, identity, hierarchy, descendants and animation targets',()=>{
  for(const bind of [smoothBind,rigidBind]){
    const {scene,armature,parent,mesh}=fixture(),child=new THREE.Object3D();mesh.add(child);child.position.x=.1;
    mesh.animations=[new THREE.AnimationClip('Authored',1,[new THREE.VectorKeyframeTrack(mesh.uuid+'.position',[0,1],[1,2,3,2,2,3])])];
    const before=Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>point(mesh,i)),uuid=mesh.uuid,geometry=mesh.geometry;
    const bound=bind(mesh,armature);scene.updateMatrixWorld(true);
    assert.equal(bound.parent,parent);assert.equal(bound.uuid,uuid);assert.equal(child.parent,bound);assert.equal(bound.animations[0].tracks[0].name,uuid+'.position');
    assert.deepEqual(bound.userData.sourceCapsule,mesh.userData.sourceCapsule);assert.equal(bound.name,'Imported source');
    assert.ok(before.every((p,i)=>p.distanceTo(point(bound,i))<1e-6));assert.notEqual(bound.geometry,geometry);assert.equal(geometry.attributes.skinWeight,undefined);
  }
});

test('binding an external mesh retains shear under a differently transformed armature',()=>{
  const {scene,armature,parent,mesh}=fixture();scene.attach(parent);armature.rotation.y=.8;armature.scale.set(.5,1.5,2);scene.updateMatrixWorld(true);
  const before=mesh.matrixWorld.clone(),points=Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>point(mesh,i));
  const bound=smoothBind(mesh,armature);scene.updateMatrixWorld(true);
  assert.equal(bound.parent,armature);assert.equal(bound.matrixAutoUpdate,false);
  assert.ok(bound.matrixWorld.elements.every((v,i)=>Math.abs(v-before.elements[i])<1e-7));
  assert.ok(points.every((p,i)=>p.distanceTo(point(bound,i))<1e-5));
});

test('failed binding does not detach the original object or alter its geometry',()=>{
  const {armature,parent,mesh}=fixture(),geometry=mesh.geometry;armature.scale.x=0;
  assert.throws(()=>smoothBind(mesh,armature),/singular/);assert.equal(mesh.parent,parent);assert.equal(mesh.geometry,geometry);
});
