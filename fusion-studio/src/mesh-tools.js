import * as THREE from 'three';

export function canonicalGeometry(source){
  const pos=source.attributes.position,uv=source.attributes.uv,map=new Map(),positions=[],uvs=[],remap=[];
  for(let i=0;i<pos.count;i++){
    const key=[pos.getX(i),pos.getY(i),pos.getZ(i)].map(n=>Math.round(n*1e6)).join(',');
    let index=map.get(key);if(index===undefined){index=positions.length/3;map.set(key,index);positions.push(pos.getX(i),pos.getY(i),pos.getZ(i));uvs.push(uv?.getX(i)||0,uv?.getY(i)||0);}remap.push(index);
  }
  const old=source.index?.array||Array.from({length:pos.count},(_,i)=>i);const indices=Array.from(old,i=>remap[i]);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
}
export function coplanarFaces(geometry,faceIndex){
  const p=geometry.attributes.position,idx=geometry.index?.array||Array.from({length:p.count},(_,i)=>i);
  const a=new THREE.Vector3().fromBufferAttribute(p,idx[faceIndex*3]),b=new THREE.Vector3().fromBufferAttribute(p,idx[faceIndex*3+1]),c=new THREE.Vector3().fromBufferAttribute(p,idx[faceIndex*3+2]);
  const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();const plane=normal.dot(a);const faces=[];
  for(let f=0;f<idx.length/3;f++){
    const p0=new THREE.Vector3().fromBufferAttribute(p,idx[f*3]),p1=new THREE.Vector3().fromBufferAttribute(p,idx[f*3+1]),p2=new THREE.Vector3().fromBufferAttribute(p,idx[f*3+2]);
    const n=p1.clone().sub(p0).cross(p2.clone().sub(p0)).normalize();
    if(n.dot(normal)>.9999&&Math.abs(normal.dot(p0)-plane)<1e-5)faces.push(f);
  }
  return {faces,normal};
}
export function extrudeRegion(source,faceIndex,distance=.15){
  const selected=coplanarFaces(source,faceIndex);const geo=canonicalGeometry(source);const idx=Array.from(geo.index.array);const pos=Array.from(geo.attributes.position.array);const uv=Array.from(geo.attributes.uv.array);
  const selectedSet=new Set(selected.faces),vertexSet=new Set(),boundary=new Map();
  for(const f of selected.faces){const t=idx.slice(f*3,f*3+3);for(const i of t)vertexSet.add(i);for(let e=0;e<3;e++){const a=t[e],b=t[(e+1)%3],key=Math.min(a,b)+':'+Math.max(a,b);const item=boundary.get(key);if(item)item.count++;else boundary.set(key,{a,b,count:1});}}
  const duplicate=new Map();for(const vertex of vertexSet){const n=pos.length/3;duplicate.set(vertex,n);const point=new THREE.Vector3(pos[vertex*3],pos[vertex*3+1],pos[vertex*3+2]).addScaledVector(selected.normal,distance);pos.push(...point.toArray());uv.push(uv[vertex*2],uv[vertex*2+1]);}
  const next=[];for(let f=0;f<idx.length/3;f++)if(!selectedSet.has(f))next.push(...idx.slice(f*3,f*3+3));
  for(const f of selected.faces)next.push(...idx.slice(f*3,f*3+3).map(i=>duplicate.get(i)));
  for(const {a,b,count} of boundary.values())if(count===1){const c=duplicate.get(a),d=duplicate.get(b);next.push(a,b,c,b,d,c);}
  const result=new THREE.BufferGeometry();result.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));result.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));result.setIndex(next);result.computeVertexNormals();result.computeBoundingSphere();geo.dispose();return result;
}
export function deleteRegion(source,faceIndex){
  const {faces}=coplanarFaces(source,faceIndex),set=new Set(faces);const geo=source.clone();const idx=Array.from(source.index?.array||Array.from({length:source.attributes.position.count},(_,i)=>i));const next=[];
  for(let f=0;f<idx.length/3;f++)if(!set.has(f))next.push(...idx.slice(f*3,f*3+3));geo.clearGroups();geo.setIndex(next);geo.computeVertexNormals();geo.computeBoundingSphere();return geo;
}
export const SCULPT_BRUSHES=[
  {id:'draw',label:'Draw',icon:'brush'},{id:'draw-sharp',label:'Draw Sharp',icon:'pen-line'},
  {id:'inflate',label:'Inflate',icon:'expand'},{id:'deflate',label:'Deflate',icon:'shrink'},
  {id:'blob',label:'Blob',icon:'circle'},{id:'clay',label:'Clay',icon:'layers'},
  {id:'clay-strips',label:'Clay Strips',icon:'rectangle-horizontal'},{id:'layer',label:'Layer',icon:'layers-2'},
  {id:'crease',label:'Crease',icon:'fold-vertical'},{id:'crease-sharp',label:'Crease Sharp',icon:'pen-tool'},
  {id:'crease-polish',label:'Crease Polish',icon:'sparkles'},{id:'smooth',label:'Smooth',icon:'waves'},
  {id:'flatten',label:'Flatten',icon:'align-horizontal-justify-center'},{id:'contrast',label:'Contrast',icon:'contrast'},
  {id:'fill',label:'Fill',icon:'arrow-up-from-line'},{id:'deepen',label:'Deepen',icon:'arrow-down-from-line'},
  {id:'scrape',label:'Scrape',icon:'slice'},{id:'peaks',label:'Peaks',icon:'mountain'},
  {id:'pinch',label:'Pinch',icon:'shrink'},{id:'magnify',label:'Magnify',icon:'expand'},
  {id:'nudge',label:'Nudge',icon:'move'},{id:'thumb',label:'Thumb',icon:'hand'},
  {id:'snake-hook',label:'Snake Hook',icon:'hook'},{id:'grab',label:'Grab',icon:'grab'},
  {id:'rotate',label:'Rotate',icon:'rotate-3d'},{id:'slide-relax',label:'Slide / Relax',icon:'shuffle'},
  {id:'mask',label:'Mask',icon:'shield'},{id:'multi-plane-scrape',label:'Multi-plane Scrape',icon:'triangle-right'},
  {id:'elastic-deform',label:'Elastic Deform',icon:'spline'},{id:'cloth',label:'Cloth',icon:'waves-2'},
  {id:'pose',label:'Pose',icon:'bone'},
];
// Paired tools: holding invert (Shift) switches to the defined counterpart instead of a sign flip that may do nothing.
export const INVERT_PAIRS={pinch:'magnify',magnify:'pinch',fill:'deepen',deepen:'fill',scrape:'peaks',peaks:'scrape',flatten:'contrast',contrast:'flatten'};
export function maskAttribute(geo){
  let attr=geo.attributes.mask;
  if(!attr){attr=new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count),1);attr.name='mask';geo.setAttribute('mask',attr);}
  return attr;
}
export function clearMask(geo){const attr=geo.attributes.mask;if(attr){attr.array.fill(0);attr.needsUpdate=true;} }
export function invertMask(geo){const attr=maskAttribute(geo);for(let i=0;i<attr.count;i++)attr.array[i]=1-attr.array[i];attr.needsUpdate=true;}
export const FALLOFFS=['smooth','sphere','root','sharp','linear','constant'];
export function falloffValue(kind,t){ // t = distance/radius in [0,1]
  const u=Math.max(0,1-t);
  switch(kind){case 'sphere':return Math.sqrt(Math.max(0,1-t*t));case 'root':return Math.sqrt(u);case 'sharp':return u*u*u;case 'linear':return u;case 'constant':return 1;default:return u*u*(3-2*u);}
}
let adjacencyCache={key:null,adjacency:null};
function topologyKey(geo){ // vertex count alone is NOT topology identity (plan 7.6)
  const idx=geo.index?.array,p=geo.attributes.position;
  if(!idx)return `noidx:${p.count}`;
  let sum=0;const step=Math.max(1,Math.floor(idx.length/64));
  for(let i=0;i<idx.length;i+=step)sum=(sum*31+idx[i])>>>0;
  return `${p.count}:${idx.length}:${idx[0]}:${idx[idx.length-1]}:${sum}`;
}
function adjacencyFor(geo){
  const key=geo.uuid+':'+topologyKey(geo);
  if(adjacencyCache.key===key)return adjacencyCache.adjacency;
  const p=geo.attributes.position,adjacency=Array.from({length:p.count},()=>new Set());const indices=geo.index?.array||Array.from({length:p.count},(_,i)=>i);
  for(let i=0;i<indices.length;i+=3){const tri=[indices[i],indices[i+1],indices[i+2]];for(const a of tri)for(const b of tri)if(a!==b)adjacency[a].add(b);}
  adjacencyCache={key,adjacency};return adjacency;
}
const DRAG_MODES=new Set(['nudge','thumb','snake-hook','grab']);
export function sculptGeometry(mesh,point,radius=.12,strength=.01,mode='inflate',invert=false,opts={}){
  const geo=mesh.geometry,p=geo.attributes.position,n=geo.attributes.normal;mesh.updateWorldMatrix(true,false);
  if(invert&&INVERT_PAIRS[mode]){mode=INVERT_PAIRS[mode];invert=false;}
  const falloffKind=opts.falloff||'smooth',dir=invert?-1:1;
  const inverse=mesh.matrixWorld.clone().invert(),normalMatrix=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const brushNormal=(opts.normal?opts.normal.clone():new THREE.Vector3(0,0,1)).normalize();
  const drag=opts.delta?opts.delta.clone():new THREE.Vector3();
  const mask=geo.attributes.mask,protection=i=>mask?THREE.MathUtils.clamp(mask.array[i]||0,0,1):0;
  if(mode==='mask'){ // persistent protection channel; never touches positions or vertex colors
    const attr=maskAttribute(geo);let touched=0;
    const w=new THREE.Vector3();
    for(let i=0;i<p.count;i++){w.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);const d=w.distanceTo(point);if(d>radius)continue;attr.array[i]=THREE.MathUtils.clamp(attr.array[i]+dir*falloffValue(falloffKind,d/radius)*Math.abs(strength)*24,0,1);touched++;}
    attr.needsUpdate=true;return touched;
  }
  const saved=new Float32Array(p.array),affected=[],world=new THREE.Vector3(),vNormal=new THREE.Vector3(),tmp=new THREE.Vector3(),tmp2=new THREE.Vector3();
  // Clay Strips frame: tangent along stroke direction, binormal across it, both in the brush plane.
  const tangent=new THREE.Vector3(1,0,0);if(drag.lengthSq()>1e-12)tangent.copy(drag).addScaledVector(brushNormal,-drag.dot(brushNormal));
  if(tangent.lengthSq()<1e-9)tangent.set(1,0,0).addScaledVector(brushNormal,-brushNormal.x);tangent.normalize();
  const binormal=new THREE.Vector3().crossVectors(brushNormal,tangent).normalize();
  const reach=mode==='elastic-deform'?radius*3:radius; // Elastic Deform's gaussian field extends past the brush circle
  for(let i=0;i<p.count;i++){
    world.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);const distance=world.distanceTo(point);if(distance>reach)continue;
    const f0=falloffValue(falloffKind,distance/radius),f=f0*(1-protection(i));if(f<=0&&mode!=='smooth'&&mode!=='elastic-deform')continue;
    affected.push(i);
    if(mode==='smooth'||mode==='slide-relax'||mode==='crease-polish')continue;
    vNormal.fromBufferAttribute(n,i).applyMatrix3(normalMatrix).normalize();
    const height=tmp.copy(world).sub(point).dot(brushNormal); // signed height above brush plane
    const k=Math.min(1,Math.abs(strength)*22); // plane-tool rate
    switch(mode){
      case 'draw': world.addScaledVector(brushNormal,strength*f*dir); break;
      case 'draw-sharp': world.addScaledVector(brushNormal,strength*falloffValue('sharp',distance/radius)*(1-protection(i))*dir); break;
      case 'inflate': world.addScaledVector(vNormal,strength*f*dir); break;
      case 'deflate': world.addScaledVector(vNormal,-strength*f*dir); break;
      case 'blob': world.addScaledVector(vNormal,strength*falloffValue('sphere',distance/radius)*(1-protection(i))*dir); break;
      case 'clay': { const target=strength*8*dir; const step=THREE.MathUtils.clamp(target-height,-Math.abs(strength)*f*4,Math.abs(strength)*f*4); world.addScaledVector(brushNormal,step); break; }
      case 'clay-strips': { // oriented rectangular footprint: soft along tangent, bounded across binormal
        tmp2.copy(world).sub(point);const u=tmp2.dot(tangent)/radius,v=tmp2.dot(binormal)/radius;
        const rect=Math.max(0,1-Math.abs(v))*(0.35+0.65*Math.max(0,1-Math.abs(u)));
        const target=strength*8*dir,step=THREE.MathUtils.clamp(target-height,-Math.abs(strength)*rect*(1-protection(i))*4,Math.abs(strength)*rect*(1-protection(i))*4);
        world.addScaledVector(brushNormal,step); break; }
      case 'layer': { // capped relative to the stroke-start base captured by MeshTools (opts.layerBase, local coords)
        if(opts.layerBase){tmp2.fromArray(opts.layerBase,i*3).applyMatrix4(mesh.matrixWorld);const baseHeight=tmp2.sub(point).dot(brushNormal);const target=baseHeight+strength*10*dir;const step=THREE.MathUtils.clamp(target-height,-Math.abs(strength)*f*4,Math.abs(strength)*f*4);world.addScaledVector(brushNormal,step);} break; }
      case 'crease': world.addScaledVector(brushNormal,-strength*f*dir*.7).add(tmp.copy(point).sub(world).multiplyScalar(f*.18)); break;
      case 'crease-sharp': world.addScaledVector(brushNormal,-strength*falloffValue('sharp',distance/radius)*(1-protection(i))*dir).add(tmp.copy(point).sub(world).multiplyScalar(f*.3)); break;
      case 'flatten': world.addScaledVector(brushNormal,-height*k*f); break;
      case 'contrast': world.addScaledVector(brushNormal,Math.sign(height)*Math.abs(strength)*f*1.4); break;
      case 'fill': if(height<0)world.addScaledVector(brushNormal,-height*k*f); break;
      case 'deepen': if(height<0)world.addScaledVector(brushNormal,-Math.abs(strength)*f*1.4); break;
      case 'scrape': if(height>0)world.addScaledVector(brushNormal,-height*Math.min(1,Math.abs(strength)*26)*f).add(tmp.copy(point).sub(world).multiplyScalar(f*.08)); break;
      case 'peaks': if(height>0)world.addScaledVector(brushNormal,Math.abs(strength)*f*1.4); break;
      case 'pinch': case 'magnify': { tmp.copy(world).sub(point); tmp.addScaledVector(brushNormal,-tmp.dot(brushNormal)); world.addScaledVector(tmp,(mode==='pinch'?-1:1)*Math.min(.6,Math.abs(strength)*14)*f); break; }
      case 'nudge': world.addScaledVector(drag,f); break;
      case 'thumb': world.addScaledVector(drag,f*.8).addScaledVector(brushNormal,-height*Math.min(1,Math.abs(strength)*10)*f); break;
      case 'snake-hook': world.addScaledVector(drag,f*f*1.6); break;
      case 'grab': world.addScaledVector(drag,f); break;
      case 'rotate': { const angle=strength*14*f*dir; tmp.copy(world).sub(point).applyAxisAngle(brushNormal,angle); world.copy(point).add(tmp); break; }
      case 'multi-plane-scrape': { // two planes meeting at a crease along the binormal through the brush center
        const angle=(opts.planeAngle??Math.PI/3),n2=tmp2.copy(brushNormal).applyAxisAngle(binormal,angle).normalize();
        tmp.copy(world).sub(point);const u=tmp.dot(tangent);
        const useSecond=u>0,planeNormal=useSecond?n2:brushNormal,h=tmp.dot(planeNormal);
        world.addScaledVector(planeNormal,-h*Math.min(1,Math.abs(strength)*24)*f); break; }
      case 'cloth': { // artistic wrinkle deformation (NOT a simulation): folds across the stroke direction
        tmp.copy(world).sub(point);const u=tmp.dot(tangent),wavelength=Math.max(radius/2.5,1e-4);
        const wave=Math.sin(u/wavelength*Math.PI*2)*Math.abs(strength)*2.2*f*dir;
        world.addScaledVector(brushNormal,wave).addScaledVector(tangent,Math.cos(u/wavelength*Math.PI*2)*Math.abs(strength)*.5*f*dir); break; }
      case 'pose': { // bend the region beyond the brush center around the binormal pivot axis
        tmp.copy(world).sub(point);const u=tmp.dot(tangent);
        if(u>0){const bend=strength*14*dir*Math.min(1,u/radius)*(0.3+0.7*f0);tmp.applyAxisAngle(binormal,bend);world.copy(point).add(tmp);} break; }
      case 'elastic-deform': { // gaussian field reaching beyond the brush radius, unlike Grab's bounded falloff
        const sigma=radius*1.35,g=Math.exp(-(distance*distance)/(2*sigma*sigma))*(1-protection(i));
        world.addScaledVector(drag,g); break; }
      default: world.addScaledVector(vNormal,strength*f*dir);
    }
    world.applyMatrix4(inverse);p.setXYZ(i,world.x,world.y,world.z);
  }
  if(mode==='smooth'||mode==='slide-relax'||mode==='crease-polish'||(opts.autosmooth>0&&affected.length)){
    // Read the POST-primary positions (plan 7.6: autosmooth must not smooth the pre-stroke mesh over the brush result).
    const post=new Float32Array(p.array);
    const isPrimary=mode==='smooth'||mode==='slide-relax'||mode==='crease-polish';
    const amount=isPrimary?Math.min(.6,Math.abs(strength)*16):Math.min(.5,opts.autosmooth);
    const adjacency=adjacencyFor(geo),prior=new THREE.Vector3(),avg=new THREE.Vector3(),tan=new THREE.Vector3(),wp=new THREE.Vector3();
    for(const i of affected){const neighbors=adjacency[i];if(!neighbors||!neighbors.size)continue;avg.set(0,0,0);for(const j of neighbors)avg.add(tan.set(post[j*3],post[j*3+1],post[j*3+2]));avg.divideScalar(neighbors.size);prior.set(post[i*3],post[i*3+1],post[i*3+2]);
      wp.copy(prior).applyMatrix4(mesh.matrixWorld);const wf=falloffValue(falloffKind,Math.min(1,wp.distanceTo(point)/radius))*(1-protection(i));
      if(mode==='slide-relax'){ tan.copy(avg).sub(prior);vNormal.fromBufferAttribute(n,i);tan.addScaledVector(vNormal,-tan.dot(vNormal));prior.addScaledVector(tan,amount*.5*wf); }
      else if(mode==='crease-polish'){ // smooth the flanks, spare the crease center itself
        const centerSparing=1-falloffValue('sharp',Math.min(1,wp.distanceTo(point)/radius));prior.lerp(avg,amount*centerSparing*wf); }
      else prior.lerp(avg,amount*wf);
      p.setXYZ(i,prior.x,prior.y,prior.z);}
  }
  p.needsUpdate=true;geo.computeVertexNormals();geo.computeBoundingSphere();geo.computeBoundingBox();return affected.length;
}

export class MeshTools{
  constructor(editor){
    this.editor=editor;this.mode='object';this.brush={radius:.15,strength:.014,type:'draw',falloff:'smooth',autosmooth:0,symmetry:{x:false,y:false,z:false}};this.activeMesh=null;this.faceIndex=null;this.stroke=false;this.lastPoint=null;
    this.faceHighlight=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({color:'#ff9b33',transparent:true,opacity:.4,side:THREE.DoubleSide,depthTest:false}));this.faceHighlight.visible=false;this.faceHighlight.renderOrder=10;editor.scene.add(this.faceHighlight);
    const canvas=editor.renderer.domElement;
    canvas.addEventListener('pointerdown',e=>{if(this.mode==='object'||e.button!==0||e.altKey)return;const hit=this.hit(e);if(!hit)return;e.stopImmediatePropagation();this.editor.orbit.enabled=false;canvas.setPointerCapture(e.pointerId);if(this.mode==='sculpt'){this.stroke=true;this.lastPoint=hit.point.clone();this.layerBase=this.brush.type==='layer'?{uuid:hit.object.geometry.uuid,base:new Float32Array(hit.object.geometry.attributes.position.array)}:null;this.applyBrush(hit,e.shiftKey);}else {this.activeMesh=hit.object;this.faceIndex=hit.faceIndex;this.showFace();this.editor.change('mesh-selection');}},true);
    canvas.addEventListener('pointermove',e=>{if(this.mode==='sculpt'&&this.stroke){const hit=this.hit(e);if(hit)this.applyBrush(hit,e.shiftKey);e.stopImmediatePropagation();}},true);
    const end=e=>{if(this.mode==='object'||e.altKey||e.button!==0)return;e.stopImmediatePropagation();this.editor.orbit.enabled=true;if(this.stroke){this.stroke=false;this.lastPoint=null;this.editor.commit();}};
    canvas.addEventListener('pointerup',end,true);canvas.addEventListener('pointercancel',end,true);
  }
  hit(event){const e=this.editor,r=e.renderer.domElement.getBoundingClientRect();e.pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);e.ray.setFromCamera(e.pointer,e.camera);return e.ray.intersectObject(e.selected||e.root,true).find(h=>h.object.isMesh&&!h.object.isSkinnedMesh);}
  setMode(mode){this.mode=mode;this.faceHighlight.visible=false;this.faceIndex=null;this.activeMesh=null;this.editor.transform.detach();if(mode==='object'&&this.editor.selected)this.editor.transform.attach(this.editor.selected);this.editor.change('mode');}
  showFace(){if(!this.activeMesh||this.faceIndex===null)return;const mesh=this.activeMesh;const geo=mesh.geometry,idx=geo.index?.array||Array.from({length:geo.attributes.position.count},(_,i)=>i),pos=[];const {faces}=coplanarFaces(geo,this.faceIndex);
    for(const f of faces)for(let j=0;j<3;j++)pos.push(...new THREE.Vector3().fromBufferAttribute(geo.attributes.position,idx[f*3+j]).toArray());
    this.faceHighlight.geometry.dispose();this.faceHighlight.geometry=new THREE.BufferGeometry();this.faceHighlight.geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));mesh.updateWorldMatrix(true,false);this.faceHighlight.matrixAutoUpdate=false;this.faceHighlight.matrix.copy(mesh.matrixWorld);this.faceHighlight.visible=true;
  }
  extrude(distance){if(this.editor.creatorShapeSession||this.activeMesh?.userData.fusion_shape_session)throw Error('Shape-key edits must preserve topology. Use vertex transforms or sculpt brushes, or cancel and make a static working copy.');if(this.editor.selected?.userData.modifierStack)throw Error('Use Component Editing on the retained source cage to keep the modifier stack evaluated.');return this.editor.operators?this.editor.operators.run('mesh.extrude_region',{distance}):this._extrude(distance);}
  _extrude(distance){if(this.editor.creatorShapeSession||this.activeMesh?.userData.fusion_shape_session)throw Error('Shape-key edits must preserve topology. Use vertex transforms or sculpt brushes, or cancel and make a static working copy.');if(this.faceIndex===null||!this.activeMesh)throw Error('Click a face in Edit Mode first.');const mesh=this.activeMesh,result=extrudeRegion(mesh.geometry,this.faceIndex,distance);mesh.geometry.dispose();mesh.geometry=result;if(Array.isArray(mesh.material))mesh.material=mesh.material[0];mesh.userData={...mesh.userData,fusion_kind:'mesh'};this.faceHighlight.visible=false;this.faceIndex=null;this.editor.commit();}
  deleteFace(){if(this.editor.creatorShapeSession||this.activeMesh?.userData.fusion_shape_session)throw Error('Shape-key edits must preserve topology. Use vertex transforms or sculpt brushes, or cancel and make a static working copy.');if(this.editor.selected?.userData.modifierStack)throw Error('Use Component Editing on the retained source cage to keep the modifier stack evaluated.');if(this.faceIndex===null||!this.activeMesh)throw Error('Click a face first.');const mesh=this.activeMesh;const geo=deleteRegion(mesh.geometry,this.faceIndex);mesh.geometry.dispose();mesh.geometry=geo;if(Array.isArray(mesh.material))mesh.material=mesh.material[0];this.faceHighlight.visible=false;this.faceIndex=null;this.editor.commit();}
  applyBrush(hit,invert){if(this.editor.selected?.userData.modifierStack){this.stroke=false;this.editor.orbit.enabled=true;this.editor.change('operator-error',Error('Apply the modifier stack before sculpting. Use Component Editing for retained source geometry.'));return;}this.activeMesh=hit.object;
    const mesh=hit.object,delta=this.lastPoint?hit.point.clone().sub(this.lastPoint):new THREE.Vector3();
    const normal=hit.face?hit.face.normal.clone().transformDirection(mesh.matrixWorld):new THREE.Vector3(0,0,1);
    const opts={falloff:this.brush.falloff,autosmooth:this.brush.autosmooth,delta,normal,layerBase:this.layerBase&&this.layerBase.uuid===mesh.geometry.uuid?this.layerBase.base:null};
    const points=[hit.point];
    const sym=this.brush.symmetry;if(sym&&(sym.x||sym.y||sym.z)){ // mirror the stroke across mesh-local axes
      mesh.updateWorldMatrix(true,false);const inv=mesh.matrixWorld.clone().invert(),local=hit.point.clone().applyMatrix4(inv),combos=new Set(['0,0,0']);
      for(const cx of (sym.x?[0,1]:[0]))for(const cy of (sym.y?[0,1]:[0]))for(const cz of (sym.z?[0,1]:[0]))combos.add(cx+','+cy+','+cz);
      for(const key of combos){if(key==='0,0,0')continue;const [cx,cy,cz]=key.split(',').map(Number);const m=local.clone();if(cx)m.x*=-1;if(cy)m.y*=-1;if(cz)m.z*=-1;points.push(m.applyMatrix4(mesh.matrixWorld));}
    }
    for(const point of points)sculptGeometry(mesh,point,this.brush.radius,this.brush.strength,this.brush.type,invert,point===hit.point?opts:{...opts,delta:delta.clone()});
    this.lastPoint=hit.point.clone();this.editor.change('sculpt-stroke');}
}
