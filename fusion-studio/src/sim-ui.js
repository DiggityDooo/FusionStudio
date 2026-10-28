import {createRigidBody,stepRigidBodies,createSoftBody,stepSoftBody,createPbdCloth,createParticleSystem,stepParticles,createForceField,createRope,stepRope,shatterMesh,createCollisionProxy,solverSettings,simDebugState,FX_PRESETS,createPointCache} from './sim-physics.js';
import {tearCloth,cutCloth,createHardware,attachHardware,createStiffnessMap,paintStiffness,applyStiffnessToSoftBody,createDrapePreset,simulateDrapeFrames,placeFabricPrint,clothSimToRetopo} from './cloth-extras.js';
import {createSphFluid,stepSphFluid,createPyroGrid,injectPyroSource,stepPyroGrid,createOceanSurface,stepOcean,emitFoamSprayBubbles,createGranularSim,stepGranular,createVehicle,stepVehicle,createRagdoll,stepRagdoll,createLightning,createRealtimeVfx,addVfxModule,stepRealtimeVfx,particleRenderAs,createFxVolume} from './fx-fluids.js';

export function simPanel(editor){
 const world=editor.root.userData.fusion_sim??= {bodies:[],fields:[],proxies:[],cache:createPointCache()};
 const dbg=simDebugState(world);
 return `<section class="library-section" id="sim-panel"><div class="section-heading">SIMULATION · FX</div>
<p class="microcopy">Bodies ${dbg.bodies} · particles ${dbg.particles} · fields ${dbg.fields} · cache ${dbg.cacheFrames}. Preview solvers — not production Bullet/Vellum/FLIP.</p>
<button id="sim-pbd" class="full-button">Add PBD cloth</button>
<button id="sim-flag" class="text-button">Flag</button>
<button id="sim-curtain" class="text-button">Curtain</button>
<button id="sim-cape" class="text-button">Cape</button>
<button id="sim-sail" class="text-button">Sail</button>
<button id="sim-rigid" class="full-button">Rigid body on selection</button>
<button id="sim-soft" class="full-button">Soft body on selection</button>
<button id="sim-step" class="full-button">Step simulation</button>
<button id="sim-tear" class="text-button">Tear cloth</button>
<button id="sim-cut" class="text-button">Cut cloth (YZ)</button>
<button id="sim-button" class="text-button">Add button</button>
<button id="sim-zipper" class="text-button">Add zipper</button>
<button id="sim-stiff" class="full-button">Paint stiffness map (center soft)</button>
<button id="sim-cache" class="full-button">Bake drape cache (12f)</button>
<button id="sim-retopo" class="full-button">Sim-to-retopo 50%</button>
<button id="sim-print" class="full-button">Offset fabric print UV</button>
<button id="sim-particles" class="full-button">Spawn particles</button>
<button id="sim-fx" class="full-button">FX preset: smoke</button>
<button id="sim-rope" class="full-button">Add rope</button>
<button id="sim-shatter" class="full-button">Shatter selection</button>
<button id="sim-wind" class="full-button">Add wind field</button>
<button id="sim-sph" class="full-button">SPH fluid</button>
<button id="sim-pyro" class="full-button">Pyro / smoke grid</button>
<button id="sim-ocean" class="text-button">Ocean + foam</button>
<button id="sim-sand" class="text-button">Granular sand</button>
<button id="sim-vehicle" class="text-button">Vehicle step</button>
<button id="sim-ragdoll" class="text-button">Ragdoll step</button>
<button id="sim-lightning" class="text-button">Lightning bolt</button>
<button id="sim-rtvfx" class="text-button">Realtime VFX burst</button>
<button id="sim-debug" class="full-button">Log debug state</button>
</section>`;
}

export function wireSimPanel({editor,run,refresh,notify}){
 const panel=document.querySelector('#sim-panel');if(!panel)return;
 const $=s=>panel.querySelector(s);
 const world=()=>editor.root.userData.fusion_sim??= {bodies:[],fields:[],proxies:[],cache:createPointCache()};
 const soft=()=>editor.selected?.userData?.fusion_soft||world().bodies.find(b=>b.kind==='soft'||b.kind==='pbd_cloth');

 $('#sim-pbd').onclick=()=>run(()=>{const body=createPbdCloth(1.2,1.2,10,10);editor.root.add(body.mesh);world().bodies.push(body);editor.select(body.mesh);editor.commit();refresh();});
 for(const kind of ['flag','curtain','cape','sail'])$(`#sim-${kind}`).onclick=()=>run(()=>{const body=createDrapePreset(kind);editor.root.add(body.mesh);world().bodies.push(body);editor.select(body.mesh);editor.commit();refresh();});
 $('#sim-rigid').onclick=()=>run(()=>{const m=editor.selected;if(!m)throw Error('Select an object.');const b=createRigidBody(m,{mass:1});world().bodies.push(b);editor.commit();notify('Rigid body added.');});
 $('#sim-soft').onclick=()=>run(()=>{const m=editor.selected;if(!m?.isMesh)throw Error('Select a mesh.');const b=createSoftBody(m);world().bodies.push(b);editor.commit();notify('Soft body added.');});
 $('#sim-step').onclick=()=>run(()=>{const w=world(),cfg=solverSettings({substeps:4,quality:'medium'});
  stepRigidBodies(w.bodies.filter(b=>b.kind==='rigid'),{substeps:cfg.substeps});
  for(const b of w.bodies)if(b.kind==='soft'||b.kind==='pbd_cloth')stepSoftBody(b,{iterations:cfg.iterations});
  if(w.rope)stepRope(w.rope);if(w.particles)stepParticles(w.particles,{fields:w.fields});
  editor.commit();refresh();});
 $('#sim-tear').onclick=()=>run(()=>{const b=soft();if(!b)throw Error('No soft cloth.');const r=tearCloth(b,{threshold:1.2});notify(`Torn ${r.torn} edges`);editor.commit();});
 $('#sim-cut').onclick=()=>run(()=>{const b=soft();if(!b)throw Error('No soft cloth.');const r=cutCloth(b,{point:[0,0,0],normal:[1,0,0]});notify(`Cut removed ${r.removed}`);editor.commit();});
 $('#sim-button').onclick=()=>run(()=>{const r=editor.selected||editor.root;attachHardware(r,createHardware('button',{position:[0,1.2,.1]}));editor.commit();refresh();});
 $('#sim-zipper').onclick=()=>run(()=>{const r=editor.selected||editor.root;attachHardware(r,createHardware('zipper',{position:[0,1.1,.08]}));editor.commit();refresh();});
 $('#sim-stiff').onclick=()=>run(()=>{const m=editor.selected;if(!m?.isMesh)throw Error('Select mesh.');const map=createStiffnessMap(m,1);paintStiffness(m,0,0.2,{radius:.5,strength:1});const b=m.userData.fusion_soft;if(b)applyStiffnessToSoftBody(b,map);editor.commit();notify('Stiffness painted.');});
 $('#sim-cache').onclick=()=>run(()=>{const b=soft();if(!b)throw Error('No soft cloth.');const cache=simulateDrapeFrames(b,12,{wind:[.5,0,0]});world().cache=cache;notify(`Cached ${cache.frames.length} frames`);editor.commit();});
 $('#sim-retopo').onclick=()=>run(()=>{const m=editor.selected;if(!m?.isMesh)throw Error('Select mesh.');const out=clothSimToRetopo(m,{keep:.5});editor.root.add(out);editor.select(out);editor.commit();refresh();});
 $('#sim-print').onclick=()=>run(()=>{const m=editor.selected;if(!m?.isMesh)throw Error('Select mesh.');placeFabricPrint(m,{offset:[.1,.05],scale:[2,2],rotation:.1});editor.commit();notify('Print UV updated.');});
 $('#sim-particles').onclick=()=>run(()=>{world().particles=createParticleSystem({count:100,origin:[0,1.5,0]});editor.commit();notify('Particles spawned.');});
 $('#sim-fx').onclick=()=>run(()=>{const fx=FX_PRESETS.smoke_puff();world().particles=fx.particles;world().fields=fx.fields;editor.commit();notify('Smoke FX preset.');});
 $('#sim-rope').onclick=()=>run(()=>{world().rope=createRope([[0,2,0],[0,1.5,0],[0,1,0],[0,.5,0]]);editor.commit();notify('Rope created.');});
 $('#sim-shatter').onclick=()=>run(()=>{const m=editor.selected;if(!m?.isMesh)throw Error('Select mesh.');const sh=shatterMesh(m,{pieces:6});for(const d of sh.debris)editor.root.add(d);m.visible=false;editor.commit();refresh();});
 $('#sim-wind').onclick=()=>run(()=>{world().fields.push(createForceField('wind',{strength:1.2,axis:[1,0,.2]}));world().proxies.push(createCollisionProxy('plane',{y:0}));editor.commit();notify('Wind + ground proxy.');});
 $('#sim-sph').onclick=()=>run(()=>{const f=createSphFluid({count:48});stepSphFluid(f);world().sph=f;world().particleDraw=particleRenderAs(f,{mode:'sprites'});notify(`SPH ${f.particles.length}`);editor.commit();});
 $('#sim-pyro').onclick=()=>run(()=>{const g=createPyroGrid({res:16});injectPyroSource(g);stepPyroGrid(g);world().pyro=g;world().fxVolume=createFxVolume({fromPyro:g,res:16});notify(`Pyro dens max ${world().fxVolume.max.toFixed(2)}`);editor.commit();});
 $('#sim-ocean').onclick=()=>run(()=>{const o=createOceanSurface({});stepOcean(o,{dt:.4});world().ocean=o;world().foam=emitFoamSprayBubbles(o);notify(`Ocean foam ${world().foam.foam.length}`);editor.commit();});
 $('#sim-sand').onclick=()=>run(()=>{const s=createGranularSim({count:36,kind:'sand'});stepGranular(s);world().granular=s;notify(`Sand ${s.particles.length}`);editor.commit();});
 $('#sim-vehicle').onclick=()=>run(()=>{const v=world().vehicle??=createVehicle({});v.throttle=1.5;stepVehicle(v);notify(`Vehicle z=${v.p[2].toFixed(2)}`);editor.commit();});
 $('#sim-ragdoll').onclick=()=>run(()=>{const r=world().ragdoll??=createRagdoll({});stepRagdoll(r);notify(`Ragdoll hips y=${r.bones[0].p[1].toFixed(2)}`);editor.commit();});
 $('#sim-lightning').onclick=()=>run(()=>{world().lightning=createLightning({});notify(`Bolt pts ${world().lightning.points.length}`);editor.commit();});
 $('#sim-rtvfx').onclick=()=>run(()=>{const g=createRealtimeVfx({name:'Burst'});addVfxModule(g,'spawn',{rate:80});addVfxModule(g,'force',{y:-3});addVfxModule(g,'collision',{bounce:.4});stepRealtimeVfx(g,{dt:.2});world().rtvfx=g;notify(`VFX particles ${g.particles.length}`);editor.commit();});
 $('#sim-debug').onclick=()=>run(()=>{notify(JSON.stringify(simDebugState(world())));});
}

export function registerSimTools(registry,editor){
 registry.register({id:'sim.step',label:'Step simulation',undo:'snapshot',execute:()=>{const w=editor.root.userData.fusion_sim;if(!w)throw Error('No sim world.');stepRigidBodies(w.bodies.filter(b=>b.kind==='rigid'));for(const b of w.bodies)if(b.kind==='soft'||b.kind==='pbd_cloth')stepSoftBody(b);editor.commit();}});
 registry.register({id:'sim.drape_preset',label:'Drape preset',undo:'snapshot',execute:(_,p)=>{const body=createDrapePreset(p.kind||'flag');editor.root.add(body.mesh);const w=editor.root.userData.fusion_sim??={bodies:[]};w.bodies.push(body);editor.select(body.mesh);editor.commit();}});
}
