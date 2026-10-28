import {applyDeltaMush,applyWrap,createLattice,applyLattice,applyShrinkwrap,applyCage,captureCageRest} from './skin-deformers.js';
import {withSculptLayerEdit} from './sculpt-layers.js';
import {hybridTransaction} from './hybrid.js';

export function deformersPanel(selected,roots=[]){
 if(!selected?.isMesh||selected.isSkinnedMesh)return '';
 const others=roots.filter(r=>r!==selected&&r.isMesh);
 return `<section class="inspector-section" id="deformers-panel"><div class="section-heading">DEFORMERS</div>
<button id="deform-delta-mush" class="full-button">Delta Mush</button>
<button id="deform-lattice" class="full-button">Create lattice</button>
<button id="deform-lattice-apply" class="full-button">Apply lattice</button>
<button id="deform-cage-rest" class="full-button">Capture cage rest</button>
<label class="field-label">Target<select id="deform-target"><option value="">—</option>${others.map(o=>`<option value="${o.uuid}">${o.name}</option>`).join('')}</select></label>
<button id="deform-wrap" class="text-button">Wrap</button>
<button id="deform-shrinkwrap" class="text-button">Shrinkwrap</button>
<button id="deform-cage" class="text-button">Cage deform</button>
<p class="microcopy">Delta Mush softens deformation while re-applying rest detail. Lattice/cage/wrap/shrinkwrap need a static mesh working copy.</p></section>`;
}
export function bindDeformers({editor,operators,attempt,refresh}){
 const $=s=>document.querySelector(s),run=(id,p)=>attempt(()=>operators.run(id,p));
 $('#deform-delta-mush')?.addEventListener('click',()=>run('mesh.delta_mush',{iterations:4,lambda:.5,strength:1}));
 $('#deform-lattice')?.addEventListener('click',()=>run('mesh.lattice_create',{resX:3,resY:3,resZ:3}));
 $('#deform-lattice-apply')?.addEventListener('click',()=>run('mesh.lattice_apply',{}));
 $('#deform-cage-rest')?.addEventListener('click',()=>run('mesh.cage_rest',{}));
 $('#deform-wrap')?.addEventListener('click',()=>run('mesh.wrap',{targetId:$('#deform-target').value,strength:1}));
 $('#deform-shrinkwrap')?.addEventListener('click',()=>run('mesh.shrinkwrap',{targetId:$('#deform-target').value,mode:'nearest',strength:1}));
 $('#deform-cage')?.addEventListener('click',()=>run('mesh.cage_apply',{targetId:$('#deform-target').value,strength:1}));
 if(refresh){/* panel already rendered */}
}
export function registerDeformers(registry,editor){
 const mesh=()=>{const m=editor.selected;if(!m?.isMesh||m.isSkinnedMesh)throw Error('Select a static mesh working copy.');return m;};
 const target=id=>{const t=editor.root.getObjectByProperty('uuid',id);if(!t?.isMesh)throw Error('Choose a target mesh.');return t;};
 const edit=(m,run)=>hybridTransaction(editor,()=>withSculptLayerEdit(m,run));
 registry.register({id:'mesh.delta_mush',label:'Delta Mush',undo:'snapshot',poll:()=>editor.selected?.isMesh&&!editor.selected.isSkinnedMesh,execute:(_,p)=>{const m=mesh();return edit(m,()=>applyDeltaMush(m,p));}});
 registry.register({id:'mesh.lattice_create',label:'Create lattice',undo:'snapshot',poll:()=>editor.selected?.isMesh&&!editor.selected.isSkinnedMesh,execute:(_,p)=>{const m=mesh(),lat=createLattice(m,p);editor.select(lat);editor.commit();}});
 registry.register({id:'mesh.lattice_apply',label:'Apply lattice',undo:'snapshot',poll:()=>!!editor.selected,execute:()=>{
  const sel=editor.selected;let lattice=sel?.userData?.fusion_kind==='lattice'?sel:null,m=editor.selected?.isMesh?editor.selected:null;
  if(lattice){m=editor.root.getObjectByProperty('uuid',lattice.userData.fusion_lattice.target);if(!m)throw Error('Lattice target mesh is missing.');}
  else if(m){lattice=editor.root.children.find(c=>c.userData?.fusion_kind==='lattice'&&c.userData.fusion_lattice?.target===m.uuid)||editor.root.getObjectByProperty('uuid',m.userData.fusion_lattice_id);}
  if(!lattice||!m)throw Error('Select a lattice or its mesh.');return edit(m,()=>{applyLattice(m,lattice);editor.select(m);});
 }});
 registry.register({id:'mesh.wrap',label:'Wrap',undo:'snapshot',poll:()=>editor.selected?.isMesh&&!editor.selected.isSkinnedMesh,execute:(_,p)=>{const m=mesh();return edit(m,()=>applyWrap(m,target(p.targetId),{strength:p.strength??1}));}});
 registry.register({id:'mesh.shrinkwrap',label:'Shrinkwrap',undo:'snapshot',poll:()=>editor.selected?.isMesh&&!editor.selected.isSkinnedMesh,execute:(_,p)=>{const m=mesh();return edit(m,()=>applyShrinkwrap(m,target(p.targetId),{mode:p.mode||'nearest',offset:p.offset||0,strength:p.strength??1}));}});
 registry.register({id:'mesh.cage_rest',label:'Capture cage rest',undo:'snapshot',poll:()=>editor.selected?.isMesh&&!editor.selected.isSkinnedMesh,execute:()=>{captureCageRest(mesh());editor.commit();}});
 registry.register({id:'mesh.cage_apply',label:'Cage deform',undo:'snapshot',poll:()=>editor.selected?.isMesh&&!editor.selected.isSkinnedMesh,execute:(_,p)=>{const m=mesh();return edit(m,()=>applyCage(m,target(p.targetId),{strength:p.strength??1}));}});
}
