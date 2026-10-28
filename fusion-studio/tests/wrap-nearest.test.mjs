import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildBVH,closestPointBVH} from '../src/bvh.js';
import {applyWrap,applyShrinkwrap} from '../src/skin-deformers.js';
const close=(a,b,tol=1e-6)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);

test('nearest wrap chooses either plane triangle correctly and blends from the original point',()=>{
 const target=new THREE.Mesh(new THREE.PlaneGeometry(2,2,1,1),new THREE.MeshBasicMaterial());target.position.z=.2;
 for(const strength of [0,.25,1]){const source=new THREE.Mesh(new THREE.PlaneGeometry(.8,.8,24,24),new THREE.MeshBasicMaterial()),before=source.geometry.attributes.position.clone();applyWrap(source,target,{strength});const p=source.geometry.attributes.position;
  for(let i=0;i<p.count;i++){close(p.getX(i),before.getX(i));close(p.getY(i),before.getY(i));close(p.getZ(i),.2*strength);}
 }
 const source=new THREE.Mesh(new THREE.PlaneGeometry(.8,.8,24,24),new THREE.MeshBasicMaterial());applyShrinkwrap(source,target,{offset:.03});for(let i=0;i<source.geometry.attributes.position.count;i++)close(source.geometry.attributes.position.getZ(i),.23);
});

test('transformed wrap matches an independent plane projection in world units',()=>{
 const source=new THREE.Mesh(new THREE.PlaneGeometry(.5,.5,12,12),new THREE.MeshBasicMaterial()),target=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshBasicMaterial());
 source.position.set(.1,.2,.3);source.rotation.set(.2,-.1,.3);source.scale.set(1.3,.8,1.2);target.position.set(1,2,3);target.rotation.set(.4,-.2,.1);source.updateMatrixWorld(true);target.updateMatrixWorld(true);
 const normal=new THREE.Vector3(0,0,1).applyMatrix3(new THREE.Matrix3().getNormalMatrix(target.matrixWorld)).normalize(),origin=target.getWorldPosition(new THREE.Vector3()),inverse=source.matrixWorld.clone().invert(),p=source.geometry.attributes.position,before=Array.from({length:p.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(source.matrixWorld));
 applyWrap(source,target,{strength:.4,offset:.02});for(let i=0;i<p.count;i++){const original=before[i],projected=original.clone().addScaledVector(normal,-original.clone().sub(origin).dot(normal)+.02),expected=original.clone().lerp(projected,.4).applyMatrix4(inverse);close(p.getX(i),expected.x);close(p.getY(i),expected.y);close(p.getZ(i),expected.z);}
});

test('nearest BVH agrees with brute-force triangle references and deterministic boundary ties',()=>{
 let seed=1821;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296*4-2;};const positions=Array.from({length:9000},rnd),indices=Array.from({length:3000},(_,i)=>i),mesh={positions,indices},bvh=buildBVH(mesh),triangle=new THREE.Triangle(),candidate=new THREE.Vector3();
 for(let q=0;q<80;q++){const point=[rnd(),rnd(),rnd()],query=new THREE.Vector3(...point);let expected=null;
  for(let t=0;t<indices.length/3;t++){triangle.a.fromArray(positions,t*9);triangle.b.fromArray(positions,t*9+3);triangle.c.fromArray(positions,t*9+6);triangle.closestPointToPoint(query,candidate);const distance=query.distanceTo(candidate);if(!expected||distance<expected.distance)expected={triangle:t,distance,point:candidate.toArray()};}
  const actual=closestPointBVH(bvh,point);close(actual.distance,expected.distance,1e-12);assert.equal(actual.triangle,expected.triangle);for(let c=0;c<3;c++)close(actual.point[c],expected.point[c],1e-12);assert.equal(closestPointBVH(bvh,point,{maxDistance:actual.distance*.5}),null);
 }
 const duplicate={positions:[0,0,0,1,0,0,0,1,0],indices:[0,1,2,0,1,2]};assert.equal(closestPointBVH(buildBVH(duplicate,{maxLeafSize:1}),[.2,.2,1]).triangle,0);
 assert.equal(closestPointBVH(buildBVH({positions:[],indices:[]}),[0,0,0]),null);assert.throws(()=>closestPointBVH(bvh,[NaN,0,0]));
});

test('wrap targets use evaluated morphs and skeleton poses instead of their undeformed cage',()=>{
 const target=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial()),delta=target.geometry.attributes.position.clone();delta.array.fill(0);for(let i=0;i<delta.count;i++)delta.setZ(i,.4);target.geometry.morphAttributes.position=[delta];target.geometry.morphTargetsRelative=true;target.updateMorphTargets();target.morphTargetInfluences[0]=.5;
 const source=new THREE.Mesh(new THREE.PlaneGeometry(.5,.5,8,8),new THREE.MeshBasicMaterial());applyWrap(source,target);for(let i=0;i<source.geometry.attributes.position.count;i++)close(source.geometry.attributes.position.getZ(i),.2);
 const geometry=new THREE.PlaneGeometry(2,2),n=geometry.attributes.position.count;geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(n*4),4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(Array.from({length:n*4},(_,i)=>i%4===0?1:0),4));
 const skin=new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial()),bone=new THREE.Bone();skin.add(bone);skin.updateMatrixWorld(true);skin.bind(new THREE.Skeleton([bone]));bone.position.z=.3;applyWrap(source,skin);for(let i=0;i<source.geometry.attributes.position.count;i++)close(source.geometry.attributes.position.getZ(i),.3);assert.equal(geometry.attributes.position.getZ(0),0);
});

test('malformed targets and singular transforms fail without partial source edits',()=>{
 const source=new THREE.Mesh(new THREE.PlaneGeometry(.5,.5,8,8),new THREE.MeshBasicMaterial()),before=new Float32Array(source.geometry.attributes.position.array),target=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial());
 target.geometry.attributes.position.setX(2,NaN);assert.throws(()=>applyWrap(source,target),/non-finite/);assert.deepEqual(source.geometry.attributes.position.array,before);
 target.geometry=new THREE.PlaneGeometry(2,2);target.geometry.index.setX(1,99999);assert.throws(()=>applyWrap(source,target),/missing vertex/);assert.deepEqual(source.geometry.attributes.position.array,before);
 target.geometry=new THREE.PlaneGeometry(2,2);source.scale.x=0;assert.throws(()=>applyWrap(source,target),/singular/);assert.deepEqual(source.geometry.attributes.position.array,before);
});

test('detailed wrap prunes triangle work and records end-to-end CPU cost',t=>{
 const source=new THREE.Mesh(new THREE.SphereGeometry(.55,96,64),new THREE.MeshBasicMaterial()),target=new THREE.Mesh(new THREE.SphereGeometry(.5,256,200),new THREE.MeshBasicMaterial()),start=performance.now(),result=applyWrap(source,target);
 assert.equal(result.faces,101888);assert.ok(result.trianglesTested<result.vertices*result.faces/30);const p=source.geometry.attributes.position;for(let i=0;i<p.count;i+=17){const r=Math.hypot(p.getX(i),p.getY(i),p.getZ(i));assert.ok(r>.4997&&r<.50001);}
 t.diagnostic(`${result.vertices} source vertices / ${result.faces} target triangles: ${(performance.now()-start).toFixed(1)} ms; ${result.trianglesTested} triangle tests instead of ${result.vertices*result.faces}.`);
});
