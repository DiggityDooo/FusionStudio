const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Engine}=require('../electron/core.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
global.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();});}};
(async()=>{
 const THREE=await import('three'),{GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
 const {createLight}=await import('../src/scene-objects.js');
 const glb=async scene=>Buffer.from(await new GLTFExporter().parseAsync(scene,{binary:true})).toString('base64');
 const scene=new THREE.Scene();
 const body=new THREE.Mesh(new THREE.BoxGeometry(.8,.8,.8),new THREE.MeshStandardMaterial({color:0xcccccc,roughness:.4}));body.position.y=.4;body.name='Body';
 const matte=new THREE.Mesh(new THREE.BoxGeometry(1.4,.05,1.4),new THREE.MeshStandardMaterial({color:0x222222}));matte.position.y=.02;matte.name='HoldoutPlate';matte.userData.fusion_holdout=true;
 const key=createLight('area');key.position.set(2,3,1);key.lookAt(0,.4,0);key.userData.fusion_group='Key';key.userData.fusion_intensity=key.intensity;
 scene.add(body,matte,key);
 const engine=new Engine(path.join(output,'rendering-'+Date.now()),path.join(root,'scripts/blender_worker.py'));
 const camera={position:[3,2,3.4],target:[0,.4,0],fov:38};
 try{
  const still=await engine.run({action:'render',data:await glb(scene),name:'Holdout',params:{samples:8,width:192,height:144,device:'CPU',camera,render:{floor:'none',world:{color:[.08,.09,.1],strength:.2},engine:'CYCLES',denoiser:'OIDN',npr:true,lightCache:true,outOfCore:true,tileSize:64,region:{x:.15,y:.15,w:.7,h:.7},passes:['shadow','wireframe','light_groups']}}});
  const m=still.metadata;
  assert.ok((m.holdouts||[]).some(n=>/Holdout/i.test(n)),'holdout object flagged: '+JSON.stringify(m.holdouts));
  assert.equal(m.border,true);assert.equal(m.tileSize,64);assert.equal(m.npr,true);
  assert.match(String(m.engine||''),/CYCLES/i,'engine='+m.engine);
  assert.ok((m.lightGroups||[]).includes('Key'),'light group Key: '+JSON.stringify(m.lightGroups));
  assert.ok(fs.statSync(still.output).size>400);
  const seq=await engine.run({action:'render',data:await glb(scene),name:'JpegSeq',params:{samples:4,width:128,height:96,device:'CPU',camera,animation:{start:1,end:2,fps:24,mode:'turntable',output:'jpeg'},render:{floor:'none',world:{color:[.1,.1,.1],strength:.3}}}});
  assert.equal(seq.metadata.frames.length,2);assert.ok(seq.metadata.frames.every(f=>/\.jpe?g$/i.test(f)&&fs.statSync(f).size>200));
  fs.copyFileSync(still.output,path.join(output,'rendering-holdout.png'));
  fs.copyFileSync(seq.metadata.frames[0],path.join(output,'rendering-seq.jpg'));
  fs.writeFileSync(path.join(output,'rendering-results.json'),JSON.stringify({passed:true,engine:m.engine,holdouts:m.holdouts,border:m.border,tileSize:m.tileSize,npr:m.npr,lightGroups:m.lightGroups,jpegFrames:seq.metadata.frames.length,renderBytes:fs.statSync(still.output).size},null,2));
  console.log('Rendering PASS');
 }finally{engine.dispose?.();engine.close?.();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>setTimeout(()=>process.exit(),100));
