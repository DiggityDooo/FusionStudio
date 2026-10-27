// Pure triangle-bound guide fitting shared with the character worker.
const sub=(a,b)=>a.map((v,i)=>v-b[i]),add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,s)=>a.map(v=>v*s),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const n=Math.hypot(...a);if(!Number.isFinite(n)||n<1e-10)throw Error('A scalp binding triangle collapsed or contains invalid coordinates. Reset the affected head control.');return mul(a,1/n);};
export function fitHairGuides({positions,guides,length=1,volume=1,offset=0,curl='straight',density=2}){
 if(!positions||positions.length%3||positions.length>600000||!Array.isArray(guides)||guides.length>20000||guides.length*density>40000||!Number.isFinite(length)||length<.1||length>2||!Number.isFinite(volume)||volume<.5||volume>1.5||!Number.isFinite(offset)||Math.abs(offset)>.025||!Number.isInteger(density)||density<1||density>4||!['straight','wavy','curly','coily'].includes(curl))throw Error('Invalid hair fitting request.');
 const start=performance.now(),paths=[];
 for(const [index,g]of guides.entries()){
  if(!Array.isArray(g.triangle)||g.triangle.length!==3||g.triangle.some(i=>!Number.isInteger(i)||i<0||i>=positions.length/3)||!Array.isArray(g.barycentric)||g.barycentric.length!==3||g.barycentric.some(v=>!Number.isFinite(v)||v< -1e-4||v>1.0001)||Math.abs(g.barycentric.reduce((a,b)=>a+b,0)-1)>1e-5||!Array.isArray(g.offsets)||g.offsets.length<6||g.offsets.length%3||g.offsets.length>96||g.offsets.some(v=>!Number.isFinite(v)||Math.abs(v)>2))throw Error('Invalid scalp guide correspondence.');
  // Scalar frame math: per-guide slice/map allocation dominated warm rebuilds.
  const ia=g.triangle[0]*3,ib=g.triangle[1]*3,ic=g.triangle[2]*3,ax=positions[ia],ay=positions[ia+1],az=positions[ia+2];
  let tx=positions[ib]-ax,ty=positions[ib+1]-ay,tz=positions[ib+2]-az;const tl=Math.hypot(tx,ty,tz);if(!Number.isFinite(tl)||tl<1e-10)throw Error('A scalp binding triangle collapsed or contains invalid coordinates. Reset the affected head control.');tx/=tl;ty/=tl;tz/=tl;
  const ux=positions[ic]-ax,uy=positions[ic+1]-ay,uz=positions[ic+2]-az;
  let nx=ty*uz-tz*uy,ny=tz*ux-tx*uz,nz=tx*uy-ty*ux;const nl=Math.hypot(nx,ny,nz);if(!Number.isFinite(nl)||nl<1e-10)throw Error('A scalp binding triangle collapsed or contains invalid coordinates. Reset the affected head control.');nx/=nl;ny/=nl;nz/=nl;
  const bx=ny*tz-nz*ty,by=nz*tx-nx*tz,bz=nx*ty-ny*tx;
  const ox=ax*g.barycentric[0]+positions[ib]*g.barycentric[1]+positions[ic]*g.barycentric[2],oy=ay*g.barycentric[0]+positions[ib+1]*g.barycentric[1]+positions[ic+1]*g.barycentric[2],oz=az*g.barycentric[0]+positions[ib+2]*g.barycentric[1]+positions[ic+2]*g.barycentric[2];
  for(let duplicate=0;duplicate<density;duplicate++){const path=[],phase=(index*2.39996+duplicate*1.3),jitter=(duplicate-(density-1)*.5)*.0006;for(let i=0;i<g.offsets.length;i+=3){const t=i/(g.offsets.length-3),amplitude=curl==='wavy'?.007:curl==='curly'?.004:curl==='coily'?.0025:0,turns=curl==='wavy'?1.5:curl==='curly'?3:5,angle=t*turns*Math.PI*2+phase,envelope=Math.sin(Math.min(1,t*5)*Math.PI/2),u=g.offsets[i]*length*volume+jitter+Math.sin(angle)*amplitude*envelope,v=g.offsets[i+1]*length*volume+Math.cos(angle)*amplitude*envelope,w=g.offsets[i+2]*length+offset;path.push(ox+tx*u+bx*v+nx*w,oy+ty*u+by*v+ny*w,oz+tz*u+bz*v+nz*w);}paths.push(path);}
 }
 return {paths,milliseconds:performance.now()-start,roots:guides.length,method:'HM08 barycentric scalp + authored triangle-frame guides'};
}

const scalpCache=new WeakMap();
const frame=(p,ids)=>{const [a,b,c]=ids.map(i=>Array.from(p.slice(i*3,i*3+3))),t=unit(sub(b,a)),n=unit(cross(sub(b,a),sub(c,a)));return {a,b,c,t,n,bn:unit(cross(n,t))};};
const rootPoint=(f,b)=>f.a.map((v,i)=>v*b[0]+f.b[i]*b[1]+f.c[i]*b[2]);
const sample=(path,t)=>{const at=t*(path.length/3-1),lo=Math.floor(at),hi=Math.min(lo+1,path.length/3-1),u=at-lo;return [0,1,2].map(i=>path[lo*3+i]*(1-u)+path[hi*3+i]*u);};
/** Derive display strands from the CC0 guides. The seeded roots are bound once
 * to the immutable cage, so head morphs cannot shuffle the hairstyle. Only a
 * narrow one-ring neighbourhood of authored roots can receive strands. */
export function scalpStrandGuides(source,style,{count=8000}={}){
 if(!Number.isInteger(count)||count<1||count>20000||!['short','long'].includes(style)||!source?.hair?.styles?.[style])throw Error('Unsupported scalp strand preset.');
 let cache=scalpCache.get(source);if(!cache)scalpCache.set(source,cache=new Map());const key=style+':'+count;if(cache.has(key))return cache.get(key);
 const guides=source.hair.styles[style],p=source.positions,paths=fitHairGuides({positions:p,guides,density:1}).paths,frames=guides.map(g=>frame(p,g.triangle)),roots=guides.map((g,i)=>rootPoint(frames[i],g.barycentric)),rootVertices=new Set(guides.flatMap(g=>g.triangle)),candidates=[];
 for(let i=0;i<source.triangles.length;i+=3){const ids=source.triangles.slice(i,i+3);if(!ids.some(id=>rootVertices.has(id)))continue;const f=frame(p,ids),center=rootPoint(f,[1/3,1/3,1/3]),nearest=roots.map((r,index)=>({index,d:Math.hypot(...sub(center,r))})).sort((a,b)=>a.d-b.d).slice(0,3);if(nearest[0].d>.016||f.n.reduce((a,v,i)=>a+v*frames[nearest[0].index].n[i],0)<.3)continue;const area=Math.hypot(...cross(sub(f.b,f.a),sub(f.c,f.a)))/2;if(area>1e-12)candidates.push({ids,f,nearest,area});}
 if(!candidates.length)throw Error('This hairstyle has no valid scalp coverage.');
 const total=candidates.reduce((v,c)=>v+c.area,0),result=[];let state=0x9e3779b9,acc=0,at=0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 for(let i=0;i<count;i++){const target=(i+.5)/count*total;while(at<candidates.length-1&&acc+candidates[at].area<target)acc+=candidates[at++].area;const c=candidates[at],u=Math.sqrt(random()),v=random(),b=[1-u,u*(1-v),u*v],origin=rootPoint(c.f,b),near=c.nearest.map(n=>({...n,w:1/Math.max(1e-7,sub(origin,roots[n.index]).reduce((a,x)=>a+x*x,0))})),weight=near.reduce((a,n)=>a+n.w,0),offsets=[],variation=.94+random()*.12;
  for(let j=0;j<24;j++){const t=j/23,delta=[0,0,0];for(const n of near){const d=sub(sample(paths[n.index],t),roots[n.index]);for(let a=0;a<3;a++)delta[a]+=d[a]*n.w/weight;}const tangent=delta.reduce((a,v,i)=>a+v*c.f.t[i],0),bitangent=delta.reduce((a,v,i)=>a+v*c.f.bn[i],0),normal=delta.reduce((a,v,i)=>a+v*c.f.n[i],0);offsets.push(tangent*variation,bitangent*variation,Math.max(j===0?.0004:-2,normal*variation));}
  result.push({triangle:c.ids,barycentric:b,offsets});
 }
 cache.set(key,result);return result;
}
