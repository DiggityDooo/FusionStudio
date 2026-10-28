import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSkinLayer,addSkinLayer,removeSkinLayer,setSkinLayer,reorderSkinLayer,compositeSkinLayers,skinLayerPresets,ensureSkinStack} from '../src/skin-layers.js';

test('skin layer stack add/edit/reorder/composite',()=>{
  const root=new THREE.Group();
  const lip=createSkinLayer('makeup',{name:'Lips',opacity:.6,region:'lips'});
  const tat=createSkinLayer('tattoo',{name:'Ink',color:'#111111',opacity:.9,region:'arm_l'});
  addSkinLayer(root,lip);addSkinLayer(root,tat);
  assert.equal(ensureSkinStack(root).layers.length,2);
  setSkinLayer(root,lip.id,{opacity:.3});assert.equal(lip.opacity,.3);
  reorderSkinLayer(root,tat.id,0);assert.equal(ensureSkinStack(root).layers[0].id,tat.id);
  root.userData.fusion_creator={recipe:{appearance:{freckles:0,pores:.35}}};
  addSkinLayer(root,createSkinLayer('freckles',{opacity:.5}));
  const report=compositeSkinLayers(root);assert.ok(report.count>=2);assert.ok(report.byKind.makeup>0);
  assert.ok(root.userData.fusion_creator.recipe.appearance.freckles>0);
  removeSkinLayer(root,tat.id);assert.equal(ensureSkinStack(root).layers.length,2);
  assert.ok(skinLayerPresets().length>=5);
  assert.throws(()=>createSkinLayer('glow'),/Unknown skin layer/i);
});
