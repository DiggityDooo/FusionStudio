import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import * as THREE from 'three';
import {Editor} from '../src/editor.js';
import {createDetailedCharacter,changeCreator,creatorPositions} from '../src/character-creator.js';
import {applyExpressionPreset} from '../src/character-lod.js';
import {deformationTransaction} from '../src/deformation-ui.js';

const definition=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../public/characters/makehuman-v1.json.gz',import.meta.url))));
function creator(){const root=createDetailedCharacter(definition),recipe=structuredClone(root.userData.fusion_creator.recipe);recipe.shapes.push({id:'facial-smile',name:'mouthSmile',value:0,min:0,max:1,deltas:[100,.002,.001,0]},{id:'body-untouched',name:'Body adjustment',value:.4,min:0,max:1,deltas:[200,.001,0,0]});changeCreator(root,recipe);return root;}
function editor(root){const e=Object.create(Editor.prototype);Object.assign(e,{root:new THREE.Group(),scene:new THREE.Scene(),history:[],historyAt:-1,change(){},select(node){this.selected=node;},wire(){},meshTools:{setMode(){}},timeline:{playing:false,frame:1,reset(){}}});e.scene.add(e.root);e.root.add(root);e.select(root);e.commit();return e;}

test('named custom expressions evaluate a detailed creator and Neutral restores body/recipe without losing unrelated shapes',()=>{
 const c=creator(),source=JSON.stringify(definition.source),before=Array.from(creatorPositions(c)),shape=c.userData.fusion_creator.recipe.shapes[1];
 assert.equal(c.getObjectByName('Body').geometry.index.count/3,26756);assert.equal(definition.source.positions.length/3,19158);
 applyExpressionPreset(c,'smile',{weight:.65});assert.equal(c.userData.fusion_creator.recipe.shapes[0].value,.65);assert.notDeepEqual(Array.from(creatorPositions(c)),before);
 applyExpressionPreset(c,'neutral');assert.equal(c.userData.fusion_creator.recipe.shapes[0].value,0);assert.deepEqual(c.userData.fusion_creator.recipe.shapes[1],shape);assert.deepEqual(Array.from(creatorPositions(c)),before);assert.equal(JSON.stringify(definition.source),source);
});

test('failed and cancelled dependent expression updates restore the detailed character and history',async()=>{
 for(const mode of ['failure','cancel']){
  const c=creator(),e=editor(c),before=JSON.stringify(e.serialize()),cursor=e.journal.cursor,controller=new AbortController();
  await assert.rejects(deformationTransaction(e,c.uuid,root=>applyExpressionPreset(root,'smile'),{signal:controller.signal,afterChange:()=>{if(mode==='failure')throw Error('Injected attachment failure');controller.abort();}}),/Injected attachment failure|cancelled/);
  assert.equal(e.journal.cursor,cursor);assert.equal(JSON.stringify(e.serialize()),before);assert.equal(e.batching,false);
 }
});
