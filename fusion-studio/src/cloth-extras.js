import * as THREE from 'three';
import {createSoftBody,pinSoftVertex,stepSoftBody,createPointCache,recordPointCache} from './sim-physics.js';

/** Tear cloth by removing edges above strain threshold (soft-body rest edges). */
export function tearCloth(body,{threshold=1.35,maxTears=32}={}){
 if(!body?.rest)throw Error('Tear needs a soft/PBD cloth body.');
 if(!Number.isFinite(threshold)||threshold<=1||threshold>5||!Number.isInteger(maxTears)||maxTears<1)throw Error('Invalid tear settings.');
 const keep=[];let torn=0;
 for(const e of body.rest){
  const A=body.points[e.a],B=body.points[e.b],len=Math.hypot(B[0]-A[0],B[1]-A[1],B[2]-A[2]);
  if(len>e.len*threshold&&torn<maxTears){torn++;continue;}keep.push(e);
 }
 body.rest=keep;body.tears=(body.tears||0)+torn;return {torn,remaining:keep.length};
}

/** Cut cloth along a plane (remove edges that cross plane). */
export function cutCloth(body,plane={point:[0,0,0],normal:[1,0,0]}){
 if(!body?.rest)throw Error('Cut needs a soft/PBD cloth body.');
 const n=plane.normal,len=Math.hypot(...n)||1,nn=n.map(v=>v/len),p0=plane.point;
 const side=i=>{const p=body.points[i];return (p[0]-p0[0])*nn[0]+(p[1]-p0[1])*nn[1]+(p[2]-p0[2])*nn[2];};
 const before=body.rest.length;body.rest=body.rest.filter(e=>side(e.a)*side(e.b)>=0);
 return {removed:before-body.rest.length};
}

export function createHardware(kind='button',{position=[0,1,0],size=.015,color='#c0a050'}={}){
 if(!['button','zipper','trim','snap','rivet','buckle'].includes(kind))throw Error('Unknown hardware kind.');
 if(!Number.isFinite(size)||size<=0||size>.2)throw Error('Hardware size out of range.');
 let mesh;
 if(kind==='button'||kind==='snap'||kind==='rivet')mesh=new THREE.Mesh(new THREE.CylinderGeometry(size,size,size*.35,16),new THREE.MeshStandardMaterial({color,metalness:.6,roughness:.35}));
 else if(kind==='zipper')mesh=new THREE.Mesh(new THREE.BoxGeometry(size*.4,size*8,size*.25),new THREE.MeshStandardMaterial({color:'#333',metalness:.4,roughness:.5}));
 else if(kind==='buckle')mesh=new THREE.Mesh(new THREE.TorusGeometry(size*1.2,size*.25,8,16),new THREE.MeshStandardMaterial({color,metalness:.7,roughness:.3}));
 else mesh=new THREE.Mesh(new THREE.BoxGeometry(size*4,size*.5,size),new THREE.MeshStandardMaterial({color,roughness:.7}));
 mesh.name=kind[0].toUpperCase()+kind.slice(1);mesh.position.fromArray(position);mesh.userData.fusion_hardware={kind,size};return mesh;
}

export function attachHardware(root,hardware){
 if(!root||!hardware)throw Error('Root and hardware required.');
 const list=root.userData.fusion_hardware??=[];if(list.length>=64)throw Error('At most 64 hardware pieces.');
 root.add(hardware);list.push({uuid:hardware.uuid,kind:hardware.userData.fusion_hardware.kind});return hardware;
}

/** Per-vertex stiffness weight map (0–1). */
export function createStiffnessMap(mesh,fill=1){
 if(!mesh?.isMesh||!mesh.geometry?.attributes.position)throw Error('Stiffness map needs a mesh.');
 if(!Number.isFinite(fill)||fill<0||fill>1)throw Error('Fill 0–1.');
 const n=mesh.geometry.attributes.position.count,data=new Float32Array(n).fill(fill);
 mesh.userData.fusion_stiffness_map={version:1,data};return mesh.userData.fusion_stiffness_map;
}

export function paintStiffness(mesh,vertexIndex,value,{radius=0,strength=1}={}){
 const map=mesh.userData.fusion_stiffness_map;if(!map)throw Error('Create a stiffness map first.');
 if(!Number.isInteger(vertexIndex)||vertexIndex<0||vertexIndex>=map.data.length)throw Error('Vertex out of range.');
 if(!Number.isFinite(value)||value<0||value>1||!Number.isFinite(strength)||strength<0||strength>1)throw Error('Invalid paint.');
 if(!radius){map.data[vertexIndex]=map.data[vertexIndex]*(1-strength)+value*strength;return map;}
 const pos=mesh.geometry.attributes.position,c=new THREE.Vector3().fromBufferAttribute(pos,vertexIndex);
 for(let i=0;i<pos.count;i++){const p=new THREE.Vector3().fromBufferAttribute(pos,i),d=p.distanceTo(c);if(d>radius)continue;
  const w=(1-d/radius)*strength;map.data[i]=map.data[i]*(1-w)+value*w;}
 return map;
}

export function applyStiffnessToSoftBody(body,map){
 if(!body?.rest||!map?.data)throw Error('Soft body and stiffness map required.');
 if(map.data.length!==body.points.length)throw Error('Map size must match vertices.');
 for(const e of body.rest){const w=(map.data[e.a]+map.data[e.b])*.5;e.stiffnessScale=w;}
 body.stiffnessMap=true;return body;
}

/** Soft-body step honoring per-edge stiffnessScale from painted weights. */
export function stepClothWithWeights(body,opts={}){
 const {points,prev,rest,damping,stiffness,pinned}=body;const dt=opts.dt??1/60,gravity=opts.gravity||[0,-9.8,0],iterations=opts.iterations??4;
 for(let i=0;i<points.length;i++){if(pinned.has(i)){prev[i]=[...points[i]];continue;}
  const p=points[i],q=prev[i],vx=(p[0]-q[0])*damping,vy=(p[1]-q[1])*damping,vz=(p[2]-q[2])*damping;
  prev[i]=[...p];p[0]+=vx+gravity[0]*dt*dt;p[1]+=vy+gravity[1]*dt*dt;p[2]+=vz+gravity[2]*dt*dt;
 }
 for(let it=0;it<iterations;it++)for(const e of rest){
  const A=points[e.a],B=points[e.b],dx=B[0]-A[0],dy=B[1]-A[1],dz=B[2]-A[2],len=Math.hypot(dx,dy,dz)||1e-9;
  const k=stiffness*(e.stiffnessScale??1),corr=(len-e.len)/len*.5*k;
  if(!pinned.has(e.a)){A[0]+=dx*corr;A[1]+=dy*corr;A[2]+=dz*corr;}if(!pinned.has(e.b)){B[0]-=dx*corr;B[1]-=dy*corr;B[2]-=dz*corr;}
 }
 const pos=body.mesh.geometry.attributes.position;for(let i=0;i<points.length;i++)pos.setXYZ(i,...points[i]);pos.needsUpdate=true;body.mesh.geometry.computeVertexNormals();
 return body;
}

export function createClothCache(){return createPointCache();}
export function sampleClothCache(body,cache,frame){return recordPointCache(cache,frame,body.points);}
export function exportClothCache(cache,{format='json'}={}){
 if(format!=='json')throw Error('Only JSON cloth cache export in this build (Alembic path still uses scene export).');
 return {version:1,kind:'fusion_cloth_cache',frames:cache.frames};
}

/** Flag / curtain / cape / sail draped plane presets. */
export function createDrapePreset(kind='flag',{width=1,height=1.4,segments=10}={}){
 if(!['flag','curtain','cape','sail'].includes(kind))throw Error('Unknown drape preset.');
 if(!Number.isFinite(width)||width<=0||width>10||!Number.isFinite(height)||height<=0||height>10)throw Error('Invalid drape size.');
 const seg=Math.min(24,Math.max(4,segments|0));
 const geo=new THREE.PlaneGeometry(width,height,seg,seg);geo.rotateX(-Math.PI/2);
 const colors={flag:'#c43c3c',curtain:'#d8cfc0',cape:'#2a3a55',sail:'#f2f0e8'};
 const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:colors[kind],side:THREE.DoubleSide,roughness:.85}));
 mesh.name=kind[0].toUpperCase()+kind.slice(1);mesh.position.y=height*.5;
 const body=createSoftBody(mesh,{stiffness:kind==='sail'?.98:.85,damping:.96});
 if(kind==='flag'||kind==='sail')for(let y=0;y<=seg;y++)pinSoftVertex(body,y*(seg+1)); // pin left edge
 else if(kind==='curtain')for(let x=0;x<=seg;x++)pinSoftVertex(body,x); // pin top
 else for(let x=Math.floor(seg*.3);x<=Math.ceil(seg*.7);x++)pinSoftVertex(body,x); // cape shoulders
 body.drapeKind=kind;return body;
}

/** Simple UV print/pattern placement offset+scale on fabric material. */
export function placeFabricPrint(mesh,{offset=[0,0],scale=[1,1],rotation=0}={}){
 if(!mesh?.isMesh)throw Error('Print placement needs a mesh.');
 if(offset.some(v=>!Number.isFinite(v))||scale.some(v=>!Number.isFinite(v)||v<=0||v>16)||!Number.isFinite(rotation))throw Error('Invalid print transform.');
 const mat=mesh.material;if(!mat)throw Error('Mesh has no material.');
 const maps=['map','normalMap','roughnessMap','aoMap'];
 for(const key of maps){const t=mat[key];if(!t?.isTexture)continue;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.offset.set(offset[0],offset[1]);t.repeat.set(scale[0],scale[1]);t.rotation=rotation;t.needsUpdate=true;}
 mesh.userData.fusion_print={offset,scale,rotation};return mesh.userData.fusion_print;
}

/** Lightweight sim-to-retopo: stride-merge vertices for game LODs of draped cloth. */
export function clothSimToRetopo(mesh,{keep=.5}={}){
 if(!mesh?.isMesh||!mesh.geometry?.index)throw Error('Retopo needs indexed mesh.');
 if(!Number.isFinite(keep)||keep<=0||keep>1)throw Error('Keep fraction (0,1].');
 const g=mesh.geometry.clone(),index=g.index,stride=Math.max(1,Math.round(1/keep)),tris=[];
 for(let i=0;i<index.count;i+=3*stride){if(i+2>=index.count)break;tris.push(index.getX(i),index.getX(i+1),index.getX(i+2));}
 if(tris.length<3)throw Error('Retopo removed all triangles.');
 g.setIndex(tris);g.computeVertexNormals();
 const out=new THREE.Mesh(g,mesh.material);out.name=(mesh.name||'Cloth')+' Retopo';out.userData.fusion_retopo={keep,triangles:tris.length/3};return out;
}

export function simulateDrapeFrames(body,frames=12,{wind=[.4,0,0],dt=1/30}={}){
 if(!Number.isInteger(frames)||frames<1||frames>240)throw Error('Frames 1–240.');
 const cache=createClothCache();
 body.mesh.userData.fusion_wind=wind;
 for(let f=0;f<frames;f++){
  // inject wind as extra gravity-ish by temporarily mutating gravity
  stepSoftBody(body,{dt,gravity:[wind[0],-9.8+wind[1],wind[2]],iterations:3});
  sampleClothCache(body,cache,f);
 }
 return cache;
}
