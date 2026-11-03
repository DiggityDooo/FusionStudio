import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {createDetailedCharacter} from '../src/character-creator.js';
import {deformSparse} from '../src/deformation.js';
import {referenceSparse} from './fixtures/sparse-deformation-reference.mjs';
const definition=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../public/characters/makehuman-v1.json.gz',import.meta.url)))),bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
function fixture(sex='female'){
 const body=createDetailedCharacter(definition,{sex}).getObjectByName('Body');assert.ok(body.geometry.index.count/3>=26000);
 const base=body.geometry.attributes.position.array.slice(),ids=body.geometry.attributes._fusion_source_vertex.array.slice(),unique=[...new Set(ids)];
 const morphs=Array.from({length:64},(_,i)=>({id:'probe'+i,deltas:Array.from({length:128},(_,j)=>[unique[Math.floor(j*unique.length/128)],(i%3-1)*.000123,(j%5-2)*.000234,-0])}));return {base,ids,morphs};
}
test('packed sparse deformation preserves detailed split-source arithmetic exactly across mixed controls',()=>{
 for(const sex of ['female','male']){
  const {base,ids,morphs}=fixture(sex),before=base.slice(),original=ids.slice();assert.ok(new Set(ids).size<ids.length);
  for(const count of [0,8,32,64]){const selected=morphs.slice(0,count),values=Object.fromEntries(selected.map((m,i)=>[m.id,i%3===0?0:i%3===1?-.45:.35])),expected=referenceSparse(base,ids,selected,values),actual=deformSparse(base,ids,selected,values);assert.ok(bytes(actual).equals(bytes(expected)));}
  assert.deepEqual(base,before);assert.deepEqual(ids,original);
 }
});
test('sparse source namespaces, mutable maps and one-read index capture retain exact results',()=>{
 const {base,ids,morphs}=fixture(),values=Object.fromEntries(morphs.map(m=>[m.id,.25]));ids[0]=1999999;morphs[0].deltas.push([1999999,.003,-.002,.001]);
 const first=deformSparse(base,ids,morphs,values),saved=first.slice();assert.ok(bytes(first).equals(bytes(referenceSparse(base,ids,morphs,values))));
 [ids[1],ids[1000]]=[ids[1000],ids[1]];morphs[0].deltas[0][1]+=.001;const second=deformSparse(base,ids,morphs,values);assert.ok(bytes(second).equals(bytes(referenceSparse(base,ids,morphs,values))));assert.ok(bytes(first).equals(bytes(saved)));
 const plain=Array.from(ids),reads=new Uint8Array(ids.length),proxy=new Proxy(plain,{get(target,key){if(typeof key==='string'&&/^\d+$/.test(key)){const i=Number(key);reads[i]++;return reads[i]===1?target[i]:0;}return Reflect.get(target,key);}});
 assert.ok(bytes(deformSparse(base,proxy,morphs,values)).equals(bytes(referenceSparse(base,plain,morphs,values))));assert.ok(reads.every(count=>count===1));
});
test('malformed numeric sparse rows produce actionable errors without changing detailed inputs',()=>{
 const {base,ids,morphs}=fixture(),before=base.slice(),values={bad:1};
 for(const row of [null,undefined,[0,0,0],[0,NaN,0,0],[.5,0,0,0]])assert.throws(()=>deformSparse(base,ids,[{id:'bad',deltas:[row]}],values),/Invalid sparse delta|finite scalar/);
 assert.throws(()=>deformSparse(base,ids,[{id:'bad',deltas:[[0,1e39,0,0]]}],values),/overflow/);assert.deepEqual(base,before);
});
