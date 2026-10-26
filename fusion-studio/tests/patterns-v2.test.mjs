import {test} from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createRequire} from 'node:module';
import {starterPattern,migratePattern,buildPattern,validatePattern,addPatternDart,patternSegmentPoint} from '../src/patterns.js';

const edgeKey=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
const native=createRequire(import.meta.url)('../native/fusion_geometry.node');
const edgesOf=data=>new Set(data.faces.flatMap(t=>t.map((a,i)=>edgeKey(a,t[(i+1)%3]))));
const uv=(d,i)=>d.uvs.slice(i*2,i*2+2);
const area=(a,b,c)=>Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;
const ring=(id,points)=>({id,points,segments:points.map((_,i)=>({id:`${id}_s${i}`,type:'line'}))});
function constrained(data){const edges=edgesOf(data);for(const chain of [...Object.values(data.segmentChains).map(c=>c.indices),...Object.values(data.internalChains)])for(let i=1;i<chain.length;i++)assert.ok(edges.has(edgeKey(chain[i-1],chain[i])),'constraint must be a real mesh edge');for(const t of data.faces)assert.ok(area(...t.map(i=>uv(data,i)))>1e-14,'nondegenerate face');}
function detailed(){const doc=migratePattern(starterPattern());doc.particleDistance=.011;return doc;}

test('v1 migration is deterministic, nonmutating and preserves authored references',()=>{
 const before=starterPattern(),copy=structuredClone(before),a=migratePattern(before),b=migratePattern(before);assert.deepEqual(before,copy);assert.deepEqual(a,b);assert.deepEqual(migratePattern(a),a);assert.deepEqual(a.panels[0].points,before.panels[0].points);assert.equal(a.seams[0].a.segment,'front_s1');assert.deepEqual(a.panels[0].pins,['front_s2']);assert.equal(validatePattern(a).estimated,true);
});

test('detailed garment panels preserve all boundaries, pins and partial seam correspondence across refinement',()=>{
 const doc=detailed();doc.seams=[{id:'partial',a:{panel:'front',segment:'front_s1',start:.17,end:.83},b:{panel:'back',segment:'back_s3',start:.09,end:.91},reverse:true}];
 const before=JSON.stringify(doc),start=performance.now(),data=buildPattern(doc);assert.ok(data.faces.length>=20000,`detailed test has ${data.faces.length} triangles`);constrained(data);assert.equal(JSON.stringify(doc),before);assert.ok(data.quality.maxEdge<=doc.particleDistance*1.0011);assert.ok(data.quality.minAngleDegrees>=20,'regular detailed panels meet the 20 degree quality gate');
 const topology=JSON.parse(native.analyzeMesh(JSON.stringify({positions:Array.from({length:data.positions.length/3},(_,i)=>data.positions.slice(i*3,i*3+3)),faces:data.faces})));assert.equal(topology.components,2);assert.equal(topology.boundaryEdges,Object.values(data.segmentChains).reduce((n,c)=>n+c.indices.length-1,0),'no hanging interior edges');
 const ac=data.segmentChains['front:front_s1'],bc=data.segmentChains['back:back_s3'];for(const [a,b] of data.seamCorrespondence[0].pairs){const ua=(ac.parameters[ac.indices.indexOf(a)]-.17)/.66,ub=1-(bc.parameters[bc.indices.indexOf(b)]-.09)/.82;assert.ok(Math.abs(ua-ub)<1e-8);}assert.ok(data.pins.length>30);const refs=structuredClone(doc.seams);doc.particleDistance=.03;const low=buildPattern(doc);assert.deepEqual(doc.seams,refs);constrained(low);assert.ok(low.faces.length<data.faces.length);console.log(JSON.stringify({fixture:'detailed-partial-seam',triangles:data.faces.length,vertices:data.positions.length/3,ms:performance.now()-start,quality:data.quality}));
});

test('curves, holes and internal line constraints preserve panel area without bridging holes',()=>{
 const doc=migratePattern(starterPattern());doc.panels=doc.panels.slice(0,1);doc.seams=[];doc.particleDistance=.025;const p=doc.panels[0];p.segments[2]={id:'front_s2',type:'cubic',controls:[[.15,.78],[-.15,.78]]};p.holes=[ring('cutout',[[-.08,.2],[.08,.2],[.08,.35],[-.08,.35]])];p.internalLines=[{id:'fold',points:[[-.2,.12],[-.2,.48],[-.14,.53]]}];
 const data=buildPattern(doc);constrained(data);assert.ok(data.internalChains['front:fold'].length>15);assert.ok(data.segmentChains['front:cutout_s0']);for(const t of data.faces){const [x,y]=t.map(i=>uv(data,i)).reduce((sum,p)=>sum.map((v,i)=>v+p[i]/3),[0,0]);assert.ok(!(x>-.08&&x<.08&&y>.2&&y<.35),'hole stays empty');}
 const chain=data.segmentChains['front:front_s2'];for(let i=0;i<chain.indices.length;i++){const expected=patternSegmentPoint(p,2,chain.parameters[i]);assert.ok(Math.hypot(...uv(data,chain.indices[i]).map((v,j)=>v-expected[j]))<1e-9,'curve boundary retains authored parameter coordinates');}assert.ok(data.quality.maxEdge<=doc.particleDistance*1.0011);
});

test('darts create stable equal-length sewn legs and reject invalid cuts atomically',()=>{
 const doc=migratePattern(starterPattern());doc.seams=[];const id=addPatternDart(doc,'front',0,.06,.15);const data=buildPattern(doc);constrained(data);assert.equal(doc.panels[0].darts[0].id,id);assert.ok(data.seamCorrespondence.find(s=>s.id===id).pairs.length>3);const before=JSON.stringify(doc);assert.throws(()=>addPatternDart(doc,'front',0,.01,3),/cross|inside|area/);assert.equal(JSON.stringify(doc),before);
});

test('invalid holes, crossed internal lines, missing IDs and overlapping partial seams report actionable errors',()=>{
 const doc=migratePattern(starterPattern());doc.panels[0].holes=[ring('outside',[[0,0],[.2,0],[.2,-.1],[0,-.1]])];assert.throws(()=>validatePattern(doc),/hole.*inside/i);
 const crossed=migratePattern(starterPattern());crossed.panels[0].internalLines=[{id:'a',points:[[-.2,.1],[.2,.5]]},{id:'b',points:[[-.2,.5],[.2,.1]]}];assert.throws(()=>validatePattern(crossed),/cannot cross/);
 const overlap=migratePattern(starterPattern());overlap.seams.push({...structuredClone(overlap.seams[0]),id:'overlap'});assert.throws(()=>validatePattern(overlap),/Overlapping/);
 const missing=migratePattern(starterPattern());missing.seams[0].a.segment='absent';assert.throws(()=>validatePattern(missing),/missing segment/);
 const duplicates=migratePattern(starterPattern());duplicates.seams[1].id=duplicates.seams[0].id;assert.throws(()=>validatePattern(duplicates),/Seam IDs/);
});
test('acute authored corners explicitly fail the quality target and regular meshing is deterministic',()=>{
 const doc=migratePattern(starterPattern());doc.panels=doc.panels.slice(0,1);doc.seams=[];const p=doc.panels[0];p.points=[[0,0],[1,0],[.98,.01]];p.segments=p.points.map((_,i)=>({id:'acute'+i,type:'line'}));p.pins=[];const result=buildPattern(doc);assert.equal(result.quality.qualityTargetMet,false);assert.ok(result.quality.minAngleDegrees<20);assert.match(result.quality.warnings.join(' '),/20°.*unmet/);constrained(result);const regular=migratePattern(starterPattern());regular.particleDistance=.08;assert.deepEqual(buildPattern(regular),buildPattern(regular));
});
