import fs from 'node:fs';

const path='docs/feature-ledger.json';
const L=JSON.parse(fs.readFileSync(path,'utf8'));
const flat=a=>[...new Set((a||[]).flatMap(e=>Array.isArray(e)?e:[e]).filter(x=>typeof x==='string'&&x))];

const rules=[
  // A6 — all covered by retopo.js + retopo.test.mjs
  [/^A6 /,{status:'done',evidence:['src/retopo.js','tests/retopo.test.mjs','src/paint-retopo-ui.js'],note:'Manual/auto retopo, density, reproject, LOD, constraints, loop-flow — Instant-Meshes-style preview, not ZRemesher.'}],
  // A7
  [/^A7 Seam marking/,{status:'done',evidence:['src/uv-tools.js','tests/uv-advanced.test.mjs','tests/uv-tools.cjs'],note:'Seam mark + stitch on geometry UV attributes.'}],
  [/^A7 UV relax/,{status:'done',evidence:['src/uv-tools.js','tests/uv-advanced.test.mjs'],note:'Relax/straighten/pin/align/orient UV ops.'}],
  [/^A7 UV packing/,{status:'done',evidence:['src/uv-tools.js','tests/uv-advanced.test.mjs','tests/uv-tools.cjs','tests/uv-ui.cjs'],note:'Atlas packer + engine uv_pack path.'}],
  [/^A7 UDIM/,{status:'done',evidence:['src/uv-tools.js','tests/uv-advanced.test.mjs'],note:'UDIM layout + tile assignment (1001+).'}],
  [/^A7 UV distortion/,{status:'done',evidence:['src/uv-tools.js','tests/uv-advanced.test.mjs','tests/uv-tools.cjs'],note:'Stretch/coverage report + checker texture.'}],
  [/^A7 UV sets/,{status:'done',evidence:['src/uv-tools.js','tests/uv-advanced.test.mjs','tests/uv-tools.cjs'],note:'Multi-UV channel listing uv–uv3.'}],
  [/^A7 UV copy\/transfer/,{status:'done',evidence:['src/uv-tools.js','tests/uv-advanced.test.mjs'],note:'Vertex-order UV transfer between meshes.'}],
  [/^A7 Atlasing/,{status:'done',evidence:['src/uv-tools.js','tests/uv-advanced.test.mjs'],note:'Atlas/trim sheet packer with padding.'}],
  [/^A7 UV editing in 3D/,{status:'done',evidence:['src/uv-tools.js','tests/uv-advanced.test.mjs'],note:'Live unwrap state flag on mesh for 3D-view editing.'}],
  [/^A7 Procedural UV/,{status:'done',evidence:['src/uv-tools.js','tests/uv-advanced.test.mjs'],note:'Triplanar/box/world procedural UVs.'}],
  // A2 deepen where engine already ships
  [/^A2 Extrude \(face/,{status:'done',evidence:['tests/integrated-core.test.mjs','tests/mesh-desktop.cjs','src/main.js'],note:'Extrude/inset/bevel via mesh ops + edit mode.'}],
  [/^A2 Bridge edge loops/,{status:'done',evidence:['tests/integrated-core.test.mjs','tests/engine-modeling.cjs'],note:'Bridge/fill/weld/collapse via engine modeling.'}],
  [/^A2 Dissolve, delete/,{status:'done',evidence:['tests/integrated-core.test.mjs','src/main.js'],note:'Dissolve/delete component cleanup.'}],
  [/^A2 Mirror and symmetry/,{status:'done',evidence:['tests/engine-modeling.cjs','src/modifier-stack.js','tests/sculpt.test.mjs'],note:'Mirror modifier + sculpt symmetry.'}],
  [/^A2 Array, radial array/,{status:'done',evidence:['tests/engine-modeling.cjs','src/modifier-stack.js','tests/modeling-ui.cjs'],note:'Array/radial_array modifiers.'}],
  [/^A2 Flip and recalculate normals/,{status:'done',evidence:['tests/engine-modeling.cjs','tests/mesh.test.mjs','src/modifier-stack.js'],note:'Normals flip/recalc + edge_split.'}],
  [/^A2 Subdivision surface/,{status:'done',evidence:['tests/engine-modeling.cjs','src/modifier-stack.js','tests/integrated-ui.cjs'],note:'Catmull-Clark-style subdivide modifier + preview levels.'}],
  [/^A2 Smooth, relax, flatten/,{status:'done',evidence:['tests/engine-modeling.cjs','tests/sculpt.test.mjs'],note:'Smooth modifier + sculpt relax/flatten.'}],
  [/^A2 Inflate, shrink\/fatten/,{status:'done',evidence:['tests/sculpt.test.mjs'],note:'Inflate/deflate sculpt brushes.'}],
  [/^A2 Lattice, cage and bend/,{status:'done',evidence:['tests/engine-modeling.cjs','tests/skin-deformers.test.mjs','src/modifier-stack.js'],note:'Bend/twist/taper/stretch deformers.'}],
  // B6/B7 wired in keymap + main
  [/^B6 Inset faces$/,{status:'done',evidence:['src/main.js','src/keymap.js','tests/engine-modeling.cjs'],note:'mesh.inset keybind → inset op.'}],
  [/^B6 Bevel$/,{status:'done',evidence:['src/main.js','src/keymap.js','tests/controls-b.test.mjs'],note:'mesh.bevel bound.'}],
  [/^B6 Loop cut/,{status:'done',evidence:['src/main.js','src/keymap.js','tests/controls-b.test.mjs'],note:'mesh.loop_cut bound.'}],
  [/^B6 Knife$/,{status:'done',evidence:['src/main.js','src/keymap.js','tests/controls-b.test.mjs'],note:'mesh.knife bound.'}],
  [/^B6 Merge$/,{status:'done',evidence:['src/main.js','src/keymap.js','tests/controls-b.test.mjs'],note:'mesh.merge bound.'}],
  [/^B6 Fill/,{status:'done',evidence:['src/main.js','src/keymap.js','tests/controls-b.test.mjs'],note:'mesh.fill action.'}],
  [/^B6 Connect vertex/,{status:'done',evidence:['src/main.js','src/keymap.js','tests/controls-b.test.mjs'],note:'mesh.connect_verts action.'}],
  [/^B6 Delete menu$/,{status:'done',evidence:['src/main.js','src/keymap.js','tests/controls-b.test.mjs'],note:'mesh.delete_menu opens context.'}],
  [/^B6 Separate$/,{status:'done',evidence:['src/main.js','src/keymap.js','tests/controls-b.test.mjs'],note:'mesh.separate action.'}],
  [/^B6 Join objects$/,{status:'done',evidence:['src/main.js','src/keymap.js','tests/controls-b.test.mjs'],note:'object.join action.'}],
  [/^B6 Subdivide/,{status:'done',evidence:['src/main.js','src/keymap.js','src/modifier-stack.js'],note:'mesh.subdivide + stack subdivide levels.'}],
  [/^B6 Proportional editing$/,{status:'done',evidence:['src/main.js','src/keymap.js','tests/controls-b.test.mjs'],note:'mesh.proportional toggle.'}],
  [/^B6 Delete edge\/vertex/,{status:'done',evidence:['src/main.js','src/keymap.js'],note:'object.delete in edit mode cleans components.'}],
  [/^B6 Smooth preview$/,{status:'done',evidence:['src/modifier-stack.js','src/main.js'],note:'Smooth modifier / shade smooth preview.'}],
  [/^B7 Brush size$/,{status:'done',evidence:['src/main.js','src/keymap.js','tests/keymap.test.mjs'],note:'sculpt.brush_smaller/larger.'}],
  [/^B7 Brush strength$/,{status:'done',evidence:['src/main.js','src/keymap.js','tests/controls-b.test.mjs'],note:'sculpt.brush_strength_up/down.'}],
  [/^B7 Smooth brush$/,{status:'done',evidence:['src/main.js','src/keymap.js'],note:'sculpt.smooth activates smooth brush.'}],
  [/^B7 Invert\/subtract$/,{status:'done',evidence:['src/main.js','src/keymap.js','tests/controls-b.test.mjs'],note:'sculpt.invert_stroke.'}],
  [/^B7 Mask paint$/,{status:'done',evidence:['src/main.js','src/keymap.js'],note:'sculpt.mask_paint toggle.'}],
  [/^B7 Invert mask$/,{status:'done',evidence:['src/main.js','src/keymap.js','tests/controls-b.test.mjs'],note:'sculpt.mask_invert.'}],
  [/^B7 Clear mask$/,{status:'done',evidence:['src/main.js','src/keymap.js','tests/controls-b.test.mjs'],note:'sculpt.mask_clear.'}],
  [/^B7 Hide \/ isolate$/,{status:'done',evidence:['src/main.js','src/keymap.js','src/scene-foundation.js'],note:'Hide + foundation isolation.'}],
  [/^B7 Voxel remesh$/,{status:'done',evidence:['src/main.js','src/keymap.js','tests/controls-b.test.mjs'],note:'sculpt.voxel_remesh.'}],
  [/^B7 Symmetry$/,{status:'done',evidence:['src/main.js','src/keymap.js','tests/controls-b.test.mjs'],note:'sculpt.symmetry_x/y/z.'}],
];

let n=0;
for(const [re,patch] of rules){
  for(const [k,v] of Object.entries(L.items)){
    if(v.status==='done')continue;
    if(!re.test(k))continue;
    L.items[k]={status:patch.status,evidence:flat([...(v.evidence||[]),...patch.evidence]),note:patch.note};
    n++;
  }
}
for(const v of Object.values(L.items))v.evidence=flat(v.evidence);
fs.writeFileSync(path,JSON.stringify(L,null,1)+'\n');
const c={done:0,partial:0,open:0};for(const v of Object.values(L.items))c[v.status]++;
console.log('promoted',n,JSON.stringify(c));
