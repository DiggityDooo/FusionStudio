import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTIONS,PRESETS,NAVIGATION,chord,resolveKey,bindings,rebind,unbind,navigationAction,navigationScheme,serializeKeymap,parseKeymap,validChord,describeChord,normalize} from '../src/keymap.js';
import {orbitButton} from '../src/navigation.js';

const key=(code,mods={},key='')=>({code,key,...mods});
const press=(button,mods={})=>({button,...mods});

test('chords use physical codes, normalize Meta to Ctrl and ignore bare modifiers',()=>{
  assert.equal(chord(key('KeyG')),'g');
  assert.equal(chord(key('KeyZ',{ctrlKey:true,shiftKey:true})),'ctrl+shift+z');
  assert.equal(chord(key('KeyZ',{metaKey:true})),'ctrl+z');
  assert.equal(chord(key('Numpad1',{},'End')),'numpad1');
  assert.equal(chord(key('NumpadDecimal')),'numpad.');
  assert.equal(chord(key('Period',{shiftKey:true},'>')),'shift+.');
  assert.equal(chord(key('Space',{},' ')),'space');
  assert.equal(chord(key('F12',{},'F12')),'f12');
  assert.equal(chord(key('ShiftLeft',{shiftKey:true},'Shift')),null);
  assert.equal(describeChord('ctrl+shift+z'),'Ctrl Shift Z');assert.equal(describeChord('numpad.'),'Numpad .');assert.equal(describeChord('alt+lmb'),'Alt LMB');
});

test('every preset binds only known actions with valid chords',()=>{
  for(const [id,preset] of Object.entries(PRESETS)){
    assert.ok(preset.navigation in NAVIGATION,id);
    for(const [c,a] of Object.entries(preset.keys)){assert.ok(validChord(c),`${id}: ${c}`);assert.ok(ACTIONS[a],`${id}: ${a}`);}
  }
});

test('Fusion preset keeps the original application shortcuts',()=>{
  const s={preset:'fusion'},expect={'KeyG':'transform.translate','KeyR':'transform.rotate','KeyS':'transform.scale','KeyF':'view.frame_selected','Tab':'mode.toggle_edit','KeyE':'mesh.extrude','KeyI':'timeline.insert_key','Space':'timeline.play','Delete':'object.delete','F3':'app.search','F9':'history.adjust_last'};
  for(const [code,action] of Object.entries(expect))assert.equal(resolveKey(s,key(code,{},code==='Space'?' ':code)),action,code);
  assert.equal(resolveKey(s,key('KeyS',{ctrlKey:true})),'file.save');assert.equal(resolveKey(s,key('KeyZ',{ctrlKey:true})),'history.undo');
  assert.equal(resolveKey(s,key('KeyZ',{ctrlKey:true,shiftKey:true})),'history.redo');assert.equal(resolveKey(s,key('KeyY',{ctrlKey:true})),'history.redo');
  assert.equal(resolveKey(s,key('KeyD',{ctrlKey:true})),'object.duplicate');assert.equal(resolveKey(s,key('Space',{ctrlKey:true},' ')),'view.maximize');
});

test('vendor presets follow the reference transform keys (B5)',()=>{
  const move={blender:'KeyG',maya:'KeyW',max:'KeyW',c4d:'KeyE',game:'KeyW',industry:'KeyW',houdini:'KeyT',zbrush:'KeyW'};
  for(const [preset,code] of Object.entries(move))assert.equal(resolveKey({preset},key(code)),'transform.translate',preset);
  assert.equal(resolveKey({preset:'maya'},key('KeyE')),'transform.rotate');assert.equal(resolveKey({preset:'maya'},key('KeyR')),'transform.scale');
  assert.equal(resolveKey({preset:'c4d'},key('KeyT')),'transform.scale');
  assert.equal(resolveKey({preset:'blender'},key('KeyD',{shiftKey:true})),'object.duplicate');
  assert.equal(resolveKey({preset:'blender'},key('Numpad7')),'view.top');assert.equal(resolveKey({preset:'blender'},key('Numpad7',{ctrlKey:true})),'view.bottom');
  assert.equal(resolveKey({preset:'max'},key('KeyP')),'view.perspective');assert.equal(resolveKey({preset:'max'},key('KeyZ')),'view.frame_selected');
  assert.equal(resolveKey({preset:'c4d'},key('F2',{},'F2')),'view.top');assert.equal(resolveKey({preset:'c4d'},key('KeyC',{shiftKey:true})),'app.search');
  assert.equal(resolveKey({preset:'maya'},key('F9',{},'F9')),'mesh.vertex');assert.equal(resolveKey({preset:'max'},key('Digit4')),'mesh.face');
  assert.equal(resolveKey({preset:'game'},key('End',{},'End')),'object.drop_to_floor');
});

test('rebinding reports conflicts, unbinding masks preset keys and reset is empty overrides',()=>{
  let {settings,conflict}=rebind({preset:'blender'},'view.local','h');
  assert.equal(conflict,'object.hide');assert.equal(bindings(settings).h,'view.local');assert.equal(bindings(settings)['numpad/'],'view.local');
  ({settings,conflict}=rebind(settings,'view.local','numpad/','h'));assert.equal(conflict,null);assert.equal(bindings(settings).h,undefined);
  settings=unbind(settings,'g');assert.equal(resolveKey(settings,key('KeyG')),null);
  ({settings}=rebind(settings,'transform.translate','g'));assert.deepEqual(settings.overrides,{h:null});
  assert.throws(()=>rebind({},'transform.translate','escape'),/cannot be bound/);assert.throws(()=>rebind({},'nope','g'),/Unknown action/);
});

test('keymaps export and import losslessly and reject malformed files',()=>{
  const {settings}=rebind({preset:'maya',navigation:'blender',invertZoom:true},'render.image','f12');
  assert.deepEqual(parseKeymap(serializeKeymap(settings)),normalize(settings));
  assert.throws(()=>parseKeymap('{'),/not valid JSON/);assert.throws(()=>parseKeymap('{"format":"x"}'),/Not a Fusion Studio keymap/);
  assert.throws(()=>parseKeymap(JSON.stringify({format:'fusion-keymap',version:1,preset:'nope'})),/Unknown keymap preset/);
  assert.throws(()=>parseKeymap(JSON.stringify({format:'fusion-keymap',version:1,overrides:{'ctrl+':'history.undo'}})),/Invalid key chord/);
});

test('navigation schemes match the reference table (B4)',()=>{
  assert.equal(navigationAction({preset:'fusion'},press(0)),undefined);
  const cases=[
    ['blender',press(1),'orbit'],['blender',press(1,{shiftKey:true}),'pan'],['blender',press(1,{ctrlKey:true}),'zoom'],['blender',press(0),null],
    ['maya',press(0,{altKey:true}),'orbit'],['maya',press(1,{altKey:true}),'pan'],['maya',press(2,{altKey:true}),'zoom'],['maya',press(0),null],
    ['max',press(1,{altKey:true}),'orbit'],['max',press(1),'pan'],['max',press(1,{ctrlKey:true,altKey:true}),'zoom'],
    ['c4d',press(0,{altKey:true}),'orbit'],['zbrush',press(0),'orbit'],['zbrush',press(0,{altKey:true}),'pan'],
    ['game',press(2),'fly'],['game',press(0,{altKey:true}),'orbit'],['industry',press(0,{altKey:true}),'orbit'],['substance',press(1,{altKey:true}),'pan']
  ];
  for(const [preset,e,action] of cases)assert.equal(navigationAction({preset},e),action,`${preset} ${JSON.stringify(e)}`);
  assert.equal(navigationAction({preset:'houdini'},press(0),new Set(['space'])),'orbit');assert.equal(navigationAction({preset:'houdini'},press(2),new Set(['space'])),'zoom');
  assert.equal(navigationAction({preset:'c4d'},press(0),new Set(['1'])),'pan');assert.equal(navigationAction({preset:'c4d'},press(0),new Set(['2'])),'zoom');
  assert.equal(navigationScheme({preset:'maya',navigation:'blender'}),'blender');
  assert.equal(navigationAction({preset:'blender',emulate3:true},press(0,{altKey:true})),'orbit');
  assert.equal(navigationAction({preset:'blender',emulate3:true},press(0,{altKey:true,shiftKey:true})),'pan');
});

test('Orbit Controls buttons compensate for its built-in Shift/Ctrl swap',()=>{
  // three.js MOUSE: ROTATE 0, DOLLY 1, PAN 2; Shift/Ctrl/Meta swaps ROTATE and PAN inside OrbitControls.
  assert.equal(orbitButton('orbit',{}),0);assert.equal(orbitButton('pan',{}),2);assert.equal(orbitButton('zoom',{}),1);assert.equal(orbitButton(null,{}),-1);
  assert.equal(orbitButton('pan',{shiftKey:true}),0);assert.equal(orbitButton('orbit',{ctrlKey:true}),2);assert.equal(orbitButton('zoom',{ctrlKey:true}),1);
});
