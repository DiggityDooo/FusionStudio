import test from 'node:test';
import assert from 'node:assert/strict';
import {validSurfaceContext,matchingSurfaceContext} from '../src/surface-protocol.js';
import {surfacePreparationReply} from '../src/surface-preparation.js';
import {prepareSurfaceJob} from '../src/surface-jobs.js';
import {starterPattern,migratePattern} from '../src/patterns.js';
const context=()=>({projectId:'project',objectId:'pattern',revision:3,requestId:4,inputHash:'a'.repeat(64)});

test('scene preparation context requires all typed identity fields and distinguishes revisions and hashes',()=>{
 const c=context();assert.equal(validSurfaceContext(c),true);assert.equal(matchingSurfaceContext(c,structuredClone(c)),true);
 for(const patch of [{revision:-1},{requestId:0},{inputHash:1n},{inputHash:'x'.repeat(64)},{objectId:''},{extra:1}])assert.equal(validSurfaceContext({...c,...patch}),false);
 for(const key of Object.keys(c)){const changed={...c};delete changed[key];assert.equal(validSurfaceContext(changed),false);}
 assert.equal(matchingSurfaceContext(c,{...c,revision:4}),false);assert.equal(matchingSurfaceContext(c,{...c,inputHash:'b'.repeat(64)}),false);assert.equal(matchingSurfaceContext(undefined,c),false);
});

test('real detailed meshing replies echo the request identity, report start, preserve source and reject malformed requests',()=>{
 const doc=migratePattern(starterPattern());doc.particleDistance=.025;const before=JSON.stringify(doc),c=context(),progress=[];
 const reply=surfacePreparationReply({version:1,context:c,action:'patternMesh',input:{doc}},message=>progress.push(message));
 assert.equal(reply.version,1);assert.deepEqual(reply.context,c);assert.equal(reply.error,undefined);assert.ok(reply.result.faces.length>=4000);assert.equal(JSON.stringify(doc),before);assert.deepEqual(progress,[{version:1,context:c,phase:'started'}]);
 for(const request of [{version:0},{version:1,context:{...c,revision:-1}},{version:1,action:'unknown'},{version:1,action:'patternMesh',input:{doc:{}}}])assert.equal(typeof surfacePreparationReply(request).error,'string');
});

async function withWorker(run){
 const original=globalThis.Worker,instances=[];globalThis.Worker=class{constructor(){instances.push(this);this.terminations=0;}postMessage(request){this.request=request;}terminate(){this.terminations++;}};
 try{await run(instances);}finally{if(original===undefined)delete globalThis.Worker;else globalThis.Worker=original;}
}
test('preparation client ignores duplicate start and late messages, rejects a foreign reply and releases both workers',async()=>withWorker(async workers=>{
 const c=context();let starts=0;
 const pending=prepareSurfaceJob('patternMesh',{doc:{}},{context:c,onStarted:()=>starts++}),w=workers[0];
 for(let i=0;i<2;i++)w.onmessage({data:{version:1,context:c,phase:'started'}});assert.equal(starts,1);
 w.onmessage({data:{version:1,context:c,result:{accepted:true}}});assert.deepEqual(await pending,{accepted:true});assert.equal(w.terminations,1);
 w.onmessage({data:{version:1,context:c,error:'late'}});assert.equal(w.terminations,1);
 const wrong=prepareSurfaceJob('patternMesh',{doc:{}},{context:c}),failure=assert.rejects(wrong,/does not match/),other=workers[1];other.onmessage({data:{version:1,context:{...c,requestId:5},result:{wrong:true}}});await failure;assert.equal(other.terminations,1);
}));
test('preparation cancellation, timeout, worker errors and bad replies release work without returning a partial result',async()=>withWorker(async workers=>{
 const abort=new AbortController();abort.abort();assert.throws(()=>prepareSurfaceJob('patternMesh',{}, {signal:abort.signal}),/cancelled/);assert.equal(workers.length,0);
 const running=new AbortController(),pending=prepareSurfaceJob('patternMesh',{}, {signal:running.signal}),cancelled=assert.rejects(pending,/cancelled/);running.abort();await cancelled;assert.equal(workers[0].terminations,1);
 await assert.rejects(prepareSurfaceJob('patternMesh',{}, {timeoutMs:10}),/exceeded/);assert.equal(workers[1].terminations,1);
 const crashed=prepareSurfaceJob('patternMesh',{}),crash=assert.rejects(crashed,/injected/);let prevented=false;workers[2].onerror({message:'injected',preventDefault(){prevented=true;}});await crash;assert.equal(prevented,true);assert.equal(workers[2].terminations,1);
 const malformed=prepareSurfaceJob('patternMesh',{}),bad=assert.rejects(malformed,/does not match/);workers[3].onmessage({data:{result:{}}});await bad;assert.equal(workers[3].terminations,1);
}));
