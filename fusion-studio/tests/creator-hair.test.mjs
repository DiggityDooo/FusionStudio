import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {fitHairGuides,scalpStrandGuides} from '../src/creator-hair.js';
const definition=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../public/characters/makehuman-v1.json.gz',import.meta.url))));
const guide={triangle:[0,1,2],barycentric:[.2,.3,.5],offsets:[0,0,.001,0,.01,.002,0,.02,.003]};
const positions=[0,0,0,1,0,0,0,1,0];

test('triangle-bound strands preserve authored roots under rigid scalp motion',()=>{
 const original=fitHairGuides({positions,guides:[guide],density:1}),moved=positions.map((v,i)=>i%3===0?-positions[i+1]+2:i%3===1?positions[i-1]+3:v-1),next=fitHairGuides({positions:moved,guides:[guide],density:1});
 for(let i=0;i<original.paths[0].length;i+=3){const [x,y,z]=original.paths[0].slice(i,i+3);assert.ok(Math.abs(next.paths[0][i]-(-y+2))<1e-12);assert.ok(Math.abs(next.paths[0][i+1]-(x+3))<1e-12);assert.ok(Math.abs(next.paths[0][i+2]-(z-1))<1e-12);}
 assert.deepEqual(positions,[0,0,0,1,0,0,0,1,0]);
});

test('bad scalp correspondence, collapsed triangles, invalid coordinates and excessive allocations reject',()=>{
 assert.throws(()=>fitHairGuides({positions:[0,0,0,0,0,0,0,0,0],guides:[guide]}),/collapsed/);
 assert.throws(()=>fitHairGuides({positions:[NaN,0,0,1,0,0,0,1,0],guides:[guide]}),/invalid coordinates/);
 assert.throws(()=>fitHairGuides({positions,guides:[{...guide,barycentric:[-.3,.8,.5]}]}),/correspondence/);
 assert.throws(()=>fitHairGuides({positions,guides:Array(20001).fill(guide)}),/Invalid hair/);
 assert.throws(()=>scalpStrandGuides(definition.source,'short',{count:20001}),/Unsupported/);
});

test('detailed CC0 scalp interpolation is seeded, stays on valid body triangles and retains immutable source data',()=>{
 const source=definition.source,before=JSON.stringify(source.hair),guides=scalpStrandGuides(source,'short',{count:1200});assert.equal(guides.length,1200);assert.equal(scalpStrandGuides(source,'short',{count:1200}),guides);
 for(const g of guides){assert.ok(Math.abs(g.barycentric.reduce((a,b)=>a+b,0)-1)<1e-12);assert.ok(g.barycentric.every(v=>v>=0&&v<=1));assert.equal(g.offsets.length,72);assert.ok(g.offsets.every(Number.isFinite));}
 const first=fitHairGuides({positions:source.positions,guides,density:1}),again=fitHairGuides({positions:source.positions,guides,density:1});assert.deepEqual(first.paths,again.paths);assert.equal(JSON.stringify(source.hair),before);assert.equal(first.roots,1200);
 for(const style of ['wavy','curly','coily']){const r=fitHairGuides({positions:source.positions,guides:guides.slice(0,20),curl:style,density:1});assert.ok(r.paths.every(p=>p.every(Number.isFinite)));for(let i=0;i<20;i++)assert.deepEqual(r.paths[i].slice(0,3),first.paths[i].slice(0,3));}
});
