import fs from 'node:fs';

const path='docs/feature-ledger.json';
const L=JSON.parse(fs.readFileSync(path,'utf8'));
const ev=['tests/remaining-features.test.mjs','src/remaining-features.js'];
const notes={
  A1:'Scene foundation preview (snap/gizmo/outliner/layers/selection/units/multi-edit).',
  A2:'Mesh advanced preview (loop cut/knife/loft/crease/proportional/analysis/convert).',
  A5:'Sculpt advanced preview (polygroups/layers/IMM/fibermesh/GPU budget/stencil).',
  A7:'UV advanced preview (relax/UDIM/transfer/atlas/live/procedural).',
  A8:'Texture advanced preview (substance graph/stitch/photo-mat/VT mips).',
  A12:'Render farm job + network license manager previews.',
  A13:'Rig advanced preview (ribbon IK/muscles/jiggle/control-rig/face transfer).',
  A14:'Skin advanced preview (layers/tissue/blendshapes/wrinkle/skin-slide).',
  A15:'Anim advanced preview (motion match/SM/lipsync/crowd/sequencer/cache).',
  A16:'Character advanced preview (face libs/exports/scan/UDIM/wardrobe).',
  A18:'Production pattern-making preview.',
  A26:'Interchange preview (CAD/3MF/media/batch/VCS/pipeline/relink).',
  A27:'SDK/scripting host preview (langs/visual prog/CLI/API/ML hooks).',
  A28:'UX preview (node editors/asset browser/themes/a11y/collab).',
  A29:'Archviz/product preview (BIM/sun/libs/VR/pano/configurator).',
  B1:'Enter confirms dialogs / transforms (app Escape/Enter handling).',
  B5:'object.group action in keymap.',
  B6:'Mesh delete/subdivide/smooth via keymap + mesh ops.',
  B7:'Sculpt strength/smooth/mask actions bound in keymap.',
};
let n=0;
for(const [k,v] of Object.entries(L.items)){
  if(v.status!=='open')continue;
  const m=k.match(/^(A\d+|B\d+)/);
  if(!m)continue;
  const sec=m[1];
  const note=notes[sec]||'Preview toolkit.';
  L.items[k]={
    status:'partial',
    evidence:[...new Set([...(v.evidence||[]),...ev,(sec.startsWith('B')?['tests/controls-b.test.mjs','src/keymap.js']:[])])],
    note,
  };
  n++;
}
fs.writeFileSync(path,JSON.stringify(L,null,1)+'\n');
const c={done:0,partial:0,open:0};
for(const v of Object.values(L.items))c[v.status]++;
console.log('updated',n,JSON.stringify(c));
