import {previewDrapeSettings} from './drape-preparation.js';
import {applyFabricResponse} from './fabric-materials.js';
import {neutralCharacterMesh,TORSO_LEVELS} from './body-measurements.js';
import {shirtJointsForCharacter,shirtOptions} from './surface-shirt.js';
import {sourcePlacementBody,canonicalPlacementPositions} from './garment-placement.js';
import {triples,validateFittedSurface,validatePanelAttachments} from './surface-fit.js';
import {SURFACE_PROTOCOL_VERSION,validSurfaceContext,matchingSurfaceContext} from './surface-protocol.js';

const active=signal=>{if(signal?.aborted)throw Error('Fitted garment update cancelled.');};
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),n=>n.toString(16).padStart(2,'0')).join('');
const topology=capture=>({bodyId:capture.bodyId,vertices:capture.source.positions.length,triangles:capture.source.triangles});
export async function runSurfaceStage(api,signal,call){active(signal);const cancel=()=>{try{Promise.resolve(api.cancel?.()).catch(()=>{});}catch{}};signal?.addEventListener('abort',cancel,{once:true});try{const value=await call();active(signal);return value;}finally{signal?.removeEventListener('abort',cancel);}}
export function prepareSurfaceJob(action,input,{signal,timeoutMs=20000,context,label='Surface preparation',onStarted}={}){
 if(signal?.aborted)throw Error(label+' cancelled.');
 if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>120000)throw Error('Invalid preparation timeout.');
 if(context!==undefined&&!validSurfaceContext(context))throw Error('Invalid preparation scene identity or revision.');
 return new Promise((resolve,reject)=>{const worker=new Worker(new URL('./surface-preparation-worker.js',import.meta.url),{type:'module'});let done=false,started=false;
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);worker.terminate();error?reject(error):resolve(value);},cancel=()=>finish(Error(label+' cancelled.'));
  const timer=setTimeout(()=>finish(Error(`${label} exceeded ${timeoutMs/1000} seconds. Use a simpler pattern or fitting copy.`)),timeoutMs);
  signal?.addEventListener('abort',cancel,{once:true});worker.onerror=e=>{e.preventDefault?.();finish(Error(label+' failed: '+(e.message||'Worker unavailable.')));};worker.onmessageerror=()=>finish(Error('Could not read the preparation result.'));
  worker.onmessage=({data})=>{if(done)return;if(data?.version!==SURFACE_PROTOCOL_VERSION||!matchingSurfaceContext(context,data.context)){finish(Error('Preparation reply does not match this scene request. Run the operation again.'));return;}if(data.phase==='started'){if(!started){started=true;try{onStarted?.();}catch(error){finish(error);}}return;}if(data.error)finish(Error(String(data.error)));else if(data.result)finish(null,data.result);else finish(Error('Malformed surface preparation result.'));};try{worker.postMessage({version:SURFACE_PROTOCOL_VERSION,action,input,context});}catch(error){finish(error);}if(signal?.aborted)cancel();
 });
}
export async function createFittedSurface(api,character,parameters,{context,signal,prepare=prepareSurfaceJob}={}){
 active(signal);const options=shirtOptions(parameters.options),jointNames=parameters.joints||shirtJointsForCharacter(character),levels=parameters.levels||TORSO_LEVELS;
 const mesh=neutralCharacterMesh(character,{allowTilted:true,jointNames}),capture=sourcePlacementBody(character);active(signal);
 const draft=await prepare('draft',{mesh,options,levels},{signal,context});active(signal);
 const panels=draft.data.groups.map(g=>({id:g.panel,start:g.start/3,count:g.count/3}));
 const flattened=await runSurfaceStage(api,signal,()=>api.job({action:'flattenPanels',name:'Fit and flatten shirt panels',params:{context,surfacePanels:{positions:draft.positions,faces:draft.data.faces,grainCoordinates:Array.from({length:draft.data.uvs.length/2},(_,i)=>draft.data.uvs.slice(i*2,i*2+2)),panels,method:'MINIMUM_STRETCH',iterations:100,body:{positions:capture.source.positions,faces:capture.source.triangles},offset:options.clearance}}}));active(signal);
 const derived=await prepare('derive',{doc:draft.doc,data:draft.data,flattened:flattened.flattened,...(options.neckline==='rounded'?{boundaryOptions:{representation:'curves'}}:{})},{signal,context});active(signal);derived.doc.particleDistance=options.particleDistance;
 const reference=derived.reference,bound=await runSurfaceStage(api,signal,()=>api.geometry('bindGarment',{positions:canonicalPlacementPositions(reference.positions),body:capture.source,bodyId:capture.bodyId,maximumDistance:.2,context}));active(signal);
 const surface={version:1,bodyId:capture.bodyId,topologyHash:await sha(topology(capture)),reference,profile:draft.profile,levels:{...levels},joints:{...jointNames},options,binding:bound.binding,panels:draft.data.groups.map(g=>({id:g.panel,kind:['front','back'].includes(g.panel)?'bodice':'sleeve',offset:reference.panelOffsets[g.panel],indices:[...new Set(draft.data.faces.slice(g.start/3,(g.start+g.count)/3).flat())]})),report:{...derived.report,source:draft.diagnostics,flattening:{method:flattened.flattened.method,milliseconds:flattened.flattened.milliseconds,blender:flattened.flattened.blender}}};
 active(signal);validateFittedSurface(surface);return {doc:derived.doc,surface};
}
export async function prepareFittedDrape(api,base,character,surface,{context,signal,prepare=prepareSurfaceJob,response=null,preview={}}={}){
 active(signal);validateFittedSurface(surface);const solveSettings=previewDrapeSettings(response?{}:preview),capture=sourcePlacementBody(character);
 if(capture.bodyId!==surface.bodyId||await sha(topology(capture))!==surface.topologyHash)throw Error('The fitted body identity or topology changed. Keep this drape and draft a new working copy.');active(signal);
 const neutral=await runSurfaceStage(api,signal,()=>api.geometry('placeGarment',{binding:surface.binding,body:capture.source,bodyId:capture.bodyId,context}));active(signal);
 const mesh={positions:capture.source.positions.flat(),triangles:capture.source.triangles.flat(),measurementAxis:[capture.dimensions.origin[0],capture.dimensions.origin[2]]},input=await prepare('fit',{doc:base,surface,mesh,neutralPositions:neutral.positions},{signal,context});active(signal);
 const restPositions=canonicalPlacementPositions(triples(input.data.positions)),bodyReference={positions:canonicalPlacementPositions(input.flat),triangles:surface.reference.faces};
 const bound=await runSurfaceStage(api,signal,()=>api.geometry('bindGarment',{positions:restPositions,body:bodyReference,bodyId:'fitted-flat-reference',maximumDistance:.05,context}));active(signal);validatePanelAttachments(input.data,surface,bound.binding);
 const attached=await runSurfaceStage(api,signal,()=>api.geometry('placeGarment',{binding:surface.binding,body:{positions:canonicalPlacementPositions(capture.posed.positions),triangles:capture.posed.triangles},bodyId:capture.bodyId,context}));active(signal);
 const placed=await runSurfaceStage(api,signal,()=>api.geometry('placeGarment',{binding:bound.binding,body:{positions:canonicalPlacementPositions(attached.positions),triangles:surface.reference.faces},bodyId:'fitted-flat-reference',context}));active(signal);
 // Rest lengths follow the physical panel size and the character's uniform
 // world scale. Rigid root movement does not affect any rest length.
 const rest=restPositions.map(p=>{const e=capture.worldMatrix;return [e[0]*p[0]+e[4]*p[1]+e[8]*p[2],e[1]*p[0]+e[5]*p[1]+e[9]*p[2],e[2]*p[0]+e[6]*p[1]+e[10]*p[2]];});
 const fabrics={cotton:[1e-7,1e-4],denim:[1e-8,1e-5],silk:[5e-7,1e-3]},[stretch,bend]=fabrics[input.doc.fabric];
 const result={...input,body:capture.dimensions,placement:null,fittedSurface:surface,fittedDiagnostics:{grading:input.grading,offlineLimitSeconds:120,flatBinding:bound.metrics,bodyPlacement:attached.metrics},request:{positions:placed.positions,restPositions:canonicalPlacementPositions(rest),faces:input.data.faces,sewing:input.data.sewing,pins:input.data.pins,colliders:[],triangleCollider:{positions:canonicalPlacementPositions(capture.posed.positions),triangles:capture.posed.triangles},seamTopology:true,solidContact:true,initializeOutside:true,materialCoordinates:Array.from({length:input.data.uvs.length/2},(_,i)=>input.data.uvs.slice(i*2,i*2+2)),fabricCompliance:[stretch,stretch*1.5,stretch*3],friction:.25,triangleSelfCollision:true,steps:solveSettings.steps,iterations:solveSettings.iterations,stretch,bend,thickness:.003,selfCollision:true,executionBudget:'offline'}};
 const scale=Math.hypot(...capture.worldMatrix.slice(0,3));result.request=applyFabricResponse(result.request,response,scale);return result;
}
