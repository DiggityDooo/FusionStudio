import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createArmature} from '../src/armature.js';
import {generateCharacterLods,applyBoneScale,applyExpressionPreset,EXPRESSION_PRESETS,listBaseMeshes} from '../src/character-lod.js';

function skinnedBody(){
  const root=createArmature('biped');
  const geo=new THREE.BoxGeometry(.4,1.6,.3,4,8,2);
  const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial());
  mesh.name='Body';
  mesh.morphTargetDictionary={mouthSmile:0,cheekRaise:1,mouthFrown:2,browDown:3,browUp:4,eyeWide:5,mouthOpen:6,eyeBlink_L:7,eyeBlink_R:8};
  mesh.morphTargetInfluences=new Array(9).fill(0);
  root.add(mesh);return root;
}

test('generateCharacterLods stride-samples mesh and records metadata',()=>{
  const root=skinnedBody();
  const lods=generateCharacterLods(root,{levels:[1,.5,.25]});
  assert.equal(lods.length,1);assert.equal(lods[0].levels.length,3);
  assert.ok(lods[0].levels[0].triangles>=lods[0].levels[2].triangles);
  assert.equal(root.userData.fusion_lods.parts[0].levels.length,3);
  assert.throws(()=>generateCharacterLods(root,{levels:[0]}),/LOD/i);
});

test('applyBoneScale and expression presets',()=>{
  const root=skinnedBody();
  const n=applyBoneScale(root,{UpperArm_L:1.2,Head:1.1});assert.equal(n,2);
  assert.equal(root.getObjectByName('UpperArm_L').scale.x,1.2);
  assert.throws(()=>applyBoneScale(root,{Hips:5}),/0\.1–3|0.1-3/i);
  const applied=applyExpressionPreset(root,'smile',{weight:1});assert.ok(applied>=1);
  const body=root.getObjectByName('Body');
  assert.equal(body.morphTargetInfluences[body.morphTargetDictionary.mouthSmile],1);
  applyExpressionPreset(root,'neutral');assert.equal(root.userData.fusion_expression.name,'neutral');assert.deepEqual(body.morphTargetInfluences,new Array(9).fill(0));
  assert.ok(EXPRESSION_PRESETS.surprise);assert.ok(listBaseMeshes().length>=2);
  assert.throws(()=>applyExpressionPreset(root,'nope'),/Unknown expression/i);
});

test('expression replacement resets only facial preset controls, reports missing bindings and rejects unsupported presets',()=>{
 const root=skinnedBody(),mesh=root.getObjectByName('Body');mesh.morphTargetDictionary.bodySize=9;mesh.morphTargetInfluences.push(.73);
 applyExpressionPreset(root,'smile');applyExpressionPreset(root,'frown',{weight:.5});assert.deepEqual(mesh.morphTargetInfluences,[0,0,.5,.35,0,0,0,0,0,.73]);applyExpressionPreset(root,'neutral');assert.equal(mesh.morphTargetInfluences[9],.73);
 const partial=new THREE.Group(),part=new THREE.Mesh();part.morphTargetDictionary={mouthSmile:0};part.morphTargetInfluences=[0];partial.add(part);applyExpressionPreset(partial,'smile');assert.deepEqual(partial.userData.fusion_expression.unsupported,['cheekRaise']);
 const before=structuredClone(partial.userData);assert.throws(()=>applyExpressionPreset(partial,'blink'),/no compatible/);assert.equal(part.morphTargetInfluences[0],1);assert.deepEqual(partial.userData,before);
});

test('expression channels use authored neutral defaults and validate all requested ranges before mutation',()=>{
 const root=skinnedBody(),mesh=root.getObjectByName('Body');root.userData.fusion_deformation={version:1,channels:[{id:'mouthSmile',default:.1,value:.2,min:0,max:1},{id:'cheekRaise',default:.05,value:.3,min:0,max:.5}],morphs:[],formulas:[],correctives:[]};
 const before=structuredClone(root.userData.fusion_deformation);assert.throws(()=>applyExpressionPreset(root,'smile'),/outside its supported range/);assert.deepEqual(root.userData.fusion_deformation,before);assert.deepEqual(mesh.morphTargetInfluences,new Array(9).fill(0));
 applyExpressionPreset(root,'smile',{weight:.5});assert.deepEqual(root.userData.fusion_deformation.channels.map(c=>c.value),[.5,.3]);applyExpressionPreset(root,'neutral');assert.deepEqual(root.userData.fusion_deformation.channels.map(c=>c.value),[.1,.05]);
});
