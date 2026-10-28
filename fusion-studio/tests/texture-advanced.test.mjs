import test from 'node:test';
import assert from 'node:assert/strict';
import {createSubstanceGraph,evaluateSubstanceGraph,textureStitch,photoToMaterial,virtualTextureMips,projectionCloneStroke} from '../src/texture-advanced.js';

test('substance graph evaluate',()=>{
  const g=createSubstanceGraph({});assert.ok(g.nodes.length>=3&&g.edges.length);
  const out=evaluateSubstanceGraph(g,{size:32});assert.equal(out.pixels.length,32*32*4);
});

test('stitch photo vt clone',()=>{
  assert.ok(textureStitch(['a','b']).ops.includes('delight'));
  assert.ok(photoToMaterial(['p1','p2']).generated.length>=2);
  const vt=virtualTextureMips({size:256,levels:5});assert.equal(vt.mips.length,5);
  assert.ok(projectionCloneStroke({size:128}).kind==='clone_stroke');
});

test('texture graph follows links, parameters and independent blend/levels reference values',()=>{
  const graph={version:1,nodes:[{id:'out',type:'output',params:{channel:'roughness'}},{id:'white',type:'constant',params:{value:1}},{id:'levels',type:'levels',params:{gamma:2}},{id:'mix',type:'blend',params:{opacity:.25}},{id:'black',type:'constant',params:{value:0}}],edges:[{from:'black',to:'mix',toSocket:'a'},{from:'white',to:'mix',toSocket:'b'},{from:'mix',to:'levels'},{from:'levels',to:'out'}]};
  const before=JSON.stringify(graph),result=evaluateSubstanceGraph(graph,{size:2});
  // (0 * .75 + 1 * .25)^(1/2) = .5, independently of declaration order.
  assert.deepEqual([...result.pixels],[128,128,128,255,128,128,128,255,128,128,128,255,128,128,128,255]);
  assert.equal(result.colorSpace,'linear');assert.equal(JSON.stringify(graph),before);
  graph.nodes.find(n=>n.id==='mix').params.opacity=1;assert.equal(evaluateSubstanceGraph(graph,{size:2}).pixels[0],255);
});

test('noise is deterministic, responds to seeds and differs from a gradient',()=>{
  const noise=createSubstanceGraph({nodes:[{type:'noise',params:{scale:3}}],seed:42}),a=evaluateSubstanceGraph(noise,{size:8});
  assert.deepEqual(evaluateSubstanceGraph(noise,{size:8}).pixels,a.pixels);
  noise.seed=43;assert.notDeepEqual(evaluateSubstanceGraph(noise,{size:8}).pixels,a.pixels);
  const gradient=createSubstanceGraph({nodes:[{type:'gradient',params:{axis:'x'}}]});assert.notDeepEqual(evaluateSubstanceGraph(gradient,{size:8}).pixels,a.pixels);
  const colors=createSubstanceGraph({nodes:[{type:'color',params:{color:'#ff0080'}}]});assert.deepEqual([...evaluateSubstanceGraph(colors,{size:1}).pixels],[255,0,128,255]);
});

test('graph blending retains straight-alpha color over a transparent source',()=>{
  const g=createSubstanceGraph({nodes:[{id:'back',type:'color',params:{color:[0,0,1,0]}},{id:'front',type:'color',params:{color:[1,0,0,.5]}},{id:'mix',type:'blend'}],edges:[{from:'back',to:'mix',toSocket:'a'},{from:'front',to:'mix',toSocket:'b'}]});
  assert.deepEqual([...evaluateSubstanceGraph(g,{size:1}).pixels],[255,0,0,128]);
});

test('malformed texture graphs report cycles, unknown operations, missing links and explicit budgets',()=>{
  const g=createSubstanceGraph({nodes:[{id:'a',type:'blend'},{id:'b',type:'levels'}]});g.edges.push({from:'b',to:'a'});
  assert.throws(()=>evaluateSubstanceGraph(g),/cycle/);
  assert.throws(()=>evaluateSubstanceGraph(createSubstanceGraph({nodes:[{type:'execute_js'}]})),/Unsupported/);
  assert.throws(()=>evaluateSubstanceGraph(createSubstanceGraph({nodes:[{type:'output'}]})),/requires an input/);
  assert.throws(()=>evaluateSubstanceGraph(createSubstanceGraph(),{size:4096}),/1–1024/);
  assert.throws(()=>evaluateSubstanceGraph(createSubstanceGraph({nodes:[{type:'color',params:{color:[NaN,0,1]}}]})),/normalized/);
});
