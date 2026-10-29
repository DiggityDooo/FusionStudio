import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import * as T from 'three';
import {createDetailedCharacter,changeCreator} from '../src/character-creator.js';
import {computeCreator,creatorInputs} from '../src/creator-data.js';
import {refitCreatorRig} from '../src/creator-rig-refit.js';
import {ProjectLoader} from '../src/project-loader.js';
import {Editor} from '../src/editor.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import validator from 'gltf-validator';

const definition=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../public/characters/makehuman-v1.json.gz',import.meta.url))));
function points(body){body.updateWorldMatrix(true,false);body.updateMatrixWorld(true);body.skeleton.update();const out=new Float64Array(body.geometry.attributes.position.count*3),p=new T.Vector3();for(let i=0;i<out.length/3;i++){body.getVertexPosition(i,p).applyMatrix4(body.matrixWorld);p.toArray(out,i*3);}return out;}
function error(a,b){assert.equal(a.length,b.length);let max=0;for(let i=0;i<a.length;i+=3)max=Math.max(max,Math.hypot(a[i]-b[i],a[i+1]-b[i+1],a[i+2]-b[i+2]));return max;}
function pose(root){root.getObjectByName('upperarm_l').scale.set(1.2,.8,1.1);root.getObjectByName('upperarm_l').position.x+=.02;root.getObjectByName('upperarm_l').rotation.set(.1,-.2,.3);root.getObjectByName('lowerarm_l').rotation.y=.25;root.getObjectByName('head').position.z+=.01;root.getObjectByName('head').rotation.y=.2;}
const neutralPoints=(positions)=>new Map(definition.source.bones.map(r=>{const p=new T.Vector3();for(const id of r.landmarks)p.add(new T.Vector3().fromArray(positions,id*3));return [r.name,p.divideScalar(r.landmarks.length)];}));

test('unchanged detailed bodies retain translated and scaled joint poses under nonuniform owner transforms',t=>{
 const source=JSON.stringify(definition.source.positions);let worst=0;
 for(const sex of ['female','male']){
  const root=createDetailedCharacter(definition,{sex}),body=root.getObjectByName('Body');root.position.set(.7,-.1,.4);root.rotation.set(.1,.4,-.2);root.scale.set(1.1,.8,1.3);pose(root);const before=points(body),q=root.getObjectByName('upperarm_l').quaternion.toArray(),scale=root.getObjectByName('upperarm_l').scale.toArray(),position=root.getObjectByName('upperarm_l').position.clone(),eye=root.getObjectByName('Eye 0').getWorldPosition(new T.Vector3());
  const recipe=structuredClone(root.userData.fusion_creator.recipe);recipe.controls[definition.controls[0].id]=0;changeCreator(root,recipe);const difference=error(before,points(body));worst=Math.max(worst,difference);assert.ok(difference<1e-8,sex+' unchanged posed mesh moved '+difference);assert.deepEqual(root.getObjectByName('upperarm_l').quaternion.toArray(),q);assert.deepEqual(root.getObjectByName('upperarm_l').scale.toArray(),scale);assert.ok(root.getObjectByName('upperarm_l').position.distanceTo(position)<1e-12);assert.ok(root.getObjectByName('Eye 0').getWorldPosition(new T.Vector3()).distanceTo(eye)<1e-9);
 }
 assert.equal(JSON.stringify(definition.source.positions),source);t.diagnostic('Maximum full-mesh world-position difference: '+worst);
});

test('proportion refitting agrees with independently built landmark bindings and preserves local pose deltas',()=>{
 const root=createDetailedCharacter(definition,{sex:'male'}),body=root.getObjectByName('Body'),rest=new Map(body.skeleton.bones.map(b=>[b.name,b.position.clone()]));root.position.set(.4,.2,-.6);root.rotation.y=.4;root.scale.set(.9,1.1,.8);root.updateMatrixWorld(true);body.bind(body.skeleton);pose(root);const authored=new Map(body.skeleton.bones.map(b=>[b.name,{offset:b.position.clone().sub(rest.get(b.name)),quaternion:b.quaternion.clone(),scale:b.scale.clone()}])),recipe=structuredClone(root.userData.fusion_creator.recipe);recipe.controls.height=2.02;recipe.controls.weight=.8;recipe.controls.muscle=.7;const result=computeCreator(creatorInputs(definition,recipe)),landmarks=neutralPoints(result.positions);changeCreator(root,recipe);
 const reference=createDetailedCharacter(definition,{sex:'male'}),ref=reference.getObjectByName('Body');reference.position.copy(root.position);reference.quaternion.copy(root.quaternion);reference.scale.copy(root.scale);
 for(let i=0;i<ref.geometry.attributes.position.count;i++){const id=ref.geometry.attributes._fusion_source_vertex.getX(i);ref.geometry.attributes.position.setXYZ(i,...result.positions.slice(id*3,id*3+3));}
 for(const r of definition.source.bones){const b=reference.getObjectByName(r.name),a=authored.get(r.name),p=landmarks.get(r.name);b.position.copy(p);if(r.parent)b.position.sub(landmarks.get(r.parent));b.position.add(a.offset);b.quaternion.copy(a.quaternion);b.scale.copy(a.scale);}
 ref.skeleton.boneInverses=ref.skeleton.bones.map(b=>{const p=landmarks.get(b.name);return new T.Matrix4().makeTranslation(-p.x,-p.y,-p.z);});assert.ok(error(points(body),points(ref))<1e-6);
 for(let i=0;i<body.skeleton.bones.length;i++){const b=body.skeleton.bones[i],p=new T.Vector3().setFromMatrixPosition(body.bindMatrix.clone().invert().multiply(body.skeleton.boneInverses[i].clone().invert()));assert.ok(p.distanceTo(landmarks.get(b.name))<1e-10);assert.deepEqual(b.quaternion.toArray(),authored.get(b.name).quaternion.toArray());assert.deepEqual(b.scale.toArray(),authored.get(b.name).scale.toArray());}
});

test('saved legacy bind frames and pose fields survive hydration and a no-op re-evaluation',async()=>{
 let root=createDetailedCharacter(definition),body=root.getObjectByName('Body');const rest=new Map(body.skeleton.bones.map(b=>[b.name,b.position.clone()]));pose(root);const rotations=body.skeleton.bones.map(b=>b.quaternion.clone());for(const b of body.skeleton.bones){b.position.copy(rest.get(b.name));b.quaternion.identity();}root.updateMatrixWorld(true);body.skeleton.calculateInverses();body.skeleton.bones.forEach((b,i)=>b.quaternion.copy(rotations[i]));const before=points(body),inverses=JSON.parse(JSON.stringify(body.skeleton.boneInverses.map(m=>m.toArray()))); // JSON canonicalizes signed zero.
 for(let cycle=0;cycle<3;cycle++){const doc=JSON.parse(JSON.stringify(Editor.prototype.serialize.call({root})));root=await new ProjectLoader().parseAsync(doc);body=root.getObjectByName('Body');assert.ok(error(before,points(body))<1e-8);assert.deepEqual(body.skeleton.boneInverses.map(m=>m.toArray()),inverses);}
 const recipe=structuredClone(root.userData.fusion_creator.recipe);recipe.controls[definition.controls[0].id]=0;const report=changeCreator(root,recipe);assert.ok(report.rigRefit.nonUnitRestScales>0);assert.ok(error(before,points(body))<1e-8);
});

test('creator pose, refitted binds and geometry survive undo, redo and compact project reload',async()=>{
 const root=new T.Group(),c=createDetailedCharacter(definition);root.add(c);pose(c);const e=Object.assign(Object.create(Editor.prototype),{root,scene:new T.Scene(),history:[],historyAt:-1,change(){},select(n){this.selected=n;},wire(){},meshTools:{setMode(){}},timeline:{frame:9,reset(){}}});e.scene.add(root);e.select(c);e.commit();const before=points(c.getObjectByName('Body')),recipe=structuredClone(c.userData.fusion_creator.recipe);recipe.controls.height=1.9;changeCreator(c,recipe);e.commit();const after=points(c.getObjectByName('Body'));assert.ok(error(before,after)>.01);await e._undo();assert.ok(error(before,points(e.root.getObjectByProperty('uuid',c.uuid).getObjectByName('Body')))<1e-7);await e._redo();assert.ok(error(after,points(e.root.getObjectByProperty('uuid',c.uuid).getObjectByName('Body')))<1e-7);const copy=await new ProjectLoader().parseAsync(JSON.parse(JSON.stringify(e.serialize())));assert.ok(error(after,points(copy.getObjectByProperty('uuid',c.uuid).getObjectByName('Body')))<1e-7);
});

test('invalid rest frames reject before any joint mutation and failed appearance updates restore the previous pose',()=>{
 const c=createDetailedCharacter(definition),body=c.getObjectByName('Body');pose(c);const before=points(body),saved=body.skeleton.bones.map(b=>({position:b.position.toArray(),quaternion:b.quaternion.toArray(),scale:b.scale.toArray()})),last=body.skeleton.boneInverses.at(-1).clone();body.skeleton.boneInverses.at(-1).elements.fill(0);assert.throws(()=>refitCreatorRig(body,definition.source.bones,computeCreator(creatorInputs(definition,c.userData.fusion_creator.recipe)).positions),/invalid joint transform|inverse bind/);assert.deepEqual(body.skeleton.bones.map(b=>({position:b.position.toArray(),quaternion:b.quaternion.toArray(),scale:b.scale.toArray()})),saved);body.skeleton.boneInverses[body.skeleton.boneInverses.length-1]=last;
 const recipe=structuredClone(c.userData.fusion_creator.recipe),oldRecipe=structuredClone(recipe),copy=body.material.color.copy;recipe.controls.height=1.93;body.material.color.copy=function(value){if(c.userData.fusion_creator.recipe.controls.height===1.93)throw Error('Injected appearance failure');return copy.call(this,value);};try{assert.throws(()=>changeCreator(c,recipe),/Injected appearance failure/);}finally{body.material.color.copy=copy;}assert.deepEqual(c.userData.fusion_creator.recipe,oldRecipe);assert.ok(error(before,points(body))<1e-7);assert.deepEqual(body.skeleton.bones.map(b=>b.quaternion.toArray()),saved.map(b=>b.quaternion));assert.deepEqual(body.skeleton.bones.map(b=>b.scale.toArray()),saved.map(b=>b.scale));
});

test('unsupported detached refits reject without losing the saved rig, pose or previous body',async()=>{
 const c=createDetailedCharacter(definition),body=c.getObjectByName('Body');pose(c);body.bindMode='detached';const before=points(body),recipe=structuredClone(c.userData.fusion_creator.recipe),inverses=JSON.stringify(body.skeleton.boneInverses.map(m=>m.toArray())),oldRecipe=structuredClone(recipe);recipe.controls.height=1.91;assert.throws(()=>changeCreator(c,recipe),/requires attached skinning/);assert.deepEqual(c.userData.fusion_creator.recipe,oldRecipe);assert.equal(body.bindMode,'detached');assert.equal(JSON.stringify(body.skeleton.boneInverses.map(m=>m.toArray())),inverses);assert.ok(error(before,points(body))<1e-8);const reloaded=await new ProjectLoader().parseAsync(JSON.parse(JSON.stringify(Editor.prototype.serialize.call({root:c}))));assert.equal(reloaded.getObjectByName('Body').bindMode,'detached');assert.ok(error(before,points(reloaded.getObjectByName('Body')))<1e-8);
});

test('actual GLB exchange preserves refitted translated/scaled skinning on the detailed creator',async t=>{
 const oldReader=globalThis.FileReader;globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();});}};
 try{
  const scene=new T.Group(),c=createDetailedCharacter(definition,{sex:'male'});scene.add(c);c.position.set(.4,.1,-.3);c.rotation.y=.3;c.scale.set(1.1,.9,1.2);pose(c);const recipe=structuredClone(c.userData.fusion_creator.recipe);recipe.controls.height=1.93;recipe.controls.weight=.7;changeCreator(c,recipe);
  // This numerical skinning probe excludes textured eye/brow attachments;
  // their real canvas/image export is covered by the Electron workflow.
  c.getObjectByName('Creator attachments').visible=false;
  const body=c.getObjectByName('Body'),before=points(body),e=Object.assign(Object.create(Editor.prototype),{root:scene,timeline:{exportClips:()=>[]}}),bytes=Uint8Array.from(Buffer.from(await e.glb(false),'base64')),report=await validator.validateBytes(bytes);assert.equal(report.issues.numErrors,0,JSON.stringify(report.issues));const loaded=await new GLTFLoader().parseAsync(bytes.buffer,''),copy=loaded.scene.getObjectByName('Body');assert.ok(copy?.isSkinnedMesh);assert.equal(loaded.scene.getObjectByName('Eye_0'),undefined);const difference=error(before,points(copy));assert.ok(difference<2e-6,'GLB posed skin error '+difference);assert.ok(error(before,points(body))<1e-9);t.diagnostic('Full-mesh GLB world-position error: '+difference);
 }finally{globalThis.FileReader=oldReader;}
});
