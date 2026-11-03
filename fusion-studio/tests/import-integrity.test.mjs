import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as THREE from 'three';
import {Editor} from '../src/editor.js';
import {Timeline} from '../src/timeline.js';
import {ProjectLoader} from '../src/project-loader.js';
const {detailedGltf,glb}=createRequire(import.meta.url)('./gltf-fixtures.cjs');
const fixtureData=detailedGltf(160),payload=glb(fixtureData.json,fixtureData.bin).toString('base64');

function editor(){
 const e=Object.assign(Object.create(Editor.prototype),{root:new THREE.Group(),scene:new THREE.Scene(),history:[],historyAt:-1,change(){},select(o){this.selected=o;},wire(){},frame(){},meshTools:{setMode(){}},camera:new THREE.PerspectiveCamera(),orbit:{target:new THREE.Vector3()},bookmarks:[]});
 e.scene.add(e.root);e.timeline=new Timeline(e);e.commit();return e;
}
const provenance=()=>({sourceCapsule:{schema:1,sourceId:'source-detailed',sha256:'a'.repeat(64),originalName:'detailed.glb',dependencies:[{id:'skin.png',status:'found',sha256:'b'.repeat(64)}]},sourceOriginalPath:'C:/private-originals/detailed.glb'});

test('framing large imported scenes keeps the whole bounding volume clear of viewport fog',()=>{
 const e=editor();e.frame=Editor.prototype.frame;e.scene.fog=new THREE.Fog('#3b3b3b',22,65);e.camera.position.set(5,4,6);
 for(const scale of [1,75,300,1]){
  e.root.clear();const mesh=new THREE.Mesh(new THREE.BoxGeometry(scale,scale*.3,scale*.7));mesh.position.set(1000,-50,200);e.root.add(mesh);const before=JSON.stringify(e.serialize());e.frame(mesh);
  const box=new THREE.Box3().setFromObject(mesh);for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])assert.ok(e.camera.position.distanceTo(new THREE.Vector3(x,y,z))<e.scene.fog.near,'Framed surface must remain visible before fog begins');
  assert.equal(JSON.stringify(e.serialize()),before,'Framing remains display-only');
 }
 assert.equal(e.scene.fog.near,22);assert.equal(e.scene.fog.far,65);
});

test('native controls are committed during import so first export and reopen remain observational',async()=>{
 const json=structuredClone(fixtureData.json),node=json.nodes.find(n=>n.mesh!==undefined);node.extras={dson_deformation:JSON.stringify({version:1,channels:[{id:'ReferencedControl',value:0,min:0,max:1}],morphs:[],formulas:[]})};
 const e=editor(),group=await e.importGLB(glb(json,fixtureData.bin).toString('base64'),'Native controls',null,{metadata:{dazNative:{properties:[]}}});assert.equal(group.userData.fusion_deformation.channels[0].id,'ReferencedControl');
 const before=JSON.stringify(e.serialize()),Reader=globalThis.FileReader;globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}};
 try{await e.glb(false,{includeAnimations:false});assert.equal(JSON.stringify(e.serialize()),before);await e.undo();await e.redo();assert.equal(JSON.stringify(e.serialize()),before);await e.load(JSON.parse(JSON.stringify(e.document('Native controls'))));await e.glb(false,{includeAnimations:false});assert.equal(JSON.stringify(e.serialize()),before);}finally{if(Reader)globalThis.FileReader=Reader;else delete globalThis.FileReader;}
});

test('inserted detailed physical materials retain exact authored IOR through repeated undo and reopening',async()=>{
 const e=editor(),values=[1,1.33,1.5,1.8,2.42,3],materials=values.map(ior=>new THREE.MeshPhysicalMaterial({ior})),mesh=new THREE.Mesh(new THREE.SphereGeometry(.5,192,144),materials),before=materials.map(m=>JSON.stringify(m.toJSON()));
 e.insertObject(mesh,'Detailed dielectric study');const row=e.journal.entries.at(-1);assert.equal(row.type,'insert');
 for(let i=0;i<materials.length;i++){const encoded=row.data.materials.find(m=>m.uuid===materials[i].uuid);assert.equal(encoded.ior,values[i]);assert.equal('reflectivity' in encoded,false);}
 for(let n=0;n<3;n++){await e.undo();assert.equal(e.root.children.length,0);await e.redo();assert.deepEqual(e.root.children[0].material.map(m=>m.ior),values);}
 const reopened=await new ProjectLoader().parseAsync(JSON.parse(JSON.stringify(e.serialize())));assert.deepEqual(reopened.children[0].material.map(m=>m.ior),values);
 assert.deepEqual(materials.map(m=>JSON.stringify(m.toJSON())),before,'Snapshot correction never edits source materials');
});

test('detailed import captures owned provenance in one undo step and retains it through reopen',async()=>{
 const e=editor(),metadata=provenance(),saved=structuredClone(metadata),cursor=e.journal.cursor,group=await e.importGLB(payload,'Detailed import',null,{metadata});
 assert.equal(fixtureData.triangles,51200);assert.equal(e.journal.cursor,cursor+1);assert.deepEqual(group.userData.sourceCapsule,saved.sourceCapsule);assert.equal(group.userData.sourceOriginalPath,saved.sourceOriginalPath);
 metadata.sourceCapsule.dependencies[0].status='missing';assert.deepEqual(group.userData.sourceCapsule,saved.sourceCapsule,'Caller cannot mutate committed provenance');
 const before=JSON.stringify(e.serialize());await e.undo();assert.equal(e.root.children.length,0);await e.redo();assert.equal(JSON.stringify(e.serialize()),before);
 const doc=e.document('Detailed provenance');await e.load(JSON.parse(JSON.stringify(doc)));assert.equal(JSON.stringify(e.serialize()),before);
});

test('late import, cancellation and post-commit failure cannot leave partial geometry, provenance or history',async()=>{
 for(const mode of ['cancel','stale','post-commit']){
  const e=editor(),original=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshPhysicalMaterial());e.insertObject(original,'Original');e.timeline.frame=13;e.commit();const before=JSON.stringify(e.serialize()),journal=e.journal,state=journal.checkpoint(),selected=e.selected.uuid,controller=new AbortController(),commit=e.commit;
  if(mode==='post-commit')e.commit=function(){commit.call(this);throw Error('Injected import commit failure');};
  const pending=e.importGLB(payload,'Interrupted import',null,{metadata:provenance(),signal:controller.signal});
  let replacement;if(mode==='cancel')controller.abort();if(mode==='stale'){replacement=new THREE.Group();e.root=replacement;}
  await assert.rejects(pending,/cancel|changed|commit failure/i);
  if(mode==='stale'){assert.equal(e.root,replacement);assert.equal(e.root.children.length,0);}else{assert.equal(JSON.stringify(e.serialize()),before);assert.equal(e.timeline.frame,13);assert.equal(e.selected.uuid,selected);assert.equal(e.journal,journal);assert.equal(journal.cursor,state.cursor);assert.deepEqual(journal.entries,state.entries);}
 }
});
