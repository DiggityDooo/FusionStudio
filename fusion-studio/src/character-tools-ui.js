import {GROOM_LIBRARY,browLashGuides,createGroom,combGuide,cutGuide,growGuide,puffGuide,smoothGuide,applyFrizz,applyCurl,applyWave,applyBraid,applyFlyaways,applyWindGravity,simulateHairDynamics,createFurOnMesh,generateStrandField,runGroomNodes,setHairShading,hairToMesh,optimizeGroomLod,exportGroomCache,interpolateChildren} from './hair-groom.js';
import {generateCharacterLods,applyBoneScale,applyExpressionPreset,EXPRESSION_PRESETS,listBaseMeshes} from './character-lod.js';
import {addSkinLayer,compositeSkinLayers,ensureSkinStack,skinLayerPresets} from './skin-layers.js';
import {bonesOf} from './rig-paths.js';
import {deformationTransaction} from './deformation-ui.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function characterToolsPanel(root){
 if(!root)return '';
 const bones=bonesOf(root),groom=root.userData.fusion_groom,bases=listBaseMeshes();
 const boneOpts=bones.map(b=>`<option value="${esc(b.name)}">${esc(b.name)}</option>`).join('');
 const exprOpts=Object.entries(EXPRESSION_PRESETS).map(([id,p])=>`<option value="${esc(id)}">${esc(p.label)}</option>`).join('');
 const guides=groom?.guides?.length||0;
 return `<section class="library-section" id="character-tools"><div class="section-heading">CHARACTER TOOLS</div>
<label class="field-label">Base mesh library<select id="ct-base" disabled>${bases.map(b=>`<option>${esc(b.label)} · ${esc(b.source)}</option>`).join('')}</select></label>
<label class="field-label">Expression<select id="ct-expr">${exprOpts}</select></label>
<label class="field-label">Weight<input id="ct-expr-w" type="range" min="0" max="1" step="0.05" value="1"></label>
<button id="ct-expr-apply" class="full-button">Apply expression</button>
<label class="field-label">Bone scale<select id="ct-bone">${boneOpts||'<option value="">No bones</option>'}</select></label>
<label class="field-label">Scale<input id="ct-bone-s" type="range" min="0.5" max="1.5" step="0.05" value="1"></label>
<button id="ct-bone-apply" class="full-button" ${bones.length?'':'disabled'}>Apply bone scale</button>
<button id="ct-lod" class="full-button">Generate LODs (1 / 0.5 / 0.25)</button>
<div class="section-heading">HAIR GROOM</div>
<label class="field-label">Preset<select id="ct-groom-lib"><option value="short_bob">Short bob</option><option value="long_straight">Long straight</option><option value="eyebrow">Eyebrows</option><option value="eyelash">Eyelashes</option><option value="beard">Beard</option></select></label>
<button id="ct-groom-load" class="full-button">Load groom onto character</button>
<p class="microcopy">${guides?`${guides} guides · ${groom.children} children`:'No groom attached.'} Comb/cut/grow edit the first guide.</p>
<button id="ct-comb" class="text-button" ${guides?'':'disabled'}>Comb +Z</button>
<button id="ct-cut" class="text-button" ${guides?'':'disabled'}>Cut 70%</button>
<button id="ct-grow" class="text-button" ${guides?'':'disabled'}>Grow</button>
<button id="ct-puff" class="text-button" ${guides?'':'disabled'}>Puff</button>
<button id="ct-smooth" class="text-button" ${guides?'':'disabled'}>Smooth</button>
<button id="ct-frizz" class="text-button" ${guides?'':'disabled'}>Frizz</button>
<button id="ct-curl" class="text-button" ${guides?'':'disabled'}>Curl</button>
<button id="ct-wave" class="text-button" ${guides?'':'disabled'}>Wave</button>
<button id="ct-braid" class="text-button" ${guides?'':'disabled'}>Braid</button>
<button id="ct-fly" class="text-button" ${guides?'':'disabled'}>Flyaways</button>
<button id="ct-wind" class="text-button" ${guides?'':'disabled'}>Wind step</button>
<button id="ct-dyn" class="text-button" ${guides?'':'disabled'}>Dynamics + collide</button>
<button id="ct-nodes" class="text-button" ${guides?'':'disabled'}>Run node graph</button>
<button id="ct-cards" class="full-button" ${guides?'':'disabled'}>Build hair cards mesh</button>
<button id="ct-groom-lod" class="full-button" ${guides?'':'disabled'}>Optimize groom LOD 50%</button>
<button id="ct-groom-export" class="full-button" ${guides?'':'disabled'}>Export groom cache JSON</button>
<button id="ct-fur" class="full-button">Grow fur on selected mesh</button>
<button id="ct-grass" class="full-button">Scatter grass field</button>
<div class="section-heading">SKIN LAYERS</div>
<button id="ct-skin-presets" class="full-button">Add makeup / tattoo / scar presets</button>
<button id="ct-skin-composite" class="full-button">Composite skin layers</button>
<p class="microcopy">${(root.userData.fusion_skin_layers?.layers?.length)||0} skin layers. Dynamics use Verlet + sphere colliders (preview). Alembic and GPU layer paint still missing.</p></section>`;
}

export function wireCharacterTools({editor,run,refresh,notify}){
 const panel=document.querySelector('#character-tools');if(!panel)return;
 const $=s=>panel.querySelector(s);
 const root=()=>editor.selected;const groom=()=>root()?.userData.fusion_groom;const gid=()=>groom()?.guides[0]?.id;
 const withGroom=fn=>run(()=>{const r=root(),g=groom();if(!r||!g)throw Error('Load a groom first.');fn(r,g);editor.commit();refresh();});
 $('#ct-expr-apply').onclick=()=>run(async()=>{const r=root();if(!r)throw Error('Select a character.');const n=await editor.operators.run('character.expression',{targetId:r.uuid,name:$('#ct-expr').value,weight:Number($('#ct-expr-w').value)});const current=editor.root.getObjectByProperty('uuid',r.uuid),missing=current?.userData.fusion_expression?.unsupported||[];notify(`Expression applied (${n} bindings).${missing.length?' Unavailable: '+missing.join(', '):''}`);refresh();});
 $('#ct-bone-apply').onclick=()=>run(()=>{const r=root();if(!r)throw Error('Select a character.');const name=$('#ct-bone').value;if(!name)throw Error('No bone selected.');applyBoneScale(r,{[name]:Number($('#ct-bone-s').value)});editor.commit();refresh();});
 $('#ct-lod').onclick=()=>run(()=>{const r=root();if(!r)throw Error('Select a character.');const lods=generateCharacterLods(r);notify(`LOD groups: ${lods.length}`);editor.commit();refresh();});
 $('#ct-groom-load').onclick=()=>run(()=>{const r=root();if(!r)throw Error('Select a character.');const key=$('#ct-groom-lib').value;r.userData.fusion_groom=['eyebrow','eyelash','beard'].includes(key)?browLashGuides(key):(GROOM_LIBRARY[key]?.()||createGroom());editor.commit();refresh();});
 $('#ct-comb').onclick=()=>withGroom((_,g)=>combGuide(g,gid(),[0,0,1],.4));
 $('#ct-cut').onclick=()=>withGroom((_,g)=>cutGuide(g,gid(),.7));
 $('#ct-grow').onclick=()=>withGroom((_,g)=>growGuide(g,gid(),.08));
 $('#ct-puff').onclick=()=>withGroom((_,g)=>puffGuide(g,gid(),.05));
 $('#ct-smooth').onclick=()=>withGroom((_,g)=>smoothGuide(g,gid(),2));
 $('#ct-frizz').onclick=()=>withGroom((_,g)=>applyFrizz(g,{amount:.008}));
 $('#ct-curl').onclick=()=>withGroom((_,g)=>applyCurl(g,{turns:2,radius:.006}));
 $('#ct-wave').onclick=()=>withGroom((_,g)=>applyWave(g,{amplitude:.01,frequency:3}));
 $('#ct-braid').onclick=()=>withGroom((_,g)=>applyBraid(g,{turns:4,radius:.005}));
 $('#ct-fly').onclick=()=>withGroom((_,g)=>applyFlyaways(g,{count:3,amount:.02}));
 $('#ct-wind').onclick=()=>withGroom((_,g)=>{g.wind=[.2,0,.1];applyWindGravity(g);});
 $('#ct-dyn').onclick=()=>withGroom((_,g)=>{g.wind=[.5,0,0];simulateHairDynamics(g,{steps:6,colliders:[{center:[0,1.4,0],radius:.12}]});});
 $('#ct-nodes').onclick=()=>withGroom((_,g)=>runGroomNodes(g,[{op:'frizz',params:{amount:.005}},{op:'wave',params:{amplitude:.008}},{op:'curl',params:{turns:1,radius:.004}}]));
 $('#ct-cards').onclick=()=>run(()=>{const r=root(),g=groom();if(!r||!g)throw Error('Load a groom first.');const mesh=hairToMesh(g);mesh.name='HairCards';r.add(mesh);setHairShading(g,{});editor.commit();notify(`Cards · ${interpolateChildren(g).length} strands`);refresh();});
 $('#ct-groom-lod').onclick=()=>withGroom((_,g)=>optimizeGroomLod(g,{keep:.5}));
 $('#ct-groom-export').onclick=()=>run(()=>{const g=groom();if(!g)throw Error('Load a groom first.');const cache=exportGroomCache(g);const blob=new Blob([JSON.stringify(cache)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='groom-cache.json';a.click();URL.revokeObjectURL(a.href);notify('Groom cache downloaded.');});
 $('#ct-fur').onclick=()=>run(()=>{const r=root();let mesh=r?.isMesh?r:null;r?.traverse(n=>{if(!mesh&&n.isMesh)mesh=n;});if(!mesh)throw Error('Select a mesh or character with a mesh.');const fur=createFurOnMesh(mesh,{density:48,length:.015});(r||mesh).userData.fusion_groom=fur;editor.commit();notify(`Fur guides: ${fur.guides.length}`);refresh();});
 $('#ct-grass').onclick=()=>run(()=>{const r=root();if(!r)throw Error('Select a root.');r.userData.fusion_groom=generateStrandField('grass',{count:40,area:.3,origin:[0,0,0]});editor.commit();refresh();});
 $('#ct-skin-presets').onclick=()=>run(()=>{const r=root();if(!r)throw Error('Select a character.');ensureSkinStack(r);for(const layer of skinLayerPresets())addSkinLayer(r,layer);editor.commit();notify('Skin layer presets added.');refresh();});
 $('#ct-skin-composite').onclick=()=>run(()=>{const r=root();if(!r)throw Error('Select a character.');const report=compositeSkinLayers(r);editor.commit();notify(`Composited ${report.count} layers.`);refresh();});
}

export function registerCharacterTools(registry,editor,{afterChange=async()=>{}}={}){
 registry.register({id:'character.generate_lods',label:'Generate character LODs',undo:'snapshot',poll:()=>!!editor.selected,execute:(_,p)=>{generateCharacterLods(editor.selected,{levels:p.levels||[1,.5,.25]});editor.commit();}});
 registry.register({id:'character.bone_scale',label:'Bone scale',undo:'snapshot',poll:()=>bonesOf(editor.selected).length>0,execute:(_,p)=>{applyBoneScale(editor.selected,p.scales||{});editor.commit();}});
 registry.register({id:'character.expression',label:'Expression preset',undo:'snapshot',poll:()=>!!editor.selected,execute:(_,p,signal)=>deformationTransaction(editor,p.targetId||editor.selected.uuid,root=>applyExpressionPreset(root,p.name,{weight:p.weight??1}),{signal,afterChange})});
 registry.register({id:'character.groom_load',label:'Load hair groom',undo:'snapshot',poll:()=>!!editor.selected,execute:(_,p)=>{const key=p.preset||'short_bob';editor.selected.userData.fusion_groom=['eyebrow','eyelash','beard'].includes(key)?browLashGuides(key):(GROOM_LIBRARY[key]?.()||createGroom());editor.commit();}});
}
