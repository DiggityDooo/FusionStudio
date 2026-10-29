import {prepareCharacterLods,characterLodFingerprint,assembleCharacterLods,selectCharacterLod,runLodWorker} from './character-lods.js';

export async function createCharacterLods(editor,{targetId,levels=[1,.5,.25]}={},signal,{compute=runLodWorker}={}){
 if(editor.batching)throw Error('Finish the active scene edit before generating LOD copies.');const scene=editor.root,source=scene.getObjectByProperty('uuid',targetId||editor.selected?.uuid);if(!source)throw Error('Select the retained source character.');
 if(editor.timeline)editor.timeline.playing=false;editor.ensureHistory();const before=structuredClone(editor.serialize()),selection=editor.selected?.uuid;editor.batching=true;let stage,plan,installed=false;
 try{
  plan=prepareCharacterLods(source,{levels,relativeTo:scene});const sourceHash=await characterLodFingerprint(source);if(signal?.aborted)throw Error('LOD generation cancelled.');
 let ticket;const results=await editor.evaluation.run(source,{sourceHash,levels},(context,evaluationSignal)=>{ticket=context;return compute(plan.parts.filter(p=>!p.preserve).map(p=>({id:p.id,input:p.input})),levels,context,{signal:AbortSignal.any([signal,evaluationSignal].filter(Boolean))});});
  if(editor.root!==scene||signal?.aborted)throw Error('LOD source changed during evaluation. Retry from the current character.');
  if(await characterLodFingerprint(source)!==sourceHash)throw Error('LOD source changed during evaluation. Retry from the current character.');
  stage=assembleCharacterLods(plan,results,{sourceHash,context:ticket});if(signal?.aborted)throw Error('LOD generation cancelled.');scene.add(stage.group);installed=true;selectCharacterLod(scene,stage.group,0);editor.select(stage.group);editor.batching=false;editor.commit();return stage.group;
 }catch(error){stage?.dispose();if(installed&&editor.root===scene){await editor.restore(before);editor.select(editor.root.getObjectByProperty('uuid',selection)||null);}throw error;
 }finally{plan?.disposeSource();editor.batching=false;}
}
export function registerCharacterLods(registry,editor){
 registry.register({id:'character.generate_lods',label:'Generate character LOD copies',compatibility:'character-lod',undo:'snapshot',poll:()=>!!editor.selected&&!editor.selected.userData.fusion_lod_set,execute:(_,p,signal)=>createCharacterLods(editor,p,signal)});
 registry.register({id:'character.lod_preview',label:'Preview character LOD',hidden:true,undo:'snapshot',execute:(_,p)=>{const group=editor.root.getObjectByProperty('uuid',p.targetId);if(!group?.userData.fusion_lod_set)throw Error('Select a character LOD set.');editor.ensureHistory();selectCharacterLod(editor.root,group,p.index);editor.select(group);editor.commit();return group;}});
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function characterLodPanel(group){const m=group.userData.fusion_lod_set;return `<section class="library-section" id="character-lod-panel"><div class="section-heading">CHARACTER LOD COPIES</div><p class="microcopy">Independent reduced rigs and shape keys. The retained source owns generator controls and global animation. Preview one level, then export the visible scene.</p><label>Preview<select id="character-lod-level"><option value="-1" ${m.active===-1?'selected':''}>Retained source</option>${m.levels.map((l,i)=>`<option value="${i}" ${m.active===i?'selected':''}>LOD ${i} · ${Math.round(l.keep*100)}% target · ${l.triangles.toLocaleString()} triangles</option>`).join('')}</select></label>${m.levels.map((l,i)=>`<p class="microcopy">LOD ${i}: ${l.parts.filter(p=>!p.achieved).length} parts did not reach their target. ${esc(l.parts.flatMap(p=>p.warnings).filter((s,i,a)=>a.indexOf(s)===i).join(' '))}</p>`).join('')}<p class="microcopy">${m.warnings.map(esc).join(' ')}</p></section>`;}
export function wireCharacterLods(editor,run,refresh){document.querySelector('#character-lod-level')?.addEventListener('change',e=>run(async()=>{await editor.operators.run('character.lod_preview',{targetId:editor.selected.uuid,index:Number(e.target.value)});refresh();}));}
