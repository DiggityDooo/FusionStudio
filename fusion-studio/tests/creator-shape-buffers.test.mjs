import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {expandCreatorShapes} from '../src/creator-shape-buffers.js';
import {createDetailedCharacter} from '../src/character-creator.js';

const definition=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../public/characters/makehuman-v1.json.gz',import.meta.url)))),sourceCount=definition.source.positions.length/3;
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
// Independent reference retains the old per-shape Map + full viewport gather.
function reference(ids,shapes,scale){return shapes.map(shape=>{const values=new Float32Array(ids.length*3),delta=new Map();for(let i=0;i<shape.deltas.length;i+=4)delta.set(shape.deltas[i],shape.deltas.slice(i+1,i+4).map(v=>v*scale));for(let i=0;i<ids.length;i++){const d=delta.get(ids[i]);if(d)values.set(d,i*3);}return values;});}
function shapes(ids,count){const unique=[...new Set(ids)],rows=Array.from({length:256},(_,i)=>unique[Math.floor(i*unique.length/256)]);return Array.from({length:count},(_,shape)=>({deltas:rows.flatMap((id,i)=>[id,(i%3-1)*.0001234567*(shape+1),i%2?-0:0,(i%7-3)*.0002345678]),value:shape%3===0?0:.35}));}
test('detailed adult source duplicates expand to byte-exact dense shapes without input mutation',()=>{
 for(const sex of ['female','male']){
  const character=createDetailedCharacter(definition,{sex}),body=character.getObjectByName('Body'),ids=body.geometry.attributes._fusion_source_vertex.array;
  assert.ok(body.geometry.index.count/3>=26000);assert.ok(new Set(ids).size<ids.length,'real UV/material duplicate source vertices');
  for(const count of [0,8,32,64])for(const scale of [.713579,1.234567]){
   const input=shapes(ids,count),original=structuredClone(input),before=ids.slice(),actual=expandCreatorShapes(ids,sourceCount,input,scale),expected=reference(ids,input,scale);
   assert.equal(actual.length,count);for(let i=0;i<count;i++)assert.ok(bytes(actual[i]).equals(bytes(expected[i])),sex+' '+count+' shape '+i);
   assert.deepEqual(input,original);assert.deepEqual(ids,before);
  }
 }
});
test('source-map and sparse edits cannot reuse stale incidence or shared output buffers',()=>{
 const character=createDetailedCharacter(definition),ids=character.getObjectByName('Body').geometry.attributes._fusion_source_vertex.array.slice(),input=shapes(ids,8),first=expandCreatorShapes(ids,sourceCount,input,1),saved=first.map(a=>a.slice());
 [ids[0],ids[1000]]=[ids[1000],ids[0]];input[0].deltas[1]=.007;const second=expandCreatorShapes(ids,sourceCount,input,1.3),expected=reference(ids,input,1.3);
 for(let i=0;i<second.length;i++){assert.ok(bytes(second[i]).equals(bytes(expected[i])));assert.ok(bytes(first[i]).equals(bytes(saved[i])));assert.notEqual(first[i].buffer,second[i].buffer);}
 const hidden=Array.from({length:sourceCount},(_,i)=>i).find(id=>!ids.includes(id));assert.notEqual(hidden,undefined);const empty=expandCreatorShapes(ids,sourceCount,[{deltas:[hidden,1,2,3]}],1)[0];assert.ok(empty.every(v=>v===0));
});
test('malformed detailed shape inputs reject before returning partial output',()=>{
 const character=createDetailedCharacter(definition),ids=character.getObjectByName('Body').geometry.attributes._fusion_source_vertex.array.slice(),input=shapes(ids,8),before=ids.slice();
 for(const delta of [[sourceCount,0,0,0],[.5,0,0,0],[0,NaN,0,0],[0,Infinity,0,0],[0,0,0]])assert.throws(()=>expandCreatorShapes(ids,sourceCount,[...input,{deltas:delta}],1),/Invalid creator shape-buffer/);
 const bad=ids.slice();bad[0]=sourceCount;assert.throws(()=>expandCreatorShapes(bad,sourceCount,input,1),/Invalid creator shape-buffer/);assert.throws(()=>expandCreatorShapes(ids,sourceCount,input,Infinity),/Invalid creator shape-buffer/);assert.throws(()=>expandCreatorShapes(ids,sourceCount,[{deltas:[0,1e40,0,0]}],1),/overflow/);assert.deepEqual(ids,before);
});
