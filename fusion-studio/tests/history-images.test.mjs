import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HistoryImages} from '../src/history-images.js';
test('history deduplicates pixel payloads across source identities without changing those identities',()=>{
 const cache=new HistoryImages(),payload={data:[1,2,3,4],width:1,height:1,type:'Uint8Array'},doc={images:[{uuid:'one',url:payload},{uuid:'two',url:payload}]},encoded=cache.capture(doc);assert.equal(cache.payloads.size,1);assert.deepEqual(cache.expand(JSON.parse(encoded)),doc);assert.ok(doc.images.every(i=>!i.fusion_history_image));const next=JSON.parse(encoded);next.images[0].fusion_history_image='missing';assert.throws(()=>cache.expand(next),/history image is missing/);
});
test('history resource pruning retains only payloads referenced by surviving snapshots',()=>{
 const cache=new HistoryImages(),a=cache.capture({images:[{uuid:'a',url:'data:image/png;base64,AAAA'}]}),b=cache.capture({images:[{uuid:'b',url:'data:image/png;base64,BBBB'}]});cache.prune([b]);assert.equal(cache.payloads.size,1);assert.equal(cache.expand(JSON.parse(b)).images[0].uuid,'b');assert.throws(()=>cache.expand(JSON.parse(a)),/missing/);const again=cache.capture({images:[{uuid:'a',url:'data:image/png;base64,AAAA'}]});assert.equal(cache.payloads.size,2);assert.equal(cache.expand(JSON.parse(again)).images[0].uuid,'a');
});
