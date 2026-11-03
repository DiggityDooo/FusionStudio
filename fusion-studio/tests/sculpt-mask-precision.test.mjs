import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {sculptGeometry,transferMask} from '../src/mesh-tools.js';

const point=new THREE.Vector3(0,1,0),normal=point.clone(),delta=new THREE.Vector3(.04,.01,.02);

test('normalized mask transfer to a detailed working copy retains fractional protection',()=>{
 const source=new THREE.PlaneGeometry(1,1),raw=new Uint8Array([0,64,128,255]);source.setAttribute('mask',new THREE.BufferAttribute(raw,1,true));
 for(const packed of [false,true]){
  const target=new THREE.PlaneGeometry(1,1,192,144);if(packed)target.setAttribute('mask',new THREE.Uint16BufferAttribute(new Uint16Array(target.attributes.position.count),1,true));
  assert.equal(target.index.count/3,55296);transferMask(source,target);const p=target.attributes.position,m=target.attributes.mask;
  for(let i=0;i<p.count;i++){const corner=(p.getX(i)>0?1:0)+(p.getY(i)<0?2:0),expected=raw[corner]/255;assert.equal(m.getX(i),packed?Math.round(expected*65535)/65535:Math.fround(expected));}
  assert.equal(m.normalized,packed);assert.deepEqual(raw,new Uint8Array([0,64,128,255]));
 }
});
function detailedPair(ArrayType,max){
 const geometry=new THREE.SphereGeometry(1,192,144),count=geometry.attributes.position.count;
 assert.equal(geometry.index.count/3,54912);
 const packed=new THREE.BufferAttribute(new ArrayType(count).fill(Math.round(max/4)),1,true);
 const reference=new THREE.BufferAttribute(new Float64Array(count).fill(packed.getX(0)),1);
 geometry.setAttribute('mask',packed);
 const other=geometry.clone();other.setAttribute('mask',reference);
 return [new THREE.Mesh(geometry),new THREE.Mesh(other)];
}

test('detailed sculpt protection uses normalized mask values across brush families',()=>{
 for(const [ArrayType,max]of [[Uint8Array,255],[Uint16Array,65535]]){
  for(const brush of ['draw','inflate','grab','smooth','elastic-deform','cloth','crease-polish']){
   const [mesh,reference]=detailedPair(ArrayType,max),before=new Float32Array(mesh.geometry.attributes.position.array);
   const opts={normal,delta,falloff:'smooth'};
   sculptGeometry(mesh,point,.35,.025,brush,false,opts);
   sculptGeometry(reference,point,.35,.025,brush,false,opts);
   assert.notDeepEqual(reference.geometry.attributes.position.array,before,brush+' reference must actually deform');
   assert.deepEqual(mesh.geometry.attributes.position.array,reference.geometry.attributes.position.array,ArrayType.name+' '+brush+' must match equivalent floating-point protection');
   mesh.geometry.dispose();reference.geometry.dispose();
  }
 }
});

test('normalized mask painting and erasing match float masks within storage quantization without moving detailed geometry',()=>{
 for(const [ArrayType,max]of [[Uint8Array,255],[Uint16Array,65535]]){
  for(const invert of [false,true]){
   const [mesh,reference]=detailedPair(ArrayType,max),before=new Float32Array(mesh.geometry.attributes.position.array),mask=mesh.geometry.attributes.mask,initial=mask.getX(0);
   sculptGeometry(mesh,point,.35,.012,'mask',invert,{normal});
   sculptGeometry(reference,point,.35,.012,'mask',invert,{normal});
   const expected=reference.geometry.attributes.mask;let changed=0;
   for(let i=0;i<mask.count;i++){
    assert.ok(Math.abs(mask.getX(i)-expected.getX(i))<=.5/max+1e-14,'Stored normalized protection must differ only by half a quantization step');
    if(mask.getX(i)!==initial){changed++;assert.ok(invert?mask.getX(i)<initial:mask.getX(i)>initial);}
   }
   assert.ok(changed>0,'Paint must change actual stored protection');
   assert.deepEqual(mesh.geometry.attributes.position.array,before);
   assert.ok(mask.normalized&&mask.array instanceof ArrayType,'Retain normalized storage');
   mesh.geometry.dispose();reference.geometry.dispose();
  }
 }
});
