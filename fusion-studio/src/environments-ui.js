import {
  createHeightfield,paintTerrainSplat,sculptTerrain,applyTerrainErosion,scatterFoliage,applyVegetationWind,scatterRocks,
  createWaterBody,createSkyAtmosphere,setTimeOfDay,createModularKit,snapModular,createPrefab,createHlods,
  createWorldPartition,listEnvironmentAssets,createBiomeRules,applyBiome,scatterDetailDecals,placeInteriorFurniture,
  floorPlanTo3D,kitbashLibrary,createGreyboxLevel,occlusionCullStats,applySeasonalVariation,generateCityBlock,generateRoadSpline,generateTree
} from './environments.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function environmentsPanel(editor){
 const sky=editor.root.userData.fusion_sky;
 return `<section class="library-section" id="env-panel"><div class="section-heading">ENVIRONMENTS</div>
<button id="env-terrain" class="full-button">Create terrain</button>
<button id="env-sculpt" class="text-button">Sculpt raise center</button>
<button id="env-splat" class="text-button">Paint rock splat</button>
<button id="env-erode" class="text-button">Erode terrain (droplet + thermal)</button>
<button id="env-foliage" class="full-button">Scatter foliage</button>
<button id="env-wind" class="text-button">Apply vegetation wind</button>
<button id="env-rocks" class="text-button">Scatter rocks</button>
<button id="env-water" class="text-button">Add lake</button>
<button id="env-ocean" class="text-button">Add ocean</button>
<button id="env-sky" class="full-button">Sky / weather</button>
<label class="field-label">Hour<input id="env-hour" type="number" min="0" max="24" step="0.5" value="${sky?.timeOfDay??15}"></label>
<button id="env-tod" class="text-button">Set time of day</button>
<button id="env-city" class="text-button">City block</button>
<button id="env-road" class="text-button">Road spline</button>
<button id="env-biome" class="full-button">Apply alpine biome</button>
<button id="env-season" class="text-button">Season: autumn</button>
<button id="env-modular" class="text-button">Modular kit</button>
<button id="env-prefab" class="text-button">Save prefab from selection</button>
<button id="env-hlod" class="text-button">Build HLODs</button>
<button id="env-partition" class="text-button">World partition</button>
<button id="env-assets" class="text-button">List env assets</button>
<button id="env-decal" class="text-button">Detail decals</button>
<button id="env-interior" class="text-button">Interior furniture</button>
<button id="env-floorplan" class="text-button">Floor plan → 3D</button>
<button id="env-greybox" class="text-button">Greybox level</button>
<button id="env-kitbash" class="text-button">Spawn kitbash rock</button>
<button id="env-cull" class="text-button">Occlusion distance cull</button>
<p class="microcopy">${sky?`Sky ${esc(sky.weather)} · hour ${sky.timeOfDay} · sun ${Number(sky.sunElevation??0).toFixed(1)}°`:'No sky state.'} Preview world tools — not Unreal Landscape parity.</p></section>`;
}

export function wireEnvironmentsPanel({editor,run,refresh,notify}){
 const panel=document.querySelector('#env-panel');if(!panel)return;const $=s=>panel.querySelector(s);
 const terrain=()=>editor.root.getObjectByName('Terrain')||(editor.selected?.userData?.fusion_terrain?editor.selected:null);
 $('#env-terrain').onclick=()=>run(()=>{const t=createHeightfield({res:48,size:24,seed:3,height:2.5,erosion:.35});editor.root.add(t);editor.select(t);editor.commit();refresh();});
 $('#env-sculpt').onclick=()=>run(()=>{const t=terrain();if(!t)throw Error('Create terrain first.');sculptTerrain(t,.5,.5,{amount:.4,radius:.12});editor.commit();});
 $('#env-splat').onclick=()=>run(()=>{const t=terrain();if(!t)throw Error('Create terrain first.');paintTerrainSplat(t,.5,.5,{layer:'rock',radius:.1,strength:.8});editor.commit();notify('Splat painted.');});
 $('#env-erode').onclick=()=>run(()=>{const t=terrain();if(!t)throw Error('Create terrain first.');const a=applyTerrainErosion(t,{method:'both',droplets:1200,seed:5,talus:.06});editor.commit();notify(`Eroded: ${a.eroded.toFixed(2)} moved · ${a.exported.toFixed(2)} carried off-map`);});
 $('#env-foliage').onclick=()=>run(()=>{const t=terrain();if(!t)throw Error('Create terrain first.');const f=scatterFoliage(t,{count:24});editor.root.add(f);editor.root.userData.fusion_foliage=f;editor.commit();refresh();});
 $('#env-wind').onclick=()=>run(()=>{const f=editor.root.userData.fusion_foliage;if(!f)throw Error('Scatter foliage first.');applyVegetationWind(f,{strength:.4,time:performance.now()/1000});editor.commit();});
 $('#env-rocks').onclick=()=>run(()=>{const t=terrain();if(!t)throw Error('Create terrain first.');editor.root.add(scatterRocks(t,{count:12}));editor.commit();refresh();});
 $('#env-water').onclick=()=>run(()=>{editor.root.add(createWaterBody({kind:'lake',size:6}));editor.commit();refresh();});
 $('#env-ocean').onclick=()=>run(()=>{editor.root.add(createWaterBody({kind:'ocean',size:20}));editor.commit();refresh();});
 $('#env-sky').onclick=()=>run(()=>{editor.root.userData.fusion_sky=createSkyAtmosphere({timeOfDay:Number($('#env-hour').value)||15,weather:'cloudy',cloudiness:.5});notify(JSON.stringify(editor.root.userData.fusion_sky));editor.commit();refresh();});
 $('#env-tod').onclick=()=>run(()=>{const sky=editor.root.userData.fusion_sky||createSkyAtmosphere({});editor.root.userData.fusion_sky=setTimeOfDay(sky,Number($('#env-hour').value)||12);editor.commit();refresh();});
 $('#env-city').onclick=()=>run(()=>{editor.root.add(generateCityBlock({blocks:3}));editor.commit();refresh();});
 $('#env-road').onclick=()=>run(()=>{editor.root.add(generateRoadSpline());editor.commit();refresh();});
 $('#env-biome').onclick=()=>run(()=>{const t=terrain();if(!t)throw Error('Create terrain first.');const bio=createBiomeRules('alpine',{seed:9});const {foliage,rocks}=applyBiome(t,bio);editor.root.add(foliage);editor.root.add(rocks);editor.root.userData.fusion_foliage=foliage;editor.commit();refresh();});
 $('#env-season').onclick=()=>run(()=>{const t=terrain();if(!t)throw Error('Create terrain first.');applySeasonalVariation(t,'autumn');editor.commit();notify('Autumn.');});
 $('#env-modular').onclick=()=>run(()=>{const kit=createModularKit({pieces:4});kit.pieces.forEach((p,i)=>{p.position.x=i*2;editor.root.add(p);});if(kit.pieces[1])snapModular(kit.pieces[1],kit.pieces[0],{grid:1});editor.commit();refresh();});
 $('#env-prefab').onclick=()=>run(()=>{const sel=editor.selected;if(!sel)throw Error('Select an object.');editor.root.userData.fusion_prefabs??=[];editor.root.userData.fusion_prefabs.push(createPrefab(sel.name||'Prefab',[sel]));notify('Prefab saved.');editor.commit();});
 $('#env-hlod').onclick=()=>run(()=>{const roots=[...editor.root.children].filter(c=>c.isObject3D).slice(0,8);editor.root.userData.fusion_hlods=createHlods(roots);notify(`HLODs ${editor.root.userData.fusion_hlods.length}`);editor.commit();});
 $('#env-partition').onclick=()=>run(()=>{editor.root.userData.fusion_partition=createWorldPartition({cellSize:16,extent:64});notify(`Cells ${editor.root.userData.fusion_partition.cells.length}`);editor.commit();});
 $('#env-assets').onclick=()=>run(()=>notify(listEnvironmentAssets().map(a=>a.label).join(' · ')));
 $('#env-decal').onclick=()=>run(()=>{const t=terrain()||editor.selected;if(!t?.isMesh)throw Error('Select mesh/terrain.');editor.root.add(scatterDetailDecals(t,{count:12}));editor.commit();refresh();});
 $('#env-interior').onclick=()=>run(()=>{editor.root.add(placeInteriorFurniture());editor.commit();refresh();});
 $('#env-floorplan').onclick=()=>run(()=>{editor.root.add(floorPlanTo3D({rooms:[{x:0,z:0,w:4,d:3},{x:5,z:0,w:3,d:3}]}));editor.commit();refresh();});
 $('#env-greybox').onclick=()=>run(()=>{editor.root.add(createGreyboxLevel());editor.commit();refresh();});
 $('#env-kitbash').onclick=()=>run(()=>{const lib=kitbashLibrary();const m=lib[0].make();editor.root.add(m);editor.select(m);editor.commit();refresh();});
 $('#env-cull').onclick=()=>run(()=>{const stats=occlusionCullStats([...editor.root.children],editor.camera?.position?.toArray?.()||[0,2,10],{maxDist:40});notify(`vis ${stats.visible} / culled ${stats.culled}`);});
 void generateTree;
}

export function registerEnvironments(registry,editor){
 registry.register({id:'env.create_terrain',label:'Create terrain',undo:'snapshot',execute:()=>{const t=createHeightfield({});editor.root.add(t);editor.select(t);editor.commit();}});
}
