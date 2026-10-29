// A gesture owns its preview work and delayed synchronous appearance refresh.
// Async garments remain in the enclosing dependency transaction.
export async function runCreatorGesture(session,{evaluate,apply,settle,signal,settleDelay=120,keyOf=JSON.stringify,timers}={}){
 if(!session?.ended?.then||typeof session.finish!=='function'||![evaluate,apply,settle].every(fn=>typeof fn==='function'))throw Error('Invalid character slider session.');
 if(signal?.aborted)throw Error('Character slider cancelled.');
 const clock=timers||{set:(fn,ms)=>setTimeout(fn,ms),clear:id=>clearTimeout(id)},controller=new AbortController(),requestSignal=AbortSignal.any([controller.signal,...(signal?[signal]:[])]);
 let active=true,ending=false,latest=null,runner=null,failure=null,timer=null,inFlightKey=null,hasApplied=false,appliedKey,resolveEnd,rejectEnd;
 const completion=new Promise((resolve,reject)=>{resolveEnd=resolve;rejectEnd=reject;});
 const clear=()=>{if(timer!==null){clock.clear(timer);timer=null;}};
 const fail=error=>{if(!active||failure)return;failure=error instanceof Error?error:Error(String(error));clear();rejectEnd(failure);try{session.finish(null);}catch{/* Preserve the original evaluation error. */}};
 const schedule=()=>{
  clear();if(!active||ending||failure||latest||inFlightKey!==null)return;
  timer=clock.set(()=>{timer=null;if(!active||ending||failure||latest||inFlightKey!==null)return;try{settle();}catch(error){fail(error);}},settleDelay);
 };
 async function process(){
  while(active&&latest){
   const next=latest;latest=null;inFlightKey=next.key;
   const result=await evaluate(next.value,requestSignal);if(!active||requestSignal.aborted)return;
   apply(next.value,result);appliedKey=next.key;hasApplied=true;inFlightKey=null;
  }
  schedule();
 }
 function start(){
  if(runner||!active||failure)return;
  runner=process().catch(fail).finally(()=>{runner=null;if(active&&!failure&&latest)start();});
 }
 function enqueue(value){
  clear();const key=keyOf(value);if(typeof key!=='string')throw Error('Character slider recipes must have a serializable key.');
  if(latest?.key===key||!latest&&(inFlightKey===key||inFlightKey===null&&hasApplied&&appliedKey===key)){schedule();return false;}
  latest={value,key};start();return true;
 }
 session.preview=value=>{if(!active||ending||failure)return false;try{return enqueue(value);}catch(error){fail(error);return false;}};
 const abort=()=>fail(Error('Character slider cancelled.'));session.ended.then(resolveEnd,fail);requestSignal.addEventListener('abort',abort,{once:true});session.ready=true;
 try{
  const final=await completion;if(failure)throw failure;if(final==null||requestSignal.aborted)throw Error('Character slider cancelled.');
  ending=true;session.ready=false;clear();enqueue(final);
  while(runner||latest){if(!runner)start();await runner;if(failure)throw failure;}
  if(requestSignal.aborted)throw Error('Character slider cancelled.');settle();
 }finally{
  active=false;ending=true;latest=null;clear();requestSignal.removeEventListener('abort',abort);controller.abort();session.ready=false;session.preview=()=>false;
 }
}
