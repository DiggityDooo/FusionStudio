import test from 'node:test';
import assert from 'node:assert/strict';
import {sectorIndex,DEAD_ZONE} from '../src/radial-menu.js';

test('pie sectors start at the top and run clockwise with a central dead zone',()=>{
  assert.equal(sectorIndex(0,-100,4),0);assert.equal(sectorIndex(100,0,4),1);assert.equal(sectorIndex(0,100,4),2);assert.equal(sectorIndex(-100,0,4),3);
  assert.equal(sectorIndex(70,-70,8),1);assert.equal(sectorIndex(-70,-70,8),7);assert.equal(sectorIndex(-5,-100,8),0);
  assert.equal(sectorIndex(DEAD_ZONE-1,0,4),-1);assert.equal(sectorIndex(100,0,0),-1);
  assert.equal(sectorIndex(100,-1,2),0);assert.equal(sectorIndex(-100,1,2),1);
});
