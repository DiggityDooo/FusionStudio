import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  markSeams,stitchSeams,uvRelax,uvStraighten,uvAlignOrient,createUdimLayout,assignUdimTile,
  transferUVs,createAtlasTrim,packAtlas,liveUnwrapState,proceduralUv,uvDistortionReport,uvSets
} from '../src/uv-tools.js';

function plane(){return new THREE.PlaneGeometry(2,2,2,2);}

test('seams stitch relax straighten orient',()=>{
  const g=plane();
  assert.ok(markSeams(g,['0_1','1_2']).length===2);
  ensureSeed(g);
  stitchSeams(g,{pairs:[[0,1]]});
  assert.equal(g.attributes.uv.getX(0),g.attributes.uv.getX(1));
  uvRelax(g,{iterations:3,pin:new Set([0])});
  uvStraighten(g,{axis:'u',indices:[2,3]});
  assert.equal(g.attributes.uv.getX(2),g.attributes.uv.getX(3));
  uvAlignOrient(g,{rotateDeg:90,align:'min'});
  assert.ok(g.attributes.uv.getX(0)>=0);
});

test('UDIM transfer atlas live procedural distortion sets',()=>{
  const g=plane(),g2=plane();ensureSeed(g);ensureSeed(g2);
  const layout=createUdimLayout({tiles:4});assert.equal(layout.tiles[0].udim,1001);
  assignUdimTile(g,{udim:1002});assert.equal(g.userData.udim,1002);
  assert.ok(transferUVs(g,g2)>=4);
  const atlas=packAtlas(createAtlasTrim({size:512,padding:2}),[{id:'a',w:64,h:64},{id:'b',w:32,h:32}]);
  assert.equal(atlas.slots.length,2);
  const mesh=new THREE.Mesh(g);assert.ok(liveUnwrapState(mesh).enabled);
  assert.equal(proceduralUv(g,{mode:'triplanar'}).mode,'triplanar');
  assert.ok(uvDistortionReport(g).coverage>=0);
  assert.ok(uvSets(g).includes('uv'));
});

function ensureSeed(g){
  const uv=g.attributes.uv||new THREE.BufferAttribute(new Float32Array(g.attributes.position.count*2),2);
  if(!g.attributes.uv){for(let i=0;i<uv.count;i++)uv.setXY(i,i*.1,(i%3)*.1);g.setAttribute('uv',uv);}
}
