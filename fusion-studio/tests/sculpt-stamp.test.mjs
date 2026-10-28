import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {stampAlpha} from '../src/sculpt-advanced.js';

function grid(){const g=new THREE.PlaneGeometry(1,1,128,128);g.clearGroups();g.addGroup(0,g.index.count/2,0);g.addGroup(g.index.count/2,g.index.count/2,1);return new THREE.Mesh(g,[new THREE.MeshStandardMaterial(),new THREE.MeshStandardMaterial()]);}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('UV stamp computes missing normals, preserves source and attributes, and follows both UV axes',()=>{
 const mesh=grid(),source=mesh.geometry;source.deleteAttribute('normal');const original=new Float32Array(source.attributes.position.array),indices=new Uint16Array(source.index.array),groups=structuredClone(source.groups);
 const result=stampAlpha(mesh,[.25,.75],{radius:.1,strength:.5,height:.02});assert.ok(result.vertices>100);assert.ok(result.stamped);assert.notEqual(mesh.geometry,source);assert.deepEqual(source.attributes.position.array,original);assert.equal(source.attributes.normal,undefined);
 assert.deepEqual(mesh.geometry.index.array,indices);assert.deepEqual(mesh.geometry.groups,groups);assert.deepEqual(mesh.geometry.attributes.uv.array,source.attributes.uv.array);assert.equal(mesh.geometry.attributes.position.count,source.attributes.position.count);
 const p=mesh.geometry.attributes.position,uv=mesh.geometry.attributes.uv;
 for(let i=0;i<p.count;i++){const d=Math.hypot(uv.getX(i)-.25,uv.getY(i)-.75)/.1,expected=d<1?(1-d)**2*(1+2*d)*.01:0;close(p.getZ(i),expected);close(p.getX(i),original[i*3]);close(p.getY(i),original[i*3+1]);}
 assert.ok(mesh.geometry.boundingBox.max.z>.009);
});

test('stamp is invariant to vertex ordering and samples grayscale alpha and masks',()=>{
 const a=grid(),original=a.geometry,b=grid(),count=original.attributes.position.count;
 for(const name of ['position','normal','uv']){const attr=original.attributes[name],values=[];for(let i=count-1;i>=0;i--)for(let c=0;c<attr.itemSize;c++)values.push(attr.getComponent(i,c));b.geometry.setAttribute(name,new THREE.Float32BufferAttribute(values,attr.itemSize));}
 b.geometry.setIndex(Array.from(original.index.array,i=>count-1-i));
 const options={radius:.25,strength:-.8,alpha:{width:2,height:2,data:new Uint8Array([0,255,0,255])}};
 stampAlpha(a,[.5,.5],options);stampAlpha(b,[.5,.5],options);
 for(let i=0;i<count;i++)close(a.geometry.attributes.position.getZ(i),b.geometry.attributes.position.getZ(count-1-i));
 const protectedMesh=grid();protectedMesh.geometry.setAttribute('mask',new THREE.Float32BufferAttribute(new Float32Array(count).fill(1),1));const source=protectedMesh.geometry;
 assert.equal(stampAlpha(protectedMesh).stamped,false);assert.equal(protectedMesh.geometry,source);
});

test('explicit source-vertex UV copies move together, with the strongest mask protecting the seam',()=>{
 const g=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0,0,0,0,1,0,0,0,1,0],3)).setAttribute('uv',new THREE.Float32BufferAttribute([.5,.5,1,0,0,1,0,0,1,0,0,1],2)).setIndex([0,1,2,3,4,5]);
 g.setAttribute('_fusion_source_vertex',new THREE.Float32BufferAttribute([0,1,2,0,1,2],1));const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial());
 stampAlpha(mesh);close(mesh.geometry.attributes.position.getZ(0),.01);close(mesh.geometry.attributes.position.getZ(3),.01);
 const protectedMesh=new THREE.Mesh(g.clone(),mesh.material);protectedMesh.geometry.setAttribute('mask',new THREE.Float32BufferAttribute([0,0,0,1,0,0],1));assert.equal(stampAlpha(protectedMesh).stamped,false);
});

test('invalid stamps and protected character/native sources fail before replacing geometry',()=>{
 for(const modify of [m=>m.geometry.deleteAttribute('uv'),m=>m.geometry.attributes.uv.setXY(0,NaN,0),m=>m.geometry.morphAttributes.position=[m.geometry.attributes.position.clone()],m=>{m.userData.nativeBlend={};},m=>{const owner=new THREE.Group();owner.userData.fusion_creator={};owner.add(m); }]){
  const mesh=grid();modify(mesh);const source=mesh.geometry;assert.throws(()=>stampAlpha(mesh),/UV|finite|copy/);assert.equal(mesh.geometry,source);
 }
 const mesh=grid(),source=mesh.geometry;for(const options of [{radius:0},{strength:NaN},{alpha:{width:1,height:1,data:[Infinity]}}]){assert.throws(()=>stampAlpha(mesh,[.5,.5],options));assert.equal(mesh.geometry,source);}
});

test('detailed 100k-triangle stamp retains topology and records measured CPU cost',t=>{
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1,256,196),new THREE.MeshStandardMaterial()),source=mesh.geometry,triangles=source.index.count/3,start=performance.now();
 const result=stampAlpha(mesh,[.25,.75],{radius:.2});assert.ok(triangles>=100000&&result.vertices>1000);assert.equal(mesh.geometry.index.count,source.index.count);assert.deepEqual(source.attributes.position.array.filter((_,i)=>i%3===2),new Float32Array(source.attributes.position.count));
 t.diagnostic(`${triangles} triangles / ${source.attributes.position.count} vertices: ${(performance.now()-start).toFixed(1)} ms CPU UV stamp, validation, normals and bounds.`);
});
