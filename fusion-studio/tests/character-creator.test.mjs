import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import * as THREE from 'three';
import {createDetailedCharacter,changeCreator,creatorShape,makeShapeEditingCopy,finishShapeEditingCopy,creatorPositions,validateCreatorDefinition,creatorRenderMaterials,compactCreatorDerivedGeometry,updateCreatorAppearance} from '../src/character-creator.js';
import {computeCreator,creatorInputs,defaultRecipe,validateRecipe,seededRandomize,mirrorShape,SKIN_TONES} from '../src/creator-data.js';
import {ProjectLoader} from '../src/project-loader.js';
import {Timeline} from '../src/timeline.js';
import {evaluatedCharacterTriangles,bakeCharacterExchange} from '../src/deformation.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {characterMaterials} from '../electron/character-materials.cjs';
import {neutralCharacterMesh,measureNeutralMesh} from '../src/body-measurements.js';
import {shirtJointsForCharacter,draftSurfaceShirt} from '../src/surface-shirt.js';
import {sourcePlacementBody} from '../src/garment-placement.js';
import {Editor} from '../src/editor.js';
import {createSkinWeightModel,weightPatch,applySkinPatch} from '../src/skin-weights.js';
import {inspectObject,checkCompatibility} from '../src/compatibility.js';
import {MeshTools} from '../src/mesh-tools.js';
const definition=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../public/characters/makehuman-v1.json.gz',import.meta.url))));
const sourceHash=()=>JSON.stringify(definition.source.positions);

test('adult presets evaluate detailed immutable CC0 geometry, exact height, normalized weights and landmarks',()=>{
 const before=sourceHash(),body=[];
 for(const sex of ['female','male']){const root=createDetailedCharacter(definition,{sex}),positions=creatorPositions(root),ids=definition.source.cornerSource,y=ids.map(i=>positions[i*3+1]);assert.ok(root.getObjectByName('Body').geometry.index.count/3>=26000);assert.ok(Math.abs(Math.max(...y)-Math.min(...y)-root.userData.fusion_creator.recipe.controls.height)<1e-6);body.push(Array.from(positions));assert.ok(root.getObjectByName('Cornea 0'));assert.equal(root.getObjectByName('Body').skeleton.bones.length,definition.source.bones.length);}
 assert.notDeepEqual(body[0],body[1]);assert.equal(sourceHash(),before);assert.equal(SKIN_TONES.length,24);
});
test('warm creator slider evaluation stays inside the plan 14.4 100 ms target',()=>{
 const root=createDetailedCharacter(definition,{sex:'female'}),id=definition.controls[0].id;
 const evaluate=v=>{const recipe=structuredClone(root.userData.fusion_creator.recipe);recipe.controls[id]=v;const start=performance.now();changeCreator(root,recipe);return performance.now()-start;};
 evaluate(.1);evaluate(-.1); // warm caches (sparse validation, skeleton, appearance)
 const times=[evaluate(.2),evaluate(-.2),evaluate(.3),evaluate(-.3),evaluate(0)].sort((a,b)=>a-b);
 assert.ok(times[2]<100,`warm creator evaluation median ${times[2].toFixed(1)} ms exceeds the 100 ms target`);
});
test('gesture previews defer attachment rebuilds until the settled update',()=>{
 const root=createDetailedCharacter(definition,{sex:'female'});
 const attachments=root.getObjectByName('Creator attachments');assert.ok(attachments,'character starts with attachments');
 const body=root.getObjectByName('Body'),before=body.geometry.attributes.position.array.slice();
 const recipe=structuredClone(root.userData.fusion_creator.recipe);recipe.controls[definition.controls[0].id]=.5;
 changeCreator(root,recipe,{deferAttachments:true});
 assert.equal(root.getObjectByName('Creator attachments'),attachments,'deferred preview must not rebuild attachments');
 assert.equal(root.userData.fusion_creator.attachmentsStale,true);
 assert.ok(body.geometry.attributes.position.array.some((v,i)=>v!==before[i]),'deferred preview still updates the body');
 updateCreatorAppearance(root);
 assert.notEqual(root.getObjectByName('Creator attachments'),attachments,'settled update rebuilds attachments once');
 assert.equal(root.userData.fusion_creator.attachmentsStale,false);
});
test('sparse evaluator follows reference arithmetic and rejects duplicate/non-finite data',()=>{
 const input={positions:[0,0,0,0,2,0,1,1,0],bodyIds:[0,1,2],height:2,targets:[{data:[2,.1,0,.2],value:.5}]},r=computeCreator(input);assert.ok(Math.abs(r.positions[6]-1.05)<1e-6);assert.ok(Math.abs(r.positions[8]-.1)<1e-6);assert.deepEqual(input.positions,[0,0,0,0,2,0,1,1,0]);assert.throws(()=>computeCreator({...input,targets:[{data:[2,.1,0,.2,2,0,0,0],value:1}]}),/duplicate/);assert.throws(()=>computeCreator({...input,targets:[{data:[9,0,0,0],value:1}]}),/invalid/);assert.throws(()=>computeCreator({...input,height:NaN}),/Invalid/);
});
test('seeded presets respect category locks and symmetry without coupling skin to geometry',()=>{
 const r=defaultRecipe();r.locks=['nose','weight'];const a=seededRandomize(definition,r,{seed:42}),b=seededRandomize(definition,r,{seed:42});assert.deepEqual(a,b);assert.equal(a.controls.weight,r.controls.weight);assert.ok(Object.keys(a.controls).every(id=>!id.startsWith('nose/')));const one=computeCreator(creatorInputs(definition,a));a.appearance.tone=23;assert.deepEqual(computeCreator(creatorInputs(definition,a)).positions,one.positions);a.family='other';assert.throws(()=>validateRecipe(a,definition),/family/);
});
test('shape editing is neutral, preserves source mapping, mirrors explicitly and rejects topology changes',()=>{
 const root=createDetailedCharacter(definition),body=root.getObjectByName('Body'),original=Array.from(body.geometry.attributes.position.array);changeCreator(root,creatorShape(root,{action:'create',name:'Custom nose'}));const shape=root.userData.fusion_creator.recipe.shapes[0];root.getObjectByName('head').rotation.y=.5;
 const copy=makeShapeEditingCopy(root,shape.id),tool={editor:{creatorShapeSession:{copy}},activeMesh:copy,faceIndex:0},originalCount=copy.geometry.index.count;for(const operation of ['extrude','_extrude','deleteFace'])assert.throws(()=>MeshTools.prototype[operation].call(tool,.01),/preserve topology/);assert.equal(copy.geometry.index.count,originalCount);const id=definition.source.triangles[100];copy.geometry.attributes.position.setZ(id,copy.geometry.attributes.position.getZ(id)+.005);const recipe=finishShapeEditingCopy(root,copy);assert.equal(recipe.shapes[0].deltas.length,4);const mirrored=mirrorShape(recipe.shapes[0],definition.source.mirror);assert.equal(mirrored.deltas[0],definition.source.mirror[id]);assert.ok(Math.abs(mirrored.deltas[1]+recipe.shapes[0].deltas[1])<1e-8);changeCreator(root,recipe);const mapped=Array.from(body.geometry.attributes._fusion_source_vertex.array).indexOf(id);assert.ok(body.geometry.morphAttributes.position[0].getZ(mapped)>.004);assert.equal(body.morphTargetInfluences[0],1);assert.equal(root.getObjectByName('head').rotation.y,.5);copy.geometry.index.array[0]=copy.geometry.index.array[1];assert.throws(()=>finishShapeEditingCopy(root,copy),/topology/);
});
test('project roundtrip retains recipes, live shapes, posed world coordinates and attachment identities',async()=>{
 const root=createDetailedCharacter(definition);let recipe=creatorShape(root,{action:'create',name:'Study'});recipe.shapes[0].deltas=[definition.source.triangles[100],.001,0,0];recipe.shapes[0].value=.4;changeCreator(root,recipe);root.position.set(.7,0,-.3);root.rotation.y=.3;root.getObjectByName('head').rotation.y=.2;root.updateMatrixWorld(true);const before=evaluatedCharacterTriangles(root),serialized=JSON.parse(JSON.stringify(root.toJSON())),copy=await new ProjectLoader().parseAsync(serialized),after=evaluatedCharacterTriangles(copy);assert.deepEqual(copy.userData.fusion_creator.recipe,recipe);assert.equal(after.positions.length,before.positions.length);assert.ok(Math.max(...after.positions.map((v,i)=>Math.abs(v-before.positions[i])))<1e-6);assert.equal(copy.getObjectByName('Creator attachments').uuid,root.getObjectByName('Creator attachments').uuid);assert.equal(sourceHash(),JSON.stringify(definition.source.positions));
});
test('authored shape key interpolation follows the shared timeline and stays in exchange',()=>{
 const root=createDetailedCharacter(definition),scene=new THREE.Group();scene.add(root);let recipe=creatorShape(root,{action:'create',name:'Animated'});recipe.shapes[0].deltas=[definition.source.triangles[100],.002,0,0];changeCreator(root,recipe);const editor={root:scene,selected:root,commit(){},change(){}},timeline=new Timeline(editor);timeline.insert();recipe=structuredClone(root.userData.fusion_creator.recipe);recipe.shapes[0].value=1;changeCreator(root,recipe);timeline.frame=11;timeline.insert();timeline.evaluate(6,{strict:true});assert.equal(root.userData.fusion_creator.recipe.shapes[0].value,.5);assert.equal(root.getObjectByName('Body').morphTargetInfluences[0],.5);const copy=cloneSkeleton(root);bakeCharacterExchange(copy);assert.equal(copy.userData.fusion_creator,undefined);assert.equal(copy.getObjectByName('Body').geometry.morphAttributes.position.length,1);assert.ok(copy.getObjectByName('Body').userData.fusion_render_object_id);
});
test('render sidecar retains fixed typed material parameters and rejects executable/path inputs',async()=>{
 const root=createDetailedCharacter(definition),spec=creatorRenderMaterials(root),checked=characterMaterials(spec);assert.ok(checked.materials.some(m=>m.kind==='skin'));assert.equal(characterMaterials({...spec,materials:spec.materials.map(m=>({...m,script:'arbitrary',path:'C:/private'}))}).materials[0].script,undefined);assert.throws(()=>characterMaterials({version:1,materials:[{kind:'skin',version:1,objectId:'../bad',materialId:'x'}]}),/identity/);
 const report=checkCompatibility('glb',inspectObject(root));assert.equal(report.blocked,false);assert.ok(report.issues.some(i=>i.title==='Generator recipes stay in Fusion projects'));
 const iris=root.getObjectByName('Eye 0').material.color.getHexString(),editor={selected:root,ensureHistory(){},commit(){},change(){}};for(const [key,value]of [['color','#806040'],['roughness',.6],['metalness',.1]])Editor.prototype.surface.call(editor,key,value);assert.equal(root.getObjectByName('Eye 0').material.color.getHexString(),iris);const copy=await new ProjectLoader().parseAsync(JSON.parse(JSON.stringify(Editor.prototype.serialize.call({root}))));assert.equal(copy.getObjectByName('Body').material.color.getHexString(),'806040');assert.equal(copy.getObjectByName('Body').material.roughness,.6);assert.equal(copy.getObjectByName('Body').material.metalness,.1);assert.throws(()=>validateRecipe({...root.userData.fusion_creator.recipe,appearance:{...root.userData.fusion_creator.recipe.appearance,customColor:'invalid'}},definition),/material override/);
});

test('both detailed creator bases draft curved six-panel shirts from verified rig landmarks, independent of hands and posing',()=>{
 for(const sex of ['female','male']){const root=createDetailedCharacter(definition,{sex}),joints=shirtJointsForCharacter(root),mesh=neutralCharacterMesh(root,{jointNames:joints}),report=measureNeutralMesh(mesh),capture=sourcePlacementBody(root);assert.equal(joints.neck,'neck_01');assert.equal(report.valid,true,report.warnings.join(' '));assert.ok(Math.abs(capture.dimensions.origin[2]-mesh.measurementAxis[1])<1e-6);const draft=draftSurfaceShirt(mesh,mesh.anchors,{neckline:'rounded'});assert.equal(draft.doc.panels.length,6);assert.ok(draft.positions.length>1000);assert.ok(draft.doc.panels.filter(p=>['front','back'].includes(p.id)).every(p=>p.segments.some(s=>s.type==='cubic')));root.getObjectByName('upperarm_l').rotateZ(.3);const posed=neutralCharacterMesh(root,{jointNames:joints});assert.deepEqual(posed.positions,mesh.positions);assert.deepEqual(posed.anchors,mesh.anchors);assert.equal(sourcePlacementBody(root).source.triangles.length,26756);}
 assert.equal(shirtJointsForCharacter({userData:{}}).neck,'neck1');
});

test('dense derived hair stays out of project snapshots and regenerates with stable identities and exact strand buffers',{timeout:30000},async()=>{
 const serialize=root=>JSON.parse(JSON.stringify(Editor.prototype.serialize.call({root}))),root=createDetailedCharacter(definition,{sex:'male'}),recipe=structuredClone(root.userData.fusion_creator.recipe);recipe.hair.style='short';recipe.visibility.clothing='underwear';changeCreator(root,recipe);const hair=root.getObjectByName('Hairstyle · short'),before=hair.geometry.attributes.position.array.slice(),document=serialize(root),json=document.geometries.find(g=>g.uuid===hair.geometry.uuid);assert.equal(json.data.attributes.position.array.length,0);assert.ok(hair.geometry.attributes.position.count>300000);assert.ok(JSON.stringify(document).length<18000000);const copy=await new ProjectLoader().parseAsync(document),after=copy.getObjectByName('Hairstyle · short');assert.equal(after.uuid,hair.uuid);assert.equal(after.geometry.uuid,hair.geometry.uuid);assert.equal(after.material.uuid,hair.material.uuid);const values=after.geometry.attributes.position.array;assert.equal(values.length,before.length);assert.ok(values.every((v,i)=>v===before[i]),'Regenerated strand positions changed');
 const differences=[],walk=(a,b,p)=>{if(a===b||differences.length>=8)return;if(a&&b&&typeof a==='object'&&typeof b==='object'){for(const key of new Set([...Object.keys(a),...Object.keys(b)]))walk(a[key],b[key],p+'/'+key);}else differences.push({path:p,before:a,after:b});};walk(document,serialize(copy),'');assert.deepEqual(differences,[]);
});

test('authored creator skin weights stay embedded and survive shape/height refitting and project reopening',async()=>{
 const root=createDetailedCharacter(definition),model=await createSkinWeightModel(root),row=[...model.rows.values()][0],joint=root.getObjectByName('neck_01');await applySkinPatch(root,weightPatch(model,[{key:row.key,boneId:joint.uuid,value:.8}]),{acceptPruning:true});const body=root.getObjectByName('Body'),weights=Array.from(body.geometry.attributes.skinWeight.array),indices=Array.from(body.geometry.attributes.skinIndex.array),recipe=structuredClone(root.userData.fusion_creator.recipe);recipe.controls.height=1.85;changeCreator(root,recipe);assert.deepEqual(Array.from(body.geometry.attributes.skinWeight.array),weights);const document=JSON.parse(JSON.stringify(Editor.prototype.serialize.call({root})));assert.ok(document.geometries.find(g=>g.uuid===body.geometry.uuid).data.attributes.skinWeight);const copy=await new ProjectLoader().parseAsync(document),after=copy.getObjectByName('Body');assert.deepEqual(Array.from(after.geometry.attributes.skinWeight.array),weights);assert.deepEqual(Array.from(after.geometry.attributes.skinIndex.array),indices);assert.equal(copy.userData.fusion_skin_edit.edited,true);
});
