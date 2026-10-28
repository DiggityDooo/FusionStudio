import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createPaintDocument,addPaintLayer,paintStroke,compositePaint,generateProceduralTexture,smartMaskFromMesh,
  paintVertexColors,paintMaterialIds,bakeMeshMaps,setBakeCage,highToLowBake,triplanarSample,createSeamlessTile,
  buildTextureAtlas,exportEngineMaps,listMaterialLibrary,applyPaintDocToMesh,setLayerAnchor
} from '../src/texture-paint.js';

test('paint document layers, stroke, composite, anchors',()=>{
  const doc=createPaintDocument(256,{channels:['baseColor','roughness','metallic']});
  assert.equal(doc.layers.length,1);addPaintLayer(doc,{kind:'paint',name:'Detail'});
  paintStroke(doc,[.5,.5],{radius:.08,color:'#ff0000',strength:1});setLayerAnchor(doc,doc.activeLayer,'center');
  const rgba=compositePaint(doc,{channel:'baseColor'});assert.ok(rgba[rgba.length/2]>0||rgba.some((v,i)=>i%4===0&&v>.5));
});

test('procedural, smart masks, vertex/material paint, bake, atlas, export',()=>{
  for(const k of ['noise','grunge','tiles','bricks','checker'])assert.equal(generateProceduralTexture(k,128).size,128);
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(.5,8,8));
  assert.equal(smartMaskFromMesh(mesh,'ao',64).kind,'ao');
  paintVertexColors(mesh,[0,1],'#00ff00');assert.ok(mesh.geometry.attributes.color);
  const box=new THREE.Mesh(new THREE.BoxGeometry(1,1,1));paintMaterialIds(box,[0],3);assert.equal(box.userData.fusion_material_ids[0],3);
  setBakeCage(box);const bake=bakeMeshMaps(box,64,{maps:['ao','normal','curvature']});assert.ok(bake.maps.ao&&bake.maps.normal);
  const hi=new THREE.Mesh(new THREE.SphereGeometry(.5,16,16)),lo=new THREE.Mesh(new THREE.SphereGeometry(.5,4,4));
  assert.equal(highToLowBake(hi,lo,64).from,hi.uuid);
  const uv=triplanarSample([1,2,3],[0,1,0],{scale:1});assert.equal(uv.length,2);
  assert.ok(createSeamlessTile(128).seamless);
  const atlas=buildTextureAtlas([generateProceduralTexture('noise',64),generateProceduralTexture('tiles',64)]);assert.equal(atlas.rects.length,2);
  const doc=createPaintDocument(256);const maps=exportEngineMaps(doc,'gltf');assert.equal(maps.engine,'gltf');assert.ok(maps.maps.baseColor);
  applyPaintDocToMesh(mesh,doc);assert.ok(mesh.material.map);
  assert.ok(listMaterialLibrary().length>=4);
});
