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
export function sculptGeometry(mesh,point,radius=.12,strength=.01,mode='inflate',invert=false){
  const geo=mesh.geometry,p=geo.attributes.position,n=geo.attributes.normal;mesh.updateWorldMatrix(true,false);
  const world=new THREE.Vector3(),delta=new THREE.Vector3(),inverse=mesh.matrixWorld.clone().invert();const move=point.clone().applyMatrix4(inverse);
  const saved=new Float32Array(p.array),affected=[];const normalMatrix=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  for(let i=0;i<p.count;i++){
    world.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);const distance=world.distanceTo(point);if(distance>radius)continue;
    const falloff=(1-distance/radius)**2;affected.push(i);
    if(mode==='smooth')continue;
    delta.fromBufferAttribute(n,i).applyMatrix3(normalMatrix).normalize().multiplyScalar(strength*falloff*(invert?-1:1));world.add(delta).applyMatrix4(inverse);p.setXYZ(i,world.x,world.y,world.z);
  }
  if(mode==='smooth'){
    const adjacency=Array.from({length:p.count},()=>new Set());const indices=geo.index?.array||Array.from({length:p.count},(_,i)=>i);
    for(let i=0;i<indices.length;i+=3){const tri=[indices[i],indices[i+1],indices[i+2]];for(const a of tri)for(const b of tri)if(a!==b)adjacency[a].add(b);}
    for(const i of affected){const neighbors=adjacency[i];if(!neighbors.size)continue;const avg=new THREE.Vector3();for(const j of neighbors)avg.add(new THREE.Vector3(saved[j*3],saved[j*3+1],saved[j*3+2]));avg.divideScalar(neighbors.size);const prior=new THREE.Vector3(saved[i*3],saved[i*3+1],saved[i*3+2]);const f=Math.min(.55,Math.abs(strength)*15)*(1-prior.distanceTo(move)/Math.max(radius,.001));prior.lerp(avg,Math.max(0,f));p.setXYZ(i,prior.x,prior.y,prior.z);}
  }
  p.needsUpdate=true;geo.computeVertexNormals();geo.computeBoundingSphere();geo.computeBoundingBox();return affected.length;
}

export class MeshTools{
  constructor(editor){
    this.editor=editor;this.mode='object';this.brush={radius:.15,strength:.014,type:'inflate'};this.activeMesh=null;this.faceIndex=null;this.stroke=false;
    this.faceHighlight=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({color:'#ff9b33',transparent:true,opacity:.4,side:THREE.DoubleSide,depthTest:false}));this.faceHighlight.visible=false;this.faceHighlight.renderOrder=10;editor.scene.add(this.faceHighlight);
    const canvas=editor.renderer.domElement;
    canvas.addEventListener('pointerdown',e=>{if(this.mode==='object'||e.button!==0||e.altKey)return;const hit=this.hit(e);if(!hit)return;e.stopImmediatePropagation();this.editor.orbit.enabled=false;canvas.setPointerCapture(e.pointerId);if(this.mode==='sculpt'){this.stroke=true;this.applyBrush(hit,e.shiftKey);}else {this.activeMesh=hit.object;this.faceIndex=hit.faceIndex;this.showFace();this.editor.change('mesh-selection');}},true);
    canvas.addEventListener('pointermove',e=>{if(this.mode==='sculpt'&&this.stroke){const hit=this.hit(e);if(hit)this.applyBrush(hit,e.shiftKey);e.stopImmediatePropagation();}},true);
    const end=e=>{if(this.mode==='object'||e.altKey||e.button!==0)return;e.stopImmediatePropagation();this.editor.orbit.enabled=true;if(this.stroke){this.stroke=false;this.editor.commit();}};
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
  applyBrush(hit,invert){if(this.editor.selected?.userData.modifierStack){this.stroke=false;this.editor.orbit.enabled=true;this.editor.change('operator-error',Error('Apply the modifier stack before sculpting. Use Component Editing for retained source geometry.'));return;}this.activeMesh=hit.object;sculptGeometry(hit.object,hit.point,this.brush.radius,this.brush.strength,this.brush.type,invert);this.editor.change('sculpt-stroke');}
}
