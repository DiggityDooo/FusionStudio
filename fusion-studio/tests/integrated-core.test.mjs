import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as THREE from 'three';
import {geometryRequest,remapGeometry} from '../src/component-edit.js';
import {SceneEvaluator,evaluateGraph} from '../src/evaluation.js';
const require=createRequire(import.meta.url),native=require('../native/fusion_geometry.node');
const run=q=>JSON.parse(native.editMesh(JSON.stringify(q)));
function detailed(){const g=new THREE.TorusKnotGeometry(.7,.18,384,48);g.clearGroups();g.addGroup(0,g.index.count/2,0);g.addGroup(g.index.count/2,g.index.count/2,1);return g;}
test('detailed 36,864-triangle mesh transforms and splits with UV/material mappings',()=>{
 const g=detailed(),q=geometryRequest(g),start=performance.now(),r=run({...q,operation:'transform',vertices:[100,101,102],matrix:new THREE.Matrix4().makeTranslation(.01,0,0).toArray()});
 assert.equal(r.faces.length,36864);assert.equal(r.positions[100][0],q.positions[100][0]+.01);assert.deepEqual(r.positions[99],q.positions[99]);
 const edge=q.faces[125].slice(0,2),split=run({...q,operation:'split',edges:[edge]}),mapped=remapGeometry(g,split);assert.ok(split.faces.length>q.faces.length);assert.deepEqual(new Set(mapped.groups.map(g=>g.materialIndex)),new Set([0,1]));
 const added=split.vertexSources.findIndex(v=>v.length===2);assert.ok(added>=0);const sources=split.vertexSources[added];assert.ok(Math.abs(mapped.attributes.uv.getX(added)-sources.reduce((sum,[i,w])=>sum+g.attributes.uv.getX(i)*w,0))<1e-6);
 console.log(JSON.stringify({fixture:'detailed torus knot',triangles:q.faces.length,vertices:q.positions.length,transformAndSplitMs:performance.now()-start}));
});
test('merge preserves UV splits, deletion/extrusion retain a valid surface, invalid selections fail',()=>{
 const g=detailed(),q=geometryRequest(g),vertices=q.positions.map((_,i)=>i);const r=run({...q,operation:'merge',vertices,distance:.00001});assert.equal(r.positions.length,q.positions.length,'UV seam vertices must not weld');
 const e=run({...q,operation:'extrude',selectedFaces:[500,501],distance:.01});assert.ok(e.faces.length>q.faces.length);assert.equal(e.faceSources.length,e.faces.length);
 const d=run({...q,operation:'delete',selectedFaces:[500,501]});assert.equal(d.faces.length,q.faces.length-2);
 assert.throws(()=>run({...q,operation:'transform',vertices:[999999]}),/selection/);
});
test('planar vertex dissolve removes a center while returning explicit sources',()=>{
 const q={positions:[[0,0,0],[1,0,0],[0,1,0],[.2,.2,0]],faces:[[0,1,3],[1,2,3],[2,0,3]],operation:'dissolve',vertices:[3]};const r=run(q);assert.equal(r.positions.length,3);assert.equal(r.faces.length,1);
});
test('dependency evaluation orders inputs; stale and superseded jobs cannot apply',async()=>{
 const root=new THREE.Group(),object=new THREE.Object3D();root.add(object);const editor={root},evaluation=new SceneEvaluator(editor);
 let finish;const wait=evaluation.run(object,{x:1},()=>new Promise(resolve=>finish=resolve));while(!finish)await new Promise(resolve=>setTimeout(resolve,1));evaluation.invalidate();finish('stale');await assert.rejects(wait,/scene changed/);
 const result=await evaluateGraph([{id:'garment',dependencies:['body'],evaluate:v=>v.get('body')+1},{id:'body',evaluate:()=>2}]);assert.equal(result.get('garment'),3);
 await assert.rejects(evaluateGraph([{id:'a',dependencies:['b']},{id:'b',dependencies:['a']}]),/cycle/);
});
test('directional cloth on a detailed surface remains finite and reports contact mode',()=>{
 const g=new THREE.PlaneGeometry(1,1,100,100),p=g.attributes.position,idx=g.index.array;const positions=Array.from({length:p.count},(_,i)=>[p.getX(i),p.getY(i)+1,0]),faces=Array.from({length:idx.length/3},(_,i)=>Array.from(idx.slice(i*3,i*3+3))),pins=positions.map((p,i)=>p[1]>1.49?i:-1).filter(i=>i>=0);
 const request={positions,faces,pins,sewing:[],colliders:[],steps:2,iterations:2,stretch:1e-7,bend:1e-4,thickness:.003,selfCollision:false,materialCoordinates:positions.map(p=>p.slice(0,2)),fabricCompliance:[1e-7,2e-7,3e-7],friction:.25,triangleCollider:{positions:[[-2,-.01,-2],[2,-.01,-2],[0,-.01,2]],triangles:[[0,1,2]]}};
 const r=JSON.parse(native.drapeGarment(JSON.stringify(request)));assert.equal(r.metrics.triangles,20000);assert.equal(r.metrics.directionalFabric,true);assert.equal(r.metrics.triangleContact,true);assert.equal(r.metrics.pinDrift,0);assert.ok(r.positions.flat().every(Number.isFinite));console.log(JSON.stringify({fixture:'20k cloth',...r.metrics}));
});
