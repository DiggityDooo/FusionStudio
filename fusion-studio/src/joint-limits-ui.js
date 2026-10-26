import {bonesOf,solveSceneIK} from './ik.js';
import {jointLimit,jointLocalAngles,setJointLimit,removeJointLimit,jointLimitReport} from './joint-limits.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let selectedJoint='',expanded=false;
export function jointLimitPanel(owner){
 const bones=bonesOf(owner);if(!bones.length)return '';
 const bone=bones.find(b=>b.uuid===selectedJoint)||bones.find(b=>/^(l_forearm|Forearm_L)$/.test(b.name))||bones[0];selectedJoint=bone.uuid;
 const limit=jointLimit(owner,bone),angles=jointLocalAngles(owner,bone),bounds=limit?.bounds||{x:{enabled:false,min:-180,max:180},y:{enabled:false,min:-89.9,max:89.9},z:{enabled:false,min:-180,max:180}},report=jointLimitReport(owner);
 return `<section class="library-section" id="joint-limits"><details ${expanded?'open':''}><summary>Joint limits · Inspired</summary><p class="microcopy">Author local XYZ rotation offsets from the imported rest orientation. Imported anatomical limits are not guessed. Y uses the canonical ±89.9° Euler range.</p><label class="field-label">Joint<select id="limit-joint">${bones.map(b=>`<option value="${b.uuid}" ${b===bone?'selected':''}>${esc(b.name)}</option>`).join('')}</select></label><label><input id="limit-enabled" type="checkbox" ${limit?.enabled!==false?'checked':''}> Enforce authored bounds</label>${['x','y','z'].map(axis=>`<label><input id="limit-${axis}-enabled" type="checkbox" ${bounds[axis].enabled?'checked':''}> Limit ${axis.toUpperCase()}</label><div class="rig-coordinates"><label>Minimum °<input id="limit-${axis}-min" aria-label="Limit ${axis.toUpperCase()} minimum" type="number" step="1" value="${bounds[axis].min}"></label><label>Maximum °<input id="limit-${axis}-max" aria-label="Limit ${axis.toUpperCase()} maximum" type="number" step="1" value="${bounds[axis].max}"></label></div>`).join('')}<label><input id="limit-reference-current" type="checkbox"> Use current rotation as neutral reference</label><button id="limit-apply" class="full-button">Apply joint limits</button><button id="limit-remove" class="full-button" ${limit?'':'disabled'}>Remove limits on joint</button><p id="limit-status" role="status" class="microcopy">Current local offsets: X ${angles.x.toFixed(2)}° · Y ${angles.y.toFixed(2)}° · Z ${angles.z.toFixed(2)}°.<br>${limit?`This joint: ${limit.enabled?'enabled':'disabled'}. `:'No bounds on this joint. '}${report.constrained} constrained joints. ${report.corrections.length?'The evaluated pose was clamped to authored bounds.':''}</p><p class="microcopy">Bounds constrain FK, IK and sampled animation. Infeasible IK targets retain a visible remaining distance. Limit edits update linked garments in the same undo step.</p></details></section>`;
}
export function bindJointLimits({editor,operators,attempt,refresh}){
 const panel=document.querySelector('#joint-limits');if(!panel)return;const $=s=>panel.querySelector(s);
 $('details').ontoggle=e=>expanded=e.target.open;
 $('#limit-joint').onchange=e=>{selectedJoint=e.target.value;expanded=true;refresh();};
 $('#limit-apply').onclick=()=>attempt(()=>operators.run('rig.joint_limits',{boneId:$('#limit-joint').value,enabled:$('#limit-enabled').checked,captureReference:$('#limit-reference-current').checked,bounds:Object.fromEntries(['x','y','z'].map(axis=>[axis,{enabled:$('#limit-'+axis+'-enabled').checked,min:Number($('#limit-'+axis+'-min').value),max:Number($('#limit-'+axis+'-max').value)}]))}));
 $('#limit-remove').onclick=()=>attempt(()=>operators.run('rig.joint_limits',{boneId:$('#limit-joint').value,remove:true}));
}
export function registerJointLimits(operators,editor){
 operators.register({id:'rig.joint_limits',label:'Edit joint limits',hidden:true,undo:'delta',poll:()=>bonesOf(editor.selected).length>0,execute:(_,p)=>{
  const root=editor.selected,bone=root?.getObjectByProperty('uuid',p.boneId);if(!bone?.isBone)throw Error('Select a joint in the current character.');
  return editor.editRig(root,()=>{if(p.remove)removeJointLimit(root,bone);else setJointLimit(root,bone,{enabled:p.enabled,bounds:p.bounds,reference:p.captureReference?bone.quaternion.toArray():undefined});return solveSceneIK(root);},'Edit joint limits');
 }});
}
