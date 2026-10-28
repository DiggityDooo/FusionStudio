import * as THREE from 'three';

const hex=v=>{if(typeof v==='string'&&/^#?[a-f\d]{6}$/i.test(v))return '#'+v.replace('#','').toLowerCase();throw Error('Invalid material colour.');};
const num=(v,lo,hi,name)=>{if(!Number.isFinite(v)||v<lo||v>hi)throw Error(`Material ${name} must be ${lo}–${hi}.`);return v;};
const enums={
  workflow:['metallic-roughness','specular-glossiness'],
  model:['principled','toon','hair','volume','unlit'],
  alphaMode:['opaque','blend','mask'],
  displacementMode:['bump','normal','micro','vector'],
  texCoord:['uv','object','world'],
  layerPreset:['none','dirt','rust','dust'],
  shaderLanguage:['principled','osl','materialx'],
  bake:['Combined','Diffuse','Emit','AO','Normal','Roughness','Glossy']
};
const FIELDS={
  workflow:['metallic-roughness'],model:['principled'],color:['#bfc8c7'],roughness:[.58,0,1],metalness:[.05,0,1],
  specular:[.5,0,1],specularColor:['#ffffff'],glossiness:[.42,0,1],ior:[1.5,1,3],
  transmission:[0,0,1],thickness:[.01,0,10],attenuationColor:['#ffffff'],attenuationDistance:[0,0,100],
  subsurface:[0,0,1],subsurfaceColor:['#e2b89a'],subsurfaceScale:[.002,0,1],
  translucent:[0,0,1],iridescence:[0,0,1],iridescenceIOR:[1.3,1,3],iridescenceThickness:[400,0,2000],
  clearcoat:[0,0,1],clearcoatRoughness:[.03,0,1],sheen:[0,0,1],sheenRoughness:[.5,0,1],sheenColor:['#ffffff'],
  anisotropy:[0,0,1],anisotropyRotation:[0,0,1],
  emission:['#000000'],emissionIntensity:[0,0,1000],opacity:[1,0,1],alphaMode:['opaque'],alphaCutoff:[.5,0,1],
  displacement:[0,0,1],displacementMode:['bump'],texCoord:['uv'],vertexColor:[false],
  ao:[0,0,1],curvature:[0,0,1],weathering:[0,0,1],layerMix:[0,0,1],layerPreset:['none'],
  volumeDensity:[0,0,100],volumeColor:['#7a8a9a'],volumeAnisotropy:[0,-1,1],volumeEmission:[0,0,100],
  shaderLanguage:['principled'],instanceId:['']
};

export const SURFACE_PRESETS={
  Clay:{color:'#b8b2aa',roughness:.75,metalness:0},
  Fabric:{color:'#476781',roughness:.9,metalness:0,sheen:.8,sheenRoughness:.4,sheenColor:'#c9d4dc'},
  Metal:{color:'#bbc0c3',roughness:.22,metalness:.96},
  Porcelain:{color:'#e9e6db',roughness:.2,metalness:0,clearcoat:.15},
  Graphite:{color:'#32383b',roughness:.5,metalness:.15},
  Terracotta:{color:'#cb8752',roughness:.6,metalness:0,subsurface:.08,subsurfaceColor:'#c06030'},
  Glass:{color:'#ffffff',roughness:.02,metalness:0,transmission:1,ior:1.45,thickness:.02,opacity:.2,alphaMode:'blend'},
  Liquid:{color:'#4a7ea8',roughness:.02,metalness:0,transmission:1,ior:1.33,thickness:.04,attenuationColor:'#1a4060',attenuationDistance:.4,opacity:.15,alphaMode:'blend'},
  Skin:{color:'#c79a78',roughness:.48,metalness:0,subsurface:.35,subsurfaceColor:'#e2b89a',subsurfaceScale:.002,specular:.35},
  'Car paint':{color:'#8a1218',roughness:.28,metalness:.15,clearcoat:1,clearcoatRoughness:.04},
  Hair:{color:'#2a1a12',roughness:.55,metalness:0,anisotropy:.65,specular:.3,model:'hair'},
  Wax:{color:'#e8d5a3',roughness:.35,metalness:0,subsurface:.7,subsurfaceColor:'#d9a060',translucent:.4},
  Marble:{color:'#e8e4dc',roughness:.25,metalness:0,subsurface:.2,subsurfaceColor:'#d0c8bc'},
  Leaves:{color:'#3d6a32',roughness:.55,metalness:0,translucent:.55,subsurface:.15,subsurfaceColor:'#7aa34a'},
  Emission:{color:'#111111',roughness:1,metalness:0,emission:'#ffcc88',emissionIntensity:12},
  Toon:{color:'#d47843',roughness:.7,metalness:0,model:'toon'},
  Fog:{color:'#8899aa',roughness:1,metalness:0,model:'volume',volumeDensity:2,volumeColor:'#8899aa',opacity:.08,alphaMode:'blend'},
  Iridescent:{color:'#c8c4d8',roughness:.18,metalness:.35,iridescence:1,iridescenceIOR:1.3,iridescenceThickness:400}
};

export const RAY_VISIBILITY_KEYS=['camera','diffuse','glossy','transmission','volumeScatter','shadow'];

export function surfaceRecord(input={}){
  if(input.version!==undefined&&input.version!==1)throw Error('Unsupported surface version.');
  const out={version:1};
  for(const [key,spec] of Object.entries(FIELDS)){
    const raw=input[key]===undefined?spec[0]:input[key];
    if(enums[key]){if(!enums[key].includes(raw))throw Error('Unsupported material '+key+'.');out[key]=raw;continue;}
    if(spec.length===1&&typeof spec[0]==='string'&&spec[0].startsWith('#')){out[key]=hex(raw);continue;}
    if(key==='instanceId'){if(typeof raw!=='string'||raw.length>80)throw Error('Invalid material instance id.');out[key]=raw;continue;}
    if(key==='vertexColor'){if(typeof raw!=='boolean')throw Error('vertexColor must be boolean.');out[key]=raw;continue;}
    out[key]=num(raw,spec[1],spec[2],key);
  }
  if(input.graph)out.graph=surfaceGraph(input.graph);
  return out;
}

export function surfaceGraph(input){
  if(input===undefined)return defaultGraph(surfaceRecord());
  if(!input||input.version!==1||!Array.isArray(input.nodes)||input.nodes.length>64||!Array.isArray(input.links)||input.links.length>128)throw Error('Invalid shader graph.');
  const types=new Set(['output','principled','toon','hair','volume','mix','noise','voronoi','wave','checker','coord','vertex_color','ao','curvature','weathering','transparent','emission','layer']);
  const nodes=input.nodes.map(n=>{if(!n||typeof n.id!=='string'||n.id.length>40||!types.has(n.type))throw Error('Invalid shader node.');return {id:n.id,type:n.type,...n.params&&typeof n.params==='object'?{params:n.params}:{}};});
  const ids=new Set(nodes.map(n=>n.id));if(ids.size!==nodes.length)throw Error('Duplicate shader node id.');
  const links=input.links.map(l=>{if(!l||!ids.has(l.from)||!ids.has(l.to)||typeof l.socket!=='string'||l.socket.length>40)throw Error('Invalid shader link.');return {from:l.from,to:l.to,socket:l.socket};});
  return {version:1,nodes,links};
}

export function defaultGraph(record){
  const nodes=[{id:'coord',type:'coord',params:{space:record.texCoord}},{id:'bsdf',type:record.model==='toon'?'toon':record.model==='hair'?'hair':record.model==='volume'?'volume':'principled'},{id:'output',type:'output'}];
  const links=[{from:'coord',to:'bsdf',socket:'vector'},{from:'bsdf',to:'output',socket:'surface'}];
  if(record.vertexColor){nodes.push({id:'vcol',type:'vertex_color'});links.push({from:'vcol',to:'bsdf',socket:'base_color'});}
  if(record.ao){nodes.push({id:'ao',type:'ao'});links.push({from:'ao',to:'bsdf',socket:'ao'});}
  if(record.curvature||record.weathering){nodes.push({id:'wear',type:'weathering'});links.push({from:'wear',to:'bsdf',socket:'mix'});}
  if(record.layerPreset!=='none'){nodes.push({id:'layer',type:'layer',params:{preset:record.layerPreset}});links.push({from:'layer',to:'output',socket:'mix'});}
  if(record.volumeDensity>0||record.model==='volume'){if(!nodes.some(n=>n.type==='volume'))nodes.push({id:'vol',type:'volume'});links.push({from:nodes.find(n=>n.type==='volume').id,to:'output',socket:'volume'});}
  if(record.emissionIntensity>0){nodes.push({id:'emit',type:'emission'});links.push({from:'emit',to:'output',socket:'surface'});}
  return {version:1,nodes,links};
}

export function specularGlossinessToMetallic({color,specularColor='#ffffff',specular=.5,glossiness=.5}={}){
  const d=new THREE.Color(color),s=new THREE.Color(specularColor).multiplyScalar(num(specular,0,1,'specular'));
  const maxSpec=Math.max(s.r,s.g,s.b),metalness=Math.max(0,Math.min(1,(maxSpec-.04)/.96));
  return {color:'#'+d.clone().multiplyScalar(1-maxSpec).lerp(s,metalness).getHexString(),metalness,roughness:1-num(glossiness,0,1,'glossiness')};
}

export function metallicToSpecularGlossiness({color,metalness=0,roughness=.5}={}){
  const base=new THREE.Color(color),f0=new THREE.Color(.04,.04,.04).lerp(base,num(metalness,0,1,'metalness'));
  return {specularColor:'#'+f0.getHexString(),specular:Math.max(f0.r,f0.g,f0.b),glossiness:1-num(roughness,0,1,'roughness'),color:'#'+base.clone().multiplyScalar(1-metalness).getHexString()};
}

export function readSurface(material){
  const stored=material?.userData?.fusion_surface,live={};
  if(material?.color)live.color='#'+material.color.getHexString();
  for(const key of ['roughness','metalness','ior','transmission','thickness','clearcoat','clearcoatRoughness','sheen','sheenRoughness','anisotropy','anisotropyRotation','opacity','iridescence'])if(Number.isFinite(material?.[key]))live[key]=material[key];
  if(material?.specularIntensity!==undefined)live.specular=material.specularIntensity;
  if(material?.specularColor)live.specularColor='#'+material.specularColor.getHexString();
  if(material?.sheenColor)live.sheenColor='#'+material.sheenColor.getHexString();
  if(material?.emissive)live.emission='#'+material.emissive.getHexString();
  if(Number.isFinite(material?.emissiveIntensity))live.emissionIntensity=material.emissiveIntensity;
  if(material?.iridescenceIOR)live.iridescenceIOR=material.iridescenceIOR;
  if(material?.iridescenceThicknessRange)live.iridescenceThickness=material.iridescenceThicknessRange[1];
  if(material?.isMeshToonMaterial)live.model='toon';
  if(material?.isMeshBasicMaterial&&!material.isMeshStandardMaterial)live.model='unlit';
  if(material?.transparent&&material.opacity<1)live.alphaMode=material.alphaTest>0?'mask':'blend';
  if(material?.vertexColors)live.vertexColor=true;
  return surfaceRecord({...live,...stored,version:1});
}

function toonRamp(){
  const data=new Uint8Array([48,48,48,255,110,110,110,255,200,200,200,255,255,255,255,255]),t=new THREE.DataTexture(data,4,1);
  t.minFilter=t.magFilter=THREE.NearestFilter;t.needsUpdate=true;return t;
}

export function materialFor(record,previous){
  const model=record.model,keep=previous&&(
    (model==='toon'&&previous.isMeshToonMaterial)||
    (model==='unlit'&&previous.isMeshBasicMaterial&&!previous.isMeshStandardMaterial)||
    (model!=='toon'&&model!=='unlit'&&previous.isMeshPhysicalMaterial)
  );
  if(keep)return previous;
  const next=model==='toon'?new THREE.MeshToonMaterial({gradientMap:toonRamp()}):model==='unlit'?new THREE.MeshBasicMaterial():new THREE.MeshPhysicalMaterial();
  if(previous){next.uuid=previous.uuid;next.name=previous.name;if(previous.map)next.map=previous.map;if(previous.bumpMap)next.bumpMap=previous.bumpMap;if(previous.normalMap)next.normalMap=previous.normalMap;if(previous.displacementMap)next.displacementMap=previous.displacementMap;}
  return next;
}

export function applySurface(material,record,mesh){
  const spec=surfaceRecord(record),graph=spec.graph||defaultGraph(spec),next=materialFor(spec,material);
  const mr=spec.workflow==='specular-glossiness'?{...spec,...specularGlossinessToMetallic(spec)}:spec;
  next.color.set(mr.color);if('roughness' in next)next.roughness=mr.roughness;if('metalness' in next)next.metalness=mr.metalness;
  if(next.isMeshPhysicalMaterial){
    next.ior=spec.ior;next.transmission=spec.transmission;next.thickness=spec.thickness;
    next.attenuationColor.set(spec.attenuationColor);next.attenuationDistance=spec.attenuationDistance||Infinity;
    next.specularIntensity=spec.specular;next.specularColor.set(spec.specularColor);
    next.clearcoat=spec.clearcoat;next.clearcoatRoughness=spec.clearcoatRoughness;
    next.sheen=spec.sheen;next.sheenRoughness=spec.sheenRoughness;next.sheenColor.set(spec.sheenColor);
    next.iridescence=spec.iridescence;next.iridescenceIOR=spec.iridescenceIOR;next.iridescenceThicknessRange=[100,spec.iridescenceThickness];
    next.anisotropy=spec.anisotropy;next.anisotropyRotation=spec.anisotropyRotation*Math.PI*2;
    next.emissive.set(spec.emission);next.emissiveIntensity=spec.emissionIntensity;
    next.bumpScale=spec.displacementMode==='bump'?spec.displacement*.05:next.bumpScale;
    next.displacementScale=spec.displacementMode==='micro'||spec.displacementMode==='vector'?spec.displacement*.05:0;
  }
  next.opacity=spec.opacity;next.transparent=spec.alphaMode!=='opaque'||spec.transmission>0||spec.opacity<1;next.depthWrite=!next.transparent;
  next.alphaTest=spec.alphaMode==='mask'?spec.alphaCutoff:0;
  next.vertexColors=!!spec.vertexColor;
  next.userData={...next.userData,fusion_surface:{...spec,graph},fusion_material_id:next.uuid};
  next.needsUpdate=true;
  if(next!==material&&mesh){if(Array.isArray(mesh.material))mesh.material=mesh.material.map(m=>m===material?next:m);else mesh.material=next;}
  return next;
}

export function applySurfaceField(mesh,key,value){
  const mats=[].concat(mesh.material||[]);
  for(const material of mats){if(!material)continue;applySurface(material,{...readSurface(material),[key]:value},mesh);}
}

export function applyPreset(mesh,name,{instanceId=''}={}){
  const preset=SURFACE_PRESETS[name];if(!preset)throw Error('Unknown material preset.');
  const mats=[].concat(mesh.material||[]);
  for(const material of mats){if(!material)continue;applySurface(material,{...preset,instanceId:instanceId||material.userData.fusion_surface?.instanceId||''},mesh);}
}

export function shareInstance(scene,material){
  const id=material.userData.fusion_surface?.instanceId;if(!id)return 0;
  let n=0;scene.traverse(o=>{if(!o.isMesh)return;const mats=[].concat(o.material||[]);if(mats.some(m=>m?.userData.fusion_surface?.instanceId===id&&m!==material)){o.material=Array.isArray(o.material)?o.material.map(m=>m?.userData.fusion_surface?.instanceId===id?material:m):material;n++;}});
  return n;
}

export function makeUnique(mesh){
  const mats=[].concat(mesh.material||[]);
  mesh.material=Array.isArray(mesh.material)?mats.map(m=>isolate(m)):isolate(mats[0]);
}
function isolate(material){if(!material)return material;const copy=material.clone();copy.userData=structuredClone(material.userData||{});if(copy.userData.fusion_surface)copy.userData.fusion_surface.instanceId=THREE.MathUtils.generateUUID();copy.userData.fusion_material_id=copy.uuid;return copy;}

export function rayVisibility(input={}){
  const out={version:1};for(const key of RAY_VISIBILITY_KEYS){const v=input[key];if(v===undefined){out[key]=true;continue;}if(typeof v!=='boolean')throw Error('Ray visibility flags must be boolean.');out[key]=v;}
  return out;
}

export function applyRayVisibility(object,flags){object.userData.fusion_ray_visibility=rayVisibility(flags);}

export function applyObjectOverride(object,record){
  if(record===null){object.traverse(n=>{if(n.userData.fusion_base_material){n.material=n.userData.fusion_base_material;delete n.userData.fusion_base_material;}});delete object.userData.fusion_material_override;return;}
  const spec=surfaceRecord(record);object.userData.fusion_material_override=spec;
  object.traverse(n=>{if(!n.isMesh||!n.material)return;if(!n.userData.fusion_base_material)n.userData.fusion_base_material=n.material;n.material=isolate(n.userData.fusion_base_material);applySurface(n.material,spec,n);});
}

export function addVertexColors(geometry,color='#ffffff'){
  if(geometry.attributes.color)return geometry.attributes.color;
  const c=new THREE.Color(color),count=geometry.attributes.position.count,data=new Float32Array(count*3);
  for(let i=0;i<count;i++){data[i*3]=c.r;data[i*3+1]=c.g;data[i*3+2]=c.b;}
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(data,3));return geometry.attributes.color;
}

export function materialXDocument(record){
  const s=surfaceRecord(record),c=new THREE.Color(s.color),e=new THREE.Color(s.emission);
  const attr=(name,type,value)=>`    <input name="${name}" type="${type}" value="${value}"/>`;
  return `<?xml version="1.0"?>
<materialx version="1.38">
  <surfacematerial name="Fusion" type="material">
    <input name="surfaceshader" type="surfaceshader" nodename="standard_surface"/>
  </surfacematerial>
  <standard_surface name="standard_surface" type="surfaceshader">
${attr('base_color','color3',`${c.r},${c.g},${c.b}`)}
${attr('metalness','float',s.metalness)}
${attr('specular_roughness','float',s.roughness)}
${attr('specular_ior','float',s.ior)}
${attr('transmission','float',s.transmission)}
${attr('subsurface','float',s.subsurface)}
${attr('coat','float',s.clearcoat)}
${attr('sheen','float',s.sheen)}
${attr('anisotropic','float',s.anisotropy)}
${attr('emission_color','color3',`${e.r},${e.g},${e.b}`)}
${attr('emission','float',s.emissionIntensity)}
${attr('opacity','float',s.opacity)}
${attr('thin_film_thickness','float',s.iridescenceThickness)}
  </standard_surface>
</materialx>
`;
}

export function oslSource(record){
  const s=surfaceRecord(record);
  return `shader fusion_surface(
    color BaseColor = color(${new THREE.Color(s.color).r},${new THREE.Color(s.color).g},${new THREE.Color(s.color).b}),
    float Roughness = ${s.roughness},
    float Metallic = ${s.metalness},
    float IOR = ${s.ior},
    output closure color BSDF = 0)
{
    closure color diff = BaseColor * diffuse(N);
    closure color spec = microfacet_ggx(N, Roughness);
    BSDF = mix(diff, spec, Metallic);
}
`;
}

export function stampRenderIds(root){
  root.traverse(n=>{
    if(n.isMesh)n.userData.fusion_render_object_id=n.uuid;
    for(const m of [].concat(n.material||[]))if(m){m.userData.fusion_material_id=m.uuid;if(m.userData.fusion_surface)m.userData.fusion_surface=surfaceRecord(m.userData.fusion_surface);}
  });
}

export function surfaceSidecar(scene){
  const materials=[];
  scene.traverse(n=>{
    if(!n.isMesh)return;
    const override=n.userData.fusion_material_override||n.parent&&surfaceOverride(n);
    for(const m of [].concat(n.material||[])){
      if(!m)continue;
      const record=m.userData.fusion_surface?surfaceRecord(m.userData.fusion_surface):null;
      if(!record&&!override&&!n.userData.fusion_ray_visibility&&!n.userData.fusion_decal)continue;
      materials.push({
        objectId:n.uuid,materialId:m.uuid,version:1,
        ...(record?{surface:record}:{}),
        ...(override?{override:surfaceRecord(override)}:{}),
        ...(n.userData.fusion_ray_visibility?{rayVisibility:rayVisibility(n.userData.fusion_ray_visibility)}:{}),
        ...(n.userData.fusion_decal?{decal:n.userData.fusion_decal}:{}),
        vertexColor:!!(record?.vertexColor&&n.geometry?.attributes.color)
      });
    }
  });
  return {version:1,materials};
}

function surfaceOverride(node){for(let n=node;n;n=n.parent)if(n.userData.fusion_material_override)return n.userData.fusion_material_override;return null;}

export const INSPECTOR_GROUPS=[
  {title:null,fields:[
    {key:'color',type:'color',label:'Base color'},
    {key:'workflow',type:'enum',label:'Workflow',values:enums.workflow},
    {key:'model',type:'enum',label:'BSDF',values:enums.model},
    {key:'roughness',type:'range',label:'Roughness',min:0,max:1},
    {key:'metalness',type:'range',label:'Metalness',min:0,max:1},
    {key:'specular',type:'range',label:'Specular',min:0,max:1},
    {key:'specularColor',type:'color',label:'Specular tint'},
    {key:'glossiness',type:'range',label:'Glossiness',min:0,max:1}
  ]},
  {title:'Refraction',fields:[
    {key:'ior',type:'range',label:'IOR',min:1,max:3,step:'.01'},
    {key:'transmission',type:'range',label:'Transmission',min:0,max:1},
    {key:'thickness',type:'range',label:'Thickness',min:0,max:1},
    {key:'attenuationColor',type:'color',label:'Attenuation'},
    {key:'subsurface',type:'range',label:'Subsurface',min:0,max:1},
    {key:'subsurfaceColor',type:'color',label:'SSS colour'},
    {key:'translucent',type:'range',label:'Translucency',min:0,max:1},
    {key:'iridescence',type:'range',label:'Iridescence',min:0,max:1}
  ]},
  {title:'Coat / sheen / anisotropy',fields:[
    {key:'clearcoat',type:'range',label:'Clearcoat',min:0,max:1},
    {key:'clearcoatRoughness',type:'range',label:'Coat roughness',min:0,max:1},
    {key:'sheen',type:'range',label:'Sheen',min:0,max:1},
    {key:'sheenColor',type:'color',label:'Sheen colour'},
    {key:'anisotropy',type:'range',label:'Anisotropy',min:0,max:1}
  ]},
  {title:'Emission / opacity / displacement',fields:[
    {key:'emission',type:'color',label:'Emission'},
    {key:'emissionIntensity',type:'range',label:'Emission strength',min:0,max:50,step:'.1'},
    {key:'opacity',type:'range',label:'Opacity',min:0,max:1},
    {key:'alphaMode',type:'enum',label:'Alpha',values:enums.alphaMode},
    {key:'displacement',type:'range',label:'Displacement',min:0,max:1},
    {key:'displacementMode',type:'enum',label:'Displace mode',values:enums.displacementMode}
  ]},
  {title:'Mapping / wear / volume',fields:[
    {key:'texCoord',type:'enum',label:'Coordinates',values:enums.texCoord},
    {key:'ao',type:'range',label:'Ambient occlusion',min:0,max:1},
    {key:'curvature',type:'range',label:'Curvature wear',min:0,max:1},
    {key:'weathering',type:'range',label:'Weathering',min:0,max:1},
    {key:'layerPreset',type:'enum',label:'Layer',values:enums.layerPreset},
    {key:'layerMix',type:'range',label:'Layer mix',min:0,max:1},
    {key:'volumeDensity',type:'range',label:'Volume density',min:0,max:20,step:'.1'},
    {key:'volumeColor',type:'color',label:'Volume colour'},
    {key:'shaderLanguage',type:'enum',label:'Shader language',values:enums.shaderLanguage}
  ]}
];
export {enums as SURFACE_ENUMS};
