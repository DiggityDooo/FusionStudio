import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createCharacter,POSES} from '../src/character.js';
import {captureDrapeInputs,liveTshirtPattern} from '../src/hybrid.js';
import {buildDrapeInput,previewDrapeSettings} from '../src/drape-preparation.js';
import {surfacePreparationReply} from '../src/surface-preparation.js';

test('worker-safe drape preparation preserves pre-refactor legacy, dense, transform and material reference inputs',()=>{
 const references={legacy:'0b3c62eb2226b7f5bdf3fda21d97ffcff1bdab5f507d14c9a34cab7384aef3f1',detailed:'f681a0e5fac2293a7b77981fb516d44f951803629ab092ceb72bfd12d66a95e6',transformed:'da81d5ef17aec29f5824a234f2ca2ee2cf982f25c89ae09967e4efc4eac7cf68',material:'ba4f86139aa659b0e34211a75eee5b442325ea7af8a832c40fc130436de651d8',dense:'3db705fcd1382b67faa6e6682efbacd6981a4df0877b66f6a8392c3645b6713b'}; // refreshed for the offline execution-budget field
 for(const [name,expected] of Object.entries(references)){
  const character=createCharacter({},POSES['T pose']),base=name==='legacy'?JSON.parse(fs.readFileSync(new URL('./fixtures/live-tshirt-v1.json',import.meta.url))):liveTshirtPattern(),settings={steps:5,iterations:6};
  if(name==='dense')base.particleDistance=.025;
  if(name==='transformed'){character.position.set(.2,.1,-.3);character.rotation.set(.1,.2,-.1);character.scale.multiplyScalar(1.1);}
  if(name==='material')settings.fabricResponse={};
  const captured=captureDrapeInputs(base,character,settings),input={base,captured,settings},before=JSON.stringify(input),result=buildDrapeInput(base,captured,settings);
  assert.equal(createHash('sha256').update(JSON.stringify(result)).digest('hex'),expected,name+' changes reviewed preparation output');assert.equal(JSON.stringify(input),before);
  if(name==='dense')assert.ok(result.data.faces.length>=6000);
 }
});

test('drape captures retain body dimensions independently of later authoring changes and malformed worker input reports an error',()=>{
 const character=createCharacter({},POSES['T pose']),base=liveTshirtPattern(),captured=captureDrapeInputs(base,character),height=captured.body.height;
 character.userData.character.height=2;character.position.x=7;assert.equal(captured.body.height,height);assert.notEqual(captured.world[12],character.position.x);
 const context={projectId:'p',objectId:'c',revision:1,requestId:2,inputHash:'a'.repeat(64)},reply=surfacePreparationReply({version:1,action:'drapeInput',context,input:{base,captured:{...captured,world:[NaN]},settings:{}}});
 assert.match(reply.error,/Invalid captured garment/);assert.deepEqual(reply.context,context);assert.equal(reply.result,undefined);
});

test('the native work limit is reported before solving and explicitly reducing iterations retains source panels',()=>{
 for(const input of [{steps:0},{steps:241},{iterations:0},{iterations:25},{iterations:6.5},{steps:NaN}])assert.throws(()=>previewDrapeSettings(input),/Drape settings require/);
 const character=createCharacter({height:2.1},POSES['T pose']),base=liveTshirtPattern(),captured=captureDrapeInputs(base,character),before=JSON.stringify({base,captured});
 assert.throws(()=>buildDrapeInput(base,captured),/preview work limit.*Drape settings/);
 const result=buildDrapeInput(base,captured,{steps:160,iterations:6});assert.equal(result.request.steps,160);assert.equal(result.request.iterations,6);assert.equal(result.request.executionBudget,'offline','linked drapes are explicit jobs and must use the 120 s offline budget, not the 30 s interactive timeout');assert.equal(JSON.stringify({base,captured}),before);assert.deepEqual(result.doc.seams,base.seams);assert.ok(result.data.faces.length>3000);
});
