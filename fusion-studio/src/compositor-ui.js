import {
  createCompTree,createDefaultCompTree,setColorManagement,evaluateCompositor,createImageBuffer,attachAovs,
  createLut,exportLut,importLutCube,createPostVolume,applyPostVolume,COLOR_SPACES,COMP_NODE_TYPES
} from './compositor.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function compositorPanel(editor){
 const tree=editor.root.userData.fusion_comp;
 return `<section class="library-section" id="comp-panel"><div class="section-heading">COMPOSITOR</div>
<p class="microcopy">${tree?`${esc(tree.name)} · ${tree.nodes.length} nodes · ${esc(tree.colorSpace)}`:'No compositor tree.'}</p>
<button id="comp-new" class="full-button">New default comp tree</button>
<button id="comp-eval" class="full-button">Evaluate on preview buffer</button>
<label class="field-label">Color space<select id="comp-space">${COLOR_SPACES.map(s=>`<option ${tree?.colorSpace===s?'selected':''}>${esc(s)}</option>`).join('')}</select></label>
<button id="comp-colorspace" class="full-button">Apply color management</button>
<button id="comp-lut" class="text-button">Generate + attach LUT</button>
<button id="comp-lut-export" class="text-button">Export .cube LUT</button>
<button id="comp-volume" class="text-button">Apply post volume</button>
<button id="comp-live" class="text-button">Toggle render live-link</button>
<p class="microcopy">CPU preview compositor (${COMP_NODE_TYPES.length} node types). Not Blender node-editor parity.</p></section>`;
}

export function wireCompositorPanel({editor,run,refresh,notify}){
 const panel=document.querySelector('#comp-panel');if(!panel)return;const $=s=>panel.querySelector(s);
 $('#comp-new').onclick=()=>run(()=>{editor.root.userData.fusion_comp=createDefaultCompTree();editor.commit();notify('Compositor tree created.');refresh();});
 $('#comp-eval').onclick=()=>run(()=>{const tree=editor.root.userData.fusion_comp;if(!tree)throw Error('Create a compositor tree first.');
  let beauty=createImageBuffer(64,64,[.3,.35,.5,1]);for(let i=0;i<beauty.data.length;i+=16)beauty.data[i]=1;
  const depth=new Float32Array(64*64);for(let i=0;i<depth.length;i++)depth[i]=(i%64)/64*10;
  beauty=attachAovs(beauty,{depth,cryptomatte:new Uint16Array(64*64),vector:new Float32Array(64*64*2)});
  const out=evaluateCompositor(tree,{beauty});editor.root.userData.fusion_comp_out={width:out.width,height:out.height,mean:out.data[0]};notify(`Comp out ${out.width}×${out.height}`);editor.commit();});
 $('#comp-colorspace').onclick=()=>run(()=>{const tree=editor.root.userData.fusion_comp??=createCompTree();setColorManagement(tree,{space:$('#comp-space').value});editor.commit();refresh();});
 $('#comp-lut').onclick=()=>run(()=>{const tree=editor.root.userData.fusion_comp??=createCompTree();tree.lut=createLut(16,{contrast:1.15});editor.commit();notify('LUT attached.');});
 $('#comp-lut-export').onclick=()=>run(()=>{const tree=editor.root.userData.fusion_comp;if(!tree?.lut)throw Error('Generate a LUT first.');const cube=exportLut(tree.lut);const roundtrip=importLutCube(cube);notify(`LUT export ${cube.split('\n').length} lines · reimport size ${roundtrip.size}`);});
 $('#comp-volume').onclick=()=>run(()=>{const vol=createPostVolume({bloom:.3,vignette:.25,grain:.04,exposure:1.1});let img=createImageBuffer(32,32,[.8,.7,.4,1]);img=applyPostVolume(img,vol);editor.root.userData.fusion_post_volume=vol;notify('Post volume applied.');editor.commit();});
 $('#comp-live').onclick=()=>run(()=>{const tree=editor.root.userData.fusion_comp??=createCompTree();tree.liveLink=!tree.liveLink;notify(tree.liveLink?'Live-link on':'Live-link off');editor.commit();refresh();});
}

export function registerCompositor(registry,editor){
 registry.register({id:'comp.new_default',label:'New compositor tree',undo:'snapshot',execute:()=>{editor.root.userData.fusion_comp=createDefaultCompTree();editor.commit();}});
}
