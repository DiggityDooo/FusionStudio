import * as THREE from 'three';
import {resolvedTrack,validateAnimationKeys} from './animation-data.js';
export {applyAnimClip,planAnimClip,mergeAnimationKeys} from './animation-data.js';

export const INTERP_MODES=['linear','constant','bezier','spline','stepped'];
export const LOOP_MODES=['once','loop','pingpong'];

export function ease(u,mode='linear',handles){
 if(!Number.isFinite(u))return 0;u=Math.min(1,Math.max(0,u));
 if(mode==='constant'||mode==='stepped')return 0;
 if(mode==='linear')return u;
 if(mode==='spline')return u*u*(3-2*u);
 // Bezier: cubic ease with optional tangent handles in [0,1] domain (defaults = smooth ease).
 const h0=handles?.out??[.33,0],h1=handles?.in??[.66,1];
 const cx=3*h0[0],bx=3*(h1[0]-h0[0])-cx,ax=1-cx-bx;
 const cy=3*h0[1],by=3*(h1[1]-h0[1])-cy,ay=1-cy-by;
 let t=u;for(let i=0;i<5;i++){const x=((ax*t+bx)*t+cx)*t-u,dx=3*ax*t*t+2*bx*t+cx;if(Math.abs(dx)<1e-8)break;t-=x/dx;}
 t=Math.min(1,Math.max(0,t));return ((ay*t+by)*t+cy)*t;
}

export function sampleSegment(before,after,frame,{channelInterp}={}){
 if(!before||!after)return {t:0,a:before,b:after};
 if(before.frame===after.frame)return {t:0,a:before,b:after};
 const mode=channelInterp||before.interp||'linear';
 if(mode==='stepped'||mode==='constant')return {t:frame>=after.frame?1:0,a:before,b:after};
 const u=(frame-before.frame)/(after.frame-before.frame);
 return {t:ease(u,mode,before.handles),a:before,b:after};
}

export function dopeSheet(keys){
 const rows=new Map();
 for(const key of keys||[])for(const [id,track] of Object.entries(key.tracks||{})){
  let row=rows.get(id);if(!row){row={id,frames:[]};rows.set(id,row);}
  row.frames.push({frame:key.frame,interp:key.interp||track.interp||'linear',hasMorph:!!track.morph,hasIk:!!track.ik?.length});
 }
 for(const row of rows.values())row.frames.sort((a,b)=>a.frame-b.frame);
 return [...rows.values()];
}

export function fcurves(keys,objectId,{property='position',index=0}={}){
 const points=[];
 for(const key of keys||[]){const track=key.tracks?.[objectId];if(!track?.[property])continue;
  const values=track[property],curve=resolvedTrack(key,objectId);points.push({frame:key.frame,value:values[index],interp:curve.interp,handles:curve.handles});}
 points.sort((a,b)=>a.frame-b.frame);return points;
}

export function sampleFcurve(points,frame){
 if(!points.length)return null;if(points.length===1||frame<=points[0].frame)return points[0].value;
 if(frame>=points.at(-1).frame)return points.at(-1).value;
 const after=points.find(p=>p.frame>=frame),before=[...points].reverse().find(p=>p.frame<=frame)||points[0];
 if(!after||before===after)return before.value;
 const {t}=sampleSegment(before,after,frame,{channelInterp:before.interp});
 return before.value+(after.value-before.value)*t;
}

export function reduceKeys(keys,{tolerance=.001}={}){
 if(!Number.isFinite(tolerance)||tolerance<0)throw Error('Reduction tolerance must be ≥ 0.');
 validateAnimationKeys(keys);if(keys.length<3)return structuredClone(keys);
 const source=[...keys].sort((a,b)=>a.frame-b.frame),kept=new Set([0,source.length-1]);
 // Keep unknown channels and nonlinear boundaries. Simplify only intervals
 // verified against EVERY original sample, avoiding accumulated greedy error.
 const valueError=(a,b,c,u)=>{
  if(typeof a==='number'&&typeof b==='number'&&typeof c==='number')return Math.abs(b-(a+(c-a)*u));
  if(typeof a==='boolean'||typeof b==='boolean'||typeof c==='boolean')return a===b&&b===c?0:Infinity;
  if(Array.isArray(a)&&Array.isArray(b)&&Array.isArray(c)&&a.length===b.length&&b.length===c.length)return Math.max(0,...b.map((v,i)=>valueError(a[i],v,c[i],u)));
  if(a&&b&&c&&typeof a==='object'&&typeof b==='object'&&typeof c==='object'){
   const names=Object.keys(b);if([a,c].some(v=>Object.keys(v).length!==names.length||names.some(k=>!Object.hasOwn(v,k))))return Infinity;
   return Math.max(0,...names.map(k=>valueError(a[k],b[k],c[k],u)));
  }
  return a===b&&b===c?0:Infinity;
 };
 const trackError=(a,b,c,u)=>{
  const known=new Set(['position','scale','quaternion','morph','channels','creator','ik','interp','handles']);
  if([a,b,c].some(t=>Object.keys(t).some(k=>!known.has(k))))return Infinity;
  let error=0;
  for(const prop of ['position','scale','morph','channels','creator','ik'])error=Math.max(error,valueError(a[prop],b[prop],c[prop],u));
  const pred=new THREE.Quaternion().fromArray(a.quaternion).slerp(new THREE.Quaternion().fromArray(c.quaternion),u);
  return Math.max(error,pred.angleTo(new THREE.Quaternion().fromArray(b.quaternion)));
 };
 const ids=new Set(source.flatMap(k=>Object.keys(k.tracks)));let work=0;
 for(const id of ids){
  const samples=source.map((k,index)=>({key:k,index,track:k.tracks[id]?resolvedTrack(k,id):null})).filter(k=>k.track),required=new Set([0,samples.length-1]);
  for(let i=0;i<samples.length-1;i++)if(samples[i].track.interp!=='linear'){required.add(i);required.add(i+1);}
  const anchors=[...required].sort((a,b)=>a-b),pending=anchors.slice(1).map((b,i)=>[anchors[i],b]);
  while(pending.length){const [a,c]=pending.pop();let error=-1,split=-1;
   for(let b=a+1;b<c;b++){
    if(++work>2000000)throw Error('Key reduction exceeds two million comparisons. Reduce a shorter clip.');
    const u=(samples[b].key.frame-samples[a].key.frame)/(samples[c].key.frame-samples[a].key.frame),e=trackError(samples[a].track,samples[b].track,samples[c].track,u);
    if(e>error){error=e;split=b;}
   }
   if(error>tolerance){required.add(split);pending.push([a,split],[split,c]);}
  }
  for(const i of required)kept.add(samples[i].index);
 }
 return source.filter((_,i)=>kept.has(i)).map(k=>structuredClone(k));
}

export function retimeKeys(keys,{scale=1,origin=1}={}){
 if(!Number.isFinite(scale)||scale<=0||scale>100)throw Error('Retime scale must be in (0, 100].');
 if(!Number.isInteger(origin)||origin<1)throw Error('Retime origin must be a frame ≥ 1.');
 const result=(keys||[]).map(k=>{const frame=Math.max(1,Math.round(origin+(k.frame-origin)*scale));return {...structuredClone(k),frame};}).sort((a,b)=>a.frame-b.frame);validateAnimationKeys(result);return result;
}

export function stretchRange(keys,{start,end,newEnd}={}){
 if(![start,end,newEnd].every(Number.isInteger)||end<=start||newEnd<=start)throw Error('Invalid stretch range.');
 const scale=(newEnd-start)/(end-start);
 const result=(keys||[]).map(k=>{
  if(k.frame<start)return structuredClone(k);
  if(k.frame>end)return {...structuredClone(k),frame:newEnd+(k.frame-end)};
  return {...structuredClone(k),frame:Math.round(start+(k.frame-start)*scale)};
 }).sort((a,b)=>a.frame-b.frame);validateAnimationKeys(result);return result;
}

export function mapLoopFrame(frame,start,end,mode='loop',pingDir=1){
 if(![frame,start,end].every(Number.isFinite)||end<start||!LOOP_MODES.includes(mode))throw Error('Invalid playback range or loop mode.');
 const span=end-start+1;if(end===start)return {frame:start,pingDir:1};
 if(mode==='once')return {frame:Math.min(end,Math.max(start,frame)),pingDir:1};
 if(mode==='loop'){const f=((frame-start)%span+span)%span+start;return {frame:f,pingDir:1};}
 // pingpong
 if(frame>=start&&frame<=end)return {frame,pingDir};
 const width=end-start,phase=((frame-start)%(2*width)+2*width)%(2*width);
 return {frame:start+(phase<=width?phase:2*width-phase),pingDir:pingDir*(phase<width?1:-1)};
}

export function nlaState(root){return root.userData.fusion_nla||={version:1,tracks:[]};}
export function addNlaTrack(root,name='Track'){
 const nla=nlaState(root),track={id:THREE.MathUtils.generateUUID(),name:String(name).slice(0,64),muted:false,clips:[]};
 nla.tracks.push(track);return track;
}
export function addNlaClip(track,{name='Clip',start=1,end=24,sourceStart=1,sourceEnd=24,blend=1}={}){
 if(!track)throw Error('NLA track missing.');
 if(![start,end,sourceStart,sourceEnd].every(Number.isInteger)||end<start||sourceEnd<sourceStart)throw Error('Invalid NLA clip range.');
 if(!Number.isFinite(blend)||blend<0||blend>1)throw Error('NLA blend must be 0–1.');
 const clip={id:THREE.MathUtils.generateUUID(),name:String(name).slice(0,64),start,end,sourceStart,sourceEnd,blend,muted:false};
 track.clips.push(clip);return clip;
}
/** Map global frame through unmuted NLA strips to a source timeline frame (last strip wins). */
export function nlaSourceFrame(nla,frame){
 if(!nla?.tracks?.length)return frame;
 let mapped=frame;
 for(const track of nla.tracks){if(track.muted)continue;for(const clip of track.clips){if(clip.muted||frame<clip.start||frame>clip.end)continue;
  const u=(frame-clip.start)/Math.max(1,clip.end-clip.start);mapped=Math.round(clip.sourceStart+u*(clip.sourceEnd-clip.sourceStart));}}
 return mapped;
}

export function motionPath(sampleFn,{start=1,end=24,object}={}){
 if(!object||typeof sampleFn!=='function')throw Error('Motion path needs an object and sampler.');
 if(!Number.isInteger(start)||!Number.isInteger(end)||end<start||end-start>5000)throw Error('Motion path range invalid.');
 const points=[];for(let f=start;f<=end;f++){sampleFn(f);object.updateWorldMatrix(true,true);points.push(object.getWorldPosition(new THREE.Vector3()).clone());}
 const geom=new THREE.BufferGeometry().setFromPoints(points);const line=new THREE.Line(geom,new THREE.LineBasicMaterial({color:0xffaa33}));
 line.name='Motion path';line.userData={fusion_kind:'motion_path',start,end,target:object.uuid};return line;
}

export function onionFrames(frame,{before=2,after=2}={}){
 const frames=[];for(let i=before;i>=1;i--)frames.push(frame-i);frames.push(frame);for(let i=1;i<=after;i++)frames.push(frame+i);return frames;
}

export function animEvents(root){return root.userData.fusion_anim_events||=[];}
export function addAnimEvent(root,{frame,name,payload=null}={}){
 if(!Number.isInteger(frame)||frame<1)throw Error('Event frame must be ≥ 1.');
 const label=String(name||'').trim().slice(0,64);if(!label)throw Error('Event name required.');
 const list=root.userData.fusion_anim_events||=[];const event={id:THREE.MathUtils.generateUUID(),frame,name:label,payload};
 list.push(event);list.sort((a,b)=>a.frame-b.frame||a.name.localeCompare(b.name));return event;
}
export function eventsAt(root,frame){return animEvents(root).filter(e=>e.frame===frame);}

export function followPath(object,curve,{frame=1,start=1,end=120,align=true}={}){
 if(!object||!curve?.getPointAt)throw Error('Follow path needs an object and a curve.');
 if(end<=start)throw Error('Follow path range invalid.');
 const u=Math.min(1,Math.max(0,(frame-start)/(end-start))),point=curve.getPointAt(u),tangent=curve.getTangentAt(u);
 object.position.copy(point);if(align&&tangent.lengthSq()>1e-10)object.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),tangent.clone().normalize());
 return object;
}

export function createPathCurve(points){
 if(!Array.isArray(points)||points.length<2||points.length>4096||points.some(p=>!(Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)||p?.isVector3&&p.toArray().every(Number.isFinite))))throw Error('Path needs 2–4,096 finite XYZ points.');
 return new THREE.CatmullRomCurve3(points.map(p=>Array.isArray(p)?new THREE.Vector3().fromArray(p):p.clone()),false,'catmullrom',.5);
}

export function setFollowPath(object,points,{start=1,end=120,align=true}={}){
 const curve=createPathCurve(points);if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end<=start||end>1000000||typeof align!=='boolean')throw Error('Follow path needs a valid frame range and alignment choice.');
 object.userData.fusion_follow_path={version:1,points:curve.points.map(p=>p.toArray()),start,end,align};return object.userData.fusion_follow_path;
}
export function validateFollowPath(input){
 if(!input?.points)return;const holder={userData:{}};setFollowPath(holder,input.points,input);if(input.version!==1)throw Error('Unsupported follow-path version.');
}

export function libraryClips(root){return root.userData.fusion_anim_library||=[];}
export function captureAnimClip(root,keys,{name='Clip',start,end}={}){
 validateAnimationKeys(keys);if(!keys.length)throw Error('Insert keyframes before capturing a clip.');
 const s=start??Math.min(...keys.map(k=>k.frame)),e=end??Math.max(...keys.map(k=>k.frame));
 if(!Number.isInteger(s)||!Number.isInteger(e)||s<1||e<s||!keys.some(k=>k.frame>=s&&k.frame<=e))throw Error('Clip capture range must contain keyed frames.');
 const clip={id:THREE.MathUtils.generateUUID(),name:String(name).slice(0,64),start:s,end:e,keys:keys.filter(k=>k.frame>=s&&k.frame<=e).map(k=>structuredClone(k))};
 (root.userData.fusion_anim_library??=[]).push(clip);return clip;
}
