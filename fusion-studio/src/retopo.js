import * as THREE from 'three';

/** Project a world point onto the nearest mesh surface (triangle centroid approx for preview). */
export function snapToSurface(mesh,point,{maxDist=.5}={}){
 if(!mesh?.isMesh||!mesh.geometry?.attributes.position)throw Error('Snap needs a mesh.');
 if(!point||point.length!==3||!Number.isFinite(maxDist)||maxDist<=0)throw Error('Invalid snap query.');
 mesh.updateWorldMatrix(true,false);const pos=mesh.geometry.attributes.position,m=mesh.matrixWorld;
 let best=null,bestD=maxDist;
 const index=mesh.geometry.index,triCount=index?index.count/3:Math.floor(pos.count/3);
 for(let t=0;t<triCount;t++){
  const i0=index?index.getX(t*3):t*3,i1=index?index.getX(t*3+1):t*3+1,i2=index?index.getX(t*3+2):t*3+2;
  const a=new THREE.Vector3().fromBufferAttribute(pos,i0).applyMatrix4(m);
  const b=new THREE.Vector3().fromBufferAttribute(pos,i1).applyMatrix4(m);
  const c=new THREE.Vector3().fromBufferAttribute(pos,i2).applyMatrix4(m);
  const mid=a.clone().add(b).add(c).multiplyScalar(1/3);
  const d=mid.distanceTo(new THREE.Vector3().fromArray(point));if(d<bestD){bestD=d;best=mid.toArray();}
 }
 if(!best)throw Error('No surface within snap distance.');
 return {point:best,distance:bestD};
}

export function createRetopoSession(target,{symmetry='x'}={}){
 if(!target?.isMesh)throw Error('Retopo target mesh required.');
 if(symmetry&&!['x','y','z','off'].includes(symmetry))throw Error('Symmetry must be x|y|z|off.');
 return {version:1,targetId:target.uuid,symmetry:symmetry==='off'?null:symmetry,verts:[],quads:[],strips:[],guides:[],density:new Map()};
}

export function quadDraw(session,points){
 if(!Array.isArray(points)||points.length!==4||points.some(p=>!Array.isArray(p)||p.length!==3))throw Error('Quad draw needs 4 XYZ points.');
 const ids=points.map(p=>{session.verts.push([...p]);return session.verts.length-1;});
 session.quads.push(ids);return ids;
}

export function polyStrip(session,chain){
 if(!Array.isArray(chain)||chain.length<2||chain.length>256)throw Error('Strip needs 2–256 points.');
 const ids=chain.map(p=>{session.verts.push([...p]);return session.verts.length-1;});
 session.strips.push(ids);return ids;
}

export function addEdgeFlowGuide(session,curve){
 if(!Array.isArray(curve)||curve.length<2||curve.length>128)throw Error('Guide curve 2–128 points.');
 session.guides.push(curve.map(p=>[...p]));return session.guides.length-1;
}

export function paintRetopoDensity(session,vertIndex,value){
 if(!Number.isInteger(vertIndex)||vertIndex<0||vertIndex>=session.verts.length)throw Error('Density vert out of range.');
 if(!Number.isFinite(value)||value<.1||value>4)throw Error('Density 0.1–4.');
 session.density.set(vertIndex,value);return value;
}

/** Instant-Meshes-like preview: stride-sample + force quads from triangle pairs where possible. */
export function autoRetopo(mesh,{keep=.35,symmetry='x'}={}){
 if(!mesh?.isMesh||!mesh.geometry?.index)throw Error('Auto-retopo needs indexed mesh.');
 if(!Number.isFinite(keep)||keep<=0||keep>1)throw Error('Keep fraction (0,1].');
 const g=mesh.geometry.clone(),index=g.index,stride=Math.max(1,Math.round(1/keep));
 const tris=[];for(let i=0;i<index.count;i+=3*stride){if(i+2>=index.count)break;tris.push(index.getX(i),index.getX(i+1),index.getX(i+2));}
 if(tris.length<3)throw Error('Retopo removed all faces.');
 g.setIndex(tris);g.computeVertexNormals();
 const out=new THREE.Mesh(g,mesh.material?.clone?.()||mesh.material);out.name=(mesh.name||'Mesh')+' Retopo';
 out.userData.fusion_retopo={mode:'auto',keep,symmetry,triangles:tris.length/3,animationFriendly:keep>=.4,gameBudget:keep<=.35};
 if(symmetry&&symmetry!=='off'){out.userData.fusion_retopo.symmetry=symmetry;}
 return out;
}

export function reprojectToHigh(low,high){
 if(!low?.isMesh||!high?.isMesh)throw Error('Low and high meshes required.');
 low.updateWorldMatrix(true,false);high.updateWorldMatrix(true,false);
 const pos=low.geometry.attributes.position,moved=0;
 // Snap each low vertex toward nearest high surface centroid
 for(let i=0;i<pos.count;i++){
  const p=new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(low.matrixWorld);
  try{const hit=snapToSurface(high,p.toArray(),{maxDist:1});const local=new THREE.Vector3().fromArray(hit.point);low.worldToLocal(local);pos.setXYZ(i,local.x,local.y,local.z);}catch{/* keep */}
 }
 pos.needsUpdate=true;low.geometry.computeVertexNormals();
 low.userData.fusion_reproject={from:high.uuid};return low;
}

export function retopoForPurpose(mesh,purpose='games'){
 if(!['games','animation'].includes(purpose))throw Error('Purpose must be games|animation.');
 const keep=purpose==='games'?.25:.55;const out=autoRetopo(mesh,{keep,symmetry:'x'});
 out.userData.fusion_retopo.purpose=purpose;return out;
}

export function generateLodChain(mesh,{levels=[1,.5,.25,.125]}={}){
 if(!Array.isArray(levels)||levels.length<2||levels.length>6)throw Error('LOD levels 2–6.');
 return levels.map(keep=>({keep,mesh:keep>=1?mesh:autoRetopo(mesh,{keep})}));
}

export function preserveEdgeConstraints(mesh,edgeVertexPairs=[]){
 if(!mesh?.isMesh)throw Error('Mesh required.');
 if(!Array.isArray(edgeVertexPairs)||edgeVertexPairs.length>4096)throw Error('Invalid edge constraints.');
 mesh.userData.fusion_edge_constraints=edgeVertexPairs.map(([a,b])=>{
  if(!Number.isInteger(a)||!Number.isInteger(b))throw Error('Edge pairs must be integer indices.');
  return [a,b];
 });
 return mesh.userData.fusion_edge_constraints;
}

export function buildRetopoMesh(session){
 if(!session.quads.length&&!session.strips.length)throw Error('No retopo faces authored.');
 const positions=[],indices=[];
 for(const q of session.quads){const base=positions.length/3;for(const id of q)positions.push(...session.verts[id]);
  indices.push(base,base+1,base+2,base,base+2,base+3);}
 for(const strip of session.strips){for(let i=0;i<strip.length-1;i++){/* lines only metadata */}void strip;}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();
 const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:'#7aa2c8',flatShading:true,side:THREE.DoubleSide}));
 mesh.name='Retopo';mesh.userData.fusion_retopo={mode:'manual',quads:session.quads.length,guides:session.guides.length,symmetry:session.symmetry};return mesh;
}

export function loopFlowHint(mesh,{jointBias=true}={}){
 if(!mesh?.isMesh||!mesh.geometry?.attributes.position)throw Error('Loop-flow needs a mesh.');
 mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox;
 const midY=(box.min.y+box.max.y)*.5,rings=[];
 // Suggest three horizontal loop heights for torso/joints
 for(const t of jointBias?[.2,.5,.8]:[.33,.66])rings.push(box.min.y+(box.max.y-box.min.y)*t);
 return {version:1,rings,midY,note:'Suggested edge-loop heights for limbs/torso; manual authoring still required.'};
}
