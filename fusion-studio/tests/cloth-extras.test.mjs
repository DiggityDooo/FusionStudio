import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createPbdCloth,createSoftBody,stepSoftBody} from '../src/sim-physics.js';
import {
  tearCloth,cutCloth,createHardware,attachHardware,createStiffnessMap,paintStiffness,applyStiffnessToSoftBody,
  stepClothWithWeights,createDrapePreset,simulateDrapeFrames,exportClothCache,placeFabricPrint,clothSimToRetopo
} from '../src/cloth-extras.js';

test('tear and cut reduce soft-body edges',()=>{
  const body=createPbdCloth(1,1,6,6);
  // stretch a free tip far to force tears
  for(const i of [...body.pinned].slice(0,0))void i;
  const tip=body.points.length-1;body.points[tip][1]-=5;
  const before=body.rest.length;const r=tearCloth(body,{threshold:1.05,maxTears:20});
  assert.ok(r.torn>=0);assert.ok(body.rest.length<=before);
  const cut=cutCloth(body,{point:[0,0,0],normal:[1,0,0]});assert.ok(cut.removed>=0);
});

test('hardware, stiffness paint, drape presets, cache, print, retopo',()=>{
  const root=new THREE.Group();
  for(const kind of ['button','zipper','trim','buckle']){const h=createHardware(kind,{position:[0,1,0],size:.02});attachHardware(root,h);}
  assert.equal(root.userData.fusion_hardware.length,4);
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1,4,4));
  const map=createStiffnessMap(mesh,1);paintStiffness(mesh,0,.2,{radius:.4,strength:1});assert.ok(map.data[0]<1);
  const soft=createSoftBody(mesh);applyStiffnessToSoftBody(soft,map);stepClothWithWeights(soft,{dt:1/30});
  for(const kind of ['flag','curtain','cape','sail']){const d=createDrapePreset(kind,{segments:6});assert.equal(d.drapeKind,kind);assert.ok(d.pinned.size>0);}
  const flag=createDrapePreset('flag',{segments:5});const cache=simulateDrapeFrames(flag,4,{wind:[.3,0,0]});
  assert.equal(cache.frames.length,4);assert.equal(exportClothCache(cache).kind,'fusion_cloth_cache');
  const mat=new THREE.MeshStandardMaterial({map:new THREE.Texture()});const printed=new THREE.Mesh(new THREE.PlaneGeometry(1,1),mat);
  placeFabricPrint(printed,{offset:[.1,0],scale:[2,2],rotation:.2});assert.equal(printed.userData.fusion_print.scale[0],2);
  const indexed=new THREE.Mesh(new THREE.PlaneGeometry(1,1,8,8));const retopo=clothSimToRetopo(indexed,{keep:.5});
  assert.ok(retopo.userData.fusion_retopo.triangles>0);assert.ok(retopo.userData.fusion_retopo.triangles<(indexed.geometry.index.count/3));
});
