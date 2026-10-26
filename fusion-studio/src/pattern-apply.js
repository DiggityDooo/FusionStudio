import {createPatternObject} from './patterns.js';
import {prepareSurfaceJob} from './surface-jobs.js';
import {hybridTransaction} from './hybrid.js';

function validateMesh(data){
 const n=data?.positions?.length/3;
 if(!Number.isInteger(n)||n<3||n>600000||!Array.isArray(data.positions)||data.positions.some(v=>!Number.isFinite(v)||Math.abs(v)>100)||!Array.isArray(data.uvs)||data.uvs.length!==n*2||data.uvs.some(v=>!Number.isFinite(v)||Math.abs(v)>100)||!Array.isArray(data.faces)||!data.faces.length||data.faces.length>200000||data.faces.some(t=>!Array.isArray(t)||t.length!==3||t[0]===t[1]||t[1]===t[2]||t[2]===t[0]||t.some(i=>!Number.isSafeInteger(i)||i<0||i>=n)))throw Error('Pattern meshing returned invalid geometry. Keep the previous pattern and try again.');
 const q=data.quality;
 if(q&&(q.triangles!==data.faces.length||q.vertices!==n||!Number.isFinite(q.minAngleDegrees)||q.minAngleDegrees<0||q.minAngleDegrees>60.0001))throw Error('Pattern meshing returned invalid quality diagnostics.');
}
const priorState=old=>old?JSON.stringify({name:old.name,visible:old.visible,position:old.position.toArray(),quaternion:old.quaternion.toArray(),scale:old.scale.toArray(),doc:old.userData.patternProject,baked:old.userData.simulationApplied}):null;

export function registerPatternApply({operators,editor,setBusy,prepare=prepareSurfaceJob}){
 operators.register({id:'cloth.apply_pattern',hidden:true,label:'Apply garment pattern',undo:'snapshot',validate:p=>{
  if(!p.doc||typeof p.doc!=='object'||Array.isArray(p.doc)||(p.targetId!=null&&(typeof p.targetId!=='string'||p.targetId.length>200)))throw Error('Choose a valid authored pattern document.');
  return {doc:structuredClone(p.doc),targetId:p.targetId||null};
 },execute:async(_,p,signal)=>{
  const root=editor.root,old=p.targetId?root.getObjectByProperty('uuid',p.targetId):null;
  if(p.targetId&&(!old?.userData.patternProject||old.parent!==root||old.userData.liveGarment))throw Error('Choose an authored flat pattern. Linked garments must use Apply & Re-drape.');
  const before=priorState(old);let ticket;setBusy(true,'Meshing garment panels…');
  try{
   const data=await editor.evaluation.run(old||root,{kind:'pattern-mesh',doc:p.doc,targetId:p.targetId,prior:before},async(context,evaluationSignal)=>{
    ticket=context;return prepare('patternMesh',{doc:p.doc},{context,signal:AbortSignal.any([signal,evaluationSignal]),label:'Pattern meshing',onStarted:()=>{if(operators.running?.id==='cloth.apply_pattern')operators.running.phase='meshing';}});
   });
   if(signal.aborted||!editor.evaluation.current(ticket)||editor.root!==root||old&&(root.getObjectByProperty('uuid',old.uuid)!==old||old.parent!==root||priorState(old)!==before))throw Error('The scene or pattern changed during meshing. Apply the pattern again.');
   validateMesh(data);const next=createPatternObject(p.doc,data);if(data.quality)next.userData.patternMeshQuality=structuredClone(data.quality);
   await hybridTransaction(editor,()=>{
    if(old){next.position.copy(old.position);next.quaternion.copy(old.quaternion);next.scale.copy(old.scale);next.name=old.name;
     if(old.userData.simulationApplied){old.visible=false;next.name+=' pattern';}
     else{next.uuid=old.uuid;next.visible=old.visible;if(old.userData.fusion_id){next.userData.fusion_id=old.userData.fusion_id;next.traverse(n=>{if(n.userData.fusion_cloth)n.userData.fusion_id=old.userData.fusion_id;});}root.remove(old);}
    }
    root.add(next);editor.select(next);return next;
   },{signal});
   editor.frame(next);return next;
  }finally{setBusy(false);}
 }});
}
