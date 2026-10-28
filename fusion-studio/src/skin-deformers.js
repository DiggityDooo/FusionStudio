import * as THREE from 'three';
import {buildBVH,closestPointBVH} from './bvh.js';

const MAX_V=300000;

function requireMesh(mesh){
 if(!mesh?.isMesh||!mesh.geometry?.attributes.position)throw Error('Deformer needs a mesh with positions.');
 if(mesh.geometry.attributes.position.count>MAX_V)throw Error('Deformer limited to 300,000 vertices.');
 if(mesh.userData.nativeBlend)throw Error('Cannot deform a preserved native scene. Make a working copy.');
 return mesh;
}
function neighborsOf(geometry){
 const pos=geometry.attributes.position,index=geometry.index,n=pos.count,adj=Array.from({length:n},()=>new Set());
 const push=(a,b)=>{if(a!==b){adj[a].add(b);adj[b].add(a);}};
 if(index){for(let i=0;i<index.count;i+=3){const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);push(a,b);push(b,c);push(c,a);}}
 else for(let i=0;i<n;i+=3){push(i,i+1);push(i+1,i+2);push(i+2,i);}
 return adj;
}
function readPositions(geometry){const p=geometry.attributes.position,out=new Float32Array(p.count*3);for(let i=0;i<p.count;i++){out[i*3]=p.getX(i);out[i*3+1]=p.getY(i);out[i*3+2]=p.getZ(i);}return out;}
function writePositions(geometry,data){const p=geometry.attributes.position;for(let i=0;i<p.count;i++)p.setXYZ(i,data[i*3],data[i*3+1],data[i*3+2]);p.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();}
function laplacianSmooth(data,adj,iterations=1,lambda=1){
 let cur=data.slice(),next=new Float32Array(data.length);
 for(let pass=0;pass<iterations;pass++){
  for(let i=0;i<adj.length;i++){
   const n=adj[i];if(!n.size){next[i*3]=cur[i*3];next[i*3+1]=cur[i*3+1];next[i*3+2]=cur[i*3+2];continue;}
   let x=0,y=0,z=0;for(const j of n){x+=cur[j*3];y+=cur[j*3+1];z+=cur[j*3+2];}
   const inv=1/n.size;x*=inv;y*=inv;z*=inv;
   next[i*3]=cur[i*3]+(x-cur[i*3])*lambda;next[i*3+1]=cur[i*3+1]+(y-cur[i*3+1])*lambda;next[i*3+2]=cur[i*3+2]+(z-cur[i*3+2])*lambda;
  }
  const t=cur;cur=next;next=t;
 }
 return cur;
}

/** Delta Mush: smooth deformed surface then re-apply rest-detail deltas. */
export function applyDeltaMush(mesh,{iterations=4,lambda=.5,strength=1}={},restPositions=null){
 requireMesh(mesh);if(!Number.isInteger(iterations)||iterations<1||iterations>32)throw Error('Delta Mush iterations must be 1–32.');
 if(![lambda,strength].every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('Delta Mush lambda/strength must be 0–1.');
 const g=mesh.geometry,adj=neighborsOf(g),rest=restPositions?Float32Array.from(restPositions):readPositions(g),def=readPositions(g);
 if(rest.length!==def.length)throw Error('Rest pose vertex count does not match the deformed mesh.');
 const sRest=laplacianSmooth(rest,adj,iterations,lambda),sDef=laplacianSmooth(def,adj,iterations,lambda),out=new Float32Array(def.length);
 for(let i=0;i<def.length;i+=3){
  const dx=rest[i]-sRest[i],dy=rest[i+1]-sRest[i+1],dz=rest[i+2]-sRest[i+2];
  out[i]=sDef[i]+dx*strength;out[i+1]=sDef[i+1]+dy*strength;out[i+2]=sDef[i+2]+dz*strength;
 }
 writePositions(g,out);mesh.userData.fusion_delta_mush={iterations,lambda,strength};return {vertices:adj.length};
}

/** Surface-follow wrap: move each vertex to the nearest point on the target mesh. */
export function applyWrap(mesh,target,{strength=1,offset=0}={}){
 requireMesh(mesh);requireMesh(target);if(!Number.isFinite(strength)||strength<0||strength>1)throw Error('Wrap strength must be 0–1.');if(!Number.isFinite(offset)||Math.abs(offset)>10)throw Error('Wrap offset must be within ±10 model units.');
 if(mesh.isSkinnedMesh||Object.values(mesh.geometry.morphAttributes).some(a=>a?.length))throw Error('Make a static working copy before wrapping skinning or shape keys.');
 mesh.updateWorldMatrix(true,true);target.updateWorldMatrix(true,true);
 if(!mesh.matrixWorld.elements.every(Number.isFinite)||!Number.isFinite(mesh.matrixWorld.determinant())||mesh.matrixWorld.determinant()===0)throw Error('Wrap source has a singular or non-finite transform.');
 const inv=new THREE.Matrix4().copy(mesh.matrixWorld).invert(),pos=mesh.geometry.attributes.position,tmp=new THREE.Vector3(),hit=new THREE.Vector3();
 const targetMeshes=[];target.traverse(n=>{if(n.isMesh&&n.geometry)targetMeshes.push(n);});if(!targetMeshes.length)throw Error('Wrap target has no mesh surface.');
 const positions=[],indices=[];let faces=0;
 for(const m of targetMeshes){const p=m.geometry.attributes.position,idx=m.geometry.index,base=positions.length/3;
  if(!p||p.count+base>600000)throw Error('Wrap target exceeds 600,000 vertices.');if(m.isSkinnedMesh)m.skeleton.update();
  for(let i=0;i<p.count;i++){m.getVertexPosition(i,tmp);tmp.applyMatrix4(m.matrixWorld);if(!tmp.toArray().every(Number.isFinite))throw Error('Wrap target contains non-finite evaluated positions.');positions.push(tmp.x,tmp.y,tmp.z);}
  const count=idx?.count||p.count;if(count%3)throw Error('Wrap target requires complete triangles.');
  for(let i=0;i<count;i++){const vertex=idx?idx.getX(i):i;if(!Number.isInteger(vertex)||vertex<0||vertex>=p.count)throw Error('Wrap target references a missing vertex.');indices.push(base+vertex);}
  faces+=count/3;if(faces>200000)throw Error('Wrap target exceeds 200,000 triangles.');
 }
 if(!faces)throw Error('Wrap target has no triangles.');const bvh=buildBVH({positions,indices}),out=new Float32Array(pos.count*3),stats={nodesVisited:0,trianglesTested:0};
 for(let i=0;i<pos.count;i++){
  tmp.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);if(!tmp.toArray().every(Number.isFinite))throw Error('Wrap source contains non-finite positions.');
  const nearest=closestPointBVH(bvh,tmp.toArray(),{stats});if(!nearest)throw Error('Wrap target has no valid nearest surface.');if(offset&&Math.hypot(...nearest.normal)<1e-8)throw Error('Repair degenerate target triangles before applying a wrap offset.');
  hit.fromArray(nearest.point).addScaledVector(new THREE.Vector3(...nearest.normal),offset);tmp.lerp(hit,strength).applyMatrix4(inv);if(!tmp.toArray().every(Number.isFinite))throw Error('Wrap result is non-finite.');out.set(tmp.toArray(),i*3);
 }
 if(!out.every(Number.isFinite))throw Error('Wrap result exceeds the Float32 coordinate range.');
 for(let i=0;i<pos.count;i++)pos.setXYZ(i,out[i*3],out[i*3+1],out[i*3+2]);pos.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();
 mesh.userData.fusion_wrap={strength,offset,target:target.uuid};return {vertices:pos.count,faces,method:'bvh-nearest',...stats};
}

/** Create an editable lattice cage around a mesh (control points as Object3D children). */
export function createLattice(mesh,{resX=3,resY=3,resZ=3}={}){
 requireMesh(mesh);for(const r of [resX,resY,resZ])if(!Number.isInteger(r)||r<2||r>12)throw Error('Lattice resolution must be 2–12 per axis.');
 mesh.updateWorldMatrix(true,true);mesh.geometry.computeBoundingBox();
 const box=mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld),size=box.getSize(new THREE.Vector3()),min=box.min.clone();
 const group=new THREE.Group();group.name=(mesh.name||'Mesh')+' Lattice';group.userData={fusion_kind:'lattice',fusion_lattice:{resX,resY,resZ,min:min.toArray(),size:size.toArray(),target:mesh.uuid}};
 const points=[];
 for(let z=0;z<resZ;z++)for(let y=0;y<resY;y++)for(let x=0;x<resX;x++){
  const p=new THREE.Object3D();p.name=`L_${x}_${y}_${z}`;
  p.position.set(min.x+size.x*(x/(resX-1)),min.y+size.y*(y/(resY-1)),min.z+size.z*(z/(resZ-1)));
  p.userData.fusion_lattice_index=[x,y,z];group.add(p);points.push(p);
 }
 mesh.parent?.add(group);mesh.userData.fusion_lattice_id=group.uuid;return group;
}
function trilinear(corners,u,v,w){
 const c000=corners[0],c100=corners[1],c010=corners[2],c110=corners[3],c001=corners[4],c101=corners[5],c011=corners[6],c111=corners[7];
 const x00=c000.clone().lerp(c100,u),x10=c010.clone().lerp(c110,u),x01=c001.clone().lerp(c101,u),x11=c011.clone().lerp(c111,u);
 const y0=x00.lerp(x10,v),y1=x01.lerp(x11,v);return y0.lerp(y1,w);
}

/** Apply lattice deformation: vertices remapped through deformed control grid. */
export function applyLattice(mesh,lattice){
 requireMesh(mesh);if(!lattice?.userData?.fusion_lattice)throw Error('Select a Fusion lattice.');
 const spec=lattice.userData.fusion_lattice,{resX,resY,resZ}=spec,min=new THREE.Vector3().fromArray(spec.min),size=new THREE.Vector3().fromArray(spec.size);
 if(size.x<1e-8||size.y<1e-8||size.z<1e-8)throw Error('Lattice bounds are degenerate.');
 const grid=new Array(resX*resY*resZ);lattice.updateWorldMatrix(true,true);
 for(const p of lattice.children){const [x,y,z]=p.userData.fusion_lattice_index||[];if(x===undefined)continue;grid[x+y*resX+z*resX*resY]=p.getWorldPosition(new THREE.Vector3());}
 if(grid.some(p=>!p))throw Error('Lattice is missing control points.');
 mesh.updateWorldMatrix(true,true);const inv=new THREE.Matrix4().copy(mesh.matrixWorld).invert(),pos=mesh.geometry.attributes.position,world=new THREE.Vector3();
 const defCorners=(ix,iy,iz)=>{const pts=[];for(const zz of [iz,iz+1])for(const yy of [iy,iy+1])for(const xx of [ix,ix+1])pts.push(grid[xx+yy*resX+zz*resX*resY].clone());return pts;};
 for(let i=0;i<pos.count;i++){
  world.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);
  const u=THREE.MathUtils.clamp((world.x-min.x)/size.x,0,1),v=THREE.MathUtils.clamp((world.y-min.y)/size.y,0,1),w=THREE.MathUtils.clamp((world.z-min.z)/size.z,0,1);
  const ix=Math.min(resX-2,Math.floor(u*(resX-1))),iy=Math.min(resY-2,Math.floor(v*(resY-1))),iz=Math.min(resZ-2,Math.floor(w*(resZ-1)));
  const lu=u*(resX-1)-ix,lv=v*(resY-1)-iy,lw=w*(resZ-1)-iz;
  const deformed=trilinear(defCorners(ix,iy,iz),lu,lv,lw);deformed.applyMatrix4(inv);pos.setXYZ(i,deformed.x,deformed.y,deformed.z);
 }
 pos.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();
 return {vertices:pos.count};
}

/** Shrinkwrap: project vertices onto target along normals or to nearest surface. */
export function applyShrinkwrap(mesh,target,{mode='nearest',offset=0,strength=1}={}){
 requireMesh(mesh);requireMesh(target);if(!['nearest','project'].includes(mode))throw Error('Shrinkwrap mode must be nearest or project.');
 if(!Number.isFinite(offset)||Math.abs(offset)>10)throw Error('Shrinkwrap offset out of range.');
 if(!Number.isFinite(strength)||strength<0||strength>1)throw Error('Shrinkwrap strength must be 0–1.');
 mesh.updateWorldMatrix(true,true);target.updateWorldMatrix(true,true);
 if(!mesh.geometry.attributes.normal)mesh.geometry.computeVertexNormals();
 const inv=new THREE.Matrix4().copy(mesh.matrixWorld).invert(),pos=mesh.geometry.attributes.position,nor=mesh.geometry.attributes.normal;
 const ray=new THREE.Raycaster(),origin=new THREE.Vector3(),dir=new THREE.Vector3(),hit=new THREE.Vector3(),tmp=new THREE.Vector3();
 const targets=[];target.traverse(n=>{if(n.isMesh)targets.push(n);});if(!targets.length)throw Error('Shrinkwrap target has no mesh.');
 // Nearest mode reuses wrap; project casts along vertex normal.
 if(mode==='nearest')return applyWrap(mesh,target,{strength,offset});
 for(let i=0;i<pos.count;i++){
  origin.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);dir.fromBufferAttribute(nor,i).transformDirection(mesh.matrixWorld).normalize();
  ray.set(origin,dir);let best=null;const hits=ray.intersectObjects(targets,false);if(hits.length)best=hits[0];
  ray.set(origin,dir.clone().negate());const back=ray.intersectObjects(targets,false);if(back.length&&(!best||back[0].distance<best.distance))best=back[0];
  if(!best)continue;hit.copy(best.point).addScaledVector(best.face?best.face.normal.clone().transformDirection(best.object.matrixWorld).normalize():dir,offset);
  tmp.copy(origin).lerp(hit,strength).applyMatrix4(inv);pos.setXYZ(i,tmp.x,tmp.y,tmp.z);
 }
 pos.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();
 mesh.userData.fusion_shrinkwrap={mode,offset,strength,target:target.uuid};return {vertices:pos.count};
}

/** Cage deformer: wrap follower to a low-res cage then apply cage deltas (nearest cage vertex). */
export function applyCage(mesh,cage,{strength=1}={}){
 requireMesh(mesh);requireMesh(cage);if(!Number.isFinite(strength)||strength<0||strength>1)throw Error('Cage strength must be 0–1.');
 const rest=cage.userData.fusion_cage_rest;if(!rest||rest.length!==cage.geometry.attributes.position.count*3)throw Error('Capture a cage rest pose before deforming (store rest positions on the cage).');
 mesh.updateWorldMatrix(true,true);cage.updateWorldMatrix(true,true);
 const cagePos=cage.geometry.attributes.position,inv=new THREE.Matrix4().copy(mesh.matrixWorld).invert(),pos=mesh.geometry.attributes.position;
 const worldCage=[],restWorld=[];const cm=cage.matrixWorld;
 for(let i=0;i<cagePos.count;i++){worldCage.push(new THREE.Vector3().fromBufferAttribute(cagePos,i).applyMatrix4(cm));restWorld.push(new THREE.Vector3(rest[i*3],rest[i*3+1],rest[i*3+2]).applyMatrix4(cm));}
 const p=new THREE.Vector3(),delta=new THREE.Vector3();
 for(let i=0;i<pos.count;i++){
  p.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);let best=0,bestD=Infinity;for(let j=0;j<restWorld.length;j++){const d=p.distanceToSquared(restWorld[j]);if(d<bestD){bestD=d;best=j;}}
  delta.copy(worldCage[best]).sub(restWorld[best]);p.addScaledVector(delta,strength).applyMatrix4(inv);pos.setXYZ(i,p.x,p.y,p.z);
 }
 pos.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();
 return {vertices:pos.count};
}
export function captureCageRest(cage){
 requireMesh(cage);cage.updateWorldMatrix(true,true);const data=readPositions(cage.geometry);cage.userData.fusion_cage_rest=Array.from(data);return data.length/3;
}
