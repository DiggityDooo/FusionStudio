import {neutralCharacterMesh} from './body-measurements.js';

const rounded=v=>Math.round(v*1e7)/1e7;
const triples=p=>Array.from({length:p.length/3},(_,i)=>p.slice(i*3,i*3+3));
// Canonicalize only simulation input, leaving source/viewport geometry intact.
// This prevents roundtrip matrix noise from choosing different contact branches.
export const canonicalPlacementPositions=positions=>positions.map(p=>p.map(rounded));
export function sourcePlacementBody(character){
  const mesh=neutralCharacterMesh(character,{includePosed:true,allowTilted:true});
  if(mesh.positions.length/3>200000)throw Error('Pose-aware garment placement supports at most 200,000 body vertices. Use a fitting working copy.');
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<mesh.positions.length;i++){const a=i%3;min[a]=Math.min(min[a],mesh.positions[i]);max[a]=Math.max(max[a],mesh.positions[i]);}
  const height=rounded(max[1]-min[1]);if(height<1.2||height>2.2)throw Error('Character source height must be 1.2–2.2 m for automatic garment grading. Adjust source units first.');
  const origin=[rounded(mesh.measurementAxis?.[0]??(min[0]+max[0])/2),rounded(min[1]),rounded(mesh.measurementAxis?.[1]??(min[2]+max[2])/2)];let low=Infinity,high=-Infinity;
  for(let i=0;i<mesh.positions.length;i+=3){const p=mesh.positions;if(p[i+1]>min[1]+height*.55&&p[i+1]<min[1]+height*.75&&Math.abs(p[i]-origin[0])<height*.18){low=Math.min(low,p[i]);high=Math.max(high,p[i]);}}
  const ratio=Math.max(.65,Math.min(1.5,rounded(high>low?high-low:.5)/.56)),depth=rounded(max[2]-min[2]);
  const dimensions={height,shoulders:ratio,waist:ratio,hips:ratio,chest:Math.max(.7,Math.min(1.5,depth/.32)),origin};
  return {dimensions,source:{positions:triples(mesh.positions.map(rounded)),triangles:triples(mesh.triangles)},posed:{positions:triples(mesh.posedPositions),triangles:triples(mesh.triangles)},bodyId:character.userData.fusion_id||character.uuid,worldMatrix:mesh.worldMatrix};
}

function checkPositions(positions,n){if(!Array.isArray(positions)||positions.length!==n||positions.some(p=>!Array.isArray(p)||p.length!==3||p.some(v=>!Number.isFinite(v)||Math.abs(v)>100)))throw Error('The geometry core returned invalid garment placement.');}
export async function evaluateSourcePlacement(api,{capture,positions,faces,sewing,pins},prior,{context,signal}={}){
  const sourcePositions=positions.map(p=>p.map(rounded)),signature={version:1,bodyId:capture.bodyId,body:capture.source,positions:sourcePositions,faces,sewing,pins};
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(signature)))),v=>v.toString(16).padStart(2,'0')).join('');
  const active=()=>{if(signal?.aborted)throw Error('Garment placement cancelled.');};active();
  let binding,bindMetrics=null,reused=false;
  if(prior?.version===1&&prior.inputHash===hash){binding=prior.binding;reused=true;}
  else {const result=await api.geometry('bindGarment',{positions:sourcePositions,body:capture.source,bodyId:capture.bodyId,maximumDistance:.5,context});active();if(result.binding?.version!==1||result.binding.attachments?.length!==positions.length)throw Error('The geometry core returned invalid garment attachments.');binding=result.binding;bindMetrics=result.metrics;}
  const result=await api.geometry('placeGarment',{binding,body:{...capture.posed,positions:canonicalPlacementPositions(capture.posed.positions)},bodyId:capture.bodyId,context});active();checkPositions(result.positions,positions.length);
  return {positions:result.positions,cache:{version:1,inputHash:hash,binding},diagnostics:{method:'Fusion surface attachment 1',reusedBinding:reused,bind:bindMetrics,place:result.metrics,sourceQuantization:.0000001}};
}
