const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Engine}=require('../electron/core.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
global.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();});}};
// A tiny flat (non-RLE) Radiance HDR sky: bright warm top, dark cool bottom.
function writeSky(file){const w=64,h=32,header=Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${h} +X ${w}\n`,'latin1'),pixels=Buffer.alloc(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,top=y<h/2;pixels.set(top?[200,170,120,129]:[20,30,60,128],i);}fs.writeFileSync(file,Buffer.concat([header,pixels]));return file;}
const pngColorType=file=>fs.readFileSync(file)[25];
(async()=>{
 const THREE=await import('three'),{GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
 const scene=new THREE.Scene(),ball=new THREE.Mesh(new THREE.SphereGeometry(.5,32,16),new THREE.MeshStandardMaterial({color:0xdddddd,roughness:.2,metalness:1}));ball.position.y=.5;scene.add(ball);
 const data=Buffer.from(await new GLTFExporter().parseAsync(scene,{binary:true})).toString('base64'),work=path.join(output,'render-options-'+Date.now());fs.mkdirSync(work,{recursive:true});
 const sky=writeSky(path.join(work,'sky.hdr')),engine=new Engine(path.join(work,'engine'),path.join(root,'scripts/blender_worker.py'));
 const base={samples:8,width:256,height:192,device:'CPU',camera:{position:[2,1.2,2.4],target:[0,.5,0],fov:38}},results={};
 try{
  // Passes and multilayer EXR: every requested pass is a layer in the EXR beside the PNG.
  const passes=['z','normal','ao','diffuse','glossy','emission','mist','crypto_object','crypto_material','shadow_catcher','object_index'];
  const aov=await engine.run({action:'render',data,name:'AOV',params:{...base,render:{passes,exr:'32',adaptive:.05,denoise:false}}});
  assert.ok(aov.metadata.exr&&fs.existsSync(aov.metadata.exr));const header=fs.readFileSync(aov.metadata.exr).subarray(0,65536).toString('latin1');
  for(const layer of ['Combined','Depth','Normal','Ambient Occlusion','Diffuse Direct','Diffuse Color','Glossy Color','Emission','Mist','CryptoObject00','CryptoMaterial00','Shadow Catcher','Object Index'])assert.ok(header.includes('ViewLayer.'+layer+'.'),'EXR layer '+layer);
  assert.equal(aov.metadata.denoise,false);assert.equal(aov.metadata.adaptive,true);assert.deepEqual(aov.metadata.passes,passes);results.aov={exr:fs.statSync(aov.metadata.exr).size};
  // Transparent film with a shadow-catcher floor: RGBA PNG for compositing.
  const cut=await engine.run({action:'render',data,name:'Cutout',params:{...base,render:{transparent:true,floor:'shadow_catcher'}}});
  assert.equal(pngColorType(cut.output),6,'RGBA PNG');assert.deepEqual(cut.metadata.shadow_catchers,['Fusion studio floor']);assert.equal(cut.metadata.transparent,true);
  // HDRI world lighting with rotation and colour management.
  const lit=await engine.run({action:'render',data,name:'HDRI',params:{...base,render:{floor:'none',world:{hdri:sky,strength:1.5,rotation:90},viewTransform:'Standard',exposure:.5}}});
  assert.equal(path.basename(lit.metadata.world.hdri),'sky.hdr');assert.ok(Math.abs(lit.metadata.world.strength-1.5)<1e-6);assert.equal(lit.metadata.view_transform,'Standard');assert.ok(Math.abs(lit.metadata.exposure-.5)<1e-6);
  const flat=await engine.run({action:'render',data,name:'Flat',params:{...base,render:{floor:'none',world:{color:[0,0,0],strength:0}}}});
  assert.notEqual(fs.readFileSync(lit.output).toString('base64'),fs.readFileSync(flat.output).toString('base64'));assert.equal(flat.metadata.world.hdri,null);
  for(const [name,r] of Object.entries({aov,cut,lit}))fs.copyFileSync(r.output,path.join(output,`render-options-${name}.png`));
  await assert.rejects(async()=>engine.run({action:'render',data,name:'Bad',params:{...base,render:{passes:['../etc']}}}),/Unsupported render pass/);
  fs.writeFileSync(path.join(output,'render-options-results.json'),JSON.stringify({passed:true,results,lit:lit.metadata.world},null,2));console.log('Render options PASS');
 }finally{engine.dispose?.();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>setTimeout(()=>process.exit(),100));
