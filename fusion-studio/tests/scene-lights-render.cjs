const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Engine}=require('../electron/core.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
global.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();});}};
// Authored Fusion lights and the active camera reach Cycles through glTF: area size, soft radius, DOF and vertical FOV.
(async()=>{
 const THREE=await import('three'),{GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js'),{createLight,createCamera,editSceneObject}=await import('../src/scene-objects.js');
 const glb=async scene=>Buffer.from(await new GLTFExporter().parseAsync(scene,{binary:true})).toString('base64');
 const scene=new THREE.Scene(),cube=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0xcccccc}));cube.position.y=.5;scene.add(cube);
 const area=createLight('area'),point=createLight('point'),view=new THREE.PerspectiveCamera(30,1.2);view.position.set(3,2,4);view.lookAt(0,.5,0);
 area.position.set(2,3,1);area.lookAt(0,0,0);editSceneObject(area,'light-area',2.5);point.position.set(-2,2,2);editSceneObject(point,'light-soft',.3);
 const camera=createCamera(view,1.2);camera.userData.fusion_id='shot-camera';Object.assign(camera.userData,{fusion_dof:true,fusion_fstop:1.8,fusion_focus:4.2,fusion_vfov:camera.fov});scene.add(area,point,camera);for(const light of [area,point])light.userData.fusion_intensity=light.intensity;
 const engine=new Engine(path.join(output,'scene-lights-'+Date.now()),path.join(root,'scripts/blender_worker.py'));
 const params={samples:8,width:320,height:240,device:'CPU',camera:{position:[5,5,5],target:[0,0,0],fov:38}};
 try{
  const lit=await engine.run({action:'render',data:await glb(scene),name:'Lit',params:{...params,sceneCamera:'shot-camera'}});
  const lights=lit.metadata.lights.filter(l=>!l.studio);assert.equal(lit.metadata.lights.filter(l=>l.studio).length,0,'scene lights replace the studio rig');
  assert.deepEqual(lights.map(l=>l.type).sort(),['AREA','POINT']);assert.ok(Math.abs(lights.find(l=>l.type==='AREA').size-2.5)<1e-6,'area size from extras');
  assert.ok(Math.abs(lights.find(l=>l.type==='AREA').energy-Math.PI*area.intensity)<1e-3&&Math.abs(lights.find(l=>l.type==='POINT').energy-4*Math.PI*point.intensity)<1e-3,'viewport-matched power');
  assert.equal(lit.metadata.camera.dof,true);assert.ok(Math.abs(lit.metadata.camera.fstop-1.8)<1e-6&&Math.abs(lit.metadata.camera.focus-4.2)<1e-6);
  assert.equal(lit.metadata.camera.sensorFit,'VERTICAL');assert.ok(Math.abs(2*Math.atan(12/lit.metadata.camera.lens)*180/Math.PI-30)<1e-3,'vertical FOV preserved');
  assert.ok(fs.statSync(lit.output).size>1000);
  await assert.rejects(engine.run({action:'render',data:await glb(scene),name:'Missing',params:{...params,sceneCamera:'not-in-scene'}}),/active scene camera/);
  const bare=new THREE.Scene();bare.add(cube.clone());const studio=await engine.run({action:'render',data:await glb(bare),name:'Studio',params});
  assert.equal(studio.metadata.lights.filter(l=>l.studio).length,3,'scenes without lights keep the studio rig');
  fs.copyFileSync(lit.output,path.join(output,'scene-lights-render.png'));
  fs.writeFileSync(path.join(output,'scene-lights-render-results.json'),JSON.stringify({passed:true,lit:lit.metadata,studio:studio.metadata.lights},null,2));console.log('Scene lights render PASS');
 }finally{engine.dispose?.();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>setTimeout(()=>process.exit(),100));
