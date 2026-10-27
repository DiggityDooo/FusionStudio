const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Engine}=require('../electron/core.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
global.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();});}};
// Timeline animation renders as a PNG sequence; a turntable orbits the camera into an H.264 MP4.
(async()=>{
 const THREE=await import('three'),{GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
 const scene=new THREE.Scene(),cube=new THREE.Mesh(new THREE.BoxGeometry(.6,.6,.6),new THREE.MeshStandardMaterial({color:0xd47843}));cube.name='Mover';cube.position.y=.3;scene.add(cube);
 const clip=new THREE.AnimationClip('Slide',1,[new THREE.VectorKeyframeTrack('Mover.position',[0,1],[-1,.3,0,1,.3,0])]);
 const data=Buffer.from(await new GLTFExporter().parseAsync(scene,{binary:true,animations:[clip]})).toString('base64');
 const engine=new Engine(path.join(output,'animation-render-'+Date.now()),path.join(root,'scripts/blender_worker.py'));
 const base={samples:4,width:160,height:120,device:'CPU',camera:{position:[0,1.5,4],target:[0,.3,0],fov:40}};
 try{
  const seq=await engine.run({action:'render',data,name:'Slide',params:{...base,animation:{start:1,end:6,fps:24,mode:'timeline',output:'png'}}});
  const frames=seq.metadata.frames;assert.equal(frames.length,6);assert.equal(seq.metadata.fps,24);
  assert.ok(frames.every(f=>fs.statSync(f).size>500));assert.notEqual(fs.readFileSync(frames[0]).toString('base64'),fs.readFileSync(frames[5]).toString('base64'),'the animated cube moves between frames');
  assert.equal(fs.readFileSync(seq.output).toString('base64'),fs.readFileSync(frames[0]).toString('base64'),'poster is the first frame');
  const turn=await engine.run({action:'render',data,name:'Turntable',params:{...base,animation:{start:1,end:8,fps:24,mode:'turntable',output:'mp4'}}});
  const video=fs.readFileSync(turn.output);assert.equal(path.extname(turn.output),'.mp4');assert.equal(video.subarray(4,8).toString('latin1'),'ftyp','MP4 container');assert.ok(video.includes(Buffer.from('avc1')),'H.264 stream');
  assert.equal(turn.metadata.frames,8);assert.equal(turn.metadata.mode,'turntable');
  await assert.rejects(async()=>engine.run({action:'render',data,name:'Bad',params:{...base,animation:{start:5,end:1,fps:24,mode:'timeline',output:'png'}}}),/range/);
  for(const [i,f] of [0,5].map(i=>[i,frames[i]]))fs.copyFileSync(f,path.join(output,`animation-frame-${i+1}.png`));fs.copyFileSync(turn.output,path.join(output,'animation-turntable.mp4'));
  fs.writeFileSync(path.join(output,'animation-render-results.json'),JSON.stringify({passed:true,frames:frames.length,video:video.length},null,2));console.log('Animation render PASS');
 }finally{engine.dispose?.();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>setTimeout(()=>process.exit(),100));
