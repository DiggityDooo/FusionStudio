import * as THREE from 'three';
import {evaluateCreator} from './character-creator.js';
import {nodePath,pathNode} from './rig-paths.js';
import {projectJointQuaternion} from './joint-limits.js';
import {channelId,evaluateFormulas} from './formula-engine.js';
const AXES=['x','y','z'],ORDERS=['XYZ','XZY','YXZ','YZX','ZXY','ZYX'],DEG=180/Math.PI;
const keyOf=(root,bone)=>nodePath(root,bone).join('/');
const q=value=>{if(!Array.isArray(value)||value.length!==4||!value.every(Number.isFinite)||Math.abs(Math.hypot(...value)-1)>1e-4)throw Error('Formula rotation needs a finite unit quaternion');return new THREE.Quaternion().fromArray(value);};
const same=(a,b,epsilon=1e-8)=>Math.min(Math.max(...a.toArray().map((v,i)=>Math.abs(v-b.toArray()[i]))),Math.max(...a.toArray().map((v,i)=>Math.abs(v+b.toArray()[i]))))<=epsilon;
function metadata(bone){const raw=bone.userData.fusion_dson_rotation;if(raw===undefined)return null;if(typeof raw==='string'&&raw.length>16384)throw Error('Rotation-frame metadata exceeds its limit');let m;try{m=typeof raw==='string'?JSON.parse(raw):raw;}catch{throw Error('Invalid rotation-frame JSON');}if(!m||m.version!==1||typeof m.id!=='string'||!m.id||m.id.length>256||!ORDERS.includes(m.order)||!Array.isArray(m.source)||m.source.length!==3||!m.source.every(v=>Number.isFinite(v)&&Math.abs(v)<=1e6)||typeof m.unitScale!=='boolean'||(m.aliases!==undefined&&(!Array.isArray(m.aliases)||m.aliases.length>256||m.aliases.some(a=>typeof a!=='string'||a.length>4096))))throw Error('Unsupported formula rotation-frame metadata');q(m.rest);q(m.basis);q(m.imported);return m;}
export function validateFormulaRotations(root){
 const cache=root.userData.fusion_deformation?.rotationState;if(cache!==undefined){if(!cache||Array.isArray(cache)||typeof cache!=='object'||Object.keys(cache).length>2048)throw Error('Invalid authored formula pose cache');for(const [key,c] of Object.entries(cache)){const path=key.split('/').map(Number),bone=pathNode(root,path);if(!key||!bone?.isBone||bone.name!==c?.name)throw Error('Formula pose hierarchy changed');q(c.authored);q(c.evaluated);if(c.reference!==undefined)q(c.reference);}}
 let count=0;root.traverse(n=>{if(n.isBone&&n.userData.fusion_dson_rotation!==undefined){if(++count>2048)throw Error('Formula rotation-frame count exceeds 2,048');metadata(n);}});
}
export function authoredQuaternion(root,bone){const c=root.userData.fusion_deformation?.rotationState?.[keyOf(root,bone)];return c&&same(bone.quaternion,q(c.evaluated))?q(c.authored):bone.quaternion.clone();}
export function restoreAuthoredRotations(root){const state=root.userData.fusion_deformation,cache=state?.rotationState;if(!cache)return;for(const [key,c] of Object.entries(cache)){const bone=pathNode(root,key.split('/').map(Number));if(bone?.isBone&&bone.name===c.name&&same(bone.quaternion,q(c.evaluated)))bone.quaternion.copy(q(c.authored));}delete state.rotationState;root.updateWorldMatrix(true,true);}
export function prepareRotationContext(root){
 validateFormulaRotations(root);const definitions=[],bindings=[],unsupported=[],ids=new Set();
 root.traverse(bone=>{if(!bone.isBone)return;const m=metadata(bone);if(!m)return;const key=keyOf(root,bone),reference=bone.userData.fusion_source_quaternion||root.userData.fusion_deformation?.rotationState?.[key]?.reference||bone.quaternion.toArray(),valid=m.unitScale&&same(q(reference).normalize(),q(m.imported).normalize(),1e-5)&&bone.scale.toArray().every(v=>Math.abs(v-1)<1e-6),authored=authoredQuaternion(root,bone),basis=q(m.basis).normalize(),rest=q(m.rest).normalize();
  if(!valid){unsupported.push({channel:m.id,message:'Rotation frame or unit scale is not verified; reimport an editable source or keep this joint manual.'});return;}
  const local=basis.clone().invert().multiply(rest.clone().invert()).multiply(authored.clone().normalize()).multiply(basis),euler=new THREE.Euler().setFromQuaternion(local,m.order.split('').reverse().join('')),binding={bone,m,key,authored,basis,rest,reference,order:euler.order,source:{x:euler.x*DEG,y:euler.y*DEG,z:euler.z*DEG}};
  for(const axis of AXES){const id=m.id+'?rotation/'+axis;if(ids.has(id))throw Error('Ambiguous formula joint identity: '+m.id);ids.add(id);definitions.push({id,value:binding.source[axis],strictReferences:true,aliases:[...(m.aliases||[]).filter(a=>channelId(a)===id)]});}bindings.push(binding);
 });return {root,definitions,bindings,unsupported};
}
export function rotationProposals(context,report){
 const outputs=new Set(report.outputs||[]),proposals=[];for(const b of context.bindings){const ids=AXES.map(a=>b.m.id+'?rotation/'+a);if(!ids.some(id=>outputs.has(id)))continue;const angles=ids.map(id=>report.values[id]);if(!angles.every(Number.isFinite))continue;if(angles.some(v=>Math.abs(v)>360000))throw Error('Driven joint rotation exceeds 1,000 turns: '+b.m.id);const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(...angles.map(v=>v/DEG),b.order)),result=b.rest.clone().multiply(b.basis).multiply(rotation).multiply(b.basis.clone().invert()).normalize(),bounded=projectJointQuaternion(context.root,b.bone,result);if(same(b.bone.quaternion,bounded.quaternion,1e-12))bounded.quaternion.copy(b.bone.quaternion);proposals.push({...b,result:bounded.quaternion,clamped:bounded.correction});}
 return proposals;
}
export function evaluateRotationGraph(context,channels,formulas,inputs){
 let forced=new Map();for(let pass=0;pass<32;pass++){
  const report=evaluateFormulas(channels,formulas,inputs,{forced});report.constraintPasses=pass+1;if(!report.valid)return {report,proposals:[]};const raw=rotationProposals(context,{...report,values:report.rawValues}),next=new Map();
  for(const p of raw)if(p.clamped){const local=p.basis.clone().invert().multiply(p.rest.clone().invert()).multiply(p.result.clone().normalize()).multiply(p.basis),angles=new THREE.Euler().setFromQuaternion(local,p.order);for(const axis of AXES)next.set(p.m.id+'?rotation/'+axis,angles[axis]*DEG);}
  if(next.size===forced.size&&[...next].every(([k,v])=>Math.abs(v-forced.get(k))<1e-6)){const proposals=rotationProposals(context,report);for(const p of proposals)p.clamped=raw.find(r=>r.key===p.key)?.clamped||null;return {report,proposals};}forced=next;
 }
 return {report:{values:{},outputs:[],dependencies:{},valid:false,errors:[{channel:'rotation limits',code:'constraint-feedback',message:'Rotation constraints did not stabilize within 32 dependency passes. Separate this driver/constraint chain.'}],constraintPasses:32},proposals:[]};
}

export function capturePoseState(scene){const nodes=[];scene.traverse(n=>nodes.push({node:n,position:n.position.clone(),quaternion:n.quaternion.clone(),scale:n.scale.clone(),morph:n.morphTargetInfluences?[...n.morphTargetInfluences]:null,creator:n.userData.fusion_creator?structuredClone(n.userData.fusion_creator.recipe):null,controls:structuredClone(n.userData.fusion_ik),channels:n.userData.fusion_deformation?.channels.map(c=>c.value),rotationState:structuredClone(n.userData.fusion_deformation?.rotationState)}));return nodes;}
export function restorePoseState(nodes){for(const s of nodes){const n=s.node;n.position.copy(s.position);n.quaternion.copy(s.quaternion);n.scale.copy(s.scale);if(s.morph)n.morphTargetInfluences=[...s.morph];if(s.creator)n.userData.fusion_creator.recipe=structuredClone(s.creator);if(s.controls)n.userData.fusion_ik=s.controls;if(s.channels)n.userData.fusion_deformation.channels.forEach((c,i)=>c.value=s.channels[i]);if(n.userData.fusion_deformation){if(s.rotationState)n.userData.fusion_deformation.rotationState=s.rotationState;else delete n.userData.fusion_deformation.rotationState;}}for(const s of nodes)if(s.creator)evaluateCreator(s.node);nodes[0]?.node.updateWorldMatrix(true,true);}
export function commitRotationProposals(context,proposals,state){
 for(const b of context.bindings)if(!b.bone.userData.fusion_source_quaternion)b.bone.userData.fusion_source_quaternion=[...b.reference];
 const next={},driven=new Set(proposals.map(p=>p.key));for(const [key,c] of Object.entries(state.rotationState||{})){if(driven.has(key))continue;const bone=pathNode(context.root,key.split('/').map(Number));if(bone&&same(bone.quaternion,q(c.evaluated)))bone.quaternion.copy(q(c.authored));}
 for(const p of proposals){p.bone.quaternion.copy(p.result);next[p.key]={name:p.bone.name,authored:p.authored.toArray(),evaluated:p.result.toArray(),reference:p.reference};}if(Object.keys(next).length)state.rotationState=next;else delete state.rotationState;context.root.updateWorldMatrix(true,true);
}
