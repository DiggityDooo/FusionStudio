const path=require('node:path');
const crypto=require('node:crypto');
const {fork}=require('node:child_process');
const engines=new Set();
process.once('exit',()=>{for(const engine of engines)engine.active?.child.kill();});
function launch(entry){
  if(process.versions.electron){const {utilityProcess}=require('electron');const child=utilityProcess.fork(entry,[],{serviceName:'Fusion geometry',stdio:'ignore',execArgv:['--max-old-space-size=512']});return {child,send:data=>child.postMessage(data),kill:()=>child.kill(),kind:'electron-utility'};}
  const child=fork(entry,[],{windowsHide:true,stdio:['ignore','ignore','ignore','ipc'],serialization:'advanced',execArgv:['--max-old-space-size=512']});return {child,send:data=>child.send(data),kill:()=>child.kill('SIGKILL'),kind:'node-child'};
}
class GeometryEngine {
  constructor(binary=path.join(__dirname,'../native/fusion_geometry.node'),{timeoutMs=30000}={}){if(!Number.isFinite(timeoutMs)||timeoutMs<50||timeoutMs>120000)throw Error('Invalid geometry timeout');this.binary=binary;this.timeoutMs=timeoutMs;this.active=null;}
  run(method,request){
    if(!['analyzeMesh','drapeGarment','editMesh','bindGarment','placeGarment','auditClothContacts','auditSurfaceContacts'].includes(method))return Promise.reject(Error('Unsupported geometry operation.'));
    if(request?.executionBudget!==undefined&&(method!=='drapeGarment'||!['interactive','offline'].includes(request.executionBudget)))return Promise.reject(Error('Unsupported geometry execution budget.'));
    if(this.active)return Promise.reject(Error('A geometry operation is already running.'));
    const timeoutMs=request?.executionBudget==='offline'?120000:this.timeoutMs;
    const payload=JSON.stringify(request);if(payload.length>96000000)return Promise.reject(Error('Geometry request exceeds 96 MB. Reduce the editable mesh density.'));
    return new Promise((resolve,reject)=>{
      let transport;try{transport=launch(path.join(__dirname.replace(/app\.asar(?=[\\/])/,'app.asar.unpacked'),'geometry-worker.cjs'));}catch(error){reject(error);return;}
      const {child}=transport,id=crypto.randomBytes(16).toString('hex'),job={child,id,kind:transport.kind,phase:'starting',pid:child.pid,outcome:null,exited:false,timeoutMs};let exitResolve;job.exitedPromise=new Promise(r=>exitResolve=r);this.active=job;engines.add(this);
      const exited=(code,error)=>{if(job.exited)return;job.exited=true;clearTimeout(timer);if(this.active===job)this.active=null;engines.delete(this);exitResolve();const outcome=job.outcome;if(outcome)outcome.error?reject(outcome.error):resolve(outcome.result);else reject(error||Error('Geometry process exited before completing ('+code+'). Retry the operation.'));};
      // Keep the job active until OS process exit: Cancel must free native CPU
      // work before another solve can start or its transaction can finish.
      const stop=(error,result)=>{if(job.exited||job.outcome)return;job.outcome={error,result};job.phase='stopping';if(child.pid!==undefined)transport.kill();};job.stop=stop;
      const timer=setTimeout(()=>stop(Error('Geometry job exceeded '+(timeoutMs/1000)+' seconds. Reduce garment density.')),timeoutMs);
      child.on('spawn',()=>{job.pid=child.pid;if(job.outcome)transport.kill();});
      child.on('message',m=>{if(this.active!==job||job.outcome||job.exited)return;if(!m||m.version!==1){stop(Error('Invalid geometry process protocol.'));return;}if(m.phase==='ready'){if(job.sent)return;job.sent=true;try{transport.send({version:1,id,binary:this.binary,method,payload});}catch(error){stop(error);}return;}if(m.id!==id)return;if(m.phase==='started'){job.phase='native';return;}if(m.phase==='result'){if(m.error!==undefined)stop(Error(String(m.error)));else if(m.result&&typeof m.result==='object')stop(null,m.result);else stop(Error('Malformed geometry result.'));}});
      child.on('error',error=>{const e=error instanceof Error?error:Error('Geometry process failed: '+error);if(child.pid===undefined)exited(null,e);else stop(e);});
      child.on('exit',code=>exited(code));
    });
  }
  close(){const job=this.active;if(!job)return Promise.resolve();job.stop(Error('Geometry job cancelled.'));return job.exitedPromise;}
}
module.exports={GeometryEngine};
