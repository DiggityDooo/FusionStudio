import {surfacePreparation} from '../src/surface-preparation.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {drapeRequest,liveTshirtPattern,generateGarment} from '../src/hybrid.js';
import {sourcePlacementBody,evaluateSourcePlacement} from '../src/garment-placement.js';
import {evaluatedCharacterTriangles,evaluateCharacter} from '../src/deformation.js';
const require=createRequire(import.meta.url),native=require('../native/fusion_geometry.node'),{GeometryEngine}=require('../electron/geometry.cjs');
const run=(method,request)=>JSON.parse(native[method](JSON.stringify(request)));
function grid(n=128){const positions=[],triangles=[];for(let y=0;y<=n;y++)for(let x=0;x<=n;x++)positions.push([x/n,y/n,0]);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const a=y*(n+1)+x;triangles.push([a,a+1,a+n+2],[a,a+n+2,a+n+1]);}return {positions,triangles};}
async function genesis(){const f=JSON.parse(fs.readFileSync('test-output/dson-integration-results.json')),bytes=fs.readFileSync(f.output),{scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');scene.userData.fusion_id=scene.uuid;return {scene,bytes,file:f.output};}

test('detailed surface attachments preserve rigid motion and scale to numerical precision',()=>{
 const body=grid(),positions=body.positions.map(p=>[p[0],p[1],.013]),source=structuredClone(body),before=structuredClone(positions),r=run('bindGarment',{body,positions,bodyId:'figure',maximumDistance:.5});assert.equal(r.binding.attachments.length,16641);assert.equal(r.metrics.bodyTriangles,32768);
 const matrix=new THREE.Matrix4().compose(new THREE.Vector3(3,2,-1),new THREE.Quaternion().setFromEuler(new THREE.Euler(.6,.4,.3)),new THREE.Vector3(1.3,1.3,1.3)),transform=p=>new THREE.Vector3(...p).applyMatrix4(matrix).toArray(),posed={positions:body.positions.map(transform),triangles:body.triangles},result=run('placeGarment',{binding:r.binding,body:posed,bodyId:'figure'});
 let error=0;for(let i=0;i<positions.length;i++)for(let a=0;a<3;a++)error=Math.max(error,Math.abs(result.positions[i][a]-transform(positions[i])[a]));assert.ok(error<1e-11);assert.deepEqual(body,source);assert.deepEqual(positions,before);assert.deepEqual(run('placeGarment',{binding:r.binding,body,bodyId:'figure'}).positions,before);
});

test('wrong body, changed connectivity, degenerate targets, malformed attachments and excessive distance reject',()=>{
 const body={positions:[[0,0,0],[1,0,0],[0,1,0]],triangles:[[0,1,2]]},r=run('bindGarment',{body,positions:[[.2,.3,.01]],bodyId:'figure',maximumDistance:.5}),request={binding:r.binding,body,bodyId:'figure'};
 assert.throws(()=>run('placeGarment',{...request,bodyId:'other'}),/different body/);assert.throws(()=>run('placeGarment',{...request,body:{...body,triangles:[[1,0,2]]}}),/topology/);assert.throws(()=>run('placeGarment',{...request,body:{...body,positions:[[0,0,0],[1,0,0],[1,0,0]]}}),/collapsed/);
 const b=structuredClone(r.binding);b.attachments[0].barycentric=[2,0,-1];assert.throws(()=>run('placeGarment',{...request,binding:b}),/Invalid garment attachment/);assert.throws(()=>run('bindGarment',{body,positions:[[.2,.3,1]],bodyId:'figure',maximumDistance:.1}),/arrange it closer/);assert.throws(()=>run('bindGarment',{body:{...body,triangles:[[0,0,0]]},positions:[[0,0,0]],bodyId:'figure',maximumDistance:.5}),/degenerate/);
});

test('real Genesis posed capture matches evaluated collision and source grading excludes pose/root motion',async()=>{
 const {scene:c,bytes,file}=await genesis();evaluateCharacter(c);c.updateMatrixWorld(true);const before=JSON.stringify(c.toJSON()),first=drapeRequest(liveTshirtPattern(),c,{placement:'surface'});assert.equal(JSON.stringify(c.toJSON()),before);
 c.getObjectByName('l_upperarm').rotateZ(.5);c.position.set(1,2,-1);c.rotation.set(.3,.4,-.1);c.scale.setScalar(1.1);c.updateMatrixWorld(true);const pose=drapeRequest(liveTshirtPattern(),c,{placement:'surface'}),collision=evaluatedCharacterTriangles(c);
 assert.deepEqual(pose.body,first.body);assert.deepEqual(pose.doc,first.doc);assert.equal(pose.placement.capture.posed.positions.length,collision.positions.length/3);assert.ok(pose.placement.capture.posed.positions.flat().every((v,i)=>Math.abs(v-collision.positions[i])<1e-10));
 let changed=0;for(let i=0;i<pose.placement.capture.posed.positions.length;i++){const expected=new THREE.Vector3(...first.placement.capture.posed.positions[i]).applyMatrix4(c.matrixWorld);if(expected.distanceTo(new THREE.Vector3(...pose.placement.capture.posed.positions[i]))>.01)changed++;}assert.ok(changed>500,'The moved upper arm must affect detailed skin geometry.');assert.deepEqual(fs.readFileSync(file),bytes);
});

test('real process pose placement caches source bindings, survives serialization and rejects stale/cancelled/malformed work',async()=>{
 const {scene:c}=await genesis(),engine=new GeometryEngine(),calls=[],api={geometry:async(method,request)=>{calls.push(method);return engine.run(method,request);}};
 try{const input=drapeRequest(liveTshirtPattern(),c,{placement:'surface'}),first=await evaluateSourcePlacement(api,input.placement,null),again=await evaluateSourcePlacement(api,input.placement,JSON.parse(JSON.stringify(first.cache)));assert.deepEqual(first.positions,again.positions);assert.equal(again.diagnostics.reusedBinding,true);assert.deepEqual(calls,['bindGarment','placeGarment','placeGarment']);
  c.getObjectByName('l_upperarm').rotateZ(.6);c.updateMatrixWorld(true);const posed=drapeRequest(liveTshirtPattern(),c,{placement:'surface'}),next=await evaluateSourcePlacement(api,posed.placement,first.cache);assert.equal(next.diagnostics.reusedBinding,true);assert.ok(next.positions.some((p,i)=>new THREE.Vector3(...p).distanceTo(new THREE.Vector3(...first.positions[i]))>.03));
  const controller=new AbortController();controller.abort();await assert.rejects(evaluateSourcePlacement(api,posed.placement,first.cache,{signal:controller.signal}),/cancelled/);assert.equal(engine.active,null);
  const bad=structuredClone(first.cache);bad.binding.attachments[0].triangle=99999999;await assert.rejects(evaluateSourcePlacement(api,posed.placement,bad),/Invalid garment attachment/);assert.equal(engine.active,null);const recovered=await evaluateSourcePlacement(api,posed.placement,first.cache);assert.deepEqual(recovered.positions,next.positions);
  const changed=structuredClone(posed.placement);changed.positions[0][0]+=.01;const rebound=await evaluateSourcePlacement(api,changed,first.cache);assert.equal(rebound.diagnostics.reusedBinding,false);
 }finally{await engine.close();}
});

test('record bind/evaluation timings at increasing cloth point counts against detailed source triangles',()=>{
 const body=grid(),timings=[];for(const size of [50,100,150]){const positions=[];for(let y=0;y<size;y++)for(let x=0;x<size;x++)positions.push([x/(size-1),y/(size-1),.012]);const start=performance.now(),bound=run('bindGarment',{body,positions,bodyId:'figure',maximumDistance:.5}),afterBind=performance.now(),r=run('placeGarment',{binding:bound.binding,body,bodyId:'figure'});assert.equal(r.positions.length,positions.length);timings.push({clothVertices:positions.length,bodyTriangles:body.triangles.length,bindMilliseconds:afterBind-start,placeMilliseconds:performance.now()-afterBind});}
 fs.writeFileSync('test-output/garment-placement-performance.json',JSON.stringify({passed:true,timings,scope:'Native JSON encode/decode plus computation; excludes helper startup, body extraction and draping. Maximum 60,000 cloth points, 200,000 body vertices, 250,000 body triangles. Not an interactive drape claim.'},null,2));console.log('Placement timings',JSON.stringify(timings));
});

test('cancelling a detailed attachment build stops the real helper and allows recovery',async()=>{
 const engine=new GeometryEngine(),body=grid(300),positions=[];for(let i=0;i<60000;i++)positions.push([(i%250)/249,Math.floor(i/250)/239,.012]);
 try{const pending=engine.run('bindGarment',{body,positions,bodyId:'figure',maximumDistance:.5}),failure=pending.catch(error=>error),job=engine.active,deadline=Date.now()+5000;while(job.phase!=='native'&&!job.exited&&Date.now()<deadline)await new Promise(r=>setTimeout(r,2));assert.equal(job.phase,'native');await engine.close();assert.match((await failure).message,/cancelled/);assert.equal(job.exited,true);assert.throws(()=>process.kill(job.pid,0));assert.equal(engine.active,null);assert.equal((await engine.run('analyzeMesh',{positions:[[0,0,0],[1,0,0],[0,1,0]],faces:[[0,1,2]]})).components,1);
 }finally{await engine.close();}
});

test('operator cancellation between hash/bind/place stages cannot start subsequent geometry work',async()=>{
 const {scene:c}=await genesis(),controller=new AbortController(),calls=[],prior={userData:{liveGarment:{settings:{placement:'surface'}}}},evaluation={editor:{operators:{running:{controller}}},run:async(object,input,compute)=>compute({requestId:1},new AbortController().signal)};
 const api={geometry:async(method,request)=>{calls.push(method);assert.equal(method,'bindGarment');const result=run(method,request);controller.abort();return result;}};
 await assert.rejects(generateGarment(api,liveTshirtPattern(),c,prior,evaluation,{prepare:async(action,input)=>surfacePreparation(action,input)}),/cancelled/);assert.deepEqual(calls,['bindGarment']);
 const other=new AbortController();evaluation.editor.operators.running.controller=other;evaluation.run=async(object,input,compute)=>{other.abort();return compute({requestId:2},new AbortController().signal);};await assert.rejects(generateGarment(api,liveTshirtPattern(),c,prior,evaluation,{prepare:async(action,input)=>surfacePreparation(action,input)}),/cancelled/);assert.deepEqual(calls,['bindGarment']);
});
