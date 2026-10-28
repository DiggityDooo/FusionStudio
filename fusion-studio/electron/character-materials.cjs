// Render sidecars contain fixed material parameters, never paths or scripts.
function characterMaterials(input){
 if(input===undefined)return null;
 if(!input||input.version!==1||!Array.isArray(input.materials)||input.materials.length>2048||JSON.stringify(input).length>2*1024*1024)throw Error('Invalid character render materials.');
 const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v),kinds=new Set(['skin','sclera','iris','cornea','pupil','hair','brows','teeth','mouth','nails']),seen=new Set();
 return {version:1,materials:input.materials.map(m=>{
  if(!m||!id(m.objectId)||!id(m.materialId)||!kinds.has(m.kind)||m.version!==1)throw Error('Invalid character material identity.');
  const key=m.objectId+':'+m.materialId;if(seen.has(key))throw Error('Duplicate character material identity.');seen.add(key);
  const out={objectId:m.objectId,materialId:m.materialId,version:1,kind:m.kind};
  if(m.appearanceVersion!==undefined){if(m.appearanceVersion!==1&&m.appearanceVersion!==2)throw Error('Unsupported character appearance version.');out.appearanceVersion=m.appearanceVersion;}
  for(const k of ['roughness','pores','freckles','ageDetail','subsurface','grey'])if(m[k]!==undefined){if(!Number.isFinite(m[k])||m[k]<0||m[k]>1)throw Error('Invalid character material '+k);out[k]=m[k];}
  if(m.displacement!==undefined){if(!Number.isFinite(m.displacement)||m.displacement<0||m.displacement>.005)throw Error('Invalid skin microdetail scale.');out.displacement=m.displacement;}
  for(const k of ['tone','roots'])if(m[k]!==undefined){if(typeof m[k]!=='string'||!/^#?[a-f\d]{6}$/i.test(m[k]))throw Error('Invalid character material color.');out[k]=m[k];}
  return out;
 })};
}
module.exports={characterMaterials};
