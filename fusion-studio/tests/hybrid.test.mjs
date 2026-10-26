import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import * as THREE from 'three';
import {createCharacter,POSES} from '../src/character.js';
import {tshirtPattern} from '../src/patterns.js';
import {gradePattern,drapeRequest,characterColliders,liveTshirtPattern,hybridTransaction} from '../src/hybrid.js';
const require=createRequire(import.meta.url),native=require('../native/fusion_geometry.node');
const {GeometryEngine}=require('../electron/geometry.cjs');

test('native half edges: twin symmetry, components, boundary and non-manifold rejection',()=>{
 const mesh={positions:[[0,0,0],[1,0,0],[1,1,0],[0,1,0]],faces:[[0,1,2],[0,2,3]]};const r=JSON.parse(native.analyzeMesh(JSON.stringify(mesh)));
 assert.equal(r.edges,5);assert.equal(r.boundaryEdges,4);assert.equal(r.components,1);for(let h=0;h<6;h++)if(r.twins[h]>=0)assert.equal(r.twins[r.twins[h]],h);
 assert.throws(()=>native.analyzeMesh(JSON.stringify({...mesh,faces:[[0,1,2],[0,3,2]]})),/winding/);
 assert.throws(()=>native.analyzeMesh(JSON.stringify({...mesh,faces:[[0,1,2],[0,2,3],[0,2,1]]})),/Non-manifold/);
});
test('pattern grading is reversible from source and preserves authored seams and pins',()=>{
 const base=tshirtPattern(),source=JSON.stringify(base),body=createCharacter().userData.character;
 const tall=gradePattern(base,{...body,height:2.1}),short=gradePattern(base,{...body,height:1.4});
 assert.equal(JSON.stringify(base),source);assert.deepEqual(tall.seams,base.seams);assert.deepEqual(short.panels[1].pins,base.panels[1].pins);
 assert.ok(Math.abs(tall.panels[0].points[2][1]/short.panels[0].points[2][1]-1.5)<1e-12);
 assert.deepEqual(gradePattern(base,body),base);
});
test('Rust cloth determinism, seam convergence, pins and height response',()=>{
 const base=JSON.parse(fs.readFileSync(new URL('./fixtures/live-tshirt-v1.json',import.meta.url))),body=createCharacter({},POSES['T pose']),input=drapeRequest(base,body),run=req=>JSON.parse(native.drapeGarment(JSON.stringify(req)));
 const first=run(input.request),again=run(input.request);assert.deepEqual(first.positions,again.positions);
 assert.equal(createHash('sha256').update(JSON.stringify(first.positions.flat().map(x=>Math.round(x*1e6)))).digest('hex'),'064ec3625af66b631a2b09c805d5f39e7c529f09c461f94c10ac885442f04f93','Reviewed capsule/BVH Fusion T-shirt golden mesh at one-micrometer quantization');
 assert.equal(first.metrics.pinDrift,0);assert.ok(first.metrics.seamGapAfter<first.metrics.seamGapBefore*.2,JSON.stringify(first.metrics));
 const tall=createCharacter({height:2.1},POSES['T pose']),next=run(drapeRequest(base,tall).request);
 const highest=r=>Math.max(...r.positions.map(p=>p[1]));assert.ok(highest(next)>highest(first)*1.1);
 // Preview gates, not production fabric certification; posed results can have higher strain.
 assert.ok(first.metrics.meanStrain<.03,JSON.stringify(first.metrics));assert.ok(first.metrics.maxStrain<.5,JSON.stringify(first.metrics));assert.equal(first.metrics.proxyPenetrations,0,JSON.stringify(first.metrics));
 const front=first.positions.filter(p=>p[1]>1.0&&p[1]<1.35&&Math.abs(p[0])<.2&&p[2]>.08);const back=first.positions.filter(p=>p[1]>1.0&&p[1]<1.35&&Math.abs(p[0])<.2&&p[2]<-.08);
 assert.ok(front.length>15&&back.length>15,'The shirt must cover both sides of the torso, not collapse behind it.');
 console.log('Hybrid baseline',JSON.stringify(first.metrics));console.log('Hybrid tall',JSON.stringify(next.metrics));
});
test('colliders follow posed bones and survive project reload',async()=>{
 const c=createCharacter({},POSES.wave),first=characterColliders(c);const restored=await new THREE.ObjectLoader().parseAsync(c.toJSON());const second=characterColliders(restored);
 for(let i=0;i<first.length;i++)for(let k=0;k<3;k++)assert.ok(Math.abs(first[i].center[k]-second[i].center[k])<1e-7);
 assert.notDeepEqual(characterColliders(createCharacter({},POSES['T pose'])),first);
});
test('worker boundary rejects malformed work and recovers after cancellation',async()=>{
 const engine=new GeometryEngine();try{
  await assert.rejects(engine.run('drapeGarment',{}));await assert.rejects(engine.run('unsafe',{}));
  const pending=engine.run('drapeGarment',drapeRequest(tshirtPattern(),createCharacter({},POSES['T pose'])).request);engine.close();await assert.rejects(pending,/cancelled/);
  const result=await engine.run('drapeGarment',drapeRequest(tshirtPattern(),createCharacter({},POSES['T pose']),{steps:5}).request);assert.ok(result.positions.length>0);
 }finally{engine.close();}
});
function transactionEditor(){const root=new THREE.Group(),object=new THREE.Group();root.add(object);return {root,selected:object,timeline:{frame:9,playing:true},commits:0,restores:0,ensureHistory(){},serialize(){return this.root.toJSON();},commit(){this.commits++;},async restore(data){this.restores++;this.root=await new THREE.ObjectLoader().parseAsync(data);this.timeline.frame=1;},select(n){this.selected=n;}};}
test('a stale garment transaction cannot restore over or commit into a newly opened project',async()=>{
 const e=transactionEditor();let finish;const pending=hybridTransaction(e,()=>new Promise(resolve=>finish=resolve));while(!finish)await new Promise(r=>setTimeout(r,1));const next=new THREE.Group(),marker=new THREE.Group();next.add(marker);e.root=next;e.selected=marker;finish();await assert.rejects(pending,/Scene changed/);assert.equal(e.root,next);assert.equal(e.selected,marker);assert.equal(e.commits,0);assert.equal(e.restores,0);assert.equal(e.batching,false);
});
test('failed garment work restores the current frame, geometry and selection without partial history',async()=>{
 const e=transactionEditor(),id=e.selected.uuid;await assert.rejects(hybridTransaction(e,async()=>{e.selected.position.x=2;e.timeline.frame=40;throw Error('native cancelled');}),/native cancelled/);assert.equal(e.timeline.frame,9);assert.equal(e.timeline.playing,false);assert.equal(e.selected.uuid,id);assert.equal(e.selected.position.x,0);assert.equal(e.commits,0);assert.equal(e.restores,1);assert.equal(e.batching,false);const controller=new AbortController();e.operators={running:{controller}};await assert.rejects(hybridTransaction(e,async()=>{e.selected.position.x=3;controller.abort();}),/cancelled/);assert.equal(e.selected.position.x,0);assert.equal(e.commits,0);assert.equal(e.timeline.frame,9);e.batching=true;await assert.rejects(hybridTransaction(e,async()=>{}),/Finish the current/);
});
