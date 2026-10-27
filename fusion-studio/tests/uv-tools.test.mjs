import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {uvStats,uvSets} from '../src/uv-tools.js';

test('texel density uses world-space area and the chosen texture size',()=>{
  const box=new THREE.BoxGeometry(1,1,1);const s=uvStats(box,new THREE.Matrix4(),{textureSize:2048});
  assert.ok(Math.abs(s.area3d-6)<1e-9&&Math.abs(s.areaUV-6)<1e-9);assert.ok(Math.abs(s.density-2048)<1e-6,'every face fills 0–1: 2048 px/m');
  const scaled=uvStats(box,new THREE.Matrix4().makeScale(2,2,2),{textureSize:2048});assert.ok(Math.abs(scaled.density-1024)<1e-6,'doubling size halves density');
  const plane=new THREE.PlaneGeometry(2,2);assert.ok(Math.abs(uvStats(plane,undefined,{textureSize:1024}).density-512)<1e-6);
});

test('UV sets are listed in glTF order and missing sets report no stats',()=>{
  const g=new THREE.BoxGeometry();g.setAttribute('uv1',g.attributes.uv.clone());assert.deepEqual(uvSets(g),['uv','uv1']);
  g.deleteAttribute('uv');assert.equal(uvStats(g),null);assert.deepEqual(uvSets(g),['uv1']);
});
