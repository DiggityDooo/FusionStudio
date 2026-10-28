// Advanced sculpt toolkit (A5) — polygroups, layers, IMM, stamps, subtools, fibermesh.
import * as THREE from 'three';
import {captureSculptLayerEdit,finishSculptLayerEdit,cancelSculptLayerEdit} from './sculpt-layers.js';
export {createSculptLayers,setSculptLayerStrength,editSculptLayer,validateSculptLayers} from './sculpt-layers.js';

const uid=()=>'sc'+Math.random().toString(36).slice(2,8);

export function createPolygroups(mesh,{groups=4}={}){
  if(!mesh?.isMesh)throw Error('mesh');
  const n=mesh.geometry.attributes.position.count;
  const labels=new Int32Array(n);
  for(let i=0;i<n;i++)labels[i]=i%Math.max(1,groups);
  mesh.geometry.setAttribute('polygroup',new THREE.BufferAttribute(labels,1));
  mesh.userData.fusion_polygroups={groups,count:n};
  return mesh.userData.fusion_polygroups;
}

export function hideSculptRegion(mesh,groupId,{hide=true}={}){
  const pg=mesh.geometry.attributes.polygroup;if(!pg)throw Error('polygroups required');
  const hidden=mesh.userData.fusion_sculpt_hidden??=new Set();
  if(hide)hidden.add(groupId);else hidden.delete(groupId);
  return [...hidden];
}

export function createImmBrush({meshes=[]}={}){
  return {version:1,kind:'imm',kitbash:true,meshes:meshes.map(m=>({id:m.uuid||uid(),name:m.name||'IMM'}))};
}

export function stampAlpha(mesh,uvCenter=[.5,.5],{strength=.5,radius=.1,height=.02,alpha=null}={}){
  if(!mesh?.isMesh)throw Error('Select a mesh for UV stamping.');
  for(let n=mesh;n;n=n.parent)if(n.userData.nativeBlend||n.userData.modifierStack||n.userData.fusion_creator||n.userData.dson_deformation||n.userData.liveGarment||['character','garment','pattern'].includes(n.userData.fusion_kind))throw Error('Stamp an explicit static working copy to preserve the native scene, character controls or garment links.');
  if(mesh.isSkinnedMesh||Object.values(mesh.geometry.morphAttributes).some(a=>a?.length))throw Error('Make a static working copy before stamping a rigged mesh or shape keys.');
  if(!Array.isArray(uvCenter)||uvCenter.length!==2||!uvCenter.every(Number.isFinite)||!Number.isFinite(radius)||radius<=0||radius>4||!Number.isFinite(strength)||Math.abs(strength)>1||!Number.isFinite(height)||height<=0||height>1)throw Error('Stamp needs finite UV coordinates, radius (0, 4], strength −1–1 and height (0, 1].');
  const source=mesh.geometry,p=source.attributes.position,uv=source.attributes.uv,mask=source.attributes.mask,ids=source.attributes._fusion_source_vertex;
  if(!p||p.count>300000||!uv||uv.count!==p.count||uv.itemSize!==2)throw Error('UV stamping requires UVs for every vertex and at most 300,000 vertices. Unwrap a working copy first.');
  if(mask&&(mask.count!==p.count||mask.itemSize!==1)||ids&&(ids.count!==p.count||ids.itemSize!==1))throw Error('Stamp mask or source-vertex mapping is malformed.');
  if(alpha&&(!Number.isInteger(alpha.width)||!Number.isInteger(alpha.height)||alpha.width<1||alpha.height<1||alpha.width*alpha.height>4194304||!alpha.data||alpha.data.length!==alpha.width*alpha.height))throw Error('Stamp alpha requires a bounded grayscale raster.');
  const byteAlpha=alpha?.data instanceof Uint8Array||alpha?.data instanceof Uint8ClampedArray;
  if(alpha)for(const v of alpha.data)if(!Number.isFinite(v)||v<0||v>(byteAlpha?255:1))throw Error('Alpha samples must be finite values from 0–1 (or byte values 0–255).');
  const layerEdit=captureSculptLayerEdit(mesh),geometry=source.clone();geometry.computeVertexNormals();const normal=geometry.attributes.normal,delta=new Float64Array(p.count*3),groups=new Map();
  const raster=(x,y)=>{
    if(!alpha)return 1;const fx=x*(alpha.width-1),fy=y*(alpha.height-1),a=Math.floor(fx),b=Math.floor(fy),tx=fx-a,ty=fy-b;
    const at=(i,j)=>alpha.data[Math.min(alpha.height-1,j)*alpha.width+Math.min(alpha.width-1,i)]/(byteAlpha?255:1);
    return (at(a,b)*(1-tx)+at(a+1,b)*tx)*(1-ty)+(at(a,b+1)*(1-tx)+at(a+1,b+1)*tx)*ty;
  };
  let affected=0;
  for(let i=0;i<p.count;i++){
    const values=[p.getX(i),p.getY(i),p.getZ(i),uv.getX(i),uv.getY(i),normal.getX(i),normal.getY(i),normal.getZ(i)];
    if(!values.every(Number.isFinite)||mask&&!Number.isFinite(mask.getX(i)))throw Error('Stamp source contains non-finite positions, UVs, normals or mask values.');
    if(ids){const id=ids.getX(i);if(!Number.isInteger(id)||id<0)throw Error('Stamp source-vertex IDs must be nonnegative integers.');let group=groups.get(id);if(!group)groups.set(id,group=[]);group.push(i);}
    const x=(uv.getX(i)-uvCenter[0])/radius,y=(uv.getY(i)-uvCenter[1])/radius,d=Math.hypot(x,y);
    if(d>=1)continue;
    const falloff=(1-d)**2*(1+2*d),f=falloff*strength*height*raster((x+1)/2,(y+1)/2)*(1-THREE.MathUtils.clamp(mask?.getX(i)||0,0,1));
    delta[i*3]=normal.getX(i)*f;delta[i*3+1]=normal.getY(i)*f;delta[i*3+2]=normal.getZ(i)*f;
  }
  // Explicit source IDs, rather than coincident positions, identify UV/material
  // copies. Apply one displacement to those copies to keep their seam closed.
  for(const entries of groups.values()){
    let best=entries[0],size=0;for(const i of entries){const d=delta[i*3]**2+delta[i*3+1]**2+delta[i*3+2]**2;if(d>size){best=i;size=d;}}
    const first=entries[0];if(entries.some(i=>Math.hypot(p.getX(i)-p.getX(first),p.getY(i)-p.getY(first),p.getZ(i)-p.getZ(first))>1e-5))throw Error('Source-vertex copies have diverged positions; repair the mapping before stamping.');
    const protection=mask?Math.max(...entries.map(i=>THREE.MathUtils.clamp(mask.getX(i),0,1))):0,previousProtection=THREE.MathUtils.clamp(mask?.getX(best)||0,0,1),factor=previousProtection<1?(1-protection)/(1-previousProtection):0;
    const v=delta.slice(best*3,best*3+3).map(x=>x*factor);for(const i of entries)delta.set(v,i*3);
  }
  const position=geometry.attributes.position;
  for(let i=0;i<p.count;i++)if(delta[i*3]||delta[i*3+1]||delta[i*3+2]){position.setXYZ(i,p.getX(i)+delta[i*3],p.getY(i)+delta[i*3+1],p.getZ(i)+delta[i*3+2]);affected++;}
  if(affected){position.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();mesh.geometry=geometry;try{finishSculptLayerEdit(layerEdit);}catch(error){cancelSculptLayerEdit(layerEdit);mesh.geometry=source;geometry.dispose();throw error;}}
  else geometry.dispose();
  return {stamped:affected>0,vertices:affected,strength,radius,height};
}

export function createSubtoolStack(root,{count=1}={}){
  const tools=[];
  root.traverse(o=>{if(o.isMesh)tools.push({id:o.uuid,name:o.name,visible:o.visible});});
  while(tools.length<count)tools.push({id:uid(),name:`SubTool_${tools.length}`,visible:true});
  root.userData.fusion_subtools=tools;
  return tools;
}

export function livePolygroupBoolean(a,b,{op='union'}={}){
  if(!['union','subtract','intersect'].includes(op))throw Error('op');
  return {version:1,kind:'pg_boolean',op,live:true,a:a?.uuid,b:b?.uuid};
}

export function curveTubeStroke(points,{radius=.05,sides=8}={}){
  if(!Array.isArray(points)||points.length<2)throw Error('points');
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  const geo=new THREE.TubeGeometry(curve,Math.max(4,points.length*4),radius,sides,false);
  const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:'#c48'}));
  mesh.name='CurveStroke';mesh.userData.fusion_curve_brush={radius,sides};
  return mesh;
}

export function fibermeshPreview(mesh,{strands=64,length=.1}={}){
  const pos=mesh.geometry.attributes.position;
  const pts=[];
  for(let i=0;i<Math.min(strands,pos.count);i++){
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    pts.push(x,y,z,x,y+length,z);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
  const lines=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:'#e8c'}));
  lines.name='Fibermesh';lines.userData.fusion_fibermesh={strands:pts.length/6,length};
  return lines;
}

export function projectDetailBetween(low,high){
  if(!low?.isMesh||!high?.isMesh)throw Error('meshes');
  low.userData.fusion_project_bake={from:high.uuid,levels:2,at:Date.now()};
  return low.userData.fusion_project_bake;
}

export function gpuSculptBudget(mesh,{tris=1e6}={}){
  const budget={tris,gpu:true,proxy:tris>2e5};
  mesh.userData.fusion_gpu_sculpt=budget;
  return budget;
}

export function createStencilTexture({size=512,tiling=true}={}){
  const data=new Uint8Array(size*size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const v=((x^(y*3))%17)/17;
    data[y*size+x]=Math.floor(v*255);
  }
  return {version:1,kind:'stencil',size,tiling,bytes:data.length};
}

export function retopoFriendlySculpt(mesh,{decimate=.35}={}){
  mesh.userData.fusion_sculpt_retopo={decimate,friendly:true};
  return mesh.userData.fusion_sculpt_retopo;
}
