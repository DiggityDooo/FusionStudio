import * as THREE from 'three';

export const LIGHT_KINDS={
  point:'Point Light',spot:'Spot Light',sun:'Sun Light',area:'Area Light',
  disk:'Disk Light',sphere:'Sphere Light',tube:'Tube Light'
};
export const AREA_KINDS=new Set(['area','disk','tube']);
export const POINT_KINDS=new Set(['point','sphere']);
export const LIGHT_UNITS=['cd','lm','lux','nits','ev'];
export const RAY_KEYS=['camera','diffuse','glossy','transmission','volumeScatter','shadow'];
export const LIGHT_RIGS={
  'three-point':[
    {kind:'area',name:'Key',offset:[2.2,3.1,2.4],look:[0,1,0],intensity:90,kelvin:5200,group:'Key',soft:.15,area:1.4},
    {kind:'area',name:'Fill',offset:[-2.8,2.2,1.4],look:[0,1,0],intensity:28,kelvin:6800,group:'Fill',soft:.35,area:2},
    {kind:'spot',name:'Rim',offset:[.2,3.4,-2.8],look:[0,1.2,0],intensity:55,kelvin:7500,group:'Rim',soft:.2,angle:50}
  ],
  studio:[
    {kind:'disk',name:'Key',offset:[1.8,3.6,2.2],look:[0,1,0],intensity:110,kelvin:5400,group:'Key',area:1.6},
    {kind:'disk',name:'Fill',offset:[-2.4,1.8,1.8],look:[0,1,0],intensity:32,kelvin:6500,group:'Fill',area:2.2},
    {kind:'area',name:'Rim',offset:[0,3.2,-2.6],look:[0,1.1,0],intensity:70,kelvin:7200,group:'Rim',area:1.2},
    {kind:'area',name:'Ground',offset:[0,.15,1.2],look:[0,1,0],intensity:18,kelvin:5000,group:'Bounce',area:3}
  ],
  'hdri-studio':[
    {kind:'disk',name:'Key',offset:[2,3.2,1.6],look:[0,1,0],intensity:40,kelvin:5600,group:'Key',area:1.2},
    {kind:'area',name:'Rim',offset:[-1.4,2.8,-2.2],look:[0,1.2,0],intensity:24,kelvin:7000,group:'Rim',area:1}
  ]
};
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(v);
const num=(v,lo,hi)=>Number.isFinite(v)&&v>=lo&&v<=hi;
const rays=input=>{const out={};for(const k of RAY_KEYS)out[k]=input?.[k]!==false;return out;};

export function defaultUnit(kind){return kind==='sun'?'lux':'cd';}
export function areaM2(light){
  const u=light.userData||{},kind=u.fusion_light,a=Math.max(.01,u.fusion_area||1),b=Math.max(.01,u.fusion_area_y||a),r=Math.max(.001,u.fusion_soft||.1);
  if(kind==='disk')return Math.PI*(a*.5)**2;
  if(kind==='tube')return a*b;
  if(kind==='sphere')return 4*Math.PI*r*r;
  if(kind==='area')return a*a;
  return 1;
}
export function toViewportIntensity(kind,unit,power,light){
  if(!Number.isFinite(power))return 0;
  if(unit==='ev')return (kind==='sun'?3:40)*2**power;
  if(unit==='nits')return Math.max(0,power)*areaM2(light);
  if(unit==='lm'){
    if(kind==='sun')return power;
    if(AREA_KINDS.has(kind))return power/Math.PI;
    if(kind==='spot')return power/Math.max(1e-6,2*Math.PI*(1-Math.cos(light.angle||Math.PI/6)));
    return power/(4*Math.PI);
  }
  return Math.max(0,power);
}
export function authoredPower(light){return light.userData.fusion_power??light.intensity;}
export function applyAuthoredPower(light,mixer={}){
  const kind=light.userData.fusion_light||'point',unit=light.userData.fusion_unit||defaultUnit(kind);
  const scale=mixer[light.userData.fusion_group]??1;
  light.intensity=toViewportIntensity(kind,unit,authoredPower(light),light)*Math.max(0,scale);
  return light.intensity;
}
export function mixerOf(root){return root?.userData.fusion_light_mixer&&typeof root.userData.fusion_light_mixer==='object'?root.userData.fusion_light_mixer:{};}
export function applyMixer(root){
  const mixer=mixerOf(root);
  root?.traverse(o=>{if(o.isLight&&o.userData.fusion_light)applyAuthoredPower(o,mixer);});
}

export function solarPosition({latitude=40.7,longitude=-74,month=6,day=21,hour=15}={}){
  const y=2000,m=Math.min(12,Math.max(1,month|0)),d=Math.min(31,Math.max(1,day|0));
  const dayOf=Math.floor((Date.UTC(y,m-1,d)-Date.UTC(y,0,0))/86400000);
  const decl=23.44*Math.sin(2*Math.PI*(284+dayOf)/365)*Math.PI/180;
  const lat=latitude*Math.PI/180,H=(hour-12+longitude/15)*15*Math.PI/180;
  const sinEl=Math.sin(lat)*Math.sin(decl)+Math.cos(lat)*Math.cos(decl)*Math.cos(H);
  const elevation=Math.asin(Math.min(1,Math.max(-1,sinEl)))*180/Math.PI;
  const azimuth=Math.atan2(-Math.sin(H),Math.tan(decl)*Math.cos(lat)-Math.sin(lat)*Math.cos(H))*180/Math.PI;
  return {elevation,azimuth:(azimuth+360)%360};
}

export function sunSkyRecord(input={}){
  const numf=(v,lo,hi,fallback)=>Number.isFinite(v)&&v>=lo&&v<=hi?v:fallback;
  const out={
    enabled:!!input.enabled,timeOfDay:!!input.timeOfDay,
    elevation:numf(input.elevation,-90,90,45),rotation:numf(input.rotation,-360,360,0),
    air:numf(input.air,0,10,1),dust:numf(input.dust,0,10,1),ozone:numf(input.ozone,0,10,1),
    latitude:numf(input.latitude,-90,90,40.7),longitude:numf(input.longitude,-180,180,-74),
    month:numf(input.month,1,12,6)|0,day:numf(input.day,1,31,21)|0,hour:numf(input.hour,0,24,15)
  };
  if(out.timeOfDay){const s=solarPosition(out);out.elevation=s.elevation;out.rotation=s.azimuth;}
  return out;
}

export function lightRecord(light){
  const u=light.userData||{},kind=u.fusion_light||(light.isDirectionalLight?'sun':light.isSpotLight?'spot':'point');
  const rec={
    objectId:u.fusion_id||light.uuid,kind,
    unit:LIGHT_UNITS.includes(u.fusion_unit)?u.fusion_unit:defaultUnit(kind),
    power:authoredPower(light),group:typeof u.fusion_group==='string'?u.fusion_group.slice(0,40):'',
    portal:!!u.fusion_portal,contact:!!u.fusion_contact,volume:Math.max(0,Math.min(10,u.fusion_volume||0)),
    caustics:!!u.fusion_caustics,soft:Math.max(0,u.fusion_soft||0),
    area:Math.max(.01,u.fusion_area||1),areaY:Math.max(.01,u.fusion_area_y||u.fusion_area||1),
    shape:['SQUARE','RECTANGLE','DISK','ELLIPSE'].includes(u.fusion_area_shape)?u.fusion_area_shape:kind==='disk'?'DISK':kind==='tube'?'RECTANGLE':'SQUARE',
    barn:Array.isArray(u.fusion_barn)?u.fusion_barn.map(v=>Math.max(0,Math.min(90,+v||0))):[0,0,0,0],
    rays:rays(u.fusion_rays),
    include:Array.isArray(u.fusion_link_include)?u.fusion_link_include.filter(id).slice(0,256):[],
    exclude:Array.isArray(u.fusion_link_exclude)?u.fusion_link_exclude.filter(id).slice(0,256):[]
  };
  if(typeof u.fusion_ies==='string')rec.ies=u.fusion_ies;
  if(typeof u.fusion_gobo==='string')rec.gobo=u.fusion_gobo;
  return rec;
}

export function lightingSidecar(root){
  const lights=[],meshes=[];
  root.traverse(n=>{
    if(n.isLight&&n.userData.fusion_light&&n.visible)lights.push(lightRecord(n));
    if(n.isMesh&&n.userData.fusion_mesh_light)meshes.push({objectId:n.userData.fusion_id||n.uuid,sampleAsLight:true});
  });
  const mixer=mixerOf(root),clean={};
  for(const [k,v] of Object.entries(mixer))if(typeof k==='string'&&k.length<=40&&num(v,0,16))clean[k]=v;
  return {version:1,mixer:clean,lights,meshes};
}

export function applyLightRays(light,flags){light.userData.fusion_rays=rays(flags);}
export function setLightGroup(light,name){light.userData.fusion_group=String(name||'').slice(0,40);}
export function setBarnDoors(light,values){
  const v=[].concat(values).slice(0,4).map(n=>Math.max(0,Math.min(90,Number(n)||0)));
  while(v.length<4)v.push(0);light.userData.fusion_barn=v;
  if(light.isSpotLight&&light.userData.fusion_light!=='area'){
    const max=Math.max(...v);light.penumbra=Math.min(1,light.penumbra||.25);if(max>0)light.angle=Math.min(light.angle,Math.PI/2*(1-max/180));
  }
}

export function makeMeshLight(mesh,{color='#fff4d6',intensity=8}={}){
  if(!mesh?.isMesh)throw Error('Select a mesh to use as a light.');
  mesh.userData.fusion_mesh_light=true;
  for(const m of [].concat(mesh.material||[])){
    if(!m)continue;m.emissive=new THREE.Color(color);m.emissiveIntensity=intensity;m.needsUpdate=true;
  }
  return mesh;
}

export function paintPlacement(hit,kind='point'){
  const n=hit.normal.clone().normalize(),p=hit.point.clone().addScaledVector(n,.18);
  return {position:p.toArray(),target:hit.point.toArray(),kind};
}
