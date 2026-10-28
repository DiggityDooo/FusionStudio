import * as THREE from 'three';
import {resolvedTrack,validateAnimationKeys} from './animation-data.js';
import {sampleSegment} from './animation.js';

const held=mode=>mode==='constant'||mode==='stepped';
export function animationSamplingReasons(root){
  const reasons=new Set(),keys=root.userData.fusion_timeline||[],curves=new Map();
  const last=new Map();for(const key of keys)for(const id of Object.keys(key.tracks||{}))last.set(id,Math.max(last.get(id)||0,key.frame));
  for(const key of keys)for(const id of Object.keys(key.tracks||{})){
    if(key.frame===last.get(id))continue;
    const mode=resolvedTrack(key,id).interp;let modes=curves.get(id);if(!modes)curves.set(id,modes=new Set());modes.add(held(mode)?'step':mode);
  }
  for(const modes of curves.values())if([...modes].some(m=>!['step','linear'].includes(m))||modes.size>1)reasons.add('eased or mixed interpolation');
  if(root.userData.fusion_nla?.tracks?.some(t=>!t.muted&&t.clips?.some(c=>!c.muted)))reasons.add('NLA time mapping');
  root.traverse(n=>{
    if(n.userData.fusion_follow_path?.points)reasons.add('follow-path motion');
    if(n.isCamera&&(n.userData.fusion_track||n.userData.fusion_shake_amp||n.userData.fusion_follow))reasons.add('procedural camera motion');
  });
  return [...reasons];
}
// glTF has one interpolation mode per sampler. Uniform hold and linear tracks
// remain exact; mixed/eased tracks are sampled explicitly and reported as such.
export function keyframeClips(keys,{fps=24,samplesPerFrame=4}={}){
  validateAnimationKeys(keys);
  if(!Number.isFinite(fps)||fps<=0||fps>240)throw Error('Animation export FPS must be in (0, 240].');
  if(!Number.isInteger(samplesPerFrame)||samplesPerFrame<1||samplesPerFrame>16)throw Error('Animation sampling must use 1–16 samples per frame.');
  const tracks=[],ids=new Set(keys.flatMap(k=>Object.keys(k.tracks))),source=[...keys].sort((a,b)=>a.frame-b.frame);let budget=0;
  for(const id of ids){
    const frames=source.filter(k=>k.tracks[id]).map(k=>({frame:k.frame,tracks:{[id]:resolvedTrack(k,id)}}));
    if(frames.length<2)continue;
    const morphCounts=frames.map(k=>k.tracks[id].morph?.length);if(morphCounts.some(n=>n!==undefined)&&morphCounts.some(n=>n!==morphCounts[0]))throw Error('Morph target count changes between keys for '+id+'. Relink the matching topology before exchange.');
    const modes=frames.slice(0,-1).map(k=>k.tracks[id].interp),discrete=modes.every(held),linear=modes.every(m=>m==='linear'),samples=new Map();
    const add=(time,track)=>{if(++budget>1000000)throw Error('Animation export exceeds one million object/time samples. Shorten the clip.');samples.set(Math.fround(time),track);};
    if(discrete||linear)for(const key of frames)add((key.frame-1)/fps,key.tracks[id]);
    else for(let i=0;i<frames.length-1;i++){
      const a=frames[i],b=frames[i+1],ta=a.tracks[id],tb=b.tracks[id],end=(b.frame-1)/fps;
      const count=Math.ceil((b.frame-a.frame)*samplesPerFrame);
      if(count>1000000-budget)throw Error('Animation curve sampling exceeds one million samples. Shorten the clip.');
      if(held(ta.interp)){
        add((a.frame-1)/fps,ta);
        const bits=new Uint32Array(new Float32Array([end]).buffer);bits[0]--;const before=new Float32Array(bits.buffer)[0];
        if(before>(a.frame-1)/fps)add(before,ta);add(end,tb);continue;
      }
      for(let j=0;j<=count;j++){
        const frame=a.frame+(b.frame-a.frame)*j/count,{t}=sampleSegment({...a,...ta},{...b,...tb},frame),track={};
        for(const prop of ['position','scale','morph'])if(ta[prop]&&tb[prop])track[prop]=ta[prop].map((v,k)=>v+(tb[prop][k]-v)*t);
        track.quaternion=new THREE.Quaternion().fromArray(ta.quaternion).slerp(new THREE.Quaternion().fromArray(tb.quaternion),t).toArray();
        add((frame-1)/fps,track);
      }
    }
    const ordered=[...samples].sort((a,b)=>a[0]-b[0]),times=ordered.map(([t])=>t),interpolation=discrete?THREE.InterpolateDiscrete:THREE.InterpolateLinear;
    for(const [prop,Type]of [['position',THREE.VectorKeyframeTrack],['quaternion',THREE.QuaternionKeyframeTrack],['scale',THREE.VectorKeyframeTrack],['morph',THREE.NumberKeyframeTrack]]){
      if(ordered.every(([,t])=>Array.isArray(t[prop])))tracks.push(new Type(id+'.'+(prop==='morph'?'morphTargetInfluences':prop),times,ordered.flatMap(([,t])=>t[prop]),interpolation));
    }
  }
  return tracks.length?[new THREE.AnimationClip('Fusion animation',-1,tracks)]:[];
}
