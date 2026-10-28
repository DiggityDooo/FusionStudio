import {createSculptLayers,editSculptLayer,beginSculptLayerPreview,assertLayerEditable,validateSculptLayers,withSculptLayerEdit,sculptBufferCopy} from './sculpt-layers.js';
import {applyMeshFilter,MESH_FILTERS} from './mesh-tools.js';
import {hybridTransaction} from './hybrid.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function sculptLayersPanel(mesh){
  const doc=mesh?.userData?.fusion_sculpt_layers,ready=doc?.version===2,layers=ready?doc.layers:[];
  const split=!!mesh?.geometry?.attributes._fusion_source_vertex&&mesh.parent?.children.filter(n=>n.isMesh&&n.geometry.attributes._fusion_source_vertex).length>1;
  return `<section class="sculpt-layers" id="sculpt-layers-panel"><div class="section-heading">SCULPT LAYERS</div>
  <button id="sa-layers" class="full-button" ${mesh?.isMesh?'':'disabled'}>${ready?'Add sculpt layer':doc?'Migrate legacy sculpt layers':'Enable sculpt layers'}</button>
  ${split?'<p class="microcopy">This is one material-split part. Layers affect this mesh only; sculpting its borders can open seams with sibling parts. Keep the original group and inspect those borders.</p>':''}
  ${doc&&!ready?'<p class="microcopy">Legacy layer records have no captured strokes. Migration retains the current surface as the immutable base.</p>':''}
  ${layers.map((l,i)=>`<div class="sculpt-layer ${doc.active===l.id?'active':''}" data-layer-row="${esc(l.id)}">
  <button class="layer-active text-button" data-layer="${esc(l.id)}" aria-pressed="${doc.active===l.id}">${doc.active===l.id?'● Active':'○ Select'}</button>
  <input class="layer-name" data-layer="${esc(l.id)}" aria-label="Layer name" maxlength="80" value="${esc(l.name)}">
  <label class="check-row"><input class="layer-visible" data-layer="${esc(l.id)}" type="checkbox" ${l.visible?'checked':''}> Visible</label>
  <label class="check-row"><input class="layer-lock" data-layer="${esc(l.id)}" type="checkbox" ${l.locked?'checked':''}> Lock strokes</label>
  <label class="field-label">Strength <output class="layer-value">${l.strength.toFixed(2)}</output></label>
  <input class="layer-strength" data-layer="${esc(l.id)}" type="range" aria-label="${esc(l.name)} strength" min="-1" max="1" step="0.01" value="${l.strength}">
  <input class="layer-numeric" data-layer="${esc(l.id)}" type="number" aria-label="${esc(l.name)} numeric strength" min="-1" max="1" step="0.01" value="${l.strength}">
  <p class="microcopy">${l.deltas.indices.length.toLocaleString()} edited vertices</p>
  <button class="layer-duplicate text-button" data-layer="${esc(l.id)}">Duplicate</button>
  <button class="layer-delete text-button" data-layer="${esc(l.id)}" ${layers.length===1?'disabled':''}>Delete</button>
  <button class="layer-up text-button" data-layer="${esc(l.id)}" ${i===0?'disabled':''}>Up</button><button class="layer-down text-button" data-layer="${esc(l.id)}" ${i===layers.length-1?'disabled':''}>Down</button>
  </div>`).join('')}
  ${ready?'<p class="microcopy">Immutable base + additive displacement layers. Sculpt, UV stamps, component moves and filters record on the active layer. Topology changes require a static working copy. Escape cancels a strength preview.</p>':''}</section>`;
}

export function bindSculptLayers({editor,run,refresh}){
  const panel=document.querySelector('#sculpt-layers-panel');if(!panel)return;
  const mesh=editor.selected,projectId=editor.root.uuid,meshId=mesh?.uuid;
  const edit=(action,props={})=>run(async()=>{await editor.operators.run('sculpt.layers',{projectId,meshId,action,...props});refresh();});
  panel.querySelector('#sa-layers').onclick=()=>edit(mesh?.userData.fusion_sculpt_layers?.version===2?'add':'init');
  for(const button of panel.querySelectorAll('.layer-active'))button.onclick=()=>edit('active',{id:button.dataset.layer});
  for(const input of panel.querySelectorAll('.layer-name'))input.onchange=()=>edit('rename',{id:input.dataset.layer,name:input.value});
  for(const [selector,action]of [['.layer-visible','visible'],['.layer-lock','locked']])for(const input of panel.querySelectorAll(selector))input.onchange=()=>edit(action,{id:input.dataset.layer,value:input.checked});
  for(const [selector,action]of [['.layer-duplicate','duplicate'],['.layer-delete','delete']])for(const button of panel.querySelectorAll(selector))button.onclick=()=>edit(action,{id:button.dataset.layer});
  for(const [selector,step]of [['.layer-up',-1],['.layer-down',1]])for(const button of panel.querySelectorAll(selector))button.onclick=()=>edit('move',{id:button.dataset.layer,index:mesh.userData.fusion_sculpt_layers.layers.findIndex(l=>l.id===button.dataset.layer)+step});
  for(const input of panel.querySelectorAll('.layer-numeric'))input.onchange=()=>edit('strength',{id:input.dataset.layer,value:Number(input.value)});
  for(const input of panel.querySelectorAll('.layer-strength')){
    let session=null,queued=null,raf=null;const row=input.closest('[data-layer-row]');
    const sync=()=>{const value=mesh.userData.fusion_sculpt_layers.layers.find(l=>l.id===input.dataset.layer)?.strength;if(value!==undefined){input.value=value;row.querySelector('.layer-numeric').value=value;row.querySelector('.layer-value').textContent=value.toFixed(2);}};
    const cleanup=()=>{if(raf!==null)cancelAnimationFrame(raf);raf=null;queued=null;session=null;document.removeEventListener('keydown',escape,true);sync();};
    const flush=()=>{if(queued===null||!session||editor.sculptLayerPreview!==session)return;const value=queued;queued=null;session.set(value);sync();};
    const start=()=>{if(session)return;session=beginSculptLayerPreview(editor,mesh,input.dataset.layer);session.onClose=cleanup;document.addEventListener('keydown',escape,true);};
    const cancel=()=>{const current=session;if(current)current.cancel();};
    const finish=()=>run(()=>{try{if(!session||editor.sculptLayerPreview!==session){cleanup();return;}flush();session.accept();refresh();}catch(error){cancel();throw error;}});
    const escape=event=>{if(event.key==='Escape'&&session){event.preventDefault();event.stopImmediatePropagation();cancel();refresh();}};
    input.onpointerdown=()=>run(start);
    input.oninput=()=>run(()=>{try{start();queued=Number(input.value);if(raf===null)raf=requestAnimationFrame(()=>{raf=null;run(()=>{try{flush();}catch(error){cancel();throw error;}});});}catch(error){cancel();throw error;}});
    input.onchange=finish;input.onpointerup=finish;input.onpointercancel=()=>{cancel();refresh();};input.onblur=()=>{if(session)finish();};
  }
}

export function registerSculptLayerOperators(registry,editor){
  const target=p=>{if(p.projectId!==undefined&&p.projectId!==editor.root.uuid)throw Error('Sculpt layer request belongs to another project.');const mesh=editor.root.getObjectByProperty('uuid',p.meshId||editor.selected?.uuid);assertLayerEditable(mesh);return mesh;};
  registry.register({id:'sculpt.layers',label:'Edit sculpt layers',undo:'snapshot',execute:(_,p,signal)=>hybridTransaction(editor,()=>{const mesh=target(p),doc=p.action==='init'?createSculptLayers(mesh):editSculptLayer(mesh,p.action,p);return {active:doc.active,layers:doc.layers.length};},{signal})});
  registry.register({id:'sculpt.filter',label:'Apply mesh filter',undo:'snapshot',execute:(_,p,signal)=>hybridTransaction(editor,()=>{
    const mesh=target(p);if(!MESH_FILTERS.some(f=>f.id===p.kind)||!Number.isFinite(p.amount??.5)||Math.abs(p.amount??.5)>1)throw Error('Choose a supported mesh filter and finite amount from −1 to 1.');
    if(p.kind.startsWith('mask-')){validateSculptLayers(mesh);mesh.geometry=sculptBufferCopy(mesh.geometry);return applyMeshFilter(mesh.geometry,p.kind,p.amount??.5);}
    return withSculptLayerEdit(mesh,()=>applyMeshFilter(mesh.geometry,p.kind,p.amount??.5));
  },{signal})});
}
