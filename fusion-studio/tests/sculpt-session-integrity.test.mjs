import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
import * as THREE from 'three';
import {Editor} from '../src/editor.js';
import {Timeline} from '../src/timeline.js';
import {MeshTools} from '../src/mesh-tools.js';
import {ComponentEditor} from '../src/component-edit.js';
import {SceneEvaluator} from '../src/evaluation.js';
import {OperatorRegistry} from '../src/operators.js';
import {registerSculptMask} from '../src/sculpt-mask.js';
import {shapeEditingSession,discardShapeSession} from '../src/shape-session.js';
import {createDetailedCharacter,creatorShape,changeCreator,makeShapeEditingCopy,finishShapeEditingCopy} from '../src/character-creator.js';
import {createSculptLayers,validateSculptLayers} from '../src/sculpt-layers.js';

const native=createRequire(import.meta.url)('../native/fusion_geometry.node');
const definition=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../public/characters/makehuman-v1.json.gz',import.meta.url))));
const positions=mesh=>Array.from(mesh.geometry.attributes.position.array);
// JSON history represents signed zero as 0. Compare exact numeric values after
// history/reload; all nonzero Float32 values must remain exactly equal.
const savedPositions=mesh=>positions(mesh).map(v=>v===0?0:v);
function fixture(){
  const e=Object.create(Editor.prototype),listeners=new Map(),events=[];
  const canvas={addEventListener(name,fn){listeners.set(name,fn);},setPointerCapture(){},ownerDocument:{addEventListener(){}}};
  Object.assign(e,{root:new THREE.Group(),scene:new THREE.Scene(),history:[],historyAt:-1,bookmarks:[],camera:new THREE.PerspectiveCamera(),change(kind){events.push(kind);},select(o){this.selected=o;},wire(){},renderer:{domElement:canvas},orbit:{enabled:true,target:new THREE.Vector3()},transform:{attach(){},detach(){}}});
  e.scene.add(e.root);e.timeline=new Timeline(e);e.evaluation=new SceneEvaluator(e);e.meshTools=new MeshTools(e);e.operators=new OperatorRegistry(e);registerSculptMask(e.operators,e);
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1,160,96),new THREE.MeshStandardMaterial());e.root.add(mesh);e.select(mesh);e.commit();
  const hit={object:mesh,point:new THREE.Vector3(0,0,0),face:{normal:new THREE.Vector3(0,0,1)}};e.meshTools.hit=()=>({...hit,object:e.selected});e.meshTools.mode='sculpt';
  const down=()=>listeners.get('pointerdown')({button:0,pointerId:1,detail:0,stopImmediatePropagation(){}}),up=()=>listeners.get('pointerup')({button:0,stopImmediatePropagation(){}}),finishPolygon=()=>listeners.get('dblclick')({stopImmediatePropagation(){}});
  const move=point=>{hit.point.copy(point);listeners.get('pointermove')({button:0,pointerId:1,stopImmediatePropagation(){}});};
  return {e,mesh,events,down,up,move,finishPolygon};
}
function shapeFixture(){
  const f=fixture(),{e}=f;e.root.clear();const owner=createDetailedCharacter(definition);e.root.add(owner);
  const recipe=creatorShape(owner,{action:'create',name:'Sculpt test'});recipe.controls.height=1.83;changeCreator(owner,recipe);owner.getObjectByName('head').rotation.y=.27;e.select(owner);e.commit();
  const copy=makeShapeEditingCopy(owner,recipe.shapes[0].id),session={project:e.root,owner,copy,visible:owner.visible};e.creatorShapeSession=session;e.scene.add(copy);owner.visible=false;e.batching=true;e.select(copy);
  e.meshTools.hit=()=>({object:copy,point:new THREE.Vector3().fromBufferAttribute(copy.geometry.attributes.position,definition.source.triangles[100]),face:{normal:new THREE.Vector3(0,0,1)}});return {...f,owner,copy,session};
}
function component(e,copy,api={geometry:async(_,q)=>JSON.parse(native.editMesh(JSON.stringify(q)))}){
  const c=Object.create(ComponentEditor.prototype);Object.assign(c,{editor:e,mesh:copy,kind:'vertex',ids:new Set([definition.source.triangles[100]]),api,update(){}});return c;
}

test('real pointer guards allow only the active neutral copy during a shape transaction',()=>{
  const {e,owner,copy,session,down,up}=shapeFixture(),base=positions(copy),cursor=e.journal.cursor,source=JSON.stringify(definition.source.positions);
  down();assert.equal(e.meshTools.stroke,true);assert.notDeepEqual(positions(copy),base);up();assert.equal(e.meshTools.stroke,false);assert.equal(e.journal.cursor,cursor);
  const recipe=finishShapeEditingCopy(owner,copy);assert.ok(recipe.shapes[0].deltas.length>0);assert.equal(owner.getObjectByName('head').rotation.y,.27);assert.equal(JSON.stringify(definition.source.positions),source);
  const geometry=copy.geometry;e.creatorShapeSession=null;down();assert.equal(e.meshTools.stroke,false);assert.equal(copy.geometry,geometry);e.creatorShapeSession=session;
  e.selected=owner;down();assert.equal(e.meshTools.stroke,false);e.selected=copy;session.project=new THREE.Group();down();assert.equal(e.meshTools.stroke,false);
});

test('shape brush cancellation and topology rejection retain the exact staged geometry',()=>{
  const {e,copy,down}=shapeFixture(),before=copy.geometry,base=positions(copy),cursor=e.journal.cursor;
  down();e.meshTools.cancelStroke();assert.equal(copy.geometry,before);assert.deepEqual(positions(copy),base);assert.equal(e.journal.cursor,cursor);
  e.meshTools.brush.dyntopo.enabled=true;down();assert.equal(e.meshTools.stroke,false);assert.equal(copy.geometry,before);assert.equal(e.meshTools.strokeSnapshot,null);
});

test('native component moves work on neutral shapes without adding partial scene history',async()=>{
  const {e,copy,owner}=shapeFixture(),c=component(e,copy),id=[...c.ids][0],before=positions(copy),index=Array.from(copy.geometry.index.array),cursor=e.journal.cursor;
  await c.apply('transform',{matrix:new THREE.Matrix4().makeTranslation(.01,0,0).toArray()});
  assert.equal(e.journal.cursor,cursor);assert.deepEqual(Array.from(copy.geometry.index.array),index);const after=positions(copy);
  for(let i=0;i<before.length;i++)assert.ok(Math.abs(after[i]-before[i]-(i===id*3?.01:0))<1e-7);
  const recipe=finishShapeEditingCopy(owner,copy);assert.deepEqual(recipe.shapes[0].deltas.slice(0,1),[id]);assert.equal(recipe.shapes[0].deltas.length,4);
  await assert.rejects(c.apply('delete'),/Select mesh components/);
});

test('late, cancelled and malformed component results cannot alter a neutral editing copy',async()=>{
  for(const mode of ['stale','cancel','topology','worker','positions','mapping','identity']){
    const {e,copy}=shapeFixture(),geometry=copy.geometry,cursor=e.journal.cursor;
    const controller=new AbortController();e.operators.running={controller};
    const c=component(e,copy,{geometry:async(_,q)=>{
      if(mode==='worker')throw Error('worker disconnected');
      const result=JSON.parse(native.editMesh(JSON.stringify(q)));
      if(mode==='stale')discardShapeSession(e);if(mode==='cancel')controller.abort();if(mode==='topology')result.faces[0].reverse();if(mode==='positions')result.positions[0][0]=NaN;if(mode==='mapping')result.vertexSources[0]=[[9999999,1]];if(mode==='identity')result.vertexSources[0]=[[1,1]];return result;
    }});
    await assert.rejects(c.apply('transform',{matrix:new THREE.Matrix4().makeTranslation(.01,0,0).toArray()}),/changed|cancelled|topology|worker disconnected|Malformed/);
    assert.equal(copy.geometry,geometry);assert.equal(e.journal.cursor,cursor);
  }
});

test('mask inversion and clearing are isolated undoable edits, persist and avoid no-op history',async()=>{
  const {e,mesh,events}=fixture(),geometry=mesh.geometry,uv=Array.from(geometry.attributes.uv.array),base=positions(mesh),cursor=e.journal.cursor;
  const sibling=new THREE.Mesh(geometry,mesh.material);e.root.add(sibling);e.commit();const start=e.journal.cursor;
  await e.operators.run('sculpt.mask',{action:'invert'});assert.equal(e.journal.cursor,start+1);assert.ok(mesh.geometry.attributes.mask.array.every(v=>v===1));assert.equal(sibling.geometry,geometry);assert.equal(geometry.attributes.mask,undefined);assert.deepEqual(positions(mesh),base);assert.deepEqual(Array.from(mesh.geometry.attributes.uv.array),uv);assert.equal(events.at(-1),'scene');
  await e._undo();let live=e.root.getObjectByProperty('uuid',mesh.uuid);assert.equal(live.geometry.attributes.mask,undefined);await e._redo();live=e.root.getObjectByProperty('uuid',mesh.uuid);e.select(live);assert.ok(live.geometry.attributes.mask.array.every(v=>v===1));
  const doc=e.document('Masked mesh');await e.load(JSON.parse(JSON.stringify(doc)));live=e.root.getObjectByProperty('uuid',mesh.uuid);e.select(live);assert.ok(live.geometry.attributes.mask.array.every(v=>v===1));
  await e.operators.run('sculpt.mask',{action:'clear'});const cleared=e.journal.cursor;assert.ok(live.geometry.attributes.mask.array.every(v=>v===0));await e.operators.run('sculpt.mask',{action:'clear'});assert.equal(e.journal.cursor,cleared);assert.ok(cursor>=0);
});

test('mask tools honor normalized attributes, reject malformed data and preserve sculpt layers',async()=>{
  const {e,mesh}=fixture(),count=mesh.geometry.attributes.position.count;mesh.geometry.setAttribute('mask',new THREE.Uint8BufferAttribute(new Uint8Array(count).fill(64),1,true));createSculptLayers(mesh);e.commit();const doc=mesh.userData.fusion_sculpt_layers;
  await e.operators.run('sculpt.mask',{action:'invert'});assert.ok(Math.abs(mesh.geometry.attributes.mask.getX(0)-(1-64/255))<1e-7);assert.equal(mesh.userData.fusion_sculpt_layers,doc);validateSculptLayers(mesh);
  for(const bad of ['mapping','nonfinite','project','target']){
    const geometry=mesh.geometry,cursor=e.journal.cursor;
    if(bad==='mapping')geometry.setAttribute('mask',new THREE.Float32BufferAttribute([0],1));
    if(bad==='nonfinite')geometry.setAttribute('mask',new THREE.Float32BufferAttribute(new Float32Array(count).fill(NaN),1));
    await assert.rejects(e.operators.run('sculpt.mask',{action:'invert',...(bad==='project'?{projectId:'other'}:{}),...(bad==='target'?{meshId:'missing'}:{})}),/mapping|invalid|project|Select/);
    assert.equal(mesh.geometry,geometry);assert.equal(e.journal.cursor,cursor);geometry.setAttribute('mask',new THREE.Float32BufferAttribute(new Float32Array(count),1));
  }
});

test('shape masks stay local and all sculpt commands respect active gestures',async()=>{
  const {e,owner,copy,down}=shapeFixture(),cursor=e.journal.cursor,source=owner.getObjectByName('Body').geometry;
  await e.operators.run('sculpt.mask',{action:'invert'});assert.ok(copy.geometry.attributes.mask.array.every(v=>v===1));assert.equal(source.attributes.mask,undefined);assert.equal(e.journal.cursor,cursor);assert.equal(shapeEditingSession(e),e.creatorShapeSession);
  down();await assert.rejects(e.operators.run('sculpt.mask',{action:'clear'}),/active sculpt gesture/);e.meshTools.cancelStroke();
  discardShapeSession(e);assert.equal(e.creatorShapeSession,null);assert.equal(e.batching,false);assert.equal(copy.parent,null);assert.equal(owner.visible,true);
  const {e:normal,mesh,down:downNormal}=fixture(),geometry=mesh.geometry;normal.batching=true;downNormal();assert.equal(normal.meshTools.stroke,false);assert.equal(mesh.geometry,geometry);
});

test('failed stroke commits and unsupported simplify restore the exact previous surface',()=>{
  const {e,mesh,down,up}=fixture(),geometry=mesh.geometry,base=positions(mesh),cursor=e.journal.cursor;
  down();e.commit=()=>{throw Error('history capture failed');};up();assert.equal(mesh.geometry,geometry);assert.deepEqual(positions(mesh),base);assert.equal(e.meshTools.stroke,false);assert.equal(e.journal.cursor,cursor);
  e.meshTools.brush.type='simplify';down();assert.equal(mesh.geometry,geometry);assert.equal(e.meshTools.stroke,false);assert.equal(e.meshTools.strokeSnapshot,null);
});

test('cancelled and failed annotation gestures restore notes, overlays and geometry',()=>{
  for(const existing of [false,true])for(const failure of ['cancel','commit']){
    const {e,mesh,down,up}=fixture(),geometry=mesh.geometry,cursor=e.journal.cursor;
    if(existing)mesh.userData.fusion_annotations=[{id:'retained',point:[.1,.2,0],text:'Keep this note'}];
    const before=structuredClone(mesh.userData),base=positions(mesh);e.meshTools.brush.type='annotate';down();
    assert.equal(mesh.userData.fusion_annotations.length,existing?2:1);
    if(failure==='cancel')e.meshTools.cancelStroke();else{e.commit=()=>{throw Error('history capture failed');};up();}
    assert.deepEqual(mesh.userData,before);assert.equal(mesh.geometry,geometry);assert.deepEqual(positions(mesh),base);assert.equal(e.journal.cursor,cursor);
    assert.equal(!!e.meshTools.annotationOverlay,existing);if(existing)assert.equal(e.meshTools.annotationOverlay.geometry.attributes.position.count,1);
  }
});

test('Thumb Clay builds and drags a detailed surface in one reversible persisted gesture',async()=>{
  const {e,mesh,down,up,move}=fixture(),base=positions(mesh),uv=Array.from(mesh.geometry.attributes.uv.array),index=Array.from(mesh.geometry.index.array),cursor=e.journal.cursor;
  e.meshTools.brush.type='thumb-clay';down();move(new THREE.Vector3(.04,0,0));up();
  const result=positions(mesh);assert.ok(result.some((v,i)=>i%3===2&&v>base[i]));assert.ok(result.some((v,i)=>i%3===0&&v>base[i]));assert.equal(e.journal.cursor,cursor+1);
  assert.deepEqual(Array.from(mesh.geometry.attributes.uv.array),uv);assert.deepEqual(Array.from(mesh.geometry.index.array),index);
  await e._undo();assert.deepEqual(savedPositions(e.selected),base.map(v=>v===0?0:v));await e._redo();assert.deepEqual(savedPositions(e.selected),result.map(v=>v===0?0:v));
  const doc=e.document('Thumb Clay');await e.load(JSON.parse(JSON.stringify(doc)));e.select(e.root.children[0]);assert.deepEqual(savedPositions(e.selected),result.map(v=>v===0?0:v));
});

test('surface annotation paths retain local corners, one history transaction and saved data',async()=>{
  for(const kind of ['annotate','annotate-line','annotate-polygon']){
    const {e,mesh,down,up,move,finishPolygon}=fixture(),geometry=mesh.geometry,base=positions(mesh),cursor=e.journal.cursor;
    mesh.position.set(2,3,4);mesh.rotation.y=.3;mesh.scale.set(2,1,1);mesh.updateMatrixWorld(true);
    e.meshTools.brush.type=kind;down();move(new THREE.Vector3(.04,.03,0));
    if(kind==='annotate-polygon'){up();assert.equal(e.journal.cursor,cursor);down();move(new THREE.Vector3(.08,-.03,0));down();finishPolygon();}else up();
    const notes=structuredClone(mesh.userData.fusion_annotations),note=notes[0];assert.equal(notes.length,1);assert.equal(note.kind,kind==='annotate'?'freehand':kind.slice(9));assert.equal(note.points.length,kind==='annotate-polygon'?3:2);
    const overlay=e.meshTools.annotationOverlay;assert.equal(overlay.children.length,1);assert.equal(overlay.children[0].type,kind==='annotate-polygon'?'LineLoop':'Line');assert.equal(overlay.children[0].geometry.attributes.position.count,note.points.length);assert.deepEqual(overlay.matrix.elements,mesh.matrixWorld.elements);
    assert.deepEqual(note.points.at(-1),mesh.worldToLocal(new THREE.Vector3(kind==='annotate-polygon'?.08:.04,kind==='annotate-polygon'?-.03:.03,0)).toArray());
    assert.equal(e.journal.cursor,cursor+1);assert.equal(mesh.geometry,geometry);assert.deepEqual(positions(mesh),base);assert.equal(e.meshTools.stroke,false);
    await e._undo();assert.equal(e.selected.userData.fusion_annotations,undefined);await e._redo();assert.deepEqual(e.selected.userData.fusion_annotations,notes);
    const doc=e.document('Surface notes');await e.load(JSON.parse(JSON.stringify(doc)));e.select(e.root.children[0]);assert.deepEqual(e.selected.userData.fusion_annotations,notes);assert.deepEqual(savedPositions(e.selected),base.map(v=>v===0?0:v));
  }
});

test('unfinished polygon annotation cancellation restores earlier notes and rejects too few corners',()=>{
  for(const end of ['cancel','early']){
    const {e,mesh,down,up,finishPolygon}=fixture(),cursor=e.journal.cursor;e.meshTools.brush.type='annotate-polygon';down();up();assert.equal(e.meshTools.stroke,true);
    if(end==='cancel')e.meshTools.cancelStroke();else finishPolygon();
    assert.equal(mesh.userData.fusion_annotations,undefined);assert.equal(e.meshTools.annotationOverlay,null);assert.equal(e.journal.cursor,cursor);assert.equal(e.meshTools.stroke,false);assert.equal(e.orbit.enabled,true);
  }
});

test('annotation strokes ignore topology toggles and never cross into another mesh',()=>{
 const {e,mesh,down,up,move}=fixture(),other=new THREE.Mesh(mesh.geometry,mesh.material),geometry=mesh.geometry;createSculptLayers(mesh);const layers=structuredClone(mesh.userData.fusion_sculpt_layers);e.meshTools.brush.type='annotate';e.meshTools.brush.dyntopo.enabled=true;
 down();assert.equal(e.meshTools.stroke,true);e.meshTools.hit=()=>({object:other,point:new THREE.Vector3(),face:{normal:new THREE.Vector3(0,0,1)}});move(new THREE.Vector3(.01,0,0));up();assert.equal(other.userData.fusion_annotations,undefined);assert.equal(other.geometry,geometry);assert.equal(mesh.geometry,geometry);assert.deepEqual(mesh.userData.fusion_sculpt_layers,layers);
});

test('post-capture stroke failure restores history and its existing redo branch',async()=>{
 for(const type of ['draw','annotate-line']){
  const {e,down,up}=fixture();down();up();await e._undo();const before=JSON.stringify(e.serialize()),cursor=e.journal.cursor,entries=e.journal.entries.slice(),baseline=e.journal.baseline;
  e.meshTools.mode='sculpt';e.meshTools.brush.type=type;const commit=e.commit;e.commit=function(){commit.call(this);throw Error('post-capture stroke failure');};down();up();
  assert.equal(JSON.stringify(e.serialize()),before);assert.equal(e.journal.cursor,cursor);assert.deepEqual(e.journal.entries,entries);assert.equal(e.journal.baseline,baseline);assert.equal(e.journal.canRedo,true);assert.equal(e.historyImages.pins.size,0);e.commit=commit;await e._redo();assert.equal(e.journal.cursor,cursor+1);
 }
});
