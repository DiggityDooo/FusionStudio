const fs=require('node:fs'),path=require('node:path');
const KINDS=new Set(['point','spot','sun','area','disk','sphere','tube']);
const UNITS=new Set(['cd','lm','lux','nits','ev']);
const SHAPES=new Set(['SQUARE','RECTANGLE','DISK','ELLIPSE']);
const RAY=['camera','diffuse','glossy','transmission','volumeScatter','shadow'];
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(v);
const num=(v,lo,hi)=>Number.isFinite(v)&&v>=lo&&v<=hi;
function existing(file,exts,label){
  if(typeof file!=='string'||!path.isAbsolute(file)||!exts.includes(path.extname(file).toLowerCase())||!fs.existsSync(file)||!fs.statSync(file).isFile())
    throw Error(label+' must be an existing file with a supported extension.');
  const stat=fs.statSync(file);if(stat.size>64*1024*1024)throw Error(label+' is larger than 64 MB.');
  return file;
}
function rays(v){const out={};for(const k of RAY)out[k]=v?.[k]!==false;return out;}
function light(l){
  if(!l||!id(l.objectId)||!KINDS.has(l.kind)||!UNITS.has(l.unit))throw Error('Invalid light description.');
  if(!num(l.power,-16,1e7)||typeof l.group!=='string'||l.group.length>40)throw Error('Invalid light power or group.');
  if(!num(l.soft,0,10)||!num(l.area,.01,100)||!num(l.areaY,.01,100)||!SHAPES.has(l.shape)||!num(l.volume,0,10))throw Error('Invalid light size.');
  if(!Array.isArray(l.barn)||l.barn.length!==4||l.barn.some(v=>!num(v,0,90)))throw Error('Invalid barn doors.');
  const include=(l.include||[]).filter(id),exclude=(l.exclude||[]).filter(id);
  if(include.length>256||exclude.length>256)throw Error('Light linking lists are too long.');
  const out={objectId:l.objectId,kind:l.kind,unit:l.unit,power:l.power,group:l.group,portal:!!l.portal,contact:!!l.contact,volume:l.volume,caustics:!!l.caustics,soft:l.soft,area:l.area,areaY:l.areaY,shape:l.shape,barn:l.barn,rays:rays(l.rays),include,exclude};
  if(l.ies)out.ies=existing(l.ies,['.ies'],'IES profile');
  if(l.gobo)out.gobo=existing(l.gobo,['.png','.jpg','.jpeg','.exr','.hdr'],'Gobo image');
  return out;
}
function lighting(input){
  if(input===undefined)return null;
  if(!input||input.version!==1||!Array.isArray(input.lights)||input.lights.length>512||!Array.isArray(input.meshes)||input.meshes.length>512||JSON.stringify(input).length>2*1024*1024)throw Error('Invalid lighting sidecar.');
  const mixer={};
  if(input.mixer&&typeof input.mixer==='object'&&!Array.isArray(input.mixer)){
    for(const [k,v] of Object.entries(input.mixer)){if(typeof k!=='string'||k.length>40||!num(v,0,16))throw Error('Invalid light mixer.');mixer[k]=v;}
    if(Object.keys(mixer).length>64)throw Error('Too many light groups.');
  }
  return {version:1,mixer,lights:input.lights.map(light),meshes:input.meshes.map(m=>{if(!m||!id(m.objectId))throw Error('Invalid mesh light.');return {objectId:m.objectId,sampleAsLight:m.sampleAsLight!==false};})};
}
module.exports={lighting};
