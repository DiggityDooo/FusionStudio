import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {applyDeltaMush,applyWrap,createLattice,applyLattice,applyShrinkwrap,applyCage,captureCageRest} from '../src/skin-deformers.js';

function box(seg=2){return new THREE.Mesh(new THREE.BoxGeometry(1,1,1,seg,seg,seg),new THREE.MeshBasicMaterial());}

test('delta mush preserves rest shape when undeformed and softens a spike',()=>{
 const mesh=box(3),rest=Array.from(mesh.geometry.attributes.position.array);
 applyDeltaMush(mesh,{iterations:3,lambda:1,strength:1},rest);
 for(let i=0;i<rest.length;i++)assert.ok(Math.abs(mesh.geometry.attributes.position.array[i]-rest[i])<1e-5);
 mesh.geometry.attributes.position.setY(0,2);mesh.geometry.attributes.position.needsUpdate=true;
 const spiked=mesh.geometry.attributes.position.getY(0);
 applyDeltaMush(mesh,{iterations:4,lambda:1,strength:1},rest);
 assert.ok(mesh.geometry.attributes.position.getY(0)<spiked);
});

function worldMidY(mesh){mesh.updateWorldMatrix(true,true);const p=mesh.geometry.attributes.position,v=new THREE.Vector3();let min=Infinity,max=-Infinity;for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);min=Math.min(min,v.y);max=Math.max(max,v.y);}return (min+max)/2;}

test('wrap and shrinkwrap pull a floating mesh onto a target surface',()=>{
 const target=new THREE.Mesh(new THREE.PlaneGeometry(4,4,1,1),new THREE.MeshBasicMaterial());target.rotation.x=-Math.PI/2;
 const floating=new THREE.Mesh(new THREE.BoxGeometry(.4,.4,.4,1,1,1),new THREE.MeshBasicMaterial());floating.position.set(0,.5,0);
 const scene=new THREE.Group();scene.add(target);scene.add(floating);scene.updateMatrixWorld(true);
 applyWrap(floating,target,{strength:1});assert.ok(Math.abs(worldMidY(floating))<.15,`wrapped mid Y ${worldMidY(floating)}`);
 floating.geometry=new THREE.BoxGeometry(.4,.4,.4,1,1,1);floating.position.set(0,.5,0);floating.updateMatrixWorld(true);
 applyShrinkwrap(floating,target,{mode:'nearest',strength:1});assert.ok(Math.abs(worldMidY(floating))<.15);
});

test('lattice identity leaves geometry unchanged; moving a control point deforms',()=>{
 const mesh=box(2),scene=new THREE.Group();scene.add(mesh);scene.updateMatrixWorld(true);
 const lattice=createLattice(mesh,{resX:3,resY:3,resZ:3}),before=Float32Array.from(mesh.geometry.attributes.position.array);
 applyLattice(mesh,lattice);const afterId=mesh.geometry.attributes.position.array;assert.ok([...before].every((v,i)=>Math.abs(v-afterId[i])<1e-5));
 const corner=lattice.children.find(c=>c.userData.fusion_lattice_index?.[0]===2&&c.userData.fusion_lattice_index?.[1]===2&&c.userData.fusion_lattice_index?.[2]===2);
 corner.position.y+=.5;applyLattice(mesh,lattice);
 assert.ok([...before].some((v,i)=>Math.abs(v-mesh.geometry.attributes.position.array[i])>1e-4));
});

test('cage rest capture and deform move follower with cage delta',()=>{
 const cage=box(1),follower=box(2),scene=new THREE.Group();scene.add(cage);scene.add(follower);scene.updateMatrixWorld(true);
 captureCageRest(cage);const y0=cage.geometry.attributes.position.getY(0);cage.geometry.attributes.position.setY(0,y0+.4);cage.geometry.attributes.position.needsUpdate=true;
 const before=follower.geometry.attributes.position.getY(0);applyCage(follower,cage,{strength:1});
 assert.ok(Math.abs(follower.geometry.attributes.position.getY(0)-(before+.4))<1e-4);
});
