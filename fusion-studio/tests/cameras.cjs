const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Engine}=require('../electron/core.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
global.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();});}};
(async()=>{
 const THREE=await import('three'),{GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
 const {createCamera,createLight}=await import('../src/scene-objects.js');
 const {cameraSidecar}=await import('../src/cameras.js');
 const glb=async scene=>Buffer.from(await new GLTFExporter().parseAsync(scene,{binary:true})).toString('base64');
 const scene=new THREE.Scene(),cube=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0xcccccc,roughness:.35}));
 cube.position.y=.5;scene.add(cube);
 const view=new THREE.PerspectiveCamera(38,1.2);view.position.set(4,2.4,5);view.lookAt(0,.5,0);
 const camera=createCamera(view,1.2);camera.userData.fusion_id='shot-camera';camera.uuid='shot-camera';
 Object.assign(camera.userData,{fusion_dof:true,fusion_fstop:2,fusion_focus:4.2,fusion_blades:6,fusion_motion_blur:true,fusion_shutter:180,fusion_iso:400,fusion_shift_x:.12,fusion_distortion:.15,fusion_chromatic:.05,fusion_vignette:.2});
 camera.position.copy(view.position);camera.lookAt(0,.5,0);
 const key=createLight('area');key.position.set(2,3,1);key.lookAt(0,.5,0);key.userData.fusion_intensity=key.intensity;
 scene.add(key,camera);
 const sidecar=cameraSidecar(scene);
 const engine=new Engine(path.join(output,'cameras-'+Date.now()),path.join(root,'scripts/blender_worker.py'));
 const params={samples:12,width:256,height:192,device:'CPU',cameras:sidecar,sceneCamera:'shot-camera',render:{floor:'none',world:{color:[.06,.07,.09],strength:.25}},camera:{position:[4,2.4,5],target:[0,.5,0],fov:38}};
 try{
  const rendered=await engine.run({action:'render',data:await glb(scene),name:'Cameras',params});
  const cam=rendered.metadata.camera;
  assert.equal(cam.dof,true);assert.equal(cam.blades,6);assert.equal(cam.motionBlur,true);
  assert.ok(Math.abs(cam.shutter-.5)<1e-6,'180° shutter is half a frame');
  assert.ok(Math.abs(cam.shiftX-.12)<1e-4);assert.ok(cam.exposure>1.9,'ISO 400 adds +2 EV');
  assert.ok(rendered.metadata.cameras.applied>=1);
  assert.ok(fs.statSync(rendered.output).size>1000);
  fs.copyFileSync(rendered.output,path.join(output,'cameras-render.png'));
  fs.writeFileSync(path.join(output,'cameras-results.json'),JSON.stringify({passed:true,camera:cam,cameras:rendered.metadata.cameras,renderBytes:fs.statSync(rendered.output).size},null,2));
  console.log('Cameras render PASS');
 }finally{engine.dispose?.();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>setTimeout(()=>process.exit(),100));
