import {channelId,initializeDeformation,evaluateCharacter} from './deformation.js';

export const MORPH_PRESET_FORMAT='fusion.morph-preset';
export const MORPH_PRESET_VERSION=1;
const LIMITS={bytes:2*1024*1024,controls:16384,vertices:2000000,triangles:2000000};
const HASH=/^[a-f0-9]{64}$/;
const encoder=new TextEncoder();
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const plain=v=>v&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const canonical=id=>channelId(id);
const category=c=>c.category||'/General';
const text=(value,max,field)=>{if(typeof value!=='string'||value.length>max)throw new MorphPresetError('invalid-preset',`Invalid ${field}.`);return value;};
const checkSignal=signal=>{if(signal?.aborted)throw new MorphPresetError('cancelled','Morph preset update cancelled.');};

export class MorphPresetError extends Error {
  constructor(code,message,inspection){super(message);this.name='MorphPresetError';this.code=code;if(inspection)this.inspection=inspection;}
}

function assertPlainJson(value,depth=0){
  if(depth>8)throw new MorphPresetError('invalid-preset','Morph preset nesting exceeds its limit.');
  if(value===null||typeof value==='string'||typeof value==='boolean'||finite(value))return;
  if(Array.isArray(value)){if(value.length>LIMITS.controls)throw new MorphPresetError('invalid-preset','Morph preset collection exceeds its limit.');for(const v of value)assertPlainJson(v,depth+1);return;}
  if(!plain(value))throw new MorphPresetError('invalid-preset','Morph presets must contain plain JSON data.');
  for(const [key,v] of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(key))throw new MorphPresetError('invalid-preset','Morph preset contains a reserved property.');assertPlainJson(v,depth+1);}
}

export function validateMorphPreset(input){
  let value=input;
  if(typeof input==='string'){
    if(encoder.encode(input).length>LIMITS.bytes)throw new MorphPresetError('invalid-preset','Morph preset exceeds the 2 MiB limit.');
    try{value=JSON.parse(input);}catch{throw new MorphPresetError('invalid-preset','Morph preset is not valid JSON.');}
  }
  assertPlainJson(value);
  if(!plain(value)||value.format!==MORPH_PRESET_FORMAT||value.version!==MORPH_PRESET_VERSION)throw new MorphPresetError('unsupported-version','Unsupported Fusion morph preset format or version.');
  if(Object.keys(value).some(key=>!['format','version','name','source','controls'].includes(key)))throw new MorphPresetError('invalid-preset','Morph preset contains an unsupported field.');
  text(value.name,256,'preset name');
  const source=value.source;
  if(!plain(source)||source.algorithm!=='sha256-source-v1'||!['topologyHash','baseHash','morphHash'].every(k=>HASH.test(source[k])))throw new MorphPresetError('invalid-preset','Morph preset has no valid source fingerprint.');
  for(const [key,max] of [['originalVertices',LIMITS.vertices],['mappedVertices',LIMITS.vertices],['triangles',LIMITS.triangles]])if(!Number.isInteger(source[key])||source[key]<1||source[key]>max)throw new MorphPresetError('invalid-preset',`Invalid source ${key}.`);
  if(!Array.isArray(source.morphIds)||!source.morphIds.length||source.morphIds.length>LIMITS.controls)throw new MorphPresetError('invalid-preset','Morph preset has no supported morph identities.');
  const ids=source.morphIds.map(id=>canonical(text(id,4096,'morph ID')));
  if(new Set(ids).size!==ids.length||ids.some((id,i)=>id!==source.morphIds[i]))throw new MorphPresetError('invalid-preset','Source morph IDs must be unique canonical channel IDs.');
  if(!Array.isArray(value.controls)||!value.controls.length||value.controls.length>LIMITS.controls)throw new MorphPresetError('invalid-preset','Morph preset has no valid controls.');
  const seen=new Set();
  for(const control of value.controls){
    if(!plain(control))throw new MorphPresetError('invalid-preset','Morph control must be plain JSON data.');
    const id=canonical(text(control.id,4096,'control ID'));
    if(id!==control.id||seen.has(id))throw new MorphPresetError('invalid-preset','Morph control IDs must be unique canonical channel IDs.');seen.add(id);
    text(control.label,512,'control label');text(control.category,512,'control category');
    if(!finite(control.value)||!finite(control.default)||control.min!==undefined&&!finite(control.min)||control.max!==undefined&&!finite(control.max)||(control.min??-Infinity)>(control.max??Infinity)||control.value<(control.min??-Infinity)||control.value>(control.max??Infinity))throw new MorphPresetError('invalid-preset',`Invalid value or limits for ${id}.`);
    if(Object.keys(control).some(key=>!['id','label','category','value','default','min','max'].includes(key)))throw new MorphPresetError('invalid-preset','Morph control contains an unsupported field.');
  }
  const serialized=JSON.stringify(value);
  if(encoder.encode(serialized).length>LIMITS.bytes)throw new MorphPresetError('invalid-preset','Morph preset exceeds the 2 MiB limit.');
  return JSON.parse(serialized);
}

function getState(root){
  const state=initializeDeformation(root);
  if(!state?.channels?.length||!state.morphs?.length)throw new MorphPresetError('unsupported-character','Select a character with loaded base-resolution morph data.');
  if(state.channels.length>LIMITS.controls)throw new MorphPresetError('unsupported-character','Character control count exceeds the preset limit.');
  return state;
}

function selected(controls,{channelIds,categories}={}){
  const wanted=channelIds===undefined?null:new Set(channelIds.map(canonical)),groups=categories===undefined?null:new Set(categories);
  if(wanted){const available=new Set(controls.map(c=>canonical(c.id)));for(const id of wanted)if(!available.has(id))throw new MorphPresetError('missing-control',`Selected control is not present: ${id}.`);}
  const result=controls.filter(c=>(!wanted||wanted.has(canonical(c.id)))&&(!groups||[...groups].some(g=>category(c)===g||category(c).startsWith(g.replace(/\/$/,'')+'/'))));
  if(!result.length)throw new MorphPresetError('empty-selection','No morph controls match the selected IDs or categories.');return result;
}

// Canonical original IDs and triangle winding ignore primitive order, material splits,
// display names, current pose, and morph influence values. Positions remain rest data.
function fingerprintInput(root){
  const state=getState(root),points=new Map(),faces=[];let mappedVertices=0;
  root.traverse(n=>{
    if(!n.isMesh||n.userData.liveGarment)return;
    const geometry=n.geometry,position=geometry?.attributes.position,source=geometry?.attributes._fusion_source_vertex;
    if(!source){if(geometry?.morphAttributes.position?.length)throw new MorphPresetError('missing-mapping',`Mesh ${n.name||'unnamed'} has morphs without stable source vertex identities. Reimport it with source mapping.`);return;}
    if(!position||source.count!==position.count||source.itemSize!==1)throw new MorphPresetError('invalid-mapping','Character source mapping does not match its base geometry.');
    mappedVertices+=position.count;if(mappedVertices>LIMITS.vertices)throw new MorphPresetError('mesh-limit','Character exceeds the two-million mapped vertex preset limit.');
    for(let i=0;i<source.count;i++){
      const id=source.getX(i),p=[position.getX(i),position.getY(i),position.getZ(i)].map(v=>Object.is(Math.fround(v),-0)?0:Math.fround(v));
      if(!Number.isInteger(id)||id<0||id>=LIMITS.vertices||!p.every(finite))throw new MorphPresetError('invalid-mapping','Character has invalid source identities or nonfinite base positions.');
      const old=points.get(id);
      if(old&&p.some((v,axis)=>v!==old[axis]))throw new MorphPresetError('ambiguous-mapping',`Source vertex ${id} has conflicting base positions. Separate character geometry domains before using presets.`);
      points.set(id,p);
    }
    const index=geometry.index,count=index?.count??position.count;
    if(count%3)throw new MorphPresetError('invalid-mapping','Character topology is not a triangle mesh.');
    for(let i=0;i<count;i+=3){
      const triangle=[];for(let j=0;j<3;j++){const vertex=index?index.getX(i+j):i+j;if(!Number.isInteger(vertex)||vertex<0||vertex>=source.count)throw new MorphPresetError('invalid-mapping','Character contains an out-of-range triangle index.');triangle.push(source.getX(vertex));}
      const start=triangle.indexOf(Math.min(...triangle));faces.push([triangle[start],triangle[(start+1)%3],triangle[(start+2)%3]]);
      if(faces.length>LIMITS.triangles)throw new MorphPresetError('mesh-limit','Character exceeds the two-million triangle preset limit.');
    }
  });
  if(!points.size||!faces.length)throw new MorphPresetError('missing-mapping','Character has no mapped base geometry for safe preset matching.');
  const ids=[...points.keys()].sort((a,b)=>a-b);faces.sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);
  const topology=new ArrayBuffer(8+ids.length*4+faces.length*12),tv=new DataView(topology);tv.setUint32(0,ids.length,true);tv.setUint32(4,faces.length,true);let offset=8;
  for(const id of ids){tv.setUint32(offset,id,true);offset+=4;}for(const face of faces)for(const id of face){tv.setUint32(offset,id,true);offset+=4;}
  const base=new ArrayBuffer(ids.length*16),bv=new DataView(base);offset=0;
  for(const id of ids){bv.setUint32(offset,id,true);offset+=4;for(const value of points.get(id)){bv.setFloat32(offset,value,true);offset+=4;}}
  const morphIds=[...new Set(state.morphs.map(m=>canonical(m.id)))].sort(),morph=encoder.encode(JSON.stringify(morphIds));
  return {topology,base,morph,morphIds,originalVertices:ids.length,mappedVertices,triangles:faces.length};
}

const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
async function identity(input){
  const [topologyHash,baseHash,morphHash]=await Promise.all([digest(input.topology),digest(input.base),digest(input.morph)]);
  return {algorithm:'sha256-source-v1',topologyHash,baseHash,morphHash,originalVertices:input.originalVertices,mappedVertices:input.mappedVertices,triangles:input.triangles,morphIds:input.morphIds};
}
function equalBytes(a,b){if(a.byteLength!==b.byteLength)return false;const av=new Uint8Array(a.buffer||a,a.byteOffset||0,a.byteLength),bv=new Uint8Array(b.buffer||b,b.byteOffset||0,b.byteLength);return av.every((value,i)=>value===bv[i]);}
function sameInput(a,b){return ['topology','base','morph'].every(key=>equalBytes(a[key],b[key]));}

export async function fingerprintCharacter(root){return identity(fingerprintInput(root));}

export async function captureMorphPreset(root,{name='Shaping preset',channelIds,categories}={}){
  const state=getState(root),controls=selected(state.channels,{channelIds,categories}).map(c=>({id:canonical(c.id),label:c.label||c.id,category:category(c),value:c.value??c.default??0,default:c.default??0,...(c.min!==undefined?{min:c.min}:{}),...(c.max!==undefined?{max:c.max}:{})}));
  // Authored control values are captured before formulas and correctives evaluate.
  return validateMorphPreset({format:MORPH_PRESET_FORMAT,version:MORPH_PRESET_VERSION,name,source:await fingerprintCharacter(root),controls});
}

async function inspection(root,input,options){
  const preset=validateMorphPreset(input),snapshot=fingerprintInput(root),target=await identity(snapshot),state=getState(root),targetControls=new Map(state.channels.map(c=>[canonical(c.id),c])),controls=selected(preset.controls,options),diagnostics=[],matched=[],missing=[],outOfRange=[];
  const topologyMatch=preset.source.topologyHash===target.topologyHash,baseMatch=preset.source.baseHash===target.baseHash,morphMatch=preset.source.morphHash===target.morphHash;
  if(!topologyMatch)diagnostics.push({code:'topology-mismatch',message:'Source vertex identities or triangle topology differ. Reimport the matching character base or capture a preset for this character.'});
  if(!baseMatch)diagnostics.push({code:'base-mismatch',message:'Rest geometry differs. Values can produce a different shape; automatic base conversion is unavailable. Use the matching base or author a new preset.'});
  if(!morphMatch)diagnostics.push({code:'morph-set-mismatch',message:'Loaded morph identities differ. Review the exact-ID matches and explicitly accept the matching subset; no name-based conversion is performed.'});
  for(const c of controls){const targetControl=targetControls.get(c.id);if(!targetControl){missing.push({id:c.id,label:c.label});continue;}if(c.value<(targetControl.min??-Infinity)||c.value>(targetControl.max??Infinity)){outOfRange.push({id:c.id,value:c.value,min:targetControl.min??null,max:targetControl.max??null});continue;}matched.push({id:c.id,label:c.label,targetLabel:targetControl.label||targetControl.id,category:c.category,value:c.value,current:targetControl.value??targetControl.default??0});}
  if(missing.length)diagnostics.push({code:'missing-controls',message:`${missing.length} saved control(s) are absent. Review skipped exact IDs before applying a subset.`});
  if(outOfRange.length)diagnostics.push({code:'target-limits',message:`${outOfRange.length} saved control value(s) exceed the current character limits. Edit those values before applying; no silent clamping is performed.`});
  if(!matched.length)diagnostics.push({code:'no-matches',message:'No selected control IDs are supported by this character.'});
  const exact=topologyMatch&&baseMatch&&morphMatch&&!missing.length&&!outOfRange.length&&matched.length>0,requiresExplicitRemap=!morphMatch||missing.length>0;
  const compatible=topologyMatch&&baseMatch&&!outOfRange.length&&matched.length>0;
  return {snapshot,report:{name:preset.name,exact,compatible,requiresExplicitRemap,source:preset.source,target,diagnostics,matched,missing,outOfRange}};
}

export async function inspectMorphPreset(root,preset,options={}){return (await inspection(root,preset,options)).report;}

function commitValues(root,updates){
  const state=getState(root),channels=new Map(state.channels.map(c=>[canonical(c.id),c])),previous=updates.map(({id})=>({channel:channels.get(id),value:channels.get(id)?.value})),influences=[];
  root.traverse(n=>{if(n.isMesh&&n.morphTargetInfluences)influences.push([n,n.morphTargetInfluences.slice()]);});
  const errors=structuredClone(state.errors||[]);
  try{
    for(const {id,value} of updates){const c=channels.get(id);if(!c||!finite(value)||value<(c.min??-Infinity)||value>(c.max??Infinity))throw new MorphPresetError('target-changed',`Control ${id} changed after preset inspection. Inspect it again.`);c.value=value;}
    const report=evaluateCharacter(root);
    if(!report.valid)throw new MorphPresetError('evaluation-failed',`Morph preset dependency evaluation failed: ${report.errors.map(e=>`${e.channel}: ${e.message}`).slice(0,4).join('; ')}`);
    return {applied:updates.length,report};
  }catch(error){
    for(const old of previous)if(old.channel)old.channel.value=old.value;
    for(const [mesh,values] of influences)mesh.morphTargetInfluences.splice(0,mesh.morphTargetInfluences.length,...values);
    state.errors=errors;throw error;
  }
}

export async function applyMorphPreset(root,preset,{acceptExactIdSubset=false,signal,...selection}={}){
  checkSignal(signal);const {report,snapshot}=await inspection(root,preset,selection);checkSignal(signal);
  if(!report.compatible)throw new MorphPresetError('incompatible-preset',report.diagnostics.map(d=>d.message).join(' '),report);
  if(report.requiresExplicitRemap&&!acceptExactIdSubset)throw new MorphPresetError('remap-review-required','Review exact-ID matches and skipped controls, then explicitly accept this subset.',report);
  if(!sameInput(snapshot,fingerprintInput(root)))throw new MorphPresetError('target-changed','Character base changed during preset inspection. Inspect it again.');
  const result=commitValues(root,report.matched);return {...result,inspection:report};
}

export function resetMorphControls(root,{channelIds,categories,signal}={}){
  checkSignal(signal);const updates=selected(getState(root).channels,{channelIds,categories}).map(c=>({id:canonical(c.id),value:c.default??0}));
  return commitValues(root,updates);
}
