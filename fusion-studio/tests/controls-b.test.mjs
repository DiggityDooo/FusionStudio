import test from 'node:test';
import assert from 'node:assert/strict';
import {matchB3Layout,ledgerControlCoverage,listDccLayouts,actionBound,countRegisteredActions,B6_MESH_ACTIONS} from '../src/controls-b.js';
import {ACTIONS,PRESETS,resolveKey,chord} from '../src/keymap.js';

test('B3 layout catalog maps DCC strings',()=>{
  assert.equal(matchB3Layout('B3 **Maya** shelf').vendor,'Maya');
  assert.ok(matchB3Layout('B3 Timeline along the bottom').regions.includes('timeline'));
  assert.ok(listDccLayouts().length>=10);
});

test('B6 mesh actions bound in blender preset',()=>{
  assert.ok(actionBound('blender','mesh.bevel'));
  assert.ok(actionBound('blender','mesh.inset'));
  assert.ok(actionBound('blender','mesh.knife'));
  assert.equal(B6_MESH_ACTIONS['B6 Bevel'],'mesh.bevel');
  assert.ok(countRegisteredActions()>=Object.keys(ACTIONS).length-1);
});

test('ledger coverage marks Part B open items partial',()=>{
  const c=ledgerControlCoverage('B3 **Outliner** (top right)');
  assert.ok(c?.partial);
  const b6=ledgerControlCoverage('B6 Bevel');
  assert.ok(b6?.partial);
  const b1=ledgerControlCoverage('B1 Copy / Paste / Cut');
  assert.ok(b1?.partial);
});

test('new edit and sculpt chords resolve',()=>{
  assert.equal(resolveKey({preset:'blender'},{code:'KeyB',ctrlKey:true,key:'b'}),'mesh.bevel');
  assert.equal(resolveKey({preset:'fusion'},{code:'KeyI',key:'i'}),'timeline.insert_key');
});

test('every preset still binds only known actions',()=>{
  for(const [id,preset] of Object.entries(PRESETS))
    for(const [c,a] of Object.entries(preset.keys))assert.ok(ACTIONS[a],`${id}:${c}->${a}`);
});
