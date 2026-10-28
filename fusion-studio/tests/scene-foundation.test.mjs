import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {attachSceneFoundation} from '../src/scene-foundation.js';
import {ComponentEditor} from '../src/component-edit.js';

function components(kind='vertex'){
  const c=Object.create(ComponentEditor.prototype),geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,2,0,0,99,99,99,1,0,0,0,1,0,3,1,0],3));
  geometry.setIndex([0,3,4,3,1,4,1,5,4]);
  Object.assign(c,{mesh:new THREE.Mesh(geometry),kind,ids:new Set([0]),update(){this.refreshed=true;}});return c;
}

function mockEditor(){
  const root=new THREE.Group();root.name='Workspace';
  const snaps={t:null,r:null,s:null,space:'world'};
  const editor={
    root,selected:null,historyAt:0,journal:{cursor:0},
    transform:{
      setTranslationSnap:v=>{snaps.t=v;},
      setRotationSnap:v=>{snaps.r=v;},
      setScaleSnap:v=>{snaps.s=v;},
      setSpace:v=>{snaps.space=v;},
      _snaps:snaps,
    },
    mode(){},change(){},commit(){editor.committed=true;},
    select(o){editor.selected=o;},
  };
  return {editor,snaps,foundation:attachSceneFoundation(editor)};
}

test('snap modes drive TransformControls increments',()=>{
  const {foundation,snaps}=mockEditor();
  foundation.setSnap({enabled:true,mode:'grid',increment:.25,angleDeg:30});
  assert.equal(snaps.t,.25);
  assert.ok(Math.abs(snaps.r-Math.PI/6)<1e-9);
  foundation.setSnap({enabled:false});
  assert.equal(snaps.t,null);
});

test('gizmo spaces map to world/local',()=>{
  const {foundation,snaps}=mockEditor();
  foundation.setGizmoSpace('global');assert.equal(snaps.space,'world');
  foundation.setGizmoSpace('normal');assert.equal(snaps.space,'local');
  foundation.setGizmoMode('scale');assert.equal(foundation.state.gizmo.active,'scale');
});

test('parent group instance outliner',()=>{
  const {editor,foundation}=mockEditor();
  const a=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());a.name='A';
  const b=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());b.name='B';
  editor.root.add(a,b);
  foundation.parent(b,a);assert.equal(b.parent,a);
  const g=foundation.group([a]);assert.equal(g.children.includes(a),true);
  const inst=foundation.instanceOf(a);assert.equal(inst.userData.instanceOf,a.uuid);
  const tree=foundation.outlinerTree();assert.ok(tree.some(n=>n.name==='Group'));
});

test('collections visibility and isolation',()=>{
  const {editor,foundation}=mockEditor();
  const m=new THREE.Object3D();m.name='Mesh';editor.root.add(m);editor.selected=m;
  const col=foundation.createCollection('Chars');
  foundation.assignCollection(m,col.id);
  foundation.setCollectionVisible(col.id,false);assert.equal(m.visible,false);
  foundation.setCollectionVisible(col.id,true);
  foundation.isolateSelection();assert.ok(editor.localView.has(m.uuid));
  foundation.clearIsolation();assert.equal(editor.localView,null);
});

test('selection tools soft grow units multi-edit undo meta',()=>{
  const {editor,foundation}=mockEditor();
  assert.equal(foundation.setSelectionTool('lasso').tool,'lasso');
  const comps=components();
  foundation.growComponentSelection(comps,{by:1});assert.deepEqual([...comps.ids].sort((a,b)=>a-b),[0,3,4]);
  const soft=foundation.softSelectWeights(comps,{center:0,radius:2});assert.ok(soft.weights[0]>soft.weights[3]);
  foundation.setUnits({system:'imperial',unit:'in',scale:0.0254});
  assert.ok(Math.abs(foundation.toMeters(1)-0.0254)<1e-9);
  const a=new THREE.Object3D(),b=new THREE.Object3D();editor.root.add(a,b);
  foundation.setMultiEdit([a.uuid,b.uuid]);
  foundation.applyMultiTranslate([1,0,0]);
  assert.equal(a.position.x,1);assert.equal(b.position.x,1);
  assert.ok(foundation.undoMeta().nonDestructive);
});

test('parenting refuses hierarchy cycles and foreign objects before mutation',()=>{
  const {editor,foundation}=mockEditor(),a=new THREE.Group(),b=new THREE.Group();editor.root.add(a);a.add(b);
  assert.throws(()=>foundation.parent(a,b),/descendant/);assert.equal(a.parent,editor.root);assert.equal(b.parent,a);assert.equal(editor.committed,undefined);
  assert.throws(()=>foundation.parent(b,b),/itself/);
  assert.throws(()=>foundation.parent(b,new THREE.Group()),/not in this scene/);
  assert.throws(()=>foundation.group([a,editor.root]),/inside the scene/);
  assert.deepEqual(editor.root.children,[a]);
});

test('parent/unparent and deduplicated groups preserve affine world transforms',()=>{
  const {editor,foundation}=mockEditor(),a=new THREE.Group(),b=new THREE.Group(),child=new THREE.Mesh(new THREE.BoxGeometry());
  a.position.set(5,2,-1);a.scale.set(2,1,.5);a.rotation.z=.4;b.position.set(-3,1,0);b.rotation.y=.6;b.scale.set(.8,2,1);
  child.rotation.x=.3;child.position.set(1,2,3);editor.root.add(a,b);a.add(child);editor.root.updateMatrixWorld(true);
  const world=child.matrixWorld.clone();foundation.parent(child,b);
  assert.ok(child.matrixWorld.elements.every((v,i)=>Math.abs(v-world.elements[i])<1e-8));
  foundation.unparent(child);assert.ok(child.matrixWorld.elements.every((v,i)=>Math.abs(v-world.elements[i])<1e-8));
  const group=foundation.group([a,a,child]);assert.equal(group.children.length,2);
  const inner=foundation.group([group,a]);assert.deepEqual(inner.children,[group]);assert.equal(a.parent,group);
});

test('grow/shrink follows real vertex, edge and face adjacency rather than numeric IDs',()=>{
  const {foundation}=mockEditor();
  for(const kind of ['vertex','edge','face']){
    const c=components(kind);foundation.growComponentSelection(c);
    assert.ok(c.refreshed);assert.ok(c.ids.size>1);
    if(kind==='vertex'){assert.ok(!c.ids.has(1)&&!c.ids.has(2));foundation.shrinkComponentSelection(c);assert.deepEqual([...c.ids],[0]);}
    if(kind==='face'){assert.deepEqual([...c.ids],[0,1]);foundation.shrinkComponentSelection(c);assert.deepEqual([...c.ids],[0]);}
  }
  const c=components();c.ids.add(999);const before=[...c.ids];assert.throws(()=>foundation.growComponentSelection(c),/stale/);assert.deepEqual([...c.ids],before);
});
