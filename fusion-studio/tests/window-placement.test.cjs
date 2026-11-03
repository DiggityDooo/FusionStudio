const test=require('node:test'),assert=require('node:assert/strict');
const {placementForDisplay}=require('../electron/window-placement.cjs');
const primary={id:1,workArea:{x:0,y:0,width:2560,height:1400}};
test('secondary preference centers Fusion inside a real non-primary work area',()=>{
 for(const area of [{x:2560,y:0,width:1920,height:1040},{x:-1920,y:-200,width:1920,height:1080},{x:0,y:-1200,width:1200,height:1160}]){
  const target={id:2,workArea:area},b=placementForDisplay([primary,target],1,{display:'secondary'});
  assert.ok(b.x>=area.x&&b.y>=area.y&&b.x+b.width<=area.x+area.width&&b.y+b.height<=area.y+area.height);
  assert.ok(Math.abs(b.x+b.width/2-(area.x+area.width/2))<=.5);assert.ok(Math.abs(b.y+b.height/2-(area.y+area.height/2))<=.5);
  assert.ok(b.minWidth<=b.width&&b.minHeight<=b.height);
 }
});
test('missing secondary display, absent preference and invalid work areas retain default placement',()=>{
 assert.deepEqual(placementForDisplay([primary],1,{display:'secondary'}),{});
 assert.deepEqual(placementForDisplay([primary,{id:2,workArea:{x:0,y:0,width:0,height:1000}}],1,{display:'secondary'}),{});
 assert.deepEqual(placementForDisplay([primary],1,null),{});
});
