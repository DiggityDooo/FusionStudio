import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGuide,createGroom,combGuide,cutGuide,growGuide,puffGuide,smoothGuide,setGuideLength,clumpGuides,
  interpolateChildren,applyFrizz,applyCurl,applyWindGravity,setHairShading,guidesToHairCards,hairToMesh,
  optimizeGroomLod,exportGroomCache,GROOM_LIBRARY,browLashGuides
} from '../src/hair-groom.js';

test('guide create and groom brushes preserve segment length and point counts',()=>{
  const g=createGuide([[0,0,0],[0,1,0],[0,2,0]],{name:'A'});
  const groom=createGroom({guides:[g],children:2});
  combGuide(groom,g.id,[1,0,0],.5);
  assert.equal(groom.guides[0].points.length,3);
  const before=groom.guides[0].points.length;
  growGuide(groom,g.id,.1);assert.equal(groom.guides[0].points.length,before+1);
  cutGuide(groom,g.id,.5);assert.ok(groom.guides[0].points.length>=2);
  puffGuide(groom,g.id,.05);smoothGuide(groom,g.id,2);setGuideLength(groom,g.id,.8);
  assert.throws(()=>createGuide([[0,0,0]]),/2–64|2-64|points/i);
});

test('interpolation, frizz, curl, wind and shading',()=>{
  const groom=GROOM_LIBRARY.short_bob();
  const strands=interpolateChildren(groom);assert.ok(strands.length>groom.guides.length);
  applyFrizz(groom,{amount:.01,seed:42});applyCurl(groom,{turns:1,radius:.005});
  groom.wind=[1,0,0];applyWindGravity(groom,{dt:1/24});
  const shade=setHairShading(groom,{melanin:.6,root:'#111',tip:'#654'});
  assert.equal(shade.melanin,.6);
  assert.throws(()=>setHairShading(groom,{melanin:2}),/Melanin/i);
});

test('hair cards, LOD, export cache, brow/lash/beard libraries',()=>{
  const groom=GROOM_LIBRARY.long_straight();
  const geo=guidesToHairCards(groom,{width:.01});assert.ok(geo.attributes.position.count>0);
  const mesh=hairToMesh(groom);assert.ok(mesh.isMesh);
  const n=groom.guides.length;optimizeGroomLod(groom,{keep:.5});assert.ok(groom.guides.length<=n);
  const cache=exportGroomCache(groom);assert.equal(cache.kind,'fusion_groom_cache');assert.ok(cache.strands.length);
  for(const kind of ['eyebrow','eyelash','beard']){const g=browLashGuides(kind);assert.ok(g.guides.length>=1);}
  const a=createGuide([[0,0,0],[0,1,0]]),b=createGuide([[.02,0,0],[.02,1,0]]);
  const clump=createGroom({guides:[a,b]});clumpGuides(clump,{centerId:a.id,radius:.1,strength:.5});
  assert.ok(Math.abs(clump.guides[1].points[1][0]-clump.guides[0].points[1][0])<0.02);
});
