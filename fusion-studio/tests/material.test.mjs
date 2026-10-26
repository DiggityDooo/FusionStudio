import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
import {fabricCoupon,extension} from './fabric-fixtures.mjs';
import {fabricResponse,applyFabricResponse,fabricResponseIssues} from '../src/fabric-materials.js';
const require=createRequire(import.meta.url),native=require('../native/fusion_geometry.node'),run=q=>JSON.parse(native.drapeGarment(JSON.stringify(q)));

test('surface material mass, prescribed traction, reaction and strain energy match a continuum strip across detailed refinements',()=>{
 const rows=[];for(const [nx,ny] of [[20,50],[40,100],[60,150]]){const q=fabricCoupon(nx,ny),before=JSON.stringify(q),start=performance.now(),r=run(q),m=r.metrics.physicalFabric,delta=extension(q,r,nx),expected=.005;assert.equal(JSON.stringify(q),before);assert.ok(Math.abs(m.massKg-.02)<1e-10);assert.ok(Math.abs(m.restAreaM2-.1)<1e-10);assert.ok(Math.abs(delta/expected-1)<.002);assert.ok(Math.abs(m.pinnedReactionN[1]-.2)<.0002);assert.ok(Math.abs(m.membraneEnergyJ-.0005)<.000002);assert.ok(m.maximumSpeedMps<.0001);assert.ok(m.maximumFreeForceResidualN<.0001);assert.equal(r.metrics.pinDrift,0);rows.push({triangles:q.faces.length,vertices:q.positions.length,extensionM:delta,expectedExtensionM:expected,milliseconds:performance.now()-start,metrics:m});}
 fs.mkdirSync('test-output',{recursive:true});fs.writeFileSync('test-output/material-continuum-results.json',JSON.stringify({passed:true,rows,scope:'Original uncoupled membrane model; zero gravity, known 1 N/m traction over 0.2 m width, 0.5 m length, 100 N/m weft stiffness. Numerical unit test, not measured fabric calibration.'},null,2));console.log('Continuum coupon gate',JSON.stringify(rows.map(r=>({triangles:r.triangles,milliseconds:r.milliseconds,extensionM:r.extensionM}))));
});

test('grain rotation and timestep changes retain the expected directional stiffness',()=>{
 for(const [transpose,dt,expected] of [[true,1/120,.0005],[false,1/240,.005]]){const q=fabricCoupon(20,50,{transpose});q.fabricMaterial.timeStep=dt;const r=run(q),delta=extension(q,r,20);assert.ok(Math.abs(delta/expected-1)<.005,JSON.stringify({transpose,dt,delta,expected}));assert.ok(r.metrics.physicalFabric.maximumFreeForceResidualN<.0001);}
});

test('a detailed strip on a frictionless triangle support retains its independent in-plane traction response',()=>{
 const q=fabricCoupon(20,50,{gravity:[0,0,-9.81]});q.triangleCollider={positions:[[-2,0,-.003],[2,0,-.003],[0,4,-.003]],triangles:[[0,1,2]]};q.friction=0;
 const r=run(q);assert.ok(Math.abs(extension(q,r,20)/.005-1)<.005);assert.ok(Math.max(...r.positions.map(p=>Math.abs(p[2])))<1e-8);assert.equal(r.metrics.bodyFaceIntersections,0);assert.equal(r.metrics.triangleClearanceViolations,0);assert.ok(r.metrics.physicalFabric.maximumSpeedMps<.0001);assert.equal(r.metrics.physicalFabric.unconvergedContactSets,0);
});

test('a detailed two-panel strip transfers known load through a length-integrated seam',()=>{
 const nx=20,ny=50,a=fabricCoupon(nx,ny,{height:.25}),b=fabricCoupon(nx,ny,{height:.25,traction:0}),offset=a.positions.length;
 for(const list of [b.positions,b.restPositions])for(const p of list)p[1]+=.25;
 const q={...a,positions:[...a.positions,...b.positions],restPositions:[...a.restPositions,...b.restPositions],faces:[...a.faces,...b.faces.map(t=>t.map(i=>i+offset))],materialCoordinates:[...a.materialCoordinates,...b.materialCoordinates],pins:b.pins.map(i=>i+offset),sewing:Array.from({length:nx+1},(_,x)=>[ny*(nx+1)+x,offset+x])};
 const r=run(q),m=r.metrics.physicalFabric,expected=.005001;assert.equal(q.faces.length,4000);assert.ok(Math.abs(extension(q,r,nx)/expected-1)<.005);assert.ok(Math.abs(r.metrics.seamGapAfter/1e-6-1)<.02);assert.ok(Math.abs(m.massKg-.02)<1e-10);assert.ok(Math.abs(m.pinnedReactionN[1]-.2)<.0002);assert.ok(Math.abs(m.seamEnergyJ/1e-7-1)<.02);assert.ok(m.maximumSpeedMps<.0001);
});

test('physical rest/grain mismatch, duplicate pins, unsupported controls and malformed material reject before exposing a result',()=>{
 const q=fabricCoupon();assert.throws(()=>run({...q,fabricMaterial:{...q.fabricMaterial,densityKgM2:0}}),/physical fabric/i);assert.throws(()=>run({...q,pins:[0,0]}),/unique/);assert.throws(()=>run({...q,materialCoordinates:q.materialCoordinates.map(p=>p.map(v=>v*2))}),/rest geometry/);assert.throws(()=>run({...q,materialCoordinates:q.materialCoordinates.map(p=>p.map(v=>v*1e200))}),/rest geometry|fabric/);assert.throws(()=>run({...q,fabricMaterial:undefined}),/require an explicit/);assert.throws(()=>run({...q,forces:[{vertex:999999,force:[0,1,0]}]}),/unique valid/);assert.throws(()=>run({...q,fabricMaterial:{...q.fabricMaterial,linearIterations:513}}),/physical fabric/i);
});

test('legacy geometry and diagnostics remain byte-equivalent to the preserved 0.18 core',()=>{
 const file=new URL('../release-v0.18.0/win-unpacked/resources/app.asar.unpacked/native/fusion_geometry.node',import.meta.url),bytes=fs.readFileSync(file),hash=crypto.createHash('sha256').update(bytes).digest('hex');assert.equal(hash,'67099ab5aa4d2a545374acbd466f6980238b6a2f21e95645a1e7c3d10ad082e1');const old=require(fileURLToPath(file));
 const q=fabricCoupon(30,50);delete q.fabricMaterial;delete q.forces;delete q.gravity;q.steps=5;q.iterations=6;q.fabricCompliance=[1e-7,2e-7,3e-7];q.colliders=[{center:[0,1.65,.07],axes:[[1,0,0],[0,1,0],[0,0,1]],radii:[.11,.15,.08]}];const a=run(q),b=JSON.parse(old.drapeGarment(JSON.stringify(q)));delete a.metrics.milliseconds;delete b.metrics.milliseconds;assert.deepEqual(a,b);assert.deepEqual(fs.readFileSync(file),bytes);
});

test('canonical fabric settings persist meaningful units and scale grain distances without changing retained inputs',()=>{
 const response=fabricResponse(),q=fabricCoupon(),before=JSON.stringify(q),scaled=applyFabricResponse(q,response,1.1);assert.equal(scaled.fabricMaterial.densityKgM2,.2);assert.equal(scaled.materialCoordinates[1][0],q.materialCoordinates[1][0]*1.1);assert.equal(scaled.executionBudget,'offline');assert.equal(JSON.stringify(q),before);assert.equal(applyFabricResponse(q,null),q);assert.throws(()=>fabricResponse({material:{linearIterations:3}}),/linearIterations/);assert.throws(()=>fabricResponse({preview:{steps:1000,iterations:4}}),/preview/);
});

test('solver selection and contact penalty migrate explicitly and malformed choices reject',()=>{
 const saved={material:{warpNpm:1700}};assert.equal(fabricResponse(saved).material.linearSolver,'auto');assert.equal(fabricResponse(saved).material.contactNpm,1e5);
 for(const mode of ['auto','sparse','pcg'])assert.equal(fabricResponse({material:{linearSolver:mode}}).material.linearSolver,mode);
 assert.throws(()=>fabricResponse({material:{linearSolver:'magic'}}),/linearSolver/);assert.throws(()=>fabricResponse({material:{contactNpm:1e9}}),/contactNpm/);
 const q=fabricCoupon();assert.throws(()=>run({...q,fabricMaterial:{...q.fabricMaterial,linearSolver:'magic'}}),/unknown variant/);
});

test('automatic sparse limits report a PCG fallback and an explicit sparse request fails without changing its input',()=>{
 const q=fabricCoupon(120,100,{traction:0});q.steps=1;q.iterations=1;q.fabricMaterial.linearIterations=4;
 const before=JSON.stringify(q),r=run(q);assert.equal(q.positions.length,12221);assert.equal(r.metrics.physicalFabric.linearSolver,'pcg');assert.match(r.metrics.physicalFabric.sparseFallback,/12.*000/);assert.equal(r.metrics.physicalFabric.sparseFactorizations,0);assert.ok(Math.max(...r.positions.map((p,i)=>Math.hypot(...p.map((v,a)=>v-q.positions[i][a]))))<1e-12);assert.equal(r.metrics.pinDrift,0);
 q.fabricMaterial.linearSolver='sparse';assert.throws(()=>run(q),/12.*000/);delete q.fabricMaterial.linearSolver;assert.equal(JSON.stringify(q),before);
});

test('a quiet cloth cannot pass fit checks while its requested solve accuracy or contact work limit is unmet',()=>{
 const response=fabricResponse(),physicalFabric={maximumSpeedMps:0,lastLinearAbsoluteResidualN:.001,lastLinearRelativeResidual:.001,unconvergedContactSets:0,stalledProjections:0};assert.match(fabricResponseIssues({physicalFabric},response).join(' '),/missed the requested accuracy/);
 physicalFabric.lastLinearRelativeResidual=0;assert.deepEqual(fabricResponseIssues({physicalFabric},response),[]);physicalFabric.unconvergedContactSets=2;assert.match(fabricResponseIssues({physicalFabric},response).join(' '),/2 contact solves/);assert.deepEqual(fabricResponseIssues({},response),[]);
});
