import * as THREE from 'three';

const V=()=>new THREE.Vector3();

export function createRigidBody(mesh,{mass=1,velocity=[0,0,0],angular=[0,0,0],shape='box'}={}){
 if(!mesh?.isObject3D)throw Error('Rigid body needs an object.');
 if(!Number.isFinite(mass)||mass<0||mass>1e6)throw Error('Mass out of range.');
 if(!['box','sphere','capsule','convex'].includes(shape))throw Error('Unknown collision shape.');
 const body={id:mesh.uuid,kind:'rigid',mass,invMass:mass>0?1/mass:0,velocity:velocity.map(Number),angular:angular.map(Number),shape,mesh,constraints:[],sleeping:false};
 mesh.userData.fusion_rigid=body;return body;
}

export function addRigidConstraint(a,b,{kind='ball',restLength,stiffness=1}={}){
 if(!['ball','hinge','fixed','spring'].includes(kind))throw Error('Unknown constraint kind.');
 if(!Number.isFinite(stiffness)||stiffness<0||stiffness>1)throw Error('Constraint stiffness 0–1.');
 const pa=new THREE.Vector3(),pb=new THREE.Vector3();a.mesh.getWorldPosition(pa);b.mesh.getWorldPosition(pb);
 const rest=Number.isFinite(restLength)?restLength:pa.distanceTo(pb);
 const c={id:`c-${a.id}-${b.id}-${kind}`,kind,a:a.id,b:b.id,restLength:rest,stiffness};
 a.constraints.push(c);b.constraints.push(c);return c;
}

export function stepRigidBodies(bodies,{dt=1/60,gravity=[0,-9.8,0],substeps=4,groundY=0}={}){
 if(!Number.isFinite(dt)||dt<=0||dt>.1||!Number.isInteger(substeps)||substeps<1||substeps>32)throw Error('Invalid rigid solver settings.');
 const h=dt/substeps;
 for(let s=0;s<substeps;s++){
  for(const b of bodies){if(b.mass<=0||b.sleeping)continue;
   b.velocity[0]+=gravity[0]*h;b.velocity[1]+=gravity[1]*h;b.velocity[2]+=gravity[2]*h;
   b.mesh.position.x+=b.velocity[0]*h;b.mesh.position.y+=b.velocity[1]*h;b.mesh.position.z+=b.velocity[2]*h;
   if(b.mesh.position.y<groundY){b.mesh.position.y=groundY;b.velocity[1]*=-.35;b.velocity[0]*=.9;b.velocity[2]*=.9;}
  }
  for(const b of bodies)for(const c of b.constraints){
   if(c.a!==b.id)continue;const A=bodies.find(x=>x.id===c.a),B=bodies.find(x=>x.id===c.b);if(!A||!B)continue;
   const pa=A.mesh.position,pb=B.mesh.position,dx=pb.x-pa.x,dy=pb.y-pa.y,dz=pb.z-pa.z,len=Math.hypot(dx,dy,dz)||1e-9;
   const corr=(len-c.restLength)/len*.5*c.stiffness;
   if(A.mass>0){pa.x+=dx*corr;pa.y+=dy*corr;pa.z+=dz*corr;}if(B.mass>0){pb.x-=dx*corr;pb.y-=dy*corr;pb.z-=dz*corr;}
  }
 }
 return bodies;
}

export function createSoftBody(mesh,{pressure=0,stiffness=.8,damping=.95}={}){
 if(!mesh?.isMesh||!mesh.geometry?.attributes.position)throw Error('Soft body needs a mesh.');
 if([pressure,stiffness,damping].some(v=>!Number.isFinite(v))||stiffness<=0||stiffness>1||damping<=0||damping>1)throw Error('Invalid soft-body settings.');
 const pos=mesh.geometry.attributes.position,points=[],prev=[],rest=[];
 for(let i=0;i<pos.count;i++){const p=[pos.getX(i),pos.getY(i),pos.getZ(i)];points.push(p);prev.push([...p]);}
 const index=mesh.geometry.index;const edges=new Set();
 const add=(a,b)=>{const k=a<b?`${a}:${b}`:`${b}:${a}`;if(edges.has(k))return;edges.add(k);const A=points[a],B=points[b];rest.push({a,b,len:Math.hypot(B[0]-A[0],B[1]-A[1],B[2]-A[2])||.01});};
 if(index)for(let i=0;i<index.count;i+=3){const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);add(a,b);add(b,c);add(c,a);}
 else for(let i=0;i<pos.count;i+=3){add(i,i+1);add(i+1,i+2);add(i+2,i);}
 const body={kind:'soft',mesh,points,prev,rest,pressure,stiffness,damping,pinned:new Set()};
 mesh.userData.fusion_soft=body;return body;
}

export function pinSoftVertex(body,index){if(!Number.isInteger(index)||index<0||index>=body.points.length)throw Error('Pin index out of range.');body.pinned.add(index);}

export function stepSoftBody(body,{dt=1/60,gravity=[0,-9.8,0],iterations=4}={}){
 if(!Number.isFinite(dt)||dt<=0||dt>.1||!Number.isInteger(iterations)||iterations<1||iterations>16)throw Error('Invalid soft step.');
 const {points,prev,rest,damping,stiffness,pinned}=body;
 for(let i=0;i<points.length;i++){if(pinned.has(i)){prev[i]=[...points[i]];continue;}
  const p=points[i],q=prev[i],vx=(p[0]-q[0])*damping,vy=(p[1]-q[1])*damping,vz=(p[2]-q[2])*damping;
  prev[i]=[...p];p[0]+=vx+gravity[0]*dt*dt;p[1]+=vy+gravity[1]*dt*dt;p[2]+=vz+gravity[2]*dt*dt;
 }
 for(let it=0;it<iterations;it++)for(const e of rest){
  const A=points[e.a],B=points[e.b],dx=B[0]-A[0],dy=B[1]-A[1],dz=B[2]-A[2],len=Math.hypot(dx,dy,dz)||1e-9;
  const corr=(len-e.len)/len*.5*stiffness;if(!pinned.has(e.a)){A[0]+=dx*corr;A[1]+=dy*corr;A[2]+=dz*corr;}if(!pinned.has(e.b)){B[0]-=dx*corr;B[1]-=dy*corr;B[2]-=dz*corr;}
 }
 const pos=body.mesh.geometry.attributes.position;for(let i=0;i<points.length;i++)pos.setXYZ(i,...points[i]);pos.needsUpdate=true;body.mesh.geometry.computeVertexNormals();
 return body;
}

/** Vellum-style PBD cloth from a grid or existing soft edges (shared solver). */
export function createPbdCloth(width=1,height=1,segX=8,segY=8){
 if([width,height,segX,segY].some(v=>!Number.isFinite(v))||segX<2||segY<2||segX>64||segY>64)throw Error('Invalid PBD cloth grid.');
 const geo=new THREE.PlaneGeometry(width,height,segX,segY);geo.rotateX(-Math.PI/2);
 const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({side:THREE.DoubleSide,color:'#6a8caa'}));mesh.name='PBD Cloth';
 const body=createSoftBody(mesh,{stiffness:.95,damping:.98});
 for(let x=0;x<=segX;x++)pinSoftVertex(body,x); // pin top row
 body.kind='pbd_cloth';return body;
}

export function createParticleSystem({count=100,origin=[0,1,0],spread=.2,velocity=[0,1,0],lifespan=2,seed=1}={}){
 if(!Number.isInteger(count)||count<1||count>20000||!Number.isFinite(lifespan)||lifespan<=0||lifespan>60)throw Error('Invalid particle system.');
 let s=seed>>>0||1;const rnd=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
 const particles=[];
 for(let i=0;i<count;i++)particles.push({
  p:[origin[0]+(rnd()-.5)*spread,origin[1]+(rnd()-.5)*spread,origin[2]+(rnd()-.5)*spread],
  v:[velocity[0]+(rnd()-.5),velocity[1]+(rnd()-.5),velocity[2]+(rnd()-.5)],
  age:rnd()*lifespan,life:lifespan,alive:true
 });
 return {kind:'particles',particles,forces:[],render:'sprites'};
}

export function createForceField(kind='wind',{strength=1,axis=[1,0,0],center=[0,0,0],radius=2}={}){
 if(!['wind','turbulence','vortex','gravity','magnetic'].includes(kind))throw Error('Unknown force field.');
 if(!Number.isFinite(strength)||Math.abs(strength)>100)throw Error('Force strength out of range.');
 return {kind,strength,axis:axis.map(Number),center:center.map(Number),radius};
}

export function sampleForce(field,point,seed=1){
 const d=[point[0]-field.center[0],point[1]-field.center[1],point[2]-field.center[2]],dist=Math.hypot(...d);
 if(field.kind!=='wind'&&field.kind!=='gravity'&&dist>field.radius)return [0,0,0];
 if(field.kind==='wind')return field.axis.map(v=>v*field.strength);
 if(field.kind==='gravity')return [0,-field.strength,0];
 if(field.kind==='magnetic'){const inv=1/Math.max(.05,dist*dist);return d.map(v=>-v*field.strength*inv);}
 if(field.kind==='vortex'){const n=dist||1;return [(-d[2]/n)*field.strength,(0.1)*field.strength,(d[0]/n)*field.strength];}
 // turbulence
 let s=(seed+Math.floor(point[0]*10)+Math.floor(point[1]*7))>>>0;const rnd=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296-.5;};
 return [rnd(),rnd(),rnd()].map(v=>v*2*field.strength);
}

export function stepParticles(system,{dt=1/30,fields=[]}={}){
 if(!Number.isFinite(dt)||dt<=0||dt>.2)throw Error('Invalid particle dt.');
 for(const p of system.particles){if(!p.alive)continue;p.age+=dt;if(p.age>=p.life){p.alive=false;continue;}
  let fx=0,fy=-9.8,fz=0;for(const f of fields){const a=sampleForce(f,p.p);fx+=a[0];fy+=a[1];fz+=a[2];}
  p.v[0]+=fx*dt;p.v[1]+=fy*dt;p.v[2]+=fz*dt;p.p[0]+=p.v[0]*dt;p.p[1]+=p.v[1]*dt;p.p[2]+=p.v[2]*dt;
 }
 return system;
}

export function createRope(points,{radius=.01,segments}={}){
 if(!Array.isArray(points)||points.length<2||points.length>256)throw Error('Rope needs 2–256 points.');
 const body={kind:'rope',points:points.map(p=>[...p]),prev:points.map(p=>[...p]),radius:radius||.01,pinned:new Set([0])};
 body.rest=[];for(let i=1;i<body.points.length;i++){const a=body.points[i-1],b=body.points[i];body.rest.push(Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2])||.05);}
 void segments;return body;
}

export function stepRope(rope,{dt=1/60,gravity=[0,-9.8,0],iterations=8}={}){
 const {points,prev,rest,pinned}=rope;
 for(let i=0;i<points.length;i++){if(pinned.has(i)){prev[i]=[...points[i]];continue;}
  const p=points[i],q=prev[i],vx=p[0]-q[0],vy=p[1]-q[1],vz=p[2]-q[2];prev[i]=[...p];
  p[0]+=vx+gravity[0]*dt*dt;p[1]+=vy+gravity[1]*dt*dt;p[2]+=vz+gravity[2]*dt*dt;
 }
 for(let it=0;it<iterations;it++)for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],len=Math.hypot(dx,dy,dz)||1e-9,corr=(len-rest[i-1])/len*.5;
  if(!pinned.has(i-1)){a[0]+=dx*corr;a[1]+=dy*corr;a[2]+=dz*corr;}if(!pinned.has(i)){b[0]-=dx*corr;b[1]-=dy*corr;b[2]-=dz*corr;}
 }
 return rope;
}

/** Voronoi-ish shatter: split box into N debris pieces (preview, not true Voronoi). */
export function shatterMesh(mesh,{pieces=8,seed=2}={}){
 if(!mesh?.isMesh)throw Error('Shatter needs a mesh.');
 if(!Number.isInteger(pieces)||pieces<2||pieces>64)throw Error('Pieces 2–64.');
 let s=seed>>>0||1;const rnd=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
 mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox,size=V().subVectors(box.max,box.min);
 const debris=[];
 for(let i=0;i<pieces;i++){
  const g=new THREE.BoxGeometry(size.x/Math.cbrt(pieces),size.y/Math.cbrt(pieces),size.z/Math.cbrt(pieces));
  const m=new THREE.Mesh(g,mesh.material?.clone?.()||new THREE.MeshStandardMaterial({color:'#888'}));
  m.position.set(mesh.position.x+(rnd()-.5)*size.x,mesh.position.y+(rnd()-.5)*size.y,mesh.position.z+(rnd()-.5)*size.z);
  m.name=`Debris ${i}`;debris.push(m);
 }
 return {kind:'shatter',debris,source:mesh.uuid};
}

export function createCollisionProxy(kind='sphere',params={}){
 if(!['sphere','box','capsule','plane'].includes(kind))throw Error('Unknown proxy kind.');
 if(kind==='sphere'){if(!Number.isFinite(params.radius)||params.radius<=0)throw Error('Sphere radius required.');return {kind,center:params.center||[0,0,0],radius:params.radius};}
 if(kind==='box')return {kind,center:params.center||[0,0,0],half:params.half||[.5,.5,.5]};
 if(kind==='capsule')return {kind,a:params.a||[0,0,0],b:params.b||[0,1,0],radius:params.radius||.1};
 return {kind,y:params.y||0,normal:[0,1,0]};
}

export function createPointCache(){return {version:1,kind:'fusion_point_cache',frames:[]};}
export function recordPointCache(cache,frame,points){
 if(!Number.isInteger(frame)||frame<0)throw Error('Frame must be >= 0.');
 if(!Array.isArray(points)||points.length>50000)throw Error('Too many points.');
 cache.frames.push({frame,points:points.map(p=>[...p])});return cache;
}
export function exportPointCache(cache){return structuredClone(cache);}

export function solverSettings({substeps=4,iterations=4,quality='medium'}={}){
 if(!Number.isInteger(substeps)||substeps<1||substeps>64||!Number.isInteger(iterations)||iterations<1||iterations>32)throw Error('Invalid solver quality.');
 if(!['low','medium','high'].includes(quality))throw Error('Quality must be low|medium|high.');
 const scale=quality==='low'?1:quality==='high'?2:1.5;
 return {substeps:Math.round(substeps*scale),iterations:Math.round(iterations*scale),quality};
}

export function simDebugState(world={}){
 return {version:1,bodies:world.bodies?.length||0,particles:world.particles?.particles?.filter(p=>p.alive).length||0,fields:world.fields?.length||0,proxies:world.proxies?.length||0,cacheFrames:world.cache?.frames?.length||0};
}

export const FX_PRESETS={
 fireworks:()=>({particles:createParticleSystem({count:200,origin:[0,2,0],velocity:[0,4,0],lifespan:1.5,spread:.1}),fields:[createForceField('gravity',{strength:12})]}),
 smoke_puff:()=>({particles:createParticleSystem({count:80,origin:[0,.5,0],velocity:[0,.8,0],lifespan:3,spread:.3}),fields:[createForceField('turbulence',{strength:.4,radius:3}),createForceField('wind',{strength:.2,axis:[.3,0,0]})]}),
 sparkler:()=>({particles:createParticleSystem({count:120,origin:[0,1,0],velocity:[0,2,0],lifespan:.8,spread:.05}),fields:[createForceField('magnetic',{strength:.5,center:[0,1,0],radius:1})]})
};
