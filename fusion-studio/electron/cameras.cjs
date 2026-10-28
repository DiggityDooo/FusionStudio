const PANO=new Set(['none','equirect','fisheye','mirror']);
const GUIDES=new Set(['thirds','golden','center','safe']);
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(v);
const num=(v,lo,hi)=>Number.isFinite(v)&&v>=lo&&v<=hi;
function camera(c){
  if(!c||!id(c.objectId))throw Error('Invalid camera identity.');
  const out={objectId:c.objectId,ortho:!!c.ortho,motionBlur:!!c.motionBlur,stereo:!!c.stereo,pano:PANO.has(c.pano)?c.pano:'none'};
  for(const [k,lo,hi] of [['orthoHeight',.001,1000],['bokehRotation',-180,180],['shutter',1,360],['distortion',-1,1],['chromatic',0,1],['vignette',0,1],['flare',0,1],['shakeAmp',0,1],['shakeHz',0,60],['shiftX',-2,2],['shiftY',-2,2],['eyeSep',.001,.2],['iso',50,102400],['whiteBalance',1000,12000],['squeeze',1,2]]){
    if(c[k]!==undefined){if(!num(c[k],lo,hi))throw Error('Invalid camera '+k+'.');out[k]=c[k];}
  }
  if(c.blades!==undefined){if(!Number.isInteger(c.blades)||c.blades<0||c.blades>16)throw Error('Invalid aperture blades.');out.blades=c.blades;}
  if(c.guides){if(!Array.isArray(c.guides)||c.guides.some(g=>!GUIDES.has(g)))throw Error('Invalid composition guides.');out.guides=c.guides.slice(0,4);}
  if(c.follow){if(!id(c.follow))throw Error('Invalid follow target.');out.follow=c.follow;}
  if(c.track){
    if(!Array.isArray(c.track)||c.track.length>10000)throw Error('Invalid camera track.');
    out.track=c.track.map(k=>{if(!k||!Number.isInteger(k.frame)||k.frame<0||k.frame>1e6||!Array.isArray(k.position)||k.position.length!==3||!k.position.every(Number.isFinite)||!Array.isArray(k.quaternion)||k.quaternion.length!==4||!k.quaternion.every(Number.isFinite))throw Error('Invalid camera track sample.');return {frame:k.frame,position:k.position,quaternion:k.quaternion};});
  }
  return out;
}
function cameras(input){
  if(input===undefined)return null;
  if(!input||input.version!==1||!Array.isArray(input.cameras)||input.cameras.length>256||JSON.stringify(input).length>4*1024*1024)throw Error('Invalid cameras sidecar.');
  return {version:1,cameras:input.cameras.map(camera)};
}
module.exports={cameras};
