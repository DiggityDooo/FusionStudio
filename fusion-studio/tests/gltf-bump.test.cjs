const test=require('node:test'),path=require('node:path'),os=require('node:os'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const bundled=path.join(os.homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','python','python.exe');
test('embedded bump parsing, resource bounds and UV conversion pass independent Python reference cases',()=>{
 try{execFileSync(fs.existsSync(bundled)?bundled:'python',['-X','utf8',path.resolve('tests/gltf-bump-reader.py')],{encoding:'utf8',stdio:'pipe'});}catch(error){throw Error(String(error.stderr||error.message).slice(0,6000));}
});
