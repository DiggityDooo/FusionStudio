import {morphControls,setMorph,evaluateCharacter,initializeDeformation,addPoseCorrective} from './deformation.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// A morph, its dependent garment replacements and history boundary are one edit.
export async function deformationTransaction(editor,targetId,change,{afterChange=async()=>{},signal}={}){
  if(editor.batching)throw Error('Finish the current scene operation before changing character controls.');
  const root=editor.root.getObjectByProperty('uuid',targetId);if(!root)throw Error('Character is no longer in this scene.');
  if(editor.timeline)editor.timeline.playing=false;
  editor.ensureHistory();const scene=editor.root,checkpoint=editor.historyCheckpoint?.(),before=checkpoint?null:structuredClone(editor.serialize()),selected=editor.selected?.uuid,frame=editor.timeline?.frame;
  editor.batching=true;
  try{
    if(signal?.aborted)throw Error('Character update cancelled.');
    const result=await change(root);await afterChange(root,signal);
    if(signal?.aborted)throw Error('Character update cancelled.');
    if(editor.root!==scene)throw Error('Scene changed during character evaluation.');
    editor.batching=false;editor.commit();return result;
  }catch(error){
    // Never replace a different project which was opened while a worker finished.
    if(editor.root===scene){if(checkpoint)await checkpoint.restore();else await editor.restore(before);if(editor.timeline&&frame!==undefined)editor.timeline.frame=frame;editor.select(editor.root.getObjectByProperty('uuid',selected)||null);}
    throw error;
  }finally{editor.batching=false;checkpoint?.release();}
}
const callbacks=new WeakMap();
let formulaExpanded=false;
function checkedEvaluation(root){const report=evaluateCharacter(root);if(!report.valid)throw Error('Character dependency failed: '+report.errors.map(e=>e.message).join('; '));return report;}
function registerDeformationOperator(editor,afterChange){
  callbacks.set(editor,afterChange);const registry=editor.operators;if(!registry||registry.definitions.has('character.deform'))return;
  registry.register({id:'character.deform',label:'Edit character shaping',hidden:true,undo:'snapshot',execute:(_,p,signal)=>deformationTransaction(editor,p.targetId,root=>{
    if(p.action==='set')return setMorph(root,p.channel,p.value);
    if(p.action==='reset'){const c=morphControls(root).find(c=>c.id===p.channel);if(!c)throw Error('Morph control is unavailable.');return setMorph(root,c.id,c.default??0);}
    if(p.action==='corrective')return addPoseCorrective(root,p.corrective);
    if(p.action==='clear'){initializeDeformation(root).correctives=[];return checkedEvaluation(root);}
    if(p.action==='formulas'){const state=initializeDeformation(root);state.formulasEnabled=!!p.enabled;const result=evaluateCharacter(root);if(!result.valid)throw Error('Cannot enable this dependency graph: '+result.errors.map(e=>e.message).join('; '));return result;}
    if(p.action==='key'){checkedEvaluation(root);const selection=editor.selected;editor.selected=root;try{return editor.timeline.insert();}finally{editor.selected=selection;}}
    throw Error('Unsupported character edit.');
  },{afterChange:p.action==='key'?async()=>{}:callbacks.get(editor),signal})});
}
export function deformationPanel(root){
  if(!root)return '';const controls=morphControls(root);if(!controls.length)return '';const report=evaluateCharacter(root),state=initializeDeformation(root),bones=[];root.traverse(n=>{if(n.isBone)bones.push(n);});
  return `<section class="library-section" id="deformation-panel"><div class="section-heading">SHAPING & CORRECTIVES</div><input id="deformation-search" type="search" placeholder="Search all loaded morphs…" aria-label="Search morphs"><select id="deformation-category" aria-label="Morph category"><option value="">All categories</option>${[...new Set(controls.map(c=>c.category||'/General'))].sort().map(c=>`<option>${esc(c)}</option>`).join('')}</select><div id="deformation-controls">${controls.map(c=>`<div class="morph-control" data-channel="${esc(c.id)}" data-category="${esc(c.category||'/General')}" data-label="${esc(c.label||c.id)}"><label class="field-label">${esc(c.label||c.id)}<span>${esc(c.category||'/General')}</span></label><input class="morph-value" type="number" min="${c.min??-1e6}" max="${c.max??1e6}" step=".01" value="${c.value}" aria-label="${esc(c.label||c.id)}"><button type="button" class="morph-reset">Reset</button><button type="button" class="morph-key">Key</button></div>`).join('')}</div>${bones.length?`<details id="pose-corrective"><summary>Pose-driven corrective</summary><p class="microcopy">Capture the current joint pose as zero. Add a morph progressively along its local rotation axis.</p><select id="corrective-channel" aria-label="Corrective morph">${controls.map(c=>`<option value="${esc(c.id)}">${esc(c.label||c.id)}</option>`).join('')}</select><select id="corrective-bone" aria-label="Corrective joint">${bones.map(b=>`<option value="${b.uuid}">${esc(b.name)}</option>`).join('')}</select><select id="corrective-axis" aria-label="Corrective axis"><option>x</option><option>y</option><option>z</option></select><label>Full influence angle (degrees)<input id="corrective-angle" type="number" value="90" step="1"></label><button id="corrective-add">Add corrective</button><button id="corrective-clear">Clear authored correctives</button></details>`:''}<p class="microcopy">${state.correctives?.length||0} authored pose correctives. ${state.formulas.length} imported formulas. Base-resolution morphs only.</p>${formulaPanel(state,report)}<div id="deformation-diagnostics" role="status">${state.errors.slice(0,8).map(e=>`<p class="microcopy">${esc(e.channel)}: ${esc(e.message)}</p>`).join('')}</div></section>`;
}
export function wireDeformation({container=document,editor,run=fn=>fn(),afterChange=async()=>{},refresh=()=>{}}){
  registerDeformationOperator(editor,afterChange);
  const panel=container.querySelector('#deformation-panel');if(!panel)return;const root=editor.selected;
  const dispatch=properties=>run(async()=>{try{if(!editor.operators)throw Error('Character operator registry is unavailable.');return await editor.operators.run('character.deform',{targetId:root.uuid,...properties});}finally{refresh();}});
  const filter=()=>{const query=panel.querySelector('#deformation-search').value.toLowerCase(),category=panel.querySelector('#deformation-category').value;for(const row of panel.querySelectorAll('.morph-control'))row.hidden=(!row.dataset.label.toLowerCase().includes(query)&&!row.dataset.channel.toLowerCase().includes(query))||!!category&&row.dataset.category!==category;};
  panel.querySelector('#deformation-search').oninput=filter;panel.querySelector('#deformation-category').onchange=filter;
  panel.querySelector('#formula-enabled')?.addEventListener('change',e=>dispatch({action:'formulas',enabled:e.target.checked}));
  const graph=panel.querySelector('#formula-graph');if(graph)graph.ontoggle=e=>formulaExpanded=e.target.open;
  panel.querySelector('#formula-search')?.addEventListener('input',e=>{for(const row of panel.querySelectorAll('[data-formula-row]'))row.hidden=!row.textContent.toLowerCase().includes(e.target.value.toLowerCase());});
  for(const row of panel.querySelectorAll('.morph-control')){const input=row.querySelector('.morph-value'),id=row.dataset.channel;input.onchange=()=>dispatch({action:'set',channel:id,value:Number(input.value)});row.querySelector('.morph-reset').onclick=()=>dispatch({action:'reset',channel:id});row.querySelector('.morph-key').onclick=()=>dispatch({action:'key',channel:id});}
  panel.querySelector('#corrective-add')?.addEventListener('click',()=>dispatch({action:'corrective',corrective:{channel:panel.querySelector('#corrective-channel').value,boneId:panel.querySelector('#corrective-bone').value,axis:panel.querySelector('#corrective-axis').value,end:Number(panel.querySelector('#corrective-angle').value)}}));
  panel.querySelector('#corrective-clear')?.addEventListener('click',()=>dispatch({action:'clear'}));
}
function formulaPanel(state,report){
 const outputs=report.outputs||[],values=report.values||{},driven=new Set((report.rotations||[]).map(r=>r.joint)),bound=new Set(state.channels.map(c=>c.id.includes('?')?c.id:c.id+'?value'));
 return `<details id="formula-graph" ${formulaExpanded?'open':''}><summary>Dependencies · Compatible</summary><label><input id="formula-enabled" type="checkbox" ${state.formulasEnabled!==false?'checked':''}> Evaluate imported drivers</label><p class="microcopy">${state.formulas.length} retained formulas · ${report.verifiedRotationFrames||0} verified rotation frames · ${driven.size} driven joints · ${report.constraintPasses||0} constraint passes. Authored controls and poses are retained separately from evaluated results. Unverified axes and unsupported outputs remain unapplied.</p><input id="formula-search" type="search" aria-label="Search dependencies" placeholder="Find a property or diagnostic…"><table class="coverage-table"><tr><th>Property</th><th>Evaluated / binding</th></tr>${outputs.slice(0,120).map(id=>`<tr data-formula-row><td>${esc(id)}</td><td>${Number.isFinite(values[id])?values[id].toFixed(5):'failed'}<br>${/\?rotation\/[xyz]$/.test(id)&&driven.has(id.split('?')[0])?'verified joint rotation':bound.has(id)?'control / morph':'unsupported scene binding'}</td></tr>`).join('')}</table>${outputs.length>120?'<p class="microcopy">Showing the first 120 outputs.</p>':''}<p class="microcopy">Base control values: ${state.channels.map(c=>`${esc(c.label||c.id)} ${Number.isFinite(c.value)?c.value.toFixed(3):'unavailable'} → ${Number.isFinite(values[c.id+'?value'])?values[c.id+'?value'].toFixed(3):'unavailable'}`).join(' · ')}</p>${state.errors.slice(0,120).map(e=>`<p data-formula-row class="microcopy">${esc(e.channel)}: ${esc(e.message)}</p>`).join('')}<p class="microcopy">Errors preserve the last consistent pose and mesh. Pause imported drivers to work with independent controls; the original formulas remain in this project. Joint rotations export as evaluated motion, without editable driver rules.</p></details>`;
}
