import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createHeightfield,paintTerrainSplat,sculptTerrain,scatterFoliage,applyVegetationWind,scatterRocks,generateTree,generateRock,
  createWaterBody,createSkyAtmosphere,setTimeOfDay,createModularKit,snapModular,createPrefab,createHlods,createWorldPartition,
  listEnvironmentAssets,createBiomeRules,applyBiome,scatterDetailDecals,placeInteriorFurniture,floorPlanTo3D,kitbashLibrary,
  createGreyboxLevel,occlusionCullStats,applySeasonalVariation
} from '../src/environments.js';

test('terrain heightfield, splat, sculpt',()=>{
  const t=createHeightfield({res:32,size:10,seed:2,height:2,erosion:.4});
  assert.ok(t.userData.fusion_terrain.splat.layers.includes('grass'));
  paintTerrainSplat(t,.5,.5,{layer:'rock',radius:.1,strength:1});
  assert.ok(t.userData.fusion_terrain.splat.data.rock.some(v=>v>.5));
  const before=Float32Array.from(t.geometry.attributes.position.array);
  sculptTerrain(t,.5,.5,{amount:.5,radius:.15});
  assert.ok([...t.geometry.attributes.position.array].some((v,i)=>Math.abs(v-before[i])>1e-6));
});

test('foliage, wind, rocks, water, sky, biome, season',()=>{
  const t=createHeightfield({res:24,size:12,seed:1});
  const f=scatterFoliage(t,{count:10,seed:3});assert.ok(f.children.length>=5);
  applyVegetationWind(f,{strength:.5,time:1});assert.equal(f.userData.fusion_foliage.wind,.5);
  assert.ok(scatterRocks(t,{count:5}).children.length>=3);
  assert.ok(generateTree({}).children.length>=2);assert.ok(generateRock({}).isMesh);
  assert.ok(createWaterBody({kind:'ocean'}).userData.fusion_water.kind==='ocean');
  const sky=createSkyAtmosphere({timeOfDay:18,weather:'fog'});assert.ok(sky.fogDensity>0);
  assert.equal(setTimeOfDay(sky,6).timeOfDay,6);
  const bio=createBiomeRules('desert',{seed:4});const r=applyBiome(t,bio);assert.ok(r.foliage&&r.rocks);
  assert.equal(applySeasonalVariation(t,'winter'),'winter');
});

test('modular, prefab, hlod, partition, assets, interior, floorplan, greybox, cull',()=>{
  const kit=createModularKit({pieces:3});snapModular(kit.pieces[1],kit.pieces[0],{grid:1});
  const pref=createPrefab('Hut',[kit.pieces[0]]);assert.equal(pref.objects.length,1);
  assert.ok(createHlods(kit.pieces).length===3);
  assert.ok(createWorldPartition({cellSize:16,extent:32}).cells.length>0);
  assert.ok(listEnvironmentAssets().length>=4);
  const t=createHeightfield({res:16,size:8});assert.ok(scatterDetailDecals(t,{count:4}).children.length===4);
  assert.ok(placeInteriorFurniture().children.length>2);
  assert.ok(floorPlanTo3D({rooms:[{x:0,z:0,w:3,d:3}]}).children.length>1);
  assert.ok(kitbashLibrary()[0].make().isMesh);
  assert.ok(createGreyboxLevel().children.length>=1);
  const a=new THREE.Object3D();a.position.set(0,0,0);const b=new THREE.Object3D();b.position.set(0,0,100);
  const stats=occlusionCullStats([a,b],[0,0,0],{maxDist:50});assert.equal(stats.visible,1);assert.equal(stats.culled,1);
});
