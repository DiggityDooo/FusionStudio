import * as THREE from 'three';
import {evaluateCreator} from './character-creator.js';
import {channelId,evaluateOperations,evaluateFormulas} from './formula-engine.js';
import {prepareRotationContext,evaluateRotationGraph,commitRotationProposals} from './formula-rotations.js';
import {pathNode} from './rig-paths.js';
export {channelId,evaluateOperations,evaluateFormulas} from './formula-engine.js';
const LIMITS={vertices:2000000,deltas:8000000};
const finite=v=>{if(typeof v!=='number'||!Number.isFinite(v))throw Error('Expected a finite scalar');return v;};
const reports=new WeakMap();
export const deformationReport=root=>reports.get(root);
// Apply sparse deltas by original vertex identity, including UV/material duplicates.
export function deformSparse(base,sourceIds,morphs,values){
  if(base.length%3||sourceIds.length!==base.length/3||sourceIds.length>LIMITS.vertices)throw Error('Invalid sparse deformation shape');
  const result=Float32Array.from(base),map=new Map();let deltaCount=0;
  for(let i=0;i<sourceIds.length;i++){const id=sourceIds[i];if(!Number.isInteger(id)||id<0||id>=LIMITS.vertices)throw Error('Invalid source vertex identity');if(!map.has(id))map.set(id,[]);map.get(id).push(i);}
  for(const m of morphs){const value=finite(values[m.id]??values[channelId(m.id)]??0);deltaCount+=m.deltas.length;if(deltaCount>LIMITS.deltas)throw Error('Sparse delta limit exceeded');
    for(const row of m.deltas){if(row.length!==4||!Number.isInteger(row[0])||row[0]<0)throw Error('Invalid sparse delta');row.slice(1).forEach(finite);if(value)for(const i of map.get(row[0])||[])for(let j=0;j<3;j++)result[i*3+j]+=row[j+1]*value;}
  }
  if(result.some(v=>!Number.isFinite(v)))throw Error('Sparse deformation overflow');return result;
}

function parseMetadata(node){const data=node.userData.dson_deformation;if(!data)return null;try{return typeof data==='string'?JSON.parse(data):data;}catch{throw Error('Invalid DSON deformation metadata');}}
export function initializeDeformation(root){
  if(root.userData.fusion_deformation)return root.userData.fusion_deformation;
  const metas=[];root.traverse(n=>{const m=parseMetadata(n);if(m)metas.push(m);});
  const native=root.userData.dazNative,channels=new Map(),morphs=new Map(),formulas=new Map(),identityErrors=[];
  for(const meta of metas){for(const c of meta.channels||[]){const key=channelId(c.id),old=channels.get(key);if(old?.sourceId&&c.sourceId&&old.sourceId!==c.sourceId)identityErrors.push({channel:key,code:'ambiguous-asset',message:'Equal channel names belong to different source assets. Import the figures independently before editing.'});else channels.set(key,structuredClone(c));}for(const m of meta.morphs||[]){morphs.set(channelId(m.id),{...m,deltas:undefined});channels.set(channelId(m.id),{...channels.get(channelId(m.id)),id:m.id,label:m.label,value:m.value,default:m.default,category:m.category,min:m.min,max:m.max});}for(const f of meta.formulas||[])formulas.set(JSON.stringify(f),f);}
  if(!metas.length&&native)for(const p of native.properties||[]){const c={...p,id:p.name||p.key,default:0,category:'/Imported'};channels.set(channelId(c.id),c);morphs.set(channelId(c.id),c);}
  if(!channels.size&&!formulas.size)return null;
  const state={version:1,channels:[...channels.values()],morphs:[...morphs.values()],formulas:[...formulas.values()],correctives:[],errors:[],...(identityErrors.length?{identityErrors}: {})};root.userData.fusion_deformation=state;return state;
}
export function morphControls(root){const state=initializeDeformation(root);return state?.channels||[];}
export function evaluateCharacter(root){
  if(root.userData.fusion_creator)return evaluateCreator(root);
  const state=initializeDeformation(root);if(!state)return {valid:true,errors:[],warnings:[]};let report;
  try{
    if(state.identityErrors?.length)throw Error(state.identityErrors[0].message);if(!Array.isArray(state.correctives)||state.correctives.length>2048)throw Error('Pose corrective count exceeds 2,048');
    const context=prepareRotationContext(root),channels=[...state.channels,...context.definitions],formulas=state.formulasEnabled===false?[]:state.formulas,inputs=Object.assign(Object.create(null),state.poseInputs||{}),initial=evaluateRotationGraph(context,channels,formulas,inputs),first=initial.report,proposals=initial.proposals,posed=new Map(proposals.map(p=>[p.bone.uuid,p.result])),correctiveErrors=[];
    for(const control of root.userData.fusion_ik||[])if(control.enabled){const end=pathNode(root,control.end);for(let n=end;n&&n!==root;n=n.parent){if(n===end&&!control.keepOrientation)continue;const p=proposals.find(p=>p.bone===n);if(p&&p.authored.clone().normalize().angleTo(p.result.clone().normalize())>1e-6)correctiveErrors.push({channel:p.m.id,code:'ik-driver-conflict',message:'Imported rotation driver also affects an IK-controlled hierarchy. Pause imported drivers or use a separate IK chain.'});}}
    // A corrective feeding a rotation driver would require another pose solve.
    // Reject that feedback/chain explicitly instead of iterating to an unknown pose.
    const reaches=(start,target)=>{const seen=new Set(),todo=[start];while(todo.length){const id=todo.pop();if(id===target)return true;if(seen.has(id))continue;seen.add(id);todo.push(...(first.dependencies[id]||[]));}return false;};
    for(const corrective of state.correctives||[]){
      if(!corrective||!['x','y','z'].includes(corrective.axis)||!Array.isArray(corrective.referenceQuaternion)||corrective.referenceQuaternion.length!==4||!corrective.referenceQuaternion.every(Number.isFinite)||Math.abs(Math.hypot(...corrective.referenceQuaternion)-1)>1e-4||![corrective.start,corrective.end,corrective.strength].every(Number.isFinite)||corrective.start===corrective.end){correctiveErrors.push({channel:corrective?.channel,message:'Invalid authored pose corrective'});continue;}
      const bone=root.getObjectByProperty('uuid',corrective.boneId);if(!bone?.isBone){correctiveErrors.push({channel:corrective.channel,message:'Corrective joint is missing'});continue;}const id=channelId(corrective.channel);
      if((first.outputs||[]).some(output=>/\?rotation\/[xyz]$/.test(output)&&reaches(output,id))){correctiveErrors.push({channel:id,code:'pose-feedback',message:'Pose-dependent corrective feeds a rotation driver. Separate this dependency chain before evaluation.'});continue;}
      const delta=new THREE.Quaternion().fromArray(corrective.referenceQuaternion).invert().multiply(posed.get(bone.uuid)||context.bindings.find(b=>b.bone===bone)?.authored||bone.quaternion),angle=new THREE.Euler().setFromQuaternion(delta,corrective.order||'XYZ')[corrective.axis]*180/Math.PI,weight=Math.max(0,Math.min(1,(angle-corrective.start)/(corrective.end-corrective.start))),c=state.channels.find(c=>channelId(c.id)===id);inputs[id]=(inputs[id]??c?.value??0)+weight*corrective.strength;
    }
    report=state.correctives?.length?evaluateRotationGraph(context,channels,formulas,inputs).report:first;report.errors.push(...correctiveErrors);report.warnings=[];
    const applied=new Set(),defined=new Set(state.channels.map(c=>channelId(c.id))),changes=[];
    root.traverse(n=>{if(!n.isMesh||!n.morphTargetDictionary)return;for(const m of state.morphs){const index=n.morphTargetDictionary[m.targetName||m.label]??n.morphTargetDictionary[m.id],value=report.values[channelId(m.id)];if(index!==undefined&&value!==undefined){if(!Number.isInteger(index)||index<0||index>=n.morphTargetInfluences.length||!Number.isFinite(m.amplitude??1)||(m.amplitude??1)===0)throw Error('Invalid morph target binding: '+m.id);changes.push([n,index,finite(value/(m.amplitude||1))]);applied.add(channelId(m.id));}}});
    const boundRotations=new Set(proposals.flatMap(p=>['x','y','z'].map(a=>p.m.id+'?rotation/'+a)));
    for(const m of state.morphs)if(!applied.has(channelId(m.id))&&report.values[channelId(m.id)]!==undefined)report.warnings.push({channel:m.id,message:'Morph target is absent from the loaded mesh; this control was not applied.'});
    for(const id of report.outputs||[])if(!defined.has(id)&&!applied.has(id)&&!boundRotations.has(id))report.warnings.push({channel:id,message:'Formula output has no supported scene binding; joint transforms and material outputs are not applied for this reference.'});
    report.valid=!report.errors.length;report.complete=report.valid&&!report.warnings.length;report.rotations=proposals.map(p=>({joint:p.bone.name,clamped:!!p.clamped}));report.verifiedRotationFrames=context.bindings.length;
    if(report.valid){commitRotationProposals(context,proposals,state);for(const [mesh,index,value] of changes)mesh.morphTargetInfluences[index]=value;root.traverse(n=>{if(n.isMesh){if(typeof n.computeBoundingBox==='function'){n.boundingBox=null;n.boundingSphere=null;}else{delete n.boundingBox;delete n.boundingSphere;}}});}
  }catch(error){report={valid:false,complete:false,values:{},errors:[{channel:'character',code:'invalid-deformation',message:error.message}],warnings:[],rotations:[]};}
  state.errors=[...report.errors,...report.warnings];reports.set(root,report);return report;
}
export function setMorph(root,id,value){const state=initializeDeformation(root),c=state?.channels.find(c=>channelId(c.id)===channelId(id));if(!c)throw Error('Morph control is not available');const before=c.value;c.value=Math.min(c.max??Infinity,Math.max(c.min??-Infinity,finite(value)));const report=evaluateCharacter(root);if(!report.valid){c.value=before;throw Error('Character dependency failed: '+report.errors.map(e=>e.message).join('; '));}return report;}
export function addPoseCorrective(root,{channel,boneId,axis='x',start=0,end=90,strength=1}){const state=initializeDeformation(root),bone=root.getObjectByProperty('uuid',boneId);if(!state||!bone?.isBone||!['x','y','z'].includes(axis)||start===end||![start,end,strength].every(Number.isFinite)||!state.channels.some(c=>channelId(c.id)===channelId(channel)))throw Error('Invalid pose corrective');const before=[...(state.correctives||[])];if(before.length>=2048)throw Error('Pose corrective count exceeds 2,048');(state.correctives??=[]).push({channel,boneId,axis,start,end,strength,order:'XYZ',referenceQuaternion:bone.quaternion.toArray()});const report=evaluateCharacter(root);if(!report.valid){state.correctives=before;throw Error('Invalid corrective dependency: '+report.errors.map(e=>e.message).join('; '));}return report;}
export function evaluateSceneDeformation(scene,{strict=false}={}){const errors=[];scene.traverse(n=>{if(n.userData.fusion_deformation||n.userData.fusion_creator){const report=evaluateCharacter(n);if(!report.valid)errors.push(...report.errors);}});if(strict&&errors.length)throw Error('Character dependency failed: '+errors.map(e=>e.message).join('; '));}
export function evaluatedCharacterTriangles(root,{maxTriangles=200000}={}){
  const report=evaluateCharacter(root);if(!report.valid)throw Error('Resolve or pause character dependency errors before garment collision evaluation.');root.updateWorldMatrix(true,false);root.updateMatrixWorld(true);const positions=[],triangles=[],point=new THREE.Vector3();
  root.traverseVisible(n=>{if(!n.isMesh||root.userData.fusion_creator&&n.userData.fusion_creator_part!=='body')return;const count=n.geometry.attributes.position.count,index=n.geometry.index,faces=(index?.count||count)/3;if(triangles.length/3+faces>maxTriangles)throw Error('Character collision triangle limit exceeded');const offset=positions.length/3;if(n.isSkinnedMesh)n.skeleton.update();for(let i=0;i<count;i++){n.getVertexPosition(i,point);point.applyMatrix4(n.matrixWorld);positions.push(point.x,point.y,point.z);}for(let i=0;i<(index?.count||count);i++)triangles.push(offset+(index?index.getX(i):i));});
  return {positions,triangles};
}

// Exchange contains the evaluated pose/morph state, not executable or editable
// controller rules. Keep source identities and ordinary live morph targets.
export function bakeCharacterExchange(root){
 if(root.userData.fusion_creator)root.traverse(node=>{if(node.isMesh)node.userData.fusion_render_object_id=node.uuid;});
 root.traverse(node=>{delete node.userData.fusion_creator;delete node.userData.fusion_attachment_key;});
 root.traverse(node=>{
  const raw=node.userData.dson_deformation;if(raw){const meta=typeof raw==='string'?JSON.parse(raw):structuredClone(raw),values=new Map();node.traverse(mesh=>{if(!mesh.isMesh||!mesh.morphTargetDictionary)return;for(const m of meta.morphs||[]){const index=mesh.morphTargetDictionary[m.targetName||m.label]??mesh.morphTargetDictionary[m.id];if(index!==undefined)values.set(channelId(m.id),mesh.morphTargetInfluences[index]*(m.amplitude||1));}});
   meta.formulas=[];meta.bakedDependencies=true;meta.morphs=(meta.morphs||[]).filter(m=>values.has(channelId(m.id))).map(m=>{const copy={...m,value:values.get(channelId(m.id))};delete copy.deltas;return copy;});meta.channels=(meta.channels||[]).filter(c=>values.has(channelId(c.id))).map(c=>({...c,value:values.get(channelId(c.id))}));node.userData.dson_deformation=typeof raw==='string'?JSON.stringify(meta):meta;
  }
  delete node.userData.fusion_deformation;delete node.userData.fusion_dson_rotation;delete node.userData.fusion_dson_channels;
 });
}
