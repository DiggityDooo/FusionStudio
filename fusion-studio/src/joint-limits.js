import * as THREE from 'three';
import {nodePath,pathNode} from './rig-paths.js';
const AXES=['x','y','z'],DEG=180/Math.PI,reports=new WeakMap();
const samePath=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
function quaternion(value){if(!Array.isArray(value)||value.length!==4||!value.every(Number.isFinite)||Math.abs(Math.hypot(...value)-1)>1e-4)throw Error('Joint reference must be a finite unit quaternion.');return new THREE.Quaternion().fromArray(value).normalize();}
export function validateJointLimit(limit){
 if(!limit||limit.version!==1||limit.order!=='XYZ'||typeof limit.name!=='string'||limit.name.length>256||typeof limit.enabled!=='boolean'||!Array.isArray(limit.path)||!limit.path.length||limit.path.length>128||limit.path.some(i=>!Number.isInteger(i)||i<0))throw Error('Unsupported joint limit or joint path.');
 quaternion(limit.reference);
 if(!limit.bounds||typeof limit.bounds!=='object')throw Error('Joint limits need local X, Y and Z bounds.');
 for(const axis of AXES){const b=limit.bounds[axis],range=axis==='y'?89.9:180;if(!b||typeof b.enabled!=='boolean'||![b.min,b.max].every(Number.isFinite)||b.min>b.max||b.min< -range||b.max>range)throw Error(`Joint ${axis.toUpperCase()} bounds must increase within ±${range} degrees.`);}
 return limit;
}
export function jointLimit(root,bone){if(!bone?.isBone)return null;const path=nodePath(root,bone),limits=root.userData.fusion_joint_limits||[];if(!Array.isArray(limits)||limits.length>1024)throw Error('Character joint-limit count exceeds 1,024.');return limits.find(c=>samePath(c.path||[],path))||null;}
export function jointReference(root,bone){return quaternion(jointLimit(root,bone)?.reference||bone.userData.fusion_source_quaternion||[0,0,0,1]);}
export function jointLocalAngles(root,bone){const delta=jointReference(root,bone).invert().multiply(bone.quaternion),euler=new THREE.Euler().setFromQuaternion(delta,'XYZ');return {x:euler.x*DEG,y:euler.y*DEG,z:euler.z*DEG};}
export function hasJointLimit(root,bone){const limit=jointLimit(root,bone);return !!limit?.enabled&&AXES.some(a=>limit.bounds?.[a]?.enabled);}
export function setJointLimit(root,bone,{enabled=true,bounds,reference}={}){
 if(!bone?.isBone)throw Error('Select a skeleton joint for the limit.');
 const path=nodePath(root,bone),prior=jointLimit(root,bone),value={version:1,path,name:bone.name,order:'XYZ',enabled,bounds:structuredClone(bounds),reference:reference||prior?.reference||bone.userData.fusion_source_quaternion||[0,0,0,1]};validateJointLimit(value);
 const list=root.userData.fusion_joint_limits||[];if(list.length>=1024&&!prior)throw Error('Character joint-limit count exceeds 1,024.');
 root.userData.fusion_joint_limits=[...list.filter(l=>!samePath(l.path,path)),structuredClone(value)];return value;
}
export function removeJointLimit(root,bone){const path=nodePath(root,bone);root.userData.fusion_joint_limits=(root.userData.fusion_joint_limits||[]).filter(l=>!samePath(l.path,path));}
export function projectJointQuaternion(root,bone,input=bone.quaternion){
 const rotation=quaternion(input.toArray()),limit=jointLimit(root,bone);if(!limit)return {quaternion:rotation,correction:null};validateJointLimit(limit);if(!limit.enabled)return {quaternion:rotation,correction:null};
 const delta=jointReference(root,bone).invert().multiply(rotation),euler=new THREE.Euler().setFromQuaternion(delta,'XYZ'),requested={x:euler.x*DEG,y:euler.y*DEG,z:euler.z*DEG},applied={...requested};let changed=false;
 for(const axis of AXES){const b=limit.bounds[axis];if(b.enabled){applied[axis]=Math.min(b.max,Math.max(b.min,requested[axis]));if(Math.abs(applied[axis]-requested[axis])>1e-7)changed=true;}}
 if(!changed)return {quaternion:rotation,correction:null};
 const projected=new THREE.Quaternion().setFromEuler(new THREE.Euler(applied.x/DEG,applied.y/DEG,applied.z/DEG,'XYZ'));
 return {quaternion:jointReference(root,bone).multiply(projected).normalize(),correction:{joint:bone.name,path:[...limit.path],requested,applied}};
}
export function clampJoint(root,bone){const result=projectJointQuaternion(root,bone);if(!result.correction)return null;bone.quaternion.copy(result.quaternion);bone.updateWorldMatrix(false,true);return result.correction;}
export function validateJointLimits(root){
 const limits=root.userData.fusion_joint_limits||[];if(!Array.isArray(limits)||limits.length>1024)throw Error('Character joint-limit count exceeds 1,024.');
 const seen=new Set(),resolved=[];
 for(const limit of limits){validateJointLimit(limit);const key=limit.path.join('/');if(seen.has(key))throw Error('Duplicate joint limit: '+limit.name);seen.add(key);const bone=pathNode(root,limit.path);if(!bone?.isBone||bone.name!==limit.name)throw Error('Joint hierarchy changed. Recreate the limit for '+limit.name+'.');resolved.push(bone);}
 return resolved;
}
export function enforceJointLimits(root){const resolved=validateJointLimits(root),corrections=[];for(const bone of resolved){const result=clampJoint(root,bone);if(result)corrections.push(result);}const report={constrained:resolved.filter(b=>hasJointLimit(root,b)).length,corrections};reports.set(root,report);return report;}
export function hasSceneJointLimits(scene){let found=false;scene.traverse(n=>{if(n.userData.fusion_joint_limits?.some(l=>l.enabled&&AXES.some(a=>l.bounds?.[a]?.enabled)))found=true;});return found;}
export function jointLimitReport(root){return reports.get(root)||{constrained:validateJointLimits(root).filter(b=>hasJointLimit(root,b)).length,corrections:[]};}
