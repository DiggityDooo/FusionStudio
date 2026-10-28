import {
  createPaintDocument,addPaintLayer,paintStroke,compositePaint,generateProceduralTexture,smartMaskFromMesh,
  paintVertexColors,paintMaterialIds,bakeMeshMaps,setBakeCage,highToLowBake,triplanarSample,createSeamlessTile,
  buildTextureAtlas,exportEngineMaps,listMaterialLibrary,applyPaintDocToMesh,setLayerAnchor,ENGINE_EXPORT_PRESETS
} from './texture-paint.js';
import {
  createRetopoSession,quadDraw,polyStrip,addEdgeFlowGuide,paintRetopoDensity,autoRetopo,reprojectToHigh,
  retopoForPurpose,generateLodChain,preserveEdgeConstraints,buildRetopoMesh,loopFlowHint,snapToSurface
} from './retopo.js';
import * as S from './sculpt-advanced.js';
import {hybridTransaction} from './hybrid.js';
import {sculptLayersPanel,bindSculptLayers,registerSculptLayerOperators} from './sculpt-layers-ui.js';
import {registerSculptMask} from './sculpt-mask.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function paintPanel(mesh){
 const doc=mesh?.userData?.fusion_paint;const layers=doc?.layers?.length||0;
 return `<section class="library-section" id="paint-panel"><div class="section-heading">TEXTURE PAINT</div>
<p class="microcopy">${doc?`${doc.size}² · ${layers} layers · UDIM ${doc.udim}`:'No paint document on selection.'}</p>
<button id="tp-new" class="full-button">New 1024 paint doc</button>
<button id="tp-layer" class="text-button">Add paint layer</button>
<button id="tp-stroke" class="text-button">Stroke UV center</button>
<button id="tp-apply" class="full-button">Composite → baseColor map</button>
<button id="tp-noise" class="text-button">Proc noise</button>
<button id="tp-bricks" class="text-button">Proc bricks</button>
<button id="tp-smart" class="text-button">Smart AO mask</button>
<button id="tp-vcol" class="text-button">Paint vertex colors</button>
<button id="tp-mid" class="text-button">Paint material ID faces</button>
<button id="tp-bake" class="full-button">Bake AO/curvature/normal</button>
<button id="tp-cage" class="text-button">Set bake cage</button>
<button id="tp-seamless" class="text-button">Seamless tile</button>
<button id="tp-atlas" class="text-button">Build atlas</button>
<label class="field-label">Engine export<select id="tp-engine">${Object.entries(ENGINE_EXPORT_PRESETS).map(([k,v])=>`<option value="${esc(k)}">${esc(v.label)}</option>`).join('')}</select></label>
<button id="tp-export" class="full-button">Export engine maps</button>
<button id="tp-lib" class="full-button">List material library</button>
<p class="microcopy">Preview CPU paint/layers/bake. Substance node graphs and UDIM multi-tile paint incomplete.</p></section>`;
}

export function sculptAdvancedPanel(mesh){
 return `<section class="library-section" id="sculpt-adv-panel"><div class="section-heading">SCULPT ADVANCED</div>
<button id="sa-poly" class="full-button">Create polygroups</button>
${sculptLayersPanel(mesh)}
<label class="field-label">Stamp U<input id="sa-u" type="number" value="0.5" step="0.01"></label>
<label class="field-label">Stamp V<input id="sa-v" type="number" value="0.5" step="0.01"></label>
<label class="field-label">UV radius<input id="sa-radius" type="number" value="0.1" min="0.001" max="4" step="0.01"></label>
<label class="field-label">Strength<input id="sa-strength" type="number" value="0.5" min="-1" max="1" step="0.05"></label>
<button id="sa-stamp" class="text-button">Stamp at UV</button>
<button id="sa-fiber" class="text-button">Fibermesh preview</button>
<button id="sa-tube" class="text-button">Curve tube stroke</button>
<p class="microcopy">Polygroups / layers / IMM-style helpers — not ZBrush GPU parity.</p></section>`;
}

export function wireSculptAdvancedPanel({editor,run,refresh,notify}){
 const panel=document.querySelector('#sculpt-adv-panel');if(!panel)return;const $=s=>panel.querySelector(s);
 const mesh=()=>{const m=editor.selected;if(!m?.isMesh)throw Error('Select a mesh.');return m;};
 bindSculptLayers({editor,run,refresh});
 {
  $('#sa-poly').onclick=()=>run(()=>{S.createPolygroups(mesh(),{groups:4});editor.commit();notify('Polygroups');refresh();});
  $('#sa-stamp').onclick=()=>run(async()=>{const result=await editor.operators.run('sculpt.stamp',{uv:[Number($('#sa-u').value),Number($('#sa-v').value)],radius:Number($('#sa-radius').value),strength:Number($('#sa-strength').value)});if(result)notify(result.stamped?`Stamped ${result.vertices} vertices`:'No unmasked vertices within this UV radius.');});
  $('#sa-fiber').onclick=()=>run(()=>{const f=S.fibermeshPreview(mesh(),{strands:48});editor.root.add(f);editor.commit();notify('Fibermesh');refresh();});
  $('#sa-tube').onclick=()=>run(()=>{const t=S.curveTubeStroke([[0,0,0],[0,.5,0],[.3,.8,0]]);editor.root.add(t);editor.select(t);editor.commit();refresh();});
 }
}

export function retopoPanel(){
 return `<section class="library-section" id="retopo-panel"><div class="section-heading">RETOPOLOGY</div>
<button id="rt-session" class="full-button">Start retopo session</button>
<button id="rt-quad" class="text-button">Draw test quad</button>
<button id="rt-strip" class="text-button">Draw strip</button>
<button id="rt-guide" class="text-button">Add edge-flow guide</button>
<button id="rt-build" class="full-button">Build manual retopo mesh</button>
<button id="rt-auto" class="full-button">Auto-retopo 35%</button>
<button id="rt-games" class="text-button">Retopo for games</button>
<button id="rt-anim" class="text-button">Retopo for animation</button>
<button id="rt-reproject" class="full-button">Reproject selected → high (sibling)</button>
<button id="rt-lod" class="full-button">Generate LOD chain</button>
<button id="rt-loops" class="text-button">Loop-flow hints</button>
<button id="rt-snap" class="text-button">Snap origin to surface</button>
<p class="microcopy">Manual quad/strip + Instant-Meshes-style stride auto-retopo. Not ZRemesher-quality.</p></section>`;
}

export function wirePaintPanel({editor,run,refresh,notify}){
 const panel=document.querySelector('#paint-panel');if(!panel)return;const $=s=>panel.querySelector(s);
 const mesh=()=>{const m=editor.selected;if(!m?.isMesh)throw Error('Select a mesh.');return m;};
 const doc=()=>{const m=mesh();if(!m.userData.fusion_paint)throw Error('Create a paint document first.');return m.userData.fusion_paint;};
 $('#tp-new').onclick=()=>run(()=>{const m=mesh();m.userData.fusion_paint=createPaintDocument(1024);editor.commit();notify('Paint doc created.');refresh();});
 $('#tp-layer').onclick=()=>run(()=>{addPaintLayer(doc(),{name:'Paint',kind:'paint'});editor.commit();refresh();});
 $('#tp-stroke').onclick=()=>run(()=>{paintStroke(doc(),[.5,.5],{radius:.05,color:'#c45c6a',strength:.9});setLayerAnchor(doc(),doc().activeLayer,'stroke');editor.commit();notify('Stroke painted.');});
 $('#tp-apply').onclick=()=>run(()=>{applyPaintDocToMesh(mesh(),doc());editor.commit();notify('Map applied.');refresh();});
 $('#tp-noise').onclick=()=>run(()=>{const t=generateProceduralTexture('noise',256);mesh().userData.fusion_proc=t;notify(`Noise ${t.size}`);editor.commit();});
 $('#tp-bricks').onclick=()=>run(()=>{mesh().userData.fusion_proc=generateProceduralTexture('bricks',256,{scale:6});editor.commit();notify('Bricks generated.');});
 $('#tp-smart').onclick=()=>run(()=>{mesh().userData.fusion_smart_mask=smartMaskFromMesh(mesh(),'ao',128);editor.commit();notify('AO smart mask.');});
 $('#tp-vcol').onclick=()=>run(()=>{paintVertexColors(mesh(),[0,1,2],'#4488ff',{strength:1});editor.commit();notify('Vertex colors.');});
 $('#tp-mid').onclick=()=>run(()=>{const m=mesh();if(!m.geometry.index)throw Error('Indexed mesh required.');paintMaterialIds(m,[0,1],2);editor.commit();notify('Material IDs.');});
 $('#tp-bake').onclick=()=>run(()=>{const bake=bakeMeshMaps(mesh(),128);mesh().userData.fusion_bake=bake;editor.commit();notify(`Baked ${Object.keys(bake.maps).join(',')}`);});
 $('#tp-cage').onclick=()=>run(()=>{setBakeCage(mesh(),{rayDistance:.08});editor.commit();notify('Bake cage set.');});
 $('#tp-seamless').onclick=()=>run(()=>{mesh().userData.fusion_proc=createSeamlessTile(256);editor.commit();notify('Seamless tile.');});
 $('#tp-atlas').onclick=()=>run(()=>{const a=generateProceduralTexture('noise',128),b=generateProceduralTexture('tiles',128);mesh().userData.fusion_atlas=buildTextureAtlas([a,b],{atlasSize:512});editor.commit();notify('Atlas built.');});
 $('#tp-export').onclick=()=>run(()=>{const maps=exportEngineMaps(doc(),$('#tp-engine').value);mesh().userData.fusion_engine_maps=maps;notify(`Exported ${maps.label}`);editor.commit();});
 $('#tp-lib').onclick=()=>run(()=>notify(listMaterialLibrary().map(m=>m.label).join(', ')));
 void compositePaint;void triplanarSample;void highToLowBake;
}

export function wireRetopoPanel({editor,run,refresh,notify}){
 const panel=document.querySelector('#retopo-panel');if(!panel)return;const $=s=>panel.querySelector(s);
 const mesh=()=>{const m=editor.selected;if(!m?.isMesh)throw Error('Select a mesh.');return m;};
 const session=()=>{const s=editor.root.userData.fusion_retopo_session;if(!s)throw Error('Start a retopo session first.');return s;};
 $('#rt-session').onclick=()=>run(()=>{editor.root.userData.fusion_retopo_session=createRetopoSession(mesh(),{symmetry:'x'});editor.commit();notify('Retopo session started.');});
 $('#rt-quad').onclick=()=>run(()=>{quadDraw(session(),[[-.1,0,0],[.1,0,0],[.1,.1,0],[-.1,.1,0]]);paintRetopoDensity(session(),0,1.5);editor.commit();notify('Quad added.');});
 $('#rt-strip').onclick=()=>run(()=>{polyStrip(session(),[[0,0,0],[.1,0,0],[.2,.05,0]]);editor.commit();});
 $('#rt-guide').onclick=()=>run(()=>{addEdgeFlowGuide(session(),[[-.2,.5,0],[0,.55,0],[.2,.5,0]]);editor.commit();});
 $('#rt-build').onclick=()=>run(()=>{const m=buildRetopoMesh(session());editor.root.add(m);editor.select(m);editor.commit();refresh();});
 $('#rt-auto').onclick=()=>run(()=>{const out=autoRetopo(mesh(),{keep:.35});editor.root.add(out);editor.select(out);editor.commit();refresh();});
 $('#rt-games').onclick=()=>run(()=>{const out=retopoForPurpose(mesh(),'games');editor.root.add(out);editor.select(out);editor.commit();refresh();});
 $('#rt-anim').onclick=()=>run(()=>{const out=retopoForPurpose(mesh(),'animation');editor.root.add(out);editor.select(out);editor.commit();refresh();});
 $('#rt-reproject').onclick=()=>run(()=>{const low=mesh();const high=editor.root.children.find(c=>c.isMesh&&c!==low);if(!high)throw Error('Need another mesh as high.');reprojectToHigh(low,high);editor.commit();notify('Reprojected.');});
 $('#rt-lod').onclick=()=>run(()=>{const chain=generateLodChain(mesh());for(const l of chain.slice(1))editor.root.add(l.mesh);preserveEdgeConstraints(mesh(),[[0,1]]);editor.commit();notify(`LODs ${chain.length}`);refresh();});
 $('#rt-loops').onclick=()=>run(()=>{const h=loopFlowHint(mesh());notify(h.note+' · '+h.rings.map(n=>n.toFixed(2)).join(', '));});
 $('#rt-snap').onclick=()=>run(()=>{const hit=snapToSurface(mesh(),[0,0,0],{maxDist:5});notify(`Snap d=${hit.distance.toFixed(3)}`);});
}

export function registerPaintRetopo(registry,editor){
 registerSculptMask(registry,editor);
 registerSculptLayerOperators(registry,editor);
 registry.register({id:'sculpt.stamp',label:'Stamp at UV',undo:'snapshot',compatibility:'sculpt',poll:()=>editor.selected?.isMesh,execute:(_,p,signal)=>hybridTransaction(editor,()=>{
  let mesh=editor.selected;if(p.workingCopy){const copy=editor.staticDuplicate();mesh=null;copy.traverse(n=>{if(!mesh&&n.isMesh)mesh=n;});if(!mesh)throw Error('Static working copy contains no mesh.');}
  const result=S.stampAlpha(mesh,p.uv??[.5,.5],p);editor.select(mesh);return result;
 },{signal})});
 registry.register({id:'paint.new_doc',label:'New texture paint document',undo:'snapshot',poll:()=>editor.selected?.isMesh,execute:()=>{editor.selected.userData.fusion_paint=createPaintDocument(1024);editor.commit();}});
 registry.register({id:'retopo.auto',label:'Auto retopology',undo:'snapshot',poll:()=>editor.selected?.isMesh,execute:(_,p)=>{const out=autoRetopo(editor.selected,{keep:p.keep??.35});editor.root.add(out);editor.select(out);editor.commit();}});
}
