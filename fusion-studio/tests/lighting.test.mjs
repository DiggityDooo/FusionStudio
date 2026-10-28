import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import * as THREE from 'three';
import {createLight,editSceneObject,LIGHT_KINDS,LIGHT_RIGS} from '../src/scene-objects.js';
import {toViewportIntensity,lightingSidecar,makeMeshLight,paintPlacement,solarPosition,sunSkyRecord,lightRecord,LIGHT_UNITS} from '../src/lighting.js';
const require=createRequire(import.meta.url),{lighting}=require('../electron/lighting.cjs'),{renderQuality,Engine}=require('../electron/core.cjs');

test('disk, sphere and tube lights exist beside point/spot/sun/area',()=>{
  assert.deepEqual(Object.keys(LIGHT_KINDS),['point','spot','sun','area','disk','sphere','tube']);
  const disk=createLight('disk'),sphere=createLight('sphere'),tube=createLight('tube');
  assert.equal(disk.isSpotLight,true);assert.equal(disk.userData.fusion_area_shape,'DISK');
  assert.equal(sphere.isPointLight,true);assert.ok(sphere.userData.fusion_soft>.1);
  assert.equal(tube.userData.fusion_area_shape,'RECTANGLE');assert.ok(tube.userData.fusion_area_y<.5);
  assert.throws(()=>createLight('laser'),/Unknown light/);
});

test('lumens, nits and EV convert to viewport candela/lux',()=>{
  const point=createLight('point'),area=createLight('area'),sun=createLight('sun');
  assert.ok(Math.abs(toViewportIntensity('point','lm',4*Math.PI,point)-1)<1e-9);
  assert.ok(Math.abs(toViewportIntensity('area','nits',10,area)-10)<1e-9,'1 m² area: nits equal candela');
  assert.ok(editSceneObject(point,'light-unit','lm'));assert.ok(editSceneObject(point,'light-intensity',125.6637));
  assert.ok(Math.abs(point.intensity-10)<.01);
  assert.ok(editSceneObject(sun,'light-unit','ev'));assert.ok(editSceneObject(sun,'light-intensity',1));
  assert.ok(Math.abs(sun.intensity-6)<1e-9);
  assert.equal(editSceneObject(point,'light-unit','watt'),false);
  assert.ok(LIGHT_UNITS.includes('nits'));
});

test('sidecar carries mixer, portals, linking, rays and mesh lights',()=>{
  const root=new THREE.Group(),key=createLight('area'),fill=createLight('disk'),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());
  key.userData.fusion_id='key-light';fill.userData.fusion_id='fill-light';mesh.uuid='mesh-1';mesh.userData.fusion_id='mesh-1';
  key.userData.fusion_group='Key';fill.userData.fusion_portal=true;key.userData.fusion_link_include=['mesh-1'];
  key.userData.fusion_rays={camera:true,shadow:false};root.userData.fusion_light_mixer={Key:1.5,Fill:.4};
  root.add(key,fill,mesh);makeMeshLight(mesh,{intensity:12});
  const side=lightingSidecar(root);
  assert.equal(side.version,1);assert.equal(side.mixer.Key,1.5);assert.equal(side.lights.length,2);
  assert.equal(side.lights.find(l=>l.objectId==='fill-light').portal,true);
  assert.equal(side.lights.find(l=>l.objectId==='key-light').include[0],'mesh-1');
  assert.equal(side.lights.find(l=>l.objectId==='key-light').rays.shadow,false);
  assert.equal(side.meshes[0].sampleAsLight,true);assert.ok(mesh.material.emissiveIntensity>1);
  const checked=lighting(side);assert.equal(checked.lights.length,2);assert.equal(checked.meshes.length,1);
  assert.throws(()=>lighting({version:1,mixer:{Key:-1},lights:[],meshes:[]}),/mixer/i);
});

test('sun/sky time-of-day raises the sun near noon and lighting rigs are named',()=>{
  const noon=solarPosition({latitude:40,longitude:0,month:6,day:21,hour:12});
  const dusk=solarPosition({latitude:40,longitude:0,month:6,day:21,hour:20});
  assert.ok(noon.elevation>dusk.elevation);assert.ok(noon.elevation>40);
  const sky=sunSkyRecord({enabled:true,timeOfDay:true,latitude:40,longitude:0,month:6,day:21,hour:12});
  assert.equal(sky.enabled,true);assert.ok(sky.elevation>40);
  assert.deepEqual(Object.keys(LIGHT_RIGS),['three-point','studio','hdri-studio']);
  assert.ok(LIGHT_RIGS['three-point'].every(l=>l.group));
});

test('paint placement sits off the hit along the normal',()=>{
  const pose=paintPlacement({point:new THREE.Vector3(0,1,0),normal:new THREE.Vector3(0,1,0)},'spot');
  assert.ok(pose.position[1]>1);assert.deepEqual(pose.target,[0,1,0]);assert.equal(pose.kind,'spot');
});

test('IES and gobo paths must be existing absolute files',()=>{
  const rec=lightRecord(createLight('spot'));rec.objectId='spot-1';
  rec.ies=path.join(os.tmpdir(),'missing-'+Date.now()+'.ies');
  assert.throws(()=>lighting({version:1,mixer:{},lights:[rec],meshes:[]}),/IES/);
  const ies=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'fusion-ies-')),'lamp.ies');
  fs.writeFileSync(ies,'IESNA:LM-63-1995\n[TEST] Fusion\nTILT=NONE\n1 1000 1 2 1 1 1 0 0 0\n1 1 10\n0 90\n0\n1000 100\n');
  rec.ies=ies;const ok=lighting({version:1,mixer:{},lights:[rec],meshes:[]});assert.equal(ok.lights[0].ies,ies);
});

test('render quality accepts caustics, contact shadows and sun/sky',()=>{
  const out=renderQuality({caustics:true,contactShadows:true,world:{volume:.2,sunSky:{enabled:true,elevation:35,timeOfDay:false}}});
  assert.equal(out.caustics,true);assert.equal(out.contactShadows,true);assert.equal(out.world.volume,.2);assert.equal(out.world.sunSky.elevation,35);
  assert.throws(()=>renderQuality({caustics:'yes'}),/caustics/);
  assert.throws(()=>renderQuality({world:{sunSky:{elevation:200}}}),/elevation|Sun\/sky/);
});

test('lightmap bake is a shading action and cannot join the modifier stack',()=>{
  const engine=new Engine('test-output/lighting-validation','scripts/blender_worker.py');
  try{assert.throws(()=>engine.run({action:'stack',params:{stack:[{id:'a',action:'lightmap_bake',enabled:true,params:{size:512}}]}}),/Invalid stack/);}
  finally{engine.close();}
});
