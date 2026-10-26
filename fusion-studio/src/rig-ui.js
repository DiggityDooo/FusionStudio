import {bonesOf,createIK,solveSceneIK,pathNode} from './ik.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let selectedControl='';
export function rigControls(owner){
 const bones=bonesOf(owner);if(!bones.length)return '';
 const controls=owner.userData.fusion_ik||[],control=controls.find(c=>c.id===selectedControl)||controls[0];selectedControl=control?.id||'';
 const end=bones.find(b=>/^(Hand_L|l_hand|lHand)$/.test(b.name))||bones.find(b=>b.parent?.isBone&&b.parent.parent?.isBone);
 const coordinates=kind=>`<label class="field-label">${kind==='pole'?'Bend pole':'Target'} · character local meters</label><div class="rig-coordinates">${['X','Y','Z'].map((axis,i)=>`<label>${axis}<input aria-label="IK ${kind} ${axis}" data-ik-kind="${kind}" data-ik-axis="${i}" type="number" step=".01" value="${Number(control[kind][i]).toFixed(4)}"></label>`).join('')}</div>`;
return `<section class="library-section"><div class="section-heading"><span>INVERSE KINEMATICS</span></div><label class="field-label">End joint<select id="ik-end">${bones.filter(b=>b.parent?.isBone&&b.parent.parent?.isBone).map(b=>`<option value="${b.uuid}" ${b===end?'selected':''}>${esc(b.name)}</option>`).join('')}</select></label><label class="field-label">Parent joints<input id="ik-count" type="number" min="2" max="8" value="2"></label><button id="ik-add" class="full-button">Add IK target</button>${control?`<label class="field-label">Control<select id="ik-control">${controls.map(c=>`<option value="${c.id}" ${c===control?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label class="field-label"><input id="ik-enabled" type="checkbox" ${control.enabled?'checked':''}> Enabled</label>${coordinates('target')}${control.chain.length===2?coordinates('pole'):'<p class="microcopy">Longer chains use iterative solving with authored joint limits. Bend poles are available only for two-joint limbs.</p>'}<label class="field-label"><input id="ik-orientation" type="checkbox" ${control.keepOrientation?'checked':''}> Keep end orientation</label><div class="pose-grid"><button id="ik-move-target" ${control.enabled?'':'disabled'}>Move target</button>${control.chain.length===2?`<button id="ik-move-pole" ${control.enabled?'':'disabled'}>Move pole</button>`:''}<button id="ik-release">Move object</button><button id="ik-delete">Remove IK</button></div><p id="ik-status" class="microcopy"></p>`:''}<p class="microcopy">Two joints: limb target and bend pole. Three to eight: longer chains, including twist bones. Unreachable targets stop at the chain's reach. Disable a control to keep its pose and edit those joints directly. Use Joint limits below to author local bounds. Automatic anatomical constraints, retargeting and full-body IK remain pending.</p></section>`;
}
export function refreshRigFields(editor){
 const c=editor.selected?.userData.fusion_ik?.find(c=>c.id===selectedControl);if(!c)return;
 for(const input of document.querySelectorAll('[data-ik-kind]'))if(document.activeElement!==input)input.value=Number(c[input.dataset.ikKind][Number(input.dataset.ikAxis)]).toFixed(4);
 const end=pathNode(editor.selected,c.end);if(end){editor.selected.updateWorldMatrix(true,true);const tip=editor.selected.worldToLocal(end.getWorldPosition(end.position.clone()));const gap=Math.hypot(...tip.toArray().map((v,i)=>v-c.target[i]));const status=document.querySelector('#ik-status');if(status)status.textContent=c.enabled?(gap>.001?`Target outside solved reach · ${(gap*100).toFixed(1)} cm remaining`:'Target reached'):'Disabled · current pose retained';}
}
export function bindRigControls({editor,operators,attempt,refresh}){
 const $=s=>document.querySelector(s),run=(id,p)=>attempt(()=>operators.run(id,p));
 $('#ik-add')?.addEventListener('click',()=>run('rig.ik_add',{endId:$('#ik-end').value,count:Number($('#ik-count').value)}));
 $('#ik-control')?.addEventListener('change',e=>{selectedControl=e.target.value;editor.ik.attach(editor.selected,selectedControl);refresh();});
 for(const input of document.querySelectorAll('[data-ik-kind]'))input.addEventListener('change',()=>run('rig.ik_update',{id:selectedControl,kind:input.dataset.ikKind,axis:Number(input.dataset.ikAxis),value:Number(input.value)}));
 for(const [id,key] of [['ik-enabled','enabled'],['ik-orientation','keepOrientation']])$('#'+id)?.addEventListener('change',e=>run('rig.ik_update',{id:selectedControl,key,value:e.target.checked}));
 for(const kind of ['target','pole'])$('#ik-move-'+kind)?.addEventListener('click',()=>run('rig.ik_handle',{id:selectedControl,kind}));
 $('#ik-release')?.addEventListener('click',()=>editor.select(editor.selected));
 $('#ik-delete')?.addEventListener('click',()=>run('rig.ik_remove',{id:selectedControl}));refreshRigFields(editor);
}
export function registerRigOperators(registry,editor,confirm){
 const poll=()=>bonesOf(editor.selected).length>0;
 const owner=()=>{if(!poll())throw Error('Select a rigged character first.');editor.timeline.playing=false;return editor.selected;};
 const find=id=>{const c=owner().userData.fusion_ik?.find(c=>c.id===id);if(!c)throw Error('IK control is missing.');return c;};
 registry.register({id:'rig.ik_add',label:'Add IK target',hidden:true,undo:'delta',poll,execute:async(_,p)=>{
  const root=owner(),end=root.getObjectByProperty('uuid',p.endId),c=createIK(root,end,p.count);
  if(!await confirm('Add IK target?', 'IK drives the chosen bone chain after existing animation is evaluated. Its current end orientation is retained by default. Imported joint limits, corrective controllers and full-body constraints are not reproduced. Animation export samples the evaluated scene once per timeline frame; keep the Fusion project for editable controls.'))return;
  editor.editRig(root,()=>{(root.userData.fusion_ik??=[]).push(c);solveSceneIK(root);},'Add IK target');selectedControl=c.id;editor.ik.attach(root,c.id);editor.change('selection');
 }});
 registry.register({id:'rig.ik_update',label:'Edit IK target',hidden:true,undo:'delta',poll,execute:(_,p)=>{
  const root=owner();find(p.id);editor.editRig(root,()=>{
   const c=find(p.id);if(['target','pole'].includes(p.kind)&&Number.isInteger(p.axis)&&p.axis>=0&&p.axis<3&&Number.isFinite(p.value)&&Math.abs(p.value)<=10000)c[p.kind][p.axis]=p.value;
   else if(['enabled','keepOrientation'].includes(p.key)&&typeof p.value==='boolean')c[p.key]=p.value;else throw Error('Invalid IK edit.');
   solveSceneIK(root);
  },'Edit IK target');if(!find(p.id).enabled)editor.select(root);else if(editor.ik.controlId===p.id)editor.ik.sync();
 }});
 registry.register({id:'rig.ik_remove',label:'Remove IK target',hidden:true,undo:'delta',poll,execute:(_,p)=>{const root=owner();find(p.id);editor.editRig(root,()=>{root.userData.fusion_ik=root.userData.fusion_ik.filter(c=>c.id!==p.id);},'Remove IK target');editor.select(root);}});
 registry.register({id:'rig.ik_handle',label:'Move IK control',hidden:true,undo:'none',poll,execute:(_,p)=>{find(p.id);if(!['target','pole'].includes(p.kind))throw Error('Invalid IK handle.');editor.ik.attach(owner(),p.id,p.kind);}});
 registry.register({id:'rig.ik_finish',label:'Move IK target',hidden:true,undo:'delta',execute:(_,p)=>{try{solveSceneIK(owner());editor.finishRig(p.before,'Move IK target');}catch(error){editor.applyRig(p.before);throw error;}}});
}
