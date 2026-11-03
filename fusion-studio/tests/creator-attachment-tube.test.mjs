import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import * as THREE from 'three';
import {createAttachmentTube} from '../src/creator-attachment-tube.js';
import {referenceAttachmentTube} from './fixtures/attachment-tube-reference.mjs';
import {fitHairGuides} from '../src/creator-hair.js';
import {computeCreator,creatorInputs,defaultRecipe} from '../src/creator-data.js';

const definition=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../public/characters/makehuman-v1.json.gz',import.meta.url))));
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
function exact(actual,expected){
 assert.deepEqual(Object.keys(actual.attributes),Object.keys(expected.attributes));
 for(const name of Object.keys(expected.attributes)){
  assert.equal(actual.attributes[name].count,expected.attributes[name].count,name);
  assert.deepEqual(bytes(actual.attributes[name].array),bytes(expected.attributes[name].array),name);
 }
 assert.deepEqual(bytes(actual.index.array),bytes(expected.index.array),'indices');
 for(const name of ['tangents','normals','binormals'])assert.deepEqual(actual[name],expected[name],name);
}
function compare(points,radius=.0001){
 const before=points.map(p=>p.toArray()),expected=referenceAttachmentTube(points,radius),actual=createAttachmentTube(points,radius);
 try{exact(actual,expected);assert.deepEqual(points.map(p=>p.toArray()),before);return actual;}
 finally{expected.dispose();actual.dispose();}
}

test('compiled attachment tubes preserve exact arc mapping, frames, taper and topology at difficult open-curve knots',()=>{
 const cases=[[[0,0,0],[1,2,3]],[[0,0,0],[0,0,0],[0,0,0]],[[0,0,0],[0,0,0],[1,1,1],[1,1,1]],[[0,0,0],[1e-15,-1e-15,0],[.1,.02,-.03],[2,1,3]],[[10,20,30],[10.00001,20.000002,30.00004],[10.1,20.1,30.2]]];
 for(const count of [3,7,24,32,49])cases.push(Array.from({length:count},(_,i)=>[Math.sin(i*1.3)*.003+i*.0001,Math.cos(i*.67)*.002,Math.sin(i*.5)*.004]));
 for(const path of cases)compare(path.map(p=>new THREE.Vector3(...p)));
});

test('detailed adult morph extremes preserve every authored brow, lash and facial-hair tube byte',t=>{
 const before=JSON.stringify(definition),styles=['brows','lashes-upper','lashes-lower',...Object.keys(definition.source.hair.styles).filter(k=>!['brows','lashes-upper','lashes-lower','short','long'].includes(k))];
 let curves=0;
 for(const sex of ['female','male'])for(const control of [-.8,.8]){
  const recipe=defaultRecipe(sex);recipe.controls[definition.controls[0].id]=control;
  const {positions}=computeCreator(creatorInputs(definition,recipe)),head=new THREE.Vector3();
  for(const id of definition.source.landmarks['joint-head'])head.add(new THREE.Vector3().fromArray(positions,id*3));
  head.divideScalar(definition.source.landmarks['joint-head'].length);
  for(const style of styles){
   const guides=definition.source.hair.styles[style];assert.ok(guides?.length,style);
   const fit=fitHairGuides({positions,guides,density:['brows','beard','moustache'].includes(style)?2:1});
   for(const path of fit.paths){compare(Array.from({length:path.length/3},(_,i)=>new THREE.Vector3().fromArray(path,i*3).sub(head)));curves++;}
  }
 }
 assert.ok(curves>200,'Detailed real-asset corpus required');assert.equal(JSON.stringify(definition),before);t.diagnostic(curves+' detailed authored curves match exactly');
});

test('compiled sampler cannot survive geometry build or become a stale mutable path cache',()=>{
 const points=[new THREE.Vector3(0,0,0),new THREE.Vector3(.001,.003,0),new THREE.Vector3(.004,.005,.002)];
 const first=compare(points),curve=first.parameters.path;
 assert.equal(curve.getPoint,THREE.CatmullRomCurve3.prototype.getPoint);assert.equal(Object.hasOwn(curve,'getPoint'),false);
 points[1].set(.003,.01,-.003);curve.updateArcLengths();
 const fresh=new THREE.CatmullRomCurve3(points);
 for(const t of [0,.01,.2,.5,.83,1]){assert.deepEqual(curve.getPoint(t),fresh.getPoint(t));assert.deepEqual(curve.getPointAt(t),fresh.getPointAt(t));}
 compare(points);
});

test('malformed attachment curves reject before mutating source points',()=>{
 const points=[new THREE.Vector3(),new THREE.Vector3(1,2,3)],before=points.map(p=>p.toArray());
 for(const path of [null,[],points.slice(0,1),[...points,new THREE.Vector3(NaN,0,0)],[{x:0,y:0,z:0},points[1]]])assert.throws(()=>createAttachmentTube(path,.001),/Invalid attachment curve/);
 for(const radius of [0,-1,NaN,Infinity])assert.throws(()=>createAttachmentTube(points,radius),/Invalid attachment curve/);
 assert.deepEqual(points.map(p=>p.toArray()),before);
});

test('failed geometry completion restores the curve method and disposes the unpublished tube',()=>{
 const original=THREE.BufferGeometry.prototype.computeVertexNormals,points=[new THREE.Vector3(),new THREE.Vector3(.001,.002,.003)];
 let curve,disposed=false;
 try{
  THREE.BufferGeometry.prototype.computeVertexNormals=function(){
   curve=this.parameters.path;assert.equal(Object.hasOwn(curve,'getPoint'),true);
   this.addEventListener('dispose',()=>{disposed=true;});throw Error('injected attachment completion failure');
  };
  assert.throws(()=>createAttachmentTube(points,.0001),/injected attachment completion failure/);
 }finally{THREE.BufferGeometry.prototype.computeVertexNormals=original;}
 assert.equal(disposed,true);assert.equal(curve.getPoint,THREE.CatmullRomCurve3.prototype.getPoint);assert.equal(Object.hasOwn(curve,'getPoint'),false);
 compare(points);
});
