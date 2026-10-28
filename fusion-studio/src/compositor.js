export const COMP_NODE_TYPES=[
  'render_layers','image','viewer','composite','alpha_over','mix','blur','glare','lens_distortion',
  'color_balance','curve','lut','tonemap','vignette','chromatic_aberration','sharpen','denoise',
  'z_combine','defocus','vector_blur','fog','cryptomatte','keying','roto','stabilize','sequence',
  'map_uv','relight','post_volume'
];

export const COLOR_SPACES=['sRGB','linear','ACES','ACEScg','Rec.709','Rec.2020','OCIO'];

export function createCompTree({name='Compositor'}={}){
 return {version:1,name:String(name).slice(0,64),nodes:[],links:[],colorSpace:'ACES',frame:1,lut:null,liveLink:false};
}

export function addCompNode(tree,type,params={}){
 if(!COMP_NODE_TYPES.includes(type))throw Error('Unknown compositor node: '+type);
 if(tree.nodes.length>=64)throw Error('At most 64 compositor nodes.');
 const node={id:`c${Date.now().toString(36)}${Math.random().toString(36).slice(2,5)}`,type,params:{...params},muted:false};
 tree.nodes.push(node);return node;
}

export function linkCompNodes(tree,fromId,toId,{from='image',to='image'}={}){
 if(!tree.nodes.some(n=>n.id===fromId)||!tree.nodes.some(n=>n.id===toId))throw Error('Comp link endpoints missing.');
 const link={from:fromId,to:toId,fromSocket:from,toSocket:to};tree.links.push(link);return link;
}

export function setColorManagement(tree,{space='ACES',ocioConfig=null}={}){
 if(!COLOR_SPACES.includes(space))throw Error('Unknown color space.');
 tree.colorSpace=space;tree.ocioConfig=ocioConfig;return tree;
}

/** Float RGBA buffer helpers (preview CPU compositor). */
export function createImageBuffer(width,height,fill=[0,0,0,1]){
 if(!Number.isInteger(width)||width<1||width>4096||!Number.isInteger(height)||height<1||height>4096)throw Error('Invalid buffer size.');
 const data=new Float32Array(width*height*4);
 for(let i=0;i<data.length;i+=4){data[i]=fill[0];data[i+1]=fill[1];data[i+2]=fill[2];data[i+3]=fill[3];}
 return {width,height,data,aovs:{}};
}

export function attachAovs(buffer,aovs={}){
 buffer.aovs={...buffer.aovs,...aovs};return buffer;
}

export function liftGammaGain(buffer,{lift=[0,0,0],gamma=[1,1,1],gain=[1,1,1]}={}){
 const out=buffer.data.slice();
 for(let i=0;i<out.length;i+=4)for(let c=0;c<3;c++){
  let v=out[i+c]+lift[c];v=Math.pow(Math.max(0,v),1/Math.max(1e-4,gamma[c]));out[i+c]=v*gain[c];
 }
 return {width:buffer.width,height:buffer.height,data:out,aovs:buffer.aovs};
}

export function applyToneCurve(buffer,curve=[[0,0],[.5,.5],[1,1]]){
 if(!Array.isArray(curve)||curve.length<2)throw Error('Curve needs 2+ points.');
 const lut=new Float32Array(256);
 for(let i=0;i<256;i++){const t=i/255;let y=t;for(let p=0;p<curve.length-1;p++){const [x0,y0]=curve[p],[x1,y1]=curve[p+1];if(t>=x0&&t<=x1){const u=(t-x0)/Math.max(1e-6,x1-x0);y=y0+(y1-y0)*u;break;}}lut[i]=y;}
 const out=buffer.data.slice();
 for(let i=0;i<out.length;i+=4)for(let c=0;c<3;c++){const idx=Math.min(255,Math.max(0,Math.round(out[i+c]*255)));out[i+c]=lut[idx];}
 return {width:buffer.width,height:buffer.height,data:out,aovs:buffer.aovs};
}

export function createLut(size=16,{contrast=1.1}={}){
 if(![8,16,32,64].includes(size))throw Error('LUT size 8/16/32/64.');
 const data=new Float32Array(size*size*size*3);
 for(let b=0;b<size;b++)for(let g=0;g<size;g++)for(let r=0;r<size;r++){
  const i=((b*size+g)*size+r)*3,nr=r/(size-1),ng=g/(size-1),nb=b/(size-1);
  data[i]=Math.min(1,Math.pow(nr,1/contrast));data[i+1]=Math.min(1,Math.pow(ng,1/contrast));data[i+2]=Math.min(1,Math.pow(nb,1/contrast));
 }
 return {version:1,size,data,title:'Fusion contrast LUT'};
}

export function applyLut(buffer,lut){
 if(!lut?.data||!lut.size)throw Error('LUT required.');
 const s=lut.size,out=buffer.data.slice(),D=lut.data;
 // Trilinear interpolation over the lattice (nearest-neighbour sampling
 // bands visibly; an identity LUT must reproduce its input exactly).
 const sample=(r,g,b)=>{
  const x=Math.min(1,Math.max(0,r))*(s-1),y=Math.min(1,Math.max(0,g))*(s-1),z=Math.min(1,Math.max(0,b))*(s-1);
  const xi=Math.min(s-2,Math.floor(x)),yi=Math.min(s-2,Math.floor(y)),zi=Math.min(s-2,Math.floor(z));
  const fx=x-xi,fy=y-yi,fz=z-zi,res=[0,0,0];
  for(let dz=0;dz<2;dz++)for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
   const wgt=(dx?fx:1-fx)*(dy?fy:1-fy)*(dz?fz:1-fz);
   const i=(((zi+dz)*s+(yi+dy))*s+(xi+dx))*3;
   for(let c=0;c<3;c++)res[c]+=D[i+c]*wgt;
  }
  return res;
 };
 for(let i=0;i<out.length;i+=4){const [r,g,b]=sample(out[i],out[i+1],out[i+2]);out[i]=r;out[i+1]=g;out[i+2]=b;}
 return {width:buffer.width,height:buffer.height,data:out,aovs:buffer.aovs};
}

export function exportLut(lut,{format='cube'}={}){
 if(format!=='cube')throw Error('Only .cube export in this build.');
 let txt=`TITLE "${lut.title||'Fusion LUT'}"\nLUT_3D_SIZE ${lut.size}\n`;
 for(let i=0;i<lut.data.length;i+=3)txt+=`${lut.data[i].toFixed(6)} ${lut.data[i+1].toFixed(6)} ${lut.data[i+2].toFixed(6)}\n`;
 return txt;
}

export function importLutCube(text){
 if(typeof text!=='string'||!text.includes('LUT_3D_SIZE'))throw Error('Invalid .cube LUT.');
 const size=Number(text.match(/LUT_3D_SIZE\s+(\d+)/i)?.[1]);if(!size)throw Error('Missing LUT size.');
 const nums=text.split(/\s+/).map(Number).filter(n=>Number.isFinite(n)&&n!==size); // rough
 const data=new Float32Array(size*size*size*3);let at=0;
 for(const line of text.split(/\r?\n/)){const m=line.trim().match(/^([0-9.eE+-]+)\s+([0-9.eE+-]+)\s+([0-9.eE+-]+)$/);if(!m)continue;data[at++]=+m[1];data[at++]=+m[2];data[at++]=+m[3];if(at>=data.length)break;}
 if(at<data.length)throw Error('Incomplete LUT data.');
 void nums;return {version:1,size,data,title:'Imported LUT'};
}

export function tonemap(buffer,{mode='aces',exposure=1}={}){
 if(!['aces','filmic','reinhard','none'].includes(mode))throw Error('Unknown tonemap.');
 if(!Number.isFinite(exposure)||exposure<=0||exposure>16)throw Error('Invalid exposure.');
 const out=buffer.data.slice();
 for(let i=0;i<out.length;i+=4)for(let c=0;c<3;c++){let v=out[i+c]*exposure;
  if(mode==='reinhard')v=v/(1+v);else if(mode==='filmic'||mode==='aces'){v=Math.max(0,v);v=(v*(2.51*v+.03))/(v*(2.43*v+.59)+.14);}out[i+c]=Math.min(1,v);}
 return {width:buffer.width,height:buffer.height,data:out,aovs:buffer.aovs};
}

export function bloom(buffer,{threshold=.7,strength=.4}={}){
 const w=buffer.width,h=buffer.height,src=buffer.data;
 // Bright-pass: keep only the over-threshold excess energy.
 let bright=new Float32Array(w*h*4);
 for(let p=0;p<w*h;p++){const i=p*4;const lum=.2126*src[i]+.7152*src[i+1]+.0722*src[i+2];
  if(lum>threshold){const k=(lum-threshold)/Math.max(1e-6,lum);bright[i]=src[i]*k;bright[i+1]=src[i+1]*k;bright[i+2]=src[i+2]*k;}}
 // Separable binomial blur [1,4,6,4,1]/16, two iterations for reach.
 const K=[1,4,6,4,1];
 const blurPass=(input)=>{
  const tmp=new Float32Array(input),res=new Float32Array(input.length);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){let acc=0;
   for(let t=-2;t<=2;t++){const xx=Math.min(w-1,Math.max(0,x+t));acc+=input[(y*w+xx)*4+c]*K[t+2];}
   tmp[(y*w+x)*4+c]=acc/16;}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){let acc=0;
   for(let t=-2;t<=2;t++){const yy=Math.min(h-1,Math.max(0,y+t));acc+=tmp[(yy*w+x)*4+c]*K[t+2];}
   res[(y*w+x)*4+c]=acc/16;}
  return res;
 };
 bright=blurPass(blurPass(bright));
 const out=src.slice();
 for(let i=0;i<out.length;i+=4)for(let c=0;c<3;c++)out[i+c]=src[i+c]+bright[i+c]*strength;
 return {width:w,height:h,data:out,aovs:buffer.aovs};
}

export function filmGrain(buffer,{amount=.05,seed=1}={}){
 let s=seed>>>0||1;const rnd=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
 const out=buffer.data.slice();for(let i=0;i<out.length;i+=4){const g=(rnd()-.5)*2*amount;out[i]+=g;out[i+1]+=g;out[i+2]+=g;}
 return {width:buffer.width,height:buffer.height,data:out,aovs:buffer.aovs};
}

export function vignette(buffer,{amount=.4}={}){
 const out=buffer.data.slice(),w=buffer.width,h=buffer.height,cx=w/2,cy=h/2,maxd=Math.hypot(cx,cy);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const d=Math.hypot(x-cx,y-cy)/maxd,f=1-amount*d*d,i=(y*w+x)*4;out[i]*=f;out[i+1]*=f;out[i+2]*=f;}
 return {width:w,height:h,data:out,aovs:buffer.aovs};
}

export function chromaticAberration(buffer,{amount=.003}={}){
 const w=buffer.width,h=buffer.height,src=buffer.data,out=src.slice();
 // Radial: red samples farther from center, blue nearer (both axes).
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const u=x/w-.5,v=y/h-.5,i=(y*w+x)*4;
  const xr=Math.min(w-1,Math.max(0,Math.round((u*(1+amount)+.5)*w))),xb=Math.min(w-1,Math.max(0,Math.round((u*(1-amount)+.5)*w)));
  const yr=Math.min(h-1,Math.max(0,Math.round((v*(1+amount)+.5)*h))),yb=Math.min(h-1,Math.max(0,Math.round((v*(1-amount)+.5)*h)));
  out[i]=src[(yr*w+xr)*4];out[i+2]=src[(yb*w+xb)*4+2];}
 return {width:w,height:h,data:out,aovs:buffer.aovs};
}

export function sharpen(buffer,{amount=.5}={}){
 const w=buffer.width,h=buffer.height,src=buffer.data,out=src.slice();
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=(y*w+x)*4;
  for(let c=0;c<3;c++){const c0=src[i+c],blur=(src[i-4+c]+src[i+4+c]+src[i-w*4+c]+src[i+w*4+c])*.25;out[i+c]=c0+(c0-blur)*amount;}}
 return {width:w,height:h,data:out,aovs:buffer.aovs};
}

export function denoisePass(buffer,{strength=.5}={}){
 const w=buffer.width,h=buffer.height,src=buffer.data,out=src.slice();
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=(y*w+x)*4;
  for(let c=0;c<3;c++){const avg=(src[i+c]+src[i-4+c]+src[i+4+c]+src[i-w*4+c]+src[i+w*4+c])/5;out[i+c]=src[i+c]*(1-strength)+avg*strength;}}
 return {width:w,height:h,data:out,aovs:buffer.aovs};
}

export function zDepthFog(buffer,{density=.02,color=[.7,.8,.9]}={}){
 const z=buffer.aovs?.depth;if(!z)throw Error('Depth AOV required for fog.');
 const out=buffer.data.slice();
 for(let i=0,p=0;i<out.length;i+=4,p++){const f=1-Math.exp(-Math.max(0,z[p])*density);out[i]=out[i]*(1-f)+color[0]*f;out[i+1]=out[i+1]*(1-f)+color[1]*f;out[i+2]=out[i+2]*(1-f)+color[2]*f;}
 return {width:buffer.width,height:buffer.height,data:out,aovs:buffer.aovs};
}

function boxBlur3(data,w,h){
 const out=new Float32Array(data.length);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;
  for(let c=0;c<3;c++){let acc=0;
   for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
    const xx=Math.min(w-1,Math.max(0,x+ox)),yy=Math.min(h-1,Math.max(0,y+oy));
    acc+=data[(yy*w+xx)*4+c];}
   out[i+c]=acc/9;}
  out[i+3]=data[i+3];}
 return out;
}

export function defocusDof(buffer,{focus=.5,blur=1}={}){
 const depth=buffer.aovs?.depth;if(!depth)throw Error('Depth AOV required for DOF.');
 // Circle-of-confusion mix: pixels at the focus depth stay sharp, others
 // blend toward a blurred image in proportion to |depth - focus| * blur.
 const blurred=boxBlur3(boxBlur3(buffer.data,buffer.width,buffer.height),buffer.width,buffer.height);
 const src=buffer.data,out=src.slice();
 for(let p=0;p<depth.length;p++){
  const f=Math.min(1,Math.abs(depth[p]-focus)*Math.abs(blur));
  if(f<=0)continue;
  const i=p*4;
  for(let c=0;c<3;c++)out[i+c]=src[i+c]*(1-f)+blurred[i+c]*f;
 }
 return {width:buffer.width,height:buffer.height,data:out,aovs:buffer.aovs};
}

export function vectorBlur(buffer,{amount=.5}={}){
 const vec=buffer.aovs?.vector;if(!vec)throw Error('Motion vector AOV required.');
 // Directional smear: average 5 taps along the per-pixel motion vector
 // (vector units are pixels at amount = 1). Zero vector = identity.
 const w=buffer.width,h=buffer.height,src=buffer.data,out=new Float32Array(src.length);
 const taps=[-1,-.5,0,.5,1];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=y*w+x,i=p*4;
  const vx=vec[p*2]*amount,vy=vec[p*2+1]*amount;
  for(let c=0;c<4;c++){let acc=0;
   for(const t of taps){
    const xx=Math.min(w-1,Math.max(0,Math.round(x+vx*t))),yy=Math.min(h-1,Math.max(0,Math.round(y+vy*t)));
    acc+=src[(yy*w+xx)*4+c];}
   out[i+c]=acc/taps.length;}
 }
 return {width:w,height:h,data:out,aovs:buffer.aovs};
}

export function cryptomatteMask(buffer,id){
 const ids=buffer.aovs?.cryptomatte;if(!ids)throw Error('Cryptomatte AOV missing.');
 const mask=new Float32Array(buffer.width*buffer.height);
 for(let i=0;i<mask.length;i++)mask[i]=ids[i]===id?1:0;
 return {width:buffer.width,height:buffer.height,data:mask,id};
}

export function keyingMatte(buffer,{key=[0,1,0],tolerance=.3}={}){
 const out=new Float32Array(buffer.width*buffer.height);
 for(let i=0,p=0;i<buffer.data.length;i+=4,p++){const d=Math.hypot(buffer.data[i]-key[0],buffer.data[i+1]-key[1],buffer.data[i+2]-key[2]);out[p]=d<tolerance?0:1;}
 return {width:buffer.width,height:buffer.height,data:out,kind:'key'};
}

export function rotoShape(width,height,points){
 if(!Array.isArray(points)||points.length<3)throw Error('Roto needs 3+ UV points.');
 const data=new Float32Array(width*height);
 // Even-odd point-in-polygon rasterization at pixel centers (points are UV).
 const inside=(u,v)=>{
  let c=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
   const [xi,yi]=points[i],[xj,yj]=points[j];
   if(((yi>v)!==(yj>v))&&(u<(xj-xi)*(v-yi)/((yj-yi)||1e-12)+xi))c=!c;
  }
  return c;
 };
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const u=(x+.5)/width,v=(y+.5)/height;
  if(inside(u,v))data[y*width+x]=1;
 }
 return {width,height,data,kind:'roto'};
}

export function stabilizeTransform(track=[[0,0],[.01,0],[.02,.01]]){
 if(!Array.isArray(track)||track.length<2)throw Error('Track needs 2+ points.');
 const dx=-track.at(-1)[0]+track[0][0],dy=-track.at(-1)[1]+track[0][1];
 return {translate:[dx,dy],rotate:0,scale:1,kind:'stabilize'};
}

export function matchmoveCamera(tracks){
 if(!Array.isArray(tracks)||tracks.length<4)throw Error('Matchmove needs 4+ tracks.');
 // Honest stub diagnostics: a real solve needs per-frame 2D tracks plus
 // intrinsics and a bundle adjustment, which this build does not perform.
 // Report the track statistics instead of fabricating a solved camera.
 let cx=0,cy=0;for(const [x,y] of tracks){cx+=x;cy+=y;}
 cx/=tracks.length;cy/=tracks.length;
 let spread=0;for(const [x,y] of tracks)spread=Math.max(spread,Math.hypot(x-cx,y-cy));
 return {version:1,kind:'matchmove',solved:false,quality:'insufficient',
  reason:'Matchmove requires per-frame tracks and camera intrinsics; returning track diagnostics only.',
  diagnostics:{trackCount:tracks.length,centroid:[cx,cy],maxSpread:spread},
  camera:null,tracks:tracks.length};
}

export function processImageSequence(frames,{op='average'}={}){
 if(!Array.isArray(frames)||frames.length<1||frames.length>256)throw Error('Sequence 1–256 frames.');
 if(op==='hold')return frames[0];
 if(op!=='average')throw Error('Unsupported sequence op.');
 const base=frames[0],out=base.data.slice();
 for(let f=1;f<frames.length;f++)for(let i=0;i<out.length;i++)out[i]+=frames[f].data[i];
 for(let i=0;i<out.length;i++)out[i]/=frames.length;
 return {width:base.width,height:base.height,data:out,aovs:base.aovs};
}

export function createPostVolume({bloom=0,vignette=0,grain=0,exposure=1}={}){
 return {version:1,kind:'post_volume',bloom,vignette,grain,exposure};
}

export function applyPostVolume(buffer,vol){
 let img=buffer;if(vol.exposure!==1)img=tonemap(img,{mode:'none',exposure:vol.exposure});
 if(vol.bloom>0)img=bloom(img,{strength:vol.bloom});if(vol.vignette>0)img=vignette(img,{amount:vol.vignette});
 if(vol.grain>0)img=filmGrain(img,{amount:vol.grain});return img;
}

export function mixAovs(beauty,aovBuffer,{opacity=.5}={}){
 const out=beauty.data.slice();
 for(let i=0;i<out.length;i+=4){out[i]=out[i]*(1-opacity)+aovBuffer.data[i]*opacity;out[i+1]=out[i+1]*(1-opacity)+aovBuffer.data[i+1]*opacity;out[i+2]=out[i+2]*(1-opacity)+aovBuffer.data[i+2]*opacity;}
 return {width:beauty.width,height:beauty.height,data:out,aovs:beauty.aovs};
}

export function evaluateCompositor(tree,inputs={}){
 let img=inputs.beauty||createImageBuffer(64,64,[.2,.25,.3,1]);
 if(inputs.aovs)img=attachAovs(img,inputs.aovs);
 // Evaluate in link (topological) order, stable by insertion; a link cycle
 // is an authoring error and throws instead of silently mis-ordering.
 const ids=new Set(tree.nodes.map(n=>n.id));
 const indegree=new Map(tree.nodes.map(n=>[n.id,0]));
 const followers=new Map(tree.nodes.map(n=>[n.id,[]]));
 for(const link of tree.links||[]){
  if(!ids.has(link.from)||!ids.has(link.to))continue;
  followers.get(link.from).push(link.to);
  indegree.set(link.to,indegree.get(link.to)+1);
 }
 const byId=new Map(tree.nodes.map(n=>[n.id,n]));
 const order=[],ready=tree.nodes.filter(n=>indegree.get(n.id)===0);
 while(ready.length){
  const node=ready.shift();order.push(node);
  for(const to of followers.get(node.id)){
   indegree.set(to,indegree.get(to)-1);
   if(indegree.get(to)===0)ready.push(byId.get(to));
  }
 }
 if(order.length!==tree.nodes.length)throw Error('Compositor graph has a cycle.');
 for(const node of order){if(node.muted)continue;
  switch(node.type){
   case 'color_balance':img=liftGammaGain(img,node.params);break;
   case 'curve':img=applyToneCurve(img,node.params.curve);break;
   case 'lut':img=applyLut(img,node.params.lut||tree.lut||createLut());break;
   case 'tonemap':img=tonemap(img,node.params);break;
   case 'glare':img=bloom(img,node.params);img=filmGrain(img,{amount:node.params.grain||0});break;
   case 'vignette':img=vignette(img,node.params);break;
   case 'chromatic_aberration':img=chromaticAberration(img,node.params);break;
   case 'sharpen':img=sharpen(img,node.params);break;
   case 'denoise':img=denoisePass(img,node.params);break;
   case 'fog':img=zDepthFog(img,node.params);break;
   case 'defocus':img=defocusDof(img,node.params);break;
   case 'vector_blur':img=vectorBlur(img,node.params);break;
   case 'post_volume':img=applyPostVolume(img,createPostVolume(node.params));break;
   case 'relight':if(inputs.relight)img=mixAovs(img,inputs.relight,{opacity:node.params.opacity??.4});break;
   case 'sequence':if(inputs.sequence)img=processImageSequence(inputs.sequence,node.params);break;
   default:break;
  }
 }
 tree._output=img;return img;
}

export function createDefaultCompTree(){
 const tree=createCompTree();setColorManagement(tree,{space:'ACES'});
 addCompNode(tree,'render_layers');addCompNode(tree,'denoise',{strength:.4});addCompNode(tree,'color_balance',{lift:[0,0,0],gamma:[1,1,1],gain:[1.05,1,1]});
 addCompNode(tree,'glare',{threshold:.75,strength:.35,grain:.02});addCompNode(tree,'vignette',{amount:.35});addCompNode(tree,'tonemap',{mode:'aces',exposure:1});
 addCompNode(tree,'composite');tree.lut=createLut(16,{contrast:1.05});return tree;
}
