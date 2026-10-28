import {
  createGeoNodeTree,addGeoNode,linkGeoNodes,exposeParam,setTreeSeed,setTreeFrame,evaluateGeoTree,
  createDefaultScatterTree,generateCityBlock,generateLSystem,generateRoadSpline,volumeCube,NODE_TYPES
} from './geometry-nodes.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function geoNodesPanel(editor){
 const tree=editor.root.userData.fusion_geo_tree;
 return `<section class="library-section" id="geo-nodes-panel"><div class="section-heading">GEOMETRY NODES</div>
<p class="microcopy">${tree?`${tree.name} · ${tree.nodes.length} nodes · seed ${tree.seed} · f${tree.frame}`:'No node tree on scene.'}</p>
<button id="gn-new" class="full-button">New empty tree</button>
<button id="gn-scatter" class="full-button">Scatter preset on selection</button>
<button id="gn-eval" class="full-button">Evaluate tree</button>
<button id="gn-city" class="text-button">City block</button>
<button id="gn-lsys" class="text-button">L-system curve</button>
<button id="gn-road" class="text-button">Road spline</button>
<button id="gn-volume" class="text-button">Volume cube</button>
<label class="field-label">Seed<input id="gn-seed" type="number" min="0" value="${tree?.seed??1}"></label>
<label class="field-label">Frame<input id="gn-frame" type="number" min="0" value="${tree?.frame??0}"></label>
<button id="gn-apply-seed" class="full-button">Apply seed/frame</button>
<p class="microcopy">Preview evaluator (authoring order). Full Blender-parity node editor / fields incomplete. Types: ${esc(NODE_TYPES.slice(0,8).join(', '))}…</p></section>`;
}

export function wireGeoNodesPanel({editor,run,refresh,notify}){
 const panel=document.querySelector('#geo-nodes-panel');if(!panel)return;const $=s=>panel.querySelector(s);
 $('#gn-new').onclick=()=>run(()=>{editor.root.userData.fusion_geo_tree=createGeoNodeTree();addGeoNode(editor.root.userData.fusion_geo_tree,'group_input');addGeoNode(editor.root.userData.fusion_geo_tree,'group_output');editor.commit();refresh();});
 $('#gn-scatter').onclick=()=>run(()=>{const m=editor.selected;if(!m?.isMesh)throw Error('Select a mesh.');const {tree,result}=createDefaultScatterTree(m);editor.root.userData.fusion_geo_tree=tree;
  if(result.output?.isObject3D){editor.root.add(result.output);editor.select(result.output);}editor.commit();notify(`Scatter · ${result.points?.count||0} pts`);refresh();});
 $('#gn-eval').onclick=()=>run(()=>{const tree=editor.root.userData.fusion_geo_tree;if(!tree)throw Error('No tree.');const mesh=editor.selected?.isMesh?editor.selected:null;
  const result=evaluateGeoTree(tree,{mesh});editor.root.userData.fusion_geo_result={points:result.points?.count,hasOut:!!result.output};notify(`Eval · out=${result.output?.type||result.output?.kind||typeof result.output}`);editor.commit();});
 $('#gn-city').onclick=()=>run(()=>{const g=generateCityBlock({blocks:3,seed:Number($('#gn-seed').value)||1});editor.root.add(g);editor.select(g);editor.commit();refresh();});
 $('#gn-lsys').onclick=()=>run(()=>{const c=generateLSystem({iterations:2});const tree=editor.root.userData.fusion_geo_tree??=createGeoNodeTree({name:'LSystem'});
  addGeoNode(tree,'lsystem',{params:{}});editor.root.userData.fusion_last_curve=c;notify(`L-system ${c.points.length} pts`);editor.commit();});
 $('#gn-road').onclick=()=>run(()=>{const m=generateRoadSpline();editor.root.add(m);editor.select(m);editor.commit();refresh();});
 $('#gn-volume').onclick=()=>run(()=>{editor.root.userData.fusion_volume=volumeCube({res:8});notify('Volume 8³');editor.commit();});
 $('#gn-apply-seed').onclick=()=>run(()=>{const tree=editor.root.userData.fusion_geo_tree;if(!tree)throw Error('No tree.');setTreeSeed(tree,Number($('#gn-seed').value)||0);setTreeFrame(tree,Number($('#gn-frame').value)||0);editor.commit();refresh();});
 void linkGeoNodes;void exposeParam;
}

export function registerGeoNodes(registry,editor){
 registry.register({id:'geo.scatter_preset',label:'Geometry nodes scatter',undo:'snapshot',poll:()=>editor.selected?.isMesh,execute:()=>{const {tree,result}=createDefaultScatterTree(editor.selected);editor.root.userData.fusion_geo_tree=tree;if(result.output?.isObject3D){editor.root.add(result.output);editor.select(result.output);}editor.commit();}});
}
