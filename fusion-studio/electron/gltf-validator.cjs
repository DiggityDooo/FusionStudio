const path=require('node:path'),crypto=require('node:crypto');
const {Worker}=require('node:worker_threads');
const {MAX_BYTES}=require('./gltf-inspection.cjs');
class GltfValidator {
 constructor({timeoutMs=30000}={}){if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>120000)throw Error('Invalid validation timeout.');this.timeoutMs=timeoutMs;this.active=null;}
 run({file,data,context}={}){
  if(this.active)return Promise.reject(Error('A glTF inspection is already running.'));
  if((typeof file==='string')===(typeof data==='string')||file!==undefined&&(typeof file!=='string'||!file.length||file.length>32768)||data!==undefined&&(typeof data!=='string'||data.length>Math.ceil(MAX_BYTES/3)*4||!data.length||data.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(data)))return Promise.reject(Error('Choose a glTF file or a valid embedded GLB below 64 MiB.'));
  if(context!==undefined&&(!context||typeof context.projectId!=='string'||context.projectId.length>100||typeof context.objectId!=='string'||context.objectId.length>100||!Number.isSafeInteger(context.revision)||context.revision<0||!Number.isSafeInteger(context.requestId)||context.requestId<1||!/^[a-f0-9]{64}$/.test(context.inputHash||'')))return Promise.reject(Error('Invalid glTF inspection context.'));
  const id=crypto.randomBytes(16).toString('hex');
  return new Promise((resolve,reject)=>{
   let worker;try{worker=new Worker(path.join(__dirname.replace(/app\.asar(?=[\\/])/,'app.asar.unpacked'),'gltf-validator-worker.cjs'),{workerData:{id,file,data:data===undefined?undefined:Buffer.from(data,'base64'),context},resourceLimits:{maxOldGenerationSizeMb:512,maxYoungGenerationSizeMb:32}});}catch(error){reject(error);return;}
   const job={id,worker};this.active=job;let finishing=false,timer;
   job.stop=(error,result)=>{if(finishing)return job.done;finishing=true;clearTimeout(timer);job.done=worker.terminate().then(()=>{if(this.active===job)this.active=null;error?reject(error):resolve(result);});return job.done;};
   timer=setTimeout(()=>job.stop(Error('glTF inspection exceeded its time limit. Reduce the asset size.')),this.timeoutMs);
   worker.on('message',m=>{if(m?.id!==id||this.active!==job||finishing)return;if(m.error)job.stop(Error(m.error));else if(m.result?.schema===1&&m.result.id===id&&/^[a-f0-9]{64}$/.test(m.result.sha256||''))job.stop(null,m.result);else job.stop(Error('Malformed glTF inspection result.'));});
   worker.on('error',e=>job.stop(e));worker.on('exit',code=>{if(!finishing)job.stop(Error('glTF inspector exited before completing ('+code+'). Inspect again.'));});
  });
 }
 close(){return this.active?.stop(Error('glTF inspection cancelled.'))||Promise.resolve();}
}
module.exports={GltfValidator};
