import {
  createSketch,addSketchEntity,addSketchConstraint,solveSketch,createFeatureTree,addFeature,rebuildFeatureTree,
  createAssembly,addAssemblyPart,addMate,solveAssembly,createSheetMetal,unfoldSheetMetal,boxSolid,brepBoolean,
  exportStepCurves,createDrawingView,addLinearDimension,createExplodedView,createConfigurationTable,addConfiguration,
  topologyOptimize,feaBarTruss,joinCurves,blendCurves
} from './cad-tools.js';
import {arcCurve,bezierCurve,tessellateSurface,extrudeSurface,revolveSurface} from './nurbs.js';
import * as THREE from 'three';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function meshFromTess(tess,name){
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(tess.positions,3));
  if(tess.indices)geo.setIndex(new THREE.BufferAttribute(tess.indices,1));
  geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:0x8aa4b8,metalness:.2,roughness:.55,side:THREE.DoubleSide}));
  mesh.name=name;mesh.userData.fusion_cad=true;return mesh;
}

export function cadPanel(editor){
  const tree=editor.root.userData.fusion_cad_tree;
  return `<section class="library-section" id="cad-panel"><div class="section-heading">CAD / NURBS</div>
<p class="microcopy">${tree?`${esc(tree.name)} · ${tree.features.length} features · rebuilds ${tree.rebuildCount}`:'No feature tree.'}</p>
<button id="cad-sketch" class="full-button">New constrained sketch</button>
<button id="cad-extrude" class="full-button">Extrude arc → mesh</button>
<button id="cad-revolve" class="text-button">Revolve profile mesh</button>
<button id="cad-boolean" class="text-button">Box BREP subtract</button>
<button id="cad-sheet" class="text-button">Sheet metal unfold</button>
<button id="cad-asm" class="text-button">Assembly mate</button>
<button id="cad-step" class="text-button">Export STEP curves</button>
<button id="cad-drawing" class="text-button">Drawing + dimension</button>
<button id="cad-explode" class="text-button">Exploded view</button>
<button id="cad-config" class="text-button">Design table row</button>
<button id="cad-topo" class="text-button">Topology optimize preview</button>
<button id="cad-fea" class="text-button">FEA bar truss</button>
<button id="cad-blend" class="text-button">Blend / join demo curves</button>
<p class="microcopy">JS NURBS + CAD toolkit. Not Parasolid/ACIS parity.</p></section>`;
}

export function wireCadPanel({editor,run,refresh,notify}){
  const panel=document.querySelector('#cad-panel');if(!panel)return;const $=s=>panel.querySelector(s);
  $('#cad-sketch').onclick=()=>run(()=>{
    const sk=createSketch();const a=addSketchEntity(sk,'point',{x:0,y:0}),b=addSketchEntity(sk,'point',{x:3,y:1});
    addSketchConstraint(sk,'horizontal',[a.id,b.id]);addSketchConstraint(sk,'distance',[a.id,b.id],2);
    solveSketch(sk);editor.root.userData.fusion_sketch=sk;
    const tree=editor.root.userData.fusion_cad_tree??=createFeatureTree();addFeature(tree,'sketch',{sketch:sk});
    notify(`Sketch solved · dx=${(b.params.x-a.params.x).toFixed(3)}`);editor.commit();refresh();
  });
  $('#cad-extrude').onclick=()=>run(()=>{
    const curve=arcCurve(1,90);const surf=extrudeSurface(curve,[0,0,1.2]);const mesh=meshFromTess(tessellateSurface(surf,24,12),'CAD Extrude');
    const tree=editor.root.userData.fusion_cad_tree??=createFeatureTree();addFeature(tree,'extrude',{curve,depth:1.2});rebuildFeatureTree(tree);
    editor.root.add(mesh);editor.select(mesh);editor.commit();refresh();
  });
  $('#cad-revolve').onclick=()=>run(()=>{
    const profile=bezierCurve([[.6,0,0],[.7,0,.3],[.7,0,.7],[.5,0,1]]);
    const mesh=meshFromTess(tessellateSurface(revolveSurface(profile,270),24,24),'CAD Revolve');
    editor.root.add(mesh);editor.select(mesh);editor.commit();refresh();
  });
  $('#cad-boolean').onclick=()=>run(()=>{
    const r=brepBoolean(boxSolid({xmax:1,ymax:1,zmax:1}),boxSolid({xmin:.4,ymin:.4,zmin:.4,xmax:1.2,ymax:1.2,zmax:1.2}),'subtract');
    editor.root.userData.fusion_brep=r;notify(`BREP voxels occupied ${r.occupied}`);editor.commit();
  });
  $('#cad-sheet').onclick=()=>run(()=>{const s=createSheetMetal({});const flat=unfoldSheetMetal(s);editor.root.userData.fusion_sheet=s;notify(`Flat ${flat.length.toFixed(3)} × ${flat.width}`);editor.commit();});
  $('#cad-asm').onclick=()=>run(()=>{
    const asm=createAssembly();const A=addAssemblyPart(asm,{name:'Base'}),B=addAssemblyPart(asm,{name:'Lid',transform:[1,0,0,0,0,1,0,0,0,0,1,0,0,2,0,1]});
    addMate(asm,'distance',A.id,B.id,{dy:.5});solveAssembly(asm);editor.root.userData.fusion_assembly=asm;notify(`Lid y=${B.transform[13]}`);editor.commit();
  });
  $('#cad-step').onclick=()=>run(()=>{const txt=exportStepCurves([arcCurve(1,90)]);editor.root.userData.fusion_step=txt;notify(`STEP ${txt.split('\n').length} lines`);});
  $('#cad-drawing').onclick=()=>run(()=>{const v=createDrawingView();addLinearDimension(v,{a:[0,0],b:[1.5,0]});editor.root.userData.fusion_drawing=v;notify(`Dim ${v.dimensions[0].value}`);editor.commit();});
  $('#cad-explode').onclick=()=>run(()=>{editor.root.userData.fusion_explode=createExplodedView([{name:'A'},{name:'B'},{name:'C'}]);notify('Exploded 3 parts');editor.commit();});
  $('#cad-config').onclick=()=>run(()=>{const t=createConfigurationTable();addConfiguration(t,[2,1,.5],'Tall');editor.root.userData.fusion_configs=t;notify('Config Tall');editor.commit();});
  $('#cad-topo').onclick=()=>run(()=>{editor.root.userData.fusion_topo=topologyOptimize({res:12,volFrac:.35});notify(`Topo cells ${editor.root.userData.fusion_topo.occupied}`);editor.commit();});
  $('#cad-fea').onclick=()=>run(()=>{const r=feaBarTruss({});editor.root.userData.fusion_fea=r;notify(`σmax ${r.maxStress.toExponential(2)}`);editor.commit();});
  $('#cad-blend').onclick=()=>run(()=>{
    const a=bezierCurve([[0,0,0],[1,1,0],[2,1,0],[3,0,0]]),b=bezierCurve([[3,0,0],[4,-1,0],[5,-1,0],[6,0,0]]);
    editor.root.userData.fusion_blend={blend:blendCurves(a,b),joined:joinCurves([a,b])};notify('Blend+join stored');editor.commit();
  });
}

export function registerCad(registry,editor){
  registry.register({id:'cad.extrude_arc',label:'CAD extrude arc',undo:'snapshot',execute:()=>{
    const curve=arcCurve(1,90);const mesh=meshFromTess(tessellateSurface(extrudeSurface(curve,[0,0,1]),20,10),'CAD Extrude');
    editor.root.add(mesh);editor.select(mesh);editor.commit();
  }});
}
