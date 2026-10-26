import {captureMorphPreset,inspectMorphPreset,applyMorphPreset,resetMorphControls} from './morph-presets.js';
import {deformationTransaction} from './deformation-ui.js';
import {morphControls} from './deformation.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const callbacks=new WeakMap();
export function morphPresetPanel(root){
 const controls=root?morphControls(root):[];if(!controls.length)return '';
 const saved=root.userData.fusion_morph_presets||[],categories=[...new Set(controls.map(c=>c.category||'/General'))].sort();
 return `<section class="library-section" id="morph-presets"><div class="section-heading">SHAPING PRESETS</div><label class="field-label">Control group<select id="preset-category"><option value="">All loaded controls</option>${categories.map(c=>`<option>${esc(c)}</option>`).join('')}</select></label><input id="preset-name" aria-label="Preset name" value="Shaping preset" maxlength="80"><button id="preset-capture" class="full-button">Capture controls to preset</button><select id="preset-list" aria-label="Saved shaping preset">${saved.length?saved.map(p=>`<option value="${esc(p.id)}">${esc(p.preset.name)}</option>`).join(''):'<option value="">No saved presets</option>'}</select><button id="preset-review" class="full-button" ${saved.length?'':'disabled'}>Review & apply preset</button><button id="preset-export" class="full-button" ${saved.length?'':'disabled'}>Export preset file</button><button id="preset-import" class="full-button">Open preset file…</button><button id="preset-reset" class="full-button">Reset control group</button><p class="microcopy">Presets save authored controls separately from formula results. Base geometry and source vertex identities are checked before applying. Pose, rig and correctives are retained.</p></section>`;
}
export function wireMorphPresets({editor,api,run,modal,close,refresh,notify,afterChange}){
 callbacks.set(editor,afterChange);
 if(!editor.operators.definitions.has('character.preset'))editor.operators.register({id:'character.preset',label:'Character shaping preset',hidden:true,undo:'snapshot',execute:(_,p,signal)=>deformationTransaction(editor,p.targetId,async root=>{
  if(p.action==='capture'){const preset=await captureMorphPreset(root,{name:p.name,...p.selection});const library=root.userData.fusion_morph_presets??=[];if(library.length>=32)throw Error('This character already has 32 saved presets. Remove a saved preset before adding more.');const entry={id:crypto.randomUUID(),preset};library.push(entry);return entry;}
  if(p.action==='apply'){const result=await applyMorphPreset(root,p.preset,{...p.selection,acceptExactIdSubset:!!p.acceptExactIdSubset,signal});if(p.remember){const library=root.userData.fusion_morph_presets??=[];if(library.length>=32)throw Error('This character already has 32 saved presets.');library.push({id:crypto.randomUUID(),preset:p.preset});}return result;}
  if(p.action==='remove'){const library=root.userData.fusion_morph_presets||[],index=library.findIndex(e=>e.id===p.presetId);if(index<0)throw Error('The saved preset is no longer available.');return library.splice(index,1);}
  if(p.action==='reset')return resetMorphControls(root,{...p.selection,signal});throw Error('Unsupported preset operation.');
 },{afterChange:['capture','remove'].includes(p.action)?async()=>{}:callbacks.get(editor),signal})});
 const panel=document.querySelector('#morph-presets');if(!panel)return;
 const root=editor.selected,targetId=root.uuid,$=s=>panel.querySelector(s),selection=()=>$('#preset-category').value?{categories:[$('#preset-category').value]}:{},chosen=()=>root.userData.fusion_morph_presets?.find(p=>p.id===$('#preset-list').value)?.preset;
 const dispatch=p=>run(async()=>{try{return await editor.operators.run('character.preset',{targetId,...p});}finally{refresh();}});
 $('#preset-capture').onclick=()=>dispatch({action:'capture',name:$('#preset-name').value.trim()||'Shaping preset',selection:selection()});
 $('#preset-reset').onclick=()=>dispatch({action:'reset',selection:selection()});
 const review=async(preset,remember=false)=>{
  const scope=selection(),report=await inspectMorphPreset(root,preset,scope);
  modal('Shaping preset compatibility',`<p><strong>${esc(report.name)}</strong> · ${report.matched.length} matching controls · ${report.missing.length} missing</p>${report.diagnostics.map(d=>`<div class="notice"><p>${esc(d.message)}</p></div>`).join('')}<table class="coverage-table"><tr><th>Control / exact ID</th><th>Current → Saved</th></tr>${report.matched.slice(0,80).map(c=>`<tr><td>${esc(c.targetLabel)}<br><small>${esc(c.id)}</small></td><td>${c.current.toFixed(3)} → ${c.value.toFixed(3)}</td></tr>`).join('')}</table>${report.matched.length>80?'<p>Showing the first 80 controls.</p>':''}${report.missing.length?`<details><summary>Skipped controls</summary>${report.missing.map(c=>`<p>${esc(c.id)}</p>`).join('')}</details>`:''}${report.outOfRange.length?`<details><summary>Values outside current limits</summary>${report.outOfRange.map(c=>`<p>${esc(c.id)}: ${c.value} (limits ${c.min??'none'} to ${c.max??'none'})</p>`).join('')}</details>`:''}${report.requiresExplicitRemap&&report.compatible?'<label><input id="preset-accept-subset" type="checkbox"> Apply only reviewed exact-ID matches and skip missing controls</label>':''}<p class="microcopy">The entire control and linked garment update is one undo step.</p>`,`<button id="preset-cancel" class="button subtle">Cancel</button><button id="preset-apply" class="button accent" ${report.compatible?'':'disabled'}>Apply reviewed preset</button>`);
  document.querySelector('#preset-cancel').onclick=close;
  document.querySelector('#preset-apply').onclick=()=>{const accepted=!!document.querySelector('#preset-accept-subset')?.checked;if(report.requiresExplicitRemap&&!accepted)return notify('Review and accept the exact-ID subset before applying.',true);close();dispatch({action:'apply',preset,selection:scope,acceptExactIdSubset:accepted,remember});};
 };
 $('#preset-review').onclick=()=>run(()=>review(chosen()));
 $('#preset-import').onclick=()=>run(async()=>{const preset=await api.openMorphPreset();if(preset)await review(preset,true);});
 $('#preset-export').onclick=()=>run(async()=>{const result=await api.saveMorphPreset(chosen());if(result)notify('Preset saved to a new file.');return result;});
 const remove=document.createElement('button');remove.id='preset-remove';remove.className='full-button';remove.textContent='Remove saved preset';remove.disabled=!chosen();panel.append(remove);remove.onclick=()=>dispatch({action:'remove',presetId:$('#preset-list').value});
}
