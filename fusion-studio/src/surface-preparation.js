import {buildFinishedSurface,validateFinishSource} from './garment-finishing.js';
import {buildDrapeInput} from './drape-preparation.js';
import {buildPattern} from './patterns.js';
import {draftSurfaceShirt} from './surface-shirt.js';
import {deriveSurfacePattern} from './surface-patterns.js';
import {fittedPatternInput} from './surface-fit.js';
import {SURFACE_PROTOCOL_VERSION,validSurfaceContext} from './surface-protocol.js';
export function surfacePreparation(action,input){
 if(action==='drapeInput')return buildDrapeInput(input.base,input.captured,input.settings);
 if(action==='garmentFinish'){
  validateFinishSource(input.source);const data=buildPattern(input.doc);if(data.positions.length!==input.source.positions.length||data.faces.length!==input.source.faces.length||data.faces.some((t,i)=>t.some((v,j)=>v!==input.source.faces[i][j])))throw Error('The retained pattern and simulation topology differ. Re-drape before finishing.');
  const source={...input.source,sewing:data.sewing};return {...buildFinishedSurface(source,input.settings),sewing:data.sewing};
 }
 if(action==='patternMesh')return buildPattern(input.doc);
 if(action==='contactTopology'){const data=buildPattern(input.doc);return {vertices:data.positions.length/3,faces:data.faces,sewing:data.sewing};}
 if(action==='draft')return draftSurfaceShirt(input.mesh,input.mesh.anchors,input.options,input.levels);
 if(action==='derive')return deriveSurfacePattern(input.doc,input.data,input.flattened,input.boundaryOptions);
 if(action==='fit')return fittedPatternInput(input.doc,input.surface,input.mesh,{neutralPositions:input.neutralPositions});
 throw Error('Unknown surface preparation operation.');
}

export function surfacePreparationReply(request,onStarted){
 const context=request?.context;
 try{
  if(request?.version!==SURFACE_PROTOCOL_VERSION)throw Error('Unsupported preparation protocol version.');
  if(context!==undefined&&!validSurfaceContext(context))throw Error('Invalid preparation scene identity or revision.');
  onStarted?.({version:SURFACE_PROTOCOL_VERSION,context,phase:'started'});
  return {version:SURFACE_PROTOCOL_VERSION,context,result:surfacePreparation(request.action,request.input)};
 }catch(error){return {version:SURFACE_PROTOCOL_VERSION,context,error:error.message};}
}
