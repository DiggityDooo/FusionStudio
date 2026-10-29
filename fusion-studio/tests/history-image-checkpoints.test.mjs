import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Editor} from '../src/editor.js';
import {HistoryImages} from '../src/history-images.js';
import {immutableImageSnapshot,isImmutableImageSnapshot} from '../src/image-snapshots.js';
import {deformationTransaction} from '../src/deformation-ui.js';

function fixture(){
 const root=new T.Group(),pixels=Uint8Array.from({length:256*256*4},(_,i)=>i*31%256),texture=new T.DataTexture(pixels,256,256),mesh=new T.Mesh(new T.TorusGeometry(.5,.12,64,256),new T.MeshStandardMaterial({map:texture}));texture.needsUpdate=true;root.add(mesh);
 const e=Object.assign(Object.create(Editor.prototype),{root,scene:new T.Scene(),history:[],historyAt:-1,change(){},select(n){this.selected=n;},wire(){},meshTools:{setMode(){}},timeline:{frame:13,end:100,fps:24,reset(){}},camera:new T.PerspectiveCamera(),orbit:{target:new T.Vector3()},bookmarks:[]});e.scene.add(root);e.select(mesh);return {e,mesh,texture,pixels};
}

test('internal image snapshots reuse immutable pixels while public documents own mutable image arrays',()=>{
 const {e,texture,pixels}=fixture(),first=e.serialize({immutableImages:true}),again=e.serialize({immutableImages:true}),image=first.images.find(i=>i.uuid===texture.source.uuid);assert.equal(image,again.images.find(i=>i.uuid===texture.source.uuid));assert.equal(isImmutableImageSnapshot(image),true);assert.ok(Object.isFrozen(image.url.data));assert.throws(()=>{image.url.data[0]=255;},TypeError);
 const publicDoc=e.serialize(),copy=publicDoc.images.find(i=>i.uuid===image.uuid);assert.notEqual(copy.url,image.url);copy.url.data[0]=99;assert.equal(image.url.data[0],pixels[0]);assert.equal(e.serialize().images.find(i=>i.uuid===image.uuid).url.data[0],pixels[0]);const saved=e.document('Detached images');saved.scene.images.find(i=>i.uuid===image.uuid).url.data[0]=88;assert.equal(texture.image.data[0],pixels[0]);assert.equal(image.url.data[0],pixels[0]);
});

test('versioned pixel edits and changed source identities invalidate the image cache without changing older snapshots',()=>{
 const {e,texture}=fixture(),first=e.serialize({immutableImages:true}).images[0];texture.image.data[0]=67;texture.needsUpdate=true;const changed=e.serialize({immutableImages:true}).images[0];assert.notEqual(changed,first);assert.equal(changed.url.data[0],67);assert.equal(first.url.data[0],0);texture.source.uuid=T.MathUtils.generateUUID();const renamed=e.serialize({immutableImages:true});assert.equal(renamed.images[0].uuid,texture.source.uuid);assert.equal(renamed.textures.find(t=>t.uuid===texture.uuid).image,texture.source.uuid);assert.equal(changed.uuid,first.uuid);
});

test('history caches only owned immutable images and still notices edits to caller-owned image documents',()=>{
 const history=new HistoryImages(),raw={uuid:'first',url:{data:[17,23,45,255],width:1,height:1,type:'Uint8Array'}},image=immutableImageSnapshot(raw);raw.url.data[0]=99;assert.equal(image.url.data[0],17);const a=history.capture({images:[image]}),same=history.capture({images:[immutableImageSnapshot({...raw,uuid:'second',url:{...raw.url,data:[17,23,45,255]}})]});assert.equal(JSON.parse(a).images[0].fusion_history_image,JSON.parse(same).images[0].fusion_history_image);
 const b=history.capture({images:[raw]});raw.url.data[0]=88;const c=history.capture({images:[raw]});assert.notEqual(JSON.parse(b).images[0].fusion_history_image,JSON.parse(c).images[0].fusion_history_image);assert.equal(history.expand(JSON.parse(b)).images[0].url.data[0],99);assert.equal(history.expand(JSON.parse(c)).images[0].url.data[0],88);
});

test('nested image leases survive pruning, release once and cannot pin misleading metadata or missing payloads',()=>{
 const history=new HistoryImages(),image=immutableImageSnapshot({uuid:'pixels',url:{data:[1,2],width:1,height:1,type:'Uint8Array'}}),snapshot=history.capture({images:[image],object:{userData:{fusion_history_image:'999999'}}}),one=history.retain(snapshot),two=history.retain(snapshot);history.prune([]);assert.equal(history.expand(JSON.parse(snapshot)).images[0].url.data[0],1);one();one();history.prune([]);assert.equal(history.payloads.size,1);two();history.prune([]);assert.equal(history.payloads.size,0);assert.equal(history.pins.size,0);const next=history.capture({images:[image]});assert.notEqual(JSON.parse(next).images[0].fusion_history_image,JSON.parse(snapshot).images[0].fusion_history_image);assert.throws(()=>history.retain(JSON.stringify({images:[JSON.parse(next).images[0],{uuid:'bad',fusion_history_image:'missing'}]})),/history image is missing/);assert.equal(history.pins.size,0);
});

test('failed dependent changes restore uncommitted geometry and pixels even when journal pruning runs',async()=>{
 const {e,mesh,texture}=fixture();e.commit();const cursor=e.journal.cursor,id=mesh.uuid,sourceId=texture.source.uuid;mesh.position.x=.25;texture.image.data[0]=67;texture.needsUpdate=true;const vertex=mesh.geometry.attributes.position.getX(500);
 await assert.rejects(deformationTransaction(e,id,root=>{root.position.x=8;root.geometry.attributes.position.setX(500,vertex+.2);root.material.map.image.data[0]=99;root.material.map.needsUpdate=true;e.historyImages.prune([e.journal.baseline,...e.journal.entries.flatMap(row=>[row.before,row.after])]);throw Error('Injected dependent failure');}),/dependent failure/);
 const restored=e.root.getObjectByProperty('uuid',id);assert.equal(restored.position.x,.25);assert.equal(restored.geometry.attributes.position.getX(500),vertex);assert.equal(restored.material.map.image.data[0],67);assert.equal(restored.material.map.source.uuid,sourceId);assert.equal(e.selected.uuid,id);assert.equal(e.timeline.frame,13);assert.equal(e.journal.cursor,cursor);assert.equal(e.historyImages.pins.size,0);assert.equal(e.batching,false);
});

test('completed dependent edits have one history entry and retain changed pixels through undo and redo',async()=>{
 const {e,mesh}=fixture();e.commit();const cursor=e.journal.cursor,id=mesh.uuid;await deformationTransaction(e,id,root=>{root.position.z=.7;root.material.map.image.data[0]=77;root.material.map.needsUpdate=true;});assert.equal(e.journal.cursor,cursor+1);assert.equal(e.historyImages.pins.size,0);await e._undo();assert.equal(e.root.getObjectByProperty('uuid',id).position.z,0);assert.equal(e.root.getObjectByProperty('uuid',id).material.map.image.data[0],0);await e._redo();assert.equal(e.root.getObjectByProperty('uuid',id).position.z,.7);assert.equal(e.root.getObjectByProperty('uuid',id).material.map.image.data[0],77);
});

test('a newly restored project is not overwritten by an older transaction and old image leases are released',async()=>{
 const {e,mesh}=fixture();e.commit();const pool=e.historyImages,next=new T.Group();next.name='New scene';await assert.rejects(deformationTransaction(e,mesh.uuid,async()=>{await e.restore(next.toJSON());}),/Scene changed/);assert.equal(e.root.name,'New scene');assert.equal(pool.pins.size,0);assert.equal(e.batching,false);
});

test('post-commit failure restores the old undo journal and pixel versions even after history pruning',async()=>{
 const {e,mesh}=fixture();e.commit();for(let value=1;value<=12;value++){mesh.material.map.image.data[0]=value;mesh.material.map.needsUpdate=true;e.commit();}const entries=e.journal.entries.slice(),cursor=e.journal.cursor,undoPixels=[...entries].reverse().map(row=>e.historyImages.expand(JSON.parse(row.before)).images[0].url.data[0]),commit=Editor.prototype.commit,id=mesh.uuid;
 e.commit=function(){commit.call(this);this.journal.entries.splice(0,this.journal.entries.length-1);this.journal.onChange();throw Error('Injected post-commit failure');};
 await assert.rejects(deformationTransaction(e,id,root=>{root.position.x=1;root.material.map.image.data[0]=99;root.material.map.needsUpdate=true;}),/post-commit failure/);assert.equal(e.root.getObjectByProperty('uuid',id).material.map.image.data[0],12);assert.equal(e.journal.entries.length,entries.length);assert.equal(e.journal.cursor,cursor);assert.equal(e.historyAt,cursor);assert.equal(e.historyImages.pins.size,0);
 assert.ok(e.journal.entries.every((entry,i)=>entry===entries[i]));
 for(const value of undoPixels){await e._undo();assert.equal(e.root.getObjectByProperty('uuid',id).material.map.image.data[0],value);}
});

test('history checkpoints retain command/cache state and reject checkpoints from another document',()=>{
 const {e,mesh}=fixture();e.commit();e._transformField('position','x',.2);e.journal.cacheMetadata(mesh.uuid,'first',{value:1});const state=e.journal.checkpoint(),entry=e.journal.entries.at(-1);e.adjustTransform({kind:'position',axis:'x',value:.4});e.journal.cacheMetadata(mesh.uuid,'second',{value:2});e.journal.restoreCheckpoint(state);assert.equal(e.journal.entries.at(-1),entry);assert.equal(entry.after.position[0],.2);assert.equal(e.journal.pending.get(mesh.uuid).position[0],.2);assert.deepEqual([...e.journal.metadataChanges.get(mesh.uuid).keys()],['first']);const other=fixture().e;other.commit();assert.throws(()=>other.journal.restoreCheckpoint(state),/another document/);assert.equal(other.journal.entries.length,0);
});

test('replayed insertions do not alias live metadata into their original undo command',async()=>{
 const {e}=fixture();e.commit();const mesh=new T.Mesh(new T.TorusGeometry(.2,.04,32,128),new T.MeshStandardMaterial());mesh.userData.artist={note:'Original'};e.insertObject(mesh,'Detailed accessory');await e._undo();await e._redo();const replayed=e.root.getObjectByProperty('uuid',mesh.uuid),cursor=e.journal.cursor;replayed.userData.artist.note='Edited';e.commit();assert.equal(e.journal.cursor,cursor+1);await e._undo();assert.equal(e.root.getObjectByProperty('uuid',mesh.uuid).userData.artist.note,'Original');await e._redo();assert.equal(e.root.getObjectByProperty('uuid',mesh.uuid).userData.artist.note,'Edited');
});
