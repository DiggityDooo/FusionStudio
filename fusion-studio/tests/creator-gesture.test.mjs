import test from 'node:test';
import assert from 'node:assert/strict';
import {runCreatorGesture} from '../src/creator-gesture.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const session=()=>{const end=deferred();return {ended:end.promise,finish:end.resolve};};
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
class Clock{next=0;entries=new Map();set=(fn)=>{const id=++this.next;this.entries.set(id,fn);return id;};clear=id=>this.entries.delete(id);fire(){const callbacks=[...this.entries.values()];this.entries.clear();for(const fn of callbacks)fn();}}

test('rapid preview changes coalesce to the latest recipe and commit final intent once',async()=>{
 const s=session(),clock=new Clock(),work=[],applied=[];let settles=0;const run=runCreatorGesture(s,{timers:clock,evaluate:value=>{const d=deferred();work.push({value,d});return d.promise;},apply:value=>applied.push(value.height),settle:()=>settles++});s.preview({height:1.7});s.preview({height:1.8});s.preview({height:1.9});s.finish({height:1.9});await flush();assert.equal(work.length,1);work[0].d.resolve({});await flush();assert.equal(work.length,2);assert.equal(work[1].value.height,1.9);work[1].d.resolve({});await run;assert.deepEqual(applied,[1.7,1.9]);assert.equal(settles,1);assert.equal(clock.entries.size,0);assert.equal(s.ready,false);assert.equal(s.preview({height:2}),false);
});

test('releasing a slider at an already applied value does not repeat the worker evaluation',async()=>{
 const s=session(),clock=new Clock();let calls=0,settles=0;const run=runCreatorGesture(s,{timers:clock,evaluate:async()=>{calls++;return {};},apply(){},settle:()=>settles++});s.preview({height:1.7});await flush();assert.equal(clock.entries.size,1);s.finish({height:1.7});await run;assert.equal(calls,1);assert.equal(settles,1);assert.equal(clock.entries.size,0);
});

test('pointer cancellation aborts pending work and ignores non-cooperative late results',async()=>{
 const s=session(),clock=new Clock(),work=deferred();let signal,applied=0,settled=0;const run=runCreatorGesture(s,{timers:clock,evaluate:(_,requestSignal)=>{signal=requestSignal;return work.promise;},apply:()=>applied++,settle:()=>settled++}),rejected=assert.rejects(run,/cancelled/);s.preview({height:1.8});s.finish(null);await rejected;assert.equal(signal.aborted,true);work.resolve({});await flush();clock.fire();assert.equal(applied,0);assert.equal(settled,0);assert.equal(clock.entries.size,0);
});

test('cancelling after a preview clears its delayed appearance refresh',async()=>{
 const s=session(),clock=new Clock();let settled=0;const run=runCreatorGesture(s,{timers:clock,evaluate:async()=>({}),apply(){},settle:()=>settled++}),rejected=assert.rejects(run,/cancelled/);s.preview({height:1.8});await flush();assert.equal(clock.entries.size,1);s.finish(null);await rejected;clock.fire();assert.equal(settled,0);assert.equal(clock.entries.size,0);
});

test('a scheduled appearance failure rejects the active gesture instead of escaping as an unhandled timer error',async()=>{
 const s=session(),clock=new Clock(),run=runCreatorGesture(s,{timers:clock,evaluate:async()=>({}),apply(){},settle(){throw Error('Invalid attachment');}}),rejected=assert.rejects(run,/Invalid attachment/);s.preview({height:1.8});await flush();assert.doesNotThrow(()=>clock.fire());await rejected;assert.equal(s.ready,false);assert.equal(clock.entries.size,0);
});

test('worker and apply failures stop queued previews and clean up their signals',async()=>{
 for(const mode of ['worker','apply']){const s=session(),clock=new Clock(),work=deferred();let signal,calls=0;const run=runCreatorGesture(s,{timers:clock,evaluate:(_,requestSignal)=>{signal=requestSignal;calls++;return work.promise;},apply(){if(mode==='apply')throw Error('Injected apply failure');},settle(){}}),rejected=assert.rejects(run,/Injected/);s.preview({height:1.7});s.preview({height:1.8});if(mode==='worker')work.reject(Error('Injected worker failure'));else work.resolve({});await rejected;assert.equal(calls,1);assert.equal(signal.aborted,true);assert.equal(clock.entries.size,0);}
});

test('external abort and invalid recipe keys cannot leave an active session or timer',async()=>{
 const s=session(),clock=new Clock(),abort=new AbortController(),work=deferred(),run=runCreatorGesture(s,{timers:clock,signal:abort.signal,evaluate:()=>work.promise,apply(){},settle(){}}),rejected=assert.rejects(run,/cancelled/);s.preview({height:1.7});abort.abort();await rejected;work.reject(Error('Late failure'));await flush();assert.equal(clock.entries.size,0);const next=session(),bad=runCreatorGesture(next,{timers:clock,evaluate:async()=>({}),apply(){},settle(){}}),invalid=assert.rejects(bad,/circular|cyclic/);const cyclic={};cyclic.self=cyclic;assert.equal(next.preview(cyclic),false);await invalid;assert.equal(next.ready,false);
});
