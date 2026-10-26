import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createCharacter,POSES} from '../src/character.js';
import {captureDrapeInputs,liveTshirtPattern} from '../src/hybrid.js';
import {buildDrapeInput,previewDrapeSettings} from '../src/drape-preparation.js';
import {surfacePreparationReply} from '../src/surface-preparation.js';

test('worker-safe drape preparation preserves pre-refactor legacy, dense, transform and material reference inputs',()=>{
 const references={legacy:'a4e149ead2f7b7e234236514590f198b4af411b6f21f3b733284b949f572c6c2',detailed:'401c0071ba2735ca7e3417ef6d1d0a353b49adecee35c7840fae4f1df76175fb',transformed:'5412babd4bfb39175c402a228dc0242a6ea816c4c0132230df48b877be93c728',material:'7c4cdf7fbaa9ebda09298e49630acc40de3d531f69bbcbf106778efad4eef184',dense:'ab84142f6f03f828c4f0f2c49f6fa5f58853bd5b45684b811f55e9ea05eb07a8'};
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
 const result=buildDrapeInput(base,captured,{steps:160,iterations:6});assert.equal(result.request.steps,160);assert.equal(result.request.iterations,6);assert.equal(JSON.stringify({base,captured}),before);assert.deepEqual(result.doc.seams,base.seams);assert.ok(result.data.faces.length>3000);
});
