import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSkinWeightModel,setSkinLocks,applyAutoWeights,mirrorSkinWeights,hammerSkinWeights,transferSkinWeights,computeAutoWeights} from '../src/skin-weights.js';

function fixture({detail=false,lockedValues=[.4,.2,.6],subset=false}={}){
  const root=new THREE.Group(),scope=new THREE.Group();scope.userData={dson_geometry_id:'body',dson_deformation:{version:1}};root.add(scope);
  const bones=Array.from({length:4},(_,i)=>{const b=new THREE.Bone();b.name='Joint_'+i;b.position.set((i-1.5)*.3,.1*i,0);root.add(b);return b;});
  const g=detail?new THREE.SphereGeometry(.3,160,96):new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([-.2,0,0,.2,0,0,0,.2,0],3)).setIndex([0,1,2]);
  const count=g.attributes.position.count,ids=[],weights=[],skeleton=new THREE.Skeleton(subset?bones.slice(0,2):bones);
  for(let i=0;i<count;i++){const a=lockedValues[i%lockedValues.length];ids.push(0,1,subset?0:2,subset?0:3);weights.push(a,subset?1-a:(1-a)*.5,subset?0:(1-a)*.3,subset?0:(1-a)*.2);}
  g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(ids,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));g.setAttribute('_fusion_source_vertex',new THREE.Float32BufferAttribute(Array.from({length:count},(_,i)=>i),1));
  const meshes=[];for(let part=0;part<2;part++){const m=new THREE.SkinnedMesh(part?g.clone():g,new THREE.MeshBasicMaterial());scope.add(m);root.updateMatrixWorld(true);m.bind(skeleton);meshes.push(m);}
  return {root,bones,meshes};
}

async function assertLocked(operation,options={}){
  const {root,bones,meshes}=fixture(options);setSkinLocks(root,[bones[0].uuid]);
  const before=await createSkinWeightModel(root),locks=new Map([...before.rows].map(([key,row])=>[key,row.weights.get(bones[0].uuid)||0]));
  await operation(root);const after=await createSkinWeightModel(root);
  for(const [key,row]of after.rows){assert.equal(row.weights.get(bones[0].uuid)||0,locks.get(key));assert.ok(Math.abs([...row.weights.values()].reduce((a,b)=>a+b,0)-1)<1e-6);assert.ok(row.weights.size<=4);}
  assert.deepEqual(meshes[0].geometry.attributes.skinWeight.array,meshes[1].geometry.attributes.skinWeight.array);
  return after;
}

test('bulk auto, mirror and hammer preserve locked weights across material copies',async()=>{
  await assertLocked(root=>applyAutoWeights(root,{method:'heat'}));
  await assertLocked(root=>mirrorSkinWeights(root));
  await assertLocked(root=>hammerSkinWeights(root,{iterations:2}));
});

test('automatic weights never introduce joints absent from a mesh skeleton',async()=>{
  const {root,meshes}=fixture({subset:true});await applyAutoWeights(root,{method:'heat'});
  for(const mesh of meshes)for(let i=0;i<mesh.geometry.attributes.skinIndex.count;i++)for(let c=0;c<4;c++)assert.ok(mesh.geometry.attributes.skinIndex.getComponent(i,c)<2);
  const model=await createSkinWeightModel(root);assert.equal(model.bones.size,2);const row=[...model.rows.values()].find(r=>r.entries.some(e=>e.index===1));
  const joint0=meshes[0].skeleton.bones[0],joint1=meshes[0].skeleton.bones[1];assert.ok(row.weights.get(joint1.uuid)>row.weights.get(joint0.uuid),'positive-X vertex must favor the nearest allowed joint instead of mapping absent joints to joint zero');
});

test('envelope fallback selects the closest capsule outside every envelope, independently of joint order',()=>{
 const boneA=new THREE.Bone(),boneB=new THREE.Bone(),capsules=[{bone:boneA,a:new THREE.Vector3(10,0,0),b:new THREE.Vector3(10,1,0)},{bone:boneB,a:new THREE.Vector3(2,0,0),b:new THREE.Vector3(2,1,0)}];
 for(const list of [capsules,[...capsules].reverse()])assert.deepEqual([...computeAutoWeights(new THREE.Vector3(),list,{method:'envelope',envelope:.1})],[[boneB.uuid,1]]);
});

test('ambiguous source joint names reject transfer before replacing any geometry',async()=>{
 const source=fixture(),target=fixture();source.bones[1].name=source.bones[0].name;const geometry=target.meshes.map(m=>m.geometry);
 await assert.rejects(transferSkinWeights(source.root,target.root),/ambiguous source/);assert.deepEqual(target.meshes.map(m=>m.geometry),geometry);
});

test('weight transfer preserves target locks and rejects missing joint identities atomically',async()=>{
  const source=fixture({lockedValues:[.8,.7,.9]}),target=fixture();setSkinLocks(target.root,[target.bones[0].uuid]);
  const before=await createSkinWeightModel(target.root),locked=[...before.rows.values()].map(r=>r.weights.get(target.bones[0].uuid));
  await transferSkinWeights(source.root,target.root);const after=await createSkinWeightModel(target.root);
  assert.deepEqual([...after.rows.values()].map(r=>r.weights.get(target.bones[0].uuid)),locked);
  target.bones[3].name='DifferentJoint';const geometry=target.meshes.map(m=>m.geometry);
  await assert.rejects(transferSkinWeights(source.root,target.root),/joint|mapping|match/i);
  assert.deepEqual(target.meshes.map(m=>m.geometry),geometry);
});

test('bulk lock preservation holds on detailed UV/material-split geometry',async t=>{
  const start=performance.now(),result=await assertLocked(root=>applyAutoWeights(root,{method:'envelope',envelope:.5}),{detail:true});
  assert.ok(result.rows.size>15000);t.diagnostic(`${result.rows.size} source vertices / ${result.vertexCount} split vertices: ${(performance.now()-start).toFixed(1)} ms including model validation.`);
});
