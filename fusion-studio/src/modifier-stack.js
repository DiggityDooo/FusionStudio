import * as THREE from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {hybridTransaction} from './hybrid.js';
import {transferMask} from './mesh-tools.js';
import {modifierCapability} from './modifier-capabilities.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const stackActions=new Set(['subdivide','bevel','decimate','solidify','mirror','remesh','boolean','array','wireframe','weld','triangulate','smooth','twist','bend','taper','stretch','screw','radial_array','inset','bisect','quad_remesh','quads','fill_holes','edge_split','displace','cast']);
export function stackSnapshot(object){const copy=object.clone(true);copy.traverse(n=>{delete n.userData.modifierStack;if(n.geometry){const g=n.geometry,b=new THREE.BufferGeometry();b.copy(g);delete b.parameters;n.geometry=b;}});return copy.toJSON();}
function replace(editor,target,next){const index=editor.root.children.indexOf(target);editor.root.remove(target);editor.root.add(next);if(index>=0){editor.root.children.splice(editor.root.children.indexOf(next),1);editor.root.children.splice(index,0,next);}editor.components?.reset();editor.select(next);return next;}
function identity(group,target){group.name=target.name;group.uuid=target.uuid;group.visible=target.visible;group.position.copy(target.position);group.quaternion.copy(target.quaternion);group.scale.copy(target.scale);group.updateMatrix();return group;}
export async function stackSourceObject(target){const stack=target.userData.modifierStack;if(!stack?.source)throw Error('The retained modifier source is missing.');return identity(await new THREE.ObjectLoader().parseAsync(stack.source),target);}
export async function stackExportObject(target){const stack=target.userData.modifierStack;if(!stack?.editSource)return target;if(!stack.evaluated)throw Error('Finish evaluating the source cage before exporting.');return identity(await new THREE.ObjectLoader().parseAsync(stack.evaluated),target);}
export async function evaluateStack(editor,api,target,entries,{source:sourceOverride}={}){
 if(entries.length>32)throw Error('Modifier stack limit is 32 entries.');
 const source=sourceOverride||target.userData.modifierStack?.source||stackSnapshot(target),base=await new THREE.ObjectLoader().parseAsync(source);
 base.position.copy(target.position);base.quaternion.copy(target.quaternion);base.scale.copy(target.scale);base.visible=true;base.userData.fusion_id=target.userData.fusion_id||target.uuid;
 const input=new THREE.Scene(),operands=[];input.add(base);
 for(const entry of entries)if(entry.enabled&&entry.action==='boolean'){const operand=editor.root.children.find(o=>(o.userData.fusion_id||o.uuid)===entry.params.cutterId);if(!operand||operand===target)throw Error('The stack Boolean operand is missing.');if(!input.children.some(c=>c.userData.fusion_id===entry.params.cutterId)){const evaluated=await stackExportObject(operand),copy=evaluated.clone(true);copy.visible=true;copy.userData.fusion_id=entry.params.cutterId;copy.traverse(n=>{delete n.userData.modifierStack;});input.add(copy);operands.push({id:entry.params.cutterId,geometry:stackSnapshot(copy)});}}
 target.updateMatrix();
 const result=await editor.evaluation.run(target,{source,entries,operands,transform:target.matrix.toArray()},async context=>{
  const buffer=await new GLTFExporter().parseAsync(input,{binary:true,onlyVisible:true});const bytes=new Uint8Array(buffer);let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return api.job({action:'stack',data:btoa(binary),name:target.name,params:{targetId:base.userData.fusion_id,stack:entries,context}});
 });
 const bytes=Uint8Array.from(atob(result.data),c=>c.charCodeAt(0));const gltf=await new GLTFLoader().parseAsync(bytes.buffer,'');
 const group=gltf.scene;group.name=target.name;group.uuid=target.uuid;group.visible=target.visible;
 // The GLB root carries evaluated world transforms. Keep the user's root transform
 // and convert imported children back into that local frame before replacement.
 target.updateMatrix();const inv=target.matrix.clone().invert();for(const child of group.children){child.updateMatrix();child.applyMatrix4(inv);}
 group.position.copy(target.position);group.quaternion.copy(target.quaternion);group.scale.copy(target.scale);
 group.userData={...target.userData};delete group.userData.modifierStack;
 const stack={version:2,source,entries:structuredClone(entries),diagnostics:result.metadata?.stack||[],evaluatedTriangles:result.metadata?.polygons??null,editSource:!!target.userData.modifierStack?.editSource};
 let displayed=group;
 if(!stack.editSource){ // evaluated GLB roundtrips can drop the sculpt mask; restore it by nearest-vertex transfer
   const sourceMeshes=[],resultMeshes=[];base.traverse(n=>{if(n.isMesh)sourceMeshes.push(n);});group.traverse(n=>{if(n.isMesh)resultMeshes.push(n);});
   for(let i=0;i<Math.min(sourceMeshes.length,resultMeshes.length);i++)transferMask(sourceMeshes[i].geometry,resultMeshes[i].geometry);
 }
 if(stack.editSource){stack.evaluated=stackSnapshot(group);displayed=identity(await new THREE.ObjectLoader().parseAsync(source),target);}
 displayed.userData={...target.userData,modifierStack:stack,source:'Fusion modifier stack'};
 displayed.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});return replace(editor,target,displayed);
}
export async function updateStackSource(editor,api,target){const stack=target.userData.modifierStack;if(!stack?.editSource)throw Error('Choose Edit retained source before changing stack geometry.');return evaluateStack(editor,api,target,stack.entries,{source:stackSnapshot(target)});}
export async function changeStack(editor,api,change,{transaction=true}={}){const apply=async()=>{
 const target=editor.selected;if(!target)throw Error('Select a mesh first.');const stack=target.userData.modifierStack,entries=structuredClone(stack?.entries||[]);
 if(change.kind==='apply'){if(!stack)return target;const evaluated=await stackExportObject(target);evaluated.userData={...target.userData};delete evaluated.userData.modifierStack;return evaluated===target?target:replace(editor,target,evaluated);}
 if(change.kind==='source'){if(!stack)throw Error('Select an editable modifier stack.');const next=stack.editSource?await stackExportObject(target):await stackSourceObject(target),updated={...stack,editSource:!stack.editSource};if(updated.editSource)updated.evaluated=stackSnapshot(target);else delete updated.evaluated;next.userData={...target.userData,modifierStack:updated};editor.meshTools?.setMode('object');return replace(editor,target,next);}
 const index=entries.findIndex(e=>e.id===change.id);
 if(change.kind==='add'){if(!stackActions.has(change.action))throw Error('Unsupported stack modifier.');entries.push({id:THREE.MathUtils.generateUUID(),action:change.action,params:change.params,enabled:true});}
 else{if(index<0)throw Error('Modifier no longer exists.');if(change.kind==='remove')entries.splice(index,1);else if(change.kind==='toggle')entries[index].enabled=!entries[index].enabled;else if(change.kind==='update')entries[index].params=change.params;else if(change.kind==='duplicate')entries.splice(index+1,0,{...structuredClone(entries[index]),id:THREE.MathUtils.generateUUID()});else if(change.kind==='move'){const next=index+change.direction;if(next<0||next>=entries.length)return target;[entries[index],entries[next]]=[entries[next],entries[index]];}else throw Error('Unknown stack edit.');}
 return evaluateStack(editor,api,target,entries);
};return transaction?hybridTransaction(editor,apply):apply();}
export function stackPanel(object,specs){const stack=object?.userData.modifierStack;if(!stack)return '';return `<section class="inspector-section"><div class="section-heading">LIVE MODIFIER STACK</div><button data-stack="source" class="full-button">${stack.editSource?'Return to evaluated mesh':'Edit retained source cage'}</button>${stack.editSource?'<p class="microcopy"><strong>Source cage displayed.</strong> Use component edits in Modeling. Render/export use the latest evaluated stack result.</p>':''}${stack.entries.map((e,i)=>{const c=modifierCapability(e.action),d=stack.diagnostics?.find(d=>d.id===e.id);return `<div class="stack-entry"><strong>${i+1}. ${esc(specs[e.action]?.label||e.action)}</strong><p class="microcopy">Topology: ${esc(c?.topology)} · UV: ${esc(c?.uv)}${d?`<br>${d.enabled?`${d.before.vertices} → ${d.after.vertices} vertices`:'Disabled'}${d.warnings?.length?`<br>${d.warnings.map(esc).join('<br>')}`:''}`:''}</p><div><button data-stack="toggle" data-id="${e.id}">${e.enabled?'Enabled':'Disabled'}</button><button data-stack="update" data-id="${e.id}">Settings</button><button data-stack="up" data-id="${e.id}">↑</button><button data-stack="down" data-id="${e.id}">↓</button><button data-stack="duplicate" data-id="${e.id}">Duplicate</button><button data-stack="remove" data-id="${e.id}">Remove</button></div></div>`;}).join('')}<button data-stack="apply" class="full-button">Apply entire stack</button><p class="microcopy">Parameters always evaluate from retained source geometry. Apply commits the evaluated mesh and clears the stack.</p></section>`;}
