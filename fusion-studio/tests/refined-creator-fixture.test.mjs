import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {refinedCreatorDefinition} from './fixtures/refined-creator-definition.mjs';
import {validateCreatorDefinition} from '../src/character-creator.js';

test('detailed benchmark refinement retains surface, UV area, source ownership and normalized bindings',()=>{
 const original=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../public/characters/makehuman-v1.json.gz',import.meta.url)))),before=JSON.stringify(original),d=refinedCreatorDefinition(original,50000),s=d.source;
 validateCreatorDefinition(d);assert.equal(s.triangles.length/3,50000);assert.notEqual(d.identity,original.identity);assert.equal(d.controls.filter(c=>c.category==='Body').length,8);assert.equal(d.controls.filter(c=>c.category==='Face').length,8);
 assert.deepEqual(s.positions.slice(0,original.source.positions.length),original.source.positions);assert.deepEqual(s.bones,original.source.bones);assert.deepEqual(s.landmarks,original.source.landmarks);assert.equal(JSON.stringify(original),before);
 // Imported Float32 weights are retained exactly, including their original
 // rounding. Only newly authored midpoint weights are normalized in double.
 assert.deepEqual(s.skinWeight.slice(0,original.source.skinWeight.length),original.source.skinWeight);
 for(let i=0;i<s.positions.length/3;i++){assert.equal(s.mirror[s.mirror[i]],i);if(i>=original.source.positions.length/3)assert.ok(Math.abs(s.skinWeight.slice(i*4,i*4+4).reduce((a,b)=>a+b,0)-1)<4*Number.EPSILON);}
 function areas(source){let world=0,uv=0;for(let i=0;i<source.triangles.length;i+=3){const p=source.triangles.slice(i,i+3).map(id=>source.positions.slice(id*3,id*3+3)),a=p[1].map((v,k)=>v-p[0][k]),b=p[2].map((v,k)=>v-p[0][k]);world+=Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])/2;const u=source.cornerUV.slice(i*2,i*2+6);uv+=Math.abs((u[2]-u[0])*(u[5]-u[1])-(u[3]-u[1])*(u[4]-u[0]))/2;}return {world,uv};}
 const a=areas(original.source),b=areas(s);for(const key of ['world','uv'])assert.ok(Math.abs(a[key]-b[key])<a[key]*1e-10,`${key} area changed by ${b[key]-a[key]}`); // Double arithmetic over linear subdivisions only.
 assert.deepEqual(s.cornerSource,s.triangles);assert.ok(d.benchmark.limits.some(v=>v.includes('no new anatomical detail')));
});
