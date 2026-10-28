import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as THREE from 'three';
import {defaultRenderSettings,normalizeRenderSettings,estimateRenderSeconds,enqueueRender,PASSES,ENGINES} from '../src/render-ui.js';
const require=createRequire(import.meta.url),{renderQuality,renderAnimation}=require('../electron/core.cjs');

test('engine, HIP, region, tiles, NPR and extra AOVs validate',()=>{
  const q=renderQuality({engine:'CYCLES',denoiser:'OIDN',npr:true,lightCache:true,outOfCore:true,tileSize:128,region:{x:.25,y:.25,w:.5,h:.5},passes:['shadow','wireframe','light_groups']});
  assert.equal(q.engine,'CYCLES');assert.equal(q.tileSize,128);assert.equal(q.npr,true);assert.deepEqual(q.passes,['shadow','wireframe','light_groups']);
  assert.throws(()=>renderQuality({engine:'ARNOLD'}),/engine/i);
  assert.throws(()=>renderQuality({region:{x:0,y:0,w:2,h:1}}),/region/i);
  assert.throws(()=>renderQuality({passes:['albedo']}),/pass/i);
  assert.ok(PASSES.shadow);assert.ok(ENGINES.includes('EEVEE'));
});

test('sequence formats include JPEG, TIFF, EXR and ProRes',()=>{
  for(const output of ['png','jpeg','tiff','exr','mp4','prores'])assert.equal(renderAnimation({start:1,end:8,fps:24,mode:'timeline',output}).output,output);
  assert.throws(()=>renderAnimation({start:1,end:8,fps:24,mode:'timeline',output:'gif'}),/animation/i);
});

test('estimator and queue stay in-memory',()=>{
  const s=defaultRenderSettings();s.samples=64;s.width=1920;s.height=1080;
  assert.ok(estimateRenderSeconds(s)>=1);
  const queue=[],entry=enqueueRender(queue,s,{name:'Shot',kind:'image'});
  assert.equal(queue.length,1);assert.equal(entry.name,'Shot');assert.equal(entry.settings.samples,64);
  s.samples=8;assert.equal(queue[0].settings.samples,64,'queue snapshot is a copy');
});

test('saved render settings accept A12 keys and reject invalid ones',()=>{
  const s=normalizeRenderSettings({samples:24,device:'HIP',render:{engine:'EEVEE',npr:true,region:{x:0,y:0,w:.4,h:.4},passes:['shadow']},sequence:{mode:'timeline',output:'jpeg',start:1,end:12,fps:24}});
  assert.equal(s.device,'HIP');assert.equal(s.render.engine,'EEVEE');assert.equal(s.sequence.output,'jpeg');assert.deepEqual(s.render.region,{x:0,y:0,w:.4,h:.4});
  assert.throws(()=>normalizeRenderSettings({render:{engine:'LUMEN'}}),/invalid/i);
});

test('holdout and proxy flags live on object extras',()=>{
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());
  mesh.userData.fusion_holdout=true;mesh.userData.fusion_proxy=true;
  assert.equal(mesh.userData.fusion_holdout,true);assert.equal(mesh.userData.fusion_proxy,true);
});
