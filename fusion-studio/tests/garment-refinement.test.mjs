import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as THREE from 'three';
import {buildFinishedSurface,garmentFinishSettings} from '../src/garment-finishing.js';
import {validateSourceInterpolation,interpolateSourceColors} from '../src/garment-refinement.js';
import {captureGarmentSource,applyGarmentFinishing,validateGarmentFinishing,stripGarmentFinishGeometry} from '../src/garment-finish-scene.js';
import {surfacePreparationReply} from '../src/surface-preparation.js';
import {buildPattern,migratePattern,starterPattern} from '../src/patterns.js';
const native=createRequire(import.meta.url)('../native/fusion_geometry.node');
const settings={version:2,enabled:true,refinement:1,strength:.5,boundary:'preserve',thickness:.0006};
function sheet(n=50){const s={positions:[],uvs:[],faces:[],sewing:[],groups:[]};for(let y=0;y<=n;y++)for(let x=0;x<=n;x++){s.positions.push(x/n,y/n,0);s.uvs.push(x/n,y/n);}for(let y=0;y<n;y++)for(let x=0;x<n;x++){const a=y*(n+1)+x;s.faces.push([a,a+1,a+n+2],[a,a+n+2,a+n+1]);}return s;}
function cylinder(){const s={positions:[],uvs:[],faces:[],sewing:[],groups:[]},nx=32,ny=48,stride=nx+1,count=stride*(ny+1);for(let side=0;side<2;side++){for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++){const a=Math.PI*(side+x/nx);s.positions.push(.25*Math.cos(a),.7*y/ny,.25*Math.sin(a));s.uvs.push(side+x/nx,y/ny);}const start=s.faces.length*3;for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const a=side*count+y*stride+x;for(const t of [[a,a+stride+1,a+1],[a,a+stride,a+stride+1]])s.faces.push(side?[t[0],t[2],t[1]]:t);}s.groups.push({start,count:s.faces.length*3-start,materialIndex:side});}for(let y=0;y<=ny;y++)s.sewing.push([y*stride,count+y*stride+nx],[y*stride+nx,count+y*stride]);return s;}
function closed(mesh){const positions=[],ids=[],keys=new Map();for(let i=0;i<mesh.positions.length;i+=3){const p=mesh.positions.slice(i,i+3),key=p.map(v=>Math.round(v*1e10)).join(':');if(!keys.has(key)){keys.set(key,positions.length);positions.push(p);}ids.push(keys.get(key));}const faces=mesh.faces.map(t=>t.map(i=>ids[i])),topology=JSON.parse(native.analyzeMesh(JSON.stringify({positions,faces})));assert.equal(topology.boundaryEdges,0);let volume=0;for(const t of faces){const [a,b,c]=t.map(i=>positions[i]);volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;}assert.ok(volume>0);return {volume,topology};}
function row(map,vertex){const r=map.vertices[vertex],out=[];for(let i=map.offsets[r];i<map.offsets[r+1];i++)out.push([map.indices[i],map.weights[i]]);return out;}

test('detailed planar refinement retains area, constant thickness, linear UVs and exact weighted source correspondence',()=>{
 for(const [n,level]of [[50,1],[32,2]]){
  const source=sheet(n),before=JSON.stringify(source),result=buildFinishedSurface(source,{...settings,refinement:level}),map=result.sourceInterpolation;
  assert.equal(JSON.stringify(source),before);validateSourceInterpolation(map,source.positions.length/3,result.positions.length/3);assert.ok(result.faces.length>40000);assert.equal(result.diagnostics.refinement.triangles,source.faces.length*4**level);assert.ok(Math.abs(closed(result).volume-.0006)<1e-11);assert.equal(closed(result).topology.components,1);
  const colors=interpolateSourceColors(source.positions.map((v,i)=>i%3===2?.5:v),map);
  for(let i=0;i<result.positions.length/3;i++){const midpoint=row(map,i).reduce((p,[v,w])=>p.map((x,k)=>x+source.positions[v*3+k]*w),[0,0,0]),distance=Math.hypot(...midpoint.map((v,k)=>v-result.positions[i*3+k]));assert.ok(Math.abs(distance-.0003)<1e-12);assert.ok(Math.abs(colors[i*3]-midpoint[0])<1e-12);assert.ok(Math.abs(colors[i*3+1]-midpoint[1])<1e-12);assert.ok(Math.abs(colors[i*3+2]-.5)<1e-12);}
  for(let i=0;i<source.positions.length/3;i++)assert.deepEqual(result.uvs.slice(i*2,i*2+2),source.uvs.slice(i*2,i*2+2));
 }
});

test('6,144-triangle sewn panels refine as one surface while preserving corner UV seams and face materials',()=>{
 const source=cylinder(),before=JSON.stringify(source),result=buildFinishedSurface(source,settings),topology=closed(result).topology;
 assert.equal(JSON.stringify(source),before);assert.equal(topology.components,1);assert.equal(result.diagnostics.skippedPairs,0);assert.equal(result.diagnostics.refinement.triangles,24576);assert.ok(result.faces.length>49000);
 for(let f=0;f<result.faces.length;f++){const g=result.groups.find(g=>f*3>=g.start&&f*3<g.start+g.count),parent=result.faceSource[f];if(parent>=0)assert.equal(g.materialIndex,parent<source.faces.length/2?0:1);}
 const buckets=new Map();let splitUV=false;for(let i=0;i<result.diagnostics.refinement.vertices;i++){const key=result.positions.slice(i*3,i*3+3).map(v=>Math.round(v*1e10)).join(':');for(const j of buckets.get(key)||[])if(Math.abs(result.uvs[i*2]-result.uvs[j*2])>1){splitUV=true;assert.deepEqual(result.normals.slice(i*3,i*3+3),result.normals.slice(j*3,j*3+3));}if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(i);}assert.ok(splitUV);
 const separated=buildFinishedSurface(source,{...settings,joinTolerance:0});assert.equal(closed(separated).topology.components,2);
});

test('irregular Loop masks match closed-form valence-five and boundary calculations; zero strength is linear',()=>{
 const source={positions:[.05,.02,.03],uvs:[0,0],faces:[],sewing:[],groups:[]};for(let i=0;i<5;i++){const a=i*Math.PI*2/5;source.positions.push(Math.cos(a),Math.sin(a),.1*Math.sin(a*2));source.uvs.push(Math.cos(a),Math.sin(a));source.faces.push([0,i+1,(i+1)%5+1]);}
 const result=buildFinishedSurface(source,{...settings,strength:1,boundary:'smooth'}),beta=(13-Math.sqrt(5))/128,center=row(result.sourceInterpolation,0);
 assert.ok(Math.abs(center[0][1]-(1-5*beta))<1e-14);for(const [,w]of center.slice(1))assert.ok(Math.abs(w-beta)<1e-14);
 assert.deepEqual(row(result.sourceInterpolation,1),[[1,.75],[2,.125],[5,.125]]);
 const linear=buildFinishedSurface(source,{...settings,strength:0,boundary:'smooth'});assert.deepEqual(row(linear.sourceInterpolation,0),[[0,1]]);assert.deepEqual(row(linear.sourceInterpolation,1),[[1,1]]);assert.ok(linear.diagnostics.refinement.maximumShiftM<1e-14);
});

test('refinement rejects unsupported settings, excessive work, vertex fans and malformed sparse weights without source mutation',()=>{
 for(const bad of [{version:3},{version:1,refinement:1},{version:2,refinement:3},{version:2,refinement:1,strength:1.1},{version:2,boundary:'guess'}])assert.throws(()=>garmentFinishSettings(bad));
 const source=sheet(),before=JSON.stringify(source);assert.throws(()=>buildFinishedSurface(source,{...settings,refinement:2}),/limit|exceeds/);assert.equal(JSON.stringify(source),before);
 const fan={positions:[0,0,0],uvs:[0,0],faces:[],sewing:[],groups:[]};for(let i=0;i<300;i++){const a=i*Math.PI*2/300;fan.positions.push(Math.cos(a),Math.sin(a),0);fan.uvs.push(Math.cos(a),Math.sin(a));fan.faces.push([0,i+1,(i+1)%300+1]);}assert.throws(()=>buildFinishedSurface(fan,settings),/fan|support/);
 const result=buildFinishedSurface(sheet(4),settings),map=result.sourceInterpolation;for(const mutate of [m=>m.weights[0]=-1,m=>m.weights[0]=NaN,m=>m.weights[0]+=.1,m=>m.offsets[1]=m.offsets[0],m=>m.indices[0]=999999,m=>m.vertices[0]=-1]){const bad=structuredClone(map);mutate(bad);assert.throws(()=>validateSourceInterpolation(bad,25,result.positions.length/3),/source weights/);}
});

test('dense irregular closed fans stop at the global source-weight budget while retaining their input',()=>{
 const s={positions:[],uvs:[],faces:[],sewing:[],groups:[]},n=253;
 for(let patch=0;patch<7;patch++){const start=s.positions.length/3,x=patch-3;s.positions.push(x,0,.25,x,0,-.25);s.uvs.push(0,0,0,0);for(let i=0;i<n;i++){const a=i*Math.PI*2/n;s.positions.push(x+.25*Math.cos(a),.25*Math.sin(a),0);s.uvs.push(Math.cos(a),Math.sin(a));}for(let i=0;i<n;i++){const a=start+2+i,b=start+2+(i+1)%n;s.faces.push([start,a,b],[start+1,b,a]);}}
 assert.equal(s.faces.length,3542);const before=JSON.stringify(s);assert.throws(()=>buildFinishedSurface(s,{...settings,refinement:2}),/one million source weights/);assert.equal(JSON.stringify(s),before);
});

test('version-two source caches restore exact simulation buffers, interpolate colors, survive projects and disable without baking',async()=>{
 const data=sheet(),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(data.uvs,2));g.setIndex(data.faces.flat());g.computeVertexNormals();g.userData.strainColors=data.positions.map((v,i)=>i%3===2?.5:v);
 const owner=new THREE.Group();owner.userData.liveGarment={heatmap:true};owner.add(new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true})));const source=captureGarmentSource(owner),before=JSON.stringify(source),result=buildFinishedSurface(source,settings);
 applyGarmentFinishing(owner,source,result,settings);validateGarmentFinishing(owner);assert.equal(owner.children[0].geometry.userData.garmentFinishSource.version,2);assert.equal(JSON.stringify(captureGarmentSource(owner)),before);const expected=interpolateSourceColors(source.strainColors,result.sourceInterpolation),actual=owner.children[0].geometry.attributes.color.array;assert.equal(actual.length,expected.length);for(let i=0;i<actual.length;i++)assert.ok(Math.abs(actual[i]-expected[i])<1e-7);
 const restored=await new THREE.ObjectLoader().parseAsync(JSON.parse(JSON.stringify(owner.toJSON())));validateGarmentFinishing(restored);assert.equal(JSON.stringify(captureGarmentSource(restored)),before);const mesh=restored.children[0],cache=JSON.stringify(mesh.geometry.userData.garmentFinishSource),copy=stripGarmentFinishGeometry(mesh.geometry,{clone:true});assert.equal(copy.userData.garmentFinishSource,undefined);assert.equal(JSON.stringify(mesh.geometry.userData.garmentFinishSource),cache);
 const corrupt=structuredClone(result);corrupt.sourceInterpolation.weights[0]=-1;const prior=mesh.geometry;assert.throws(()=>applyGarmentFinishing(restored,source,corrupt,settings),/source weights/);assert.equal(mesh.geometry,prior);
 applyGarmentFinishing(restored,captureGarmentSource(restored),null,{...settings,enabled:false});validateGarmentFinishing(restored);assert.equal(JSON.stringify(captureGarmentSource(restored)),before);assert.deepEqual(Array.from(mesh.geometry.attributes.normal.array),source.normals);
});

test('the preparation worker returns bounded refinement weights and checked original face lineage',()=>{
 const doc=migratePattern(starterPattern());doc.particleDistance=.035;const data=buildPattern(doc),source={positions:data.positions,uvs:data.uvs,faces:data.faces,sewing:data.sewing,groups:[]},context={projectId:'p',objectId:'shirt',revision:3,requestId:9,inputHash:'b'.repeat(64)},reply=surfacePreparationReply({version:1,action:'garmentFinish',context,input:{doc,source,settings}});
 assert.equal(reply.error,undefined);assert.deepEqual(reply.context,context);assert.equal(reply.result.diagnostics.refinement.levels,1);assert.ok(reply.result.faceSource.every(i=>i===-1||i<data.faces.length));validateSourceInterpolation(reply.result.sourceInterpolation,source.positions.length/3,reply.result.positions.length/3);
});
