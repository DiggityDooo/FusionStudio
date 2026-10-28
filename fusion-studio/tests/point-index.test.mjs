import test from 'node:test';
import assert from 'node:assert/strict';
import {PointIndex} from '../src/point-index.js';
function points(count){let state=3721;const rnd=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};return Array.from({length:count},()=>({p:[rnd()*4-2,rnd()*4-2,rnd()*4-2]}));}
const brute=(items,p,limit=Infinity)=>{let best=null,distance=limit;items.forEach((item,index)=>{const d=Math.hypot(...p.map((v,a)=>v-item.p[a]));if(d<distance||d===distance&&best===null){best={item,index,distance:d};distance=d;}});return best;};
test('KD nearest results agree with independent brute-force searches, including distance cutoffs',()=>{
 const items=points(5000),index=new PointIndex(items),queries=points(100).map(x=>x.p);
 for(const point of queries)for(const limit of [Infinity,.05,.25]){const actual=index.nearest(point,limit),expected=brute(items,point,limit);assert.equal(actual?.index,expected?.index);if(actual)assert.ok(Math.abs(actual.distance-expected.distance)<1e-12);}
});
test('ties are deterministic, positions are immutable snapshots, and malformed queries reject',()=>{
 const items=[{p:[-1,0,0]},{p:[1,0,0]},{p:[1,0,0]}],index=new PointIndex(items);assert.equal(index.nearest([0,0,0],1).index,0);assert.equal(index.nearest([1,0,0],0).index,1);items[0].p[0]=100;assert.equal(index.nearest([-1,0,0]).index,0);
 assert.equal(new PointIndex([]).nearest([0,0,0]),null);for(const limit of [-1,NaN,'1'])assert.throws(()=>index.nearest([0,0,0],limit));assert.throws(()=>new PointIndex([{p:[NaN,0,0]}]));
 const duplicates=Array.from({length:10000},()=>({p:[0,0,0]}));assert.equal(new PointIndex(duplicates).nearest([0,0,0]).index,0);
});
test('dense spatial index records construction and query timings',t=>{
 const items=points(50000),start=performance.now(),index=new PointIndex(items),built=performance.now();let checksum=0;
 for(let i=0;i<1000;i++)checksum+=index.nearest(items[i].p).index;assert.equal(checksum,999*1000/2);
 t.diagnostic(`50,000 points: ${(built-start).toFixed(1)} ms build; 1,000 nearest queries: ${(performance.now()-built).toFixed(1)} ms.`);
});
