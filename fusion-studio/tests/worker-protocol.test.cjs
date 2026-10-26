const {test}=require('node:test'),assert=require('node:assert/strict');
const {PersistentWorker}=require('../electron/persistent-worker.cjs');
test('stale worker responses cannot finish a newer request; cancellation rejects pending work',async()=>{
 const transport=new PersistentWorker('unused','unused','unused',{}),sent=[];
 transport.child={pid:123,stdin:{write:s=>sent.push(JSON.parse(s))},kill(){}};transport.prefix='TEST ';transport.ready=true;
 const first=transport.request('first',()=>{});transport.line('TEST '+JSON.stringify({version:1,id:sent[0].id,ok:true}));assert.equal((await first).pid,123);
 const second=transport.request('second',()=>{});transport.line('TEST '+JSON.stringify({version:1,id:sent[0].id,ok:true}));assert.ok(transport.pending);assert.equal(transport.pending.spec,'second');
 transport.stop();await assert.rejects(second,/cancelled/);assert.equal(transport.child,null);
});
