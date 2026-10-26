import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {starterPattern,tshirtPattern,buildPattern,validatePattern,createPatternObject,patternPayload} from '../src/patterns.js';
import {createRequire} from 'node:module';
const {validatePatternPayload}=createRequire(import.meta.url)('../electron/pattern-payload.cjs');
test('polygon cloth tessellation preserves concave area, boundaries, pins and seam mapping',()=>{
 const doc=starterPattern();doc.panels[0].points=[[0,0],[.6,0],[.6,.3],[.3,.3],[.3,.7],[0,.7]];doc.panels[0].pins=[4];doc.seams=[];
 const data=buildPattern(doc);let area=0;for(const [a,b,c] of data.faces){const p=[a,b,c].map(i=>new THREE.Vector3().fromArray(data.positions,i*3));area+=p[1].sub(p[0]).cross(p[2].sub(p[0])).length()/2;}
 assert.ok(Math.abs(area-(.6*.3+.3*.4+.56*.65))<1e-6);assert.ok(data.pins.length>0);
 const initial=buildPattern(starterPattern());assert.equal(initial.sewing.length,18);for(const [a,b] of initial.sewing){assert.ok(Math.abs(initial.positions[a*3]-initial.positions[b*3])<1e-8);assert.ok(Math.abs(initial.positions[a*3+1]-initial.positions[b*3+1])<1e-8);assert.ok(Math.abs(initial.positions[a*3+2]-initial.positions[b*3+2]-.4)<1e-8);}
 const shirt=buildPattern(tshirtPattern());assert.equal(new Set(shirt.sewing.map(pair=>[...pair].sort((a,b)=>a-b).join(':'))).size,shirt.sewing.length);
});
test('invalid outlines, seam references, duplicate edges and excessive meshes are rejected',()=>{
 const bad=starterPattern();bad.panels[0].points=[[0,0],[1,1],[0,1],[1,0]];assert.throws(()=>validatePattern(bad),/crosses/);
 const dup=starterPattern();dup.seams.push(structuredClone(dup.seams[0]));assert.throws(()=>validatePattern(dup),/only one seam/);
 const missing=starterPattern();missing.seams[0].a[0]='missing';assert.throws(()=>validatePattern(missing),/missing panel/);
 const large=starterPattern();large.subdivision=5;large.panels[0].points=Array.from({length:64},(_,i)=>[Math.cos(i*Math.PI/32),Math.sin(i*Math.PI/32)]);assert.throws(()=>validatePattern(large),/60,000/);
 const mismatch=starterPattern();mismatch.panels[0].points[2][1]=1;assert.ok(validatePattern(mismatch).warnings.some(w=>w.includes('10%')));
});
test('pattern project roundtrip retains seams, placement and validated world-space simulation data',async()=>{
 const group=createPatternObject(starterPattern());group.position.set(2,0,1);group.scale.setScalar(1.2);const payload=patternPayload(group);assert.equal(validatePatternPayload(payload).vertices.length,payload.vertices.length);
 assert.ok(Math.abs(payload.vertices[0][0]-(2-.28*1.2))<1e-8);
 const restored=await new THREE.ObjectLoader().parseAsync(group.toJSON());assert.deepEqual(restored.userData.patternProject,group.userData.patternProject);assert.deepEqual(patternPayload(restored),payload);
 assert.throws(()=>validatePatternPayload({...payload,sewing:[[0,999999]]}),/indices/);assert.throws(()=>validatePatternPayload({...payload,vertices:[[NaN,0,0]]}),/count/);
});
