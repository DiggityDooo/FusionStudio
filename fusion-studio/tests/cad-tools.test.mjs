import test from 'node:test';
import assert from 'node:assert/strict';
import {arcCurve,bezierCurve,extrudeSurface,revolveSurface} from '../src/nurbs.js';
import {
  joinCurves,blendCurves,filletCurves,zebraStripes,untrimSurface,surfaceFillet,
  createSketch,addSketchEntity,addSketchConstraint,solveSketch,sketchToCurves,
  createFeatureTree,addFeature,rebuildFeatureTree,
  createAssembly,addAssemblyPart,addMate,solveAssembly,
  createSheetMetal,unfoldSheetMetal,boxSolid,brepBoolean,measureExact,setTolerance,
  exportIgesCurves,exportStepCurves,importStepCartesianPoints,
  createDrawingView,addLinearDimension,addGdtCallout,createExplodedView,
  createConfigurationTable,addConfiguration,applyConfiguration,
  topologyOptimize,feaBarTruss,meshFromCadSurface
} from '../src/cad-tools.js';

test('join blend fillet zebra untrim surface fillet',()=>{
  const a=bezierCurve([[0,0,0],[1,0,0],[2,0,0],[3,0,0]]),b=bezierCurve([[3,0,0],[4,1,0],[5,1,0],[6,0,0]]);
  assert.ok(joinCurves([a,b]).points.length>4);
  assert.ok(blendCurves(a,b).points.length>4);
  const L1=bezierCurve([[0,0,0],[0,0,0],[1,0,0],[1,0,0]]),L2=bezierCurve([[1,0,0],[1,0,0],[1,1,0],[1,1,0]]);
  assert.ok(filletCurves(L1,L2,{radius:.2}).fillet.points.length);
  const cyl=revolveSurface(bezierCurve([[1,0,0],[1,0,.3],[1,0,.7],[1,0,1]]),360);
  assert.equal(zebraStripes(cyl,{stripes:4}).length,4);
  assert.equal(untrimSurface({...cyl,trimPolygon:[[0,0],[1,0],[1,1]]}).trimPolygon,undefined);
  assert.ok(surfaceFillet(extrudeSurface(a,[0,0,1]),extrudeSurface(b,[0,0,1])).points.length);
});

test('sketch constraints solve',()=>{
  const sk=createSketch();
  const p1=addSketchEntity(sk,'point',{x:0,y:0}),p2=addSketchEntity(sk,'point',{x:2,y:3});
  addSketchConstraint(sk,'horizontal',[p1.id,p2.id]);
  addSketchConstraint(sk,'distance',[p1.id,p2.id],4);
  solveSketch(sk);assert.ok(sk.solved);assert.ok(Math.abs(p1.params.y-p2.params.y)<1e-6);
  assert.ok(Math.abs(Math.hypot(p2.params.x-p1.params.x,p2.params.y-p1.params.y)-4)<1e-4);
  assert.ok(sketchToCurves(sk));
});

test('feature tree assembly sheet BREP measure',()=>{
  const curve=arcCurve(1,90);const tree=createFeatureTree();
  addFeature(tree,'extrude',{curve,depth:2});rebuildFeatureTree(tree);assert.ok(tree.lastSolids.length);
  const asm=createAssembly();const A=addAssemblyPart(asm,{name:'A'}),B=addAssemblyPart(asm,{name:'B',transform:[1,0,0,0,0,1,0,0,0,0,1,0,5,0,0,1]});
  addMate(asm,'coincident',A.id,B.id);solveAssembly(asm);assert.equal(B.transform[12],A.transform[12]);
  const sheet=createSheetMetal({length:2,bendAngle:90});assert.ok(unfoldSheetMetal(sheet).length>2);
  const bool=brepBoolean(boxSolid({xmax:1,ymax:1,zmax:1}),boxSolid({xmin:.5,ymin:.5,zmin:.5,xmax:1.5,ymax:1.5,zmax:1.5}),'subtract');
  assert.ok(bool.occupied>0&&bool.occupied<bool.res**3);
  assert.ok(measureExact(curve,{kind:'length'}).value>0);
  assert.ok(setTolerance({},{linear:1e-5}).linear===1e-5);
});

test('STEP/IGES drawings explode configs topo FEA mesh',()=>{
  const c=arcCurve(1,90);
  const iges=exportIgesCurves([c]);assert.ok(iges.includes('126'));
  const step=exportStepCurves([c]);assert.ok(importStepCartesianPoints(step).length>=c.points.length);
  const view=createDrawingView();addLinearDimension(view,{a:[0,0],b:[2,0]});addGdtCallout(view);assert.equal(view.dimensions[0].value,2);
  assert.equal(createExplodedView([{name:'a'},{name:'b'}]).transforms.length,2);
  const table=createConfigurationTable();const row=addConfiguration(table,[1,2,3],'S');
  assert.deepEqual(applyConfiguration({},table,row.id),{length:1,width:2,height:3});
  assert.ok(topologyOptimize({res:8,volFrac:.3}).occupied>0);
  assert.ok(feaBarTruss({}).maxStress>0);
  assert.ok(meshFromCadSurface(extrudeSurface(c,[0,.5,0]),8,8).positions.length);
});
