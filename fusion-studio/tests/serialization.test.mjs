import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Editor} from '../src/editor.js';
import {sculptGeometry, subdivideGeometry, maskAttribute} from '../src/mesh-tools.js';
import {compactPrimitive} from '../src/geometry-interchange.js';
import {ProjectLoader} from '../src/project-loader.js';
import {attachSceneFoundation} from '../src/scene-foundation.js';

test('project reload retains shared image identities, normal-map pixels and source texture settings',async()=>{
 const texture=new THREE.DataTexture(new Uint8Array([150,128,250,255]),1,1);texture.flipY=false;const material=new THREE.MeshStandardMaterial({normalMap:texture}),root=new THREE.Group();root.add(new THREE.Mesh(new THREE.TorusGeometry(.5,.1,24,64),material));const source=texture.source.uuid;
 for(let i=0;i<3;i++){const copy=await new ProjectLoader().parseAsync(JSON.parse(JSON.stringify(root.toJSON()))),map=copy.children[0].material.normalMap;assert.equal(map.source.uuid,source);assert.equal(map.uuid,texture.uuid);assert.equal(map.flipY,false);assert.deepEqual(Array.from(map.image.data),[150,128,250,255]);root.children[0].material=copy.children[0].material;}
});

function fixture(){
 const e=Object.create(Editor.prototype);
 Object.assign(e,{root:new THREE.Group(),scene:new THREE.Scene(),history:[],historyAt:-1,change(){},select(){},wire(){},meshTools:{setMode(){}},timeline:{reset(){}}});
 e.scene.add(e.root);const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),new THREE.MeshStandardMaterial());e.root.add(mesh);return {e,mesh};
}

test('scene-tool settings and collections survive history and project reload; invalid settings keep the live scene',async()=>{
 const {e,mesh}=fixture();e.transform={setSpace(){},setTranslationSnap(){},setRotationSnap(){},setScaleSnap(){}};attachSceneFoundation(e);e.commit();
 const collection=e.foundation.createCollection('Character working copies');e.foundation.assignCollection(mesh,collection.id);
 e.foundation.setCollectionVisible(collection.id,false);
 e.foundation.setSnap({enabled:true,mode:'grid',increment:.25,angleDeg:30});e.foundation.setGizmoSpace('local');
 e.foundation.setUnits({system:'imperial',unit:'in',scale:.0254});
 await e.undo();assert.equal(e.foundation.state.units.system,'metric');
 await e.redo();assert.equal(e.foundation.state.units.unit,'in');
 const saved=JSON.parse(JSON.stringify(e.serialize())),{e:copy}=fixture();attachSceneFoundation(copy);await copy.restore(saved);
 assert.equal(copy.foundation.state.snap.increment,.25);assert.equal(copy.foundation.state.gizmo.space,'local');
 assert.equal(copy.foundation.state.units.scale,.0254);
 const restored=copy.foundation.state.collections.find(c=>c.id===collection.id);
 assert.equal(restored.name,'Character working copies');assert.deepEqual(restored.members,[mesh.uuid]);assert.equal(restored.visible,false);
 assert.equal(copy.root.getObjectByProperty('uuid',mesh.uuid).visible,false);
 const invalid=structuredClone(saved);invalid.object.userData.fusion_scene_foundation.snap.increment=0;const before=copy.root;
 await assert.rejects(copy.restore(invalid),/scene-tool settings/);assert.equal(copy.root,before);
 const legacy=structuredClone(saved);delete legacy.object.userData.fusion_scene_foundation;delete legacy.object.userData.units;
 await copy.restore(legacy);assert.equal(copy.foundation.state.snap.enabled,false);assert.equal(copy.foundation.state.collections.length,1);
});

test('textured edits share unchanged history pixels, retain changed pixels through undo/redo, and save self-contained projects',async()=>{
 const {e,mesh}=fixture(),texture=new THREE.DataTexture(new Uint8Array(256*256*4).fill(180),256,256);mesh.material.map=texture;e.commit();const retained=e.historyImages.characters;
 for(let i=0;i<5;i++){mesh.name='Texture study '+i;e.commit();}assert.equal(e.journal.entries.length,5);assert.equal(e.historyImages.characters,retained);assert.ok(e.journal.snapshotCharacters<retained/2);assert.ok(JSON.parse(e.journal.baseline).images.every(i=>i.fusion_history_image));assert.ok(e.serialize().images.every(i=>!i.fusion_history_image));
 const detached=e.serialize();detached.images.find(i=>i.uuid===texture.source.uuid).url.data[0]=2;assert.equal(e.serialize().images.find(i=>i.uuid===texture.source.uuid).url.data[0],180,'Editing a returned document must not mutate the encoding cache');texture.image.data[0]=77;texture.needsUpdate=true;e.commit();await e.undo();assert.equal(e.root.children[0].material.map.image.data[0],180);await e.redo();assert.equal(e.root.children[0].material.map.image.data[0],77);const saved=JSON.parse(JSON.stringify(e.serialize())),copy=await new ProjectLoader().parseAsync(saved);assert.equal(copy.children[0].material.map.image.data[0],77);assert.equal(copy.children[0].material.map.source.uuid,texture.source.uuid);await assert.rejects(new ProjectLoader().parseAsync(JSON.parse(e.journal.baseline)),/History-only/);
});
test('source capsule and original path survive a project save/reopen roundtrip',async()=>{
 const {e}=fixture();
 const capsule={schema:1,sourceId:'src-abc',originalName:'Genesis 9.duf',formatId:'dson',adapterId:'dson',adapterKind:'direct-import',editable:'subset',sha256:'a'.repeat(64),byteLength:42,dependencies:[{id:'data/base.dsf',originalLocator:'data/base.dsf',role:'dependency',status:'found',sha256:'b'.repeat(64)}],completeness:'complete',unsupportedFields:['hd_morphs']};
 const group=new THREE.Group();group.name='Genesis 9';group.userData={sourceCapsule:capsule,sourceOriginalPath:'C:/lib/Genesis 9.duf'};
 group.add(new THREE.Mesh(new THREE.SphereGeometry(1,12,8),new THREE.MeshStandardMaterial()));e.root.add(group);
 const saved=JSON.parse(JSON.stringify(e.serialize()));
 const copy=await new ProjectLoader().parseAsync(saved);
 const restored=copy.children.find(c=>c.name==='Genesis 9');assert.ok(restored,'imported group must survive the roundtrip');
 assert.deepEqual(restored.userData.sourceCapsule,capsule,'capsule in a saved project must reopen intact');
 assert.equal(restored.userData.sourceOriginalPath,'C:/lib/Genesis 9.duf');
});
test('sculpt stroke on detailed imported-style geometry survives undo/redo and project reopen',async()=>{
 const {e}=fixture();
 // Detailed fixture (47k tris) with UVs and a painted mask region, standing in for an imported mesh.
 const geo=subdivideGeometry(new THREE.SphereGeometry(0.5,48,32),2);
 const mask=maskAttribute(geo);for(let i=0;i<mask.count;i+=7)mask.array[i]=0.8;
 const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial());mesh.name='Imported detail';e.root.add(mesh);mesh.updateMatrixWorld(true);
 e.commit();
 const baseline=new Float32Array(geo.attributes.position.array);
 const touched=sculptGeometry(mesh,new THREE.Vector3(0,0.5,0),0.25,0.02,'draw',false,{normal:new THREE.Vector3(0,1,0)});
 assert.ok(touched>1000,`stroke on detailed geometry should affect thousands of vertices, got ${touched}`);
 const stroked=new Float32Array(geo.attributes.position.array);
 assert.ok(valuesEqual(stroked,baseline)===false,'stroke must displace detailed geometry');
 e.commit();
 await e.undo();assert.ok(valuesEqual(new Float32Array(e.root.children.at(-1).geometry.attributes.position.array),baseline),'undo must restore the detailed baseline exactly');
 await e.redo();const redone=e.root.children.at(-1);assert.ok(valuesEqual(new Float32Array(redone.geometry.attributes.position.array),stroked),'redo must restore the stroke exactly');
 const saved=JSON.parse(JSON.stringify(e.serialize()));
 const copy=await new ProjectLoader().parseAsync(saved);
 const restored=copy.children.find(c=>c.name==='Imported detail');assert.ok(restored,'detailed mesh must survive reopen');
 assert.ok(valuesEqual(new Float32Array(restored.geometry.attributes.position.array),stroked),'reopened geometry must keep the sculpted positions');
 assert.ok(restored.geometry.attributes.mask,'mask channel must survive reopen');
 assert.equal(restored.geometry.attributes.uv.count,restored.geometry.attributes.position.count,'UVs must survive reopen');
 let maskKept=0;for(let i=0;i<restored.geometry.attributes.mask.count;i+=7)if(Math.abs(restored.geometry.attributes.mask.array[i]-0.8)<1e-6)maskKept++;
 assert.ok(maskKept>1000,'painted mask values must survive reopen');
});
const valuesEqual=(actual,expected)=>actual.length===expected.length&&actual.every((n,i)=>n===expected[i]);
test('snapshot captures numeric transforms immediately, before a render',async()=>{
 const {e,mesh}=fixture();e.commit();mesh.position.x=3;mesh.rotation.z=.4;mesh.scale.y=2;e.commit();
 assert.equal(e.history.length,2);
 const loaded=await new THREE.ObjectLoader().parseAsync(e.serialize());
 assert.equal(loaded.children[0].position.x,3);assert.ok(Math.abs(loaded.children[0].rotation.z-.4)<1e-6);assert.equal(loaded.children[0].scale.y,2);
 await e.undo();assert.equal(e.root.children[0].position.x,0);await e.redo();assert.equal(e.root.children[0].position.x,3);
});

test('snapshot undo and redo keep the active frame and authored pose while direct project restore resets it',async()=>{
 const {e,mesh}=fixture();e.timeline={frame:9,playing:true,reset(){this.frame=1;this.playing=false;}};
 e.commit();mesh.position.x=4;e.commit();
 await e.undo();assert.equal(e.timeline.frame,9);assert.equal(e.timeline.playing,false);assert.equal(e.root.children[0].position.x,0);
 await e.redo();assert.equal(e.timeline.frame,9);assert.equal(e.root.children[0].position.x,4);
 await e.restore(e.serialize());assert.equal(e.timeline.frame,1);assert.equal(e.root.children[0].position.x,4);
});
test('authored imported quaternions survive repeated reload exactly while manual shear matrices remain intact',async()=>{
 const {e,mesh}=fixture(),joint=new THREE.Bone();joint.quaternion.set(.11233392357826233,.23499999940395355,.33219999074935913,.9063000082969666);joint.position.set(.1123,1.2345,-.0567);e.root.add(joint);mesh.matrixAutoUpdate=false;mesh.matrix.set(1,.2,0,0,0,1,0,0,0,0,1,0,0,0,0,1);
 const q=joint.quaternion.toArray(),position=joint.position.toArray(),matrix=mesh.matrix.toArray(),id=joint.uuid;
 for(let i=0;i<5;i++){const saved=JSON.parse(JSON.stringify(e.serialize()));e.root=await new THREE.ObjectLoader().parseAsync(saved);const next=e.root.getObjectByProperty('uuid',id);assert.deepEqual(next.quaternion.toArray(),q);assert.deepEqual(next.position.toArray(),position);assert.deepEqual(e.root.getObjectByProperty('uuid',mesh.uuid).matrix.toArray(),matrix);assert.equal(e.root.getObjectByProperty('uuid',mesh.uuid).matrixAutoUpdate,false);}
});
test('transform deltas materialize authored channels without a ghost snapshot or quaternion decomposition',async()=>{
 const {e,mesh}=fixture();e.selected=mesh;mesh.quaternion.set(.11233392357826233,.23499999940395355,.33219999074935913,.9063000082969666);e.commit();const q=mesh.quaternion.toArray();e._transformField('position','x',2.5);const count=e.journal.entries.length;e.commit();assert.equal(e.journal.entries.length,count,'No-op commit after a transform must not add a snapshot');
 mesh.name='Snapshot boundary';e.commit();await e.undo();const restored=e.root.getObjectByProperty('uuid',mesh.uuid);assert.deepEqual(restored.quaternion.toArray(),q);assert.equal(restored.position.x,2.5);
});
test('sculpted primitive positions and UV edits survive JSON reload and undo/redo',async()=>{
 const {e,mesh}=fixture();e.commit();
 sculptGeometry(mesh,new THREE.Vector3(0,1,0),.3,.05);mesh.geometry.attributes.uv.setXY(0,.123,.456);
 const positions=Array.from(mesh.geometry.attributes.position.array),uv=Array.from(mesh.geometry.attributes.uv.array);e.commit();
 const loaded=await new THREE.ObjectLoader().parseAsync(JSON.parse(JSON.stringify(e.serialize())));
 assert.ok(valuesEqual(Array.from(loaded.children[0].geometry.attributes.position.array),positions),'sculpted positions preserved');
 assert.ok(valuesEqual(Array.from(loaded.children[0].geometry.attributes.uv.array),uv),'UV edits preserved');
 await e.undo();assert.notDeepEqual(Array.from(e.root.children[0].geometry.attributes.position.array),positions);
 await e.redo();assert.ok(valuesEqual(Array.from(e.root.children[0].geometry.attributes.position.array),positions));
});
test('buffer serialization retains groups, morphs and source geometry identity',async()=>{
 const {e,mesh}=fixture(),g=mesh.geometry;
 g.morphAttributes.position=[g.attributes.position.clone()];g.morphTargetsRelative=true;g.addGroup(0,6,0);
 const id=g.uuid,positions=g.attributes.position,parameters=g.parameters;
 const doc=e.serialize(),loaded=await new THREE.ObjectLoader().parseAsync(doc),copy=loaded.children[0].geometry;
 assert.equal(copy.uuid,id);assert.deepEqual(copy.groups,g.groups);assert.equal(copy.morphTargetsRelative,true);assert.equal(copy.morphAttributes.position[0].count,positions.count);
 assert.equal(g.attributes.position,positions);assert.equal(g.parameters,parameters);assert.equal(g.type,'SphereGeometry');
});

test('glTF primitive compaction retains indexed shape, normalized weights, UVs and morphs without the unused accessor tail',()=>{
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(Array.from({length:3000},(_,i)=>i/10),3));g.setIndex([8,3,10,10,3,8]);
 const interleaved=new THREE.InterleavedBuffer(new Uint8Array(4000).map((_,i)=>i%256),4);g.setAttribute('skinWeight',new THREE.InterleavedBufferAttribute(interleaved,4,0,true));g.setAttribute('uv',new THREE.Float32BufferAttribute(Array.from({length:2000},(_,i)=>i/100),2));g.morphAttributes.position=[g.attributes.position.clone()];g.morphTargetsRelative=true;
 const c=compactPrimitive(g);assert.equal(c.attributes.position.count,3);assert.equal(g.attributes.position.count,1000);assert.deepEqual([...c.index.array],[0,1,2,2,1,0]);assert.equal(c.attributes.skinWeight.normalized,true);assert.equal(c.morphTargetsRelative,true);
 for(let i=0;i<6;i++)for(const key of ['position','uv','skinWeight'])for(let channel=0;channel<g.attributes[key].itemSize;channel++)assert.equal(c.attributes[key].getComponent(c.index.getX(i),channel),g.attributes[key].getComponent(g.index.getX(i),channel));
 assert.deepEqual([...c.morphAttributes.position[0].array],[...c.attributes.position.array]);assert.ok(JSON.stringify(c.toJSON()).length<JSON.stringify(g.toJSON()).length/10);
});
