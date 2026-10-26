import {bonesOf} from './rig-paths.js';
import {capturePosePreset,validatePosePreset,inspectPosePreset,applyPosePreset} from './pose-library.js';
import {deformationTransaction} from './deformation-ui.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const callbacks=new WeakMap();
function remember(root,preset){const library=root.userData.fusion_pose_presets??=[];if(library.length>=32)throw Error('This character already has 32 saved poses. Remove one before adding more.');const entry={id:crypto.randomUUID(),preset:validatePosePreset(preset)};library.push(entry);return entry;}
export function poseLibraryPanel(root){
 if(!bonesOf(root).length)return '';const saved=root.userData.fusion_pose_presets||[];
 return `<section class="library-section" id="pose-library"><div class="section-heading">POSE LIBRARY · INSPIRED</div><input id="pose-preset-name" aria-label="Pose preset name" value="Character pose" maxlength="80"><button id="pose-preset-capture" class="full-button">Capture joint pose</button><select id="pose-preset-list" aria-label="Saved pose">${saved.length?saved.map(p=>`<option value="${esc(p.id)}">${esc(p.preset.name)}</option>`).join(''):'<option value="">No saved poses</option>'}</select><button id="pose-preset-review" class="full-button" ${saved.length?'':'disabled'}>Review & apply pose</button><button id="pose-preset-export" class="full-button" ${saved.length?'':'disabled'}>Export pose file</button><button id="pose-preset-import" class="full-button">Open pose file…</button><button id="pose-preset-remove" class="full-button" ${saved.length?'':'disabled'}>Remove saved pose</button><p class="microcopy">Rotation-only poses match named joint hierarchy and imported rest axes. Shaping, skin weights, object transforms and animation keys are retained. Review authored limits and release active IK explicitly. Automatic retargeting is unavailable.</p></section>`;
}
export function wirePoseLibrary({editor,api,run,modal,close,refresh,notify,afterChange}){
 callbacks.set(editor,afterChange);
 if(!editor.operators.definitions.has('character.pose_preset'))editor.operators.register({id:'character.pose_preset',label:'Character pose preset',hidden:true,undo:'snapshot',execute:(_,p,signal)=>deformationTransaction(editor,p.targetId,async root=>{
  if(p.action==='capture')return remember(root,await capturePosePreset(root,{name:p.name}));
  if(p.action==='remove'){const library=root.userData.fusion_pose_presets||[],index=library.findIndex(e=>e.id===p.presetId);if(index<0)throw Error('The saved pose is no longer available.');return library.splice(index,1);}
  if(p.action==='apply'){const result=await applyPosePreset(root,p.preset,{releaseIK:!!p.releaseIK,acceptClamped:!!p.acceptClamped,signal});if(p.remember)remember(root,p.preset);return result;}
  throw Error('Unsupported pose preset operation.');
 },{afterChange:p.action==='apply'?callbacks.get(editor):async()=>{},signal})});
 const panel=document.querySelector('#pose-library');if(!panel)return;const root=editor.selected,targetId=root.uuid,$=s=>panel.querySelector(s),chosen=()=>root.userData.fusion_pose_presets?.find(p=>p.id===$('#pose-preset-list').value)?.preset;
 const dispatch=p=>run(async()=>{try{return await editor.operators.run('character.pose_preset',{targetId,...p});}finally{refresh();}});
 $('#pose-preset-capture').onclick=()=>dispatch({action:'capture',name:$('#pose-preset-name').value.trim()||'Character pose'});
 $('#pose-preset-remove').onclick=()=>dispatch({action:'remove',presetId:$('#pose-preset-list').value});
 const review=async(preset,remember=false)=>{
  editor.timeline.playing=false;const report=await inspectPosePreset(root,preset);
  modal('Pose compatibility',`<p><strong>${esc(report.name)}</strong> · ${report.joints} joints · ${report.compatible?'matching hierarchy and rest axes':'incompatible rig'}</p>${report.diagnostics.map(d=>`<div class="notice"><p>${esc(d)}</p></div>`).join('')}${report.clamped.length?`<table class="coverage-table"><tr><th>Joint</th><th>Requested → bounded XYZ °</th></tr>${report.clamped.slice(0,80).map(c=>`<tr><td>${esc(c.joint)}</td><td>${['x','y','z'].map(a=>`${a.toUpperCase()} ${c.requested[a].toFixed(1)} → ${c.applied[a].toFixed(1)}`).join('<br>')}</td></tr>`).join('')}</table><label><input id="pose-accept-clamped" type="checkbox"> Accept these joint-limit clamps</label>`:''}${report.activeIK?'<label><input id="pose-release-ik" type="checkbox"> Disable enabled IK controls and apply the saved joint rotations</label>':''}<p class="microcopy">The pose and linked garment re-drape form one undo step. Capture stores rotations; it does not store control targets, body shape or root motion.</p>`,`<button id="pose-preset-cancel" class="button subtle">Cancel</button><button id="pose-preset-apply" class="button accent" ${report.compatible?'':'disabled'}>Apply reviewed pose</button>`);
  document.querySelector('#pose-preset-cancel').onclick=close;
  document.querySelector('#pose-preset-apply').onclick=()=>{const acceptClamped=!!document.querySelector('#pose-accept-clamped')?.checked,releaseIK=!!document.querySelector('#pose-release-ik')?.checked;if(report.clamped.length&&!acceptClamped)return notify('Review and accept the joint-limit clamps before applying.',true);if(report.activeIK&&!releaseIK)return notify('Review and explicitly release IK before applying.',true);close();dispatch({action:'apply',preset,remember,acceptClamped,releaseIK});};
 };
 $('#pose-preset-review').onclick=()=>run(()=>review(chosen()));
 $('#pose-preset-export').onclick=()=>run(async()=>{const result=await api.savePosePreset(validatePosePreset(chosen()));if(result)notify('Pose saved to a new file.');return result;});
 $('#pose-preset-import').onclick=()=>run(async()=>{const preset=await api.openPosePreset();if(preset)await review(preset,true);});
}
