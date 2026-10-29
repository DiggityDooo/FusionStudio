import * as THREE from 'three';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {reduceLod} from './lod-reduction.js';
import {lodInput,remapLodGeometry} from './lod-geometry.js';
import {bakeCharacterExchange,evaluateCharacter} from './deformation.js';
import {configureSkinPreview} from './creator-appearance.js';

export function validateLodLevels(levels){if(!Array.isArray(levels)||!levels.length||levels.length>6||levels.some((v,i)=>!Number.isFinite(v)||v<=0||v>1||i&&v>=levels[i-1]))throw Error('LOD levels must be 1–6 decreasing fractions in (0, 1].');return levels;}
const derivedKeys=['fusion_creator_part','fusion_hair_preview','fusion_attachment_key','fusion_ik','fusion_joint_limits','fusion_pose_presets','fusion_skin_edit','fusion_body_measurements','fusion_timeline','fusion_follow_path','fusion_constraints','fusion_armature','fusion_groom','fusion_lods','fusion_lod_set','fusion_lod_level','fusion_sculpt_layers','nativeBlend','dazNative','nativeSource','modifierStack','liveGarment','patternProject','character','garment','collisionShapes'];
const nodes=root=>{const out=[];root.traverse(n=>out.push(n));return out;};
function cloneLodTexture(texture){
 // Texture.copy marks its Source dirty. Give the surrogate an independent
 // Source first, so making a copy never increments the original image version.
 const surrogate=Object.create(Object.getPrototypeOf(texture));Object.defineProperties(surrogate,Object.getOwnPropertyDescriptors(texture));surrogate.source=new THREE.TextureSource(texture.source.data);surrogate.source.uuid=texture.source.uuid;surrogate.source.version=texture.source.version;return surrogate.clone();
}
function isolatedLodSource(source){
 const geometry=new Set(),materials=new Set(),textures=new Set(),root=cloneSkeleton(source),original=nodes(source),copied=nodes(root),matMap=new Map(),texMap=new Map();
 const cloneAttribute=a=>{if(a.isGLBufferAttribute||!a.array)throw Error('LOD attributes must be CPU-readable.');if(!a.isInterleavedBufferAttribute)return a.clone();const array=new a.array.constructor(a.count*a.itemSize);for(let i=0;i<a.count;i++)for(let c=0;c<a.itemSize;c++)array[i*a.itemSize+c]=a.array[i*a.data.stride+a.offset+c];const next=a.isFloat16BufferAttribute?new THREE.Float16BufferAttribute(array,a.itemSize,a.normalized):new THREE.BufferAttribute(array,a.itemSize,a.normalized);next.name=a.name;return next;};
 const cloneMaterial=m=>{if(m.isShaderMaterial)throw Error('Custom shader materials need an evaluated material working copy before LOD generation.');if(!matMap.has(m)){const next=m.clone();for(const [key,value]of Object.entries(m))if(value?.isTexture){if(!texMap.has(value)){const t=cloneLodTexture(value);texMap.set(value,t);textures.add(t);}next[key]=texMap.get(value);}materials.add(next);matMap.set(m,next);}return matMap.get(m);};
 const dispose=()=>{root.traverse(n=>{if(n.geometry)geometry.add(n.geometry);for(const m of [].concat(n.material||[])){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});for(const g of geometry)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();};
 try{for(let i=0;i<copied.length;i++){const n=copied[i],old=original[i];n.uuid=old.uuid;if(old.geometry){const g=new THREE.BufferGeometry();g.uuid=old.geometry.uuid;g.name=old.geometry.name;g.userData=structuredClone(old.geometry.userData);if(old.geometry.index)g.setIndex(cloneAttribute(old.geometry.index));for(const [key,a]of Object.entries(old.geometry.attributes))g.setAttribute(key,cloneAttribute(a));for(const [key,list]of Object.entries(old.geometry.morphAttributes))g.morphAttributes[key]=list.map(cloneAttribute);g.morphTargetsRelative=old.geometry.morphTargetsRelative;g.groups=structuredClone(old.geometry.groups);g.setDrawRange(old.geometry.drawRange.start,old.geometry.drawRange.count);n.geometry=g;geometry.add(g);}if(old.material)n.material=Array.isArray(old.material)?old.material.map(cloneMaterial):cloneMaterial(old.material);}
  source.updateWorldMatrix(true,true);root.matrix.copy(source.matrixWorld);root.matrixAutoUpdate=false;root.updateWorldMatrix(true,true);return {root,dispose};
 }catch(error){for(const g of geometry)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();throw error;}
}
export function prepareCharacterLods(root,{levels=[1,.5,.25],relativeTo}={}){
 validateLodLevels(levels);if(!root?.isObject3D||root.userData.fusion_lod_set)throw Error('Select the retained source character or mesh to generate LOD copies.');
 const original=root,isolated=isolatedLodSource(root);root=isolated.root;
 try{
 const evaluation=evaluateCharacter(root);if(!evaluation.valid)throw Error('Resolve character dependencies before generating LODs: '+evaluation.errors.slice(0,4).map(e=>(e.channel?e.channel+': ':'')+e.message).join('; '));root.updateWorldMatrix(true,true);
 const parts=[],all=nodes(root),warnings=['These are independent derived copies. Generator controls, modifier recipes, IK targets and global timeline dependencies remain on the original. Local clips retain remapped targets; rig and supported shape keys remain editable. Inspect deformations and shading after reduction.'];
 if(evaluation.warnings?.length)warnings.push(`The source has ${evaluation.warnings.length} unsupported dependency bindings. These copies retain the current Fusion viewport evaluation, not complete native controller behavior. Inspect the source compatibility report.`);
 for(const node of all){
  if(!node.isMesh)continue;if(node.isInstancedMesh||node.isBatchedMesh)throw Error('Convert instanced/batched geometry to an explicit working copy before generating LODs.');
  const geometry=node.geometry;if(!geometry?.attributes.position)throw Error('LOD source mesh has no positions.');
  if(node.isSkinnedMesh&&node.skeleton.bones.some(b=>!all.includes(b)))throw Error('Select the complete character including every skeleton bone before generating LODs.');
  if(node.isSkinnedMesh){const si=geometry.attributes.skinIndex,sw=geometry.attributes.skinWeight;if(!si||!sw||si.itemSize!==4||sw.itemSize!==4||si.count!==geometry.attributes.position.count||sw.count!==si.count||node.skeleton.boneInverses.length!==node.skeleton.bones.length||node.skeleton.boneInverses.some(m=>m.elements.some(v=>!Number.isFinite(v))))throw Error('LOD source has an incomplete skin binding.');for(let i=0;i<si.count;i++){let sum=0;for(let c=0;c<4;c++){const joint=si.getComponent(i,c),weight=sw.getComponent(i,c);if(!Number.isInteger(joint)||joint<0||joint>=node.skeleton.bones.length||!Number.isFinite(weight)||weight<0||weight>1)throw Error('LOD source has invalid skin indices or weights.');sum+=weight;}if(Math.abs(sum-1)>1e-4)throw Error('Normalize source skin weights before generating LOD copies.');}}
  const preserve=!!node.userData.fusion_eye_surface||!!node.userData.fusion_hair_preview;
  const input=preserve?null:lodInput(geometry),triangles=(geometry.index?.count??geometry.attributes.position.count)/3,materials=[].concat(node.material||[]);
  if(!Number.isInteger(triangles)||!triangles)throw Error('LOD source must contain triangles.');
  if(Array.isArray(node.material)&&geometry.groups.some(g=>!materials[g.materialIndex]))throw Error('LOD source material group references an absent slot.');
  if(!Array.isArray(node.material)&&input)input.materials.fill(0); // Three ignores groups with a single material.
  parts.push({id:node.uuid,name:node.name,geometry,input,preserve,triangles});
 }
 if(!parts.length||parts.length>256||parts.reduce((s,p)=>s+p.triangles*levels.length,0)>1800000)throw Error('LOD copies exceed the 256-part / 1.8-million estimated triangle budget. Use fewer levels or isolate parts.');
 if(parts.some(p=>p.preserve))warnings.push('Analytic eye surfaces and bound strand-hair previews are retained at full geometry resolution; whole-character reduction ratios can be higher than the requested body ratio.');
 const transform=n=>({matrix:n.matrix.toArray(),auto:n.matrixAutoUpdate,position:n.position.toArray(),quaternion:n.quaternion.toArray(),scale:n.scale.toArray()}),parentFrames=[];let ancestor=original.parent;while(ancestor&&ancestor!==relativeTo){parentFrames.unshift(transform(ancestor));ancestor=ancestor.parent;}if(relativeTo&&ancestor!==relativeTo)throw Error('The LOD source is outside the current project.');
 let sourceVisible=original.visible;relativeTo?.traverse(n=>{if(n.userData.fusion_lod_set?.sourceObjectId===original.uuid&&n.userData.fusion_lod_set.sourceVisible)sourceVisible=true;});return {source:root,sourceId:original.uuid,sourceVisible,levels:[...levels],parts,parentFrames,localTransform:transform(original),warnings,disposeSource:isolated.dispose};
 }catch(error){isolated.dispose();throw error;}
}

function materialFingerprint(material){const parameters={},textures={};for(const [key,value]of Object.entries(material)){if(['version','id','_listeners'].includes(key))continue;if(value?.isTexture)textures[key]={id:value.uuid,source:value.source.uuid,version:value.version,sourceVersion:value.source.version,channel:value.channel,colorSpace:value.colorSpace,flipY:value.flipY,offset:value.offset.toArray(),repeat:value.repeat.toArray(),center:value.center.toArray(),rotation:value.rotation,wrapS:value.wrapS,wrapT:value.wrapT,minFilter:value.minFilter,magFilter:value.magFilter,anisotropy:value.anisotropy,matrixAutoUpdate:value.matrixAutoUpdate,matrix:value.matrixAutoUpdate?null:value.matrix.toArray()};else if(value?.isColor||value?.isVector2||value?.isVector3||value?.isVector4)parameters[key]=value.toArray();else if(value===null||['number','boolean','string'].includes(typeof value))parameters[key]=value;}parameters.userData=structuredClone(material.userData);if(material.defines)parameters.defines=structuredClone(material.defines);return {parameters,textures};}
export async function characterLodFingerprint(root){
 root.updateWorldMatrix(true,true);const records=[{world:root.matrixWorld.toArray()}];for(const node of nodes(root)){
  const data=node.userData,state=data.fusion_deformation,authored=state?Object.fromEntries(['version','channels','morphs','formulas','correctives','poseInputs','formulasEnabled','identityErrors'].filter(k=>state[k]!==undefined).map(k=>[k,structuredClone(state[k])])):null;
  const row={id:node.uuid,name:node.name,parent:node===root?null:node.parent?.uuid,authored,rotationFrame:data.fusion_dson_rotation,sourceRotation:data.fusion_source_quaternion,importedDeformation:data.dson_deformation,jointLimits:data.fusion_joint_limits,creatorIdentity:data.fusion_creator?.definition?.identity,morphBindings:node.morphTargetDictionary,skinBones:node.skeleton?.bones.map(b=>b.uuid),bindMode:node.bindMode,bindMatrix:node.bindMatrix?.toArray(),matrix:node.matrixAutoUpdate?[...node.position.toArray(),...node.quaternion.toArray(),...node.scale.toArray()]:node.matrix.toArray(),visible:node.visible,kind:node.type,recipe:node.userData.fusion_creator?.recipe,morphs:node.morphTargetInfluences,clips:node.animations?.map(c=>c.toJSON()),materials:[].concat(node.material||[]).map(materialFingerprint),bones:node.skeleton?.boneInverses.map(m=>m.toArray())};
  if(node.geometry){const g=node.geometry;row.geometry={id:g.uuid,index:g.index?Array.from(g.index.array):null,groups:g.groups,range:[g.drawRange.start,g.drawRange.count],attributes:{},morphs:{},relative:g.morphTargetsRelative};const hash=async a=>{const data=new a.array.constructor(a.count*a.itemSize);for(let i=0;i<a.count;i++)for(let c=0;c<a.itemSize;c++)data[i*a.itemSize+c]=a.array[a.isInterleavedBufferAttribute?i*a.data.stride+a.offset+c:i*a.itemSize+c];return [a.itemSize,a.normalized,!!a.isFloat16BufferAttribute,a.name,a.array.constructor.name,Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data.buffer)),v=>v.toString(16).padStart(2,'0')).join('')];};for(const [key,a]of Object.entries(g.attributes))row.geometry.attributes[key]=await hash(a);for(const [key,list]of Object.entries(g.morphAttributes))row.geometry.morphs[key]=await Promise.all(list.map(hash));}
  records.push(row);
 }
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(records)))),v=>v.toString(16).padStart(2,'0')).join('');
}

function copyLocalClips(source,copy){
 const a=nodes(source),b=nodes(copy),ids=new Map(a.map((n,i)=>[n.uuid,b[i].uuid])),byName=new Map();for(let i=0;i<a.length;i++){if(byName.has(a[i].name))byName.set(a[i].name,null);else byName.set(a[i].name,b[i].uuid);}
 for(let i=0;i<a.length;i++)b[i].animations=(a[i].animations||[]).map(clip=>{const next=clip.clone();for(const track of next.tracks){const parsed=THREE.PropertyBinding.parseTrackName(track.name),old=parsed.nodeName;if(old&&!(ids.has(old)||byName.get(old)))throw Error('LOD animation target is external or ambiguous: '+old);const replacement=old?(ids.get(old)||byName.get(old)):b[i].uuid;track.name=old?track.name.replace(old,replacement):replacement+track.name;}return next;});
}
export function assembleCharacterLods(plan,results,{context,sourceHash}={}){
 const expected=plan.parts.filter(p=>!p.preserve),seen=new Map();if(!Array.isArray(results)||results.length!==expected.length)throw Error('LOD worker result has the wrong part count.');
 for(const part of results){if(seen.has(part.id)||!expected.some(p=>p.id===part.id)||part.levels?.length!==plan.levels.length)throw Error('LOD worker part identity or level count is invalid.');seen.set(part.id,part);}
 const group=new THREE.Group(),ownedGeometry=new Set(),ownedMaterials=new Set(),ownedTextures=new Set(),summary=[];group.name=plan.source.name+' LOD copies';
 const dispose=()=>{for(const g of ownedGeometry)g.dispose();for(const m of ownedMaterials)m.dispose();for(const t of ownedTextures)t.dispose();group.removeFromParent();};
 try{
  for(let level=0;level<plan.levels.length;level++){
   const keep=plan.levels[level],copy=cloneSkeleton(plan.source),sourceNodes=nodes(plan.source),copyNodes=nodes(copy),partReports=[],materials=new Map();copyLocalClips(plan.source,copy);
   // Retained local clips keep actual Three keys. Fusion controller programs
   // remain on the original rather than being attached to a different cage.
   const levelRoot=new THREE.Group();levelRoot.name=`${plan.source.name} LOD ${level} (${Math.round(keep*100)}%)`;levelRoot.visible=level===0;levelRoot.userData.fusion_lod_level={version:1,sourceObjectId:plan.sourceId};const apply=(node,t)=>{node.position.fromArray(t.position);node.quaternion.fromArray(t.quaternion);node.scale.fromArray(t.scale);node.matrix.fromArray(t.matrix);node.matrixAutoUpdate=t.auto;};let parent=levelRoot;for(const t of plan.parentFrames){const frame=new THREE.Group();frame.name='Retained parent frame';apply(frame,t);parent.add(frame);parent=frame;}bakeCharacterExchange(copy);apply(copy,plan.localTransform);copy.visible=true;parent.add(copy);levelRoot.animations=copy.animations;copy.animations=[];
   for(let i=0;i<copyNodes.length;i++){
    const node=copyNodes[i],original=sourceNodes[i];for(const key of derivedKeys)delete node.userData[key];node.userData.fusion_id=node.uuid;delete node.userData.fusion_render_object_id;
    if(node.isMesh){
     const part=plan.parts.find(p=>p.id===original.uuid),result=seen.get(part.id)?.levels[level];let report;
     if(part.preserve||keep===1){node.geometry=new THREE.BufferGeometry().copy(part.geometry);node.geometry.userData=structuredClone(part.geometry.userData);report={version:1,method:'retained',sourceTriangles:part.triangles,outputTriangles:part.triangles,sourceVertices:part.geometry.attributes.position.count,outputVertices:part.geometry.attributes.position.count,achieved:keep===1,targetTriangles:Math.ceil(part.triangles*keep),milliseconds:0,warnings:part.preserve&&keep<1?['Protected eye/hair geometry retained.']:[]};}
     else{node.geometry=remapLodGeometry(part.geometry,result,part.input);report=result.diagnostics;}
     ownedGeometry.add(node.geometry);delete node.geometry.userData.fusion_derived_creator_body;delete node.geometry.userData.fusion_derived_creator_hair;
     const material=m=>{if(!materials.has(m)){const next=m.clone();for(const [key,v]of Object.entries(m))if(v?.isTexture){next[key]=cloneLodTexture(v);ownedTextures.add(next[key]);}next.userData.fusion_material_id=next.uuid;if(next.userData.fusion_character_material?.kind==='skin')configureSkinPreview(next,next.userData.fusion_character_material);materials.set(m,next);ownedMaterials.add(next);}return materials.get(m);};node.material=Array.isArray(original.material)?original.material.map(material):material(original.material);if(node.isSkinnedMesh){node.boundingBox=null;node.boundingSphere=null;}
     if(node.isSkinnedMesh&&node.skeleton.bones.some(b=>!b))throw Error('LOD skeleton clone is incomplete. Select the entire character.');
     node.userData.fusion_kind='mesh';node.userData.fusion_lod_part={version:1,sourceObjectId:original.uuid,keep};partReports.push({id:node.uuid,sourceObjectId:part.id,name:part.name,...structuredClone(report)});
    }
   }
   group.add(levelRoot);summary.push({id:levelRoot.uuid,keep,triangles:partReports.reduce((s,p)=>s+p.outputTriangles,0),sourceTriangles:plan.parts.reduce((s,p)=>s+p.triangles,0),parts:partReports});
  }
  group.userData.fusion_lod_set={version:2,sourceObjectId:plan.sourceId,sourceVisible:plan.sourceVisible,active:0,sourceHash:sourceHash||null,context:context?structuredClone(context):null,levels:summary,warnings:[...plan.warnings]};return {group,dispose};
 }catch(error){dispose();throw error;}
}
export function generateCharacterLods(root,options={}){const plan=prepareCharacterLods(root,options);try{const results=plan.parts.filter(p=>!p.preserve).map(p=>({id:p.id,levels:plan.levels.map(keep=>reduceLod(p.input,{keep}))}));return assembleCharacterLods(plan,results).group;}finally{plan.disposeSource();}}

export function validateLodSets(root){root.traverse(group=>{const m=group.userData.fusion_lod_set;if(!m)return;if(m.version!==2||typeof m.sourceObjectId!=='string'||typeof m.sourceVisible!=='boolean'||!Array.isArray(m.levels)||m.levels.length!==group.children.length||!m.levels.length||m.levels.length>6||!Number.isInteger(m.active)||m.active< -1||m.active>=m.levels.length||!Array.isArray(m.warnings)||m.warnings.some(v=>typeof v!=='string'||v.length>2000))throw Error('Invalid saved character LOD set.');validateLodLevels(m.levels.map(l=>l.keep));for(let i=0;i<m.levels.length;i++){const row=m.levels[i];if(row.id!==group.children[i].uuid||!Number.isInteger(row.triangles)||row.triangles<1||!Array.isArray(row.parts)||row.parts.length>256)throw Error('Saved LOD level identities or counts are invalid.');}});}
export function selectCharacterLod(scene,group,index){validateLodSets(group);const m=group.userData.fusion_lod_set;if(!m||!Number.isInteger(index)||index< -1||index>=m.levels.length)throw Error('Select a valid character LOD level.');const source=scene.getObjectByProperty('uuid',m.sourceObjectId);if(index===-1&&!source)throw Error('The retained LOD source is missing. Restore the source character or its saved project version.');scene.traverse(n=>{if(n!==group&&n.userData.fusion_lod_set?.sourceObjectId===m.sourceObjectId)n.visible=false;});if(source)source.visible=index<0?m.sourceVisible:false;group.visible=index>=0;group.children.forEach((n,i)=>n.visible=i===index);m.active=index;return group;}

export function runLodWorker(parts,levels,context,{signal,workerFactory=()=>new Worker(new URL('./lod-worker.js',import.meta.url),{type:'module'})}={}){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(Error('LOD generation cancelled.'));return;}let worker,timer,settled=false;const id=context.requestId,finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);worker?.terminate();error?reject(error):resolve(result);},cancel=()=>finish(Error('LOD generation cancelled.'));
  try{worker=workerFactory();worker.onmessage=e=>{const r=e.data;if(r?.id!==id||JSON.stringify(r?.context)!==JSON.stringify(context)){finish(Error('LOD worker returned a stale or mismatched revision.'));return;}finish(r.error?Error(r.error):null,r.results);};worker.onerror=e=>finish(Error('LOD worker failed: '+(e.message||'unknown error')));signal?.addEventListener('abort',cancel,{once:true});timer=setTimeout(()=>finish(Error('LOD generation exceeded 120 seconds; use fewer levels or a smaller mesh.')),120000);worker.postMessage({id,context,parts,levels});}catch(error){finish(error);}
 });
}
