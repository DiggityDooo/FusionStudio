import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {CreatorWorkerClient,evaluateCreatorWorker,disposeCreatorWorker} from '../src/creator-worker-client.js';
import {computeCreator} from '../src/creator-data.js';
const geometry=new T.TorusGeometry(.5,.15,64,256),input=height=>({positions:geometry.attributes.position.array,bodyIds:geometry.index.array,targets:[],height}),context=(objectId='actor',requestId=1)=>({projectId:'project',objectId,revision:3,inputHash:'a'.repeat(64),requestId});
class Clock{next=0;entries=new Map();set=(fn,ms)=>{const id=++this.next;this.entries.set(id,{fn,ms});return id;};clear=id=>this.entries.delete(id);fire(id){const row=this.entries.get(id);this.entries.delete(id);row.fn();}}
class MockWorker{jobs=[];terminated=0;postMessage(job){this.jobs.push(structuredClone(job));}terminate(){this.terminated++;}reply(job,overrides={}){this.onmessage?.({data:{id:job.id,context:job.context,result:computeCreator(job.input),...overrides}});}}
function fixture(maxPending=32){const workers=[],clock=new Clock(),client=new CreatorWorkerClient({workerFactory:()=>{const w=new MockWorker();workers.push(w);return w;},timers:clock,maxPending});return {client,workers,clock};}
const height=result=>{let max=-Infinity;for(let i=1;i<result.positions.length;i+=3)max=Math.max(max,result.positions[i]);return max;};

test('concurrent detailed-mesh jobs route out-of-order replies to their own captured contexts',async()=>{
 const {client,workers,clock}=fixture(),ctx=context('first'),a=client.evaluate(input(1.7),{context:ctx}),b=client.evaluate(input(1.8),{context:context('second',2)}),pending=Promise.all([a,b]);ctx.revision=99;const w=workers[0];w.reply(w.jobs[1],{context:Object.fromEntries(Object.entries(w.jobs[1].context).reverse())});w.reply(w.jobs[0]);const results=await pending;assert.ok(Math.abs(height(results[0])-1.7)<1e-6);assert.ok(Math.abs(height(results[1])-1.8)<1e-6);assert.equal(client.pending.size,0);assert.equal(clock.entries.size,0);assert.equal(workers.length,1);client.close();
});

test('cancelling one request keeps another alive, while cancelling the last request resets the worker',async()=>{
 const {client,workers,clock}=fixture(),controller=new AbortController(),a=client.evaluate(input(1.7),{context:context('a'),signal:controller.signal}),b=client.evaluate(input(1.8),{context:context('b',2)}),pending=Promise.allSettled([a,b]),w=workers[0];controller.abort();assert.equal(w.terminated,0);w.reply(w.jobs[0]);w.reply(w.jobs[1]);const result=await pending;assert.match(result[0].reason.message,/cancelled/);assert.equal(result[1].status,'fulfilled');assert.equal(clock.entries.size,0);
 const last=new AbortController(),c=client.evaluate(input(1.9),{signal:last.signal}),rejected=assert.rejects(c,/cancelled/);last.abort();await rejected;assert.equal(w.terminated,1);assert.equal(client.worker,null);client.close();
});

test('per-request timeouts do not discard valid peer jobs and all timers are cleared',async()=>{
 const {client,workers,clock}=fixture(),a=client.evaluate(input(1.7),{timeout:10}),b=client.evaluate(input(1.8),{timeout:100}),pending=Promise.allSettled([a,b]),w=workers[0],first=[...client.pending.values()][0];clock.fire(first.timer);assert.equal(w.terminated,0);w.reply(w.jobs[1]);const result=await pending;assert.match(result[0].reason.message,/timed out/);assert.equal(result[1].status,'fulfilled');assert.equal(clock.entries.size,0);client.close();
});

test('fatal worker errors reject every active request and a fresh worker can retry without stale callbacks',async()=>{
 const {client,workers,clock}=fixture(),a=client.evaluate(input(1.7)),b=client.evaluate(input(1.8)),pending=Promise.allSettled([a,b]),old=workers[0],late=old.onmessage;old.onerror({message:'Injected process failure'});const result=await pending;assert.ok(result.every(r=>r.status==='rejected'&&/process failure/.test(r.reason.message)));assert.equal(old.terminated,1);assert.equal(clock.entries.size,0);const retry=client.evaluate(input(1.9)),next=workers[1];late({data:{id:next.jobs[0].id,context:next.jobs[0].context,result:computeCreator(input(1.3))}});assert.equal(client.pending.size,1);next.reply(next.jobs[0]);assert.ok(Math.abs(height(await retry)-1.9)<1e-6);client.close();
});

test('revision and malformed-result failures stay attached to their request',async()=>{
 for(const mode of ['revision','result','error']){const {client,workers}=fixture(),a=client.evaluate(input(1.7),{context:context('a')}),b=client.evaluate(input(1.8),{context:context('b',2)}),pending=Promise.allSettled([a,b]),w=workers[0];if(mode==='revision')w.reply(w.jobs[0],{context:{...w.jobs[0].context,revision:99}});else if(mode==='result')w.reply(w.jobs[0],{result:{...computeCreator(input(1.7)),positions:new Float32Array([NaN,0,0])}});else w.reply(w.jobs[0],{error:'Unsupported input'});w.reply(w.jobs[1]);const result=await pending;assert.equal(result[0].status,'rejected');assert.equal(result[1].status,'fulfilled');client.close();}
});

test('unidentified or undecodable replies reset the failed worker and settle all affected requests',async()=>{
 for(const mode of ['identity','decode']){const {client,workers,clock}=fixture(),a=client.evaluate(input(1.7)),b=client.evaluate(input(1.8)),pending=Promise.allSettled([a,b]),w=workers[0];if(mode==='identity')w.onmessage({data:{result:{}}});else w.onmessageerror();assert.ok((await pending).every(r=>r.status==='rejected'));assert.equal(client.pending.size,0);assert.equal(clock.entries.size,0);assert.equal(w.terminated,1);}
});

test('queue and request limits reject before spawning extra work',async()=>{
 const {client,workers,clock}=fixture(2),cancel=new AbortController();cancel.abort();await assert.rejects(client.evaluate(input(1.7),{signal:cancel.signal}),/cancelled/);await assert.rejects(client.evaluate(input(1.7),{timeout:Infinity}),/timeout/);await assert.rejects(client.evaluate({positions:[]}),/position dimensions/);await assert.rejects(client.evaluate(input(1.7),{context:{large:'x'.repeat(17000)}}),/bounded JSON/);assert.equal(workers.length,0);const a=client.evaluate(input(1.7)),b=client.evaluate(input(1.8)),pending=Promise.allSettled([a,b]);await assert.rejects(client.evaluate(input(1.9)),/queue is full/);client.close();assert.ok((await pending).every(r=>r.status==='rejected'));assert.equal(clock.entries.size,0);
});

test('the shared exported bridge and explicitly owned workers retain their lifecycle contracts',async()=>{
 const saved=globalThis.Worker,workers=[];class BridgeWorker extends MockWorker{constructor(){super();workers.push(this);}}
 globalThis.Worker=BridgeWorker;
 try{const a=evaluateCreatorWorker(input(1.7),{context:context('a')}),b=evaluateCreatorWorker(input(1.8),{context:context('b',2)}),pending=Promise.all([a,b]),w=workers[0];w.reply(w.jobs[1]);w.reply(w.jobs[0]);assert.equal((await pending).length,2);assert.equal(workers.length,1);disposeCreatorWorker();assert.equal(w.terminated,1);const owned=evaluateCreatorWorker(input(1.9),{WorkerClass:BridgeWorker}),next=workers[1];next.reply(next.jobs[0]);await owned;assert.equal(next.terminated,1);}finally{disposeCreatorWorker();globalThis.Worker=saved;}
});
