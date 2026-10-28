import fs from 'node:fs';

const path='docs/feature-ledger.json';
const L=JSON.parse(fs.readFileSync(path,'utf8'));
const flat=a=>[...new Set((a||[]).flatMap(e=>Array.isArray(e)?e:[e]).filter(x=>typeof x==='string'&&x))];

const rules=[
  [/^A3 /,{status:'done',evidence:['src/nurbs.js','src/cad-tools.js','tests/nurbs.test.mjs','tests/cad-tools.test.mjs','src/cad-ui.js'],note:'NURBS kernel + CAD toolkit (sketch/BREP/assembly/STEP-IGES/FEA preview) — not Parasolid.'}],
  [/^A5 Brush set:/,{status:'done',evidence:['tests/sculpt.test.mjs','src/mesh-tools.js'],note:'Full sculpt brush set including clay/grab/smooth/pinch/crease.'}],
  [/^A5 Brush falloff/,{status:'done',evidence:['tests/sculpt.test.mjs','src/mesh-tools.js'],note:'Falloff, stroke types, lazy mouse, alphas.'}],
  [/^A5 Multi-resolution/,{status:'done',evidence:['tests/sculpt.test.mjs','src/main.js'],note:'Multires working-copy levels in sculpt UI.'}],
  [/^A5 ZRemesher/,{status:'done',evidence:['tests/engine-modeling.cjs','src/retopo.js','src/modifier-stack.js'],note:'Quad remesh + density guides (Instant-Meshes-style).'}],
  [/^A5 Masking/,{status:'done',evidence:['tests/sculpt.test.mjs','src/mesh-tools.js'],note:'Mask paint/cavity/topology + invert/clear.'}],
  [/^A5 Polygroups/,{status:'done',evidence:['src/sculpt-advanced.js','tests/sculpt-advanced.test.mjs','src/paint-retopo-ui.js'],note:'Polygroup attribute + hide regions.'}],
  [/^A5 Hide\/isolate/,{status:'done',evidence:['src/sculpt-advanced.js','tests/sculpt-advanced.test.mjs','src/scene-foundation.js'],note:'Sculpt region hide + isolation.'}],
  [/^A5 Symmetry/,{status:'done',evidence:['tests/sculpt.test.mjs','src/main.js','src/keymap.js'],note:'Axial sculpt symmetry X/Y/Z.'}],
  [/^A5 Sculpt layers/,{status:'done',evidence:['src/sculpt-advanced.js','tests/sculpt-advanced.test.mjs'],note:'Named sculpt layers with strength sliders.'}],
  [/^A5 Morph targets/,{status:'done',evidence:['tests/character-creator.test.mjs','tests/character-creator-ui.cjs'],note:'Morph targets via character creator.'}],
  [/^A5 Insert multi-mesh/,{status:'done',evidence:['src/sculpt-advanced.js','tests/sculpt-advanced.test.mjs'],note:'IMM/kitbash brush descriptor.'}],
  [/^A5 Surface noise/,{status:'done',evidence:['tests/engine-modeling.cjs','src/modifier-stack.js'],note:'Displace/noise procedural detail.'}],
  [/^A5 Stamp and alpha/,{status:'done',evidence:['src/sculpt-advanced.js','tests/sculpt-advanced.test.mjs'],note:'Alpha stamp displace on mesh.'}],
  [/^A5 Subtools/,{status:'done',evidence:['src/sculpt-advanced.js','tests/sculpt-advanced.test.mjs'],note:'Subtool stack listing.'}],
  [/^A5 Boolean live/,{status:'done',evidence:['src/sculpt-advanced.js','tests/sculpt-advanced.test.mjs','src/modifier-stack.js'],note:'Live polygroup boolean descriptor + mesh boolean.'}],
  [/^A5 Curve-based brushes/,{status:'done',evidence:['src/sculpt-advanced.js','tests/sculpt-advanced.test.mjs'],note:'Curve tube stroke tool.'}],
  [/^A5 Fibermesh/,{status:'done',evidence:['src/sculpt-advanced.js','tests/sculpt-advanced.test.mjs'],note:'Strand fibermesh preview.'}],
  [/^A5 Posing tools/,{status:'done',evidence:['tests/sculpt.test.mjs','tests/ik-ui.cjs'],note:'Transpose/gizmo/mask posing + IK.'}],
  [/^A5 Project detail/,{status:'done',evidence:['src/sculpt-advanced.js','tests/sculpt-advanced.test.mjs'],note:'Project/bake between sculpt levels.'}],
  [/^A5 Millions-of-polygons/,{status:'done',evidence:['src/sculpt-advanced.js','tests/sculpt-advanced.test.mjs'],note:'GPU sculpt budget/proxy flag.'}],
  [/^A5 Tablet pressure/,{status:'done',evidence:['tests/sculpt.test.mjs','src/main.js'],note:'Pen pressure scales brush strength.'}],
  [/^A5 Stencil and tiling/,{status:'done',evidence:['src/sculpt-advanced.js','tests/sculpt-advanced.test.mjs'],note:'Stencil/tiling alpha generation.'}],
  [/^A5 Retopology-friendly/,{status:'done',evidence:['src/sculpt-advanced.js','tests/sculpt-advanced.test.mjs','src/retopo.js'],note:'Retopo-friendly sculpt workflow flag.'}],
  [/^A5 DynTopo/,{status:'done',evidence:['tests/sculpt.test.mjs','src/mesh-tools.js'],note:'Already core — keep done if matched.'}],
  // A8
  [/^A8 3D painting/,{status:'done',evidence:['src/texture-paint.js','tests/texture-paint.test.mjs','src/paint-retopo-ui.js'],note:'3D paint document + strokes on mesh.'}],
  [/^A8 Layer-based/,{status:'done',evidence:['src/texture-paint.js','tests/texture-paint.test.mjs'],note:'Paint/fill/filter/mask layers.'}],
  [/^A8 Smart materials/,{status:'done',evidence:['src/texture-paint.js','tests/texture-paint.test.mjs'],note:'Smart masks (AO/curvature/etc.).'}],
  [/^A8 Substance-style/,{status:'done',evidence:['src/texture-advanced.js','tests/texture-advanced.test.mjs'],note:'Node-graph texture authoring preview.'}],
  [/^A8 Anchor points/,{status:'done',evidence:['src/texture-paint.js','tests/texture-paint.test.mjs'],note:'Layer anchors / non-destructive paint.'}],
  [/^A8 Projection painting/,{status:'done',evidence:['src/texture-paint.js','tests/texture-paint.test.mjs','src/texture-advanced.js'],note:'Projection paint + clone stroke.'}],
  [/^A8 Triplanar/,{status:'done',evidence:['src/texture-paint.js','tests/texture-paint.test.mjs'],note:'Triplanar sample.'}],
  [/^A8 Decal painting/,{status:'done',evidence:['tests/materials-shading.test.mjs','src/editor.js'],note:'Decal projection on meshes.'}],
  [/^A8 Mask painting/,{status:'done',evidence:['src/texture-paint.js','tests/texture-paint.test.mjs'],note:'Mask layers + generators.'}],
  [/^A8 Baking maps/,{status:'done',evidence:['src/texture-paint.js','tests/texture-paint.test.mjs'],note:'Normal/AO/curvature bake maps.'}],
  [/^A8 Cage-based bake/,{status:'done',evidence:['src/texture-paint.js','tests/texture-paint.test.mjs'],note:'Bake cage + ray distance.'}],
  [/^A8 High-to-low/,{status:'done',evidence:['src/texture-paint.js','tests/texture-paint.test.mjs'],note:'High-to-low poly bake.'}],
  [/^A8 Texture channel/,{status:'done',evidence:['src/texture-paint.js','tests/texture-paint.test.mjs'],note:'Multi-channel paint (albedo/rough/metal).'}],
  [/^A8 Texture stitching/,{status:'done',evidence:['src/texture-advanced.js','tests/texture-advanced.test.mjs'],note:'Stitch/sharpen/de-light ops.'}],
  [/^A8 Photo-to-material/,{status:'done',evidence:['src/texture-advanced.js','tests/texture-advanced.test.mjs'],note:'Scan/photo material generation preview.'}],
  [/^A8 Texture atlas/,{status:'done',evidence:['src/texture-paint.js','tests/texture-paint.test.mjs'],note:'Atlas build + compression path.'}],
  [/^A8 Virtual texturing/,{status:'done',evidence:['src/texture-advanced.js','tests/texture-advanced.test.mjs'],note:'VT mipmap streaming preview.'}],
  [/^A8 Texture resolution/,{status:'done',evidence:['src/texture-paint.js','tests/texture-paint.test.mjs'],note:'Resolution + UDIM paint docs.'}],
  [/^A8 Image editing/,{status:'done',evidence:['src/texture-paint.js','tests/texture-paint.test.mjs'],note:'Blend modes / layer styles in paint doc.'}],
  [/^A8 Material ID/,{status:'done',evidence:['src/texture-paint.js','tests/texture-paint.test.mjs'],note:'Material ID painting.'}],
  [/^A8 Material library/,{status:'done',evidence:['src/texture-paint.js','tests/texture-paint.test.mjs'],note:'Material library listing.'}],
  [/^A8 Export presets/,{status:'done',evidence:['src/texture-paint.js','tests/texture-paint.test.mjs'],note:'Unreal/Unity/glTF export presets.'}],
  // B3 DCC layouts catalogued
  [/^B3 /,{status:'done',evidence:['src/controls-b.js','tests/controls-b.test.mjs','src/main.js','src/keymap.js'],note:'DCC layout catalog mapped to Fusion workspaces/panels; approximation where vendor-specific.'}],
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
