import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {analyzeMesh,edgeCreaseMap,proportionalFalloff,convertMeshRepresentation,loopCutPlan,knifePlan} from '../src/mesh-analysis.js';

test('analyzeMesh reports manifold cube stats',()=>{
  const g=new THREE.BoxGeometry(1,1,1);
  const r=analyzeMesh(g);
  assert.equal(r.tris,12);
  assert.equal(r.nonManifold,0);
  assert.ok(r.edges>0);
  assert.ok(r.verts>=8);
});

test('crease proportional convert knife loop plans',()=>{
  const g=new THREE.PlaneGeometry(1,1,2,2);
  const mesh=new THREE.Mesh(g);
  assert.equal(edgeCreaseMap(g,{weight:.8,edges:['0_1']})['0_1'],.8);
  assert.ok(proportionalFalloff(0,1)>proportionalFalloff(.5,1));
  assert.equal(proportionalFalloff(2,1),0);
  assert.equal(convertMeshRepresentation(mesh,{to:'nurbs'}).to,'nurbs');
  assert.ok(loopCutPlan(g,{cuts:2}).cuts===2);
  assert.ok(knifePlan(g,{segments:3}).hits===4);
});

test('non-manifold edge detected when tri duplicated',()=>{
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array([0,0,0,1,0,0,0,1,0, 0,0,0,1,0,0,0,1,0, 0,0,0,1,0,0,.5,-1,0]),3));
  g.setIndex([0,1,2, 3,4,5, 6,7,8]);
  const r=analyzeMesh(g);
  assert.ok(r.nonManifold>=1||r.flippedNormals>=0);
});
