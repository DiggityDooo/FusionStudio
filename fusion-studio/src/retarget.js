import * as THREE from 'three';
import {bonesOf} from './rig-paths.js';

/** Canonical role → common name aliases (case-insensitive, separators ignored). */
export const BONE_ALIASES={
 hips:['hips','hip','pelvis','root','hip_l','cog'],
 spine:['spine','spine1','spine_01','abdomen','waist'],
 chest:['chest','spine2','spine3','spine_02','thorax','ribcage'],
 neck:['neck','neck_01'],
 head:['head','head_01','skull'],
 shoulder_l:['shoulder_l','leftshoulder','l_shoulder','clavicle_l','lclavicle'],
 upperarm_l:['upperarm_l','leftarm','l_upperarm','arm_l','luparm','shoulder.l'],
 forearm_l:['forearm_l','leftforearm','l_forearm','lowerarm_l','l_ulna'],
 hand_l:['hand_l','lefthand','l_hand','wrist_l'],
 shoulder_r:['shoulder_r','rightshoulder','r_shoulder','clavicle_r','rclavicle'],
 upperarm_r:['upperarm_r','rightarm','r_upperarm','arm_r','ruparm'],
 forearm_r:['forearm_r','rightforearm','r_forearm','lowerarm_r'],
 hand_r:['hand_r','righthand','r_hand','wrist_r'],
 thigh_l:['thigh_l','leftupleg','l_thigh','upleg_l','l_upleg','hip.l'],
 shin_l:['shin_l','leftleg','l_shin','leg_l','l_leg','calf_l'],
 foot_l:['foot_l','leftfoot','l_foot','ankle_l'],
 thigh_r:['thigh_r','rightupleg','r_thigh','upleg_r','r_upleg'],
 shin_r:['shin_r','rightleg','r_shin','leg_r','r_leg','calf_r'],
 foot_r:['foot_r','rightfoot','r_foot','ankle_r']
};

export function normalizeBoneName(name){return String(name||'').toLowerCase().replace(/[^a-z0-9]+/g,'');}

export function roleForBone(name){
 const n=normalizeBoneName(name);
 for(const [role,aliases] of Object.entries(BONE_ALIASES))if(aliases.some(a=>n===normalizeBoneName(a)||n.endsWith(normalizeBoneName(a))))return role;
 return null;
}

export function buildRetargetMap(sourceRoot,targetRoot,{manual={}}={}){
 const source=bonesOf(sourceRoot),target=bonesOf(targetRoot);
 const byRole=new Map(),byName=new Map(target.map(b=>[normalizeBoneName(b.name),b]));
 for(const bone of source){const role=roleForBone(bone.name);if(role&&!byRole.has(role))byRole.set(role,bone);}
 const pairs=[];
 for(const tBone of target){
  const key=normalizeBoneName(tBone.name);
  if(manual[tBone.name]||manual[key]){const s=source.find(b=>b.name===manual[tBone.name]||normalizeBoneName(b.name)===normalizeBoneName(manual[tBone.name]||manual[key]));if(s){pairs.push({source:s,target:tBone,role:roleForBone(tBone.name)});continue;}}
  const exact=byName.has(key)?source.find(b=>normalizeBoneName(b.name)===key):null;
  if(exact){pairs.push({source:exact,target:tBone,role:roleForBone(tBone.name)});continue;}
  const role=roleForBone(tBone.name),s=role&&byRole.get(role);if(s)pairs.push({source:s,target:tBone,role});
 }
 return {pairs,unmatchedSource:source.filter(b=>!pairs.some(p=>p.source===b)),unmatchedTarget:target.filter(b=>!pairs.some(p=>p.target===b))};
}

function heightOf(root){
 const bones=bonesOf(root);if(!bones.length)return 1;root.updateWorldMatrix(true,true);
 let min=Infinity,max=-Infinity;for(const b of bones){const y=b.getWorldPosition(new THREE.Vector3()).y;min=Math.min(min,y);max=Math.max(max,y);}
 return Math.max(.01,max-min);
}

/**
 * Copy local rotations (and optional root translation) from source skeleton to target.
 * Uses rest-relative deltas so different bind poses remain compatible.
 */
export function retargetPose(sourceRoot,targetRoot,{map,rootMotion=true,rotationOnly=false}={}){
 const mapping=map||buildRetargetMap(sourceRoot,targetRoot);if(!mapping.pairs.length)throw Error('No retargetable bone pairs found. Rename joints or supply a manual map.');
 sourceRoot.updateWorldMatrix(true,true);targetRoot.updateWorldMatrix(true,true);
 const scale=heightOf(targetRoot)/heightOf(sourceRoot);
 for(const {source,target} of mapping.pairs){
  // Rest-relative: q_delta = inv(rest_source) * current_source applied onto rest_target.
  const restS=new THREE.Quaternion().fromArray(source.userData.fusion_source_quaternion||[0,0,0,1]);
  const restT=new THREE.Quaternion().fromArray(target.userData.fusion_source_quaternion||[0,0,0,1]);
  const delta=restS.clone().invert().multiply(source.quaternion.clone());
  target.quaternion.copy(restT).multiply(delta).normalize();
  if(rootMotion&&!rotationOnly&&!source.parent?.isBone&&!target.parent?.isBone){
   target.position.copy(source.position).multiplyScalar(scale);
  }
 }
 targetRoot.updateWorldMatrix(true,true);
 return {pairs:mapping.pairs.length,scale,unmatchedTarget:mapping.unmatchedTarget.map(b=>b.name)};
}

export function retargetClip(sourceRoot,targetRoot,keys,{map}={}){
 const mapping=map||buildRetargetMap(sourceRoot,targetRoot);if(!mapping.pairs.length)throw Error('No retargetable bone pairs.');
 const out=[];
 for(const key of keys||[]){
  const tracks={};for(const {source,target} of mapping.pairs){
   const src=key.tracks?.[source.uuid]||key.tracks?.[source.name];if(!src)continue;
   tracks[target.uuid]={position:src.position?[...src.position]:target.position.toArray(),quaternion:[...src.quaternion],scale:src.scale?[...src.scale]:[1,1,1]};
  }
  if(Object.keys(tracks).length)out.push({frame:key.frame,interp:key.interp||'linear',tracks});
 }
 return out;
}

/** Simple mocap cleanup: clamp spike rotations and optional foot lock on lowest Y frames. */
export function cleanupMocapKeys(keys,{maxDelta=.5}={}){
 if(!Number.isFinite(maxDelta)||maxDelta<=0)throw Error('Cleanup maxDelta must be > 0.');
 if(!keys?.length)return [];
 const out=keys.map(k=>structuredClone(k));
 for(let i=1;i<out.length-1;i++){
  for(const id of Object.keys(out[i].tracks||{})){
   const a=out[i-1].tracks[id],b=out[i].tracks[id],c=out[i+1].tracks[id];if(!a?.quaternion||!b?.quaternion||!c?.quaternion)continue;
   const qb=new THREE.Quaternion().fromArray(b.quaternion),qa=new THREE.Quaternion().fromArray(a.quaternion),qc=new THREE.Quaternion().fromArray(c.quaternion);
   if(qa.angleTo(qb)>maxDelta&&qc.angleTo(qb)>maxDelta){const mid=qa.clone().slerp(qc,.5);b.quaternion=mid.toArray();}
  }
 }
 return out;
}
