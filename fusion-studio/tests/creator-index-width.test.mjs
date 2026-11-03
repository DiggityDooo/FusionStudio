import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import * as THREE from 'three';
import {Editor} from '../src/editor.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import validator from 'gltf-validator';
import {createDetailedCharacter,creatorPositions,changeCreator} from '../src/character-creator.js';

const foundation=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../public/characters/makehuman-v1.json.gz',import.meta.url))));
// Test-only index relocation retains the detailed authored surface, targets,
// skin and landmarks. Leading unused vertices exercise the declared index limit;
// this is not a new supported topology family or added anatomical detail.
function relocatedDefinition(){
 const d=structuredClone(foundation),s=d.source,offset=65536,count=s.positions.length/3;
 d.identity=crypto.createHash('sha256').update('test-only-index-relocation:'+d.identity).digest('hex');
 s.positions=[...Array(offset*3).fill(0),...s.positions];s.skinIndex=[...Array(offset*4).fill(0),...s.skinIndex];
 s.skinWeight=[...Array.from({length:offset*4},(_,i)=>i%4===0?1:0),...s.skinWeight];
 s.mirror=[...Array.from({length:offset},(_,i)=>i),...s.mirror.map(id=>id+offset)];
 s.triangles=s.triangles.map(id=>id+offset);s.cornerSource=s.cornerSource.map(id=>id+offset);
 for(const b of s.bones)b.landmarks=b.landmarks.map(id=>id+offset);
 for(const key of Object.keys(s.landmarks))s.landmarks[key]=s.landmarks[key].map(id=>id+offset);
 for(const rows of Object.values(s.targets))for(let i=0;i<rows.length;i+=4)rows[i]+=offset;
 for(const guides of Object.values(s.hair.styles))for(const guide of guides)guide.triangle=guide.triangle.map(id=>id+offset);
 assert.equal(s.positions.length/3,count+offset);return d;
}

test('detailed creator keeps source IDs above 65535 through body updates and sparse shapes',()=>{
 const d=relocatedDefinition(),before=JSON.stringify(d.source),root=createDetailedCharacter(d),body=root.getObjectByName('Body'),map=body.geometry.attributes._fusion_source_vertex;
 assert.equal(body.geometry.index.count/3,26756);assert.ok(map.array instanceof Float32Array,'A valid high source ID must use an exact wider mapping compatible with glTF vertex attributes');
 const expected=creatorPositions(root),p=body.geometry.attributes.position;
 for(let i=0;i<map.count;i++){assert.ok(map.getX(i)>=65536);for(let k=0;k<3;k++)assert.equal(p.getComponent(i,k),expected[map.getX(i)*3+k]);}
 const recipe=structuredClone(root.userData.fusion_creator.recipe),id=map.getX(100);recipe.controls.height=1.83;recipe.shapes=[{id:'high-index-shape',name:'High-index shape',min:0,max:1,value:.5,deltas:[id,.004,0,0]}];changeCreator(root,recipe);
 assert.equal(body.geometry.attributes._fusion_source_vertex.getX(100),id);assert.ok(body.geometry.morphAttributes.position[0].array.some(v=>v!==0));assert.equal(JSON.stringify(d.source),before,'Immutable source remains exact');
});

test('existing public foundation retains its compact source mapping',()=>{
 const root=createDetailedCharacter(foundation);assert.ok(root.getObjectByName('Body').geometry.attributes._fusion_source_vertex.array instanceof Uint16Array);
});

test('high source vertex IDs survive standards-validated GLB export and reload',async()=>{
 const oldReader=globalThis.FileReader;globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();});}};
 try{
 const character=createDetailedCharacter(relocatedDefinition()),body=character.getObjectByName('Body'),root=new THREE.Group();root.add(character);
 character.getObjectByName('Creator attachments').visible=false; // Canvas eye textures have separate desktop acceptance.
 const editor=Object.assign(Object.create(Editor.prototype),{root,timeline:{exportClips:()=>[]}}),before=Array.from(body.geometry.attributes._fusion_source_vertex.array);
 const bytes=Uint8Array.from(Buffer.from(await editor.glb(false),'base64')),report=await validator.validateBytes(bytes);assert.equal(report.issues.numErrors,0,JSON.stringify(report.issues));
 const loaded=await new GLTFLoader().parseAsync(bytes.buffer,''),copy=loaded.scene.getObjectByName('Body');assert.ok(copy?.isSkinnedMesh);assert.deepEqual(Array.from(copy.geometry.attributes._fusion_source_vertex.array),before);assert.deepEqual(Array.from(body.geometry.attributes._fusion_source_vertex.array),before);
 }finally{globalThis.FileReader=oldReader;}
});
