import * as THREE from 'three';
import {defaultRecipe,validateRecipe,validateDeltas,creatorInputs,computeCreator,SKIN_TONES,mirrorShape} from './creator-data.js';
import {updateCreatorAttachments,configureSkinPreview} from './creator-appearance.js';

const libraries=new Map();
const definitions=new Map();
function bindDefinition(definition){const {source,provenance,...metadata}=definition,copy=structuredClone(metadata);Object.defineProperty(copy,'source',{value:source,enumerable:false});return copy;}
export async function hydrateCreator(root){
 const c=root.userData.fusion_creator;if(!c)return;if(!c.definition?.source){const asset=definitions.get(c.definition?.identity)||await loadCreatorLibrary({identity:c.definition?.identity});if(asset.identity!==c.definition?.identity||asset.id!==c.definition?.id)throw Error('This character foundation is missing or has changed. Restore its matching asset version.');c.definition=bindDefinition(asset);}validateCreator(root);
 let derived=false,result;const body=root.getObjectByName('Body');if(body?.geometry.userData.fusion_derived_creator_body){if(!body.isSkinnedMesh||body.skeleton.bones.length!==c.definition.source.bones.length)throw Error('The saved creator body is missing its matching rig.');result=computeCreator(creatorInputs(c.definition,c.recipe));const geometry=sourceMesh(c.definition,result.positions,body.material).geometry;geometry.uuid=body.geometry.uuid;body.geometry.dispose();body.geometry=geometry;derived=true;}
 root.traverse(n=>{if(n.geometry?.userData.fusion_derived_creator_hair)derived=true;});if(derived){const report=evaluateCreator(root,{result});if(!report.valid)throw Error(report.errors[0].message);}
}
// Strand buffers are reproducible display output. Persist their identity and
// recipe, rather than multiplying their large arrays through snapshot history.
// Generic exchange deliberately continues to use the complete live geometry.
export function creatorDerivedGeometry(scene){
 const ids=new Map();scene.traverse(n=>{const owner=creatorRoot(n);if(!n.isMesh||!owner)return;if(n.userData.fusion_hair_preview?.version===1)ids.set(n.geometry.uuid,'fusion_derived_creator_hair');else if(n.userData.fusion_creator_part==='body'&&!owner.userData.fusion_skin_edit?.edited)ids.set(n.geometry.uuid,'fusion_derived_creator_body');});
 return new Map([...ids].map(([uuid,kind])=>[uuid,{uuid,type:'BufferGeometry',data:{attributes:{position:{itemSize:3,type:'Float32Array',array:[],normalized:false}},index:{type:'Uint32Array',array:[]}},userData:{[kind]:1}}]));
}
export function compactCreatorDerivedGeometry(document,scene){
 const derived=creatorDerivedGeometry(scene);document.geometries=document.geometries?.map(g=>derived.get(g.uuid)||g);
 return document;
}
const evaluations=new WeakMap();
const geometryOwners=new WeakMap();
const V=()=>new THREE.Vector3();
export async function loadCreatorLibrary({signal,identity}={}){
 const key=identity||'current';if(identity&&!/^[a-f\d]{64}$/.test(identity))throw Error('Invalid character foundation identity.');
 if(!libraries.has(key))libraries.set(key,(async()=>{const base=new URL(/* @vite-ignore */ '../characters/',import.meta.url),index=await fetch(new URL('foundations.json',base));if(!index.ok)throw Error('The bundled character asset index is missing.');const manifest=await index.json();if(manifest.schema!==1||!Array.isArray(manifest.assets)||manifest.assets.length>100)throw Error('Invalid character foundation index.');const wanted=identity||manifest.current,entry=manifest.assets.find(v=>v.identity===wanted);if(!entry||!/^([a-f\d]{64})$/.test(entry.identity)||!/^[a-f\d]{64}$/.test(entry.sha256))throw Error('This saved character needs a missing foundation version. Restore its matching character assets.');const r=await fetch(new URL('versions/'+entry.identity+'.json.gz',base));if(!r.ok)throw Error('The bundled character foundation is missing.');const raw=await r.arrayBuffer();if(raw.byteLength>12*1024*1024)throw Error('Character foundation exceeds its compressed data limit.');const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),n=>n.toString(16).padStart(2,'0')).join('');if(hash!==entry.sha256)throw Error('The character foundation hash does not match its manifest. Restore the bundled asset.');const text=await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).text();if(text.length>40*1024*1024)throw Error('Character foundation exceeds its expanded data limit.');const d=JSON.parse(text);if(d.identity!==wanted)throw Error('Character foundation identity mismatch.');validateCreatorDefinition(d);return d;})().catch(e=>{libraries.delete(key);throw e;}));
 if(signal?.aborted)throw Error('Character creation cancelled.');const d=await libraries.get(key);if(signal?.aborted)throw Error('Character creation cancelled.');return d;
}
export function validateCreatorDefinition(d){
 if(!d||d.schema!==1||d.family!=='makehuman-hm08'||d.id!=='fusion.makehuman.adult.v1'||!/^[a-f\d]{64}$/.test(d.identity)||!Array.isArray(d.controls)||d.controls.length>512||!d.source)throw Error('Unsupported character definition.');
 const s=d.source,count=s.positions?.length/3;if(!Number.isInteger(count)||count<100||count>200000||s.positions.some(v=>!Number.isFinite(v)||Math.abs(v)>100)||!Array.isArray(s.triangles)||s.triangles.length%3||s.triangles.length>1200000||s.triangles.some(i=>!Number.isInteger(i)||i<0||i>=count)||!Array.isArray(s.cornerSource)||s.cornerSource.length!==s.triangles.length||s.cornerSource.some((v,i)=>v!==s.triangles[i])||!Array.isArray(s.cornerUV)||s.cornerUV.length!==s.triangles.length*2||s.cornerUV.some(v=>!Number.isFinite(v)||Math.abs(v)>100)||!Array.isArray(s.bones)||s.bones.length>2048||s.skinIndex?.length!==count*4||s.skinWeight?.length!==count*4||s.mirror?.length!==count)throw Error('Invalid character topology or correspondence.');
 const names=new Set(s.bones.map(b=>b.name));if(names.size!==s.bones.length||s.bones.some(b=>typeof b.name!=='string'||b.name.length>100||b.parent&&!names.has(b.parent)||!Array.isArray(b.landmarks)||!b.landmarks.length||b.landmarks.some(i=>!Number.isInteger(i)||i<0||i>=count)))throw Error('Invalid character rig landmarks.');
 for(const b of s.bones){const seen=new Set();let n=b;while(n){if(seen.has(n.name))throw Error('Character rig hierarchy contains a cycle.');seen.add(n.name);n=s.bones.find(v=>v.name===n.parent);}}
 if(s.skinIndex.some(v=>!Number.isInteger(v)||v<0||v>=s.bones.length)||s.skinWeight.some(v=>!Number.isFinite(v)||v<0||v>1)||s.mirror.some((v,i)=>!Number.isInteger(v)||v<0||v>=count||s.mirror[v]!==i))throw Error('Invalid character skin or mirror data.');
 for(let i=0;i<count;i++)if(Math.abs(s.skinWeight.slice(i*4,i*4+4).reduce((a,b)=>a+b,0)-1)>1e-5)throw Error('Unnormalized character skin weights.');
 if(!s.targets||Object.keys(s.targets).length>1024||new Set(d.controls.map(c=>c.id)).size!==d.controls.length)throw Error('Invalid character target library.');
 let rows=0;for(const data of Object.values(s.targets)){if(!Array.isArray(data)||data.length%4)throw Error('Invalid sparse target buffer.');rows+=data.length/4;if(rows>2000000)throw Error('Character library exceeds its sparse-data budget.');validateDeltas(data,count);}
 for(const c of d.controls)if(!c||typeof c.id!=='string'||c.id.length>200||!['Body','Face'].includes(c.category)||c.min!==-1||c.max!==1||!Array.isArray(s.targets[c.positive])||!Array.isArray(s.targets[c.negative]))throw Error('Invalid character control binding.');
 definitions.set(d.identity,d);return d;
}
export function validateCreator(root){const c=root.userData.fusion_creator;if(!c)return;validateCreatorDefinition(c.definition);validateRecipe(c.recipe,c.definition);}
export function creatorRoot(node){for(let n=node;n;n=n.parent)if(n.userData.fusion_creator)return n;return null;}
function sourceMesh(d,positions,material){
 const s=d.source,unique=new Map(),ids=[],uv=[],index=[];
 for(let corner=0;corner<s.triangles.length;corner++){const source=s.cornerSource[corner],u=s.cornerUV[corner*2],v=s.cornerUV[corner*2+1],key=source+':'+u+':'+v;if(!unique.has(key)){unique.set(key,ids.length);ids.push(source);uv.push(u,v);}index.push(unique.get(key));}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(ids.flatMap(i=>Array.from(positions.slice(i*3,i*3+3))),3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('_fusion_source_vertex',new THREE.Uint16BufferAttribute(ids,1));g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(ids.flatMap(i=>s.skinIndex.slice(i*4,i*4+4)),4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(ids.flatMap(i=>s.skinWeight.slice(i*4,i*4+4)),4));g.setIndex(index);
 const body=new THREE.SkinnedMesh(g,material);body.name='Body';body.userData={fusion_creator_part:'body',fusion_kind:'body'};body.castShadow=true;body.receiveShadow=true;return body;
}
function landmark(s,positions,bone){const p=V();for(const id of bone.landmarks)p.add(V().fromArray(positions,id*3));return p.divideScalar(bone.landmarks.length);}
function refitSkeleton(root,positions){
 const {definition:d}=root.userData.fusion_creator,s=d.source,body=root.getObjectByName('Body'),bones=body.skeleton.bones,map=new Map(bones.map(b=>[b.name,b])),saved=bones.map(b=>b.quaternion.clone()),points=new Map(s.bones.map(b=>[b.name,landmark(s,positions,b)]));
 bones.forEach(b=>b.quaternion.identity());for(const r of s.bones){const bone=map.get(r.name);bone.position.copy(points.get(r.name));if(r.parent)bone.position.sub(points.get(r.parent));}
 root.updateMatrixWorld(true);const inverseBody=body.matrixWorld.clone().invert();body.skeleton.boneInverses=bones.map(b=>b.matrixWorld.clone().premultiply(inverseBody).invert());bones.forEach((b,i)=>b.quaternion.copy(saved[i]));root.updateMatrixWorld(true);body.skeleton.update();
}
function updateBody(root,result){
 const body=root.getObjectByName('Body');if(geometryOwners.has(body.geometry)&&geometryOwners.get(body.geometry)!==root)body.geometry=body.geometry.clone();geometryOwners.set(body.geometry,root);const g=body.geometry,s=root.userData.fusion_creator.definition.source,map=g.attributes._fusion_source_vertex,p=g.attributes.position;
 if(g.morphAttributes.position?.length)g.dispose();
 // Raw typed-array remap: attribute getters + a throwaway canonical geometry
 // dominated the warm path. Normals accumulate over source triangles exactly
 // like computeVertexNormals (area-weighted cross sums, then normalize).
 const ids=map.array,pa=p.array,rp=result.positions,sourceNormal=new Float32Array(rp.length),tri=s.triangles;
 for(let f=0;f<tri.length;f+=3){const i0=tri[f]*3,i1=tri[f+1]*3,i2=tri[f+2]*3,ax=rp[i0],ay=rp[i0+1],az=rp[i0+2],abx=rp[i1]-ax,aby=rp[i1+1]-ay,abz=rp[i1+2]-az,acx=rp[i2]-ax,acy=rp[i2+1]-ay,acz=rp[i2+2]-az,cx=aby*acz-abz*acy,cy=abz*acx-abx*acz,cz=abx*acy-aby*acx;sourceNormal[i0]+=cx;sourceNormal[i0+1]+=cy;sourceNormal[i0+2]+=cz;sourceNormal[i1]+=cx;sourceNormal[i1+1]+=cy;sourceNormal[i1+2]+=cz;sourceNormal[i2]+=cx;sourceNormal[i2+1]+=cy;sourceNormal[i2+2]+=cz;}
 for(let v=0;v<sourceNormal.length;v+=3){const x=sourceNormal[v],y=sourceNormal[v+1],z=sourceNormal[v+2],l=Math.sqrt(x*x+y*y+z*z);if(l>0){sourceNormal[v]=x/l;sourceNormal[v+1]=y/l;sourceNormal[v+2]=z/l;}}
 const outNormal=new Float32Array(p.count*3);
 for(let i=0;i<p.count;i++){const o=i*3,src=ids[i]*3;pa[o]=rp[src];pa[o+1]=rp[src+1];pa[o+2]=rp[src+2];outNormal[o]=sourceNormal[src];outNormal[o+1]=sourceNormal[src+1];outNormal[o+2]=sourceNormal[src+2];}
 p.needsUpdate=true;g.setAttribute('normal',new THREE.BufferAttribute(outNormal,3));g.computeBoundingBox();g.computeBoundingSphere();refitSkeleton(root,result.positions);
 // Authored targets remain actual relative shape keys for generic exchange.
 // Body controls change the retained cage; authored shapes do not get baked twice.
 g.morphAttributes.position=[];body.morphTargetDictionary={};body.morphTargetInfluences=[];
 for(const shape of root.userData.fusion_creator.recipe.shapes){const values=new Float32Array(p.count*3),delta=new Map();for(let i=0;i<shape.deltas.length;i+=4)delta.set(shape.deltas[i],shape.deltas.slice(i+1,i+4).map(v=>v*result.scale));for(let i=0;i<map.count;i++){const d=delta.get(map.getX(i));if(d)values.set(d,i*3);}const a=new THREE.BufferAttribute(values,3);a.name=shape.id;body.morphTargetDictionary[shape.id]=g.morphAttributes.position.length;g.morphAttributes.position.push(a);body.morphTargetInfluences.push(shape.value);}g.morphTargetsRelative=true;
 // result already includes authored shapes. Remove their position contribution
 // from the cage before Three adds the live influences.
 for(let i=0;i<g.morphAttributes.position.length;i++){const a=g.morphAttributes.position[i].array,w=body.morphTargetInfluences[i];for(let j=0;j<p.array.length;j++)p.array[j]-=a[j]*w;}if(!g.morphAttributes.position.length)delete g.morphAttributes.position;p.needsUpdate=true;
 body.boundingBox=null;body.boundingSphere=null;
}
function signature(recipe){return JSON.stringify([recipe.sex,recipe.controls,recipe.shapes]);}
export function evaluateCreator(root,{result,deferAttachments=false}={}){
 const c=root.userData.fusion_creator;if(!c)return {valid:true,errors:[],warnings:[]};
 try{
  if(!c.definition.source){const asset=definitions.get(c.definition.identity);if(!asset)throw Error('Load the matching character foundation before evaluating this scene.');c.definition=bindDefinition(asset);}
  validateRecipe(c.recipe,c.definition);const sig=signature(c.recipe),old=evaluations.get(root);if(old?.signature===sig&&!result)return old.report;
  const output=validateCreatorResult(result||computeCreator(creatorInputs(c.definition,c.recipe)),c.definition.source.positions.length);
  let low=Infinity,high=-Infinity;for(const id of c.definition.source.cornerSource){const y=output.positions[id*3+1];low=Math.min(low,y);high=Math.max(high,y);}
  const tolerance=Math.max(1e-5,c.recipe.controls.height*1e-5);
  if(Math.abs(low)>tolerance||Math.abs(high-low-c.recipe.controls.height)>tolerance)throw Error('Character worker geometry is collapsed or does not match the requested height and ground.');
  updateBody(root,output);const report={valid:true,errors:[],warnings:[],milliseconds:output.milliseconds,sparseDeltas:output.sparseDeltas};evaluations.set(root,{signature:sig,positions:output.positions,scale:output.scale,report});updateCreatorAppearance(root,{deferAttachments});return report;
 }catch(e){return {valid:false,errors:[{channel:'character',message:e.message}],warnings:[]};}
}
export function creatorPositions(root){const r=evaluateCreator(root);if(!r.valid)throw Error(r.errors[0].message);return evaluations.get(root).positions;}
export function validateCreatorResult(result,count){if(!(result?.positions instanceof Float32Array)||result.positions.length!==count||result.positions.some(v=>!Number.isFinite(v)||Math.abs(v)>100)||!Number.isFinite(result.scale)||result.scale<=0||result.scale>20||!Number.isFinite(result.ground)||Math.abs(result.ground)>100||!Number.isFinite(result.milliseconds)||result.milliseconds<0||!Number.isInteger(result.sparseDeltas)||result.sparseDeltas<0||result.sparseDeltas>2000000)throw Error('Character worker returned malformed geometry or diagnostics.');return result;}
let sharedCreatorWorker=null; // the worker script is stateless; spawning it per slider tick cost more than the evaluation itself
export async function evaluateCreatorWorker(input,{context,signal,timeout=30000,WorkerClass}={}){
 if(signal?.aborted)throw Error('Character update cancelled.');
 return new Promise((resolve,reject)=>{const id=crypto.randomUUID(),ownWorker=!!WorkerClass,worker=WorkerClass?new WorkerClass(new URL('./creator-worker.js',import.meta.url),{type:'module'}):(sharedCreatorWorker??=new Worker(new URL('./creator-worker.js',import.meta.url),{type:'module'}));let done=false;const finish=(error,result,poison=false)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);worker.onmessage=null;worker.onerror=null;if(poison||ownWorker){worker.terminate();if(sharedCreatorWorker===worker)sharedCreatorWorker=null;}error?reject(error):resolve(result);},cancel=()=>finish(Error('Character update cancelled.'),null,true),timer=setTimeout(()=>finish(Error('Character update exceeded 30 seconds. Reduce the active shapes.'),null,true),timeout);signal?.addEventListener('abort',cancel,{once:true});worker.onerror=e=>finish(Error(e.message||'Character worker failed.'),null,true);worker.onmessage=e=>{const m=e.data;if(m?.id!==id)return;if(JSON.stringify(m.context)!==JSON.stringify(context))return finish(Error('Character worker revision mismatch.'));if(m.error)return finish(Error(m.error));try{validateCreatorResult(m.result,input.positions.length);finish(null,m.result);}catch(e){finish(e);}};try{worker.postMessage({id,context,input});}catch(e){finish(e,null,true);}});
}
export function createDetailedCharacter(definition,{sex='female'}={}){
 validateCreatorDefinition(definition);const recipe=defaultRecipe(sex),group=new THREE.Group();group.name=sex==='female'?'Adult female':'Adult male';
 group.userData={fusion_kind:'character',fusion_id:THREE.MathUtils.generateUUID(),source:'Fusion CC0 adult foundation',fusion_creator:{version:1,definition:bindDefinition(definition),recipe}};
 const result=computeCreator(creatorInputs(definition,recipe)),material=new THREE.MeshPhysicalMaterial({color:SKIN_TONES[recipe.appearance.tone],roughness:.48,metalness:0,clearcoat:.05});material.name='Fusion skin';material.userData.fusion_character_material={version:1,kind:'skin'};
 const body=sourceMesh(definition,result.positions,material),bones=definition.source.bones.map(b=>{const n=new THREE.Bone();n.name=b.name;return n;}),map=new Map(bones.map(b=>[b.name,b]));group.add(body);definition.source.bones.forEach((r,i)=>{const p=landmark(definition.source,result.positions,r);bones[i].position.copy(p);if(r.parent){bones[i].position.sub(landmark(definition.source,result.positions,definition.source.bones.find(b=>b.name===r.parent)));map.get(r.parent).add(bones[i]);}else body.add(bones[i]);});group.updateMatrixWorld(true);body.bind(new THREE.Skeleton(bones));const report=evaluateCreator(group,{result});if(!report.valid)throw Error(report.errors[0].message);return group;
}
export function changeCreator(root,recipe,{result,deferAttachments=false}={}){
 const c=root.userData.fusion_creator,old=c.recipe,next=structuredClone(validateRecipe(recipe,c.definition)),body=root.getObjectByName('Body'),geometry=body.geometry;c.recipe=next;
 try{const report=evaluateCreator(root,{result,deferAttachments});if(!report.valid)throw Error(report.errors[0].message);updateCreatorAppearance(root,{deferAttachments});return report;}
 catch(error){
  c.recipe=old; // A failed result may have cached the same recipe signature.
  evaluations.delete(root);const restored=evaluateCreator(root);
  if(!restored.valid)throw Error(error.message+'; character recovery failed: '+restored.errors.map(e=>e.message).join('; '));
  if(body.geometry!==geometry){const discarded=body.geometry;body.geometry=geometry;discarded.dispose();}
  throw error;
 }
}
export function creatorShape(root,{action,id,name,deltas}){
 const recipe=structuredClone(root.userData.fusion_creator.recipe),shape=recipe.shapes.find(s=>s.id===id);
 if(action==='create'){recipe.shapes.push({id:crypto.randomUUID(),name:(name||'New shape').trim().slice(0,80),value:0,min:0,max:1,deltas:deltas||[]});}
 else if(!shape)throw Error('Select an authored shape key.');
 else if(action==='rename')shape.name=String(name).trim().slice(0,80);
 else if(action==='duplicate')recipe.shapes.push({...structuredClone(shape),id:crypto.randomUUID(),name:(shape.name+' copy').slice(0,80)});
 else if(action==='mirror')recipe.shapes.push(mirrorShape(shape,root.userData.fusion_creator.definition.source.mirror));
 else if(action==='delete')recipe.shapes=recipe.shapes.filter(s=>s.id!==id);
 else throw Error('Unsupported shape-key operation.');return recipe;
}
export function makeShapeEditingCopy(root,id){
 const c=root.userData.fusion_creator,shape=c.recipe.shapes.find(s=>s.id===id);if(!shape)throw Error('Select an authored shape key.');
 // Author against immutable unposed raw coordinates. Shape deltas are expressed
 // in these same coordinates, independently of current proportions and pose.
 const p=new Float32Array(c.definition.source.positions);for(let i=0;i<shape.deltas.length;i+=4){const n=shape.deltas[i]*3;for(let j=0;j<3;j++)p[n+j]+=shape.deltas[i+j+1];}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setIndex(c.definition.source.triangles);g.computeVertexNormals();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:'#b8ada1',roughness:.65}));mesh.name='Shape edit · '+shape.name;mesh.userData.fusion_shape_session={version:1,owner:root.uuid,id,identity:c.definition.identity,index:Array.from(g.index.array)};return mesh;
}
export function finishShapeEditingCopy(root,mesh){
 const c=root.userData.fusion_creator,s=mesh.userData.fusion_shape_session,g=mesh.geometry;
 if(!s||s.owner!==root.uuid||s.identity!==c.definition.identity||g.attributes.position.count!==c.definition.source.positions.length/3||!g.index||g.index.count!==s.index.length||g.index.array.some((v,i)=>v!==s.index[i]))throw Error('The editing copy topology changed. Cancel and create a new shape-edit session.');
 const recipe=structuredClone(c.recipe),shape=recipe.shapes.find(v=>v.id===s.id);if(!shape)throw Error('Shape key was removed while editing.');shape.deltas=[];const base=c.definition.source.positions,p=g.attributes.position.array;
 for(let i=0;i<p.length;i+=3){const delta=[p[i]-base[i],p[i+1]-base[i+1],p[i+2]-base[i+2]];if(delta.some(v=>!Number.isFinite(v)))throw Error('Shape edit contains non-finite coordinates.');if(Math.hypot(...delta)>1e-7)shape.deltas.push(i/3,...delta);}shape.value=1;return validateRecipe(recipe,c.definition);
}

// Appearance, attachments and render metadata share stable semantic identities.
export function updateCreatorAppearance(root,{deferAttachments=false}={}){
 const c=root.userData.fusion_creator,r=c.recipe,a=r.appearance,body=root.getObjectByName('Body');if(!body)return;
 const mat=body.material,color=new THREE.Color(SKIN_TONES[Math.floor(a.tone)]).lerp(new THREE.Color(SKIN_TONES[Math.ceil(a.tone)]),a.tone%1);color.offsetHSL(a.undertone*.015,0,0);if(a.customColor)color.set(a.customColor);mat.color.copy(color);mat.roughness=a.roughness;mat.metalness=a.metalness||0;mat.bumpScale=.0001+a.pores*.00045+a.ageDetail*.0001;mat.userData.fusion_character_material={version:1,kind:'skin',...(a.version===2?{appearanceVersion:2}:{}),tone:color.getHexString(),undertone:a.undertone,pores:a.pores,freckles:a.freckles,ageDetail:a.ageDetail,subsurface:.12,displacement:.0002};mat.needsUpdate=true;
 // Attachment rebuilds (eyes, brows, 8k-strand hair) cost more than the body
 // evaluation. Gesture previews defer them; the next settled update rebuilds
 // once from the latest evaluated positions.
 if(deferAttachments)c.attachmentsStale=true;
 else{const evaluated=evaluations.get(root);if(evaluated)updateCreatorAttachments(root,evaluated.positions);c.attachmentsStale=false;}
 configureSkinPreview(mat,a);
 root.traverse(n=>{if(n.userData.fusion_creator_part==='iris')n.material.color.set(a.eye);for(const m of [].concat(n.material||[]))if(m.userData.fusion_character_material)m.userData.fusion_material_id=m.uuid;});
}
export function creatorRenderMaterials(scene){const materials=[],seen=new Set();scene.traverse(root=>{if(!root.userData.fusion_creator)return;root.traverse(n=>{if(n.isMesh)for(const m of [].concat(n.material||[]))if(m?.userData.fusion_character_material){const key=n.uuid+':'+m.uuid;if(!seen.has(key)){seen.add(key);materials.push({objectId:n.uuid,materialId:m.uuid,materialName:m.name,...structuredClone(m.userData.fusion_character_material),roughness:m.roughness});}}});});return {version:1,materials};}
