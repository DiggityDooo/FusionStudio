import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import * as THREE from 'three';
import {fabricCoupon} from './fabric-fixtures.mjs';
import {clothContactIssues} from '../src/cloth-contacts.js';
const native=createRequire(import.meta.url)('../native/fusion_geometry.node');

test('5,000-triangle physical cloth settles on an 8 mm limb with 12,544 collider triangles',()=>{
 const q=fabricCoupon(50,50,{width:.5,height:.5,traction:0,gravity:[0,0,-9.81]});
 q.pins=q.positions.flatMap((_,i)=>i%51===0||i%51===50||i<51||i>=2550?[i]:[]);
 Object.assign(q,{steps:100,iterations:4,solidContact:true,initializeOutside:true,triangleSelfCollision:false});
 Object.assign(q.fabricMaterial,{warpNpm:1500,weftNpm:1000,shearNpm:150,bendingNm:5e-5,linearIterations:128});
 const body=new THREE.CapsuleGeometry(.004,.25,24,128),position=body.attributes.position,index=body.index.array;
 q.triangleCollider={positions:Array.from({length:position.count},(_,i)=>[position.getX(i)+.005,position.getY(i)+1.75,position.getZ(i)-.002]),triangles:Array.from({length:index.length/3},(_,i)=>Array.from(index.slice(i*3,i*3+3)))};
 assert.equal(q.faces.length,5000);assert.equal(q.triangleCollider.triangles.length,12544);
 const result=JSON.parse(native.drapeGarment(JSON.stringify(q))),metrics=result.metrics,m=metrics.physicalFabric;
 assert.equal(m.linearSolver,'sparse-cholesky');assert.ok(m.sparseFactorizations>0);assert.ok(m.sparseWorkspaceBytes>0&&m.sparseWorkspaceBytes<512*1048576);
 for(const key of ['bodyFaceIntersections','bodyInsideVertices','triangleClearanceViolations','pinDrift'])assert.equal(metrics[key],0,key);
 assert.ok(Math.abs(m.massKg-.05)<1e-10);assert.ok(m.maximumSpeedMps<.0001,JSON.stringify(m));assert.ok(metrics.maxStrain<.02);
 assert.ok(m.lastLinearRelativeResidual<=1e-5||m.lastLinearAbsoluteResidualN<=1e-10,JSON.stringify(m));
 assert.equal(m.unconvergedContactSets,0);assert.equal(m.stalledProjections,0);
 fs.mkdirSync('test-output',{recursive:true});fs.writeFileSync('test-output/physical-thin-limb-results.json',JSON.stringify({passed:true,bodyTriangles:q.triangleCollider.triangles.length,metrics,scope:'Own capsule and detailed cloth, stationary collider, boundary pins, normal gravity. This does not prove layered or animated cloth.'},null,2));
});

test('4,096-triangle layered physical cloth maintains measured clearance under a normal gravity load',()=>{
 const a=fabricCoupon(32,32,{width:.4,height:.4,traction:0,gravity:[0,0,-9.81]}),n=a.positions.length;
 const q={...a,steps:100,iterations:4,triangleSelfCollision:true,selfCollision:true};
 q.positions=[...a.positions,...a.positions.map(p=>[p[0],p[1],.012])];q.restPositions=structuredClone(q.positions);
 q.materialCoordinates=[...a.materialCoordinates,...a.materialCoordinates];q.faces=[...a.faces,...a.faces.map(t=>t.map(i=>i+n))];
 q.pins=[...Array(n).keys(),...a.positions.flatMap((p,i)=>i<33||i>=1056||i%33===0||i%33===32?[i+n]:[])];
 Object.assign(q.fabricMaterial,{warpNpm:1500,weftNpm:1000,shearNpm:150,bendingNm:5e-5,linearIterations:128});
 const before=JSON.stringify(q),result=JSON.parse(native.drapeGarment(before)),m=result.metrics;
 assert.equal(q.faces.length,4096);assert.equal(JSON.stringify(q),before);assert.equal(m.pinDrift,0);assert.ok(m.contacts>1000);
 assert.equal(m.clothContact.complete,true);assert.deepEqual(clothContactIssues(m.clothContact),[]);
 assert.ok(m.clothContact.minimumTestedGapM>=.006-1e-6);assert.ok(m.physicalFabric.maximumSpeedMps<.0001);assert.ok(m.maxStrain<.01);
 // JSON numeric parsing across JS/Rust may differ by one ULP. The solver's
 // pinDrift above is measured against its own parsed initial coordinates.
 for(let i=0;i<n;i++)assert.ok(Math.hypot(...result.positions[i].map((v,j)=>v-q.positions[i][j]))<1e-14);
 let minimum=Infinity;for(let i=n;i<q.positions.length;i++)minimum=Math.min(minimum,result.positions[i][2]);
 assert.ok(minimum>=.006-1e-6);assert.ok(minimum<.007,'the outer layer reaches contact rather than floating at its source arrangement');
 fs.writeFileSync('test-output/physical-layer-results.json',JSON.stringify({passed:true,triangles:q.faces.length,minimumOuterHeightM:minimum,metrics:m,scope:'Own stationary inner layer and boundary-pinned outer layer; normal gravity, 100 steps. No seam, layer-order or animated-collision guarantee.'},null,2));
});
