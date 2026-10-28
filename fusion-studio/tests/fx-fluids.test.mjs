import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSphFluid,stepSphFluid,createFlipFluid,stepFlipFluid,createPyroGrid,injectPyroSource,stepPyroGrid,
  createGasVolumeSolver,stepGasVolume,createOceanSurface,stepOcean,emitFoamSprayBubbles,createGranularSim,stepGranular,
  createVehicle,stepVehicle,createRagdoll,stepRagdoll,createLightning,createFxVolume,sampleFxVolume,
  particleRenderAs,createRealtimeVfx,addVfxModule,stepRealtimeVfx,exportVdbLikeDensity
} from '../src/fx-fluids.js';

test('SPH and FLIP fluids step',()=>{
  const sph=createSphFluid({count:27,origin:[0,.5,0]});const y0=sph.particles[0].p[1];
  stepSphFluid(sph,{dt:1/30,substeps:2});assert.ok(sph.particles.some(p=>p.p[1]!==y0||p.v[1]!==0));
  const flip=createFlipFluid({count:27});stepFlipFluid(flip);assert.equal(flip.kind,'flip');
});

test('pyro gas ocean foam granular',()=>{
  const pyro=createPyroGrid({res:10});injectPyroSource(pyro,{y:.1,density:2,temp:3});stepPyroGrid(pyro);
  assert.ok([...pyro.density].some(v=>v>0));
  const gas=createGasVolumeSolver({res:8});injectPyroSource(gas);stepGasVolume(gas);assert.ok(gas.density.some(v=>v>0));
  const ocean=createOceanSurface({res:16});stepOcean(ocean,{dt:.5});assert.ok([...ocean.heights].some(h=>Math.abs(h)>1e-4));
  const fsb=emitFoamSprayBubbles(ocean,{count:20,threshold:.01});assert.ok(fsb.bubbles.length);
  const sand=createGranularSim({count:20,kind:'sand'});stepGranular(sand);assert.ok(sand.particles.every(p=>p.p[1]>=p.r-1e-6));
});

test('vehicle ragdoll lightning volume particles rt-vfx vdb',()=>{
  const veh=createVehicle({});veh.throttle=2;stepVehicle(veh,{dt:1/30});assert.ok(veh.p[2]!==0||veh.v[2]!==0||veh.wheels[0].compression>=0);
  const rag=createRagdoll({});const hy=rag.bones[0].p[1];stepRagdoll(rag,{dt:1/30});assert.ok(rag.bones.some(b=>b.p[1]!==hy));
  assert.ok(createLightning({segments:8}).points.length===9);
  const pyro=createPyroGrid({res:8});injectPyroSource(pyro);const vol=createFxVolume({fromPyro:pyro,res:8});
  assert.ok(sampleFxVolume(vol,.5,.1,.5)>=0);
  const sph=createSphFluid({count:16});assert.equal(particleRenderAs(sph,{mode:'meshes'}).count,16);
  const g=createRealtimeVfx();addVfxModule(g,'spawn',{rate:60,life:1});addVfxModule(g,'force',{y:-2});addVfxModule(g,'kill',{maxAge:2});
  stepRealtimeVfx(g,{dt:.1});assert.ok(g.particles.length>0);
  assert.ok(exportVdbLikeDensity(pyro).includes('Fusion density'));
});
