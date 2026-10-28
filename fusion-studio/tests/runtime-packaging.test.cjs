const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),pkg=require('../package.json');
test('required Blender worker helpers are included and unpacked in future releases',()=>{
 for(const file of ['scripts/blender_worker.py','scripts/animation_time.py','scripts/gltf_bump.py','scripts/native_scene.py','scripts/dson_importer.py','scripts/character_materials.py','scripts/surface_materials.py','scripts/lighting.py','scripts/cameras.py','scripts/surface_panels.py']){
  assert.ok(fs.existsSync(path.resolve(__dirname,'..',file)),file+' exists');assert.ok(pkg.build.files.includes(file),file+' is included');assert.ok(pkg.build.asarUnpack.includes(file),file+' is available to the external Blender worker');
 }
});
