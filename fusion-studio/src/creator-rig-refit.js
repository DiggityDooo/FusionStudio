import * as THREE from 'three';

const validMatrix=m=>m?.elements?.length===16&&m.elements.every(Number.isFinite)&&Math.abs(m.determinant())>1e-16;
const finiteVector=v=>v.toArray().every(x=>Number.isFinite(x)&&Math.abs(x)<1e12);

// Inverse binds are the persisted neutral frames, not the currently posed
// joints. Recover local rest TRS before moving landmarks, then carry authored
// translation offsets, rotations and scales into the new neutral binding.
export function refitCreatorRig(body,records,positions,{preserveBind=false,previousPositions=positions}={}) {
 const skeleton=body?.skeleton,bones=skeleton?.bones;
 if(!body?.isSkinnedMesh||!Array.isArray(records)||!bones||bones.length!==records.length||skeleton.boneInverses.length!==bones.length||!validMatrix(body.bindMatrix))throw Error('The character has no complete, invertible creator skin binding. Restore its matching source rig.');
 const inverseBind=body.bindMatrix.clone().invert(),byName=new Map(bones.map((b,i)=>[b.name,{bone:b,index:i,record:records.find(r=>r.name===b.name)}]));
 if(byName.size!==records.length)throw Error('Creator rig names are missing or duplicated. Restore the source rig before changing proportions.');
 const absolute=bones.map((bone,i)=>{const inverse=skeleton.boneInverses[i];if(!bone?.isBone||!validMatrix(inverse)||!finiteVector(bone.position)||!finiteVector(bone.scale)||!bone.quaternion.toArray().every(Number.isFinite)||Math.abs(bone.quaternion.length()-1)>1e-4)throw Error('Creator rig contains an invalid joint transform or inverse bind. Restore the last consistent pose.');return inverseBind.clone().multiply(inverse.clone().invert());});
 let nonUnitRestScales=0;
 for(const row of byName.values()){
  const {bone,record,index}=row,parent=record?.parent?byName.get(record.parent):null;
  if(!record||record.parent&&!parent||bone.parent!==(parent?.bone||body))throw Error('Creator rig hierarchy changed. Use a separate working copy for custom skeleton structure.');
  const local=parent?absolute[parent.index].clone().invert().multiply(absolute[index]):absolute[index].clone(),position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3();local.decompose(position,quaternion,scale);
  const rebuilt=new THREE.Matrix4().compose(position,quaternion,scale),norm=Math.max(1,...local.elements.map(Math.abs));
  if(!finiteVector(position)||!finiteVector(scale)||!quaternion.toArray().every(Number.isFinite)||local.elements.some((v,i)=>Math.abs(v-rebuilt.elements[i])>norm*1e-8))throw Error('Creator neutral skin frames contain unsupported shear. Retain the original rig and use an evaluated working copy.');
  if(scale.toArray().some(v=>Math.abs(v-1)>1e-8))nonUnitRestScales++;
  row.restQuaternion=quaternion;row.restScale=scale;row.offset=bone.position.clone().sub(position);
  for(const axis of ['x','y','z'])if(Math.abs(row.offset[axis])<1e-12)row.offset[axis]=0;
 }
 const report={version:1,method:'source-landmarks-rest-relative',joints:bones.length,nonUnitRestScales,preservedBind:preserveBind};
 if(preserveBind){body.updateWorldMatrix(true,false);body.updateMatrixWorld(true);skeleton.update();return report;}
 if(body.bindMode!=='attached')throw Error('Creator proportion refitting requires attached skinning. Keep detached rigs in their original project or use an evaluated working copy.');
 const visiting=new Set();
 function plan(row){
  if(row.nextAbsolute)return;
  if(visiting.has(row))throw Error('Creator rig hierarchy contains a cycle.');visiting.add(row);
  const record=row.record,parent=record.parent?byName.get(record.parent):null;if(parent)plan(parent);
  const point=new THREE.Vector3(),previous=new THREE.Vector3();if(!Array.isArray(record.landmarks)||!record.landmarks.length||previousPositions.length!==positions.length)throw Error('Creator joint landmarks are missing.');
  for(const id of record.landmarks){if(!Number.isInteger(id)||id<0||id*3+2>=positions.length||![positions[id*3],positions[id*3+1],positions[id*3+2],previousPositions[id*3],previousPositions[id*3+1],previousPositions[id*3+2]].every(Number.isFinite))throw Error('Creator joint landmark positions are invalid.');point.add(new THREE.Vector3().fromArray(positions,id*3));previous.add(new THREE.Vector3().fromArray(previousPositions,id*3));}point.sub(previous).divideScalar(record.landmarks.length).add(new THREE.Vector3().setFromMatrixPosition(absolute[row.index]));
  row.nextPosition=parent?point.applyMatrix4(parent.nextAbsolute.clone().invert()):point;
  const local=new THREE.Matrix4().compose(row.nextPosition,row.restQuaternion,row.restScale);row.nextAbsolute=parent?parent.nextAbsolute.clone().multiply(local):local;
  row.nextInverse=body.bindMatrix.clone().multiply(row.nextAbsolute).invert();if(!validMatrix(row.nextInverse))throw Error('Creator joint refitting produced a singular skin binding.');visiting.delete(row);
 }
 for(const row of byName.values())plan(row);
 // Install only after every rest frame has been checked. Pose quaternion and
 // scale fields stay exact; only their neutral translation frame is refitted.
 for(const row of byName.values())row.bone.position.copy(row.nextPosition).add(row.offset);
 skeleton.boneInverses=bones.map(b=>byName.get(b.name).nextInverse);body.updateWorldMatrix(true,false);body.updateMatrixWorld(true);skeleton.update();return report;
}
