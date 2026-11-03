import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Editor} from '../src/editor.js';
import {Timeline} from '../src/timeline.js';
import {copyExportMaterials} from '../src/material-snapshot.js';
import {stampRenderIds} from '../src/materials.js';
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();});}};

function fixture(){
 const root=new THREE.Group(),material=new THREE.MeshPhysicalMaterial({ior:1.33,color:'#804c35',roughness:.4}),mesh=new THREE.Mesh(new THREE.SphereGeometry(.5,192,144),material);
 material.userData.authored={tags:['retain'],scalar:.37};root.add(mesh);
 const e=Object.assign(Object.create(Editor.prototype),{root,scene:new THREE.Scene(),history:[],historyAt:-1,change(){},select(o){this.selected=o;},wire(){},frame(){},meshTools:{setMode(){}},camera:new THREE.PerspectiveCamera(),orbit:{target:new THREE.Vector3()},bookmarks:[]});e.scene.add(root);e.timeline=new Timeline(e);e.select(mesh);e.commit();return {e,mesh,material};
}

test('detailed GLB inspection and cancelled export never stamp render IDs onto live materials',async()=>{
 const {e,material}=fixture(),before=JSON.stringify(e.serialize()),original=JSON.stringify(material.toJSON()),history=e.journal.checkpoint();
 const result=await e.glb(false,{includeAnimations:false}),bytes=Buffer.from(result,'base64'),document=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
 assert.equal(document.materials[0].extras.fusion_material_id,material.uuid,'Delivery keeps the original stable sidecar ID');
 assert.equal(JSON.stringify(material.toJSON()),original,'Live material metadata and physical values stay exact');assert.equal(JSON.stringify(e.serialize()),before);assert.equal(e.journal.cursor,history.cursor);assert.deepEqual(e.journal.entries,history.entries);
 const controller=new AbortController();controller.abort();await assert.rejects(e.glb(false,{includeAnimations:false,signal:controller.signal}),/cancelled/);assert.equal(JSON.stringify(e.serialize()),before);assert.equal(material.userData.fusion_material_id,undefined);
});

test('export ownership preserves shared material identity, texture resources and authored metadata across roots',()=>{
 const pixels=new Uint8Array([17,23,41,255]),texture=new THREE.DataTexture(pixels,1,1),material=new THREE.MeshPhysicalMaterial({map:texture,ior:1.8}),other=new THREE.MeshStandardMaterial({color:'#a04030'});
 material.userData={authored:{tags:['source']},fusion_surface:{color:'#804c35',roughness:.37}};const before=JSON.stringify(material.toJSON()),version=texture.version,sourceId=texture.source.uuid,array=[material,other,material],a=new THREE.Group(),b=new THREE.Group();a.add(new THREE.Mesh(new THREE.SphereGeometry(.5,192,144),array));b.add(new THREE.Mesh(a.children[0].geometry,material));
 const copies=new WeakMap(),first=copyExportMaterials(a.clone(),copies),second=copyExportMaterials(b.clone(),copies),owned=first.children[0].material;
 assert.notEqual(owned,array);assert.notEqual(owned[0],material);assert.equal(owned[0],owned[2]);assert.equal(owned[0],second.children[0].material);assert.equal(owned[0].uuid,material.uuid);assert.equal(owned[0].ior,material.ior);assert.equal(owned[0].map,texture);
 stampRenderIds(first);stampRenderIds(second);assert.equal(JSON.stringify(material.toJSON()),before);assert.equal(array[0],material);assert.equal(material.userData.fusion_material_id,undefined);assert.equal(texture.version,version);assert.equal(texture.source.uuid,sourceId);assert.deepEqual(pixels,new Uint8Array([17,23,41,255]));
});
