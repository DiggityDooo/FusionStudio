import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {evaluateCharacter} from '../src/deformation.js';
import {neutralCharacterMesh,measureNeutralMesh,TORSO_LEVELS} from '../src/body-measurements.js';
import {draftSurfaceShirt,SHIRT_JOINTS,shirtOptions} from '../src/surface-shirt.js';
import {createFittedSurface,prepareFittedDrape} from '../src/surface-jobs.js';
import {fittedPatternInput,validateFittedSurface,triples,surfaceGradeMatrices,validatePanelAttachments} from '../src/surface-fit.js';
import {buildPattern,migratePattern,starterPattern} from '../src/patterns.js';
import {roundedNecklineCurves,necklineCurvePoint} from '../src/shirt-neckline.js';

async function genesis(){const f=JSON.parse(fs.readFileSync('test-output/dson-integration-results.json')),bytes=fs.readFileSync(f.output),{scene:c}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');c.userData.fusion_id=c.uuid;evaluateCharacter(c);return c;}
function ellipse(){const positions=[],triangles=[],nx=128,ny=96;for(let y=0;y<=ny;y++)for(let x=0;x<nx;x++){const a=x/nx*2*Math.PI;positions.push(.2*Math.cos(a),y/ny*1.8,.12*Math.sin(a));}for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const a=y*nx+x,b=y*nx+(x+1)%nx;triangles.push(a,b,a+nx,b,b+nx,a+nx);}return {positions,triangles};}
function fixture(){const mesh=ellipse(),doc=migratePattern(starterPattern());doc.panels=doc.panels.slice(0,1);doc.seams=[];doc.panels[0].position=[0,0,0];doc.panels[0].pins=[];doc.particleDistance=.012;const data=buildPattern(doc),r=triples(data.positions),profile=measureNeutralMesh(mesh),s={version:1,bodyId:'body',topologyHash:'a'.repeat(64),profile,levels:{...TORSO_LEVELS},reference:{flatPositions:r,positions:r,faces:data.faces},binding:{version:1,bodyId:'body',bodyVertices:3,bodyTriangles:1,topologyFingerprint:'0'.repeat(32),attachments:r.map(()=>({triangle:0,barycentric:[1,0,0],offset:[0,0,0]}))},panels:[{id:'front',kind:'bodice',offset:[0,0,0],indices:r.map((_,i)=>i)}]};return {mesh,doc,s};}

test('rounded neckline has aligned inner tangents and consistent 2D/3D parameters without mutating its source',()=>{
 const points=[[.07,.1],[.056,.045],[-.056,.045],[-.07,.1]],before=JSON.stringify(points),curves=roundedNecklineCurves(...points),to3D=p=>[p[0],p[1]+1,p[1]*2],curves3=roundedNecklineCurves(...points.map(to3D));
 assert.equal(JSON.stringify(points),before);
 for(const [index,c] of curves.entries()){
  const inner=index===0?[c[3][0]-c[2][0],c[3][1]-c[2][1]]:[c[1][0]-c[0][0],c[1][1]-c[0][1]];
  assert.ok(inner[0]<0);assert.equal(inner[1],0);
  for(let i=0;i<=100;i++){
   const t=i/100,a=necklineCurvePoint(c,t),b=necklineCurvePoint(curves3[index],t),expected=to3D(a);
   assert.ok(a[0]>=Math.min(c[0][0],c[3][0])-1e-14&&a[0]<=Math.max(c[0][0],c[3][0])+1e-14);
   assert.ok(a[1]>=.045-1e-14&&a[1]<=.1+1e-14);assert.ok(Math.hypot(...b.map((v,k)=>v-expected[k]))<1e-14);
  }
 }
 assert.throws(()=>roundedNecklineCurves(...points.map(p=>p.map(()=>NaN))),/Invalid/);
 const bad=structuredClone(points);bad[2][1]+=.01;assert.throws(()=>roundedNecklineCurves(...bad),/upright U/);
 assert.throws(()=>shirtOptions({neckline:'unknown'}),/neckline/);
});

test('rounded neckline drafts a detailed quality-gated Genesis source while retaining original sewing and panel identities',async()=>{
 const character=await genesis(),mesh=neutralCharacterMesh(character,{jointNames:SHIRT_JOINTS}),before=JSON.stringify(character.toJSON()),legacy=draftSurfaceShirt(mesh,mesh.anchors),rounded=draftSurfaceShirt(mesh,mesh.anchors,{neckline:'rounded'});
 assert.equal(legacy.data.faces.length,2154);assert.equal(rounded.options.sourceDistance,.025);assert.ok(rounded.data.faces.length>=4000);assert.equal(rounded.data.quality.qualityTargetMet,true);
 assert.deepEqual(rounded.doc.seams,legacy.doc.seams);assert.deepEqual(rounded.doc.panels.map(p=>({id:p.id,pins:p.pins,segments:p.segments.map(s=>s.id)})),legacy.doc.panels.map(p=>({id:p.id,pins:p.pins,segments:p.segments.map(s=>s.id)})));
 for(const panel of rounded.doc.panels){const curved=panel.segments.filter(s=>s.type==='cubic');assert.equal(curved.length,['front','back'].includes(panel.id)?2:0);}
 assert.ok(rounded.positions.flat().every(Number.isFinite));assert.equal(JSON.stringify(character.toJSON()),before);
});

test('reviewed bind anchors and original measured shirt remain invariant under root motion and FK',async()=>{
 const c=await genesis(),mesh=neutralCharacterMesh(c,{jointNames:SHIRT_JOINTS}),before=JSON.stringify(c.toJSON()),draft=draftSurfaceShirt(mesh,mesh.anchors);assert.equal(JSON.stringify(c.toJSON()),before);assert.equal(mesh.triangles.length/3,50312);assert.equal(draft.doc.panels.length,6);assert.equal(draft.data.faces.length,2154);assert.ok(draft.data.quality.minAngleDegrees>=28);assert.ok(draft.positions.every(p=>p.every(Number.isFinite)));
 const copy=structuredClone(draft);copy.positions[0][0]+=1;assert.notDeepEqual(copy.positions,draft.positions);assert.notEqual(draft.positions,mesh.positions);
 c.getObjectByName('l_upperarm').rotateZ(.4);c.position.set(1,2,-3);c.rotation.set(.3,.5,.1);c.scale.setScalar(1.1);const posed=neutralCharacterMesh(c,{allowTilted:true,jointNames:SHIRT_JOINTS});for(const key of Object.keys(mesh.anchors))assert.ok(new THREE.Vector3(...mesh.anchors[key]).distanceTo(new THREE.Vector3(...posed.anchors[key]))<1e-12);
 assert.throws(()=>neutralCharacterMesh(c,{allowTilted:true,jointNames:{neck:'missing'}}),/joint is missing/);assert.throws(()=>draftSurfaceShirt(mesh,{...mesh.anchors,leftShoulder:mesh.anchors.rightShoulder}),/joint mapping/);assert.throws(()=>draftSurfaceShirt(mesh,{...mesh.anchors,leftElbow:mesh.anchors.leftShoulder}),/elbow/);assert.throws(()=>shirtOptions({particleDistance:.0001}),/particleDistance/);
});

test('detailed retained UV reference grades from measured shape while preserving authored panels and metadata',()=>{
 const {mesh,doc,s}=fixture(),before=JSON.stringify({doc,s}),same=fittedPatternInput(doc,s,mesh);assert.ok(same.data.faces.length>5000);assert.ok(Math.abs(same.grading.circumferenceScale-1)<1e-12);assert.deepEqual(same.doc,doc);assert.equal(JSON.stringify({doc,s}),before);
 const changed={...mesh,positions:mesh.positions.map((v,i)=>i%3===0?v*1.1:v)},next=fittedPatternInput(doc,s,changed);assert.ok(next.grading.circumferenceScale>1.05);assert.ok(next.doc.panels[0].points[0][0]<doc.panels[0].points[0][0]);assert.equal(next.doc.panels[0].points[0][1],doc.panels[0].points[0][1]);assert.equal(JSON.stringify({doc,s}),before);
 const moved=structuredClone(doc);moved.panels[0].position[0]=1;assert.throws(()=>fittedPatternInput(moved,s,mesh),/UV placement/);const identity=structuredClone(doc);identity.panels[0].id='wrong';assert.throws(()=>fittedPatternInput(identity,s,mesh),/identities changed/);
 const excessive={...mesh,positions:mesh.positions.map((v,i)=>i%3===1?v:v*1.5)};assert.throws(()=>fittedPatternInput(doc,s,excessive),/grading range/);
 const invalid=structuredClone(s);invalid.reference.faces[0][0]=9999999;assert.throws(()=>validateFittedSurface(invalid),/reference/);const duplicate=structuredClone(s);duplicate.panels[0].indices.push(0);assert.throws(()=>validateFittedSurface(duplicate),/shared or duplicated/);
});

test('cancellation after preparation or Blender result cannot start later fitting stages',async()=>{
 const c=await genesis();for(const stage of ['before','draft','flatten']){const abort=new AbortController(),calls=[],api={job:async()=>{calls.push('flatten');abort.abort();return {};},geometry:async()=>{calls.push('geometry');throw Error('Must not start');}},prepare=async action=>{calls.push(action);if(stage==='draft')abort.abort();const doc=migratePattern(starterPattern()),data=buildPattern(doc);return {doc,data,positions:triples(data.positions)};};if(stage==='before')abort.abort();
  await assert.rejects(createFittedSurface(api,c,{joints:SHIRT_JOINTS},{signal:abort.signal,prepare}),/cancelled/);assert.deepEqual(calls,stage==='before'?[]:stage==='draft'?['draft']:['draft','flatten']);
 }
 const {doc,s}=fixture(),calls=[];await assert.rejects(prepareFittedDrape({geometry:async()=>calls.push('native')},doc,c,s),/identity or topology/);assert.deepEqual(calls,[]);
});

test('surface metric grading preserves affine edge lengths and rejects collapsed or excessive local changes',()=>{
 const {s}=fixture(),before=JSON.stringify(s),r=s.reference.positions;
 assert.deepEqual(surfaceGradeMatrices(s,r).front,[1,0,1]);const target=r.map(([x,y,z])=>[1.1*x+.12*y,.95*y,z]),m=surfaceGradeMatrices(s,target).front;
 for(const [u,v] of [[1,0],[0,1],[.7,.3],[-.4,.8]])assert.ok(Math.abs(Math.hypot(m[0]*u+m[1]*v,m[1]*u+m[2]*v)-Math.hypot(1.1*u+.12*v,.95*v))<1e-6);
 assert.equal(JSON.stringify(s),before);assert.throws(()=>surfaceGradeMatrices(s,r.map(p=>p.map(v=>v*1.5))),/grading range/);assert.throws(()=>surfaceGradeMatrices(s,r.map(()=>[0,0,0])),/collapsed/);
});

test('flat attachments cannot silently jump from an authored panel to a different fitting patch',()=>{
 const doc=migratePattern(starterPattern()),data=buildPattern(doc),positions=triples(data.positions),surface={reference:{positions,faces:data.faces},panels:data.groups.map(g=>({id:g.panel,indices:[...new Set(data.faces.slice(g.start/3,(g.start+g.count)/3).flat())]}))},binding={attachments:positions.map(()=>({triangle:0}))};for(const group of data.groups)for(const i of surface.panels.find(p=>p.id===group.panel).indices)binding.attachments[i].triangle=group.start/3;
 validatePanelAttachments(data,surface,binding);binding.attachments[surface.panels[0].indices[0]].triangle=data.groups[1].start/3;assert.throws(()=>validatePanelAttachments(data,surface,binding),/another fitting patch/);
});
