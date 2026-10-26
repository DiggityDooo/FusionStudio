import * as THREE from 'three';
import {nodePath,pathNode,bonesOf} from './rig-paths.js';
import {hasJointLimit,clampJoint,enforceJointLimits} from './joint-limits.js';
import {evaluateSceneDeformation} from './deformation.js';
import {restoreAuthoredRotations,authoredQuaternion,capturePoseState,restorePoseState} from './formula-rotations.js';
export {nodePath,pathNode,bonesOf} from './rig-paths.js';
const V=()=>new THREE.Vector3(),Q=()=>new THREE.Quaternion();
function resolve(root,control){const end=pathNode(root,control.end),links=control.chain.map(p=>pathNode(root,p));if(!end?.isBone||links.some(n=>!n?.isBone)||links.some((n,i)=>(i?links[i-1]:end).parent!==n))throw Error('IK joint hierarchy changed. Recreate this control.');return {end,links};}
function uniformScale(node){for(let n=node;n;n=n.parent){const s=n.scale;if(s.x<=0||s.y<=0||s.z<=0||Math.abs(s.x-s.y)>1e-5||Math.abs(s.x-s.z)>1e-5)throw Error('IK requires positive, uniform scale on the joint hierarchy. Keep the rig source and correct its scale before adding IK.');}}
export function createIK(root,end,count=2){
 if(!end?.isBone||!Number.isInteger(count)||count<2||count>8)throw Error('Choose an end joint and a chain length from 2 to 8.');
 const links=[];let bone=end;for(let i=0;i<count;i++){bone=bone.parent;if(!bone?.isBone)throw Error('This end joint does not have that many bone parents.');links.push(bone);}
 uniformScale(end);root.updateWorldMatrix(true,true);
 const length=links.reduce((sum,n,i)=>sum+n.getWorldPosition(V()).distanceTo((i?links[i-1]:end).getWorldPosition(V())),0);
 if(length<1e-5)throw Error('The selected IK chain has no usable length.');
 if(count===2&&links.some((n,i)=>n.getWorldPosition(V()).distanceTo((i?links[i-1]:end).getWorldPosition(V()))<1e-5))throw Error('This chain contains a zero-length twist joint. Include more parent joints to use the longer-chain solver.');
 for(const existing of root.userData.fusion_ik||[])if(existing.enabled&&[...existing.chain,...(existing.keepOrientation?[existing.end]:[])].some(path=>[...links,end].includes(pathNode(root,path))))throw Error('An enabled IK control already drives one of these joints. Disable it before adding an overlapping chain.');
 const endWorld=end.getWorldPosition(V()),rootWorld=links.at(-1).getWorldPosition(V()),middle=links[0].getWorldPosition(V()),axis=endWorld.clone().sub(rootWorld).normalize();
 let bend=middle.clone().sub(rootWorld).addScaledVector(axis,-middle.clone().sub(rootWorld).dot(axis));
 if(bend.length()<1e-5){bend.set(0,0,1).addScaledVector(axis,-axis.z);if(bend.length()<1e-5)bend.set(1,0,0).addScaledVector(axis,-axis.x);}
 const pole=root.worldToLocal(middle.clone().addScaledVector(bend.normalize(),length*.7));
 return {version:1,id:THREE.MathUtils.generateUUID(),name:end.name+' IK',enabled:true,end:nodePath(root,end),chain:links.map(n=>nodePath(root,n)),base:links.map(n=>authoredQuaternion(root,n).toArray()),target:root.worldToLocal(endWorld).toArray(),pole:pole.toArray(),keepOrientation:true,orientation:root.getWorldQuaternion(Q()).invert().multiply(end.getWorldQuaternion(Q())).toArray()};
}
function rotateWorld(bone,from,to){if(from.lengthSq()<1e-16||to.lengthSq()<1e-16)return;const delta=Q().setFromUnitVectors(from.normalize(),to.normalize()),parent=bone.parent.getWorldQuaternion(Q());bone.quaternion.copy(parent.clone().invert().multiply(delta).multiply(parent).multiply(bone.quaternion)).normalize();bone.updateWorldMatrix(false,true);}
export function solveIK(root,control){
 if(!control.enabled)return {distance:0,clamped:false};
 if(control.version!==1||!Array.isArray(control.chain)||control.chain.length<2||control.chain.length>8||!Array.isArray(control.base)||control.base.length!==control.chain.length)throw Error('Unsupported IK control.');
 for(const point of [control.target,control.pole])if(!Array.isArray(point)||point.length!==3||point.some(v=>!Number.isFinite(v)||Math.abs(v)>10000))throw Error('IK positions must be finite and within 10,000 meters.');
 if(control.base.some(q=>!Array.isArray(q)||q.length!==4||q.some(v=>!Number.isFinite(v))))throw Error('Invalid IK rest rotations.');
 if(control.keepOrientation&&(!Array.isArray(control.orientation)||control.orientation.length!==4||control.orientation.some(v=>!Number.isFinite(v))))throw Error('Invalid IK end orientation.');
 const {end,links}=resolve(root,control);uniformScale(end);
 links.forEach((n,i)=>{n.quaternion.fromArray(control.base[i]);clampJoint(root,n);});root.updateWorldMatrix(true,true);
 const target=root.localToWorld(V().fromArray(control.target)),pole=root.localToWorld(V().fromArray(control.pole)),start=links.at(-1).getWorldPosition(V());
 let clamped=false;
 if(links.length===2){
  const upper=links[1],lower=links[0],a=upper.getWorldPosition(V()),b=lower.getWorldPosition(V()),c=end.getWorldPosition(V()),l1=a.distanceTo(b),l2=b.distanceTo(c),delta=target.clone().sub(a),distance=delta.length();
  if(l1<1e-7||l2<1e-7)throw Error('IK needs two nonzero bone segments.');
  const d=THREE.MathUtils.clamp(distance,Math.abs(l1-l2)+1e-7,l1+l2-1e-7);clamped=Math.abs(d-distance)>1e-5;
  const direction=distance>1e-7?delta.divideScalar(distance):c.clone().sub(a).normalize();if(direction.lengthSq()<1e-8)direction.set(1,0,0);
  let bend=pole.clone().sub(a);bend.addScaledVector(direction,-bend.dot(direction));if(bend.lengthSq()<1e-12){bend=b.clone().sub(a);bend.addScaledVector(direction,-bend.dot(direction));}if(bend.lengthSq()<1e-12){bend.set(Math.abs(direction.x)<.8?1:0,Math.abs(direction.x)<.8?0:1,0);bend.addScaledVector(direction,-bend.dot(direction));}bend.normalize();
  const along=(l1*l1-l2*l2+d*d)/(2*d),height=Math.sqrt(Math.max(0,l1*l1-along*along)),joint=a.clone().addScaledVector(direction,along).addScaledVector(bend,height),tip=a.clone().addScaledVector(direction,d);
  rotateWorld(upper,b.clone().sub(a),joint.clone().sub(a));const now=lower.getWorldPosition(V());rotateWorld(lower,end.getWorldPosition(V()).sub(now),tip.clone().sub(now));
 }else{
  for(let iteration=0;iteration<80;iteration++){if(end.getWorldPosition(V()).distanceTo(target)<1e-5)break;for(const link of links){const position=link.getWorldPosition(V());rotateWorld(link,end.getWorldPosition(V()).sub(position),target.clone().sub(position));clampJoint(root,link);}}
 }
 const limitedJoints=links.filter(n=>hasJointLimit(root,n));let iterations=0;
 if(limitedJoints.length){
  links.forEach(n=>clampJoint(root,n));let best=end.getWorldPosition(V()).distanceToSquared(target),pose=links.map(n=>n.quaternion.clone());
  for(;iterations<120&&best>1e-10;iterations++){
   for(const link of links){const position=link.getWorldPosition(V());rotateWorld(link,end.getWorldPosition(V()).sub(position),target.clone().sub(position));clampJoint(root,link);}
   const error=end.getWorldPosition(V()).distanceToSquared(target);if(error<best){best=error;pose=links.map(n=>n.quaternion.clone());}
  }
  links.forEach((n,i)=>n.quaternion.copy(pose[i]));root.updateWorldMatrix(true,true);
 }
 if(control.keepOrientation){if(!Array.isArray(control.orientation)||control.orientation.length!==4||control.orientation.some(v=>!Number.isFinite(v)))throw Error('Invalid IK end orientation.');end.quaternion.copy(end.parent.getWorldQuaternion(Q()).invert().multiply(root.getWorldQuaternion(Q())).multiply(Q().fromArray(control.orientation)));end.updateWorldMatrix(false,true);}
 clampJoint(root,end);
 const distance=end.getWorldPosition(V()).distanceTo(target);return {distance,clamped:clamped||distance>1e-3,limited:limitedJoints.length>0||hasJointLimit(root,end),limitedJoints:limitedJoints.map(n=>n.name),iterations,reach:start.distanceTo(end.getWorldPosition(V()))};
}
export function solveSceneIK(scene){const results=[];scene.traverse(root=>{restoreAuthoredRotations(root);if(root.userData.fusion_joint_limits)enforceJointLimits(root);const driven=new Set();for(const c of root.userData.fusion_ik||[])if(c.enabled)for(const link of [...resolve(root,c).links,...(c.keepOrientation?[resolve(root,c).end]:[])]){if(driven.has(link))throw Error('Enabled IK chains overlap. Disable the other control first.');driven.add(link);}for(const control of root.userData.fusion_ik||[])if(control.enabled)results.push({root,control,...solveIK(root,control)});});evaluateSceneDeformation(scene,{strict:true});return results;}
export function hasSceneIK(scene){let found=false;scene.traverse(n=>{if(n.userData.fusion_ik?.some(c=>c.enabled))found=true;});return found;}
export function validateIKScales(scene){scene.traverse(root=>{for(const c of root.userData.fusion_ik||[])if(c.enabled)uniformScale(resolve(root,c).end);});}

export class IKHandles{
 constructor(editor){this.editor=editor;this.owner=null;this.controlId=null;this.kind='target';this.marker=new THREE.Mesh(new THREE.OctahedronGeometry(.035),new THREE.MeshBasicMaterial({color:0x71dbef,depthTest:false}));this.marker.renderOrder=10;this.marker.visible=false;editor.scene.add(this.marker);}
 get control(){return this.owner?.userData.fusion_ik?.find(c=>c.id===this.controlId);}
 get active(){return !!this.control&&this.control.enabled;}
 attach(owner,id,kind='target'){this.detach();this.owner=owner;this.controlId=id;this.kind=kind;if(!this.active)return;this.sync();this.marker.visible=true;this.editor.transform.setMode('translate');this.editor.transform.attach(this.marker);this.skeleton=new THREE.SkeletonHelper(owner);this.skeleton.material.depthTest=false;this.skeleton.renderOrder=9;this.editor.scene.add(this.skeleton);}
 detach(){this.editor.transform.detach();if(this.skeleton){this.editor.scene.remove(this.skeleton);this.skeleton.geometry.dispose();this.skeleton.material.dispose();this.skeleton=null;}this.marker.visible=false;this.owner=null;this.controlId=null;}
 sync(){if(this.active&&!this.editor.transform.dragging){this.owner.updateWorldMatrix(true,true);this.marker.position.copy(this.owner.localToWorld(V().fromArray(this.control[this.kind])));}}
 preview(){if(!this.active)return;const before=capturePoseState(this.owner);try{restoreAuthoredRotations(this.owner);this.control[this.kind]=this.owner.worldToLocal(this.marker.position.clone()).toArray();const result=solveIK(this.owner,this.control);evaluateSceneDeformation(this.owner,{strict:true});this.editor.change('ik-preview',result);return result;}catch(error){restorePoseState(before);throw error;}}
}
