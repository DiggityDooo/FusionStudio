import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  snapToSurface,createRetopoSession,quadDraw,polyStrip,addEdgeFlowGuide,paintRetopoDensity,autoRetopo,
  reprojectToHigh,retopoForPurpose,generateLodChain,preserveEdgeConstraints,buildRetopoMesh,loopFlowHint
} from '../src/retopo.js';

test('snap, manual session, build mesh',()=>{
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1));
  const hit=snapToSurface(mesh,[0,0,2],{maxDist:5});assert.ok(hit.distance<2);
  const session=createRetopoSession(mesh,{symmetry:'x'});
  quadDraw(session,[[0,0,0],[1,0,0],[1,1,0],[0,1,0]]);polyStrip(session,[[0,0,0],[.5,0,0]]);
  addEdgeFlowGuide(session,[[0,.5,0],[1,.5,0]]);paintRetopoDensity(session,0,2);
  const built=buildRetopoMesh(session);assert.ok(built.isMesh);assert.equal(built.userData.fusion_retopo.quads,1);
});

test('auto retopo, reproject, purpose LODs, constraints, loop hints',()=>{
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,16,12));
  const auto=autoRetopo(mesh,{keep:.3});assert.ok(auto.userData.fusion_retopo.triangles>0);
  const high=new THREE.Mesh(new THREE.SphereGeometry(1,24,16)),low=autoRetopo(mesh,{keep:.5});
  reprojectToHigh(low,high);assert.equal(low.userData.fusion_reproject.from,high.uuid);
  assert.equal(retopoForPurpose(mesh,'games').userData.fusion_retopo.purpose,'games');
  assert.equal(retopoForPurpose(mesh,'animation').userData.fusion_retopo.purpose,'animation');
  const lods=generateLodChain(mesh,{levels:[1,.5,.25]});assert.equal(lods.length,3);
  assert.equal(preserveEdgeConstraints(mesh,[[0,1],[1,2]]).length,2);
  assert.ok(loopFlowHint(mesh).rings.length>=3);
});
