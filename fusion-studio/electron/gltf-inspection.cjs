// Pure inspection policy. No renderer, network, or vendor-runtime dependency.
const crypto=require('node:crypto');
const MAX_BYTES=64*1024*1024,MAX_RESOURCES=256;
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
// These are the extensions translated by Fusion's installed-Blender exchange
// lane, not all extensions that Three.js or the validator can recognize.
const compatible=new Set(['KHR_lights_punctual','KHR_materials_clearcoat','KHR_materials_emissive_strength','KHR_materials_ior','KHR_materials_specular','KHR_materials_transmission','KHR_materials_iridescence','KHR_materials_unlit','KHR_materials_volume','KHR_materials_anisotropy','KHR_materials_sheen','KHR_texture_transform','KHR_mesh_quantization']);
function documentFromBytes(bytes){
 if(bytes.length>MAX_BYTES)throw Error('glTF inspection supports up to 64 MiB including external resources.');
 if(bytes.length>=4&&bytes.readUInt32LE(0)===0x46546c67){
  if(bytes.length<20||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('Invalid GLB 2 header or file length.');
  const length=bytes.readUInt32LE(12);if(bytes.readUInt32LE(16)!==0x4e4f534a||length%4||length>bytes.length-20)throw Error('Invalid GLB JSON chunk.');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(20,20+length)));
 }
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,''));
}
function inventory(doc){
 if(!doc||typeof doc!=='object'||Array.isArray(doc))throw Error('glTF document must be an object.');
 const array=key=>Array.isArray(doc[key])?doc[key]:[];
 const primitives=array('meshes').flatMap(m=>Array.isArray(m?.primitives)?m.primitives:[]),attributes=new Set(),materialFeatures=new Set();
 for(const p of primitives)for(const a of Object.keys(p?.attributes||{}))attributes.add(a);
 for(const m of array('materials'))for(const k of Object.keys(m?.extensions||{}))materialFeatures.add(k);
 const required=Array.isArray(doc.extensionsRequired)?doc.extensionsRequired.filter(x=>typeof x==='string'):[],used=Array.isArray(doc.extensionsUsed)?doc.extensionsUsed.filter(x=>typeof x==='string'):[];
 const extensions=[...new Set([...used,...required])].map(name=>({name,required:required.includes(name),outcome:compatible.has(name)?'compatible':required.includes(name)?'blocked':'approximate',detail:compatible.has(name)?'Translated through installed Blender; inspect appearance after conversion.':required.includes(name)?'This exchange route has no verified adapter for the required extension.':'Optional extension may be omitted by conversion.'}));
 const fields=[{field:'geometry / normals / UV / material groups',outcome:'compatible',detail:'Converted to evaluated triangles; validate the resulting working mesh.'}];
 for(const [field,present,detail]of [
  ['skins',array('skins').length,'General skin weights and hierarchy; vendor joint corrections are outside glTF.'],
  ['animation',array('animations').length,'Supported sampled clips; constraints and drivers are not glTF semantics.'],
  ['morph targets',primitives.some(p=>p?.targets?.length),'Standard morph targets; external formulas and HD deformation are not included.'],
  ['materials',array('materials').length,'PBR translation through Blender and Three.js is approximate.'],
  ['cameras',array('cameras').length,'Camera projection transfers; scene lighting and exposure need review.']
 ])if(present)fields.push({field,outcome:field==='materials'?'approximate':'compatible',detail});
 return {assetVersion:String(doc.asset?.version||''),generator:String(doc.asset?.generator||'').slice(0,300),counts:Object.fromEntries(['meshes','materials','textures','images','skins','animations','cameras','nodes'].map(k=>[k,array(k).length])),primitives:primitives.length,morphTargets:primitives.reduce((s,p)=>s+(Array.isArray(p?.targets)?p.targets.length:0),0),attributes:[...attributes].sort(),materialFeatures:[...materialFeatures].sort(),extensions,fields};
}
function assertUsable(report){
 if(report?.schema!==1||!report.complete||report.blocked||report.validator?.issues?.numErrors)throw Error('glTF validation blocked this operation. '+(report?.reasons||[]).join(' '));
 return report;
}
module.exports={MAX_BYTES,MAX_RESOURCES,hash,documentFromBytes,inventory,assertUsable};
