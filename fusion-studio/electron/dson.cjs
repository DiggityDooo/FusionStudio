const path=require('node:path');const fs=require('node:fs');const {spawn}=require('node:child_process');const {isolatedEnv}=require('./core.cjs');
const PYTHON='C:\\Program Files\\Blender Foundation\\Blender 5.2\\5.2\\python\\bin\\python.exe';
function preflightDson(root,script,source,roots,targetSource){
 if(!fs.existsSync(PYTHON))throw Error('Blender Python is unavailable for native asset inspection.');
 return new Promise((resolve,reject)=>{
  const child=spawn(PYTHON,['-I','-B',script,'--preflight',source,'--roots',JSON.stringify(roots),...(targetSource?['--preset-target',targetSource]:[])],{cwd:root,env:isolatedEnv(root),windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.on('error',reject);child.on('close',code=>{try{if(stdout.trim()){resolve(JSON.parse(stdout));return;}throw Error('Native asset preflight failed ('+code+'): '+stderr.slice(-1500));}catch(e){reject(e);}});
 });
}
module.exports={preflightDson};
