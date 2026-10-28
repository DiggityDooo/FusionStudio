import * as THREE from 'three';

export const CAMERA_PRESETS={
  '18mm wide':{focal:18,sensor:36},
  '24mm':{focal:24,sensor:36},
  '35mm':{focal:35,sensor:36},
  '50mm':{focal:50,sensor:36},
  '85mm portrait':{focal:85,sensor:36,fstop:1.8,dof:true},
  '135mm tele':{focal:135,sensor:36},
  'Super 35':{focal:27,sensor:24.89},
  'Anamorphic 2x':{focal:40,sensor:22,squeeze:2}
};
export const CAMERA_RIGS={dolly:'Dolly',crane:'Crane',orbit:'Orbit',path:'Follow path'};
export const PANO_TYPES=['none','equirect','fisheye','mirror'];
export const GUIDE_TYPES=['thirds','golden','center','safe'];
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(v);
const num=(v,lo,hi,fallback)=>Number.isFinite(v)&&v>=lo&&v<=hi?v:fallback;

export function cameraDefaults(extra={}){
  return {
    fusion_camera:true,fusion_dof:false,fusion_fstop:2.8,fusion_focus:5,fusion_blades:0,fusion_bokeh_rot:0,
    fusion_motion_blur:false,fusion_shutter:180,fusion_distortion:0,fusion_chromatic:0,fusion_vignette:0,fusion_flare:0,
    fusion_shake_amp:0,fusion_shake_hz:8,fusion_shift_x:0,fusion_shift_y:0,fusion_pano:'none',fusion_stereo:false,fusion_eye_sep:.065,
    fusion_iso:100,fusion_wb:6500,fusion_guides:[],fusion_squeeze:1,...extra
  };
}

export function applyCameraPreset(camera,name){
  const p=CAMERA_PRESETS[name];if(!p)throw Error('Unknown camera preset.');
  if(camera.isPerspectiveCamera&&p.sensor){const f=p.focal;camera.filmGauge=p.sensor;camera.setFocalLength(f);}
  if(p.fstop)camera.userData.fusion_fstop=p.fstop;if(p.dof)camera.userData.fusion_dof=true;
  if(p.squeeze)camera.userData.fusion_squeeze=p.squeeze;camera.name=name;
  return camera;
}

export function cameraRecord(camera){
  const u=camera.userData||{},ortho=!!(camera.isOrthographicCamera||u.fusion_ortho);
  const rec={
    objectId:u.fusion_id||camera.uuid,ortho,
    orthoHeight:ortho?num((camera.top-camera.bottom)/(camera.zoom||1),0.001,1000,u.fusion_ortho_height||4):undefined,
    blades:num(u.fusion_blades,0,16,0)|0,bokehRotation:num(u.fusion_bokeh_rot,-180,180,0),
    motionBlur:!!u.fusion_motion_blur,shutter:num(u.fusion_shutter,1,360,180),
    distortion:num(u.fusion_distortion,-1,1,0),chromatic:num(u.fusion_chromatic,0,1,0),vignette:num(u.fusion_vignette,0,1,0),flare:num(u.fusion_flare,0,1,0),
    shakeAmp:num(u.fusion_shake_amp,0,1,0),shakeHz:num(u.fusion_shake_hz,0,60,8),
    shiftX:num(u.fusion_shift_x,-2,2,0),shiftY:num(u.fusion_shift_y,-2,2,0),
    pano:PANO_TYPES.includes(u.fusion_pano)?u.fusion_pano:'none',stereo:!!u.fusion_stereo,eyeSep:num(u.fusion_eye_sep,.001,.2,.065),
    iso:num(u.fusion_iso,50,102400,100),whiteBalance:num(u.fusion_wb,1000,12000,6500),
    squeeze:num(u.fusion_squeeze,1,2,1),guides:Array.isArray(u.fusion_guides)?u.fusion_guides.filter(g=>GUIDE_TYPES.includes(g)).slice(0,4):[],
    follow:id(u.fusion_follow)?u.fusion_follow:''
  };
  if(Array.isArray(u.fusion_track)&&u.fusion_track.length&&u.fusion_track.length<=10000){
    rec.track=u.fusion_track.filter(k=>k&&Number.isInteger(k.frame)&&Array.isArray(k.position)&&Array.isArray(k.quaternion)&&k.position.length===3&&k.quaternion.length===4)
      .slice(0,10000).map(k=>({frame:k.frame,position:k.position.map(Number),quaternion:k.quaternion.map(Number)}));
  }
  return rec;
}

export function cameraSidecar(root){
  const cameras=[];root.traverse(n=>{if(n.isCamera&&n.userData.fusion_camera)cameras.push(cameraRecord(n));});
  return {version:1,cameras};
}

export function applyTiltShift(camera){
  const x=camera.userData.fusion_shift_x||0;
  if(camera.isPerspectiveCamera)camera.filmOffset=x*(camera.filmGauge||36)*.5;
}

export function interpolateTrack(track,frame){
  if(!track?.length)return null;
  const sorted=[...track].sort((a,b)=>a.frame-b.frame);
  if(frame<=sorted[0].frame)return sorted[0];
  if(frame>=sorted.at(-1).frame)return sorted.at(-1);
  const after=sorted.find(k=>k.frame>=frame),before=[...sorted].reverse().find(k=>k.frame<=frame);
  const t=before.frame===after.frame?0:(frame-before.frame)/(after.frame-before.frame);
  const pos=before.position.map((v,i)=>v+(after.position[i]-v)*t);
  const qa=new THREE.Quaternion().fromArray(before.quaternion),qb=new THREE.Quaternion().fromArray(after.quaternion);
  return {position:pos,quaternion:qa.slerp(qb,t).toArray()};
}

export function applyCameraProcedural(camera,frame,fps=24,root=null){
  const u=camera.userData,sample=interpolateTrack(u.fusion_track,frame);
  if(sample){camera.position.fromArray(sample.position);camera.quaternion.fromArray(sample.quaternion);}
  else if(u.fusion_rest&&(u.fusion_shake_amp||u.fusion_follow)){camera.position.fromArray(u.fusion_rest.position);camera.quaternion.fromArray(u.fusion_rest.quaternion);}
  if(u.fusion_follow&&root){const t=findFusionId(root,u.fusion_follow);if(t)camera.lookAt(t.getWorldPosition(new THREE.Vector3()));}
  const amp=u.fusion_shake_amp||0;if(amp){const t=(frame-1)/Math.max(1,fps),hz=u.fusion_shake_hz||8;camera.position.x+=amp*Math.sin(t*hz*Math.PI*2);camera.position.y+=amp*.7*Math.sin(t*hz*Math.PI*2*1.17);}
  applyTiltShift(camera);
}

export function captureCameraRest(camera){camera.userData.fusion_rest={position:camera.position.toArray(),quaternion:camera.quaternion.toArray()};}

export function stampCameraExtras(camera){
  const u=camera.userData;if(!u.fusion_id)u.fusion_id=camera.uuid;
  if(camera.isPerspectiveCamera)u.fusion_vfov=camera.fov;
  if(camera.isOrthographicCamera||u.fusion_ortho){u.fusion_ortho=true;u.fusion_ortho_height=u.fusion_ortho_height||(camera.top-camera.bottom)/(camera.zoom||1);}
}

export function assembleCameraRig(kind,camera,target){
  if(!CAMERA_RIGS[kind])throw Error('Unknown camera rig.');
  const empty=new THREE.Group();empty.name=CAMERA_RIGS[kind];empty.userData.fusion_camera_rig=kind;empty.position.copy(target);
  camera.position.set(kind==='orbit'?4:0,kind==='crane'?2.5:0,4);camera.lookAt(0,0,0);empty.add(camera);captureCameraRest(camera);return empty;
}

export function findFusionId(root,id){let found=null;root.traverse(n=>{if(!found&&(n.userData.fusion_id===id||n.uuid===id))found=n;});return found;}

export function validateCameraTrack(input){
  if(!input||typeof input!=='object')throw Error('Camera track must be JSON.');
  const frames=Array.isArray(input.frames)?input.frames:Array.isArray(input)?input:null;
  if(!frames||!frames.length||frames.length>10000)throw Error('Camera track must contain 1–10,000 frames.');
  return frames.map(k=>{
    if(!k||!Number.isInteger(k.frame)||k.frame<0||k.frame>1e6)throw Error('Invalid track frame.');
    const p=k.position,q=k.quaternion;
    if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite))throw Error('Invalid track position.');
    if(!Array.isArray(q)||q.length!==4||!q.every(Number.isFinite))throw Error('Invalid track quaternion.');
    return {frame:k.frame,position:p.map(Number),quaternion:q.map(Number)};
  });
}

export function guideMarkup(guides){
  if(!guides?.length)return '';
  const parts=[];
  if(guides.includes('thirds'))parts.push('<i class="g-v" style="left:33.33%"></i><i class="g-v" style="left:66.67%"></i><i class="g-h" style="top:33.33%"></i><i class="g-h" style="top:66.67%"></i>');
  if(guides.includes('golden'))parts.push('<i class="g-v" style="left:38.2%"></i><i class="g-v" style="left:61.8%"></i><i class="g-h" style="top:38.2%"></i><i class="g-h" style="top:61.8%"></i>');
  if(guides.includes('center'))parts.push('<i class="g-v" style="left:50%"></i><i class="g-h" style="top:50%"></i>');
  if(guides.includes('safe'))parts.push('<b class="g-safe"></b><b class="g-title"></b>');
  return `<div class="camera-guides" aria-hidden="true">${parts.join('')}</div>`;
}
