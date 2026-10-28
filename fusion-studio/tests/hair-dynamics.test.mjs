import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  GROOM_LIBRARY,applyWave,applyFlyaways,applyBraid,collideGuides,simulateHairDynamics,
  createFurOnMesh,createHairMask,paintHairMask,applyHairMask,generateStrandField,runGroomNodes,createGuide,createGroom
} from '../src/hair-groom.js';

test('wave, braid, flyaways alter tips',()=>{
  const groom=GROOM_LIBRARY.long_straight();
  const tipBefore=groom.guides[0].points.at(-1)[0];
  applyWave(groom,{amplitude:.02,frequency:2});applyBraid(groom,{turns:3,radius:.005});applyFlyaways(groom,{count:2,amount:.03,seed:9});
  assert.notEqual(groom.guides[0].points.at(-1)[0],tipBefore);
});

test('sphere collision and verlet dynamics keep roots pinned',()=>{
  const g=createGuide([[0,1,0],[0,.5,0],[0,0,0]]);
  const groom=createGroom({guides:[g]});
  const root=[...groom.guides[0].points[0]];
  collideGuides(groom,[{center:[0,0,0],radius:.3}]);
  assert.ok(Math.hypot(...groom.guides[0].points.at(-1))>=.3-1e-6);
  groom.wind=[2,0,0];simulateHairDynamics(groom,{steps:6,dt:1/48,colliders:[{center:[0,.2,0],radius:.15}]});
  assert.deepEqual(groom.guides[0].points[0],root);
});

test('fur from mesh, strand fields, mask paint, node graph',()=>{
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(.2,8,8));
  const fur=createFurOnMesh(mesh,{density:20,length:.03});assert.ok(fur.guides.length>=8);
  for(const kind of ['grass','feather','moss']){const f=generateStrandField(kind,{count:10,area:.1});assert.equal(f.guides.length,10);}
  const mask=createHairMask(32,32,1);paintHairMask(mask,.5,.5,{radius:.2,value:0,strength:1});
  assert.ok(mask.data[16*32+16]<.5);
  const groom=GROOM_LIBRARY.short_bob();
  for(const g of groom.guides)g.uv=[.5,.5];
  applyHairMask(groom,mask,{threshold:.5,mode:'cull'});
  assert.ok(groom.guides.length<3);
  const g2=GROOM_LIBRARY.short_bob();
  runGroomNodes(g2,[{op:'frizz',params:{amount:.005}},{op:'wave',params:{amplitude:.008,frequency:2}},{op:'lod',params:{keep:1}}]);
  assert.equal(g2.userData.nodes.length,3);
  assert.throws(()=>runGroomNodes(g2,[{op:'nope'}]),/Unknown groom node/i);
});
