import {prepareCharacterLods,characterLodFingerprint,assembleCharacterLods,selectCharacterLod,runLodWorker} from './character-lods.js';
import {deformationTransaction} from './deformation-ui.js';

export async function createCharacterLods(editor,{targetId,levels=[1,.5,.25],previewIndex=0,regeneratedFrom}={},signal,{compute=runLodWorker}={}){
 if(editor.batching)throw Error('Finish the active scene edit before generating LOD copies.');const scene=editor.root,source=scene.getObjectByProperty('uuid',targetId||editor.selected?.uuid);if(!source)throw Error('Select the retained source character.');
 if(editor.timeline)editor.timeline.playing=false;editor.ensureHistory();const checkpoint=editor.historyCheckpoint?.(),before=checkpoint?null:structuredClone(editor.serialize()),selection=editor.selected?.uuid;editor.batching=true;let stage,plan,installed=false;
 try{
  plan=prepareCharacterLods(source,{levels,relativeTo:scene});if(!Number.isInteger(previewIndex)||previewIndex<0||previewIndex>=levels.length)throw Error('Choose a valid generated LOD preview.');const sourceHash=await characterLodFingerprint(source);if(signal?.aborted)throw Error('LOD generation cancelled.');
 let ticket;const results=await editor.evaluation.run(source,{sourceHash,levels},(context,evaluationSignal)=>{ticket=context;return compute(plan.parts.filter(p=>!p.preserve).map(p=>({id:p.id,input:p.input})),levels,context,{signal:AbortSignal.any([signal,evaluationSignal].filter(Boolean))});});
  if(editor.root!==scene||signal?.aborted)throw Error('LOD source changed during evaluation. Retry from the current character.');
  if(await characterLodFingerprint(source)!==sourceHash)throw Error('LOD source changed during evaluation. Retry from the current character.');
  stage=assembleCharacterLods(plan,results,{sourceHash,context:ticket});if(regeneratedFrom)stage.group.userData.fusion_lod_set.regeneratedFrom=regeneratedFrom;if(signal?.aborted)throw Error('LOD generation cancelled.');scene.add(stage.group);installed=true;selectCharacterLod(scene,stage.group,previewIndex);editor.select(stage.group);editor.batching=false;editor.commit();return stage.group;
 }catch(error){stage?.dispose();if(installed&&editor.root===scene){if(checkpoint)await checkpoint.restore();else await editor.restore(before);editor.select(editor.root.getObjectByProperty('uuid',selection)||null);}throw error;
 }finally{plan?.disposeSource();editor.batching=false;checkpoint?.release();}
}

function retainedSource(editor, targetId) {
 const group=editor.root.getObjectByProperty('uuid',targetId||editor.selected?.uuid),metadata=group?.userData.fusion_lod_set;
 if(!metadata)throw Error('Select a character LOD set.');
 const source=editor.root.getObjectByProperty('uuid',metadata.sourceObjectId);
 if(!source)throw Error('The retained LOD source is missing. Restore the source character from a saved project before editing or rebuilding.');
 for(let n=source;n&&n!==editor.root;n=n.parent)if(n.userData.fusion_lod_set||n.userData.fusion_lod_level)throw Error('The retained source points into a derived LOD set. Relink the original character before rebuilding.');
 return {group,metadata,source};
}

export function editCharacterLodSource(editor,{targetId}={}) {
 const {group,source}=retainedSource(editor,targetId);return deformationTransaction(editor,group.uuid,()=>{selectCharacterLod(editor.root,group,-1);source.visible=true;editor.select(source);return source;});
}

export function previewCharacterLod(editor,{targetId,index}={}) {
 const group=editor.root.getObjectByProperty('uuid',targetId);if(!group?.userData.fusion_lod_set)throw Error('Select a character LOD set.');
 return deformationTransaction(editor,group.uuid,()=>{selectCharacterLod(editor.root,group,index);editor.select(group);return group;});
}

export function rebuildCharacterLods(editor,{targetId}={},signal,options) {
 const {group,metadata,source}=retainedSource(editor,targetId);
 return createCharacterLods(editor,{targetId:source.uuid,levels:metadata.levels.map(l=>l.keep),previewIndex:Math.max(0,metadata.active),regeneratedFrom:group.uuid},signal,options);
}

export function registerCharacterLods(registry,editor){
 registry.register({id:'character.generate_lods',label:'Generate character LOD copies',compatibility:'character-lod',undo:'snapshot',poll:()=>!!editor.selected&&!editor.selected.userData.fusion_lod_set,execute:(_,p,signal)=>createCharacterLods(editor,p,signal)});
 registry.register({id:'character.lod_preview',label:'Preview character LOD',hidden:true,undo:'snapshot',execute:(_,p)=>previewCharacterLod(editor,p)});
 registry.register({id:'character.lod_edit_source',label:'Edit retained LOD source',hidden:true,undo:'snapshot',execute:(_,p)=>editCharacterLodSource(editor,p)});
 registry.register({id:'character.rebuild_lods',label:'Rebuild character LOD copies from retained source',compatibility:'character-lod',undo:'snapshot',poll:()=>!!editor.selected?.userData.fusion_lod_set,execute:(_,p,signal)=>rebuildCharacterLods(editor,p,signal)});
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function characterLodPanel(group){const m=group.userData.fusion_lod_set;return `<section class="library-section" id="character-lod-panel"><div class="section-heading">CHARACTER LOD COPIES</div><p class="microcopy">Independent reduced rigs and shape keys. The retained source owns generator controls and global animation. Preview one level, then export the visible scene.</p><label>Preview<select id="character-lod-level"><option value="-1" ${m.active===-1?'selected':''}>Retained source</option>${m.levels.map((l,i)=>`<option value="${i}" ${m.active===i?'selected':''}>LOD ${i} · ${Math.round(l.keep*100)}% target · ${l.triangles.toLocaleString()} triangles</option>`).join('')}</select></label><button id="character-lod-edit-source" class="full-button">Edit retained source</button><button id="character-lod-rebuild" class="full-button">Rebuild copies from source</button><p class="microcopy">Copies are snapshots. After source edits, rebuild to create an updated set. Previous sets and any edits to their reduced meshes stay in the project.</p>${m.levels.map((l,i)=>`<p class="microcopy">LOD ${i}: ${l.parts.filter(p=>!p.achieved).length} parts did not reach their target. ${esc(l.parts.flatMap(p=>p.warnings).filter((s,i,a)=>a.indexOf(s)===i).join(' '))}</p>`).join('')}<p class="microcopy">${m.warnings.map(esc).join(' ')}</p></section>`;}

export function characterLodSourceLinks(source){
 let scene=source;while(scene.parent)scene=scene.parent;const sets=[];scene.traverse(n=>{if(n.userData.fusion_lod_set?.sourceObjectId===source.uuid)sets.push(n);});
 return sets.length?`<div class="section-heading">SAVED LOD SETS</div><p class="microcopy">Review a copy set, or rebuild it after changing this source.</p>${sets.map(n=>`<button class="full-button" data-character-lod-open="${esc(n.uuid)}">Review ${esc(n.name||'LOD copies')}</button>`).join('')}`:'';
}

export function wireCharacterLods(editor,run,refresh){
 document.querySelector('#character-lod-level')?.addEventListener('change',e=>run(async()=>{await editor.operators.run('character.lod_preview',{targetId:editor.selected.uuid,index:Number(e.target.value)});refresh();}));
 document.querySelector('#character-lod-edit-source')?.addEventListener('click',()=>run(async()=>{await editor.operators.run('character.lod_edit_source',{targetId:editor.selected.uuid});refresh();}));
 document.querySelector('#character-lod-rebuild')?.addEventListener('click',()=>run(async()=>{await editor.operators.run('character.rebuild_lods',{targetId:editor.selected.uuid});refresh();}));
 for(const button of document.querySelectorAll('[data-character-lod-open]'))button.addEventListener('click',()=>run(async()=>{const group=editor.root.getObjectByProperty('uuid',button.dataset.characterLodOpen),index=Math.max(0,group?.userData.fusion_lod_set?.active??0);await editor.operators.run('character.lod_preview',{targetId:button.dataset.characterLodOpen,index});refresh();}));
}
