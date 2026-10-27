const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const {spawn}=require('node:child_process');
const {uniqueDir,writeNew,isolatedEnv}=require('./core.cjs');
class DazEngine{
 constructor(root,script,onUpdate=()=>{}){this.root=root;this.script=script;this.onUpdate=onUpdate;this.active=null;}
 async prepare(){
  const source='C:\\Program Files\\DAZ 3D\\DAZStudio4',destination=path.join(this.root,'native-engines','daz');
  const ready=path.join(destination,'fusion-runtime.json');if(fs.existsSync(ready))return path.join(destination,'DAZStudio.exe');
  this.onUpdate({id:'daz-runtime',action:'prepare native character engine',status:'running',started:new Date().toISOString(),log:'Creating an isolated local runtime copy.'});
  await fs.promises.cp(source,destination,{recursive:true,force:false,errorOnExist:false,filter:src=>{const relative=path.relative(source,src);return !relative.startsWith('docs')&&!/dsp_dazmcpbridge|BlenderToDazStudio/i.test(path.basename(src));}});
  writeNew(this.root,ready,JSON.stringify({source,prepared:new Date().toISOString(),note:'Private runtime copy; external polling bridge omitted. Original installation untouched.'},null,2));
  this.onUpdate({id:'daz-runtime',action:'prepare native character engine',status:'complete',started:new Date().toISOString(),log:'Isolated runtime is ready.',directory:destination});return path.join(destination,'DAZStudio.exe');
 }
 async run(source,morphs={}){
  throw Error('Host DAZ execution was retired because it can start shared content services. Use the direct DSON importer.');
  if(this.active)throw Error('A native character job is already running.');
  const executable=await this.prepare();const dir=uniqueDir(path.join(this.root,'jobs'),'native-character');
  const id=path.basename(dir),output=path.join(dir,'character.fbx'),result=path.join(dir,'native-result.json');
  const spec={source,output,result,contentRoots:[path.join(process.env.PUBLIC||'C:/Users/Public','Documents','My DAZ 3D Library'),path.join(os.homedir(),'Documents','DAZ 3D','Studio','My Library'),path.join(os.homedir(),'Documents','DAZ 3D','Studio','My Daz Connect Library')],morphs};
  const jobfile=writeNew(this.root,path.join(dir,'native-job.json'),JSON.stringify(spec));
  const job={id,action:'native character',status:'running',started:new Date().toISOString(),directory:dir,output,log:''};this.onUpdate({...job});
  const args=['-instanceName','FusionStudioJob#','-headless','-noPrompt','-noDefaultScene','-cleanOnLaunch','true','-cleanOnExit','true','-copyAppSettings','!','-copySessionUI','!','-scriptArg',jobfile,this.script];
  const child=spawn(executable,args,{cwd:dir,env:{...isolatedEnv(this.root),DAZMCP_BRIDGE_ROOT:path.join(dir,'unused-bridge')},windowsHide:true,stdio:['ignore','pipe','pipe']});this.active=child;
  const stream=fs.createWriteStream(path.join(dir,'native.log'),{flags:'wx'});const collect=b=>{job.log=(job.log+b.toString()).slice(-14000);stream.write(b);this.onUpdate({...job});};child.stdout.on('data',collect);child.stderr.on('data',collect);
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>child.kill(),180000),finish=error=>{clearTimeout(timer);stream.end();this.active=null;job.status=error?'failed':'complete';job.error=error?.message;this.onUpdate({...job});if(error)reject(error);else resolve({...job,metadata:JSON.parse(fs.readFileSync(result,'utf8'))});};let settled=false;
   child.on('error',e=>{if(!settled){settled=true;finish(e);}});child.on('close',code=>{if(settled)return;settled=true;let error=null;try{if(!fs.existsSync(result))throw Error('The native engine did not return a result (exit '+code+'). Check its log.');const report=JSON.parse(fs.readFileSync(result,'utf8'));if(!report.ok)throw Error(report.error);if(!fs.existsSync(output))throw Error('Native character export did not produce a mesh.');}catch(e){error=e;}finish(error);});
  });
 }
 cancel(){this.active?.kill();}
}
module.exports={DazEngine};
