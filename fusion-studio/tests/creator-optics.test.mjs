import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import * as THREE from 'three';
import {createEyeSurfaces} from '../src/creator-eyes.js';
import {createDetailedCharacter,changeCreator,creatorPositions,creatorRenderMaterials} from '../src/character-creator.js';
import {updateCreatorAttachments} from '../src/creator-appearance.js';
import {ProjectLoader} from '../src/project-loader.js';
import {Editor} from '../src/editor.js';
import {characterMaterials} from '../electron/character-materials.cjs';

const definition=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../public/characters/makehuman-v1.json.gz',import.meta.url))));
const arrays=g=>Array.from(g.attributes.position.array);
test('ocular surfaces put iris/pupil behind a closed cornea instead of intersecting a full sphere',()=>{
 const surfaces=createEyeSurfaces(.0127),d=surfaces.dimensions;
 for(const name of ['sclera','iris','pupil','cornea'])assert.ok(arrays(surfaces[name]).every(Number.isFinite));
 const iris=surfaces.iris.attributes.position;
 for(let i=0;i<iris.count;i++){const radius=Math.hypot(iris.getX(i),iris.getY(i));assert.ok(radius>=d.pupilRadius-1e-8);if(radius<=d.aperture){const back=d.center+Math.sqrt((d.curvature-d.thickness)**2-radius**2);assert.ok(iris.getZ(i)<back-1e-6,'iris clears the inner cornea');}}
 const sclera=surfaces.sclera.attributes.position;for(let i=0;i<sclera.count;i++)assert.ok(sclera.getZ(i)<=d.limbus+1e-8);
 const p=surfaces.cornea.attributes.position,idx=surfaces.cornea.index,ids=new Map(),weld=[];
 for(let i=0;i<p.count;i++){const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e9)).join(':');if(!ids.has(key))ids.set(key,ids.size);weld.push(ids.get(key));}
 const edges=new Map();let volume=0;const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
 for(let i=0;i<idx.count;i+=3){const face=[0,1,2].map(k=>idx.getX(i+k));assert.equal(new Set(face.map(id=>weld[id])).size,3);for(let k=0;k<3;k++){const x=weld[face[k]],y=weld[face[(k+1)%3]],key=[x,y].sort((a,b)=>a-b).join(':');edges.set(key,(edges.get(key)||0)+1);}a.fromBufferAttribute(p,face[0]);b.fromBufferAttribute(p,face[1]);c.fromBufferAttribute(p,face[2]);volume+=a.dot(b.clone().cross(c))/6;}
 assert.ok([...edges.values()].every(n=>n===2),'cornea volume has no open or non-manifold welded edges');assert.ok(volume>0,'cornea winding encloses positive volume');
 assert.throws(()=>createEyeSurfaces(NaN),/radius/);assert.throws(()=>createEyeSurfaces(2),/radius/);
});

test('legacy appearance stays unchanged on reopen and explicit upgrade retains the cage, pose and source',async()=>{
 const root=createDetailedCharacter(definition),source=JSON.stringify(definition.source.positions),recipe=structuredClone(root.userData.fusion_creator.recipe);delete recipe.appearance.version;changeCreator(root,recipe);root.getObjectByName('head').rotation.y=.3;
 const eye=root.getObjectByName('Eye 0'),before=arrays(eye.geometry),id=eye.uuid,body=root.getObjectByName('Body'),positions=arrays(body.geometry),scene=new THREE.Group();scene.add(root);
 const doc=JSON.parse(JSON.stringify(Editor.prototype.serialize.call({root:scene}))),loaded=await new ProjectLoader().parseAsync(doc),copy=loaded.children[0];assert.equal(copy.userData.fusion_creator.recipe.appearance.version,undefined);assert.equal(copy.getObjectByName('Eye 0').uuid,id);assert.ok(arrays(copy.getObjectByName('Eye 0').geometry).every((v,i)=>v===before[i]),'legacy positions retain numeric values; JSON canonicalizes signed zero');
 const upgrade=structuredClone(root.userData.fusion_creator.recipe);upgrade.appearance.version=2;changeCreator(root,upgrade);assert.equal(root.getObjectByName('Eye 0').userData.fusion_eye_surface.version,2);assert.deepEqual(arrays(body.geometry),positions);assert.equal(root.getObjectByName('head').rotation.y,.3);assert.equal(JSON.stringify(definition.source.positions),source);
 const checked=characterMaterials(creatorRenderMaterials(root));assert.ok(checked.materials.some(m=>m.kind==='pupil'&&m.appearanceVersion===2));assert.throws(()=>characterMaterials({...checked,materials:[checked.materials[0],checked.materials[0]]}),/Duplicate/);
});

test('failed attachment fitting preserves the previous group, coverage and a retryable cache',()=>{
 const root=createDetailedCharacter(definition),recipe=structuredClone(root.userData.fusion_creator.recipe);recipe.visibility.clothing='underwear';changeCreator(root,recipe);
 const group=root.getObjectByName('Creator attachments'),coverage=root.getObjectByName('Creator coverage'),groupJSON=JSON.stringify(group.toJSON()),valid=new Float32Array(creatorPositions(root)),bad=valid.slice(),triangle=definition.source.hair.styles.brows[0].triangle;
 for(const id of triangle)for(let axis=0;axis<3;axis++)bad[id*3+axis]=bad[triangle[0]*3+axis];root.userData.fusion_creator.recipe.hair.style='short';
 assert.throws(()=>updateCreatorAttachments(root,bad),/collapsed/);assert.equal(root.getObjectByName('Creator attachments'),group);assert.equal(root.getObjectByName('Creator coverage'),coverage);assert.equal(JSON.stringify(group.toJSON()),groupJSON);
 updateCreatorAttachments(root,valid);assert.notEqual(root.getObjectByName('Creator attachments'),group);assert.ok(root.getObjectByName('Hairstyle · short'));const current=root.getObjectByName('Creator attachments');updateCreatorAttachments(root,valid);assert.equal(root.getObjectByName('Creator attachments'),current);
});

test('a finite but collapsed worker result cannot poison a matching recipe cache or leave a partial body',()=>{
 const root=createDetailedCharacter(definition),body=root.getObjectByName('Body'),geometry=body.geometry,positions=arrays(geometry),group=root.getObjectByName('Creator attachments'),recipe=structuredClone(root.userData.fusion_creator.recipe);root.getObjectByName('head').rotation.y=.23;
 assert.throws(()=>changeCreator(root,recipe,{result:{positions:new Float32Array(definition.source.positions.length),scale:1,ground:0,milliseconds:1,sparseDeltas:0}}),/radius|collapsed/);
 assert.equal(body.geometry,geometry);assert.deepEqual(arrays(body.geometry),positions);assert.equal(root.getObjectByName('Creator attachments'),group);assert.equal(root.getObjectByName('head').rotation.y,.23);assert.deepEqual(root.userData.fusion_creator.recipe,recipe);
 changeCreator(root,recipe);assert.deepEqual(arrays(body.geometry),positions);
});

test('a returned project document cannot mutate live character or material metadata before failed loading',async()=>{
 const root=new THREE.Group(),character=createDetailedCharacter(definition);root.add(character);const material=character.getObjectByName('Body').material;material.userData.custom={flags:['original']};
 const editor=Object.assign(Object.create(Editor.prototype),{root,timeline:{frame:1,end:100,fps:24},camera:new THREE.PerspectiveCamera(),orbit:{target:new THREE.Vector3()},bookmarks:[]});
 const doc=editor.document('Isolated snapshot'),find=n=>n.userData?.fusion_creator?n:(n.children||[]).map(find).find(Boolean);find(doc.scene.object).userData.fusion_creator.recipe.appearance.version=99;doc.scene.materials.find(m=>m.uuid===material.uuid).userData.custom.flags.push('changed');
 assert.equal(character.userData.fusion_creator.recipe.appearance.version,2);assert.deepEqual(material.userData.custom.flags,['original']);await assert.rejects(new ProjectLoader().parseAsync(doc.scene),/appearance version/);assert.equal(character.userData.fusion_creator.recipe.appearance.version,2);
});
