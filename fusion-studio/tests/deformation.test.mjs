import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import {evaluateOperations,evaluateFormulas,deformSparse,initializeDeformation,evaluateCharacter,setMorph,addPoseCorrective,evaluatedCharacterTriangles} from '../src/deformation.js';
import {Timeline} from '../src/timeline.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {compactPrimitive} from '../src/geometry-interchange.js';
import {deformationTransaction,wireDeformation} from '../src/deformation-ui.js';
import {CommandHistory} from '../src/history.js';
import {OperatorRegistry} from '../src/operators.js';

test('bounded RPN arithmetic, splines and invalid operations',()=>{
  const evalOps=ops=>evaluateOperations(ops,()=>2);
  assert.equal(evalOps([{op:'push',val:3},{op:'push',val:2},{op:'sub'},{op:'neg'},{op:'inv'}]),-1);
  for(const op of ['spline_linear','spline_constant','spline_tcb']){const knots=op==='spline_tcb'?[[0,0,0,0,0],[1,2,0,0,0]]:[[0,0],[1,2]];assert.equal(evalOps([{op:'push',val:.25},...knots.map(val=>({op:'push',val})),{op:'push',val:2},{op}]),op==='spline_constant'?0:.5);}
  assert.throws(()=>evalOps([{op:'push',val:1},{op:'push',val:0},{op:'div'}]),/zero/);assert.throws(()=>evalOps([{op:'execute',val:'anything'}]),/Unsupported/);assert.throws(()=>evalOps([{op:'add'}]),/underflow/);assert.throws(()=>evalOps(Array.from({length:513},()=>({op:'push',val:0}))),/limit/);
  assert.throws(()=>evalOps([{op:'push',val:1},{op:'push',val:2}]),/exactly one/);
});
test('formula dependency order, accumulation stages, missing references and cycles',()=>{
  const channels=[{id:'a',value:2},{id:'b',value:1},{id:'c',value:0}],formulas=[{output:'c?value',operations:[{op:'push',url:'b?value'}]},{output:'b?value',operations:[{op:'push',url:'a?value'},{op:'push',val:3},{op:'mult'}]},{output:'b?value',stage:'multiply',operations:[{op:'push',val:2}]}];
  const r=evaluateFormulas(channels,formulas);assert.equal(r.values['b?value'],14);assert.equal(r.values['c?value'],14);assert.equal(r.valid,true);
  const cycle=evaluateFormulas(channels,[{output:'a',operations:[{op:'push',url:'b'}]},{output:'b',operations:[{op:'push',url:'a'}]}]);assert.equal(cycle.valid,false);assert.ok(cycle.errors.some(e=>/cycle/.test(e.message)));assert.equal(cycle.values['c?value'],0);
  assert.match(evaluateFormulas(channels,[{output:'c',operations:[{op:'push',url:'missing'}]}]).errors[0].message,/Unresolved/);
});
test('sparse remapping applies to every UV/material split vertex at 26k base resolution',()=>{
  const count=26000,base=new Float32Array((count+2)*3),ids=Array.from({length:count},(_,i)=>i).concat([7,7]);
  const rows=Array.from({length:count},(_,i)=>[i,.001*i,.002,-.001]),result=deformSparse(base,ids,[{id:'shape',deltas:rows}],{shape:.5});
  for(const i of [7,count,count+1])assert.ok(Math.abs(result[i*3]-.0035)<1e-8);assert.ok(Math.abs(result[25999*3]-12.9995)<1e-6);assert.equal(base[21],0);
});
function fixture(){const root=new THREE.Group(),g=new THREE.BoxGeometry(),mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial()),bone=new THREE.Bone();bone.name='elbow';root.add(mesh,bone);g.morphAttributes.position=[g.attributes.position.clone()];g.morphTargetsRelative=true;mesh.updateMorphTargets();mesh.morphTargetDictionary={Shape:0};mesh.userData.dson_deformation={version:1,channels:[{id:'shape',value:0,min:0,max:1}],morphs:[{id:'shape',label:'Shape',value:0,default:0,min:0,max:1,amplitude:1}],formulas:[]};initializeDeformation(root);return {root,mesh,bone};}
test('pose correctives and limits update actual evaluated triangles',()=>{
  const {root,mesh,bone}=fixture();addPoseCorrective(root,{channel:'shape',boneId:bone.uuid,end:90});bone.rotation.x=Math.PI/4;evaluateCharacter(root);assert.ok(Math.abs(mesh.morphTargetInfluences[0]-.5)<1e-6);setMorph(root,'shape',4);assert.equal(mesh.morphTargetInfluences[0],1);assert.ok(evaluatedCharacterTriangles(root).triangles.length>0);
});
test('morph keys interpolate, export evaluated tracks and restore channels',()=>{
  const {root,mesh}=fixture(),scene=new THREE.Group();scene.add(root);const editor={root:scene,selected:root,commit(){},change(){}};const timeline=new Timeline(editor);timeline.insert();timeline.frame=11;setMorph(root,'shape',1);timeline.insert();timeline.evaluate(6);assert.equal(mesh.morphTargetInfluences[0],.5);const clips=timeline.exportClips();assert.ok(clips[0].tracks.some(t=>t.name.endsWith('morphTargetInfluences')));assert.equal(root.userData.fusion_deformation.channels[0].value,.5);assert.equal(mesh.morphTargetInfluences[0],.5);
});

test('pose corrective animation evaluates after joint interpolation and restores exported state',()=>{
  const {root,mesh,bone}=fixture(),scene=new THREE.Group();scene.add(root);const editor={root:scene,selected:root,commit(){},change(){}};const timeline=new Timeline(editor);timeline.end=11;
  addPoseCorrective(root,{channel:'shape',boneId:bone.uuid,end:90});timeline.insert();bone.rotation.x=Math.PI/2;evaluateCharacter(root);timeline.frame=11;timeline.insert();
  timeline.evaluate(6);assert.ok(Math.abs(mesh.morphTargetInfluences[0]-.5)<1e-6);const before=bone.quaternion.toArray(),clips=timeline.exportClips();
  assert.deepEqual(bone.quaternion.toArray(),before);assert.ok(Math.abs(mesh.morphTargetInfluences[0]-.5)<1e-6);
  const morph=clips[0].tracks.find(t=>t.name===mesh.uuid+'.morphTargetInfluences');assert.ok(morph);assert.ok(Math.abs(morph.values[5]-.5)<1e-6);assert.equal(morph.values[10],1);
});

function transactionEditor(root){
  const editor={root:new THREE.Group(),selected:root,batching:false,timeline:{frame:17},serialize(){return this.root.toJSON();},ensureHistory(){},select(n){this.selected=n;},async restore(doc){this.root=await new THREE.ObjectLoader().parseAsync(doc);this.timeline.frame=1;},commit(){if(!this.batching)this.journal.snapshot();}};
  editor.root.add(root);editor.journal=new CommandHistory({capture:()=>JSON.stringify(editor.serialize()),restore:doc=>editor.restore(doc)});editor.journal.reset();return editor;
}
test('morph and linked garment update is one undo; failed or cancelled evaluation restores the full edit',async()=>{
  const {root}=fixture(),editor=transactionEditor(root),id=root.uuid,garment=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshBasicMaterial());garment.userData.liveGarment={characterId:id};editor.root.add(garment);editor.journal.reset();const garmentId=garment.uuid;
  await deformationTransaction(editor,id,r=>setMorph(r,'shape',.7),{afterChange:async()=>{garment.position.y=.7;editor.commit();}});
  assert.equal(editor.journal.entries.length,1);assert.equal(editor.root.getObjectByProperty('uuid',garmentId).position.y,.7);await editor.journal.step(-1);
  assert.equal(initializeDeformation(editor.root.getObjectByProperty('uuid',id)).channels[0].value,0);assert.equal(editor.root.getObjectByProperty('uuid',garmentId).position.y,0);await editor.journal.step(1);
  const before=JSON.stringify(editor.serialize()),history=editor.journal.entries.length;editor.timeline.frame=17;
  await assert.rejects(deformationTransaction(editor,id,r=>setMorph(r,'shape',.2),{afterChange:async()=>{editor.root.getObjectByProperty('uuid',garmentId).position.y=99;throw Error('Injected drape failure');}}),/Injected/);
  assert.equal(JSON.stringify(editor.serialize()),before);assert.equal(editor.journal.entries.length,history);assert.equal(editor.timeline.frame,17);assert.equal(editor.batching,false);
  const controller=new AbortController();await assert.rejects(deformationTransaction(editor,id,r=>setMorph(r,'shape',.2),{signal:controller.signal,afterChange:async()=>controller.abort()}),/cancelled/);
  assert.equal(JSON.stringify(editor.serialize()),before);assert.equal(editor.journal.entries.length,history);
});

test('unbound formula outputs are reported and unrelated morph channels remain usable',()=>{
  const {root,mesh}=fixture(),state=initializeDeformation(root);state.formulas.push({output:'eye?rotation/y',operations:[{op:'push',val:5}]});setMorph(root,'shape',.3);const report=evaluateCharacter(root);
  assert.equal(report.valid,true);assert.equal(report.complete,false);assert.match(report.warnings[0].message,/no supported scene binding/);assert.equal(mesh.morphTargetInfluences[0],.3);
});

test('character edits participate in the common operator lock and cancellation',async()=>{
  const {root}=fixture(),editor=transactionEditor(root);editor.operators=new OperatorRegistry({editor});let finish,started;
  const began=new Promise(resolve=>started=resolve);wireDeformation({container:{querySelector:()=>null},editor,afterChange:()=>new Promise(resolve=>{finish=resolve;started();})});
  const operation=editor.operators.run('character.deform',{targetId:root.uuid,action:'set',channel:'shape',value:.6});await began;
  await assert.rejects(editor.operators.run('character.deform',{targetId:root.uuid,action:'reset',channel:'shape'}),/current operation/);
  editor.operators.cancel();finish();await assert.rejects(operation,/cancelled/);assert.equal(editor.journal.entries.length,0);assert.equal(editor.operators.running,null);assert.equal(initializeDeformation(editor.root.getObjectByProperty('uuid',root.uuid)).channels[0].value,0);
});

test('real Genesis 9 detailed mesh loads and retains deformable material primitives',async t=>{
  const report=path.resolve('test-output/dson-integration-results.json');if(!fs.existsSync(report)){t.skip('Private Genesis regression result not available');return;}
  const source=JSON.parse(fs.readFileSync(report)).output;if(!fs.existsSync(source)){t.skip('Private Genesis GLB not available');return;}
  const bytes=fs.readFileSync(source),glb=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');let vertices=0,morphs=0,primitives=0,meta,checkedDeltas=0;const sourceIds=new Set();
  glb.scene.traverse(n=>{if(n.userData.dson_deformation)meta=JSON.parse(n.userData.dson_deformation);});assert.ok(meta,'Current importer must preserve declarative deformation data');
  glb.scene.traverse(n=>{if(n.isMesh){n.geometry=compactPrimitive(n.geometry);const g=n.geometry,ids=g.attributes._fusion_source_vertex;assert.ok(ids,'Original vertex mapping must survive GLB and material compaction');vertices+=g.attributes.position.count;primitives++;
    for(let i=0;i<ids.count;i++){const id=ids.getX(i);assert.ok(Number.isInteger(id)&&id>=0&&id<meta.vertexCount);sourceIds.add(id);}
    for(const m of meta.morphs){const index=n.morphTargetDictionary[m.targetName||m.label],attribute=g.morphAttributes.position[index],rows=new Map(m.deltas.map(row=>[row[0],row.slice(1)]));assert.ok(attribute);for(let i=0;i<ids.count;i++){const delta=rows.get(ids.getX(i))||[0,0,0];for(let axis=0;axis<3;axis++)assert.ok(Math.abs(attribute.array[i*3+axis]-delta[axis]*.01*m.amplitude)<2e-7,'Imported sparse delta must match source-space reference');if(rows.has(ids.getX(i)))checkedDeltas++;}}
    if(n.morphTargetInfluences?.length){morphs++;const p=new THREE.Vector3();n.getVertexPosition(0,p);assert.ok(p.toArray().every(Number.isFinite));}}});
  assert.equal(sourceIds.size,25182);assert.ok(vertices>=25182);assert.ok(primitives>=7);assert.ok(morphs>=7);assert.ok(checkedDeltas>=294);
  const state=initializeDeformation(glb.scene),first=state.morphs[0];setMorph(glb.scene,first.id,.25);glb.scene.traverse(n=>{if(n.isMesh)assert.equal(n.morphTargetInfluences[n.morphTargetDictionary[first.targetName||first.label]],.25);});
  const saved=await new THREE.ObjectLoader().parseAsync(glb.scene.toJSON());assert.equal(initializeDeformation(saved).channels.find(c=>c.id===first.id).value,.25);saved.traverse(n=>{if(n.isMesh)assert.ok(n.geometry.attributes._fusion_source_vertex);});
  const start=performance.now(),collision=evaluatedCharacterTriangles(saved);const milliseconds=performance.now()-start;assert.ok(collision.triangles.length/3>=50000);assert.ok(collision.positions.every(Number.isFinite));
  t.diagnostic(`Private Genesis 9: ${sourceIds.size} original vertices, ${vertices} material/UV vertices, ${primitives} primitives, ${checkedDeltas} checked nonzero morph vertices; ${collision.triangles.length/3} posed collision triangles in ${milliseconds.toFixed(1)} ms.`);
});
