import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Editor} from '../src/editor.js';
import {Timeline} from '../src/timeline.js';
import {MeshTools,sculptGeometry} from '../src/mesh-tools.js';
import {stampAlpha} from '../src/sculpt-advanced.js';
import {createSculptLayers,editSculptLayer,setSculptLayerStrength,validateSculptLayers,withSculptLayerEdit,beginSculptLayerPreview,captureSculptLayerEdit,sculptBufferCopy} from '../src/sculpt-layers.js';
import {OperatorRegistry} from '../src/operators.js';
import {ComponentEditor} from '../src/component-edit.js';
import {checkCompatibility,inspectObject} from '../src/compatibility.js';
import {registerSculptLayerOperators} from '../src/sculpt-layers-ui.js';
import {registerDeformers} from '../src/deformers-ui.js';

const pos=m=>new Float32Array(m.geometry.attributes.position.array),close=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);
const equalPositions=(a,b)=>{assert.equal(a.length,b.length);assert.ok(a.every((v,i)=>v===b[i]),'positions retain their numeric values, including JSON-normalized signed zero');};
function fixture({detail=false}={}){
 const e=Object.create(Editor.prototype),canvas={addEventListener(){},setPointerCapture(){},ownerDocument:{addEventListener(){}}};
 Object.assign(e,{root:new THREE.Group(),scene:new THREE.Scene(),history:[],historyAt:-1,change(){},select(o){this.selected=o;},wire(){},renderer:{domElement:canvas},orbit:{enabled:true},transform:{detach(){},attach(){}}});e.scene.add(e.root);e.timeline=new Timeline(e);e.meshTools=new MeshTools(e);
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1,detail?256:48,detail?200:48),new THREE.MeshStandardMaterial());e.root.add(mesh);e.selected=mesh;return {e,mesh};
}
function addOffset(mesh,xyz,where=()=>true){return withSculptLayerEdit(mesh,()=>{const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++)if(where(p.getX(i),p.getY(i),i))p.setXYZ(i,p.getX(i)+xyz[0],p.getY(i)+xyz[1],p.getZ(i)+xyz[2]);});}

test('layers retain an immutable base, sparse edits and stable IDs; creation is idempotent',()=>{
 const {mesh}=fixture(),source=mesh.geometry,base=pos(mesh),doc=createSculptLayers(mesh),id=doc.active;assert.equal(createSculptLayers(mesh),doc);
 addOffset(mesh,[0,0,.04],(x,y)=>x*x+y*y<.04);const edited=mesh.userData.fusion_sculpt_layers;
 assert.deepEqual(edited.base,Array.from(base));assert.deepEqual(source.attributes.position.array,base);assert.equal(edited.active,id);assert.ok(edited.layers[0].deltas.indices.length>10);assert.deepEqual(doc.layers[0].deltas.indices,[]);
 for(let i=0;i<base.length/3;i++)close(mesh.geometry.attributes.position.getZ(i),(base[i*3]**2+base[i*3+1]**2<.04)?.04:0);
 assert.equal(validateSculptLayers(mesh),edited);
});

test('two signed layers mix against independent reference offsets without baking preceding results',()=>{
 const {mesh}=fixture();createSculptLayers(mesh,{names:['Swell']});const first=mesh.userData.fusion_sculpt_layers.active;
 addOffset(mesh,[0,0,.1]);editSculptLayer(mesh,'add',{name:'Move'});const second=mesh.userData.fusion_sculpt_layers.active;addOffset(mesh,[.05,0,0]);
 for(let pass=0;pass<5;pass++){setSculptLayerStrength(mesh,first,.25);setSculptLayerStrength(mesh,second,-.5);const p=mesh.geometry.attributes.position,doc=mesh.userData.fusion_sculpt_layers;for(let i=0;i<p.count;i++){close(p.getX(i),Math.fround(doc.base[i*3]-.025));close(p.getZ(i),.025);}}
 setSculptLayerStrength(mesh,second,0);for(let i=0;i<mesh.geometry.attributes.position.count;i++)close(mesh.geometry.attributes.position.getX(i),mesh.userData.fusion_sculpt_layers.base[i*3]);
 setSculptLayerStrength(mesh,second,-.5);addOffset(mesh,[0,.02,0]);setSculptLayerStrength(mesh,second,1);close(mesh.geometry.attributes.position.getY(0),mesh.userData.fusion_sculpt_layers.base[1]-.04);
});

test('visibility, rename, duplication, order and deletion retain their layer data and source geometry',()=>{
 const {mesh}=fixture();createSculptLayers(mesh,{names:['Detail']});addOffset(mesh,[0,0,.03]);const first=mesh.userData.fusion_sculpt_layers.active;
 editSculptLayer(mesh,'rename',{id:first,name:'Pores'});editSculptLayer(mesh,'duplicate',{id:first});const second=mesh.userData.fusion_sculpt_layers.active;close(mesh.geometry.attributes.position.getZ(0),.06);
 const before=pos(mesh);editSculptLayer(mesh,'move',{id:second,index:0});assert.deepEqual(pos(mesh),before);assert.equal(mesh.userData.fusion_sculpt_layers.layers[0].id,second);
 editSculptLayer(mesh,'visible',{id:first,value:false});close(mesh.geometry.attributes.position.getZ(0),.03);editSculptLayer(mesh,'delete',{id:second});close(mesh.geometry.attributes.position.getZ(0),0);assert.equal(mesh.userData.fusion_sculpt_layers.active,first);assert.equal(mesh.userData.fusion_sculpt_layers.layers[0].name,'Pores');
 assert.throws(()=>editSculptLayer(mesh,'delete',{id:first}),/at least one/);
});

test('hidden, locked and zero-strength layers reject authoring before geometry changes',()=>{
 for(const [action,value]of [['visible',false],['locked',true],['strength',0]]){
  const {mesh}=fixture();createSculptLayers(mesh);editSculptLayer(mesh,action,{value});const geometry=mesh.geometry,doc=mesh.userData.fusion_sculpt_layers;
  assert.throws(()=>addOffset(mesh,[0,0,.1]),/visible, unlocked/);assert.equal(mesh.geometry,geometry);assert.equal(mesh.userData.fusion_sculpt_layers,doc);
 }
});

test('topology changes, invalid values and divergent external edits cannot overwrite layer state',()=>{
 const {mesh}=fixture();createSculptLayers(mesh);const geometry=mesh.geometry,doc=mesh.userData.fusion_sculpt_layers;
 assert.throws(()=>withSculptLayerEdit(mesh,()=>mesh.geometry.index.setX(0,mesh.geometry.index.getX(1))),/topology/);assert.equal(mesh.geometry,geometry);assert.equal(mesh.userData.fusion_sculpt_layers,doc);
 for(const value of [NaN,Infinity,2])assert.throws(()=>setSculptLayerStrength(mesh,doc.active,value),/strength/);
 mesh.geometry.attributes.position.setZ(0,.02);const changed=pos(mesh);assert.throws(()=>setSculptLayerStrength(mesh,doc.active,.5),/diverged/);assert.deepEqual(pos(mesh),changed);assert.equal(mesh.userData.fusion_sculpt_layers,doc);
});

test('legacy records migrate deterministically without changing the current surface; loading stays read-only',async()=>{
 const {e,mesh}=fixture();mesh.userData.fusion_sculpt_layers={active:'old',layers:[{id:'old',name:'Legacy',strength:.4,visible:true,deltas:null}]};const legacy=mesh.userData.fusion_sculpt_layers,base=pos(mesh),saved=JSON.parse(JSON.stringify(e.serialize())),{e:other}=fixture();await other.restore(saved);
 assert.deepEqual(other.root.children[0].userData.fusion_sculpt_layers,legacy);const migrated=createSculptLayers(mesh);assert.equal(migrated.version,2);assert.equal(migrated.active,'old');assert.equal(migrated.layers[0].strength,.4);assert.deepEqual(pos(mesh),base);assert.equal(legacy.layers[0].deltas,null);
 const bad=structuredClone(legacy);bad.layers[0].deltas=[1,2,3];mesh.userData.fusion_sculpt_layers=bad;assert.throws(()=>createSculptLayers(mesh),/unknown deltas/);assert.equal(mesh.userData.fusion_sculpt_layers,bad);
});

test('inert legacy layer metadata on a rigged source remains readable without enabling unsafe edits',()=>{
 const mesh=new THREE.SkinnedMesh(new THREE.PlaneGeometry(),new THREE.MeshStandardMaterial());mesh.userData.fusion_sculpt_layers={active:'legacy',layers:[{id:'legacy',name:'Old placeholder',strength:1,visible:true,deltas:null}]};
 const doc=mesh.userData.fusion_sculpt_layers;assert.equal(validateSculptLayers(mesh),doc);assert.throws(()=>createSculptLayers(mesh),/static working copy/);assert.equal(mesh.userData.fusion_sculpt_layers,doc);
});

test('brush gestures record one undo entry; cancellation restores all attributes and source identity',async()=>{
 const {e,mesh}=fixture();createSculptLayers(mesh);e.commit();const t=e.meshTools;t.mode='sculpt';t.brush={...t.brush,type:'draw',radius:.3,strength:.02};const cursor=e.journal.cursor,original=mesh.geometry,doc=mesh.userData.fusion_sculpt_layers;
 t.stroke=true;t.beginStrokeSnapshot(mesh);for(const x of [-.1,0,.1])t.applyBrush({object:mesh,point:new THREE.Vector3(x,0,0),face:{normal:new THREE.Vector3(0,0,1)}},false);t.finishStroke();
 assert.equal(e.journal.cursor,cursor+1);assert.ok(mesh.userData.fusion_sculpt_layers.layers[0].deltas.indices.length>50);assert.deepEqual(original.attributes.position.array,new Float32Array(doc.base));const after=pos(mesh);
 await e.undo();const restored=e.root.children[0];equalPositions(restored.geometry.attributes.position.array,new Float32Array(doc.base));await e.redo();equalPositions(e.root.children[0].geometry.attributes.position.array,after);
 const current=e.root.children[0],geometry=current.geometry,metadata=current.userData.fusion_sculpt_layers,before=e.journal.cursor;t.mode='sculpt';t.stroke=true;t.beginStrokeSnapshot(current);t.applyBrush({object:current,point:new THREE.Vector3(),face:{normal:new THREE.Vector3(0,0,1)}},false);t.cancelStroke();assert.equal(current.geometry,geometry);assert.equal(current.userData.fusion_sculpt_layers,metadata);assert.equal(e.journal.cursor,before);
});

test('UV stamps record on the selected layer and remain reversible by strength',()=>{
 const {mesh}=fixture();createSculptLayers(mesh);const source=mesh.geometry,base=pos(mesh),doc=mesh.userData.fusion_sculpt_layers;
 const result=stampAlpha(mesh,[.5,.5],{radius:.2});assert.ok(result.vertices>50);const after=pos(mesh);setSculptLayerStrength(mesh,doc.active,0);assert.deepEqual(pos(mesh),base);setSculptLayerStrength(mesh,doc.active,1);assert.deepEqual(pos(mesh),after);assert.deepEqual(source.attributes.position.array,base);
});

test('coalesced strength previews commit once, cancel exactly, block other operations and recover commit failures',async()=>{
 const {e,mesh}=fixture();createSculptLayers(mesh);addOffset(mesh,[0,0,.1]);e.commit();let cursor=e.journal.cursor;const id=mesh.userData.fusion_sculpt_layers.active;
 const first=beginSculptLayerPreview(e,mesh,id);for(let i=1;i<=10;i++)first.set(i*.05);assert.equal(e.journal.cursor,cursor);close(mesh.geometry.attributes.position.getZ(0),.05);assert.throws(()=>e.document('mid-gesture'),/sculpt gesture/);
 const ops=new OperatorRegistry(e);ops.register({id:'other',execute(){throw Error('Must not run.');}});await assert.rejects(ops.run('other'),/active sculpt gesture/);
 first.accept();assert.equal(e.journal.cursor,cursor+1);assert.equal(e.sculptLayerPreview,null);
 const geometry=mesh.geometry,doc=mesh.userData.fusion_sculpt_layers,before=pos(mesh),preview=beginSculptLayerPreview(e,mesh,id);preview.set(-.3);preview.cancel();assert.equal(mesh.geometry,geometry);assert.equal(mesh.userData.fusion_sculpt_layers,doc);assert.deepEqual(pos(mesh),before);assert.equal(e.journal.cursor,cursor+1);
 const broken=beginSculptLayerPreview(e,mesh,id);broken.set(.1);const commit=e.commit;e.commit=()=>{throw Error('capture failed');};assert.throws(()=>broken.accept(),/capture failed/);e.commit=commit;assert.equal(mesh.geometry,geometry);assert.equal(mesh.userData.fusion_sculpt_layers,doc);assert.equal(e.sculptLayerPreview,null);
});

test('stale previews never replace a newly opened project',()=>{
 const {e,mesh}=fixture();createSculptLayers(mesh);e.commit();const preview=beginSculptLayerPreview(e,mesh,mesh.userData.fusion_sculpt_layers.active),newRoot=new THREE.Group();e.root=newRoot;
 assert.throws(()=>preview.set(.5),/stale/);preview.cancel();assert.equal(e.root,newRoot);assert.equal(e.sculptLayerPreview,null);assert.equal(newRoot.children.length,0);
});

test('layered projects survive history/reopen; malformed deltas reject before replacing the live scene',async()=>{
 const {e,mesh}=fixture();createSculptLayers(mesh);addOffset(mesh,[0,0,.02]);e.commit();const saved=JSON.parse(JSON.stringify(e.serialize())),{e:other}=fixture();await other.restore(saved);equalPositions(pos(other.root.children[0]),pos(mesh));assert.deepEqual(other.root.children[0].userData.fusion_sculpt_layers,JSON.parse(JSON.stringify(mesh.userData.fusion_sculpt_layers)));
 const bad=structuredClone(saved);bad.object.children[0].userData.fusion_sculpt_layers.layers[0].deltas.indices[0]=999999;const root=other.root;await assert.rejects(other.restore(bad),/delta indices/);assert.equal(other.root,root);
});

test('topology tools refuse layered meshes before requests; exchange warns that recipes stay in Fusion',async()=>{
 const {e,mesh}=fixture();createSculptLayers(mesh);const component=Object.create(ComponentEditor.prototype);Object.assign(component,{mesh,ids:new Set([0]),editor:e});await assert.rejects(component.apply('delete'),/static working copy/);
 e.meshTools.activeMesh=mesh;e.meshTools.faceIndex=0;assert.throws(()=>e.meshTools._extrude(.1),/static working copy/);e.meshTools.brush.dyntopo.enabled=true;assert.throws(()=>e.meshTools.beginStrokeSnapshot(mesh),/static working copy/);
 assert.ok(checkCompatibility('glb',inspectObject(mesh)).issues.some(i=>i.title.includes('sculpt layers')));assert.ok(checkCompatibility('remesh',inspectObject(mesh)).issues.some(i=>i.title.includes('baked working copy')));
});

test('interleaved attributes are copied without changing their UV values or normalized storage',()=>{
 const g=new THREE.BufferGeometry(),data=new THREE.InterleavedBuffer(new Float32Array([0,0,0,.1,.2,1,0,0,.3,.4,0,1,0,.5,.6]),5);g.setAttribute('position',new THREE.InterleavedBufferAttribute(data,3,0));g.setAttribute('uv',new THREE.InterleavedBufferAttribute(data,2,3));g.setIndex([0,1,2]);const colorData=new THREE.InterleavedBuffer(new Uint8Array([255,128,0,1,0,64,255,2,128,128,128,3]),4);g.setAttribute('color',new THREE.InterleavedBufferAttribute(colorData,3,0,true));
 const copy=sculptBufferCopy(g);assert.deepEqual(copy.attributes.uv.array,new Float32Array([.1,.2,.3,.4,.5,.6]));assert.deepEqual(copy.attributes.color.array,new Uint8Array([255,128,0,0,64,255,128,128,128]));assert.equal(copy.attributes.color.normalized,true);
 const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial());createSculptLayers(mesh);addOffset(mesh,[0,0,.1]);for(let i=0;i<3;i++)close(mesh.geometry.attributes.position.getZ(i),.1);
});

test('mesh filters and registered deformers record reversible layer edits in one transaction',async()=>{
 const {e,mesh}=fixture();createSculptLayers(mesh);addOffset(mesh,[0,0,.2],(x,y,i)=>i===1200);e.commit();e.operators=new OperatorRegistry(e);registerSculptLayerOperators(e.operators,e);registerDeformers(e.operators,e);
 const active=mesh.userData.fusion_sculpt_layers.active,before=e.journal.cursor;await e.operators.run('sculpt.filter',{meshId:mesh.uuid,kind:'smooth',amount:.5});assert.equal(e.journal.cursor,before+1);assert.ok(mesh.geometry.attributes.position.getZ(1200)<.2);validateSculptLayers(mesh);
 const target=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial());target.position.z=.3;e.root.add(target);e.commit();await e.operators.run('mesh.shrinkwrap',{targetId:target.uuid});for(let i=0;i<mesh.geometry.attributes.position.count;i++)close(mesh.geometry.attributes.position.getZ(i),.3);validateSculptLayers(mesh);
 setSculptLayerStrength(mesh,active,0);for(let i=0;i<mesh.geometry.attributes.position.count;i++)close(mesh.geometry.attributes.position.getZ(i),0);
});

test('detailed layer authoring and previews record actual CPU timings without claiming GPU sculpting',t=>{
 const {e,mesh}=fixture({detail:true}),start=performance.now();createSculptLayers(mesh);stampAlpha(mesh,[.5,.5],{radius:.2});e.commit();const authored=performance.now(),preview=beginSculptLayerPreview(e,mesh,mesh.userData.fusion_sculpt_layers.active),timings=[];
 for(const value of [.2,.4,.6,.8,.5]){const before=performance.now();preview.set(value);timings.push(performance.now()-before);}preview.cancel();assert.equal(mesh.geometry.index.count/3,102400);assert.ok(mesh.userData.fusion_sculpt_layers.layers[0].deltas.indices.length>1000);t.diagnostic(`102,400 triangles: enable/author/history ${(authored-start).toFixed(1)} ms; five full strength previews ${timings.map(v=>v.toFixed(1)).join(', ')} ms.`);
});

test('real Genesis static working copy accepts layer edits while original source and rig remain intact',async t=>{
 const imported=JSON.parse(fs.readFileSync('test-output/dson-integration-results.json')),bytes=fs.readFileSync(imported.output),hash=crypto.createHash('sha256').update(bytes).digest('hex'),{scene:source}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const {e,mesh:placeholder}=fixture();e.root.remove(placeholder);e.root.add(source);e.selected=source;e.commit=()=>{};
 const copy=e.staticDuplicate(),meshes=copy.children.filter(n=>n.isMesh),mesh=meshes.sort((a,b)=>b.geometry.attributes.position.count-a.geometry.attributes.position.count)[0],base=pos(mesh),triangles=meshes.reduce((sum,m)=>sum+m.geometry.index.count/3,0);assert.equal(triangles,50312);assert.equal(base.length/3,8350);assert.equal(mesh.geometry.index.count/3,15416);createSculptLayers(mesh);const count=sculptGeometry(mesh,new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,1000).applyMatrix4(mesh.matrixWorld),.15,.008,'inflate');assert.ok(count>0);setSculptLayerStrength(mesh,mesh.userData.fusion_sculpt_layers.active,0);equalPositions(pos(mesh),base);assert.ok(source.children.length>0);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(imported.output)).digest('hex'),hash);t.diagnostic(`Genesis ${triangles}-triangle working copy; layer cage ${base.length/3} vertices / ${mesh.geometry.index.count/3} triangles; ${count} vertices in the recorded brush region.`);
});
