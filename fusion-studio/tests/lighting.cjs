const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {Engine}=require('../electron/core.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
global.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();});}};
(async()=>{
 const THREE=await import('three'),{GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
 const {createLight,editSceneObject}=await import('../src/scene-objects.js');
 const {lightingSidecar,makeMeshLight}=await import('../src/lighting.js');
 const glb=async scene=>Buffer.from(await new GLTFExporter().parseAsync(scene,{binary:true})).toString('base64');
 const scene=new THREE.Scene(),cube=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0xcccccc,roughness:.4,metalness:.1}));
 cube.position.y=.5;cube.userData.fusion_id='subject';cube.uuid='subject';scene.add(cube);
 const disk=createLight('disk'),portal=createLight('area');
 disk.position.set(2,3,1);disk.lookAt(0,.5,0);disk.userData.fusion_id='disk-1';disk.uuid='disk-1';disk.userData.fusion_group='Key';
 portal.position.set(0,2,-2);portal.lookAt(0,.5,0);portal.userData.fusion_id='portal-1';portal.uuid='portal-1';portal.userData.fusion_portal=true;
 editSceneObject(disk,'light-area',1.8);scene.add(disk,portal);
 const emit=new THREE.Mesh(new THREE.PlaneGeometry(.4,.4),new THREE.MeshStandardMaterial({color:0x111111}));
 emit.position.set(-1,1.4,.8);emit.userData.fusion_id='mesh-light';emit.uuid='mesh-light';makeMeshLight(emit,{intensity:20});scene.add(emit);
 for(const light of [disk,portal])light.userData.fusion_intensity=light.intensity;
 const sidecar=lightingSidecar(scene);sidecar.mixer={Key:1.25};
 const engine=new Engine(path.join(output,'lighting-'+Date.now()),path.join(root,'scripts/blender_worker.py'));
 const params={samples:12,width:256,height:192,device:'CPU',lighting:sidecar,render:{caustics:true,contactShadows:true,floor:'none',world:{color:[.05,.06,.08],strength:.2,volume:.15,sunSky:{enabled:true,elevation:40,rotation:20,air:1,dust:1,ozone:1}}},camera:{position:[4,3,5],target:[0,.5,0],fov:38}};
 try{
  const rendered=await engine.run({action:'render',data:await glb(scene),name:'Lighting',params});
  const lights=rendered.metadata.lights.filter(l=>!l.studio);
  assert.ok(lights.some(l=>l.type==='AREA'&&Math.abs(l.size-1.8)<1e-4),'disk size reaches Cycles');
  assert.ok(rendered.metadata.lighting.applied>=1,'sidecar applied');
  assert.ok(rendered.metadata.world,'world reported');
  assert.ok(fs.statSync(rendered.output).size>1000);
  cube.geometry=new THREE.BoxGeometry(1,1,1);cube.geometry.setAttribute('uv',cube.geometry.attributes.uv);
  const baked=await engine.run({action:'lightmap_bake',data:await glb(scene),name:'Lightmap',params:{targetId:'subject',size:256,lighting:sidecar}});
  assert.equal(baked.metadata.action,'lightmap_bake');
  fs.copyFileSync(rendered.output,path.join(output,'lighting-render.png'));
  fs.writeFileSync(path.join(output,'lighting-results.json'),JSON.stringify({passed:true,lights,lighting:rendered.metadata.lighting,world:rendered.metadata.world,bake:baked.metadata.action,renderBytes:fs.statSync(rendered.output).size},null,2));
  console.log('Lighting render PASS');
 }finally{engine.dispose?.();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>setTimeout(()=>process.exit(),100));
