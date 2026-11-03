import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {computeCreator,creatorInputs,defaultRecipe} from '../src/creator-data.js';
import {refineCharacterSurface,interpolateSparseTarget} from './fixtures/refined-character-surface.mjs';
const definition=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../public/characters/makehuman-v1.json.gz',import.meta.url))));
const key=ids=>[...ids].sort((a,b)=>a-b).join(':'),edge=(a,b)=>a<b?a+':'+b:b+':'+a;
function normal(p,a,b,c){const ab=[0,1,2].map(k=>p[b*3+k]-p[a*3+k]),ac=[0,1,2].map(k=>p[c*3+k]-p[a*3+k]);return [ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];}
function topology(index){const vertices=new Set(),edges=new Set();for(let i=0;i<index.length;i+=3)for(let k=0;k<3;k++){const a=index[i+k],b=index[i+(k+1)%3];vertices.add(a);edges.add(edge(a,b));}return {edges,euler:vertices.size-edges.size+index.length/3};}
test('50k/100k/200k adult refinement retains source-face coverage, winding and conforming topology',()=>{
 for(const sex of ['female','male']){
  const positions=computeCreator(creatorInputs(definition,defaultRecipe(sex))).positions,index=definition.source.triangles,original=topology(index),faces=new Map();
  for(let i=0;i<index.length;i+=3){const ids=index.slice(i,i+3),n=normal(positions,...ids);assert.ok(!faces.has(key(ids)));faces.set(key(ids),{normal:n,area:Math.hypot(...n)/2});}
  for(const target of [50000,100000,200000]){
   const fixture=refineCharacterSurface(positions,index,target),lineage=Array.from({length:positions.length/3},(_,i)=>[i]),areas=new Map();
   for(const [id,a,b]of fixture.parents){assert.ok(a<id&&b<id);lineage[id]=[...new Set([...lineage[a],...lineage[b]])];assert.ok(lineage[id].length<=3);}
   assert.equal(fixture.index.length/3,target);const derived=topology(fixture.index);assert.equal(derived.euler,original.euler);
   for(const [,a,b]of fixture.parents)assert.ok(!derived.edges.has(edge(a,b)),'no unsplit neighbor spans a selected edge');
   for(let i=0;i<fixture.index.length;i+=3){const ids=Array.from(fixture.index.slice(i,i+3)),sourceKey=key(new Set(ids.flatMap(id=>lineage[id]))),source=faces.get(sourceKey);assert.ok(source,'each triangle stays inside one source face');const n=normal(fixture.positions,...ids);assert.ok(n.reduce((sum,x,k)=>sum+x*source.normal[k],0)>=-1e-18,'winding stays consistent');areas.set(sourceKey,(areas.get(sourceKey)||0)+Math.hypot(...n)/2);}
   for(const [id,source]of faces)assert.ok(Math.abs((areas.get(id)||0)-source.area)<=1e-8+source.area*1e-5,'source-face area remains covered');
  }
 }
});
test('refined sparse targets reproduce an independently defined affine displacement field',()=>{
 const positions=computeCreator(creatorInputs(definition,defaultRecipe('male'))).positions,fixture=refineCharacterSurface(positions,definition.source.triangles,50000),data=[];
 for(let i=0;i<positions.length;i+=3)data.push(i/3,positions[i]*.001,positions[i+1]*.002,positions[i+2]*-.003);
 const rows=interpolateSparseTarget(data,fixture),dense=new Float32Array(fixture.positions.length);for(const [id,x,y,z]of rows)dense.set([x,y,z],id*3);
 for(let i=0;i<dense.length;i++)assert.ok(Math.abs(dense[i]-fixture.positions[i]*[.001,.002,-.003][i%3])<2e-9);
});
