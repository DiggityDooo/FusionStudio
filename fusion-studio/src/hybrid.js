import {garmentFinishSettings} from './garment-finishing.js';
import {clothContactIssues} from './cloth-contacts.js';
import {applyGarmentFinishing,captureGarmentSource} from './garment-finish-scene.js';
import {buildDrapeInput,previewDrapeSettings} from './drape-preparation.js';
export {gradePattern} from './drape-preparation.js';
import {fabricResponse,fabricResponseIssues} from './fabric-materials.js';
import {evaluateGraph} from './evaluation.js';
import {evaluateCharacter,evaluatedCharacterTriangles} from './deformation.js';
import * as THREE from 'three';
import {createPatternObject,tshirtPattern,migratePattern} from './patterns.js';
import {createCharacter,POSES} from './character.js';
import {sourcePlacementBody,evaluateSourcePlacement,canonicalPlacementPositions} from './garment-placement.js';
import {createFittedSurface,prepareFittedDrape,runSurfaceStage,prepareSurfaceJob} from './surface-jobs.js';

export const HYBRID_WARNING='Live fit is an experimental static-pose preview. It grades retained panels and re-drapes after body changes. Automatic placement can move initial panel and pin positions outside the imported body; pins stay fixed after that placement. Solid-body recovery assumes a closed body surface; open or overlapping parts can give ambiguous inside/outside results. Detailed fitting checks cloth faces as well as vertices. Difficult folds, seams and layered contact can still fail. Inspect fit diagnostics before rendering. Original panels and seams remain editable; final output is the displayed drape.';
export function liveTshirtPattern(){const doc=tshirtPattern();for(const panel of doc.panels){panel.pins=[5,9];panel.points[4][1]=.67;panel.points[11][1]=.67;panel.points[6]=[.13,.65];panel.points[9]=[-.13,.65];panel.points[7]=[.10,.59];panel.points[8]=[-.10,.59];panel.position[1]=.85;}return migratePattern(doc);}
export function characterColliders(character){
  if(!character.userData.collisionShapes)throw Error('Rebuild this legacy Fusion character before linking a garment.');
  character.updateWorldMatrix(true,true);let skin;character.traverse(n=>{if(n.isSkinnedMesh&&!skin)skin=n;});
  if(!skin)throw Error('The character skeleton is missing.');
  return character.userData.collisionShapes.map(shape=>{
    const i=skin.skeleton.bones.findIndex(b=>b.name===shape.bone);if(i<0)throw Error('Collision joint is missing.');
    const deformation=skin.skeleton.bones[i].matrixWorld.clone().multiply(skin.skeleton.boneInverses[i]);
    const rotation=new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().fromArray(shape.rotation));
    const basis=deformation.clone().multiply(rotation),axes=[],radii=[];
    for(let j=0;j<3;j++){const axis=new THREE.Vector3().setFromMatrixColumn(basis,j);radii.push(shape.radii[j]*axis.length());axes.push(axis.normalize().toArray());}
    return {center:new THREE.Vector3().fromArray(shape.center).applyMatrix4(deformation).toArray(),axes,radii,halfLength:shape.halfLength==null?null:shape.halfLength*radii[1]/shape.radii[1]};
  });
}
export function captureDrapeInputs(base,character,settings={}){
  if(settings.placement!==undefined&&!['surface','legacy'].includes(settings.placement))throw Error('Unknown garment placement mode.');
  const imported=!character.userData.character,capture=imported&&settings.placement==='surface'?sourcePlacementBody(character):null;
  const body=structuredClone(character.userData.character||capture?.dimensions||importedMeasurements(character)),scale=body.height/1.8;
  character.updateWorldMatrix(true,true);
  // Intrinsic height is already graded; retain only the remaining root transform.
  const world=imported?(capture?character.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(...body.origin)):new THREE.Matrix4().makeTranslation(...body.origin)):character.matrixWorld.clone().multiply(new THREE.Matrix4().makeScale(1/scale,1/scale,1/scale));
  const detailed=imported||base.version===2,evaluated=detailed?evaluatedCharacterTriangles(character):null,triangleCollider=evaluated?{positions:triples(evaluated.positions),triangles:triples(evaluated.triangles)}:undefined;
  if(capture)triangleCollider.positions=canonicalPlacementPositions(triangleCollider.positions);
  return {imported,capture,body,world:world.toArray(),triangleCollider,colliders:imported?[]:characterColliders(character)};
}
// Re-drape initialization: carry the previous drape with the body's own skinning.
// Each cloth vertex follows the delta of its nearest body vertex (bind -> current pose),
// so posing or reshaping starts the solver from cloth already on the body instead of
// the neutral arms-down wrap, which posed colliders otherwise tear apart.
export function poseInitialPositions(prior,character,requestPositions){
  const mesh=prior?.children?.[0],priorPos=mesh?.geometry?.attributes?.position;
  if(!priorPos||!Array.isArray(requestPositions)||!requestPositions.length)return null;
  let skin=null;character.traverse(n=>{if(n.isSkinnedMesh&&!skin)skin=n;});
  if(!skin?.skeleton||typeof skin.getVertexPosition!=='function')return null;
  character.updateWorldMatrix(true,true);mesh.updateWorldMatrix(true,true);
  const neutral=skin.geometry.attributes.position,tmp=new THREE.Vector3(),pw=new THREE.Vector3();
  const priorWorld=[];for(let i=0;i<priorPos.count;i++)priorWorld.push(new THREE.Vector3().fromBufferAttribute(priorPos,i).applyMatrix4(mesh.matrixWorld));
  let binding=prior.userData.liveGarment?.poseBinding;
  if(!Array.isArray(binding)||binding.length!==priorPos.count){
    const neutralWorld=[];for(let j=0;j<neutral.count;j++)neutralWorld.push(new THREE.Vector3().fromBufferAttribute(neutral,j).applyMatrix4(skin.matrixWorld));
    binding=new Array(priorPos.count);
    for(let i=0;i<priorPos.count;i++){let best=0,bd=Infinity;for(let j=0;j<neutralWorld.length;j++){const d=priorWorld[i].distanceToSquared(neutralWorld[j]);if(d<bd){bd=d;best=j;}}binding[i]=best;}
  }
  const posed=new Map(),bind=new Map();
  for(const j of new Set(binding)){bind.set(j,new THREE.Vector3().fromBufferAttribute(neutral,j).applyMatrix4(skin.matrixWorld));skin.getVertexPosition(j,tmp);posed.set(j,tmp.clone().applyMatrix4(skin.matrixWorld));}
  const deltas=priorWorld.map((p,i)=>{const j=binding[i];return tmp.copy(posed.get(j)).sub(bind.get(j)).clone();});
  const positions=requestPositions.map(r=>{
    let best=0,bd=Infinity;for(let i=0;i<priorWorld.length;i++){const d=(r[0]-priorWorld[i].x)**2+(r[1]-priorWorld[i].y)**2+(r[2]-priorWorld[i].z)**2;if(d<bd){bd=d;best=i;}}
    const delta=deltas[best];return [r[0]+delta.x,r[1]+delta.y,r[2]+delta.z];
  });
  return {positions,binding};
}
// Synchronous reference entry point for numeric/process tests. UI jobs use the worker.
export function drapeRequest(base,character,settings={}){return buildDrapeInput(base,captureDrapeInputs(base,character,settings),settings);}
export async function generateGarment(api,base,character,prior=null,evaluation=null,external={}){
  const settings=structuredClone(prior?.userData.liveGarment?.settings||{}),surface=prior?.userData.liveGarment?.fittedSurface;
  const finishing=prior?.userData.liveGarment?.finish?garmentFinishSettings(prior.userData.liveGarment.finish):null,captured=surface?null:captureDrapeInputs(base,character,settings),operationSignal=evaluation?.editor?.operators?.running?.controller?.signal||external.signal;
  const compute=async(context,evaluationSignal)=>{const signal=operationSignal&&evaluationSignal?AbortSignal.any([operationSignal,evaluationSignal]):operationSignal||evaluationSignal;
    if(signal?.aborted)throw Error('Garment update cancelled.');
    const input=surface?await prepareFittedDrape(api,base,character,surface,{context,signal,response:settings.fabricResponse,preview:settings}):await (external.prepare||prepareSurfaceJob)('drapeInput',{base,captured,settings},{context,signal,label:'Garment preparation'}),{placement,request}=input;
    const prepared=placement?await evaluateSourcePlacement(api,placement,prior?.userData.liveGarment?.placement,{context,signal}):null;
    const transferred=!prepared&&!surface&&prior?.userData?.liveGarment?poseInitialPositions(prior,character,request.positions):null;
    if(signal?.aborted)throw Error('Garment update cancelled.');const solve=()=>api.geometry('drapeGarment',{...request,...(prepared?{positions:prepared.positions}:transferred?{positions:transferred.positions}: {}),context});const result=(surface||settings.fabricResponse)?await runSurfaceStage(api,signal,solve):await solve();
    if(signal?.aborted)throw Error('Garment update cancelled.');
    if(!Array.isArray(result.positions)||result.positions.length!==input.data.positions.length/3||result.positions.some(p=>!Array.isArray(p)||p.length!==3||p.some(v=>!Number.isFinite(v))))throw Error('The geometry core returned an invalid drape.');
    let finished=null;if(finishing?.enabled){const raw={positions:Array.from(new Float32Array(result.positions.flat())),uvs:Array.from(new Float32Array(input.data.uvs)),faces:input.data.faces,sewing:input.data.sewing,groups:[]};finished=await (external.prepare||prepareSurfaceJob)('garmentFinish',{doc:input.doc,source:raw,settings:finishing},{context,signal,label:'Garment finishing'});}
    return {result,prepared,input,finished,transferred};
  };
  const {result,prepared,input,finished,transferred}=evaluation?await evaluation.run(character,surface?{base,settings,finishing,surface,body:sourcePlacementBody(character)}:{base,settings,finishing,captured},compute):await compute(external.context);
  const {doc,data,body,placement,request}=input;

  const group=createPatternObject(doc,data),mesh=group.children[0];
  mesh.geometry.setAttribute('position',new THREE.Float32BufferAttribute(result.positions.flat(),3));mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();
  const strain=new Float32Array(result.positions.length),pointDistance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
  for(const face of data.faces)for(let i=0;i<3;i++){const a=face[i],b=face[(i+1)%3],value=Math.abs(pointDistance(result.positions[a],result.positions[b])/pointDistance(request.restPositions[a],request.restPositions[b])-1);strain[a]=Math.max(strain[a],value);strain[b]=Math.max(strain[b],value);}
  const colors=[];for(const value of strain){const color=new THREE.Color().setHSL((1-Math.min(1,value/.25))*.66,1,.5);colors.push(color.r,color.g,color.b);}mesh.geometry.userData.strainColors=colors;
  const issues=[];
  if(result.metrics.seamGapAfter>.005)issues.push(`Mean seam gap ${(result.metrics.seamGapAfter*1000).toFixed(1)} mm exceeds 5 mm.`);
  if(result.metrics.triangleClearanceViolations>0)issues.push(`${result.metrics.triangleClearanceViolations} triangle clearance violations remain.`);
  if(result.metrics.bodyFaceIntersections>0)issues.push(`${result.metrics.bodyFaceIntersections} cloth faces intersect the body.`);
  if(result.metrics.bodyInsideVertices>0)issues.push(`${result.metrics.bodyInsideVertices} cloth vertices remain inside the body.`);
  if(result.metrics.proxyPenetrations>0)issues.push(`${result.metrics.proxyPenetrations} proxy penetrations remain.`);
  if(result.metrics.maxStrain>.5)issues.push(`Maximum local strain ${(result.metrics.maxStrain*100).toFixed(0)}% exceeds 50%.`);
  if(data.quality?.minAngleDegrees<20)issues.push(`Minimum triangle angle ${data.quality.minAngleDegrees.toFixed(1)}° is below the 20° target.`);
  issues.push(...fabricResponseIssues(result.metrics,settings.fabricResponse));
  if(!result.metrics.physicalFabric)issues.push(...clothContactIssues(result.metrics.clothContact));
  group.name=prior?.name||'Live T-shirt';group.userData.liveGarment={version:1,characterId:character.userData.fusion_id,basePattern:structuredClone(base),settings:{steps:request.steps,iterations:request.iterations,...(placement?{placement:'surface'}: {}),...(surface?{executionBudget:'offline'}:{}),...(settings.fabricResponse?{fabricResponse:fabricResponse(settings.fabricResponse)}:{})},body:structuredClone(body),quality:data.quality||null,metrics:result.metrics,solver:result.solver,...(prepared?{placement:prepared.cache,placementDiagnostics:prepared.diagnostics}: {})};
  if(surface){group.userData.liveGarment.fittedSurface=structuredClone(surface);group.userData.liveGarment.fittedDiagnostics=input.fittedDiagnostics;}
  if(transferred)group.userData.liveGarment.poseBinding=transferred.binding;
  group.userData.liveGarment.diagnostics={converged:issues.length===0,issues};
  group.userData.simulationApplied=true;group.userData.source='Fusion live garment';
  if(prior?.uuid){group.uuid=prior.uuid;group.userData.fusion_id=prior.userData.fusion_id;group.visible=prior.visible;}
  if(finishing){if(finishing.enabled)applyGarmentFinishing(group,captureGarmentSource(group),finished,finishing);else group.userData.liveGarment.finish=finishing;}
  if(prior?.userData.liveGarment?.heatmap)setStrainView(group,true);
  return group;
}
export function setStrainView(group,on){const mesh=group.children[0];if(on&&!group.userData.liveGarment.heatmap)mesh.userData.fitBaseColor=mesh.material.color.getHex();if(on){if(!mesh.geometry.userData.strainColors)throw Error('Re-drape this garment to compute strain colors.');mesh.geometry.setAttribute('color',new THREE.Float32BufferAttribute(mesh.geometry.userData.strainColors,3));}else mesh.geometry.deleteAttribute('color');mesh.material.vertexColors=on;mesh.material.color.setHex(on?0xffffff:(mesh.userData.fitBaseColor??parseInt(group.userData.patternProject.color.slice(1),16)));mesh.material.needsUpdate=true;group.userData.liveGarment.heatmap=on;}
export function linkedGarments(editor,character){const id=character?.userData.fusion_id||character?.uuid;if(!id)return [];return editor.root.children.filter(g=>!!g.userData.liveGarment&&g.userData.liveGarment.characterId===id);}
export async function refreshGarments(editor,api,character){
  const garments=linkedGarments(editor,character),replacements=[];if(!garments.length)return replacements;
  const nodes=[{id:'body',evaluate:()=>{evaluateCharacter(character);return character;}}];
  for(const old of garments){nodes.push({id:old.uuid,dependencies:['body'],evaluate:async values=>{
    old.updateMatrix();if(!old.matrix.equals(new THREE.Matrix4()))throw Error('Reset the linked garment object transform before re-fitting it.');
    const next=await generateGarment(api,old.userData.liveGarment.basePattern,values.get('body'),old,editor.evaluation);replacements.push([old,next]);return next;
  }});}await evaluateGraph(nodes);
  for(const [old,next] of replacements){editor.root.remove(old);editor.root.add(next);if(editor.selected===old)editor.select(next);}
  return replacements;
}
export async function hybridTransaction(editor,run,{signal=editor.operators?.running?.controller.signal}={}){
  if(editor.batching)throw Error('Finish the current scene operation before changing the garment.');
  if(signal?.aborted)throw Error('Garment update cancelled.');
  if(editor.timeline)editor.timeline.playing=false;
  editor.ensureHistory();const scene=editor.root,before=structuredClone(editor.serialize()),selected=editor.selected?.uuid,frame=editor.timeline?.frame;editor.batching=true;
  try{const result=await run();if(editor.root!==scene)throw Error('Scene changed during garment evaluation.');if(signal?.aborted)throw Error('Garment update cancelled.');editor.batching=false;editor.commit();return result;}
  catch(error){if(editor.root===scene){await editor.restore(before);if(editor.timeline&&frame!==undefined)editor.timeline.frame=frame;editor.select(editor.root.getObjectByProperty('uuid',selected)||null);}throw error;}
  finally{editor.batching=false;}
}
export async function createHybrid(editor,api){
  return hybridTransaction(editor,async()=>{
    const character=createCharacter({},POSES['T pose']);character.name='Live-fit character';editor.root.add(character);
    const garment=await generateGarment(api,liveTshirtPattern(),character,null,editor.evaluation);editor.root.add(garment);editor.select(character);editor.frame(character);return {character,garment};
  });
}

function triples(values){return Array.from({length:values.length/3},(_,i)=>values.slice(i*3,i*3+3));}
export function importedMeasurements(character){const data=evaluatedCharacterTriangles(character),p=triples(data.positions),box=new THREE.Box3().setFromPoints(p.map(v=>new THREE.Vector3(...v))),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());if(size.y<1.2||size.y>2.2)throw Error('Character height must be 1.2–2.2 m for automatic garment grading. Adjust source units first.');const band=p.filter(v=>v[1]>box.min.y+size.y*.55&&v[1]<box.min.y+size.y*.75&&Math.abs(v[0]-center.x)<size.y*.18);const width=band.length?Math.max(...band.map(v=>v[0]))-Math.min(...band.map(v=>v[0])):.5;const ratio=Math.max(.65,Math.min(1.5,width/.56));return {height:size.y,shoulders:ratio,waist:ratio,hips:ratio,chest:Math.max(.7,Math.min(1.5,size.z/.32)),origin:[center.x,box.min.y,center.z]};}
export async function linkGarment(editor,api,character,base,prior=null){return hybridTransaction(editor,async()=>{if(!character.userData.fusion_id)character.userData.fusion_id=character.uuid;const next=await generateGarment(api,base,character,prior,editor.evaluation);if(prior)editor.root.remove(prior);editor.root.add(next);editor.select(next);return next;});}

export async function draftFittedGarment(editor,api,character,parameters){
 return hybridTransaction(editor,async()=>{
  if(character.userData.character)throw Error('Surface drafting requires an imported skinned body with reviewed bind joints.');
  if(!character.userData.fusion_id)character.userData.fusion_id=character.uuid;
  const operationSignal=editor.operators?.running?.controller.signal,preview=previewDrapeSettings(parameters.preview);
  const garment=await editor.evaluation.run(character,{parameters,body:sourcePlacementBody(character)},async(context,evaluationSignal)=>{
   const signal=operationSignal?AbortSignal.any([operationSignal,evaluationSignal]):evaluationSignal;
   const {doc,surface}=await createFittedSurface(api,character,parameters,{context,signal});
   const next=await generateGarment(api,doc,character,{userData:{liveGarment:{settings:{...preview,executionBudget:'offline'},fittedSurface:surface}}},null,{context,signal});
   next.name='Surface-fitted shirt';return next;
  });
  editor.root.add(garment);editor.select(garment);return garment;
 });
}
