// A19 fluids / pyro / ocean / granular / ragdoll / vehicle / FX previews (CPU).

const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const uid=()=>'fx'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);

/** SPH-style liquid particles with density/pressure forces (preview). */
export function createSphFluid({count=64,origin=[0,1,0],spacing=.08,restDensity=1,gasK=2,viscosity=.08,gravity=[0,-9.8,0]}={}){
  if(count<4||count>4096)throw Error('SPH count 4–4096.');
  const particles=[];let i=0;
  const side=Math.ceil(Math.cbrt(count));
  for(let z=0;z<side&&i<count;z++)for(let y=0;y<side&&i<count;y++)for(let x=0;x<side&&i<count;x++,i++){
    particles.push({id:i,p:[origin[0]+x*spacing,origin[1]+y*spacing,origin[2]+z*spacing],v:[0,0,0],f:[0,0,0],rho:restDensity});
  }
  return {version:1,kind:'sph',particles,restDensity,gasK,viscosity,gravity,h:spacing*2.2,mass:restDensity*spacing**3};
}

export function stepSphFluid(fluid,{dt=1/60,substeps=2}={}){
  const h=fluid.h,h2=h*h,mass=fluid.mass;
  const poly6=(r2)=>r2>=h2?0:(315/(64*Math.PI*h**9))*(h2-r2)**3;
  const spikyGrad=(r,dir)=>{if(r<=0||r>=h)return [0,0,0];const c=-45/(Math.PI*h**6)*(h-r)**2/r;return dir.map(d=>d*c);};
  for(let s=0;s<substeps;s++){
    for(const a of fluid.particles){let rho=0;for(const b of fluid.particles){const dx=a.p[0]-b.p[0],dy=a.p[1]-b.p[1],dz=a.p[2]-b.p[2];rho+=mass*poly6(dx*dx+dy*dy+dz*dz);}a.rho=Math.max(1e-4,rho);}
    for(const a of fluid.particles){
      let fx=fluid.gravity[0]*mass,fy=fluid.gravity[1]*mass,fz=fluid.gravity[2]*mass;
      const pa=fluid.gasK*(a.rho-fluid.restDensity);
      for(const b of fluid.particles){if(a===b)continue;
        const dx=a.p[0]-b.p[0],dy=a.p[1]-b.p[1],dz=a.p[2]-b.p[2],r=Math.hypot(dx,dy,dz);if(r>=h||r<1e-8)continue;
        const pb=fluid.gasK*(b.rho-fluid.restDensity),g=spikyGrad(r,[dx,dy,dz]);
        const press=-mass*(pa+pb)/(2*b.rho);fx+=g[0]*press;fy+=g[1]*press;fz+=g[2]*press;
        const vis=fluid.viscosity*mass/b.rho;fx+=(b.v[0]-a.v[0])*vis;fy+=(b.v[1]-a.v[1])*vis;fz+=(b.v[2]-a.v[2])*vis;
      }
      a.f=[fx,fy,fz];
    }
    const hdt=dt/substeps;
    for(const a of fluid.particles){
      a.v[0]+=a.f[0]/mass*hdt;a.v[1]+=a.f[1]/mass*hdt;a.v[2]+=a.f[2]/mass*hdt;
      a.p[0]+=a.v[0]*hdt;a.p[1]+=a.v[1]*hdt;a.p[2]+=a.v[2]*hdt;
      if(a.p[1]<0){a.p[1]=0;a.v[1]*=-.3;} // ground
    }
  }
  return fluid;
}

/** FLIP-lite: particles + MAC-ish velocity grid transfer. */
export function createFlipFluid({count=48,origin=[0,.8,0],spacing=.1,grid=12,bounds=2}={}){
  const sph=createSphFluid({count,origin,spacing});
  return {...sph,version:1,kind:'flip',grid,bounds,u:new Float32Array(grid**3),v:new Float32Array(grid**3),w:new Float32Array(grid**3)};
}

export function stepFlipFluid(flip,{dt=1/60}={}){
  const g=flip.grid,b=flip.bounds,cell=b/g;
  flip.u.fill(0);flip.v.fill(0);flip.w.fill(0);
  const idx=(x,y,z)=>((clamp(Math.floor(z),0,g-1)*g+clamp(Math.floor(y),0,g-1))*g+clamp(Math.floor(x),0,g-1));
  for(const p of flip.particles){
    const ix=(p.p[0]+b/2)/cell,iy=p.p[1]/cell,iz=(p.p[2]+b/2)/cell;const i=idx(ix,iy,iz);
    flip.u[i]+=p.v[0];flip.v[i]+=p.v[1];flip.w[i]+=p.v[2];
  }
  // diffuse grid slightly + gravity
  for(let i=0;i<flip.v.length;i++)flip.v[i]-=9.8*dt*.05;
  for(const p of flip.particles){
    const ix=(p.p[0]+b/2)/cell,iy=p.p[1]/cell,iz=(p.p[2]+b/2)/cell;const i=idx(ix,iy,iz);
    p.v[0]=p.v[0]*.5+flip.u[i]*.5;p.v[1]=p.v[1]*.5+flip.v[i]*.5;p.v[2]=p.v[2]*.5+flip.w[i]*.5;
    p.p[0]+=p.v[0]*dt;p.p[1]+=p.v[1]*dt;p.p[2]+=p.v[2]*dt;
    if(p.p[1]<0){p.p[1]=0;p.v[1]*=-.2;}
  }
  return flip;
}

/** Grid pyro / smoke / fire density + temperature. */
export function createPyroGrid({res=16,size=2}={}){
  if(res<4||res>64)throw Error('Pyro res 4–64.');
  const n=res**3;
  return {version:1,kind:'pyro',res,size,density:new Float32Array(n),temperature:new Float32Array(n),fuel:new Float32Array(n),velocity:new Float32Array(n*3)};
}

export function injectPyroSource(grid,{x=.5,y=.1,z=.5,radius=.12,density=1,temp=2,fuel=.8}={}){
  const r=grid.res,s=grid.size;
  for(let zi=0;zi<r;zi++)for(let yi=0;yi<r;yi++)for(let xi=0;xi<r;xi++){
    const px=(xi+.5)/r,py=(yi+.5)/r,pz=(zi+.5)/r,d=Math.hypot(px-x,py-y,pz-z);
    if(d<radius){const i=xi+yi*r+zi*r*r,w=1-d/radius;grid.density[i]+=density*w;grid.temperature[i]+=temp*w;grid.fuel[i]+=fuel*w;}
  }
  void s;return grid;
}

export function stepPyroGrid(grid,{dt=1/30,buoyancy=1.2,dissipation=.02}={}){
  const r=grid.res,nextD=new Float32Array(grid.density),nextT=new Float32Array(grid.temperature);
  for(let z=0;z<r;z++)for(let y=0;y<r;y++)for(let x=0;x<r;x++){
    const i=x+y*r+z*r*r;
    // burn fuel → heat + density
    if(grid.fuel[i]>0){const burn=Math.min(grid.fuel[i],.1);grid.fuel[i]-=burn;grid.temperature[i]+=burn*3;grid.density[i]+=burn*.5;}
    // buoyancy up
    const up=Math.min(r-1,y+1),iu=x+up*r+z*r*r;
    const flow=grid.temperature[i]*buoyancy*dt;
    nextD[iu]+=grid.density[i]*flow*.2;nextD[i]=grid.density[i]*(1-flow*.2)*(1-dissipation);
    nextT[iu]+=grid.temperature[i]*flow*.15;nextT[i]=grid.temperature[i]*(1-flow*.15)*(1-dissipation);
  }
  grid.density.set(nextD);grid.temperature.set(nextT);return grid;
}

export function createGasVolumeSolver({res=12}={}){
  const pyro=createPyroGrid({res});return {version:1,kind:'gas_volume',...pyro,divergence:new Float32Array(res**3)};
}

export function stepGasVolume(solver,opts){return stepPyroGrid(solver,opts);}

/** Gerstner/FFT-lite ocean heightfield. */
export function createOceanSurface({res=32,size=20,waves=[[.08,.6,1.2,0],[.05,.9,2.1,1.2],[.03,1.4,.7,2.5]]}={}){
  return {version:1,kind:'ocean',res,size,waves,time:0,heights:new Float32Array(res*res)};
}

export function stepOcean(ocean,{dt=1/30}={}){
  ocean.time+=dt;const {res,size,waves,time}=ocean;
  for(let z=0;z<res;z++)for(let x=0;x<res;x++){
    const px=(x/(res-1)-.5)*size,pz=(z/(res-1)-.5)*size;let h=0;
    for(const [amp,freq,speed,phase] of waves)h+=amp*Math.sin(px*freq+pz*freq*.7+time*speed+phase);
    ocean.heights[x+z*res]=h;
  }
  return ocean;
}

export function emitFoamSprayBubbles(ocean,{count=40,threshold=.04}={}){
  const foam=[],spray=[],bubbles=[];
  for(let i=0;i<ocean.heights.length;i++){
    if(ocean.heights[i]>threshold&&foam.length<count)foam.push({i,h:ocean.heights[i]});
    if(ocean.heights[i]>threshold*1.5&&spray.length<count/2)spray.push({i,h:ocean.heights[i]});
  }
  for(let b=0;b<Math.min(count/4,20);b++)bubbles.push({p:[Math.random()*ocean.size-ocean.size/2,.05+Math.random()*.2,Math.random()*ocean.size-ocean.size/2],life:1+Math.random()});
  return {foam,spray,bubbles};
}

/** Granular DEM-lite particles. */
export function createGranularSim({count=40,kind='sand',origin=[0,.5,0]}={}){
  if(!['sand','snow','mud'].includes(kind))throw Error('sand/snow/mud.');
  const friction={sand:.6,snow:.35,mud:.85}[kind],particles=[];
  for(let i=0;i<count;i++)particles.push({p:[origin[0]+(Math.random()-.5)*.4,origin[1]+Math.random()*.5,origin[2]+(Math.random()-.5)*.4],v:[0,0,0],r:.03});
  return {version:1,kind:'granular',material:kind,friction,particles};
}

export function stepGranular(sim,{dt=1/60}={}){
  for(const a of sim.particles){a.v[1]-=9.8*dt;a.p[0]+=a.v[0]*dt;a.p[1]+=a.v[1]*dt;a.p[2]+=a.v[2]*dt;
    if(a.p[1]<a.r){a.p[1]=a.r;a.v[1]*=-.1;a.v[0]*=1-sim.friction*dt*5;a.v[2]*=1-sim.friction*dt*5;}}
  for(let i=0;i<sim.particles.length;i++)for(let j=i+1;j<sim.particles.length;j++){
    const a=sim.particles[i],b=sim.particles[j],dx=b.p[0]-a.p[0],dy=b.p[1]-a.p[1],dz=b.p[2]-a.p[2],d=Math.hypot(dx,dy,dz),min=a.r+b.r;
    if(d<min&&d>1e-8){const push=(min-d)/2,nx=dx/d,ny=dy/d,nz=dz/d;a.p[0]-=nx*push;a.p[1]-=ny*push;a.p[2]-=nz*push;b.p[0]+=nx*push;b.p[1]+=ny*push;b.p[2]+=nz*push;}
  }
  return sim;
}

/** Simple vehicle + wheel raycast spring. */
export function createVehicle({position=[0,.5,0],wheelBase=2,track=1.2}={}){
  const wheels=[[-wheelBase/2,0,-track/2],[wheelBase/2,0,-track/2],[-wheelBase/2,0,track/2],[wheelBase/2,0,track/2]].map(o=>({offset:o,radius:.3,compression:0,steer:0}));
  return {version:1,kind:'vehicle',p:[...position],v:[0,0,0],yaw:0,throttle:0,steer:0,wheels};
}

export function stepVehicle(veh,{dt=1/60,groundY=0}={}){
  veh.yaw+=veh.steer*dt*1.2;const fx=Math.sin(veh.yaw)*veh.throttle,fz=Math.cos(veh.yaw)*veh.throttle;
  veh.v[0]+=fx*dt;veh.v[2]+=fz*dt;veh.v[0]*=.98;veh.v[2]*=.98;veh.v[1]-=9.8*dt;
  veh.p[0]+=veh.v[0]*dt;veh.p[1]+=veh.v[1]*dt;veh.p[2]+=veh.v[2]*dt;
  for(const w of veh.wheels){
    const wy=veh.p[1]+w.offset[1]-w.radius;w.compression=Math.max(0,groundY-wy+.05);
    if(w.compression>0)veh.v[1]+=w.compression*40*dt;
  }
  if(veh.p[1]<.4){veh.p[1]=.4;veh.v[1]=Math.max(0,veh.v[1]);}
  return veh;
}

/** Ragdoll: linked rigid capsules with ball joints. */
export function createRagdoll({origin=[0,1.2,0]}={}){
  const bones=[
    {name:'hips',p:[origin[0],origin[1],origin[2]],v:[0,0,0],parent:null},
    {name:'spine',p:[origin[0],origin[1]+.3,origin[2]],v:[0,0,0],parent:0},
    {name:'head',p:[origin[0],origin[1]+.55,origin[2]],v:[0,0,0],parent:1},
    {name:'l_arm',p:[origin[0]-.25,origin[1]+.25,origin[2]],v:[0,0,0],parent:1},
    {name:'r_arm',p:[origin[0]+.25,origin[1]+.25,origin[2]],v:[0,0,0],parent:1},
    {name:'l_leg',p:[origin[0]-.1,origin[1]-.4,origin[2]],v:[0,0,0],parent:0},
    {name:'r_leg',p:[origin[0]+.1,origin[1]-.4,origin[2]],v:[0,0,0],parent:0},
  ];
  return {version:1,kind:'ragdoll',bones,restLen:.28};
}

export function stepRagdoll(rag,{dt=1/60,iterations=4}={}){
  for(const b of rag.bones){b.v[1]-=9.8*dt;b.p[0]+=b.v[0]*dt;b.p[1]+=b.v[1]*dt;b.p[2]+=b.v[2]*dt;if(b.p[1]<.05){b.p[1]=.05;b.v[1]*=-.2;}}
  for(let it=0;it<iterations;it++)for(let i=0;i<rag.bones.length;i++){
    const b=rag.bones[i];if(b.parent==null)continue;const p=rag.bones[b.parent];
    const dx=b.p[0]-p.p[0],dy=b.p[1]-p.p[1],dz=b.p[2]-p.p[2],d=Math.hypot(dx,dy,dz)||1e-8,corr=(d-rag.restLen)/2;
    const nx=dx/d,ny=dy/d,nz=dz/d;b.p[0]-=nx*corr;b.p[1]-=ny*corr;b.p[2]-=nz*corr;p.p[0]+=nx*corr;p.p[1]+=ny*corr;p.p[2]+=nz*corr;
  }
  return rag;
}

/** Lightning bolt polyline. */
export function createLightning({start=[0,3,0],end=[0,0,0],segments=12,jitter=.15,seed=1}={}){
  let s=seed>>>0||1;const rnd=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
  const pts=[start];
  for(let i=1;i<segments;i++){const t=i/segments;pts.push([
    start[0]+(end[0]-start[0])*t+(rnd()-.5)*2*jitter,
    start[1]+(end[1]-start[1])*t+(rnd()-.5)*2*jitter,
    start[2]+(end[2]-start[2])*t+(rnd()-.5)*2*jitter,
  ]);}
  pts.push(end);
  return {version:1,kind:'lightning',points:pts,energy:1,branches:Math.floor(segments/4)};
}

/** Density field for volumetric FX rendering preview. */
export function createFxVolume({res=16,fromPyro=null}={}){
  const density=fromPyro?fromPyro.density.slice():new Float32Array(res**3);
  let max=0;for(const v of density)if(v>max)max=v;
  return {version:1,kind:'fx_volume',res,density,max,transfer:'emission'};
}

export function sampleFxVolume(vol,u,v,w){
  const r=vol.res,x=clamp(Math.floor(u*r),0,r-1),y=clamp(Math.floor(v*r),0,r-1),z=clamp(Math.floor(w*r),0,r-1);
  return vol.density[x+y*r+z*r*r]/(vol.max||1);
}

/** Particle render descriptors. */
export function particleRenderAs(particles,{mode='sprites',mesh='sphere',size=.05}={}){
  if(!['sprites','meshes','volumes'].includes(mode))throw Error('sprites|meshes|volumes');
  const list=Array.isArray(particles)?particles:particles.particles||[];
  return {version:1,kind:'particle_render',mode,mesh,size,count:list.length,instances:list.slice(0,256).map(p=>({p:p.p||p,scale:size}))};
}

/** Niagara/Shuriken-like realtime VFX graph (module stack). */
export function createRealtimeVfx({name='Burst'}={}){
  return {version:1,kind:'rt_vfx',id:uid(),name,modules:[],playing:false,age:0,particles:[]};
}

export function addVfxModule(graph,type,params={}){
  if(!['spawn','force','color_over_life','size_over_life','collision','kill'].includes(type))throw Error('Unknown VFX module.');
  const m={id:uid(),type,params:{...params}};graph.modules.push(m);return m;
}

export function stepRealtimeVfx(graph,{dt=1/60}={}){
  graph.age+=dt;graph.playing=true;
  for(const m of graph.modules){
    if(m.type==='spawn'){const n=m.params.rate||10;for(let i=0;i<n*dt;i++)graph.particles.push({p:[0,1,0],v:[(Math.random()-.5),(Math.random())*.5,(Math.random()-.5)],life:m.params.life||1,age:0,size:m.params.size||.05});}
    if(m.type==='force')for(const p of graph.particles){p.v[0]+=(m.params.x||0)*dt;p.v[1]+=(m.params.y||-1)*dt;p.v[2]+=(m.params.z||0)*dt;}
    if(m.type==='collision')for(const p of graph.particles)if(p.p[1]<0){p.p[1]=0;p.v[1]*=-(m.params.bounce||.3);}
    if(m.type==='kill')graph.particles=graph.particles.filter(p=>p.age<(m.params.maxAge||p.life));
  }
  for(const p of graph.particles){p.age+=dt;p.p[0]+=p.v[0]*dt;p.p[1]+=p.v[1]*dt;p.p[2]+=p.v[2]*dt;}
  if(graph.particles.length>2000)graph.particles.length=2000;
  return graph;
}

export function exportVdbLikeDensity(grid){
  // Lightweight ASCII density brickmap (not OpenVDB binary).
  const r=grid.res||Math.round(Math.cbrt(grid.density.length));
  let out=`# Fusion density brick ${r}^3\n`;
  for(let i=0;i<grid.density.length;i++)if(grid.density[i]>1e-4)out+=`${i} ${grid.density[i].toFixed(5)}\n`;
  return out;
}
