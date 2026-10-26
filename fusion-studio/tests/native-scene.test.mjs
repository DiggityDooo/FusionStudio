import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {attachNativeScene,nativeRenderState,fingerprint} from '../src/native-scene.js';
const {validateNativeScene}=createRequire(import.meta.url)('../electron/native-scene.cjs');
test('preserved scene checksum rejects corrupt payloads, invalid transforms and invalid binary headers',()=>{
 const bytes=Buffer.from('BLENDER-v300fixture'),scene={version:1,data:bytes.toString('base64'),sha256:crypto.createHash('sha256').update(bytes).digest('hex'),matrix:new THREE.Matrix4().toArray()};
 assert.deepEqual(validateNativeScene(scene),bytes);assert.throws(()=>validateNativeScene({...scene,sha256:'wrong'}),/checksum/);assert.throws(()=>validateNativeScene({...scene,matrix:[Infinity]}),/Invalid/);assert.throws(()=>validateNativeScene({...scene,data:Buffer.from('not a Blender file').toString('base64')}),/Invalid/);
});
test('native render state permits owner transforms but blocks edited geometry/materials and survives JSON reload',async()=>{
 const root=new THREE.Group(),owner=new THREE.Group();root.add(owner);const mesh=new THREE.Mesh(new THREE.BufferGeometry().copy(new THREE.BoxGeometry()),new THREE.MeshStandardMaterial());mesh.geometry.attributes.position.setX(0,-0);mesh.geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.geometry.index.array),1));owner.add(mesh);attachNativeScene(owner,{version:1,data:'fixture',sha256:'fixture',scale:1});
 const editor={root};owner.position.x=3;assert.equal(nativeRenderState(editor).resource.matrix[12],3);owner.visible=false;assert.equal(nativeRenderState(editor),null);owner.visible=true;
 const restored=await new THREE.ObjectLoader().parseAsync(JSON.parse(JSON.stringify(root.toJSON())));assert.equal(fingerprint(restored.children[0]),owner.userData.nativeBlend.baseline);assert.ok(nativeRenderState({root:restored}));
 owner.children[0].material.color.set('#ff0000');assert.throws(()=>nativeRenderState(editor),/changed/);owner.children[0].material.color.set('#ffffff');owner.children[0].geometry.attributes.position.setX(0,4);assert.throws(()=>nativeRenderState(editor),/changed/);
});
