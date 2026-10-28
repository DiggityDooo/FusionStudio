// Biovision motion capture. Kept separate from bvh.js (spatial ray acceleration).
// Files contain data only: bounded hierarchy, declared channel order and finite samples.
import * as THREE from 'three';

const CHANNELS=new Set(['Xposition','Yposition','Zposition','Xrotation','Yrotation','Zrotation']);
const AXES={X:new THREE.Vector3(1,0,0),Y:new THREE.Vector3(0,1,0),Z:new THREE.Vector3(0,0,1)};
const MAX_VALUES=5_000_000,MAX_SAMPLES=1_000_000;

export function parseBvh(text,{scale=1,units='unspecified'}={}){
  if(typeof text!=='string'||text.length>32*1024*1024)throw Error('BVH input must be text below 32 MiB.');
  if(!Number.isFinite(scale)||scale<=0||scale>1e6)throw Error('BVH scale must be finite and positive.');
  const normalized=text.replace(/^\uFEFF/,'').replace(/^\s*Frames\s*:\s*/gmi,'Frames: ').replace(/^\s*Frame\s+Time\s*:\s*/gmi,'Frame Time: ');
  const tokens=normalized.match(/[{}]|[^\s{}]+/g)||[];let cursor=0,channelCount=0;
  const take=()=>{if(cursor>=tokens.length)throw Error('BVH input is truncated.');return tokens[cursor++];};
  const expect=word=>{if(take()!==word)throw Error('BVH expected '+word+'.');};
  const numeric=()=>{const token=take(),v=Number(token);if(!Number.isFinite(v))throw Error('BVH contains a non-finite sample or offset.');return v;};
  const integer=(min,max)=>{const n=numeric();if(!Number.isSafeInteger(n)||n<min||n>max)throw Error('BVH count exceeds its supported bounds.');return n;};
  const root=new THREE.Group();root.name='BVH motion';root.userData={fusion_kind:'armature',fusion_armature:true};
  const bones=[],records=[];
  function joint(kind,parent,depth=0){
    if(depth>128||bones.length>=2048)throw Error('BVH hierarchy exceeds 2,048 bones or 128 levels.');
    const end=kind==='End';let name;
    if(end){expect('Site');name=parent.name+'_EndSite';}else name=take();
    if(!name||name.length>128||/[{}]/.test(name))throw Error('BVH joint name is invalid.');
    expect('{');expect('OFFSET');const offset=[numeric()*scale,numeric()*scale,numeric()*scale];
    if(offset.some(v=>!Number.isFinite(v)))throw Error('BVH scaled offset is non-finite.');
    const bone=new THREE.Bone();bone.name=name;bone.position.fromArray(offset);
    bone.userData={fusion_source_quaternion:[0,0,0,1],fusion_bvh_end_site:end};parent.add(bone);bones.push(bone);
    const record={bone,offset,channels:[],start:channelCount};records.push(record);
    if(!end){expect('CHANNELS');const count=integer(0,6);record.channels=Array.from({length:count},take);
      if(record.channels.some(c=>!CHANNELS.has(c))||new Set(record.channels).size!==count)throw Error('BVH has unsupported or repeated channels.');
      channelCount+=count;
      while(tokens[cursor]!=='}'){const type=take();if(!['JOINT','End'].includes(type))throw Error('BVH expected JOINT or End Site.');joint(type,bone,depth+1);}
    }
    expect('}');return bone;
  }
  expect('HIERARCHY');expect('ROOT');joint('ROOT',root);
  expect('MOTION');expect('Frames:');const count=integer(1,100000);
  expect('Frame');expect('Time:');const frameTime=numeric();
  if(frameTime<=0||frameTime>10)throw Error('BVH frame time must be in (0, 10] seconds.');
  if(!channelCount||count*channelCount>MAX_VALUES)throw Error('BVH motion exceeds five million channel samples or has no channels.');
  if(tokens.length-cursor!==count*channelCount)throw Error('BVH frame/channel sample count does not match its header.');
  const frames=Array.from({length:count},()=>Float64Array.from({length:channelCount},numeric));
  if(frames.some(row=>row.some(v=>!Number.isFinite(v*scale))))throw Error('BVH scaled sample is non-finite.');
  const rate=1/frameTime,nearInteger=Math.round(rate),fps=Math.abs(rate-nearInteger)<.001?nearInteger:rate;
  const parsed={root,bones,records,frames,frameTime,fps,scale,units,frame:0};
  // Preserve the source declaration: BVH does not specify length units.
  root.userData.fusion_bvh={version:1,text,scale,units,frameTime,frames:count,
    joints:records.map(r=>({name:r.bone.name,offset:[...r.offset],channels:[...r.channels]}))};
  applyBvhFrame(parsed,0);return parsed;
}

export function applyBvhFrame(parsed,frame){
  if(!Number.isInteger(frame)||frame<0||frame>=parsed.frames.length)throw Error('BVH frame is outside the clip.');
  const values=parsed.frames[frame],q=new THREE.Quaternion();
  const poses=parsed.records.map(r=>{const position=new THREE.Vector3().fromArray(r.offset),rotation=new THREE.Quaternion();
    r.channels.forEach((channel,i)=>{const v=values[r.start+i],axis=channel[0];
      if(channel.endsWith('position'))position[axis.toLowerCase()]+=v*parsed.scale;
      else rotation.multiply(q.setFromAxisAngle(AXES[axis],THREE.MathUtils.degToRad(v)));
    });rotation.normalize();
    if(![...position.toArray(),...rotation.toArray()].every(Number.isFinite))throw Error('BVH frame produces a non-finite transform.');
    return {position,rotation};
  });
  parsed.records.forEach((r,i)=>{r.bone.position.copy(poses[i].position);r.bone.quaternion.copy(poses[i].rotation);});
  parsed.frame=frame;parsed.root.updateMatrixWorld(true);return parsed.root;
}

export function bvhToTimelineKeys(parsed,{step=1,fps=parsed.fps,startFrame=1}={}){
  if(!Number.isInteger(step)||step<1||step>1000||!Number.isFinite(fps)||fps<.1||fps>240||!Number.isSafeInteger(startFrame)||startFrame<0)throw Error('Invalid BVH sampling rate, start frame or step.');
  const sameRate=Math.abs(fps-parsed.fps)<1e-8,duration=(parsed.frames.length-1)*parsed.frameTime,last=sameRate?parsed.frames.length-1:Math.ceil(duration*fps-1e-8);
  if((Math.ceil(last/step)+1)*parsed.bones.length>MAX_SAMPLES)throw Error('BVH import exceeds one million bone/frame samples. Reduce the clip or sample rate.');
  const saved=parsed.bones.map(b=>({p:b.position.clone(),q:b.quaternion.clone()})),priorFrame=parsed.frame,keys=[];
  const samples=[];for(let n=0;n<=last;n+=step)samples.push(n);if(samples.at(-1)!==last)samples.push(last);
  try{
    for(const n of samples){const source=Math.min(parsed.frames.length-1,sameRate?n:n/fps/parsed.frameTime),a=Math.floor(source),b=Math.min(parsed.frames.length-1,a+1),t=source-a;
      applyBvhFrame(parsed,a);const state=parsed.bones.map(bone=>({p:bone.position.clone(),q:bone.quaternion.clone()}));
      if(b!==a)applyBvhFrame(parsed,b);
      const tracks={};parsed.bones.forEach((bone,i)=>{const prior=state[i];tracks[bone.uuid]={position:prior.p.lerp(bone.position,t).toArray(),quaternion:prior.q.slerp(bone.quaternion,t).toArray(),scale:[1,1,1]};});
      keys.push({frame:startFrame+n,interp:'linear',tracks});
    }
    return keys;
  }finally{parsed.bones.forEach((b,i)=>{b.position.copy(saved[i].p);b.quaternion.copy(saved[i].q);});parsed.frame=priorFrame;parsed.root.updateMatrixWorld(true);}
}

export function importBvhToScene(text,scene,{asKeys=true,...options}={}){
  if(!scene?.isObject3D)throw Error('BVH import needs a scene root.');
  const parsed=parseBvh(text,options),keys=asKeys?bvhToTimelineKeys(parsed,options):[];
  scene.add(parsed.root);
  return {armature:parsed.root,keys,frames:parsed.frames.length,fps:parsed.fps,
    warnings:parsed.units==='unspecified'?['BVH length units are unspecified. Source coordinates are retained; choose an explicit scale before physical fitting.']:[]};
}
