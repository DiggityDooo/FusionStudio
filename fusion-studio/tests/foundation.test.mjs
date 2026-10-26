import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {Editor} from '../src/editor.js';
import {OperatorRegistry,registerFoundationOperators} from '../src/operators.js';
import {validateLayout} from '../src/areas.js';
import {CommandHistory} from '../src/history.js';

function fixture(dense=false){
 const e=Object.create(Editor.prototype);Object.assign(e,{root:new THREE.Group(),scene:new THREE.Scene(),history:[],historyAt:-1,change(){},select(obj){this.selected=obj;},wire(){},frame(){},meshTools:{setMode(){}},timeline:{reset(){}}});e.scene.add(e.root);
 const mesh=new THREE.Mesh(dense?new THREE.SphereGeometry(1,1000,501):new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());e.root.add(mesh);e.select(mesh);e.commit();return {e,mesh};
}

test('metadata deltas materialize across snapshots, undo, deletion, branch truncation and reset',async()=>{
 let doc={object:{uuid:'root',children:[{uuid:'body',userData:{keep:'source'}}]}};const body=()=>doc.object.children[0],apply=(id,key,value)=>{assert.equal(id,'body');if(value===null)delete body().userData[key];else body().userData[key]=structuredClone(value);};
 const h=new CommandHistory({capture:()=>JSON.stringify(doc),restore:d=>{doc=d;},applyMetadata:apply});h.reset();const originalBaseline=h.baseline,first={girth:.9};apply('body','measurements',first);h.metadata('body','measurements',null,first,'Measure');first.girth=999;assert.equal(h.entries[0].after.girth,.9);assert.equal(h.baseline,originalBaseline);
 body().name='Snapshot edit';h.snapshot();await h.step(-1);assert.equal(body().name,undefined);assert.equal(body().userData.measurements.girth,.9);await h.step(-1);assert.equal(body().userData.measurements,undefined);assert.equal(body().userData.keep,'source');
 await h.step(1);await h.step(1);assert.equal(body().name,'Snapshot edit');assert.equal(body().userData.measurements.girth,.9);apply('body','measurements',null);h.metadata('body','measurements',{girth:.9},null,'Remove');body().name='After deletion';h.snapshot();await h.step(-1);assert.equal(body().userData.measurements,undefined);await h.step(-1);assert.equal(body().userData.measurements.girth,.9);
 apply('body','measurements',{girth:.8});h.metadata('body','measurements',{girth:.9},{girth:.8});assert.equal(h.canRedo,false);assert.equal(JSON.parse(h.materialize()).object.children[0].userData.measurements.girth,.8);h.reset();assert.equal(h.metadataChanges.size,0);assert.equal(h.canUndo,false);
});
test('200 delta transforms on 1M triangles roundtrip without copying geometry',async()=>{
 const {e,mesh}=fixture(true),geometry=mesh.geometry,baseline=e.journal.baseline;
 const registry=new OperatorRegistry(e);registerFoundationOperators(registry,e,()=>{});e.operators=registry;
 global.gc?.();const heapBefore=process.memoryUsage().heapUsed;
 const start=performance.now();for(let i=1;i<=200;i++)await e.transformField('position','x',i/100);
 const elapsed=performance.now()-start;assert.equal(e.journal.entries.length,200);assert.ok(e.journal.entries.every(n=>n.type==='transform'));assert.equal(e.journal.baseline,baseline);assert.ok(e.journal.deltaBytes<64*1024*1024);
 for(let i=0;i<200;i++)await e.undo();assert.equal(mesh.position.x,0);assert.equal(mesh.geometry,geometry);
 for(let i=0;i<200;i++)await e.redo();assert.equal(mesh.position.x,2);assert.equal(mesh.geometry,geometry);
 global.gc?.();const measuredHeapDelta=global.gc?Math.max(0,process.memoryUsage().heapUsed-heapBefore):null;if(measuredHeapDelta!==null)assert.ok(measuredHeapDelta<64*1024*1024);
 fs.mkdirSync('test-output',{recursive:true});fs.writeFileSync('test-output/delta-history-results.json',JSON.stringify({passed:true,triangles:geometry.index.count/3,steps:200,totalTransformMs:elapsed,incrementalHistoryUpperEstimateBytes:e.journal.deltaBytes,measuredHeapDeltaBytes:measuredHeapDelta,method:'Node heapUsed after forced GC before and after 200 transforms plus undo/redo; includes incidental allocations/noise, excludes baseline mesh and GPU memory. Delta JSON size separately estimated; geometry identity unchanged.'},null,2));
});
test('mixed delta/snapshot history restores transforms, material edits and branch truncation',async()=>{
 const {e,mesh}=fixture();e._transformField('position','x',2);e.surface('roughness',.25);e._transformField('position','x',3);
 await e.undo();assert.equal(e.root.children[0].position.x,2);
 await e.undo();assert.equal(e.root.children[0].position.x,2);assert.equal(e.root.children[0].material.roughness,1);
 await e.undo();assert.equal(e.root.children[0].position.x,0);
 await e.redo();await e.redo();assert.equal(e.root.children[0].material.roughness,.25);
 e.select(e.root.children[0]);e._transformField('position','y',4);assert.equal(e.journal.canRedo,false);
 e.rename('Branched');await e.undo();assert.equal(e.root.children[0].position.y,4);assert.equal(e.root.children[0].position.x,2);assert.notEqual(e.root.children[0].name,'Branched');
});
test('operator cancellation, poll, validation and concurrency prevent execution',async()=>{
 let executions=0,release;const events=[];const registry=new OperatorRegistry({}, {preflight:()=>new Promise(resolve=>release=resolve),onEvent:e=>events.push(e)});
 registry.register({id:'test',label:'Test',validate:p=>{if(!Number.isFinite(p.value))throw Error('invalid');return p;},execute:()=>executions++});
 await assert.rejects(registry.run('test',{value:NaN}),/invalid/);assert.equal(registry.running,null);
 const pending=registry.run('test',{value:1});await assert.rejects(registry.run('test',{value:1}),/Finish/);release(false);await pending;assert.equal(executions,0);assert.equal(registry.running,null);assert.ok(events.some(e=>e.status==='cancelled'));
 registry.register({id:'blocked',label:'Unavailable',poll:()=>false,execute:()=>executions++});await assert.rejects(registry.run('blocked'),/unavailable/);assert.equal(executions,0);
});
test('primitive insertion delta survives transform and snapshot edit boundaries',async()=>{
 const {e}=fixture();const original=e.root.children[0].uuid;const cube=e._primitive('cube');assert.equal(e.journal.entries.at(-1).type,'insert');
 e._transformField('position','x',5);e.rename('Edited cube');await e.undo();assert.equal(e.root.children[1].position.x,5);await e.undo();assert.equal(e.root.children[1].position.x,0);await e.undo();assert.equal(e.root.children.length,1);assert.equal(e.root.children[0].uuid,original);
 await e.redo();assert.equal(e.root.children[1].uuid,cube.uuid);await e.redo();await e.redo();assert.equal(e.root.children[1].position.x,5);assert.equal(e.root.children[1].name,'Edited cube');
});
test('insertion records are immutable when later metadata is edited',async()=>{
 const {e}=fixture();const cube=e._primitive('cube');cube.userData.later='edited';e.commit();await e.undo();assert.equal(e.root.children[1].userData.later,undefined);await e.redo();assert.equal(e.root.children[1].userData.later,'edited');
});
test('layout validation rejects unknown editors, duplicate IDs and invalid ratios',()=>{
 const valid={id:'split',axis:'row',ratio:.6,children:[{id:'v',type:'viewport'},{id:'l',type:'log'}]};assert.equal(validateLayout(valid),valid);
 assert.throws(()=>validateLayout({...valid,ratio:2}));assert.throws(()=>validateLayout({id:'a',type:'fake'}));assert.throws(()=>validateLayout({...valid,children:[valid.children[0],valid.children[0]]}));
});
