import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {buildFinishedSurface,garmentFinishSettings} from '../src/garment-finishing.js';
import {starterPattern,migratePattern,buildPattern} from '../src/patterns.js';
import * as THREE from 'three';
import {captureGarmentSource,applyGarmentFinishing,validateGarmentFinishing,stripGarmentFinishGeometry} from '../src/garment-finish-scene.js';
import {surfacePreparationReply} from '../src/surface-preparation.js';
import {generateGarment,liveTshirtPattern} from '../src/hybrid.js';
import {createCharacter} from '../src/character.js';
import {SceneEvaluator} from '../src/evaluation.js';
const native=createRequire(import.meta.url)('../native/fusion_geometry.node');
function sheet(n=50){const positions=[],uvs=[],faces=[];for(let y=0;y<=n;y++)for(let x=0;x<=n;x++){positions.push(x/n,y/n,0);uvs.push(x/n,y/n);}for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*(n+1)+x;faces.push([i,i+1,i+n+2],[i,i+n+2,i+n+1]);}return {positions,uvs,faces,sewing:[],groups:[]};}
function welded(mesh){const positions=[],map=new Map(),ids=[];for(let i=0;i<mesh.positions.length;i+=3){const p=mesh.positions.slice(i,i+3),k=p.map(v=>Math.round(v*1e10)).join(':');if(!map.has(k)){map.set(k,positions.length);positions.push(p);}ids.push(map.get(k));}return {positions,faces:mesh.faces.map(t=>t.map(i=>ids[i]))};}
function closedVolume(mesh){const data=welded(mesh),topology=JSON.parse(native.analyzeMesh(JSON.stringify(data)));assert.equal(topology.boundaryEdges,0);const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];let volume=0;for(const t of data.faces){const [a,b,c]=t.map(i=>data.positions[i]),v=cross(b,c);volume+=a.reduce((s,x,k)=>s+x*v[k],0)/6;}assert.ok(volume>0);return {volume,topology};}
test('detailed sheet finishing forms a closed constant-thickness volume and explicitly remaps UVs and materials',()=>{
 const source=sheet();source.groups=[{start:0,count:source.faces.length*3/2,materialIndex:0},{start:source.faces.length*3/2,count:source.faces.length*3/2,materialIndex:1}];const before=JSON.stringify(source),settings={enabled:true,thickness:.0006,offset:0},result=buildFinishedSurface(source,settings),n=source.positions.length/3;
 assert.equal(JSON.stringify(source),before);assert.deepEqual(buildFinishedSurface(structuredClone(source),settings),result);assert.equal(result.diagnostics.sourceTriangles,5000);assert.equal(result.diagnostics.collisionEvaluated,false);assert.equal(result.diagnostics.boundaryEdges,200);assert.ok(Math.abs(closedVolume(result).volume-.0006)<1e-12);
 for(let i=0;i<n;i++){assert.equal(result.sourceVertex[i],i);assert.equal(result.sourceVertex[i+n],i);assert.deepEqual(result.uvs.slice(i*2,i*2+2),source.uvs.slice(i*2,i*2+2));assert.deepEqual(result.uvs.slice((i+n)*2,(i+n)*2+2),source.uvs.slice(i*2,i*2+2));assert.ok(Math.abs(result.positions[i*3+2]-result.positions[(i+n)*3+2]-.0006)<1e-14);}
 for(let i=0;i<result.faces.length;i++){const g=result.groups.find(g=>i*3>=g.start&&i*3<g.start+g.count);assert.ok(g);if(result.faceSource[i]>=0)assert.equal(g.materialIndex,result.faceSource[i]<source.faces.length/2?0:1);}
 const outward=buildFinishedSurface(source,{...settings,offset:1});assert.equal(outward.positions[2],.0006);assert.equal(outward.positions[n*3+2],0);
});
test('sewn cylindrical panels normalize mixed winding while retaining distinct corner UVs and bounded joining',()=>{
 const source={positions:[],uvs:[],faces:[],sewing:[],groups:[]},nx=32,ny=48,stride=nx+1,count=stride*(ny+1);
 for(let panel=0;panel<2;panel++){for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++){const a=Math.PI*(panel+x/nx);source.positions.push(.25*Math.cos(a),.7*y/ny,.25*Math.sin(a));source.uvs.push(panel+x/nx,y/ny);}for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const i=panel*count+y*stride+x;for(const t of [[i,i+stride+1,i+1],[i,i+stride,i+stride+1]])source.faces.push(panel?[t[0],t[2],t[1]]:t);}}
 for(let y=0;y<=ny;y++)source.sewing.push([y*stride,count+y*stride+nx],[y*stride+nx,count+y*stride]);
 const before=JSON.stringify(source),result=buildFinishedSurface(source,{enabled:true});assert.equal(JSON.stringify(source),before);assert.equal(result.diagnostics.components,1);assert.equal(result.diagnostics.skippedPairs,0);assert.ok(result.diagnostics.reorientedFaces>1000);assert.equal(closedVolume(result).topology.components,1);assert.ok(Math.abs(closedVolume(result).volume/(2*Math.PI*.25*.7*.0006)-1)<.01);
 const separate=buildFinishedSurface(source,{enabled:true,joinTolerance:0});assert.equal(separate.diagnostics.joinedPairs,0);assert.equal(separate.diagnostics.components,2);assert.equal(closedVolume(separate).topology.components,2);
 const tight={...source,positions:source.positions.map((v,i)=>i%3===1?v:v*.0004)};assert.throws(()=>buildFinishedSurface(tight,{enabled:true,thickness:.0006}),/inverts/);
});
test('malformed, pinched, collapsed and oversized surfaces fail without mutating their retained input',()=>{
 const source=sheet(2),before=JSON.stringify(source);
 for(const settings of [{thickness:0},{thickness:.006},{offset:2},{joinTolerance:.002},{enabled:1},{version:3}])assert.throws(()=>garmentFinishSettings(settings));
 for(const patch of [{positions:[NaN,0,0]},{uvs:[Infinity]},{faces:[[0,1,1]]},{groups:[{start:1,count:3,materialIndex:0}]},{sewing:[[0,9999]]}])assert.throws(()=>buildFinishedSurface({...source,...patch},{enabled:true}));
 const far=buildFinishedSurface({...source,sewing:[[0,1]]},{enabled:true,joinTolerance:.001});assert.equal(far.diagnostics.skippedPairs,1);assert.equal(far.diagnostics.joinedPairs,0);
 assert.throws(()=>buildFinishedSurface({...source,positions:source.positions.map(v=>v*.0001),sewing:[[0,1]]},{enabled:true,joinTolerance:.001}),/collapses/);
 assert.equal(JSON.stringify(source),before);
 const pinch={positions:[0,0,0,1,0,0,0,1,0,-1,0,0,0,-1,0],uvs:[0,0,1,0,0,1,-1,0,0,-1],faces:[[0,1,2],[0,3,4]],sewing:[],groups:[]};assert.throws(()=>buildFinishedSurface(pinch,{enabled:true}),/pinched/);
 assert.throws(()=>buildFinishedSurface({...source,faces:Array(50001).fill([0,1,3])},{enabled:true}),/50,000/);
});
test('curved holed panels retain their openings and form separate closed render shells',()=>{
 const doc=migratePattern(starterPattern());doc.particleDistance=.025;doc.panels[0].segments[2]={...doc.panels[0].segments[2],type:'cubic',controls:[[.15,.72],[-.15,.72]]};doc.panels[0].holes=[{id:'opening',points:[[-.06,.2],[.06,.2],[.06,.34],[-.06,.34]],segments:[0,1,2,3].map(i=>({id:'opening_'+i,type:'line'}))}];const data=buildPattern(doc),source={positions:data.positions,uvs:data.uvs,faces:data.faces,sewing:data.sewing,groups:[]},result=buildFinishedSurface(source,{enabled:true});assert.ok(data.faces.length>4000);assert.equal(closedVolume(result).topology.components,2);
 let area=0;for(const t of data.faces){const [a,b,c]=t.map(i=>data.uvs.slice(i*2,i*2+2));area+=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;}assert.ok(Math.abs(closedVolume(result).volume-area*.0006)<1e-11);assert.ok(result.diagnostics.skippedPairs>0);
});
test('scene finishing retains exact source buffers, maps strain colors, survives projects and restores without baking',async()=>{
 const data=sheet(),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(data.uvs,2));g.setIndex(data.faces.flat());g.computeVertexNormals();g.userData.strainColors=data.positions.map((_,i)=>(i%3)/2);
 const owner=new THREE.Group(),mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true}));owner.add(mesh);owner.userData.liveGarment={heatmap:true};const original=captureGarmentSource(owner),before=JSON.stringify(original),result=buildFinishedSurface(original,{enabled:true});applyGarmentFinishing(owner,original,result,{enabled:true});validateGarmentFinishing(owner);
 assert.equal(JSON.stringify(captureGarmentSource(owner)),before);assert.equal(mesh.geometry.attributes.color.count,mesh.geometry.attributes.position.count);for(let i=0;i<result.sourceVertex.length;i++)for(let k=0;k<3;k++)assert.equal(mesh.geometry.attributes.color.getComponent(i,k),original.strainColors[result.sourceVertex[i]*3+k]);
 const thicker=buildFinishedSurface(captureGarmentSource(owner),{enabled:true,thickness:.001});applyGarmentFinishing(owner,captureGarmentSource(owner),thicker,{enabled:true,thickness:.001});assert.deepEqual(Array.from(mesh.geometry.attributes.position.array),Array.from(new Float32Array(buildFinishedSurface(original,{enabled:true,thickness:.001}).positions)));applyGarmentFinishing(owner,captureGarmentSource(owner),result,{enabled:true});assert.equal(JSON.stringify(captureGarmentSource(owner)),before);
 const restored=await new THREE.ObjectLoader().parseAsync(JSON.parse(JSON.stringify(owner.toJSON())));validateGarmentFinishing(restored);assert.equal(JSON.stringify(captureGarmentSource(restored)),before);const finished=restored.children[0].geometry,cache=JSON.stringify(finished.userData.garmentFinishSource),stripped=stripGarmentFinishGeometry(finished,{clone:true});assert.equal(stripped.userData.garmentFinishSource,undefined);assert.equal(JSON.stringify(finished.userData.garmentFinishSource),cache);assert.deepEqual(Array.from(stripped.attributes.position.array),Array.from(finished.attributes.position.array));
 const malformed={...result,positions:[Infinity,...result.positions.slice(1)]},priorGeometry=restored.children[0].geometry;assert.throws(()=>applyGarmentFinishing(restored,original,malformed,{enabled:true}),/invalid geometry/);assert.equal(restored.children[0].geometry,priorGeometry);assert.equal(JSON.stringify(captureGarmentSource(restored)),before);
 applyGarmentFinishing(restored,captureGarmentSource(restored),null,{enabled:false});validateGarmentFinishing(restored);assert.equal(JSON.stringify(captureGarmentSource(restored)),before);assert.equal(restored.children[0].geometry.userData.garmentFinishSource,undefined);assert.deepEqual(Array.from(restored.children[0].geometry.attributes.normal.array),original.normals);
});
test('dependent garment fingerprints change when only retained finishing settings change',async()=>{
 const root=new THREE.Group(),character=createCharacter();root.add(character);const evaluator=new SceneEvaluator({root}),tickets=[],stop=Error('stop before preparation'),base=liveTshirtPattern(),settings={steps:5,iterations:4};
 evaluator.run=async(object,input)=>{tickets.push(await evaluator.ticket(object,input));throw stop;};
 for(const thickness of [.0006,.001])await assert.rejects(generateGarment({},base,character,{userData:{liveGarment:{settings,finish:{enabled:true,thickness}}}},evaluator),e=>e===stop);
 assert.equal(tickets[0].projectId,tickets[1].projectId);assert.equal(tickets[0].objectId,tickets[1].objectId);assert.equal(tickets[0].revision,tickets[1].revision);assert.notEqual(tickets[0].inputHash,tickets[1].inputHash);
});

test('finishing worker checks retained topology and echoes identity without mutating the source',()=>{
 const doc=migratePattern(starterPattern());doc.particleDistance=.025;const data=buildPattern(doc),source={positions:Array.from(new Float32Array(data.positions)),uvs:Array.from(new Float32Array(data.uvs)),faces:data.faces,sewing:[],groups:[]},before=JSON.stringify(source),context={projectId:'p',objectId:'garment',revision:1,requestId:2,inputHash:'a'.repeat(64)},request={version:1,action:'garmentFinish',context,input:{doc,source,settings:{enabled:true}}};
 const result=surfacePreparationReply(request);assert.equal(result.error,undefined);assert.deepEqual(result.context,context);assert.ok(result.result.faces.length>8000);assert.deepEqual(result.result.sewing,data.sewing);assert.equal(JSON.stringify(source),before);
 const changed=structuredClone(request);changed.input.source.faces[0].reverse();assert.match(surfacePreparationReply(changed).error,/topology differ/);assert.equal(JSON.stringify(source),before);
});
