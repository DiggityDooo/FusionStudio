import * as THREE from 'three';

const meshPosition=THREE.Mesh.prototype.getVertexPosition,skinPosition=THREE.SkinnedMesh.prototype.getVertexPosition,skinTransform=THREE.SkinnedMesh.prototype.applyBoneTransform,multiplyMatrices=THREE.Matrix4.prototype.multiplyMatrices;
const attributePrototypes=[THREE.BufferAttribute.prototype,THREE.InterleavedBufferAttribute.prototype,THREE.Float16BufferAttribute.prototype];
const dataField=(object,key)=>{const d=object&&Object.getOwnPropertyDescriptor(object,key);return !!d&&Object.hasOwn(d,'value');};
function ordinaryAttribute(a){
 if(!a||!dataField(a,'normalized')||!dataField(a,'itemSize'))return false;
 if(a.isInterleavedBufferAttribute){if(!dataField(a,'data')||!dataField(a,'offset')||!dataField(a.data,'array')||!dataField(a.data,'stride'))return false;}else if(!dataField(a,'array'))return false;
 for(const key of ['getX','getY','getZ','getW']){const d=Object.getOwnPropertyDescriptor(a,key);if(d&&!Object.hasOwn(d,'value'))return false;}
 return ArrayBuffer.isView(a.array)&&attributePrototypes.some(p=>['getX','getY','getZ','getW'].every(k=>a[k]===p[k]));
}
function plainNumbers(array,length){
 if(!(Array.isArray(array)||ArrayBuffer.isView(array))||array.length!==length)return false;
 for(let i=0;i<length;i++){const d=Object.getOwnPropertyDescriptor(array,String(i));if(!d||!Object.hasOwn(d,'value')||typeof d.value!=='number')return false;}return true;
}
function batchable(mesh){
 if(!mesh.isSkinnedMesh||mesh.getVertexPosition!==skinPosition||mesh.applyBoneTransform!==skinTransform||THREE.Mesh.prototype.getVertexPosition!==meshPosition||THREE.Matrix4.prototype.multiplyMatrices!==multiplyMatrices)return false;
 if(!['geometry','skeleton','matrixWorld','bindMatrix','bindMatrixInverse'].every(k=>dataField(mesh,k)))return false;
 const g=mesh.geometry,s=mesh.skeleton,attributes=[g.attributes.position,g.attributes.skinIndex,g.attributes.skinWeight,...(g.morphAttributes.position||[])];
 if(!attributes.every(ordinaryAttribute)||g.attributes.skinIndex.itemSize!==4||g.attributes.skinWeight.itemSize!==4||!s||!dataField(s,'bones')||!dataField(s,'boneInverses')||s.bones.length!==s.boneInverses.length)return false;
 for(let i=0;i<s.bones.length;i++)if(!dataField(s.bones,i)||!dataField(s.boneInverses,i)||!dataField(s.bones[i],'matrixWorld'))return false;
 if(Object.getOwnPropertyDescriptor(mesh,'morphTargetInfluences')&&!dataField(mesh,'morphTargetInfluences'))return false;
 if(mesh.morphTargetInfluences&&!plainNumbers(mesh.morphTargetInfluences,mesh.morphTargetInfluences.length))return false;
 return [mesh.matrixWorld,mesh.bindMatrix,mesh.bindMatrixInverse,...s.bones.map(b=>b?.matrixWorld),...s.boneInverses].every(m=>dataField(m,'elements')&&plainNumbers(m.elements,16));
}

// One synchronous numeric extraction. No scene updates or persistent pose cache.
// Double-precision bone products match Three's CPU evaluation; its float32 GPU
// skeleton buffer is deliberately not used for collision geometry.
export function appendEvaluatedMeshPositions(mesh,positions){
 const count=mesh.geometry.attributes.position.count,point=new THREE.Vector3();
 if(!batchable(mesh)){
  for(let i=0;i<count;i++){mesh.getVertexPosition(i,point);point.applyMatrix4(mesh.matrixWorld);positions.push(point.x,point.y,point.z);}
  return {mode:'reference',cachedBoneMatrices:0};
 }
 const skeleton=mesh.skeleton,g=mesh.geometry,matrices=new Array(skeleton.bones.length),indices=new THREE.Vector4(),weights=new THREE.Vector4(),bound=new THREE.Vector4(),transformed=new THREE.Vector4();let cached=0;
 for(let i=0;i<count;i++){
  meshPosition.call(mesh,i,point);indices.fromBufferAttribute(g.attributes.skinIndex,i);weights.fromBufferAttribute(g.attributes.skinWeight,i);
  bound.set(point.x,point.y,point.z,1).applyMatrix4(mesh.bindMatrix);point.set(0,0,0);
  for(let influence=0;influence<4;influence++){
   const weight=weights.getComponent(influence);if(weight===0)continue;const id=indices.getComponent(influence);
   let matrix=matrices[id];if(!matrix){matrix=new THREE.Matrix4().multiplyMatrices(skeleton.bones[id].matrixWorld,skeleton.boneInverses[id]);matrices[id]=matrix;cached++;}
   transformed.copy(bound).applyMatrix4(matrix);point.addScaledVector(transformed,weight);
  }
  point.applyMatrix4(mesh.bindMatrixInverse).applyMatrix4(mesh.matrixWorld);positions.push(point.x,point.y,point.z);
 }
 return {mode:'batched-linear',cachedBoneMatrices:cached};
}
