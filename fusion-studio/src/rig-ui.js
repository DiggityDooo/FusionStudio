import {bonesOf,createIK,solveSceneIK,pathNode} from './ik.js';
import {RIG_TEMPLATES,CONTROL_SHAPES,CONSTRAINT_KINDS,RIG_LAYERS,mirrorPose,setIkBlend,setControlShape,setCustomAttr,setBoneLayer,setLayerVisible,addConstraint,setSpace,addTwistJoint,setStretch,createFootRoll} from './armature.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let selectedControl='';
export function armaturePanel(){
 return `<section class="library-section"><div class="section-heading"><span>ARMATURE</span></div><div class="pose-grid">${Object.entries(RIG_TEMPLATES).map(([id,t])=>`<button data-armature="${id}">${esc(t.label)}</button>`).join('')}</div><button id="add-bone" class="full-button">Add bone to selection</button><button id="mirror-pose" class="full-button">Mirror pose (X)</button><p class="microcopy">Biped/quadruped templates create oriented joint hierarchies. Add bone parents under the selected joint. Mirror swaps L/R quaternions.</p></section>`;
}
export function rigControls(owner){
 const bones=bonesOf(owner);if(!bones.length)return armaturePanel();
 const controls=owner.userData.fusion_ik||[],control=controls.find(c=>c.id===selectedControl)||controls[0];selectedControl=control?.id||'';
 const end=bones.find(b=>/^(Hand_L|l_hand|lHand)$/.test(b.name))||bones.find(b=>b.parent?.isBone&&b.parent.parent?.isBone);
 const coordinates=kind=>`<label class="field-label">${kind==='pole'?'Bend pole':'Target'} · character local meters</label><div class="rig-coordinates">${['X','Y','Z'].map((axis,i)=>`<label>${axis}<input aria-label="IK ${kind} ${axis}" data-ik-kind="${kind}" data-ik-axis="${i}" type="number" step=".01" value="${Number(control[kind][i]).toFixed(4)}"></label>`).join('')}</div>`;
 const layers=`<label class="field-label">Bone layer<select id="rig-layer">${RIG_LAYERS.map(l=>`<option>${l}</option>`).join('')}</select></label><button id="rig-layer-apply" class="text-button">Set on selected joint</button><div class="pose-grid">${RIG_LAYERS.map(l=>`<button data-layer-vis="${l}">${l}</button>`).join('')}</div>`;
 const attrs=Object.entries(owner.userData.fusion_custom_attrs||{});
return armaturePanel()+`<section class="library-section"><div class="section-heading"><span>INVERSE KINEMATICS</span></div><label class="field-label">End joint<select id="ik-end">${bones.filter(b=>b.parent?.isBone&&b.parent.parent?.isBone).map(b=>`<option value="${b.uuid}" ${b===end?'selected':''}>${esc(b.name)}</option>`).join('')}</select></label><label class="field-label">Parent joints<input id="ik-count" type="number" min="2" max="8" value="2"></label><button id="ik-add" class="full-button">Add IK target</button>${control?`<label class="field-label">Control<select id="ik-control">${controls.map(c=>`<option value="${c.id}" ${c===control?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label class="field-label"><input id="ik-enabled" type="checkbox" ${control.enabled?'checked':''}> Enabled</label><label class="field-label">FK/IK blend<input id="ik-blend" type="range" min="0" max="1" step=".05" value="${control.blend??1}"><output>${((control.blend??1)*100)|0}%</output></label>${coordinates('target')}${control.chain.length===2?coordinates('pole'):'<p class="microcopy">Longer chains use iterative solving with authored joint limits. Bend poles are available only for two-joint limbs.</p>'}<label class="field-label"><input id="ik-orientation" type="checkbox" ${control.keepOrientation?'checked':''}> Keep end orientation</label><label class="field-label"><input id="ik-stretch" type="checkbox" ${control.stretch?'checked':''}> Stretchy limb</label><div class="pose-grid"><button id="ik-move-target" ${control.enabled?'':'disabled'}>Move target</button>${control.chain.length===2?`<button id="ik-move-pole" ${control.enabled?'':'disabled'}>Move pole</button>`:''}<button id="ik-release">Move object</button><button id="ik-delete">Remove IK</button></div><p id="ik-status" class="microcopy"></p>`:''}<p class="microcopy">Blend 0 keeps FK, 1 is full IK. Stretch scales chain bones toward the target.</p></section>
<section class="library-section"><div class="section-heading"><span>CONSTRAINTS & CONTROLS</span></div><label class="field-label">Constraint<select id="constraint-kind">${CONSTRAINT_KINDS.map(k=>`<option>${k}</option>`).join('')}</select></label><label class="field-label">Target bone<select id="constraint-target"><option value="">—</option>${bones.map(b=>`<option value="${b.uuid}">${esc(b.name)}</option>`).join('')}</select></label><button id="constraint-add" class="full-button">Add constraint on selected bone</button>
<label class="field-label">Control shape<select id="control-shape"><option value="">None</option>${Object.entries(CONTROL_SHAPES).map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></label><button id="control-shape-apply" class="text-button">Apply shape</button>
<label class="field-label">Space<select id="rig-space"><option>world</option><option>local</option><option>parent</option><option>custom</option></select></label><button id="rig-space-apply" class="text-button">Set space</button>
<button id="twist-add" class="full-button">Insert twist joint</button><button id="foot-roll" class="full-button">Add foot roll</button>
${layers}<label class="field-label">Custom attr<input id="attr-name" placeholder="roll" maxlength="40"><input id="attr-value" type="number" step=".01" value="0"></label><button id="attr-set" class="text-button">Set</button>${attrs.map(([k,v])=>`<p class="microcopy">${esc(k)} = ${v.value}</p>`).join('')}<p class="microcopy">${(owner.userData.fusion_constraints||[]).length} constraints. Muscle/HIK/retargeting remain pending.</p></section>`;
}
export function refreshRigFields(editor){
 const c=editor.selected?.userData.fusion_ik?.find(c=>c.id===selectedControl);if(!c)return;
 for(const input of document.querySelectorAll('[data-ik-kind]'))if(document.activeElement!==input)input.value=Number(c[input.dataset.ikKind][Number(input.dataset.ikAxis)]).toFixed(4);
 const end=pathNode(editor.selected,c.end);if(end){editor.selected.updateWorldMatrix(true,true);const tip=editor.selected.worldToLocal(end.getWorldPosition(end.position.clone()));const gap=Math.hypot(...tip.toArray().map((v,i)=>v-c.target[i]));const status=document.querySelector('#ik-status');if(status)status.textContent=c.enabled?(gap>.001?`Target outside solved reach · ${(gap*100).toFixed(1)} cm remaining`:'Target reached'):'Disabled · current pose retained';}
}
export function bindRigControls({editor,operators,attempt,refresh}){
 const $=s=>document.querySelector(s),run=(id,p)=>attempt(()=>operators.run(id,p));
 document.querySelectorAll('[data-armature]').forEach(b=>b.onclick=()=>run('rig.armature_add',{template:b.dataset.armature}));
 $('#add-bone')?.addEventListener('click',()=>run('rig.bone_add',{}));
 $('#mirror-pose')?.addEventListener('click',()=>run('rig.pose_mirror',{axis:'x'}));
 $('#ik-add')?.addEventListener('click',()=>run('rig.ik_add',{endId:$('#ik-end').value,count:Number($('#ik-count').value)}));
 $('#ik-control')?.addEventListener('change',e=>{selectedControl=e.target.value;editor.ik.attach(editor.selected,selectedControl);refresh();});
 for(const input of document.querySelectorAll('[data-ik-kind]'))input.addEventListener('change',()=>run('rig.ik_update',{id:selectedControl,kind:input.dataset.ikKind,axis:Number(input.dataset.ikAxis),value:Number(input.value)}));
 for(const [id,key] of [['ik-enabled','enabled'],['ik-orientation','keepOrientation'],['ik-stretch','stretch']])$('#'+id)?.addEventListener('change',e=>run('rig.ik_update',{id:selectedControl,key,value:e.target.checked}));
 $('#ik-blend')?.addEventListener('input',e=>{e.target.nextElementSibling.textContent=((Number(e.target.value)*100)|0)+'%';});
 $('#ik-blend')?.addEventListener('change',e=>run('rig.ik_update',{id:selectedControl,key:'blend',value:Number(e.target.value)}));
 for(const kind of ['target','pole'])$('#ik-move-'+kind)?.addEventListener('click',()=>run('rig.ik_handle',{id:selectedControl,kind}));
 $('#ik-release')?.addEventListener('click',()=>editor.select(editor.selected));
 $('#ik-delete')?.addEventListener('click',()=>run('rig.ik_remove',{id:selectedControl}));
 $('#constraint-add')?.addEventListener('click',()=>run('rig.constraint_add',{kind:$('#constraint-kind').value,targetId:$('#constraint-target').value||null}));
 $('#control-shape-apply')?.addEventListener('click',()=>run('rig.control_shape',{shape:$('#control-shape').value||null}));
 $('#rig-space-apply')?.addEventListener('click',()=>run('rig.space_set',{space:$('#rig-space').value}));
 $('#twist-add')?.addEventListener('click',()=>run('rig.twist_add',{}));
 $('#foot-roll')?.addEventListener('click',()=>run('rig.foot_roll',{}));
 $('#rig-layer-apply')?.addEventListener('click',()=>run('rig.layer_set',{layer:$('#rig-layer').value}));
 document.querySelectorAll('[data-layer-vis]').forEach(b=>b.onclick=()=>run('rig.layer_vis',{layer:b.dataset.layerVis}));
 $('#attr-set')?.addEventListener('click',()=>run('rig.attr_set',{name:$('#attr-name').value,value:Number($('#attr-value').value)}));
 refreshRigFields(editor);
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
   else if(['enabled','keepOrientation','stretch'].includes(p.key)&&typeof p.value==='boolean')c[p.key]=p.value;
   else if(p.key==='blend')setIkBlend(c,p.value);else throw Error('Invalid IK edit.');
   solveSceneIK(root);
  },'Edit IK target');if(!find(p.id).enabled)editor.select(root);else if(editor.ik.controlId===p.id)editor.ik.sync();
 }});
 registry.register({id:'rig.ik_remove',label:'Remove IK target',hidden:true,undo:'delta',poll,execute:(_,p)=>{const root=owner();find(p.id);editor.editRig(root,()=>{root.userData.fusion_ik=root.userData.fusion_ik.filter(c=>c.id!==p.id);},'Remove IK target');editor.select(root);}});
 registry.register({id:'rig.ik_handle',label:'Move IK control',hidden:true,undo:'none',poll,execute:(_,p)=>{find(p.id);if(!['target','pole'].includes(p.kind))throw Error('Invalid IK handle.');editor.ik.attach(owner(),p.id,p.kind);}});
 registry.register({id:'rig.ik_finish',label:'Move IK target',hidden:true,undo:'delta',execute:(_,p)=>{try{solveSceneIK(owner());editor.finishRig(p.before,'Move IK target');}catch(error){editor.applyRig(p.before);throw error;}}});
 registry.register({id:'rig.armature_add',label:'Add armature',undo:'delta',execute:(_,p)=>editor.addArmature(p.template||'biped')});
 registry.register({id:'rig.bone_add',label:'Add bone',undo:'delta',poll:()=>!!editor.selected,execute:()=>editor.addBone()});
 registry.register({id:'rig.pose_mirror',label:'Mirror pose',undo:'delta',poll,execute:(_,p)=>{const root=owner();editor.editRig(root,()=>mirrorPose(root,{axis:p.axis||'x'}), 'Mirror pose');}});
 registry.register({id:'rig.constraint_add',label:'Add constraint',undo:'delta',poll,execute:(_,p)=>{
  const root=owner(),bone=editor.selected?.isBone?editor.selected:bonesOf(root).find(b=>b.uuid===p.ownerId)||bonesOf(root)[0];
  const target=p.targetId?root.getObjectByProperty('uuid',p.targetId):null;
  editor.editRig(root,()=>addConstraint(root,{kind:p.kind,owner:bone,target,weight:1}),'Add constraint');
 }});
 registry.register({id:'rig.control_shape',label:'Control shape',undo:'delta',poll,execute:(_,p)=>{const root=owner(),bone=editor.selected?.isBone?editor.selected:bonesOf(root)[0];editor.editRig(root,()=>setControlShape(root,bone,p.shape),'Control shape');}});
 registry.register({id:'rig.space_set',label:'Set space',undo:'delta',poll,execute:(_,p)=>{const root=owner(),bone=editor.selected?.isBone?editor.selected:bonesOf(root)[0];editor.editRig(root,()=>setSpace(root,bone,{space:p.space}),'Set space');}});
 registry.register({id:'rig.twist_add',label:'Insert twist',undo:'delta',poll,execute:()=>{const root=owner(),bone=editor.selected?.isBone?editor.selected:bonesOf(root).find(b=>b.children.some(c=>c.isBone));if(!bone)throw Error('Select a bone with a child.');editor.editRig(root,()=>addTwistJoint(bone),'Insert twist');}});
 registry.register({id:'rig.foot_roll',label:'Foot roll',undo:'delta',poll,execute:()=>{const root=owner(),foot=editor.selected?.isBone?editor.selected:bonesOf(root).find(b=>/foot/i.test(b.name));if(!foot)throw Error('Select a foot bone.');editor.editRig(root,()=>createFootRoll(root,foot),'Foot roll');}});
 registry.register({id:'rig.layer_set',label:'Bone layer',undo:'delta',poll,execute:(_,p)=>{const bone=editor.selected?.isBone?editor.selected:bonesOf(owner())[0];editor.editRig(owner(),()=>setBoneLayer(bone,p.layer),'Bone layer');}});
 registry.register({id:'rig.layer_vis',label:'Layer visibility',undo:'none',poll,execute:(_,p)=>{const root=owner(),vis=root.userData.fusion_layer_vis?.[p.layer]!==false;setLayerVisible(root,p.layer,!vis);editor.change('view');}});
 registry.register({id:'rig.attr_set',label:'Custom attribute',undo:'delta',poll,execute:(_,p)=>{const root=owner();editor.editRig(root,()=>setCustomAttr(root,p.name,p.value),'Custom attribute');}});
}
