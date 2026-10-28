import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GeometrySnapIndex,GeometrySnapGesture,constrainedSnapPosition,SNAP_LIMITS} from '../src/geometry-snap.js';
import {attachSceneFoundation} from '../src/scene-foundation.js';

const close=(actual,expected,tolerance=1e-7)=>assert.ok(new THREE.Vector3(...actual).distanceTo(new THREE.Vector3(...expected))<tolerance,`${actual} != ${expected}`);
function triangle(){const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([-1,0,0,1,0,0,0,1,0],3)).setIndex([0,1,2]);return new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());}
function editorFixture(){
  const root=new THREE.Group(),selected=new THREE.Group(),target=triangle(),camera=new THREE.PerspectiveCamera(38,1,.01,100);root.add(selected,target);camera.position.set(0,0,5);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const editor={root,selected,camera,change(){},evaluation:{epoch:0},viewRect:()=>({width:800,height:800}),transform:{object:selected,mode:'translate',axis:'XYZ',space:'world',setTranslationSnap(v){this.translationSnap=v;},setRotationSnap(){},setScaleSnap(){},setSpace(v){this.space=v;}}};
  attachSceneFoundation(editor);return {e:editor,target,selected};
}

test('vertex, edge, triangle-center and surface snaps use evaluated transformed geometry',()=>{
  const root=new THREE.Group(),parent=new THREE.Group(),target=triangle();root.add(parent);parent.add(target);parent.position.set(1.12,-.21,.33);parent.rotation.set(.2,.4,-.3);parent.scale.set(1.2,.8,1.5);target.rotation.set(.1,-.2,.1);root.updateMatrixWorld(true);
  const vertices=[0,1,2].map(i=>new THREE.Vector3().fromBufferAttribute(target.geometry.attributes.position,i).applyMatrix4(target.matrixWorld)),normal=new THREE.Vector3().crossVectors(vertices[1].clone().sub(vertices[0]),vertices[2].clone().sub(vertices[0])).normalize();
  const center=vertices.reduce((p,v)=>p.add(v),new THREE.Vector3()).divideScalar(3),edge=vertices[0].clone().lerp(vertices[1],.23);
  for(const [mode,expected]of [['vertex',vertices[0]],['edge',edge],['face',center],['surface',center]]){
    const index=new GeometrySnapIndex(root,null,mode),query=expected.clone().addScaledVector(normal,.04),hit=index.nearest(query);
    assert.equal(hit.meshId,target.uuid);close(hit.point,expected.toArray());assert.ok(Math.abs(hit.distance-.04)<1e-7);assert.equal(index.nearest(query,.02),null);assert.equal(index.current(),true);
  }
});

test('nearest edge is searched independently of the nearest triangle surface',()=>{
  const g=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([-10,-10,.01,10,-10,.01,0,10,.01,.2,-.1,0,.2,.1,0,.4,0,0],3)).setIndex([0,1,2,3,4,5]),mesh=new THREE.Mesh(g),root=new THREE.Group();root.add(mesh);
  const surface=new GeometrySnapIndex(root,null,'surface').nearest([0,0,0]),edge=new GeometrySnapIndex(root,null,'edge').nearest([0,0,0]);assert.equal(surface.component,0);assert.deepEqual(edge.component,[3,4]);close(edge.point,[.2,0,0]);
});

test('geometric snapping excludes the moving hierarchy, invisible targets and hidden material faces',()=>{
  const root=new THREE.Group(),source=new THREE.Group(),self=triangle(),hidden=new THREE.Group(),hiddenMesh=triangle(),target=triangle();source.add(self);hidden.add(hiddenMesh);hidden.visible=false;root.add(source,hidden,target);target.position.z=2;
  const hit=new GeometrySnapIndex(root,source,'surface').nearest([0,.3,0]);assert.equal(hit.meshId,target.uuid);close(hit.point,[0,.3,2]);
  target.geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,0,0,1,0,0,0,1,0,-1,0,1,1,0,1,0,1,1],3));target.geometry.setIndex([0,1,2,3,4,5]);target.geometry.addGroup(0,3,0);target.geometry.addGroup(3,3,1);target.material=[new THREE.MeshBasicMaterial({visible:false}),new THREE.MeshBasicMaterial()];
  const vertices=new GeometrySnapIndex(root,source,'vertex');assert.equal(vertices.records.length,3);assert.ok(vertices.records.every(r=>r.component>=3));assert.equal(new GeometrySnapIndex(root,source,'surface').nearest([0,.3,0]).point[2],3);
});

test('morphs and posed bones are snap targets, and changed geometry invalidates snapshots',()=>{
  const root=new THREE.Group(),morph=triangle();morph.geometry.morphAttributes.position=[new THREE.Float32BufferAttribute([0,0,.4,0,0,.4,0,0,.4],3)];morph.geometry.morphTargetsRelative=true;morph.updateMorphTargets();morph.morphTargetInfluences[0]=.5;root.add(morph);
  const index=new GeometrySnapIndex(root,null,'surface');close(index.nearest([0,.3,1]).point,[0,.3,.2]);morph.morphTargetInfluences[0]=1;assert.equal(index.current(),false);
  const bone=new THREE.Bone(),g=triangle().geometry,count=g.attributes.position.count;g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(count*4),4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(Array.from({length:count*4},(_,i)=>i%4===0?1:0),4));const skin=new THREE.SkinnedMesh(g,new THREE.MeshBasicMaterial());root.clear();root.add(skin,bone);root.updateMatrixWorld(true);skin.bind(new THREE.Skeleton([bone]));bone.position.z=.7;root.updateMatrixWorld(true);
  const posed=new GeometrySnapIndex(root,null,'surface');close(posed.nearest([0,.3,1]).point,[0,.3,.7]);bone.position.z=.8;root.updateMatrixWorld(true);assert.equal(posed.current(),false);
});

test('axis and plane constraints preserve locked motion in world and local orientations',()=>{
  const proposed=new THREE.Vector3(.1,.2,.3),target=new THREE.Vector3(1,2,3),q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/2);
  close(constrainedSnapPosition(proposed,target,{axis:'X'}).toArray(),[1,.2,.3]);close(constrainedSnapPosition(proposed,target,{axis:'XZ'}).toArray(),[1,.2,3]);close(constrainedSnapPosition(proposed,target,{axis:'X',space:'local',quaternion:q}).toArray(),[.1,2,.3]);
  assert.throws(()=>constrainedSnapPosition(proposed,target,{axis:'E'}),/translation/);
});

test('actual drag snapping respects screen range, parent transforms and one live scene revision',()=>{
  const {e,target,selected}=editorFixture(),parent=new THREE.Group();e.root.add(parent);parent.position.set(.1,.2,0);parent.rotation.z=.3;parent.scale.set(2,.5,1);parent.add(selected);e.root.updateMatrixWorld(true);
  const desired=new THREE.Vector3(0,1,0),proposed=desired.clone().add(new THREE.Vector3(.017,-.013,.01));selected.position.copy(parent.worldToLocal(proposed.clone()));e.foundation.setSnap({enabled:true,mode:'vertex'});assert.equal(e.transform.translationSnap,null);
  const gesture=e.foundation.snapGesture;gesture.begin();const hit=gesture.apply();assert.equal(hit.meshId,target.uuid);close(selected.getWorldPosition(new THREE.Vector3()).toArray(),desired.toArray());
  selected.position.copy(parent.worldToLocal(new THREE.Vector3(4,0,0)));assert.equal(gesture.apply(),null);close(selected.getWorldPosition(new THREE.Vector3()).toArray(),[4,0,0]);
  selected.position.copy(parent.worldToLocal(proposed.clone()));e.evaluation.epoch++;assert.equal(gesture.apply(),null);close(selected.getWorldPosition(new THREE.Vector3()).toArray(),proposed.toArray());
  gesture.begin();target.position.z=.1;assert.equal(gesture.apply(),null);assert.match(gesture.diagnostics[0],/targets changed/);
});

test('orthographic range and local-view/collection exclusions use the actual viewport',()=>{
  const {e,selected,target}=editorFixture();e.camera=new THREE.OrthographicCamera(-2,2,2,-2,.01,100);e.camera.position.z=5;e.camera.updateMatrixWorld(true);selected.position.set(0,1.08,0);e.foundation.setSnap({enabled:true,mode:'vertex'});e.foundation.snapGesture.begin();assert.ok(e.foundation.snapGesture.apply());close(selected.position.toArray(),[0,1,0]);
  e.localView=new Set([selected.uuid]);e.foundation.snapGesture.begin();assert.equal(e.foundation.snapGesture.apply(),null);e.localView=null;
  e.foundation.state.collections.push({id:'locked',name:'Locked',selectable:false,visible:true,members:[target.uuid]});e.foundation.snapGesture.begin();assert.equal(e.foundation.snapGesture.apply(),null);
});

test('drag indexes are reused only while the complete target inventory and evaluated geometry match',()=>{
  const {e,target,selected}=editorFixture(),gesture=e.foundation.snapGesture;e.foundation.setSnap({enabled:true,mode:'edge'});gesture.begin();const first=gesture.session.index;gesture.end();e.evaluation.epoch++;selected.position.x=.2;gesture.begin();assert.equal(gesture.session.index,first);
  const extra=triangle();extra.position.z=1;e.root.add(extra);gesture.begin();assert.notEqual(gesture.session.index,first);const added=gesture.session.index;extra.visible=false;gesture.begin();assert.notEqual(gesture.session.index,added);
  const previous=gesture.session.index;target.geometry.attributes.position.setZ(0,.1);target.geometry.attributes.position.needsUpdate=true;gesture.begin();assert.notEqual(gesture.session.index,previous);gesture.clear();assert.equal(gesture.cache,null);assert.equal(gesture.session,null);
});

test('invalid targets, unsupported instances and bounded budgets produce explicit outcomes',()=>{
  const root=new THREE.Group(),target=triangle();root.add(target);target.geometry.index.setX(0,999);assert.throws(()=>new GeometrySnapIndex(root,null,'edge'),/missing vertex/);target.geometry.index.setX(0,0);target.geometry.attributes.position.setX(0,NaN);assert.throws(()=>new GeometrySnapIndex(root,null,'surface'),/non-finite/);
  target.geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array((SNAP_LIMITS.vertices+3)*3),3));assert.throws(()=>new GeometrySnapIndex(root,null,'vertex'),/300,000/);
  root.clear();const instanced=new THREE.InstancedMesh(triangle().geometry,new THREE.MeshBasicMaterial(),2);root.add(instanced);const snapshot=new GeometrySnapIndex(root,null,'surface');assert.equal(snapshot.nearest([0,0,0]),null);assert.match(snapshot.diagnostics[0],/Instanced/);
});

test('detailed edge queries match independent brute-force line projections and record CPU costs',t=>{
  const root=new THREE.Group(),mesh=new THREE.Mesh(new THREE.SphereGeometry(.5,256,200));root.add(mesh);const before=Array.from(mesh.geometry.attributes.position.array),start=performance.now(),index=new GeometrySnapIndex(root,null,'edge'),built=performance.now(),queries=Array.from({length:30},(_,i)=>new THREE.Vector3(Math.sin(i*1.7)*.7,Math.cos(i*.6)*.7,Math.sin(i*.4)*.7));
  const hits=queries.map(p=>index.nearest(p)),queried=performance.now();
  for(let i=0;i<queries.length;i+=7){let best=Infinity;const line=new THREE.Line3(),candidate=new THREE.Vector3();for(const [a,b]of index.index.segments){line.start.fromArray(index.index.positions,a*3);line.end.fromArray(index.index.positions,b*3);line.closestPointToPoint(queries[i],true,candidate);best=Math.min(best,candidate.distanceTo(queries[i]));}assert.ok(Math.abs(best-hits[i].distance)<1e-10);}
  assert.deepEqual(Array.from(mesh.geometry.attributes.position.array),before);assert.ok(hits.some(h=>h.stats.segmentsTested<index.records.length/5));
  t.diagnostic(`${mesh.geometry.index.count/3} triangles / ${index.records.length} edges: build ${(built-start).toFixed(1)} ms; 30 queries ${(queried-built).toFixed(1)} ms. CPU snapshot is built at drag start.`);
});
