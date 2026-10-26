import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {compactPrimitive} from '../src/geometry-interchange.js';
import {initializeDeformation,evaluateCharacter} from '../src/deformation.js';
import {fingerprintCharacter,captureMorphPreset,validateMorphPreset,inspectMorphPreset,applyMorphPreset,resetMorphControls} from '../src/morph-presets.js';
import {deformationTransaction} from '../src/deformation-ui.js';
import {CommandHistory} from '../src/history.js';

function character({detailed=false,split=true}={}){
  const root=new THREE.Group(),geometry=new THREE.PlaneGeometry(1,2,detailed?256:4,detailed?128:4),count=geometry.attributes.position.count;
  geometry.setAttribute('_fusion_source_vertex',new THREE.Uint32BufferAttribute(Array.from({length:count},(_,i)=>i),1));
  geometry.morphTargetsRelative=true;
  geometry.morphAttributes.position=[.01,.02].map(amount=>{const a=new Float32Array(count*3);for(let i=0;i<count;i++)a[i*3+2]=amount;return new THREE.BufferAttribute(a,3);});
  const meshes=[];
  for(let part=0;part<(split?2:1);part++){
    const g=geometry.clone();
    if(split){const index=Array.from(g.index.array),half=index.length/2;g.setIndex(index.slice(part*half,(part+1)*half));}
    const mesh=new THREE.Mesh(compactPrimitive(g),new THREE.MeshStandardMaterial());mesh.name='Material '+part;mesh.updateMorphTargets();mesh.morphTargetDictionary={Body:0,Face:1};root.add(mesh);meshes.push(mesh);
  }
  const bone=new THREE.Bone();bone.name='arm';root.add(bone);bone.rotation.x=.3;
  root.userData.fusion_deformation={version:1,channels:[{id:'body',label:'Body',category:'/Body/Size',value:.2,default:0,min:0,max:1},{id:'face',label:'Face',category:'/Face',value:.1,default:.25,min:0,max:1},{id:'control',label:'Composite',category:'/Controls',value:.5,default:0,min:0,max:1}],morphs:[{id:'body',label:'Body'},{id:'face',label:'Face'}],formulas:[{output:'face',operations:[{op:'push',url:'control'}]}],correctives:[{channel:'body',boneId:bone.uuid,axis:'x',start:0,end:90,strength:.1,order:'XYZ',referenceQuaternion:bone.quaternion.toArray()}],errors:[]};
  evaluateCharacter(root);return {root,meshes,bone,state:root.userData.fusion_deformation};
}

test('preset captures authored controls independently of evaluated formula outputs',async()=>{
  const {root,state,meshes}=character(),preset=await captureMorphPreset(root,{name:'Body and expression'});
  assert.equal(preset.format,'fusion.morph-preset');assert.equal(preset.version,1);assert.equal(preset.controls.find(c=>c.id==='face?value').value,.1);assert.equal(meshes[0].morphTargetInfluences[1],.6);
  assert.equal(preset.controls.length,3);assert.ok(!JSON.stringify(preset).includes('operations'));assert.ok(!JSON.stringify(preset).includes('correctives'));
  state.channels[0].label='Renamed size';state.channels.reverse();root.children.reverse();
  const inspection=await inspectMorphPreset(root,JSON.stringify(preset));assert.equal(inspection.exact,true);assert.equal(inspection.compatible,true);
  const loaded=validateMorphPreset(JSON.stringify(preset));loaded.controls[0].value=.99;assert.equal(preset.controls[0].value,.2);
});

test('detailed 65,536 triangle fingerprints survive material splits and primitive ordering',async t=>{
  const a=character({detailed:true,split:true}),b=character({detailed:true,split:false}),start=performance.now();
  const [fa,fb]=await Promise.all([fingerprintCharacter(a.root),fingerprintCharacter(b.root)]);
  assert.equal(fa.originalVertices,33153);assert.equal(fa.triangles,65536);assert.ok(fa.mappedVertices>fa.originalVertices);assert.equal(fa.topologyHash,fb.topologyHash);assert.equal(fa.baseHash,fb.baseHash);assert.equal(fa.morphHash,fb.morphHash);
  const preset=await captureMorphPreset(a.root,{channelIds:['body']});b.state.channels[0].value=0;
  await applyMorphPreset(b.root,preset);assert.equal(b.state.channels[0].value,.2);
  t.diagnostic(`${fa.originalVertices} original / ${fa.mappedVertices} split vertices, ${fa.triangles} triangles; two fingerprints plus capture/apply in ${(performance.now()-start).toFixed(1)} ms.`);
});

test('selected category apply/reset preserves unrelated controls, pose, correctives, and garment links',async()=>{
  const {root,state,bone}=character(),garment=new THREE.Group();garment.userData.liveGarment={characterId:root.uuid,basePattern:{name:'Sewn shirt'}};root.add(garment);
  state.channels[0].value=.7;state.channels[1].value=.35;const preset=await captureMorphPreset(root),correctives=structuredClone(state.correctives),pose=bone.quaternion.toArray(),garmentState=JSON.stringify(garment.userData);
  state.channels[0].value=.1;state.channels[1].value=.2;
  const applied=await applyMorphPreset(root,preset,{categories:['/Body']});assert.equal(applied.applied,1);assert.equal(state.channels[0].value,.7);assert.equal(state.channels[1].value,.2);
  const reset=resetMorphControls(root,{categories:['/Body']});assert.equal(reset.applied,1);assert.equal(state.channels[0].value,0);assert.equal(state.channels[1].value,.2);
  assert.deepEqual(state.correctives,correctives);assert.deepEqual(bone.quaternion.toArray(),pose);assert.equal(JSON.stringify(garment.userData),garmentState);
  resetMorphControls(root,{channelIds:['face']});assert.equal(state.channels[1].value,.25);
});

test('topology/base mismatch and limit mismatch reject before any control mutation',async()=>{
  const {root,state,meshes}=character(),preset=await captureMorphPreset(root),before=JSON.stringify(state.channels);
  const positions=meshes[0].geometry.attributes.position,old=positions.getZ(0);positions.setZ(0,old+.1);
  let report=await inspectMorphPreset(root,preset);assert.equal(report.compatible,false);assert.ok(report.diagnostics.some(d=>d.code==='base-mismatch'));
  await assert.rejects(applyMorphPreset(root,preset),e=>e.code==='incompatible-preset');assert.equal(JSON.stringify(state.channels),before);positions.setZ(0,old);
  const index=meshes[0].geometry.index,indexValue=index.getX(0);index.setX(0,index.getX(1));report=await inspectMorphPreset(root,preset);assert.ok(report.diagnostics.some(d=>d.code==='topology-mismatch'));await assert.rejects(applyMorphPreset(root,preset),/topology/);index.setX(0,indexValue);
  state.channels[0].max=.1;report=await inspectMorphPreset(root,preset);assert.equal(report.outOfRange[0].id,'body?value');await assert.rejects(applyMorphPreset(root,preset,{acceptExactIdSubset:true}),/limits/);assert.equal(state.channels[0].value,.2);
});

test('exact-ID remapping previews missing controls and requires explicit subset acceptance',async()=>{
  const {root,state}=character(),preset=await captureMorphPreset(root);state.channels=state.channels.filter(c=>c.id!=='control');state.formulas=[];state.channels[0].value=0;
  const preview=await inspectMorphPreset(root,preset);assert.equal(preview.compatible,true);assert.equal(preview.exact,false);assert.equal(preview.requiresExplicitRemap,true);assert.deepEqual(preview.missing,[{id:'control?value',label:'Composite'}]);assert.equal(preview.matched.length,2);
  await assert.rejects(applyMorphPreset(root,preset),e=>e.code==='remap-review-required');assert.equal(state.channels[0].value,0);
  const applied=await applyMorphPreset(root,preset,{acceptExactIdSubset:true});assert.equal(applied.applied,2);assert.equal(state.channels[0].value,.2);
  state.channels[0].id='different-id';state.channels[0].label='Body';const renamed=await inspectMorphPreset(root,preset);assert.ok(renamed.missing.some(c=>c.id==='body?value'),'Matching display labels cannot remap IDs');
});

test('failed dependency evaluation, cancellation and concurrent base mutation preserve the previous shape',async()=>{
  const {root,state,meshes}=character(),preset=await captureMorphPreset(root);state.channels[0].value=.05;evaluateCharacter(root);
  const before=JSON.stringify(state.channels),influences=meshes.map(n=>n.morphTargetInfluences.slice()),errors=structuredClone(state.errors);
  state.formulas=[{output:'body',operations:[{op:'push',url:'face'}]},{output:'face',operations:[{op:'push',url:'body'}]}];
  await assert.rejects(applyMorphPreset(root,preset),e=>e.code==='evaluation-failed');assert.equal(JSON.stringify(state.channels),before);assert.deepEqual(meshes.map(n=>n.morphTargetInfluences),influences);assert.deepEqual(state.errors,errors);
  state.formulas=[];const controller=new AbortController();controller.abort();await assert.rejects(applyMorphPreset(root,preset,{signal:controller.signal}),e=>e.code==='cancelled');assert.equal(JSON.stringify(state.channels),before);
  const pending=applyMorphPreset(root,preset);const p=meshes[0].geometry.attributes.position;p.setZ(0,.03);await assert.rejects(pending,e=>e.code==='target-changed');assert.equal(JSON.stringify(state.channels),before);
});

test('async preset and garment evaluation share one undo and roll back together on failure',async()=>{
  const {root,state}=character(),targetId=root.uuid,scene=new THREE.Group(),garment=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshBasicMaterial());
  garment.userData.liveGarment={characterId:targetId};const garmentId=garment.uuid;scene.add(root,garment);
  state.channels[0].value=.75;const preset=await captureMorphPreset(root,{channelIds:['body']});state.channels[0].value=.1;evaluateCharacter(root);
  const editor={root:scene,selected:root,batching:false,timeline:{frame:9},serialize(){this.root.updateMatrixWorld(true);return this.root.toJSON();},ensureHistory(){},select(n){this.selected=n;},async restore(doc){this.root=await new THREE.ObjectLoader().parseAsync(doc);this.timeline.frame=1;},commit(){if(!this.batching)this.journal.snapshot();}};
  editor.journal=new CommandHistory({capture:()=>JSON.stringify(editor.serialize()),restore:doc=>editor.restore(doc)});editor.journal.reset();
  const current=()=>editor.root.getObjectByProperty('uuid',targetId),cloth=()=>editor.root.getObjectByProperty('uuid',garmentId);
  await deformationTransaction(editor,targetId,character=>applyMorphPreset(character,preset),{afterChange:async character=>{assert.equal(initializeDeformation(character).channels[0].value,.75,'Garment work must await fingerprint and apply');cloth().position.y=.75;}});
  assert.equal(editor.journal.entries.length,1);assert.equal(cloth().position.y,.75);
  await editor.journal.step(-1);assert.equal(initializeDeformation(current()).channels[0].value,.1);assert.equal(cloth().position.y,0);
  await editor.journal.step(1);assert.equal(initializeDeformation(current()).channels[0].value,.75);assert.equal(cloth().position.y,.75);
  resetMorphControls(current(),{channelIds:['body']});evaluateCharacter(current());editor.journal.snapshot();const before=JSON.stringify(editor.serialize()),history=editor.journal.entries.length;editor.timeline.frame=9;
  await assert.rejects(deformationTransaction(editor,targetId,character=>applyMorphPreset(character,preset),{afterChange:async()=>{cloth().position.y=99;throw Error('Injected garment refinement failure');}}),/garment refinement failure/);
  assert.equal(JSON.stringify(editor.serialize()),before);assert.equal(editor.journal.entries.length,history);assert.equal(editor.timeline.frame,9);assert.equal(editor.batching,false);
  const controller=new AbortController();await assert.rejects(deformationTransaction(editor,targetId,character=>applyMorphPreset(character,preset,{signal:controller.signal}),{signal:controller.signal,afterChange:async()=>{cloth().position.y=55;controller.abort();}}),/cancelled/);
  assert.equal(JSON.stringify(editor.serialize()),before);assert.equal(editor.journal.entries.length,history);
});

test('untrusted JSON, unknown versions, ambiguous mappings and invalid selection are actionable',async()=>{
  const {root,state,meshes}=character(),preset=await captureMorphPreset(root);
  assert.throws(()=>validateMorphPreset({...preset,version:2}),/version/);assert.throws(()=>validateMorphPreset({...preset,script:'run'}),/unsupported field/);
  assert.throws(()=>validateMorphPreset({...preset,controls:[{...preset.controls[0],value:Infinity}]}),/plain JSON|value/);
  assert.throws(()=>validateMorphPreset(JSON.parse('{"__proto__":{"polluted":true}}')),/reserved/);assert.throws(()=>validateMorphPreset(' '.repeat(2*1024*1024+1)),/2 MiB/);
  await assert.rejects(captureMorphPreset(root,{channelIds:['not-loaded']}),/not present/);assert.throws(()=>resetMorphControls(root,{categories:['/Absent']}),/No morph controls/);
  const c=meshes[0].clone();c.geometry=meshes[0].geometry.clone();c.geometry.attributes.position.setZ(0,.5);root.add(c);await assert.rejects(fingerprintCharacter(root),/conflicting base positions/);root.remove(c);
  meshes[0].geometry.deleteAttribute('_fusion_source_vertex');await assert.rejects(captureMorphPreset(root),/stable source vertex/);assert.equal(state.channels[0].value,.2);
});

test('private Genesis 9 preset roundtrip keeps 50k triangle mapping and original file unchanged',async t=>{
  const reportPath=path.resolve('test-output/dson-integration-results.json');if(!fs.existsSync(reportPath)){t.skip('Private Genesis regression result unavailable');return;}
  const report=JSON.parse(fs.readFileSync(reportPath)),source=report.output;if(!fs.existsSync(source)){t.skip('Private Genesis GLB unavailable');return;}
  const bytes=fs.readFileSync(source),loaded=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  loaded.scene.traverse(n=>{if(n.isMesh)n.geometry=compactPrimitive(n.geometry);});const state=initializeDeformation(loaded.scene),first=state.channels.find(c=>state.morphs.some(m=>m.id===c.id));
  first.value=.45;evaluateCharacter(loaded.scene);const start=performance.now(),preset=await captureMorphPreset(loaded.scene,{name:'Private Genesis shape',channelIds:[first.id]});
  assert.equal(preset.source.originalVertices,25182);assert.ok(preset.source.triangles>=50000);first.value=.1;await applyMorphPreset(loaded.scene,JSON.stringify(preset));assert.equal(first.value,.45);
  const reopened=await new THREE.ObjectLoader().parseAsync(loaded.scene.toJSON()),inspection=await inspectMorphPreset(reopened,preset);assert.equal(inspection.exact,true);resetMorphControls(reopened,{channelIds:[first.id]});await applyMorphPreset(reopened,preset);assert.equal(initializeDeformation(reopened).channels.find(c=>c.id===first.id).value,.45);
  assert.deepEqual(fs.readFileSync(source),bytes);assert.ok(!JSON.stringify(preset).includes('C:/Users/Public'),'Preset should not embed private source content paths');
  t.diagnostic(`Private Genesis: ${preset.source.originalVertices} original vertices, ${preset.source.triangles} triangles, ${preset.source.morphIds.length} morph IDs; capture/apply/reopen in ${(performance.now()-start).toFixed(1)} ms.`);
});
