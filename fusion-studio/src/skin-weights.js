import * as THREE from 'three';
import {nodePath,pathNode,bonesOf} from './rig-paths.js';

const MAX_VERTICES=300000,MAX_BONES=2048;
const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,'0')).join('');
const sorted=weights=>[...weights].filter(([,w])=>w>0).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
const sameWeights=(a,b,tolerance=1e-6)=>new Set([...a.keys(),...b.keys()]).size===0||[...new Set([...a.keys(),...b.keys()])].every(k=>Math.abs((a.get(k)||0)-(b.get(k)||0))<=tolerance);

export function validateSkinEdit(root){
 const data=root.userData.fusion_skin_edit;if(data===undefined)return;
 if(!data||data.version!==1||typeof data.edited!=='boolean'||!Array.isArray(data.locks)||data.locks.length>MAX_BONES||data.revision!==undefined&&(!Number.isSafeInteger(data.revision)||data.revision<0))throw Error('Unsupported skin-weight editing metadata.');
 const seen=new Set();for(const entry of data.locks){const bone=pathNode(root,entry?.path);if(!Array.isArray(entry?.path)||!entry.path.length||entry.path.length>128||!bone?.isBone||bone.name!==entry.name||seen.has(bone.uuid))throw Error('A locked skin joint is missing or duplicated. Recreate its weight lock.');seen.add(bone.uuid);}
}
export function skinLocks(root){validateSkinEdit(root);return new Set((root.userData.fusion_skin_edit?.locks||[]).map(e=>pathNode(root,e.path).uuid));}
export function setSkinLocks(root,ids){
 if(!Array.isArray(ids)||ids.length>MAX_BONES||new Set(ids).size!==ids.length)throw Error('Choose distinct skeleton joints to lock.');
 const locks=ids.map(id=>{const bone=root.getObjectByProperty('uuid',id);if(!bone?.isBone)throw Error('The weight-lock joint is outside this character.');const path=nodePath(root,bone);if(!path.length||path.length>128)throw Error('Weight-lock hierarchy depth exceeds 128.');return {path,name:bone.name};});
 root.userData.fusion_skin_edit={version:1,edited:!!root.userData.fusion_skin_edit?.edited,revision:root.userData.fusion_skin_edit?.revision||0,locks};validateSkinEdit(root);
}
function scopeOf(root,mesh){for(let n=mesh;n&&n!==root.parent;n=n.parent)if(n.userData.dson_geometry_id&&n.userData.dson_deformation)return n;return mesh;}
function influences(mesh,index){
 const a=mesh.geometry.attributes.skinIndex,w=mesh.geometry.attributes.skinWeight,values=new Map();
 for(let c=0;c<4;c++){const i=a.getComponent(index,c),v=w.getComponent(index,c);if(!Number.isInteger(i)||i<0||i>=mesh.skeleton.bones.length||!Number.isFinite(v)||v<0||v>1+1e-6)throw Error('Skin indices or weights are invalid on '+mesh.name+'.');if(v>0){const id=mesh.skeleton.bones[i].uuid;values.set(id,(values.get(id)||0)+v);}}
 if(!values.size)throw Error('A vertex has no skin influence on '+mesh.name+'. Assign valid weights in an interchange source before editing.');return values;
}
function liveInput(model){
 model.root.updateWorldMatrix(true,true);
 return JSON.stringify({root:model.root.uuid,locks:model.root.userData.fusion_skin_edit||null,meshes:model.meshes.map(m=>({id:m.uuid,geometry:m.geometry.uuid,bind:m.bindMatrix.elements,bindInverse:m.bindMatrixInverse.elements,bindMode:m.bindMode,inverses:m.skeleton.boneInverses.map(b=>b.elements),bones:m.skeleton.bones.map(b=>[b.uuid,b.position.toArray(),b.quaternion.toArray(),b.scale.toArray(),b.matrixWorld.elements]),world:m.matrixWorld.elements,morph:m.morphTargetInfluences||[],attributes:['position','_fusion_source_vertex','skinIndex','skinWeight'].map(key=>{const a=m.geometry.attributes[key];return a?Array.from({length:a.count*a.itemSize},(_,i)=>a.getComponent(Math.floor(i/a.itemSize),i%a.itemSize)):null;}),index:m.geometry.index?Array.from(m.geometry.index.array):null}))});
}
export class SkinWeightModel{
 constructor(root){
  if(root.userData.nativeBlend||root.userData.modifierStack)throw Error('Weight editing cannot modify a preserved native scene or an evaluated modifier stack. Use an editable rig working copy first.');
  this.root=root;this.meshes=[];this.rows=new Map();this.vertexKeys=new Map();this.bones=new Map();this.bindings=new Map();this.locks=skinLocks(root);this.normalizationIssues=0;root.updateWorldMatrix(true,true);
  root.traverse(n=>{if(n.isSkinnedMesh)this.meshes.push(n);});if(!this.meshes.length||this.meshes.length>1024)throw Error('Weight editing requires 1–1,024 skinned mesh parts.');let count=0;
  for(const mesh of this.meshes){
   const g=mesh.geometry,p=g?.attributes.position,idx=g?.attributes.skinIndex,w=g?.attributes.skinWeight,source=g?.attributes._fusion_source_vertex;
   if(!p?.count||!idx||!w||idx.itemSize!==4||w.itemSize!==4||idx.normalized||idx.count!==p.count||w.count!==p.count||!mesh.skeleton?.bones.length||mesh.skeleton.bones.length>MAX_BONES)throw Error('Weight editing needs four valid skin slots and a supported skeleton.');
   count+=p.count;if(count>MAX_VERTICES)throw Error('Interactive weight editing is limited to 300,000 viewport vertices. Isolate or simplify this character.');
   if(mesh.skeleton.boneInverses.length!==mesh.skeleton.bones.length||[mesh.bindMatrix,mesh.bindMatrixInverse,...mesh.skeleton.boneInverses].some(m=>!m.elements.every(Number.isFinite)))throw Error('Skin binding matrices are incomplete or non-finite.');
   this.bindings.set(mesh.uuid,JSON.stringify(mesh.skeleton.bones.map((b,i)=>[b.uuid,mesh.skeleton.boneInverses[i].elements]).sort((a,b)=>a[0]<b[0]?-1:1)));
   if(source&&(source.count!==p.count||source.itemSize!==1))throw Error('Source-vertex mapping is malformed.');
   for(const bone of mesh.skeleton.bones){if(!bone.isBone||!root.getObjectByProperty('uuid',bone.uuid))throw Error('The skin skeleton is outside the selected character.');this.bones.set(bone.uuid,bone);}if(this.bones.size>MAX_BONES)throw Error('Weight editing is limited to 2,048 distinct joints.');
   mesh.skeleton.update();const scope=scopeOf(root,mesh),keys=[];
   for(let i=0;i<p.count;i++){
    const id=source?source.getX(i):i;if(!Number.isInteger(id)||id<0||id>2000000)throw Error('Source-vertex identity is invalid.');
    const key=scope.uuid+':'+id,weights=influences(mesh,i),base=new THREE.Vector3().fromBufferAttribute(p,i),entry={mesh,index:i};if(!base.toArray().every(Number.isFinite))throw Error('Skin positions must be finite.');let row=this.rows.get(key);
    if(row){const prior=row.entries[0].mesh;if(row.base.distanceTo(base)>1e-5||!sameWeights(row.weights,weights,1e-7)||this.bindings.get(prior.uuid)!==this.bindings.get(mesh.uuid)||prior.bindMatrix.elements.some((v,i)=>Math.abs(v-mesh.bindMatrix.elements[i])>1e-7)||prior.matrixWorld.elements.some((v,i)=>Math.abs(v-mesh.matrixWorld.elements[i])>1e-7))throw Error('Copies of source vertex '+id+' disagree across material seams. Repair the source mapping or weights before painting.');row.entries.push(entry);}
    else {row={key,id,scope:scope.uuid,weights,base,entries:[entry],neighbors:new Set()};this.rows.set(key,row);if(Math.abs([...weights.values()].reduce((a,b)=>a+b,0)-1)>1e-5)this.normalizationIssues++;}keys.push(key);
   }
   this.vertexKeys.set(mesh.uuid,keys);
  }
  for(const mesh of this.meshes){const keys=this.vertexKeys.get(mesh.uuid),index=mesh.geometry.index,total=index?.count||keys.length;if(total%3)throw Error('Skin topology is not triangular.');for(let i=0;i<total;i+=3){const tri=[0,1,2].map(j=>keys[index?index.getX(i+j):i+j]);if(tri.some(k=>!k))throw Error('Skin topology references a missing vertex.');for(let j=0;j<3;j++){const a=this.rows.get(tri[j]),b=this.rows.get(tri[(j+1)%3]);if(a!==b){a.neighbors.add(b.key);b.neighbors.add(a.key);}}}}
  this.vertexCount=count;this.input=liveInput(this);
 }
 position(row){if(!row.world){const {mesh,index}=row.entries[0];row.world=mesh.getVertexPosition(index,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);}return row.world;}
 value(key,bone){return this.rows.get(key)?.weights.get(bone)||0;}
}
export async function createSkinWeightModel(root){const model=new SkinWeightModel(root);model.inputHash=await digest(model.input);if(liveInput(model)!==model.input)throw Error('The skin changed while weight editing was prepared.');return model;}

// Locked values retain their original mass. The active influence gets the
// requested share, and other unlocked influences share the remaining budget.
export function redistributeWeights(weights,active,desired,locks=new Set()){
 if(!Number.isFinite(desired)||desired<0||desired>1)throw Error('Skin weights must be between zero and one.');if(locks.has(active))throw Error('The active joint is locked. Unlock it before changing its weights.');
 const locked=sorted(new Map([...weights].filter(([id])=>locks.has(id)))),mass=locked.reduce((n,[,w])=>n+w,0);if(mass>1+1e-6||locked.length>4)throw Error('Locked influences exceed the normalized four-slot budget. Unlock an influence first.');
 const budget=Math.max(0,1-mass),others=sorted(new Map([...weights].filter(([id])=>id!==active&&!locks.has(id)))),value=Math.min(budget,desired),slots=4-locked.length-(value>0?1:0);if(slots<0)throw Error('All four skin slots are locked. Unlock an influence first.');
 const kept=others.slice(0,slots),pruned=others.slice(slots),result=new Map(locked),total=kept.reduce((n,[,w])=>n+w,0);let applied=value;
 if(total>0){for(const [id,w] of kept)result.set(id,w/total*(budget-value));}else if(budget>0)applied=budget;
 if(applied>0)result.set(active,applied);for(const [id,w] of result)if(w<=1e-12)result.delete(id);
 return {weights:result,pruned,limited:Math.abs(applied-desired)>1e-6};
}
export function planSkinPatch(model,patch){
 if(!patch||patch.version!==1||patch.rootId!==model.root.uuid||patch.inputHash!==model.inputHash||!Array.isArray(patch.edits)||patch.edits.length>MAX_VERTICES)throw Error('Skin edit is stale or malformed. Prepare the stroke again on the current character.');
 const seen=new Set(),updates=[],pruned=[],limited=[];
 for(const edit of patch.edits){const row=model.rows.get(edit?.key);if(!row||seen.has(edit.key)||!model.bones.has(edit.boneId)||row.entries.some(({mesh})=>!mesh.skeleton.bones.some(b=>b.uuid===edit.boneId)))throw Error('Skin edit references a missing, duplicated or incompatible vertex/joint.');seen.add(edit.key);const result=redistributeWeights(row.weights,edit.boneId,edit.value,model.locks);if(result.pruned.length)pruned.push({key:row.key,sourceVertex:row.id,influences:result.pruned.map(([id,weight])=>({joint:model.bones.get(id)?.name||id,weight}))});if(result.limited)limited.push(row.key);if(!sameWeights(row.weights,result.weights,1e-9))updates.push({row,weights:result.weights});}
 return {updates,pruned,limited,changedVertices:updates.length,changedCopies:updates.reduce((n,u)=>n+u.row.entries.length,0)};
}
export function weightPatch(model,edits){return {version:1,rootId:model.root.uuid,inputHash:model.inputHash,edits};}
export async function applySkinPatch(root,patch,{acceptPruning=false,signal}={}){
 if(signal?.aborted)throw Error('Weight update cancelled.');const model=await createSkinWeightModel(root);if(signal?.aborted)throw Error('Weight update cancelled.');const plan=planSkinPatch(model,patch);
 if(plan.pruned.length&&!acceptPruning)throw Error('Review skin influence removal before applying this stroke: '+plan.pruned.length+' source vertices exceed four influences.');if(!plan.updates.length)return {changedVertices:0,changedCopies:0,pruned:0,limited:plan.limited.length};
 const next=new Map();for(const {row,weights} of plan.updates)for(const {mesh,index} of row.entries){let g=next.get(mesh);if(!g){g=mesh.geometry.clone();g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(Array.from({length:model.vertexKeys.get(mesh.uuid).length*4},(_,i)=>mesh.geometry.attributes.skinIndex.getComponent(Math.floor(i/4),i%4)),4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(Array.from({length:model.vertexKeys.get(mesh.uuid).length*4},(_,i)=>mesh.geometry.attributes.skinWeight.getComponent(Math.floor(i/4),i%4)),4));next.set(mesh,g);}const values=sorted(weights);for(let c=0;c<4;c++){const [id,w]=values[c]||[mesh.skeleton.bones[0].uuid,0];g.attributes.skinIndex.setComponent(index,c,mesh.skeleton.bones.findIndex(b=>b.uuid===id));g.attributes.skinWeight.setComponent(index,c,w);}}
 // No live buffer is changed until all inputs and replacement geometries exist.
 const old=new Set();for(const [mesh,g] of next){old.add(mesh.geometry);mesh.geometry=g;mesh.boundingBox=null;mesh.boundingSphere=null;}
 root.userData.fusion_skin_edit={version:1,edited:true,revision:(root.userData.fusion_skin_edit?.revision||0)+1,locks:structuredClone(root.userData.fusion_skin_edit?.locks||[])};
 let universe=root;while(universe.parent)universe=universe.parent;universe.traverse(n=>{if(n.geometry)old.delete(n.geometry);});for(const g of old)g.dispose();
 return {changedVertices:plan.changedVertices,changedCopies:plan.changedCopies,pruned:plan.pruned.length,limited:plan.limited.length};
}

// Surface-distance traversal keeps a brush on its connected skin sheet. A
// deliberate through-surface brush instead uses a world-space sphere.
class MinHeap{constructor(){this.a=[];}push(item){const a=this.a;let i=a.length;a.push(item);while(i){const p=(i-1)>>1;if(a[p][0]<=item[0])break;a[i]=a[p];i=p;}a[i]=item;}pop(){const a=this.a,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1][0]<a[c][0])c++;if(last[0]<=a[c][0])break;a[i]=a[c];i=c;}a[i]=last;}return first;}}
export function brushRegion(model,{meshId,faceIndex,point,radius,through=false}){
 if(!Array.isArray(point)||point.length!==3||!point.every(Number.isFinite)||!Number.isFinite(radius)||radius<.001||radius>1)throw Error('Choose a finite brush point and radius from 0.001 to 1 meter.');const center=new THREE.Vector3().fromArray(point),distances=new Map();
 if(through){for(const row of model.rows.values()){const d=model.position(row).distanceTo(center);if(d<radius)distances.set(row.key,d);}}
 else {const mesh=model.meshes.find(m=>m.uuid===meshId),keys=model.vertexKeys.get(meshId),index=mesh?.geometry.index,total=index?.count||keys?.length||0;if(!mesh||!Number.isInteger(faceIndex)||faceIndex<0||faceIndex*3+2>=total)throw Error('The brush face is no longer on this skin.');const heap=new MinHeap();for(let j=0;j<3;j++){const key=keys[index?index.getX(faceIndex*3+j):faceIndex*3+j],d=model.position(model.rows.get(key)).distanceTo(center);if(d<radius){distances.set(key,d);heap.push([d,key]);}}
  while(heap.a.length){const [d,key]=heap.pop();if(d!==distances.get(key))continue;const row=model.rows.get(key),p=model.position(row);for(const neighbor of row.neighbors){const n=model.rows.get(neighbor),distance=d+p.distanceTo(model.position(n));if(distance<radius&&distance<(distances.get(neighbor)??Infinity)){distances.set(neighbor,distance);heap.push([distance,neighbor]);}}}
 }
 return new Map([...distances].map(([key,d])=>[key,(1-d/radius)**2]));
}
export function brushEdits(model,region,{boneId,mode='replace',target=.75,strength=.5}={},exposure=new Map()){
 if(!model.bones.has(boneId)||!['replace','add','subtract','smooth'].includes(mode)||![strength,target].every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('Invalid weight brush settings.');const edits=[];
 for(const [key,falloff] of region){const row=model.rows.get(key),alpha=strength*falloff;if(alpha<=(exposure.get(key)||0))continue;exposure.set(key,alpha);const original=row.weights.get(boneId)||0,average=row.neighbors.size?[...row.neighbors].reduce((n,k)=>n+model.value(k,boneId),0)/row.neighbors.size:original,value=Math.min(1,Math.max(0,mode==='add'?original+alpha:mode==='subtract'?original-alpha:original+((mode==='smooth'?average:target)-original)*alpha));edits.push({key,boneId,value});}
 return edits;
}

export function retainProceduralSkin(old,next){
 if(!old.userData.fusion_skin_edit)return;validateSkinEdit(old);const before=[],after=[];old.traverse(n=>{if(n.isSkinnedMesh)before.push(n);});next.traverse(n=>{if(n.isSkinnedMesh)after.push(n);});
 if(old.userData.fusion_skin_edit.edited){if(before.length!==after.length)throw Error('Body rebuild cannot retain edited skin weights. Keep a working copy.');for(let i=0;i<before.length;i++){const a=before[i],b=after[i],g=a.geometry,h=b.geometry;if(g.attributes.position.count!==h.attributes.position.count||JSON.stringify(g.index?Array.from(g.index.array):null)!==JSON.stringify(h.index?Array.from(h.index.array):null))throw Error('Body topology changed; edited skin weights cannot be remapped safely. Keep a working copy.');const names=new Map(b.skeleton.bones.map((bone,j)=>[bone.name,j]));if(names.size!==b.skeleton.bones.length)throw Error('Body rebuild has ambiguous skin joints.');const indices=new Uint16Array(g.attributes.skinIndex.count*4);for(let j=0;j<indices.length;j++){const source=a.skeleton.bones[g.attributes.skinIndex.getComponent(Math.floor(j/4),j%4)],index=names.get(source?.name);if(index===undefined)throw Error('Body rebuild is missing an edited skin joint.');indices[j]=index;}h.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));h.setAttribute('skinWeight',g.attributes.skinWeight.clone());}}
 next.userData.fusion_skin_edit=structuredClone(old.userData.fusion_skin_edit);validateSkinEdit(next);
}
