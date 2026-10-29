import test from 'node:test';
import assert from 'node:assert/strict';
import {LodCandidates} from '../src/lod-candidates.js';

const compare=(a,b)=>a.cost-b.cost||a.keep-b.keep||a.remove-b.remove;
test('indexed edge candidates agree with a sorted reference through replacement, removal and extraction',()=>{
  const queue=new LodCandidates(600),reference=new Map();let seed=4109;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let step=0;step<12000;step++){
    const a=Math.floor(random()*24),b=24+Math.floor(random()*24),key=a+':'+b,op=random();
    if(op<.65){const row={keep:random()<.5?a:b,remove:0,cost:Math.floor(random()*32),revision:step};row.remove=row.keep===a?b:a;queue.push(row);reference.set(key,row);}
    else if(op<.85){queue.delete(b,a);reference.delete(key);}
    else{const expected=[...reference.values()].sort(compare)[0];assert.deepEqual(queue.pop(),expected);if(expected)reference.delete(Math.min(expected.keep,expected.remove)+':'+Math.max(expected.keep,expected.remove));}
    assert.equal(queue.items.length,reference.size);assert.equal(queue.indices.size,reference.size);
    for(const [key,index]of queue.indices){const row=queue.items[index];assert.equal(queue.key(row.keep,row.remove),key);if(index)assert.ok(compare(queue.items[(index-1)>>1],row)<=0);}
  }
  for(const row of [...reference.values()].sort(compare))assert.deepEqual(queue.pop(),row);assert.equal(queue.pop(),undefined);assert.equal(queue.indices.size,0);
});

test('a full candidate queue replaces existing edges but rejects new edges atomically',()=>{
  const q=new LodCandidates(2);q.push({keep:0,remove:1,cost:3});q.push({keep:2,remove:3,cost:2});q.push({keep:1,remove:0,cost:1});assert.equal(q.peak,2);assert.throws(()=>q.push({keep:4,remove:5,cost:0}),/budget/);assert.deepEqual(q.pop(),{keep:1,remove:0,cost:1});assert.deepEqual(q.pop(),{keep:2,remove:3,cost:2});assert.equal(q.pop(),undefined);
});
