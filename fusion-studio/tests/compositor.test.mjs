import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCompTree,addCompNode,linkCompNodes,setColorManagement,createImageBuffer,attachAovs,liftGammaGain,
  applyToneCurve,createLut,applyLut,exportLut,importLutCube,tonemap,bloom,filmGrain,vignette,chromaticAberration,
  sharpen,denoisePass,zDepthFog,defocusDof,vectorBlur,cryptomatteMask,keyingMatte,rotoShape,stabilizeTransform,
  matchmoveCamera,processImageSequence,createPostVolume,applyPostVolume,mixAovs,evaluateCompositor,createDefaultCompTree
} from '../src/compositor.js';

test('comp tree, grading, LUT roundtrip, tonemap',()=>{
  const tree=createCompTree();const a=addCompNode(tree,'render_layers'),b=addCompNode(tree,'tonemap',{mode:'aces'});
  linkCompNodes(tree,a.id,b.id);setColorManagement(tree,{space:'ACES'});
  const img=createImageBuffer(16,16,[.5,.4,.3,1]);
  const graded=liftGammaGain(img,{gain:[1.2,1,1]});assert.ok(graded.data[0]>img.data[0]);
  assert.ok(applyToneCurve(img,[[0,0],[1,1]]).data.length===img.data.length);
  const lut=createLut(8,{contrast:1.2});const applied=applyLut(img,lut);assert.ok(applied.data[0]>=0);
  const cube=exportLut(lut);assert.ok(cube.includes('LUT_3D_SIZE'));assert.equal(importLutCube(cube).size,8);
  assert.ok(tonemap(img,{mode:'reinhard',exposure:1.5}).data[0]<=1);
});

test('effects, AOVs, keying, roto, track, sequence, volumes, eval',()=>{
  let img=createImageBuffer(32,32,[.9,.9,.2,1]);
  const depth=new Float32Array(32*32);depth.fill(5);const crypto=new Uint16Array(32*32);crypto[10]=7;
  const vector=new Float32Array(32*32*2);img=attachAovs(img,{depth,cryptomatte:crypto,vector});
  assert.ok(bloom(img,{strength:.5}).data.length);assert.ok(filmGrain(img,{amount:.1}).data.length);
  assert.ok(vignette(img,{amount:.5}).data[0]<=img.data[0]+1e-6);
  assert.ok(chromaticAberration(img).data.length);assert.ok(sharpen(img).data.length);assert.ok(denoisePass(img).data.length);
  assert.ok(zDepthFog(img,{density:.05}).data.length);assert.ok(defocusDof(img).data.length);assert.ok(vectorBlur(img).data.length);
  assert.equal(cryptomatteMask(img,7).data[10],1);assert.ok(keyingMatte(img,{key:[0,1,0],tolerance:2}).data.length);
  assert.ok(rotoShape(16,16,[[.2,.2],[.8,.2],[.5,.8]]).data.some(v=>v===1));
  assert.ok(stabilizeTransform([[0,0],[.1,0]]).translate[0]<0);
  // Honest contract: no fabricated solve -- diagnostics only.
  const mm=matchmoveCamera([[0,0],[1,0],[0,1],[1,1]]);assert.equal(mm.solved,false);assert.equal(mm.diagnostics.trackCount,4);
  const avg=processImageSequence([createImageBuffer(4,4,[1,0,0,1]),createImageBuffer(4,4,[0,0,1,1])]);assert.ok(Math.abs(avg.data[0]-.5)<1e-6);
  const vol=createPostVolume({bloom:.2,vignette:.2,grain:.05,exposure:1.1});assert.ok(applyPostVolume(img,vol).data.length);
  assert.ok(mixAovs(img,createImageBuffer(32,32,[1,0,0,1]),{opacity:.5}).data[0]>img.data[0]);
  const tree=createDefaultCompTree();const out=evaluateCompositor(tree,{beauty:img});assert.equal(out.width,32);
});
