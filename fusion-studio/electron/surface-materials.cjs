const MODELS=new Set(['principled','toon','hair','volume','unlit']);
const WORKFLOWS=new Set(['metallic-roughness','specular-glossiness']);
const ALPHA=new Set(['opaque','blend','mask']);
const DISPLACE=new Set(['bump','normal','micro','vector']);
const COORDS=new Set(['uv','object','world']);
const LAYERS=new Set(['none','dirt','rust','dust']);
const LANG=new Set(['principled','osl','materialx']);
const RAY=['camera','diffuse','glossy','transmission','volumeScatter','shadow'];
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
const hex=v=>typeof v==='string'&&/^#?[a-f\d]{6}$/i.test(v);
const num=(v,lo,hi)=>Number.isFinite(v)&&v>=lo&&v<=hi;
function surface(s){
  if(!s||s.version!==1)throw Error('Invalid surface description.');
  if(!WORKFLOWS.has(s.workflow)||!MODELS.has(s.model)||!ALPHA.has(s.alphaMode)||!DISPLACE.has(s.displacementMode)||!COORDS.has(s.texCoord)||!LAYERS.has(s.layerPreset)||!LANG.has(s.shaderLanguage))throw Error('Unsupported surface enum.');
  for(const k of ['color','specularColor','attenuationColor','subsurfaceColor','sheenColor','emission','volumeColor'])if(!hex(s[k]))throw Error('Invalid surface colour.');
  const ranges={roughness:[0,1],metalness:[0,1],specular:[0,1],glossiness:[0,1],ior:[1,3],transmission:[0,1],thickness:[0,10],attenuationDistance:[0,100],subsurface:[0,1],subsurfaceScale:[0,1],translucent:[0,1],iridescence:[0,1],iridescenceIOR:[1,3],iridescenceThickness:[0,2000],clearcoat:[0,1],clearcoatRoughness:[0,1],sheen:[0,1],sheenRoughness:[0,1],anisotropy:[0,1],anisotropyRotation:[0,1],emissionIntensity:[0,1000],opacity:[0,1],alphaCutoff:[0,1],displacement:[0,1],ao:[0,1],curvature:[0,1],weathering:[0,1],layerMix:[0,1],volumeDensity:[0,100],volumeAnisotropy:[-1,1],volumeEmission:[0,100]};
  for(const [k,[lo,hi]] of Object.entries(ranges))if(!num(s[k],lo,hi))throw Error('Invalid surface '+k+'.');
  if(typeof s.vertexColor!=='boolean'||typeof s.instanceId!=='string'||s.instanceId.length>80)throw Error('Invalid surface flags.');
  if(s.graph){
    if(s.graph.version!==1||!Array.isArray(s.graph.nodes)||s.graph.nodes.length>64||!Array.isArray(s.graph.links)||s.graph.links.length>128)throw Error('Invalid shader graph.');
    const types=new Set(['output','principled','toon','hair','volume','mix','noise','voronoi','wave','checker','coord','vertex_color','ao','curvature','weathering','transparent','emission','layer']);
    const ids=new Set();
    for(const n of s.graph.nodes){if(!n||typeof n.id!=='string'||n.id.length>40||!types.has(n.type)||ids.has(n.id))throw Error('Invalid shader node.');ids.add(n.id);}
    for(const l of s.graph.links)if(!l||!ids.has(l.from)||!ids.has(l.to)||typeof l.socket!=='string'||l.socket.length>40)throw Error('Invalid shader link.');
  }
  return s;
}
function ray(v){if(!v||v.version!==1)throw Error('Invalid ray visibility.');const out={version:1};for(const k of RAY){if(v[k]!==undefined&&typeof v[k]!=='boolean')throw Error('Invalid ray visibility.');out[k]=v[k]!==false;}return out;}
function surfaceMaterials(input){
  if(input===undefined)return null;
  if(!input||input.version!==1||!Array.isArray(input.materials)||input.materials.length>4096||JSON.stringify(input).length>4*1024*1024)throw Error('Invalid surface materials.');
  return {version:1,materials:input.materials.map(m=>{
    if(!m||m.version!==1||!id(m.objectId)||!id(m.materialId))throw Error('Invalid surface material identity.');
    const out={objectId:m.objectId,materialId:m.materialId,version:1,vertexColor:!!m.vertexColor};
    if(m.surface)out.surface=surface(m.surface);
    if(m.override)out.override=surface(m.override);
    if(m.rayVisibility)out.rayVisibility=ray(m.rayVisibility);
    if(m.decal){if(!m.decal||typeof m.decal!=='object')throw Error('Invalid decal.');out.decal={size:num(m.decal.size,.001,10)?m.decal.size:null};if(out.decal.size===null)throw Error('Invalid decal size.');}
    return out;
  })};
}
module.exports={surfaceMaterials};
