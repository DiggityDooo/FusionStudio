import * as THREE from 'three';

const MAX_GUIDES=5000,MAX_POINTS=64;

export function createGuide(points,{name='Guide'}={}){
 if(!Array.isArray(points)||points.length<2||points.length>MAX_POINTS)throw Error('Guide needs 2–64 points.');
 const pts=points.map(p=>Array.isArray(p)?p.map(Number):[p.x,p.y,p.z]);
 if(pts.some(p=>p.length!==3||p.some(v=>!Number.isFinite(v))))throw Error('Guide points must be finite XYZ.');
 return {id:THREE.MathUtils.generateUUID(),name:String(name).slice(0,40),points:pts};
}

export function createGroom({guides=[],children=4,lengthScale=1}={}){
 if(guides.length>MAX_GUIDES)throw Error('Too many guides.');
 if(!Number.isInteger(children)||children<0||children>32)throw Error('Children per guide must be 0–32.');
 return {version:1,guides:guides.map(g=>structuredClone(g)),children,lengthScale,shading:{melanin:.4,root:'#1a0f0a',tip:'#5c3a24'},wind:[0,0,0],gravity:[0,-9.8,0]};
}

function ensureGuide(groom,id){const g=groom.guides.find(x=>x.id===id);if(!g)throw Error('Guide missing.');return g;}

export function combGuide(groom,guideId,direction,strength=.5){
 const g=ensureGuide(groom,guideId),dir=new THREE.Vector3().fromArray(direction);if(dir.lengthSq()<1e-12)throw Error('Comb direction required.');
 dir.normalize();if(!Number.isFinite(strength)||strength<0||strength>1)throw Error('Comb strength 0–1.');
 for(let i=1;i<g.points.length;i++){const p=new THREE.Vector3().fromArray(g.points[i]),prev=new THREE.Vector3().fromArray(g.points[i-1]);
  const along=p.clone().sub(prev),len=along.length();p.addScaledVector(dir,strength*len*.5);const next=prev.clone().add(p.clone().sub(prev).setLength(len));g.points[i]=next.toArray();}
 return g;
}

export function cutGuide(groom,guideId,keep=0.7){
 const g=ensureGuide(groom,guideId);if(!Number.isFinite(keep)||keep<.05||keep>1)throw Error('Cut keep fraction must be 0.05–1.');
 const n=Math.max(2,Math.ceil((g.points.length-1)*keep)+1);g.points=g.points.slice(0,n);return g;
}

export function growGuide(groom,guideId,amount=.1){
 const g=ensureGuide(groom,guideId);if(!Number.isFinite(amount)||amount<=0||amount>1)throw Error('Grow amount must be in (0, 1].');
 if(g.points.length>=MAX_POINTS)throw Error('Guide already at max points.');
 const a=g.points.at(-2),b=g.points.at(-1),dir=b.map((v,i)=>v-a[i]),len=Math.hypot(...dir)||.01;
 g.points.push(b.map((v,i)=>v+dir[i]/len*amount));return g;
}

export function puffGuide(groom,guideId,amount=.05){
 const g=ensureGuide(groom,guideId);if(!Number.isFinite(amount)||Math.abs(amount)>.2)throw Error('Puff amount out of range.');
 const root=g.points[0];for(let i=1;i<g.points.length;i++){const t=i/(g.points.length-1);g.points[i]=g.points[i].map((v,j)=>v+(v-root[j])*amount*t);}return g;
}

export function smoothGuide(groom,guideId,iterations=2){
 const g=ensureGuide(groom,guideId);if(!Number.isInteger(iterations)||iterations<1||iterations>8)throw Error('Smooth iterations 1–8.');
 for(let pass=0;pass<iterations;pass++){const next=g.points.map(p=>[...p]);for(let i=1;i<g.points.length-1;i++)for(let c=0;c<3;c++)next[i][c]=(g.points[i-1][c]+g.points[i][c]+g.points[i+1][c])/3;g.points=next;}return g;
}

export function setGuideLength(groom,guideId,scale){
 const g=ensureGuide(groom,guideId);if(!Number.isFinite(scale)||scale<.05||scale>3)throw Error('Length scale must be 0.05–3.');
 const root=g.points[0];g.points=g.points.map((p,i)=>i===0?p:root.map((r,c)=>r+(p[c]-r)*scale));return g;
}

export function clumpGuides(groom,{centerId,radius=.05,strength=.5}={}){
 const center=ensureGuide(groom,centerId);if(!Number.isFinite(radius)||radius<=0||radius>.5||!Number.isFinite(strength)||strength<0||strength>1)throw Error('Invalid clump settings.');
 const c0=center.points[0];
 for(const g of groom.guides){if(g.id===centerId)continue;const d=Math.hypot(...g.points[0].map((v,i)=>v-c0[i]));if(d>radius)continue;
  for(let i=0;i<Math.min(g.points.length,center.points.length);i++)g.points[i]=g.points[i].map((v,c)=>v+(center.points[i][c]-v)*strength);}
 return groom;
}

/** Interpolate child strands around each guide. */
export function interpolateChildren(groom){
 const out=[];
 for(const g of groom.guides){
  out.push(g.points);
  for(let c=0;c<groom.children;c++){const ang=c/Math.max(1,groom.children)*Math.PI*2,rad=.004*(1+c%3)*.5;const child=g.points.map((p,i)=>{
   if(i===0)return [...p];const t=i/(g.points.length-1);const ox=Math.cos(ang)*rad*t,oz=Math.sin(ang)*rad*t;return [p[0]+ox,p[1],p[2]+oz];});out.push(child);}
 }
 return out;
}

export function applyFrizz(groom,{amount=.01,seed=1}={}){
 if(!Number.isFinite(amount)||amount<0||amount>.05)throw Error('Frizz amount 0–0.05.');
 let s=seed>>>0||1;const rnd=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
 for(const g of groom.guides)for(let i=1;i<g.points.length;i++){const t=i/(g.points.length-1);for(let c=0;c<3;c++)g.points[i][c]+=(rnd()-.5)*2*amount*t;}
 return groom;
}

export function applyCurl(groom,{turns=2,radius=.008}={}){
 if(!Number.isFinite(turns)||turns<0||turns>8||!Number.isFinite(radius)||radius<0||radius>.05)throw Error('Invalid curl settings.');
 for(const g of groom.guides){const root=g.points[0];for(let i=1;i<g.points.length;i++){const t=i/(g.points.length-1),a=t*turns*Math.PI*2;g.points[i]=[root[0]+(g.points[i][0]-root[0])+Math.cos(a)*radius*t,g.points[i][1],root[2]+(g.points[i][2]-root[2])+Math.sin(a)*radius*t];}}
 return groom;
}

export function applyWindGravity(groom,{dt=1/24}={}){
 if(!Number.isFinite(dt)||dt<=0||dt>.2)throw Error('Invalid dt.');
 const force=groom.wind.map((v,i)=>v+groom.gravity[i]);
 for(const g of groom.guides)for(let i=1;i<g.points.length;i++){const t=i/(g.points.length-1);for(let c=0;c<3;c++)g.points[i][c]+=force[c]*dt*dt*t;}
 return groom;
}

export function setHairShading(groom,shading={}){
 Object.assign(groom.shading,shading);if(!Number.isFinite(groom.shading.melanin)||groom.shading.melanin<0||groom.shading.melanin>1)throw Error('Melanin must be 0–1.');
 return groom.shading;
}

/** Convert guides to billboard hair cards (simple quads along each guide). */
export function guidesToHairCards(groom,{width=.008}={}){
 if(!Number.isFinite(width)||width<=0||width>.05)throw Error('Card width out of range.');
 const positions=[],normals=[],uvs=[],indices=[];let v=0;
 for(const g of groom.guides){
  for(let i=0;i<g.points.length-1;i++){
   const a=g.points[i],b=g.points[i+1],dir=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],len=Math.hypot(...dir)||1e-6;
   const side=[-dir[2]/len*width/2,0,dir[0]/len*width/2],t=i/(g.points.length-1),t2=(i+1)/(g.points.length-1);
   const p0=[a[0]-side[0],a[1],a[2]-side[2]],p1=[a[0]+side[0],a[1],a[2]+side[2]],p2=[b[0]+side[0],b[1],b[2]+side[2]],p3=[b[0]-side[0],b[1],b[2]-side[2]];
   for(const p of [p0,p1,p2,p3])positions.push(...p);
   normals.push(0,1,0,0,1,0,0,1,0,0,1,0);uvs.push(0,t,1,t,1,t2,0,t2);indices.push(v,v+1,v+2,v,v+2,v+3);v+=4;
  }
 }
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();
 return geo;
}

/** Hair-to-mesh: same as cards but returns a Mesh. */
export function hairToMesh(groom,material){return new THREE.Mesh(guidesToHairCards(groom),material||new THREE.MeshStandardMaterial({color:groom.shading.tip,side:THREE.DoubleSide}));}

export function optimizeGroomLod(groom,{keep=0.5}={}){
 if(!Number.isFinite(keep)||keep<=0||keep>1)throw Error('LOD keep fraction must be in (0, 1].');
 const n=Math.max(1,Math.round(groom.guides.length*keep));
 groom.guides=groom.guides.filter((_,i)=>i%Math.ceil(groom.guides.length/n)===0).slice(0,n);
 groom.children=Math.max(0,Math.round(groom.children*keep));
 return groom;
}

export function exportGroomCache(groom){
 return {version:1,kind:'fusion_groom_cache',guides:groom.guides,children:groom.children,shading:groom.shading,strands:interpolateChildren(groom)};
}

export const GROOM_LIBRARY={
 short_bob:()=>createGroom({guides:[createGuide([[0,1.6,0.05],[0,1.55,0.08],[0,1.5,0.06]]),createGuide([[0.05,1.6,0.04],[0.06,1.54,0.07],[0.05,1.48,0.05]]),createGuide([[-0.05,1.6,0.04],[-0.06,1.54,0.07],[-0.05,1.48,0.05]])],children:6}),
 long_straight:()=>createGroom({guides:[createGuide([[0,1.65,0.02],[0,1.4,0.05],[0,1.15,0.04],[0,1.0,0.03]]),createGuide([[0.08,1.64,0.02],[0.09,1.35,0.05],[0.08,1.1,0.04]]),createGuide([[-0.08,1.64,0.02],[-0.09,1.35,0.05],[-0.08,1.1,0.04]])],children:8})
};

export function browLashGuides(kind='eyebrow'){
 if(!['eyebrow','eyelash','beard'].includes(kind))throw Error('Unsupported brow/lash/beard kind.');
 if(kind==='eyebrow')return createGroom({guides:[createGuide([[-0.04,1.58,0.08],[-0.02,1.585,0.085],[0.01,1.58,0.08]]),createGuide([[0.04,1.58,0.08],[0.02,1.585,0.085],[-0.01,1.58,0.08]])],children:2});
 if(kind==='eyelash')return createGroom({guides:[createGuide([[-0.03,1.56,0.09],[-0.03,1.565,0.095]]),createGuide([[0.03,1.56,0.09],[0.03,1.565,0.095]])],children:3});
 return createGroom({guides:[createGuide([[0,1.45,0.06],[0,1.4,0.08],[0,1.35,0.07]]),createGuide([[0.03,1.45,0.05],[0.04,1.38,0.07]]),createGuide([[-0.03,1.45,0.05],[-0.04,1.38,0.07]])],children:4});
}

export function applyWave(groom,{amplitude=.01,frequency=3}={}){
 if(!Number.isFinite(amplitude)||amplitude<0||amplitude>.05||!Number.isFinite(frequency)||frequency<=0||frequency>12)throw Error('Invalid wave settings.');
 for(const g of groom.guides)for(let i=1;i<g.points.length;i++){const t=i/(g.points.length-1),w=Math.sin(t*frequency*Math.PI*2)*amplitude*t;g.points[i][0]+=w;g.points[i][2]+=w*.5;}
 return groom;
}

export function applyFlyaways(groom,{count=4,amount=.02,seed=7}={}){
 if(!Number.isInteger(count)||count<1||count>64||!Number.isFinite(amount)||amount<=0||amount>.1)throw Error('Invalid flyaway settings.');
 let s=seed>>>0||1;const rnd=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
 const picks=[...groom.guides].sort(()=>rnd()-.5).slice(0,Math.min(count,groom.guides.length));
 for(const g of picks){const tip=g.points.at(-1);tip[0]+=(rnd()-.5)*2*amount;tip[1]+=rnd()*amount;tip[2]+=(rnd()-.5)*2*amount;}
 return groom;
}

/** Approximate 3-strand braid offset along each guide. */
export function applyBraid(groom,{turns=4,radius=.006}={}){
 if(!Number.isFinite(turns)||turns<1||turns>16||!Number.isFinite(radius)||radius<=0||radius>.04)throw Error('Invalid braid settings.');
 for(const g of groom.guides){const root=g.points[0];for(let i=1;i<g.points.length;i++){const t=i/(g.points.length-1),a=t*turns*Math.PI*2,phase=(i%3)*(Math.PI*2/3);g.points[i]=[root[0]+(g.points[i][0]-root[0])+Math.cos(a+phase)*radius*t,g.points[i][1],root[2]+(g.points[i][2]-root[2])+Math.sin(a+phase)*radius*t];}}
 return groom;
}

/** Sphere collision: push guide points outside collider spheres. */
export function collideGuides(groom,spheres=[]){
 if(!Array.isArray(spheres)||spheres.length>64)throw Error('Invalid colliders.');
 for(const s of spheres){if(!s.center||s.center.length!==3||!Number.isFinite(s.radius)||s.radius<=0)throw Error('Collider needs center XYZ and radius.');}
 for(const g of groom.guides)for(let i=1;i<g.points.length;i++){
  const p=g.points[i];
  for(const s of spheres){let d=[p[0]-s.center[0],p[1]-s.center[1],p[2]-s.center[2]],len=Math.hypot(...d);
   if(len>=s.radius)continue;if(len<1e-12){d=[0,1,0];len=1;}
   const scale=s.radius/len;p[0]=s.center[0]+d[0]*scale;p[1]=s.center[1]+d[1]*scale;p[2]=s.center[2]+d[2]*scale;}
 }
 return groom;
}

/**
 * Verlet hair dynamics with optional sphere colliders.
 * Rest lengths preserved; roots pinned. Preview solver — not production PBD.
 */
export function simulateHairDynamics(groom,{steps=4,dt=1/48,damping=.92,colliders=[]}={}){
 if(!Number.isInteger(steps)||steps<1||steps>32||!Number.isFinite(dt)||dt<=0||dt>.1||!Number.isFinite(damping)||damping<=0||damping>1)throw Error('Invalid dynamics settings.');
 for(const g of groom.guides)if(!g._rest){g._rest=[];for(let j=1;j<g.points.length;j++){const a=g.points[j-1],b=g.points[j];g._rest.push(Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2])||.02);}}
 if(!groom._prev||groom._prev.length!==groom.guides.length)groom._prev=groom.guides.map(g=>g.points.map(p=>[...p]));
 const force=groom.wind.map((v,i)=>v+groom.gravity[i]);
 for(let step=0;step<steps;step++){
  for(let gi=0;gi<groom.guides.length;gi++){
   const g=groom.guides[gi],prev=groom._prev[gi];
   for(let i=1;i<g.points.length;i++){
    const p=g.points[i],q=prev[i],vx=(p[0]-q[0])*damping,vy=(p[1]-q[1])*damping,vz=(p[2]-q[2])*damping;
    prev[i]=[...p];p[0]+=vx+force[0]*dt*dt;p[1]+=vy+force[1]*dt*dt;p[2]+=vz+force[2]*dt*dt;
   }
   for(let pass=0;pass<2;pass++)for(let i=1;i<g.points.length;i++){
    const a=g.points[i-1],b=g.points[i],dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],len=Math.hypot(dx,dy,dz)||1e-9;
    const tlen=g._rest[i-1],corr=(len-tlen)/len*.5;if(i>1){a[0]+=dx*corr;a[1]+=dy*corr;a[2]+=dz*corr;}b[0]-=dx*corr;b[1]-=dy*corr;b[2]-=dz*corr;
   }
  }
  if(colliders.length)collideGuides(groom,colliders);
 }
 return groom;
}

/** Grow short fur guides from mesh triangle centroids along normals. */
export function createFurOnMesh(mesh,{density=32,length=.02,seed=1}={}){
 if(!mesh?.isMesh||!mesh.geometry?.attributes.position)throw Error('Fur needs a mesh with positions.');
 if(!Number.isInteger(density)||density<1||density>2000||!Number.isFinite(length)||length<=0||length>.2)throw Error('Invalid fur settings.');
 const pos=mesh.geometry.attributes.position,nml=mesh.geometry.attributes.normal,index=mesh.geometry.index;
 let s=seed>>>0||1;const rnd=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
 const guides=[],triCount=index?index.count/3:pos.count/3,stride=Math.max(1,Math.floor(triCount/density));
 mesh.updateWorldMatrix(true,false);const m=mesh.matrixWorld;
 for(let t=0;t<triCount;t+=stride){
  const i0=index?index.getX(t*3):t*3,i1=index?index.getX(t*3+1):t*3+1,i2=index?index.getX(t*3+2):t*3+2;
  const a=new THREE.Vector3().fromBufferAttribute(pos,i0),b=new THREE.Vector3().fromBufferAttribute(pos,i1),c=new THREE.Vector3().fromBufferAttribute(pos,i2);
  const u=rnd(),v=rnd()*(1-u),w=1-u-v,p=a.clone().multiplyScalar(u).addScaledVector(b,v).addScaledVector(c,w);
  let n;if(nml){const na=new THREE.Vector3().fromBufferAttribute(nml,i0),nb=new THREE.Vector3().fromBufferAttribute(nml,i1),nc=new THREE.Vector3().fromBufferAttribute(nml,i2);n=na.multiplyScalar(u).addScaledVector(nb,v).addScaledVector(nc,w).normalize();}
  else n=new THREE.Vector3().crossVectors(b.clone().sub(a),c.clone().sub(a)).normalize();
  p.applyMatrix4(m);n.transformDirection(m);
  const tip=p.clone().addScaledVector(n,length*(.7+rnd()*.3));
  guides.push(createGuide([p.toArray(),tip.toArray()],{name:'Fur'}));
  if(guides.length>=density)break;
 }
 return createGroom({guides,children:0,lengthScale:1});
}

export function createHairMask(width=64,height=64,fill=1){
 if(!Number.isInteger(width)||width<8||width>512||!Number.isInteger(height)||height<8||height>512)throw Error('Mask size 8–512.');
 if(!Number.isFinite(fill)||fill<0||fill>1)throw Error('Fill 0–1.');
 return {version:1,width,height,data:new Float32Array(width*height).fill(fill)};
}

export function paintHairMask(mask,u,v,{radius=.05,value=0,strength=1}={}){
 if(!mask?.data)throw Error('Mask required.');
 if([u,v,radius,value,strength].some(x=>!Number.isFinite(x))||u<0||u>1||v<0||v>1||radius<=0||radius>.5||value<0||value>1||strength<0||strength>1)throw Error('Invalid paint stroke.');
 const cx=Math.floor(u*(mask.width-1)),cy=Math.floor(v*(mask.height-1)),r=Math.max(1,Math.round(radius*Math.max(mask.width,mask.height)));
 for(let y=cy-r;y<=cy+r;y++)for(let x=cx-r;x<=cx+r;x++){
  if(x<0||y<0||x>=mask.width||y>=mask.height)continue;const d=Math.hypot(x-cx,y-cy)/r;if(d>1)continue;
  const i=y*mask.width+x,w=(1-d)*strength;mask.data[i]=mask.data[i]*(1-w)+value*w;
 }
 return mask;
}

/** Cull or shorten guides whose root UV falls below mask threshold. */
export function applyHairMask(groom,mask,{threshold=.35,mode='cull'}={}){
 if(!mask?.data)throw Error('Mask required.');
 if(!['cull','shorten'].includes(mode))throw Error('Mask mode must be cull or shorten.');
 const sample=(u,v)=>{const x=Math.min(mask.width-1,Math.max(0,Math.floor(u*(mask.width-1)))),y=Math.min(mask.height-1,Math.max(0,Math.floor(v*(mask.height-1))));return mask.data[y*mask.width+x];};
 groom.guides=groom.guides.filter((g,i)=>{
  const u=((g.points[0][0]%1)+1)%1,v=((g.points[0][2]%1)+1)%1,m=g.uv?sample(g.uv[0],g.uv[1]):sample(u,v);
  if(m<threshold){if(mode==='cull')return false;setGuideLength(groom,g.id,Math.max(.05,m));}
  return true;
 });
 return groom;
}

/** Grass / feather / moss strand fields as grooms. */
export function generateStrandField(kind='grass',{count=24,area=.2,origin=[0,0,0],seed=3}={}){
 if(!['grass','feather','moss'].includes(kind))throw Error('Unsupported strand field kind.');
 if(!Number.isInteger(count)||count<1||count>2000)throw Error('Count 1–2000.');
 let s=seed>>>0||1;const rnd=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
 const guides=[];
 for(let i=0;i<count;i++){
  const ox=origin[0]+(rnd()-.5)*area,oz=origin[2]+(rnd()-.5)*area,oy=origin[1];
  if(kind==='grass')guides.push(createGuide([[ox,oy,oz],[ox+(rnd()-.5)*.01,oy+.05+rnd()*.08,oz+(rnd()-.5)*.01],[ox+(rnd()-.5)*.02,oy+.1+rnd()*.12,oz+(rnd()-.5)*.02]]));
  else if(kind==='feather')guides.push(createGuide([[ox,oy,oz],[ox,oy+.02,oz+.01],[ox+(rnd()-.5)*.03,oy+.04,oz+.02],[ox+(rnd()-.5)*.04,oy+.05,oz+.03]]));
  else guides.push(createGuide([[ox,oy,oz],[ox+(rnd()-.5)*.005,oy+.008+rnd()*.006,oz+(rnd()-.5)*.005]]));
 }
 return createGroom({guides,children:kind==='moss'?0:2});
}

const NODE_OPS={frizz:applyFrizz,curl:applyCurl,wave:applyWave,braid:applyBraid,flyaways:applyFlyaways,wind:applyWindGravity,lod:optimizeGroomLod};

/** Linear procedural grooming node graph: [{op, params}, ...]. */
export function runGroomNodes(groom,nodes=[]){
 if(!Array.isArray(nodes)||nodes.length>32)throw Error('Node graph must have 0–32 nodes.');
 for(const node of nodes){
  if(!node||typeof node.op!=='string')throw Error('Each node needs an op.');
  const fn=NODE_OPS[node.op];if(!fn)throw Error('Unknown groom node: '+node.op);
  fn(groom,node.params||{});
 }
 groom.userData={...(groom.userData||{}),nodes:nodes.map(n=>({op:n.op,params:n.params||{}}))};
 return groom;
}
