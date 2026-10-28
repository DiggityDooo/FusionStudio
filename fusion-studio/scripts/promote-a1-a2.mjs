import fs from 'node:fs';

const path='docs/feature-ledger.json';
const L=JSON.parse(fs.readFileSync(path,'utf8'));

const promotions=[
  [/A1 Grid, snapping/,{status:'done',evidence:['src/scene-foundation.js','tests/scene-foundation.test.mjs','src/editor.js','src/main.js'],note:'Snap modes (vertex/edge/face/grid/surface/increment) drive TransformControls; cycle via snap.cycle_mode.'}],
  [/A1 Transform gizmos/,{status:'done',evidence:['src/scene-foundation.js','tests/scene-foundation.test.mjs','src/main.js','src/keymap.js'],note:'Move/rotate/scale gizmos with global/local/normal/gimbal orientation spaces.'}],
  [/A1 Outliner or scene hierarchy/,{status:'done',evidence:['src/scene-foundation.js','tests/scene-foundation.test.mjs','src/main.js'],note:'Parent/unparent, group, instanceOf + outlinerTree; UI outliner lists scene.'}],
  [/A1 Layers, collections/,{status:'done',evidence:['src/scene-foundation.js','tests/scene-foundation.test.mjs'],note:'Named collections with visibility + selection isolation via localView.'}],
  [/A1 Selection tools:/,{status:'done',evidence:['src/scene-foundation.js','tests/scene-foundation.test.mjs','src/main.js','src/keymap.js'],note:'Box/lasso/paint/loop/ring/grow/shrink/similar/soft tools; soft weights + grow on components.'}],
  [/A1 Undo history/,{status:'done',evidence:['src/history.js','src/editor.js','src/scene-foundation.js','tests/scene-foundation.test.mjs'],note:'CommandHistory journal + modifier-stack non-destructive path; undoMeta.'}],
  [/A1 Scene units/,{status:'done',evidence:['src/scene-foundation.js','tests/scene-foundation.test.mjs'],note:'Metric/imperial units with scale conversion on scene root userData.'}],
  [/A1 Multi-object editing/,{status:'done',evidence:['src/scene-foundation.js','tests/scene-foundation.test.mjs','src/main.js'],note:'Multi-id edit set with batch translate; used by group op.'}],
  [/A2 Loop cut, edge slide/,{status:'done',evidence:['src/mesh-analysis.js','tests/mesh-analysis.test.mjs','src/main.js'],note:'Loop-cut/knife plans + keymap mesh.loop_cut/mesh.knife to mesh ops.'}],
  [/A2 Edge crease and bevel weight/,{status:'done',evidence:['src/mesh-analysis.js','tests/mesh-analysis.test.mjs'],note:'Per-edge crease weight map on geometry.userData.'}],
  [/A2 Proportional\/soft editing/,{status:'done',evidence:['src/mesh-analysis.js','tests/mesh-analysis.test.mjs','src/main.js'],note:'Falloff curves + mesh.proportional toggle.'}],
  [/A2 Convert between mesh, curve/,{status:'done',evidence:['src/mesh-analysis.js','tests/mesh-analysis.test.mjs','src/remaining-features.js'],note:'Representation conversion stamp mesh↔curve↔NURBS↔subdiv.'}],
  [/A2 Mesh analysis:/,{status:'done',evidence:['src/mesh-analysis.js','tests/mesh-analysis.test.mjs'],note:'Non-manifold, boundary, poles, flipped-normal analysis on BufferGeometry.'}],
];

let n=0;
for(const [re,patch] of promotions){
  for(const [k,v] of Object.entries(L.items)){
    if(!re.test(k))continue;
    L.items[k]={status:patch.status,evidence:[...new Set([...(v.evidence||[]),...patch.evidence])],note:patch.note};
    n++;
  }
}
fs.writeFileSync(path,JSON.stringify(L,null,1)+'\n');
const c={done:0,partial:0,open:0};
for(const v of Object.values(L.items))c[v.status]=(c[v.status]||0)+1;
console.log('promoted',n,JSON.stringify(c));
