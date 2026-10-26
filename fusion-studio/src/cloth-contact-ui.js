import {retainedFinishSource} from './garment-finish-scene.js';
import * as THREE from 'three';
import {clothContactIssues,isClothContactAudit} from './cloth-contacts.js';
import {prepareSurfaceJob,runSurfaceStage} from './surface-jobs.js';
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function clothContactSummary(live){
 const a=live?.metrics?.clothContact;if(!a)return '<p class="microcopy">Cloth-to-cloth contact has not been inspected for this saved result. Use Inspect cloth contacts.</p>';
 if(!isClothContactAudit(a))return '<p class="microcopy">Saved cloth contact inspection is invalid. Inspect or re-drape the garment again.</p>';
 return `<p class="microcopy"><strong>Cloth-to-cloth inspection · ${a.complete?'complete':'incomplete'}</strong><br>${a.crossings} crossing pairs · ${a.coplanarOverlaps} coplanar overlaps<br>${a.clearanceViolations} gap violations · target ${(a.requiredGapM*1000).toFixed(2)} mm<br>Adjacent/sewn neighbourhoods${Number.isFinite(a.localExclusionRadiusM)?` and local surface paths within ${(a.localExclusionRadiusM*1000).toFixed(1)} mm`:""} are excluded. This is a static mesh check.</p>`;
}

function capture(owner){
 const meshes=[];owner.traverse(n=>{if(n.isMesh)meshes.push(n);});if(meshes.length!==1)throw Error('Inspect a single pattern mesh or a linked garment.');
 const mesh=meshes[0],geometry=mesh.geometry,position=geometry.attributes.position,index=geometry.index,retained=retainedFinishSource(mesh);
 if(!position||!index||(retained?retained.positions.length/3>60000||retained.faces.length>100000:position.count>60000||index.count>300000)||index.count%3)throw Error('Contact inspection supports indexed pattern meshes up to 60,000 vertices and 100,000 triangles.');
 mesh.updateWorldMatrix(true,false);
 const local=retained?Array.from({length:retained.positions.length/3},(_,i)=>retained.positions.slice(i*3,i*3+3)):Array.from({length:position.count},(_,i)=>[position.getX(i),position.getY(i),position.getZ(i)]),indices=retained?retained.faces.flat():Array.from(index.array),matrix=mesh.matrixWorld.toArray();
 const positions=local.map(p=>new THREE.Vector3().fromArray(p).applyMatrix4(mesh.matrixWorld).toArray());
 return {mesh,geometry,position,index,matrix,positions,simulationSurface:!!retained,faces:Array.from({length:indices.length/3},(_,i)=>indices.slice(i*3,i*3+3)),signature:JSON.stringify({local,indices,matrix,doc:owner.userData.patternProject})};
}

function highlights(editor,owner,snapshot,audit,ticket){
 editor.clothContactHighlights?.clear();
 const ids=new Set(audit.samples.flatMap(s=>[s.faceA,s.faceB])),points=[];
 for(const face of ids)for(const vertex of snapshot.faces[face])points.push(...snapshot.positions[vertex]);
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
 const material=new THREE.MeshBasicMaterial({color:0xff4a3d,transparent:true,opacity:.65,side:THREE.DoubleSide,depthTest:false,depthWrite:false,fog:false});
 const overlay=new THREE.Mesh(geometry,material);overlay.name='Transient cloth contact inspection';overlay.renderOrder=1000;editor.scene.add(overlay);
 let frame,cleared=false;
 const clear=()=>{if(cleared)return;cleared=true;cancelAnimationFrame(frame);document.removeEventListener('keydown',key);editor.scene.remove(overlay);geometry.dispose();material.dispose();if(editor.clothContactHighlights?.overlay===overlay)delete editor.clothContactHighlights;};
 const key=e=>{if(e.key==='Escape')clear();};document.addEventListener('keydown',key);
 const tick=()=>{snapshot.mesh.updateWorldMatrix(true,false);if(!editor.evaluation.current(ticket)||editor.root.getObjectByProperty('uuid',owner.uuid)!==owner||snapshot.mesh.geometry!==snapshot.geometry||snapshot.geometry.attributes.position!==snapshot.position||snapshot.geometry.index!==snapshot.index||snapshot.position.version!==state.positionVersion||snapshot.index.version!==state.indexVersion||snapshot.mesh.matrixWorld.elements.some((v,i)=>v!==snapshot.matrix[i]))clear();else frame=requestAnimationFrame(tick);};
 const state={overlay,clear,positionVersion:snapshot.position.version,indexVersion:snapshot.index.version};editor.clothContactHighlights=state;frame=requestAnimationFrame(tick);
}

export function registerClothContactOperator({operators,editor,api,setBusy,modal,close}){
 operators.register({id:'hybrid.contact_audit',label:'Inspect cloth contacts',undo:'none',poll:()=>!!editor.selected?.userData.patternProject,execute:async(_,parameters,signal)=>{
  editor.clothContactHighlights?.clear();setBusy(true,'Inspecting cloth contacts…');
  try{
   const owner=editor.root.getObjectByProperty('uuid',parameters.targetId||editor.selected?.uuid);if(!owner?.userData.patternProject)throw Error('Select a pattern garment for contact inspection.');
   const snapshot=capture(owner),doc=structuredClone(owner.userData.patternProject);let ticket;
   const unchanged=()=>{if(ticket&&!editor.evaluation.current(ticket)||editor.root.getObjectByProperty('uuid',owner.uuid)!==owner||capture(owner).signature!==snapshot.signature)throw Error('The garment changed during contact inspection. Run the inspection again.');};
   const audit=await editor.evaluation.run(owner,{inspection:'cloth-contact-v1',signature:snapshot.signature},async(context,evaluationSignal)=>{
    ticket=context;const combined=AbortSignal.any([signal,evaluationSignal]);
    const topology=await prepareSurfaceJob('contactTopology',{doc},{signal:combined,context});unchanged();
    if(topology.vertices!==snapshot.positions.length||topology.faces.length!==snapshot.faces.length||topology.faces.some((t,i)=>t.some((v,j)=>v!==snapshot.faces[i][j])))throw Error('Pattern-to-mesh identities changed. Re-drape the garment before inspecting sewing contact.');
    setBusy(true,'Checking cloth surface…');
    const thickness=owner.userData.liveGarment?.metrics?.clothContact?.requiredGapM/2 || (owner.userData.liveGarment ? .003 : doc.collisionDistance);
    const result=await runSurfaceStage(api,combined,()=>api.geometry('auditClothContacts',{positions:snapshot.positions,faces:snapshot.faces,sewing:topology.sewing,thickness,seamTopology:doc.version===2,context}));unchanged();
    if(!isClothContactAudit(result)||result.samples.some(s=>s.faceA>=snapshot.faces.length||s.faceB>=snapshot.faces.length))throw Error('The geometry core returned an invalid cloth inspection. Run the inspection again.');
    return result;
   });
   const issues=clothContactIssues(audit),minimum=audit.minimumTestedGapM===null?'No non-local gap within the candidate search':(audit.minimumTestedGapM*1000).toFixed(3)+' mm minimum tested gap';
   modal('Cloth-to-cloth inspection',`${snapshot.simulationSurface?'<p class="notice"><strong>Retained simulation surface inspected.</strong> Render thickness and seam-normal finishing are not covered by this contact check.</p>':''}<p><strong>${issues.length?'Needs refinement':'No measured non-adjacent cloth contacts'}</strong></p>${issues.map(i=>`<p>${esc(i)}</p>`).join('')}<p>${audit.crossings} crossing pairs · ${audit.coplanarOverlaps} coplanar overlaps · ${audit.clearanceViolations} clearance violations</p><p>${esc(minimum)}. Required gap: ${(audit.requiredGapM*1000).toFixed(2)} mm, with ${(audit.gapToleranceM*1000).toFixed(3)} mm numerical tolerance.</p><p>${audit.testedPairs.toLocaleString()} candidate face pairs checked; ${audit.adjacentPairs.toLocaleString()} adjacent/sewn pairs excluded. ${(audit.milliseconds/1000).toFixed(3)} seconds native work.</p><p class="microcopy">This static check excludes local/sewn neighbourhoods${Number.isFinite(audit.localExclusionRadiusM)?` and current surface edge paths within ${(audit.localExclusionRadiusM*1000).toFixed(1)} mm`:""}. It does not prove layer ordering, continuous collision or production fabric behaviour. Highlights show up to 32 measured face pairs in the current triangulation; they clear on edits or Escape and are excluded from project/export geometry.</p>`,`${audit.samples.length?'<button id="cloth-contact-show" class="button accent">Show contact faces</button>':''}<button id="cloth-contact-close" class="button subtle">Close</button>`);
   document.querySelector('#cloth-contact-close').onclick=close;
   if(audit.samples.length)document.querySelector('#cloth-contact-show').onclick=()=>{try{unchanged();highlights(editor,owner,snapshot,audit,ticket);close();}catch(error){modal('Inspection expired',`<p>${esc(error.message)}</p>`,'<button id="cloth-contact-close" class="button subtle">Close</button>');document.querySelector('#cloth-contact-close').onclick=close;}};
   return audit;
  }finally{setBusy(false);}
 }});
}
