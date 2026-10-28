import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createPolygroups,hideSculptRegion,createSculptLayers,setSculptLayerStrength,createImmBrush,
  stampAlpha,createSubtoolStack,livePolygroupBoolean,curveTubeStroke,fibermeshPreview,
  projectDetailBetween,gpuSculptBudget,createStencilTexture,retopoFriendlySculpt
} from '../src/sculpt-advanced.js';

test('polygroups layers IMM stamp subtools',()=>{
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1,16,16,16));
  assert.equal(createPolygroups(mesh,{groups:3}).groups,3);
  assert.ok(hideSculptRegion(mesh,1).includes(1));
  const layers=createSculptLayers(mesh);assert.equal(layers.layers.length,2);
  assert.equal(setSculptLayerStrength(mesh,layers.layers[1].id,.4).strength,.4);assert.equal(layers.layers[1].strength,1,'previous layer state is retained rather than mutated');
  assert.ok(createImmBrush({meshes:[mesh]}).kitbash);
  assert.ok(stampAlpha(mesh,[.5,.5],{strength:.8}).stamped);
  const root=new THREE.Group();root.add(mesh);
  assert.ok(createSubtoolStack(root,{count:2}).length>=1);
});

test('boolean curve fiber project gpu stencil retopo',()=>{
  const a=new THREE.Mesh(new THREE.SphereGeometry(.5,8,8)),b=new THREE.Mesh(new THREE.BoxGeometry());
  assert.ok(livePolygroupBoolean(a,b,{op:'subtract'}).live);
  const tube=curveTubeStroke([[0,0,0],[0,1,0],[1,1,0]],{radius:.04});assert.ok(tube.isMesh);
  const fiber=fibermeshPreview(a,{strands:16});assert.ok(fiber.userData.fusion_fibermesh.strands);
  assert.equal(projectDetailBetween(a,b).from,b.uuid);
  assert.ok(gpuSculptBudget(a,{tris:5e5}).gpu);
  assert.ok(createStencilTexture({size:64}).bytes===64*64);
  assert.ok(retopoFriendlySculpt(a).friendly);
});
