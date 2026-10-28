import * as THREE from 'three';

export const SCULPT_LAYER_LIMITS={vertices:300000,layers:32,deltaVertices:1000000,coordinate:1000000};
const KEY='fusion_sculpt_layers',finite=x=>Number.isFinite(x)&&Math.abs(x)<=SCULPT_LAYER_LIMITS.coordinate;
const fail=message=>{throw Error('Sculpt layers: '+message);};
const nameOf=value=>{if(typeof value!=='string'||!value.trim()||value.length>80)fail('use a nonempty layer name of at most 80 characters.');return value.trim();};

export function assertLayerEditable(mesh){
  if(!mesh?.isMesh||!mesh.geometry?.attributes.position)fail('select a static mesh.');
  for(let node=mesh;node;node=node.parent)if(node.userData.nativeBlend||node.userData.modifierStack||node.userData.fusion_creator||node.userData.dson_deformation||node.userData.liveGarment||node.userData.patternProject||node.userData.fusion_shape_session||['character','garment','pattern'].includes(node.userData.fusion_kind))fail('make an explicit static working copy to retain native, character, shape-key or garment controls.');
  if(mesh.isSkinnedMesh||Object.values(mesh.geometry.morphAttributes).some(a=>a?.length))fail('make a static working copy to retain skinning and shape keys.');
  const p=mesh.geometry.attributes.position;
  if(p.itemSize!==3||p.count<1||p.count>SCULPT_LAYER_LIMITS.vertices||!(p.array instanceof Float32Array))fail('the editable cage must have 1–300,000 Float32 XYZ vertices.');
}

export function sculptTopology(geometry){
  const p=geometry?.attributes.position,index=geometry?.index,ids=geometry?.attributes._fusion_source_vertex;
  if(!p||p.count>SCULPT_LAYER_LIMITS.vertices)fail('invalid or oversized topology.');
  if(index&&index.count>1800000)fail('topology exceeds 600,000 triangles.');
  if(ids&&(ids.itemSize!==1||ids.count!==p.count))fail('invalid source-vertex mapping.');
  let a=2166136261>>>0,b=0x9e3779b9;const mix=v=>{a=Math.imul(a^(v>>>0),16777619)>>>0;b=(Math.imul(b^((v>>>0)+0x7f4a7c15),2246822519)+3266489917)>>>0;};
  mix(p.count);mix(index?.count||0);mix(ids?1:0);
  if(index)for(let i=0;i<index.count;i++){const v=index.getX(i);if(!Number.isInteger(v)||v<0||v>=p.count)fail('topology references a missing vertex.');mix(v);}
  if(ids)for(let i=0;i<ids.count;i++){const id=ids.getX(i);if(!Number.isInteger(id)||id<0||id>0xffffffff)fail('source-vertex IDs must be finite unsigned integers.');mix(id);}
  return {vertices:p.count,indexCount:index?.count||0,sourceIds:!!ids,hash:a.toString(16).padStart(8,'0')+b.toString(16).padStart(8,'0')};
}

function positions(geometry){const p=geometry.attributes.position,result=new Float32Array(p.count*3);for(let i=0;i<p.count;i++)for(let c=0;c<3;c++){const v=p.getComponent(i,c);if(!finite(v))fail('positions must be finite and within ±1,000,000 model units.');result[i*3+c]=v;}return result;}
function validateDocument(doc,geometry){
  if(!doc||doc.version!==2||!Array.isArray(doc.layers)||!doc.layers.length||doc.layers.length>SCULPT_LAYER_LIMITS.layers||typeof doc.active!=='string')fail('unsupported or malformed layer document.');
  const topology=sculptTopology(geometry);if(Object.keys(topology).some(k=>doc.topology?.[k]!==topology[k]))fail('topology/source mapping changed. Retain the layered source and use a static working copy for topology edits.');
  if(!Array.isArray(doc.base)||doc.base.length!==topology.vertices*3||!doc.base.every(finite))fail('invalid retained base positions.');
  let total=0;const ids=new Set();
  for(const layer of doc.layers){
    if(!layer||typeof layer.id!=='string'||!layer.id||layer.id.length>80||ids.has(layer.id))fail('layer IDs must be unique stable identifiers.');ids.add(layer.id);nameOf(layer.name);
    if(!Number.isFinite(layer.strength)||Math.abs(layer.strength)>1||typeof layer.visible!=='boolean'||typeof layer.locked!=='boolean')fail('invalid layer strength, visibility or lock.');
    const d=layer.deltas;if(!d||!Array.isArray(d.indices)||!Array.isArray(d.values)||d.values.length!==d.indices.length*3||!d.values.every(finite))fail('invalid sparse layer deltas.');
    if((total+=d.indices.length)>SCULPT_LAYER_LIMITS.deltaVertices)fail('the document exceeds one million sparse vertex deltas.');
    let previous=-1;for(const index of d.indices){if(!Number.isInteger(index)||index<=previous||index>=topology.vertices)fail('delta indices must be ordered, unique and within the retained cage.');previous=index;}
  }
  if(!ids.has(doc.active))fail('the active layer is missing.');return doc;
}

export function sculptLayerPositions(doc){
  const sum=Float64Array.from(doc.base);
  // Additive layer order is organizational. Stable summation also avoids order
  // changes introducing floating-point differences into saved mesh positions.
  for(const layer of [...doc.layers].sort((a,b)=>a.id.localeCompare(b.id))){
    if(!layer.visible||!layer.strength)continue;const {indices,values}=layer.deltas;
    for(let i=0;i<indices.length;i++)for(let c=0;c<3;c++)sum[indices[i]*3+c]+=values[i*3+c]*layer.strength;
  }
  if(!sum.every(finite))fail('combined layers exceed the supported coordinate range.');return Float32Array.from(sum);
}

function samePositions(actual,expected){for(let i=0;i<actual.length;i++)if(actual[i]!==expected[i])return false;return true;}
export function validateSculptLayers(mesh,{matchPositions=true}={}){
  const doc=mesh?.userData?.[KEY];if(doc===undefined)return null;
  if(doc.version===undefined||doc.version===1){
    if(!Array.isArray(doc.layers)||!doc.layers.length||doc.layers.length>SCULPT_LAYER_LIMITS.layers||doc.layers.some(l=>!l||l.deltas!=null))fail('legacy layer data cannot be migrated without discarding unknown deltas. Keep the original project.');
    return doc;
  }
  assertLayerEditable(mesh);
  validateDocument(doc,mesh.geometry);
  if(matchPositions&&!samePositions(positions(mesh.geometry),sculptLayerPositions(doc)))fail('mesh positions diverged from the retained layer evaluation. Undo the external edit or use an explicit static working copy; layers will not overwrite it.');
  return doc;
}

export function sculptBufferCopy(geometry){
  const copy=geometry.clone();copy.type='BufferGeometry';delete copy.parameters;
  for(const [name,attribute]of Object.entries(geometry.attributes))if(attribute.isInterleavedBufferAttribute){
    const raw=attribute.data.array,array=new raw.constructor(attribute.count*attribute.itemSize);
    for(let i=0;i<attribute.count;i++)for(let c=0;c<attribute.itemSize;c++)array[i*attribute.itemSize+c]=raw[i*attribute.data.stride+attribute.offset+c];
    copy.setAttribute(name,new THREE.BufferAttribute(array,attribute.itemSize,attribute.normalized));
  }
  return copy;
}
function writeDocument(mesh,doc,{copy=true}={}){
  validateDocument(doc,mesh.geometry);const evaluated=sculptLayerPositions(doc);
  if(copy&&samePositions(positions(mesh.geometry),evaluated)){mesh.userData[KEY]=doc;return doc;}
  const geometry=copy?sculptBufferCopy(mesh.geometry):mesh.geometry,p=geometry.attributes.position;
  if(!copy&&!p.isInterleavedBufferAttribute&&p.array instanceof Float32Array){p.array.set(evaluated);p.needsUpdate=true;}else geometry.setAttribute('position',new THREE.Float32BufferAttribute(evaluated,3));
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  mesh.geometry=geometry;mesh.userData[KEY]=doc;return doc;
}

export function createSculptLayers(mesh,{names=['Base','Detail']}={}){
  assertLayerEditable(mesh);const existing=validateSculptLayers(mesh);
  if(existing?.version===2)return existing;
  if(!Array.isArray(names)||!names.length||names.length>SCULPT_LAYER_LIMITS.layers)fail('create 1–32 named layers.');
  const entries=existing?.layers||names.map(name=>({name})),used=new Set();
  const layers=entries.map((entry,i)=>{const id=entry.id||`legacy-layer-${i}`;if(used.has(id))fail('legacy layer IDs are ambiguous.');used.add(id);return {id:existing?id:THREE.MathUtils.generateUUID(),name:nameOf(entry.name),strength:entry.strength??1,visible:entry.visible??true,locked:entry.locked??false,deltas:{indices:[],values:[]}};});
  const active=layers.some(l=>l.id===existing?.active)?existing.active:layers[0].id;
  if(existing&&JSON.stringify(existing).length>1000000)fail('legacy layer metadata exceeds the one-megabyte migration limit. Retain the original project.');
  const doc={version:2,topology:sculptTopology(mesh.geometry),base:Array.from(positions(mesh.geometry)),source:{type:mesh.geometry.type,...mesh.geometry.parameters?{parameters:structuredClone(mesh.geometry.parameters)}:{}},active,layers};
  if(existing)doc.legacy=structuredClone(existing);
  return writeDocument(mesh,doc);
}

export function editSculptLayer(mesh,action,{id,value,name,index}={}){
  const current=validateSculptLayers(mesh);if(current?.version!==2)fail('enable or migrate sculpt layers first.');
  const doc={...current,layers:current.layers.map(l=>({...l}))},layer=doc.layers.find(l=>l.id===(id??doc.active));
  if(!layer)fail('the selected layer no longer exists.');
  if(action==='add'){
    if(doc.layers.length>=SCULPT_LAYER_LIMITS.layers)fail('at most 32 layers are supported.');
    const next={id:THREE.MathUtils.generateUUID(),name:nameOf(name??`Layer ${doc.layers.length+1}`),strength:1,visible:true,locked:false,deltas:{indices:[],values:[]}};doc.layers.push(next);doc.active=next.id;
  }else if(action==='active')doc.active=layer.id;
  else if(action==='rename')layer.name=nameOf(name);
  else if(action==='strength'){if(!Number.isFinite(value)||Math.abs(value)>1)fail('strength must be a finite value from −1 to 1.');layer.strength=value;}
  else if(action==='visible'||action==='locked'){if(typeof value!=='boolean')fail('visibility and lock values must be boolean.');layer[action]=value;}
  else if(action==='duplicate'){
    if(doc.layers.length>=SCULPT_LAYER_LIMITS.layers)fail('at most 32 layers are supported.');const next={...structuredClone(layer),id:THREE.MathUtils.generateUUID(),name:nameOf((layer.name+' copy').slice(0,80))};doc.layers.splice(doc.layers.indexOf(layer)+1,0,next);doc.active=next.id;
  }else if(action==='delete'){
    if(doc.layers.length===1)fail('retain at least one layer; use a static working copy to bake all layers.');doc.layers=doc.layers.filter(l=>l!==layer);if(doc.active===layer.id)doc.active=doc.layers[0].id;
  }else if(action==='move'){
    if(!Number.isInteger(index)||index<0||index>=doc.layers.length)fail('invalid destination layer order.');doc.layers.splice(doc.layers.indexOf(layer),1);doc.layers.splice(index,0,layer);
  }else fail('unsupported layer action.');
  return writeDocument(mesh,doc);
}
export function setSculptLayerStrength(mesh,id,value){editSculptLayer(mesh,'strength',{id,value});return mesh.userData[KEY].layers.find(l=>l.id===id);}

export function captureSculptLayerEdit(mesh){
  const doc=validateSculptLayers(mesh);if(!doc)return null;if(doc.version!==2)fail('migrate the legacy layer document before editing.');
  const layer=doc.layers.find(l=>l.id===doc.active);if(layer.locked||!layer.visible||Math.abs(layer.strength)<.0001)fail('the active layer must be visible, unlocked and have strength of at least 0.0001 to record an edit.');
  return {mesh,document:doc,geometry:mesh.geometry,position:positions(mesh.geometry),layerId:layer.id};
}

export function finishSculptLayerEdit(token){
  if(!token)return null;const {mesh,document:current}=token;
  if(mesh.userData[KEY]!==current)fail('layer state changed during the gesture.');validateDocument(current,mesh.geometry);
  const after=positions(mesh.geometry);if(samePositions(after,token.position))return current;
  const old=current.layers.find(l=>l.id===token.layerId),values=new Map(old.deltas.indices.map((id,i)=>[id,old.deltas.values.slice(i*3,i*3+3)]));
  for(let i=0;i<after.length/3;i++){
    const shift=[0,1,2].map(c=>(after[i*3+c]-token.position[i*3+c])/old.strength);if(!shift.some(x=>x!==0))continue;
    const previous=values.get(i)||[0,0,0],next=previous.map((v,c)=>v+shift[c]);if(next.some(x=>x!==0))values.set(i,next);else values.delete(i);
  }
  const ordered=[...values].sort((a,b)=>a[0]-b[0]),layer={...old,deltas:{indices:ordered.map(([i])=>i),values:ordered.flatMap(([,v])=>v)}},doc={...current,layers:current.layers.map(l=>l.id===old.id?layer:l)};
  validateDocument(doc,mesh.geometry);const expected=sculptLayerPositions(doc);
  // Keep the document's deterministic evaluation authoritative. This can round
  // a recorded edit by a Float32 ULP, but never estimates edits from a posed mesh.
  const p=mesh.geometry.attributes.position;for(let i=0;i<expected.length/3;i++)p.setXYZ(i,expected[i*3],expected[i*3+1],expected[i*3+2]);p.needsUpdate=true;
  mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();mesh.userData[KEY]=doc;return doc;
}

export function cancelSculptLayerEdit(token){if(!token)return;token.mesh.geometry=token.geometry;token.mesh.userData[KEY]=token.document;}
export function withSculptLayerEdit(mesh,run){
  const original=mesh.geometry,token=captureSculptLayerEdit(mesh);mesh.geometry=sculptBufferCopy(mesh.geometry);
  try{const result=run();if(result?.then)fail('layer geometry edits must finish inside the scene transaction.');finishSculptLayerEdit(token);return result;}catch(error){cancelSculptLayerEdit(token);mesh.geometry=original;throw error;}
}
export function rejectLayerTopology(mesh){if(mesh?.userData?.[KEY])fail('topology edits would invalidate recorded layers. Make a static working copy to bake the evaluated surface and retain the layered source.');}
export function disposeUnusedSculptGeometry(editor,geometry){let used=false;editor.root?.traverse(n=>{if(n.geometry===geometry)used=true;});if(!used)geometry.dispose();}

// A preview owns only one mesh and leaves its original geometry/document intact.
// The caller coalesces input events and commits history once after accept().
export function beginSculptLayerPreview(editor,mesh,id){
  if(editor.sculptLayerPreview||editor.meshTools?.stroke||editor.batching||editor.operators?.running)fail('finish or cancel the current gesture first.');
  const doc=validateSculptLayers(mesh);if(doc?.version!==2||!doc.layers.some(l=>l.id===id))fail('the preview layer is missing.');
  editor.ensureHistory?.();const root=editor.root,geometry=mesh.geometry,preview=sculptBufferCopy(geometry),draft={...doc,layers:doc.layers.map(l=>({...l}))};mesh.geometry=preview;
  let closed=false;
  const owns=()=>editor.root===root&&mesh.geometry===preview&&mesh.userData[KEY]===draft;
  const release=()=>{closed=true;if(editor.sculptLayerPreview===session)editor.sculptLayerPreview=null;session.onClose?.();};
  const session={
    mesh,id,set(value){if(closed||!owns())fail('discarded a stale layer preview.');if(!Number.isFinite(value)||Math.abs(value)>1)fail('strength must be a finite value from −1 to 1.');draft.layers.find(l=>l.id===id).strength=value;writeDocument(mesh,draft,{copy:false});},
    accept(){if(closed||!owns())fail('discarded a stale layer preview.');if(draft.layers.find(l=>l.id===id).strength===doc.layers.find(l=>l.id===id).strength){session.cancel();return false;}release();try{editor.commit();disposeUnusedSculptGeometry(editor,geometry);return true;}catch(error){if(editor.root===root&&mesh.geometry===preview&&mesh.userData[KEY]===draft){mesh.geometry=geometry;mesh.userData[KEY]=doc;}session.onClose?.();disposeUnusedSculptGeometry(editor,preview);throw error;}},
    cancel(){if(closed)return;if(owns()){mesh.geometry=geometry;mesh.userData[KEY]=doc;}release();preview.dispose();}
  };
  mesh.userData[KEY]=draft;editor.sculptLayerPreview=session;return session;
}
