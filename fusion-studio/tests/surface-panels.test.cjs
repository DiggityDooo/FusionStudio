const test=require('node:test'),assert=require('node:assert/strict');
const {validateSurfacePanels,validateSurfacePanelResult}=require('../electron/surface-panels.cjs');
const fixture=()=>({positions:[[0,0,0],[1,0,0],[0,1,0]],faces:[[0,1,2]],grainCoordinates:[[0,0],[1,0],[0,1]],panels:[{id:'front',start:0,count:1}]});
test('surface-panel input keeps bounded numeric data and rejects unsupported execution/settings',()=>{
 const p=validateSurfacePanels({...fixture(),script:'ignored',output:'C:/ignored'});assert.equal(p.method,'MINIMUM_STRETCH');assert.equal(p.iterations,100);assert.equal(p.script,undefined);assert.equal(p.output,undefined);assert.equal(p.body,null);
 for(const extra of [{method:'exec'},{iterations:501},{offset:-1},{positions:[[Infinity,0,0],[1,0,0],[0,1,0]]},{grainCoordinates:[]},{faces:[[0,0,1]]},{body:{positions:[[0,0,0]],faces:[[0,1,2]]}}])assert.throws(()=>validateSurfacePanels({...fixture(),...extra}));
});
test('panel ownership covers all source faces/vertices and keeps panel cuts split',()=>{
 assert.throws(()=>validateSurfacePanels({...fixture(),panels:[{id:'a',start:1,count:1}]}),/ranges/);assert.throws(()=>validateSurfacePanels({...fixture(),positions:[...fixture().positions,[1,1,0]],grainCoordinates:[...fixture().grainCoordinates,[1,1]]}),/Every surface vertex/);
 assert.throws(()=>validateSurfacePanels({...fixture(),positions:[...fixture().positions,[1,1,0]],grainCoordinates:[...fixture().grainCoordinates,[1,1]],faces:[[0,1,2],[1,3,2]],panels:[{id:'a',start:0,count:1},{id:'b',start:1,count:1}]}),/Split shared panel/);
});
test('output validation rejects UV flips, splits, wrong settings, malformed coordinates and area loss',()=>{
 const input=validateSurfacePanels(fixture()),output={version:1,positions:input.positions,uvs:input.grainCoordinates,method:input.method,iterations:input.iterations,milliseconds:2,blender:'test',panels:[{id:'front',vertices:3,triangles:1,area3d:.5,area2d:.5,maximumUvSplit:0,flippedTriangles:0}]};assert.equal(validateSurfacePanelResult(output,input),output);
 for(const patch of [{flippedTriangles:1},{maximumUvSplit:.1},{area2d:.2},{triangles:2}])assert.throws(()=>validateSurfacePanelResult({...output,panels:[{...output.panels[0],...patch}]},input),/UV splits, flips or area loss/);
 assert.throws(()=>validateSurfacePanelResult({...output,uvs:[[NaN,0],[1,0],[0,1]]},input),/invalid geometry/);assert.throws(()=>validateSurfacePanelResult({...output,method:'CONFORMAL'},input),/invalid geometry/);
});
