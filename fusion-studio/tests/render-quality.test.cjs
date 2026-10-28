const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {renderQuality,renderAnimation,RENDER_PASSES}=require('../electron/core.cjs');

test('animation settings are bounded frame ranges with known modes and outputs',()=>{
  const ok={start:1,end:120,fps:24,mode:'turntable',output:'mp4'};assert.deepEqual(renderAnimation({...ok,extra:1}),ok);assert.equal(renderAnimation(undefined),undefined);
  for(const bad of [{...ok,end:0},{...ok,end:2001},{...ok,start:1.5},{...ok,fps:0},{...ok,mode:'physics'},{...ok,output:'gif'},null])assert.throws(()=>renderAnimation(bad),/Animation|animation/,JSON.stringify(bad));
  assert.equal(renderAnimation({...ok,output:'jpeg'}).output,'jpeg');assert.equal(renderAnimation({...ok,output:'prores'}).output,'prores');
});

test('render settings accept documented values and drop nothing silently',()=>{
  const hdri=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'fusion-hdri-')),'sky.hdr');fs.writeFileSync(hdri,'#?RADIANCE\n');
  const o={denoise:false,transparent:true,adaptive:.02,timeLimit:30,exposure:-.5,viewTransform:'Standard',floor:'shadow_catcher',passes:[...RENDER_PASSES,'z'],exr:'16',engine:'EEVEE',denoiser:'OIDN',npr:true,tileSize:64,region:{x:.1,y:.1,w:.5,h:.5},world:{color:[.1,.2,.3],strength:2,rotation:-45,hdri}};
  const out=renderQuality(o);assert.deepEqual(out.passes,RENDER_PASSES,'duplicates removed');assert.deepEqual(out.world,o.world);assert.equal(out.exr,'16');assert.equal(out.engine,'EEVEE');assert.equal(out.npr,true);assert.deepEqual(out.region,{x:.1,y:.1,w:.5,h:.5});assert.equal(renderQuality(undefined),undefined);
});

test('render settings reject unsafe or out-of-range values before Blender runs',()=>{
  for(const bad of [{passes:['script']},{exr:'8'},{adaptive:2},{viewTransform:'Raw'},{floor:'lava'},{denoise:'yes'},{world:{color:[2,0,0]}},{world:{hdri:'relative/sky.hdr'}},{world:{hdri:path.join(os.tmpdir(),'missing-'+Date.now()+'.hdr')}},{world:{hdri:__filename}},[]])
    assert.throws(()=>renderQuality(bad),/render|Render|world|World|Environment|EXR|view|floor/,JSON.stringify(bad));
});
