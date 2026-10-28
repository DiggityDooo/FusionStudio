// Editable animation stays in Fusion. Per-track curve metadata allows two
// objects at one frame to keep different interpolation after imports/merges.
export const ANIMATION_MODES=['linear','constant','bezier','spline','stepped'];
export function validateTimelineSettings(input){
  const defaults={version:1,start:1,end:120,fps:24,autoKey:false,loopMode:'loop',timeScale:1,defaultInterp:'linear',onion:{enabled:false,before:2,after:2}};
  if(input===undefined)return defaults;
  if(!input||input.version!==1||!Number.isInteger(input.start)||input.start<1||!Number.isInteger(input.end)||input.end<input.start||input.end>1000000||!Number.isFinite(input.fps)||input.fps<=0||input.fps>240||typeof input.autoKey!=='boolean'||!['once','loop','pingpong'].includes(input.loopMode)||!Number.isFinite(input.timeScale)||input.timeScale<=0||input.timeScale>10||!ANIMATION_MODES.includes(input.defaultInterp)||!input.onion||typeof input.onion.enabled!=='boolean'||![input.onion.before,input.onion.after].every(n=>Number.isInteger(n)&&n>=0&&n<=20))throw Error('Invalid versioned timeline settings. Restore a valid project version.');
  return Object.fromEntries(Object.keys(defaults).map(k=>[k,structuredClone(input[k])]));
}
const record=x=>x&&typeof x==='object'&&!Array.isArray(x);
const finiteArray=(x,n)=>Array.isArray(x)&&x.length===n&&x.every(Number.isFinite);
export function resolvedTrack(key,id,fallback='linear'){
  const track=key.tracks[id];
  return {...structuredClone(track),interp:track.interp??key.interp??fallback,
    ...(track.handles??key.handles?{handles:structuredClone(track.handles??key.handles)}:{})};
}
export function validateAnimationKeys(keys){
  if(!Array.isArray(keys)||keys.length>100000)throw Error('Animation supports at most 100,000 keyed frames.');
  const frames=new Set();let samples=0;
  for(const key of keys){
    if(!key||!Number.isInteger(key.frame)||key.frame<1||key.frame>1000000||frames.has(key.frame)||!record(key.tracks))throw Error('Animation frames must be unique integers from 1 to 1,000,000 with valid tracks.');
    frames.add(key.frame);
    for(const id of Object.keys(key.tracks)){
      if(!id||id.length>256||['__proto__','constructor','prototype'].includes(id)||!record(key.tracks[id]))throw Error('Animation has an invalid object track.');
      if(++samples>1000000)throw Error('Animation exceeds one million object/key samples.');
      const t=resolvedTrack(key,id);
      if(!finiteArray(t.position,3)||!finiteArray(t.scale,3)||!finiteArray(t.quaternion,4)||Math.abs(Math.hypot(...t.quaternion)-1)>1e-3)throw Error('Animation transforms require finite XYZ and a unit quaternion.');
      if(!ANIMATION_MODES.includes(t.interp))throw Error('Unsupported animation interpolation: '+t.interp);
      if(t.handles)for(const h of [t.handles.in,t.handles.out])if(h!==undefined&&(!finiteArray(h,2)||h[0]<0||h[0]>1||Math.abs(h[1])>100))throw Error('Bezier handles require finite [time, value] pairs; time must be 0–1.');
      if(t.morph!==undefined&&(!Array.isArray(t.morph)||t.morph.length>10000||!t.morph.every(Number.isFinite)))throw Error('Morph animation contains invalid values.');
      for(const values of [t.channels,t.creator?.shapes])if(values!==undefined&&(!record(values)||Object.values(values).some(v=>!Number.isFinite(v))))throw Error('Character animation contains invalid control values.');
      if(t.ik!==undefined&&(!Array.isArray(t.ik)||t.ik.length>2048||t.ik.some(c=>!c||typeof c.id!=='string'||!finiteArray(c.target,3)||!finiteArray(c.pole,3)||typeof c.enabled!=='boolean')))throw Error('IK animation contains invalid targets or poles.');
    }
  }
  return keys;
}
export function mergeAnimationKeys(existing,incoming){
  validateAnimationKeys(existing);validateAnimationKeys(incoming);
  const frames=new Map();
  for(const key of [...existing,...incoming]){
    let dest=frames.get(key.frame);if(!dest){dest={...structuredClone(key),tracks:{}};frames.set(key.frame,dest);}
    for(const id of Object.keys(key.tracks)){
      const next=resolvedTrack(key,id);
      if(dest.tracks[id]&&JSON.stringify(dest.tracks[id])!==JSON.stringify(next))throw Error('Animation merge would replace '+id+' at frame '+key.frame+'. Review the conflicting keys first.');
      dest.tracks[id]=next;
    }
  }
  const keys=[...frames.values()].sort((a,b)=>a.frame-b.frame);validateAnimationKeys(keys);return keys;
}
export function planAnimClip(root,clip,{at=1}={}){
  if(!clip?.keys?.length)throw Error('Animation clip is empty.');
  if(!Number.isInteger(at)||at<1)throw Error('Clip destination must be a frame of at least 1.');
  validateAnimationKeys(clip.keys);const source=[...clip.keys].sort((a,b)=>a.frame-b.frame),offset=at-source[0].frame;
  const incoming=source.map(k=>({...structuredClone(k),frame:k.frame+offset}));validateAnimationKeys(incoming);
  const prior=root.userData.fusion_timeline||[];validateAnimationKeys(prior);
  const ids=new Set(incoming.flatMap(k=>Object.keys(k.tracks))),end=incoming.at(-1).frame,byFrame=new Map(incoming.map(k=>[k.frame,k])),conflicts=[];
  const kept=prior.map(k=>{const next={...structuredClone(k),tracks:{}};
    for(const id of Object.keys(k.tracks)){
      const track=resolvedTrack(k,id),replacement=byFrame.get(k.frame);
      if(ids.has(id)&&k.frame>=at&&k.frame<=end){
        if(!replacement?.tracks[id]||JSON.stringify(track)!==JSON.stringify(resolvedTrack(replacement,id)))conflicts.push({frame:k.frame,objectId:id});
      }else next.tracks[id]=track;
    }return next;
  }).filter(k=>Object.keys(k.tracks).length);
  return {keys:mergeAnimationKeys(kept,incoming),conflicts,start:at,end};
}
export function applyAnimClip(root,clip,{at=1,conflict='error'}={}){
  if(!['error','replace'].includes(conflict))throw Error('Unknown clip conflict policy.');
  const plan=planAnimClip(root,clip,{at});
  if(plan.conflicts.length&&conflict!=='replace')throw Error(`${plan.conflicts.length} existing object keys overlap this clip. Review replacement or choose another start frame.`);
  root.userData.fusion_timeline=plan.keys;return plan.keys.length;
}
