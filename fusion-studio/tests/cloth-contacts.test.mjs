import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import {clothContactIssues} from '../src/cloth-contacts.js';
const require=createRequire(import.meta.url),native=require('../native/fusion_geometry.node');
const {GeometryEngine}=require('../electron/geometry.cjs');

function layers(gap,{crossed=false,reverse=false,size=36}={}){
 const n=size,positions=[],faces=[];
 for(let layer=0;layer<2;layer++){
  const offset=positions.length;
  for(let y=0;y<=n;y++)for(let x=0;x<=n;x++){
   const u=x/n*.5-.25,v=y/n*.5-.25;
   positions.push([u,1+v,layer?(crossed?u*.4+.001:gap):0]);
  }
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
   const a=offset+y*(n+1)+x;
   for(const triangle of [[a,a+1,a+n+2],[a,a+n+2,a+n+1]])faces.push(reverse&&layer?triangle.reverse():triangle);
  }
 }
 return {positions,faces,sewing:[],thickness:.003,seamTopology:true};
}
const measurements=[];
const audit=q=>{const start=performance.now(),a=JSON.parse(native.auditClothContacts(JSON.stringify(q)));measurements.push({vertices:q.positions.length,triangles:q.faces.length,wallMilliseconds:performance.now()-start,audit:a});return a;};
process.on('exit',code=>{fs.mkdirSync('test-output',{recursive:true});fs.writeFileSync('test-output/cloth-contact-native-results.json',JSON.stringify({passed:code===0,scope:'Own static fixtures; isolated audit costs include JSON. These are not drape or interactivity measurements.',measurements},null,2));});

test('5,184-triangle independent layers distinguish crossing, coplanar overlap, inadequate gap and separated surfaces',()=>{
 for(const reverse of [false,true])for(const [gap,options,expected] of [
  [0,{},'overlap'],[.003,{},'clearance'],[.012,{},'clear'],[0,{crossed:true},'crossing']
 ]){
  const q=layers(gap,{...options,reverse}),before=JSON.stringify(q),a=audit(q);
  assert.equal(q.faces.length,5184);assert.equal(JSON.stringify(q),before);assert.equal(a.complete,true);assert.equal(a.degenerateFaces,0);
  assert.ok(a.testedPairs>0);assert.ok(a.adjacentPairs>0);assert.ok(a.samples.length<=32);
  if(expected==='clear'){assert.equal(a.crossings,0);assert.equal(a.coplanarOverlaps,0);assert.equal(a.clearanceViolations,0);assert.deepEqual(clothContactIssues(a),[]);}
  else{
   assert.ok(a.clearanceViolations>0);assert.ok(clothContactIssues(a).length>0);
   if(expected==='overlap'){assert.ok(a.coplanarOverlaps>1000);assert.equal(a.crossings,0);}
   if(expected==='crossing')assert.ok(a.crossings>30);
   if(expected==='clearance'){assert.equal(a.crossings,0);assert.equal(a.coplanarOverlaps,0);assert.ok(Math.abs(a.minimumTestedGapM-gap)<1e-10);}
   for(const sample of a.samples)assert.ok(sample.faceA<q.faces.length&&sample.faceB<q.faces.length&&sample.faceA!==sample.faceB);
  }
 }
});

test('preview drapes audit 5,184 fixed crossing triangles even when strain and pin drift are zero',()=>{
 const mesh=layers(0,{crossed:true}),request={...mesh,restPositions:structuredClone(mesh.positions),pins:mesh.positions.map((_,i)=>i),colliders:[],steps:1,iterations:2,stretch:1e-7,bend:1e-4,selfCollision:false,triangleSelfCollision:true},before=JSON.stringify(request);
 const result=JSON.parse(native.drapeGarment(before));assert.equal(result.metrics.maxStrain,0);assert.equal(result.metrics.pinDrift,0);assert.equal(result.metrics.physicalFabric,undefined);assert.equal(result.metrics.clothContact.complete,true);assert.ok(result.metrics.clothContact.crossings>30);assert.match(clothContactIssues(result.metrics.clothContact).join(' '),/cross/);assert.equal(JSON.stringify(request),before);
 // Native pinDrift is exact against Rust's parsed initial coordinates. Allow
 // only JSON parser roundoff when comparing the JS and Rust numeric domains.
 for(let i=0;i<mesh.positions.length;i++)assert.ok(Math.hypot(...result.positions[i].map((v,k)=>v-mesh.positions[i][k]))<1e-14);
});

test('cloth inspection rejects malformed meshes and explicitly reports unsupported or incomplete diagnostics',()=>{
 const q=layers(.012);
 for(const bad of [{...q,thickness:0},{...q,sewing:[[0,999999]]},{...q,faces:[[0,1,999999]]},{...q,positions:[]}])assert.throws(()=>audit(bad));
 assert.deepEqual(clothContactIssues(undefined),[]);
 assert.match(clothContactIssues({complete:true})[0],/invalid/);
 const good=audit(q);assert.deepEqual(clothContactIssues(good),[]);
 for(const patch of [{samples:[null]},{crossings:'<img onerror=alert(1)>'},{gapToleranceM:-1},{milliseconds:Infinity}])assert.match(clothContactIssues({...good,...patch})[0],/invalid/);
 assert.match(clothContactIssues({...good,complete:false})[0],/incomplete/);
 assert.match(clothContactIssues({...good,degenerateFaces:2}).join(' '),/collapsed/);
 for(const key of ['crossings','coplanarOverlaps','clearanceViolations'])assert.ok(clothContactIssues({...good,[key]:1}).length);
});

test('6,400-triangle connected folded cloth excludes its local bend and checks the returning surface',()=>{
 for(const gap of [.003,.012]){
  const nx=100,ny=32,positions=[],faces=[];
  for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++){
   const u=x/nx*.8-.4,t=u/.016*Math.PI;
   positions.push([u<=0?u:u<.016?gap/2*Math.sin(t):-(u-.016),1+y/ny*.4,u<=0?0:u<.016?gap/2*(1-Math.cos(t)):gap]);
  }
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
   const a=y*(nx+1)+x;faces.push([a,a+1,a+nx+2],[a,a+nx+2,a+nx+1]);
  }
  const result=audit({positions,faces,sewing:[],thickness:.003,seamTopology:true});
  assert.equal(faces.length,6400);assert.equal(result.complete,true);assert.equal(result.crossings,0);assert.equal(result.coplanarOverlaps,0);
  assert.ok(Math.abs(result.minimumTestedGapM-gap)<1e-10);
  if(gap<.006)assert.ok(result.clearanceViolations>1000);else assert.deepEqual(clothContactIssues(result),[]);
 }
});

test('local surface paths prevent false self clearance on finely tessellated 5,000-triangle flat cloth',()=>{
 for(const width of [.4,.1]){
  const n=50,positions=[],faces=[];
  for(let y=0;y<=n;y++)for(let x=0;x<=n;x++)positions.push([x/n*width,1+y/n*width,0]);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){const a=y*(n+1)+x;faces.push([a,a+1,a+n+2],[a,a+n+2,a+n+1]);}
  const a=audit({positions,faces,sewing:[],thickness:.003,seamTopology:true});
  assert.equal(a.complete,true);assert.equal(a.localSearchComplete,true);assert.ok(Math.abs(a.localExclusionRadiusM-.018)<1e-12);assert.deepEqual(clothContactIssues(a),[]);
 }
});

test('20,000-triangle cloth at 0.6 mm spacing reports its local-search work limit without fabricated contact counts',()=>{
 const n=100,positions=[],faces=[];
 for(let y=0;y<=n;y++)for(let x=0;x<=n;x++)positions.push([x/n*.06,1+y/n*.06,0]);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const a=y*(n+1)+x;faces.push([a,a+1,a+n+2],[a,a+n+2,a+n+1]);}
 const a=audit({positions,faces,sewing:[],thickness:.003,seamTopology:true});
 assert.equal(a.complete,false);assert.equal(a.localSearchComplete,false);assert.equal(a.localSearchSteps,a.localSearchBudget);
 assert.equal(a.testedPairs,0);assert.equal(a.clearanceViolations,0);assert.equal(a.minimumTestedGapM,null);assert.deepEqual(a.samples,[]);
 assert.match(clothContactIssues(a).join(' '),/incomplete.*work limit/);
});

test('36,864-triangle stacked cloth stops at the public pair budget and reports partial coverage',()=>{
 const n=24,positions=[],faces=[];
 for(let layer=0;layer<32;layer++){
  const offset=positions.length;
  for(let y=0;y<=n;y++)for(let x=0;x<=n;x++)positions.push([x/n*.5,1+y/n*.5,layer*.0001]);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){const a=offset+y*(n+1)+x;faces.push([a,a+1,a+n+2],[a,a+n+2,a+n+1]);}
 }
 const a=audit({positions,faces,sewing:[],thickness:.003,seamTopology:true});
 assert.equal(a.complete,false);assert.equal(a.localSearchComplete,true);assert.equal(a.testedPairs+a.adjacentPairs,a.pairBudget);
 assert.ok(a.clearanceViolations>1000);assert.equal(a.samples.length,32);assert.match(clothContactIssues(a).join(' '),/incomplete.*face-pair work limit/);
});

test('detailed cloth inspection uses a disposable helper, cancels through actual exit and recovers after invalid input',async()=>{
 const engine=new GeometryEngine(),q=layers(.003);
 try{
  const pending=engine.run('auditClothContacts',q),failure=pending.catch(e=>e),job=engine.active;
  await engine.close();assert.match((await failure).message,/cancelled/);assert.equal(job.exited,true);assert.equal(engine.active,null);
  const running=engine.run('auditClothContacts',layers(.003,{size:80})),stopped=running.catch(e=>e),nativeJob=engine.active,start=performance.now();
  while(engine.active?.phase!=='native'){if(performance.now()-start>10000||!engine.active)throw Error('Cloth inspector did not enter native work.');await new Promise(r=>setTimeout(r,5));}
  await engine.close();assert.match((await stopped).message,/cancelled/);assert.equal(nativeJob.exited,true);assert.equal(engine.active,null);
  await assert.rejects(engine.run('auditClothContacts',{...q,thickness:0}),/Invalid cloth/);assert.equal(engine.active,null);
  const a=await engine.run('auditClothContacts',q);assert.ok(a.clearanceViolations>0);assert.equal(engine.active,null);
  await assert.rejects(engine.run('auditClothContacts',{...q,executionBudget:'offline'}),/execution budget/);
 }finally{await engine.close();}
});
