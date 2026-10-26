import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as THREE from 'three';
import {validateSurfaceAudit} from '../src/garment-surface-audit.js';
const require=createRequire(import.meta.url),native=require('../native/fusion_geometry.node'),{GeometryEngine}=require('../electron/geometry.cjs');
function surface(g){const p=g.attributes.position,index=g.index;return {positions:Array.from({length:p.count},(_,i)=>[p.getX(i),p.getY(i),p.getZ(i)]),triangles:Array.from({length:index.count/3},(_,i)=>Array.from(index.array.slice(i*3,i*3+3)))};}
function sheet(z=0,n=48,offset=0){const positions=[],faces=[];for(let y=0;y<=n;y++)for(let x=0;x<=n;x++)positions.push([x/n*.5-.25+offset,y/n*.5-.25,z]);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*(n+1)+x;faces.push([i,i+1,i+n+2],[i,i+n+2,i+n+1]);}return {positions,faces};}
function box(){const s=surface(new THREE.BoxGeometry(.7,.7,.02,80,80,2));s.positions=s.positions.map(p=>[p[0],p[1],p[2]-.012]);return s;}
const run=q=>JSON.parse(native.auditSurfaceContacts(JSON.stringify(q)));

test('detailed rendered surfaces distinguish outside, interior and clearance contacts against a closed 26,880-triangle body',()=>{
 const body=box();assert.ok(body.triangles.length>25000);
 for(const [z,inside,close]of [[0,false,false],[-.0025,true,true]]){const mesh=sheet(z),q={...mesh,body,clearance:.001},before=JSON.stringify(q),a=run(q);validateSurfaceAudit(a,{vertices:mesh.positions.length,faces:mesh.faces.length,clearance:.001});assert.equal(a.complete,true);assert.equal(a.bodyTopology.closed,true);assert.equal(a.crossingFaces,0);assert.equal(a.coplanarFaces,0);assert.equal(a.insideVertices,inside?mesh.positions.length:0);assert.equal(a.clearanceFaces,close?mesh.faces.length:0);assert.equal(JSON.stringify(q),before);}
 const mesh=sheet(-.002),a=run({...mesh,body,clearance:0});assert.ok(a.coplanarFaces>4000);assert.equal(a.minimumTestedGapM,0);
});

test('a 12,096-triangle thin limb crossing 5,000 cloth triangles is detected without any inside cloth vertex',()=>{
 const g=new THREE.SphereGeometry(.004,96,64);g.scale(1,20,1);const body=surface(g),mesh=sheet(0,50,.0055),a=run({...mesh,body,clearance:.0001});assert.equal(mesh.faces.length,5000);assert.ok(body.triangles.length>12000);assert.equal(a.complete,true);assert.equal(a.bodyTopology.closed,true);assert.ok(a.crossingFaces>10);assert.equal(a.insideVertices,0);assert.ok(a.sampleFaces.length>0);assert.equal(a.minimumTestedGapM,0);
});

test('open bodies, finite work and malformed requests/results remain explicit and cannot report a complete clearance pass',()=>{
 const mesh=sheet(),body=box(),q={...mesh,body,clearance:.001},good=run(q);validateSurfaceAudit(good,{vertices:mesh.positions.length,faces:mesh.faces.length,clearance:.001});
 const open=run({...q,body:{...body,triangles:body.triangles.slice(1)}});assert.equal(open.complete,false);assert.equal(open.faceScanComplete,true);assert.equal(open.insideVertices,null);assert.ok(open.bodyTopology.boundaryEdges>0);validateSurfaceAudit(open,{vertices:mesh.positions.length,faces:mesh.faces.length,clearance:.001});
 const partial=run({...q,workBudget:100});assert.equal(partial.complete,false);assert.equal(partial.budgetExhausted,true);assert.equal(partial.work,100);assert.equal(partial.bodyTopology,null);validateSurfaceAudit(partial,{vertices:mesh.positions.length,faces:mesh.faces.length,clearance:.001});
 for(const bad of [{...q,clearance:-1},{...q,workBudget:99},{...q,faces:[[0,1,999999]]},{...q,body:{...body,previousPositions:body.positions}}])assert.throws(()=>run(bad));
 for(const patch of [{work:Infinity},{workBudget:0},{complete:false},{bodyTopology:{...good.bodyTopology,vertices:0}},{insideVertices:-1},{sampleFaces:[999999]},{facesInspected:0,faceScanComplete:true},{...partial,complete:true}])assert.throws(()=>validateSurfaceAudit({...good,...patch},{vertices:mesh.positions.length,faces:mesh.faces.length,clearance:.001}),/invalid/);
});

test('finished-surface inspection uses the disposable geometry process and recovers after cancellation and malformed work',async()=>{
 const engine=new GeometryEngine(),q={...sheet(),body:box(),clearance:.001};try{await assert.rejects(engine.run('auditSurfaceContacts',{}));const pending=engine.run('auditSurfaceContacts',q);const stopped=assert.rejects(pending,/cancelled/);await engine.close();await stopped;assert.equal(engine.active,null);const a=await engine.run('auditSurfaceContacts',q);assert.equal(a.complete,true);assert.equal(a.crossingFaces,0);assert.equal(engine.active,null);}finally{await engine.close();}
});
