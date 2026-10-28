// A22 virtual production / live sync previews.

const uid=()=>'vp'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);

export function createLiveLink({engine='unreal',host='127.0.0.1',port=2000}={}){
  if(!['unreal','unity','godot','custom'].includes(engine))throw Error('Unknown engine.');
  return {version:1,kind:'live_link',id:uid(),engine,host,port,connected:false,lastSync:null,subjects:[]};
}

export function liveLinkConnect(link){link.connected=true;link.lastSync=Date.now();return link;}
export function liveLinkPushTransform(link,subject,{position=[0,0,0],rotation=[0,0,0],scale=[1,1,1]}={}){
  if(!link.connected)throw Error('Live link not connected.');
  const s={name:subject,position,rotation,scale,t:Date.now()};
  link.subjects=link.subjects.filter(x=>x.name!==subject).concat(s);link.lastSync=s.t;return s;
}

export function createMocapSource({kind='webcam',device='default'}={}){
  if(!['optical','inertial','webcam'].includes(kind))throw Error('mocap kind.');
  return {version:1,kind:'mocap',type:kind,device,streaming:false,skeleton:null,fps:60};
}

export function mocapStart(src){src.streaming=true;src.skeleton={bones:['hips','spine','chest','neck','head','l_arm','r_arm','l_leg','r_leg'].map(n=>({name:n,q:[0,0,0,1]}))};return src;}
export function mocapSample(src,{t=0}={}){
  if(!src.streaming||!src.skeleton)throw Error('Mocap not streaming.');
  for(const b of src.skeleton.bones)b.q=[Math.sin(t)*.1,0,0,1];
  return src.skeleton;
}

export function createFacialCapture({markers=52}={}){
  return {version:1,kind:'face_cap',markers,blendshapes:{},streaming:false};
}

export function facialCaptureSample(face,{smile=0,blinkL=0,blinkR=0,jaw=0}={}){
  face.streaming=true;
  face.blendshapes={mouthSmile:smile,eyeBlinkLeft:blinkL,eyeBlinkRight:blinkR,jawOpen:jaw};
  return face.blendshapes;
}

export function createVirtualCamera({name='VirtCam',fov=35,sensor=[36,24]}={}){
  return {version:1,kind:'vcam',id:uid(),name,fov,sensor,position:[0,1.6,-4],target:[0,1,0],recording:false,takes:[]};
}

export function virtualScout(cam,waypoints=[]){
  if(!Array.isArray(waypoints)||waypoints.length<1)throw Error('Need waypoints.');
  cam.scoutPath=waypoints.map((p,i)=>({i,position:p}));cam.scoutIndex=0;return cam.scoutPath;
}

export function recordVirtualTake(cam,{duration=1}={}){
  cam.recording=true;const take={id:uid(),duration,position:[...cam.position],fov:cam.fov,t:Date.now()};
  cam.takes.push(take);cam.recording=false;return take;
}

export function realtimeRetarget(sourceSkeleton,targetMap){
  if(!sourceSkeleton?.bones||!targetMap)throw Error('Retarget needs skeleton + map.');
  const out={};for(const [src,dst] of Object.entries(targetMap)){
    const b=sourceSkeleton.bones.find(x=>x.name===src);if(b)out[dst]={q:[...b.q]};
  }
  return {version:1,kind:'rt_retarget',pose:out,boneCount:Object.keys(out).length};
}

export function createLedVolume({walls=3,resolution=[1920,1080],size=[6,3,6]}={}){
  return {version:1,kind:'led_volume',walls,resolution,size,ndisplay:true,frustumCam:null,synced:false};
}

export function syncLedFrustum(volume,camera){
  volume.frustumCam={fov:camera.fov,position:[...camera.position],target:[...(camera.target||[0,1,0])]};
  volume.synced=true;return volume;
}

export function createTimecode({fps=24,start='00:00:00:00'}={}){
  return {version:1,kind:'timecode',fps,start,frames:0,genlock:false};
}

export function advanceTimecode(tc,{frames=1}={}){tc.frames+=frames;return tc;}
export function enableGenlock(tc,{locked=true}={}){tc.genlock=!!locked;return tc;}
export function formatTimecode(tc){
  const f=tc.frames,fps=tc.fps,ff=f%fps,ss=Math.floor(f/fps)%60,mm=Math.floor(f/(fps*60))%60,hh=Math.floor(f/(fps*3600));
  const p=n=>String(n).padStart(2,'0');return `${p(hh)}:${p(mm)}:${p(ss)}:${p(ff)}`;
}

export function createPrevisSequencer({name='Previs',fps=24}={}){
  return {version:1,kind:'previs',name,fps,tracks:[],duration:0,playing:false};
}

export function addPrevisClip(seq,clip){
  const c={id:uid(),name:clip.name||'Clip',start:clip.start||0,end:clip.end||1,camera:clip.camera||null,kind:clip.kind||'shot'};
  seq.tracks.push(c);seq.duration=Math.max(seq.duration,c.end);return c;
}

export function createLiveKeyer({key=[0,1,0],tolerance=.25}={}){
  return {version:1,kind:'live_key',key,tolerance,spill:.1};
}

export function liveKeySample(keyer,rgba){
  if(!rgba||rgba.length<4)throw Error('RGBA sample required.');
  const d=Math.hypot(rgba[0]-keyer.key[0],rgba[1]-keyer.key[1],rgba[2]-keyer.key[2]);
  const a=d<keyer.tolerance?0:Math.min(1,(d-keyer.tolerance)/(1-keyer.tolerance+1e-6));
  return {alpha:a,spillSuppressed:rgba[1]*keyer.spill};
}

export function createXrSession({mode='vr'}={}){
  if(!['vr','ar','review'].includes(mode))throw Error('xr mode.');
  return {version:1,kind:'xr',mode,active:false,controllers:2,tools:['grab','sculpt','annotate']};
}

export function xrSessionStart(session){session.active=true;return session;}

export function createTracker({kind='object',name='Tracker'}={}){
  if(!['object','body'].includes(kind))throw Error('tracker kind.');
  return {version:1,kind:'tracker',type:kind,name,id:uid(),pose:{position:[0,0,0],rotation:[0,0,0]},confidence:0};
}

export function updateTracker(tr,{position,rotation,confidence=.9}={}){
  if(position)tr.pose.position=position;if(rotation)tr.pose.rotation=rotation;tr.confidence=confidence;return tr;
}

export function createStageBlocking({name='Stage'}={}){
  return {version:1,kind:'stage',name,id:uid(),marks:[],actors:[]};
}

export function addStageMark(stage,{label='A',position=[0,0,0]}={}){
  const m={id:uid(),label,position};stage.marks.push(m);return m;
}

export function placeStageActor(stage,{name='Talent',markId=null,position=[0,0,0]}={}){
  const mark=markId?stage.marks.find(m=>m.id===markId):null;
  const a={id:uid(),name,position:mark?mark.position:position};stage.actors.push(a);return a;
}
