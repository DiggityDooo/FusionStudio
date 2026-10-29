export function validateCreatorResult(result,count){
 if(!(result?.positions instanceof Float32Array)||result.positions.length!==count||result.positions.some(v=>!Number.isFinite(v)||Math.abs(v)>100)||!Number.isFinite(result.scale)||result.scale<=0||result.scale>20||!Number.isFinite(result.ground)||Math.abs(result.ground)>100||!Number.isFinite(result.milliseconds)||result.milliseconds<0||!Number.isInteger(result.sparseDeltas)||result.sparseDeltas<0||result.sparseDeltas>2000000)throw Error('Character worker returned malformed geometry or diagnostics.');
 return result;
}

function contextRecord(context){
 const text=JSON.stringify(context);if(context!==undefined&&text===undefined||text?.length>16384)throw Error('Character worker context must be bounded JSON data.');
 const copy=text===undefined?undefined:JSON.parse(text);
 function ordered(value,depth=0){if(depth>32)throw Error('Character worker context is too deeply nested.');if(Array.isArray(value))return value.map(v=>ordered(v,depth+1));if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key],depth+1)]));return value;}
 return {copy,signature:JSON.stringify(ordered(copy))};
}

// One persistent worker can serve several independent character evaluations.
// Route by request ID; one cancellation must not consume another job's reply.
export class CreatorWorkerClient {
 constructor({workerFactory=()=>new Worker(new URL('./creator-worker.js',import.meta.url),{type:'module'}),timers,maxPending=32}={}){
  if(!Number.isInteger(maxPending)||maxPending<1||maxPending>32)throw Error('Character worker capacity must be between 1 and 32.');
  this.workerFactory=workerFactory;this.timers=timers||{set:(fn,ms)=>setTimeout(fn,ms),clear:id=>clearTimeout(id)};this.maxPending=maxPending;this.worker=null;this.pending=new Map();
 }
 getWorker(){
  if(this.worker)return this.worker;
  const worker=this.workerFactory();if(!worker||typeof worker.postMessage!=='function'||typeof worker.terminate!=='function')throw Error('The character worker could not be created.');this.worker=worker;
  worker.onmessage=event=>this.receive(worker,event.data);
  worker.onerror=event=>{event.preventDefault?.();this.failWorker(worker,event.message||'Character worker failed.');};
  worker.onmessageerror=()=>this.failWorker(worker,'Character worker reply could not be decoded.');return worker;
 }
 disposeWorker(worker){
  if(!worker||this.worker!==worker)return;this.worker=null;worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;worker.terminate();
 }
 settle(job,error,result,{stopWhenIdle=false}={}){
  if(this.pending.get(job.id)!==job)return;this.pending.delete(job.id);this.timers.clear(job.timer);job.signal?.removeEventListener('abort',job.abort);
  if(stopWhenIdle&&!this.pending.size)this.disposeWorker(job.worker);error?job.reject(error):job.resolve(result);
 }
 failWorker(worker,message){
  if(this.worker!==worker)return;this.disposeWorker(worker);for(const job of [...this.pending.values()])this.settle(job,Error(message));
 }
 receive(worker,message){
  if(this.worker!==worker)return;
  if(!message||typeof message.id!=='string'){this.failWorker(worker,'Character worker reply is missing its request identity.');return;}
  const job=this.pending.get(message.id);if(!job)return;
  try{
   if(contextRecord(message.context).signature!==job.contextSignature)throw Error('Character worker revision mismatch.');
   if(typeof message.error==='string')throw Error(message.error.slice(0,2000)||'Character worker evaluation failed.');
   this.settle(job,null,validateCreatorResult(message.result,job.count));
  }catch(error){this.settle(job,error);}
 }
 async evaluate(input,{context,signal,timeout=30000}={}){
  if(signal?.aborted)throw Error('Character update cancelled.');
  if(!Number.isFinite(timeout)||timeout<1||timeout>120000)throw Error('Character worker timeout must be between 1 and 120000 ms.');
  if(this.pending.size>=this.maxPending)throw Error('Character worker queue is full. Wait for a pending evaluation or cancel it.');
  const count=input?.positions?.length;if(!Number.isSafeInteger(count)||count<3||count>600000||count%3)throw Error('Character worker input has invalid position dimensions.');
  const record=contextRecord(context),worker=this.getWorker();
  return new Promise((resolve,reject)=>{
   const job={id:crypto.randomUUID(),worker,resolve,reject,count,contextSignature:record.signature,signal,timer:null,abort:null};
   job.abort=()=>this.settle(job,Error('Character update cancelled.'),null,{stopWhenIdle:true});this.pending.set(job.id,job);
   try{
    job.timer=this.timers.set(()=>this.settle(job,Error('Character update timed out. Reduce the active shapes or retry.'),null,{stopWhenIdle:true}),timeout);
    signal?.addEventListener('abort',job.abort,{once:true});if(signal?.aborted){job.abort();return;}worker.postMessage({id:job.id,context:record.copy,input});
   }catch(error){this.settle(job,error,null,{stopWhenIdle:true});}
  });
 }
 close(message='Character worker closed.'){
  this.disposeWorker(this.worker);for(const job of [...this.pending.values()])this.settle(job,Error(message));
 }
}

let sharedClient;
export async function evaluateCreatorWorker(input,{WorkerClass,...options}={}){
 if(WorkerClass){const client=new CreatorWorkerClient({workerFactory:()=>new WorkerClass(new URL('./creator-worker.js',import.meta.url),{type:'module'})});try{return await client.evaluate(input,options);}finally{client.close();}}
 return (sharedClient??=new CreatorWorkerClient()).evaluate(input,options);
}
export function disposeCreatorWorker(){sharedClient?.close();sharedClient=null;}
