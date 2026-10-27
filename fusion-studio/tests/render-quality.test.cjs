const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {renderQuality,RENDER_PASSES}=require('../electron/core.cjs');

test('render settings accept documented values and drop nothing silently',()=>{
  const hdri=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'fusion-hdri-')),'sky.hdr');fs.writeFileSync(hdri,'#?RADIANCE\n');
  const o={denoise:false,transparent:true,adaptive:.02,timeLimit:30,exposure:-.5,viewTransform:'Standard',floor:'shadow_catcher',passes:[...RENDER_PASSES,'z'],exr:'16',world:{color:[.1,.2,.3],strength:2,rotation:-45,hdri}};
  const out=renderQuality(o);assert.deepEqual(out.passes,RENDER_PASSES,'duplicates removed');assert.deepEqual(out.world,o.world);assert.equal(out.exr,'16');assert.equal(renderQuality(undefined),undefined);
});

test('render settings reject unsafe or out-of-range values before Blender runs',()=>{
  for(const bad of [{passes:['script']},{exr:'8'},{adaptive:2},{viewTransform:'Raw'},{floor:'lava'},{denoise:'yes'},{world:{color:[2,0,0]}},{world:{hdri:'relative/sky.hdr'}},{world:{hdri:path.join(os.tmpdir(),'missing-'+Date.now()+'.hdr')}},{world:{hdri:__filename}},[]])
    assert.throws(()=>renderQuality(bad),/render|Render|world|World|Environment|EXR|view|floor/,JSON.stringify(bad));
});
