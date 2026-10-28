// A31 AI-assisted tools (local preview stubs — no cloud model calls).

const uid=()=>'ai'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);

export function textToMesh({prompt='',seed=1,verts=200}={}){
  if(!prompt||typeof prompt!=='string')throw Error('Prompt required.');
  let s=seed>>>0;const rnd=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
  const positions=new Float32Array(verts*3);for(let i=0;i<verts;i++){const th=rnd()*Math.PI*2,ph=rnd()*Math.PI;positions[i*3]=Math.sin(ph)*Math.cos(th);positions[i*3+1]=Math.cos(ph);positions[i*3+2]=Math.sin(ph)*Math.sin(th);}
  return {version:1,kind:'text_to_3d',prompt,seed,positions,id:uid()};
}

export function imageToMesh({width=64,height=64,seed=2}={}){
  if(width<8||height<8)throw Error('Image too small.');
  return {version:1,kind:'image_to_3d',width,height,seed,verts:width*height/16|0,id:uid()};
}

export function aiGenerateMaterial({prompt='rusty metal',seed=3}={}){
  let s=seed;const rnd=()=>{s=(s*1103515245+12345)&0x7fffffff;return (s%1000)/1000;};
  return {version:1,kind:'ai_material',prompt,baseColor:[rnd(),rnd(),rnd()],metalness:rnd(),roughness:rnd(),maps:['albedo','roughness','normal']};
}

export function aiAutoRetopo(mesh,{target=1000}={}){
  return {version:1,kind:'ai_retopo',sourceVerts:mesh.positions?.length/3|0,targetQuads:target,id:uid()};
}

export function aiAutoUv(mesh,{islands=4}={}){
  return {version:1,kind:'ai_uv',islands,coverage:.85,verts:mesh.positions?.length/3|0};
}

export function aiAutoRig(mesh,{template='biped'}={}){
  return {version:1,kind:'ai_rig',template,bones:template==='biped'?22:16,weightsBound:'preview'};
}

export function aiDenoise({samples=64,strength=.5}={}){
  return {version:1,kind:'ai_denoise',samples,strength,mode:'oidn_lite'};
}

export function aiUpscale({width=512,height=512,scale=2}={}){
  return {version:1,kind:'ai_upscale',in:[width,height],out:[width*scale,height*scale],scale};
}

export function aiMotionGenerate({frames=24,style='walk'}={}){
  return {version:1,kind:'ai_motion',frames,style,curves:['hips','spine','l_leg','r_leg']};
}

export function aiMocapCleanup(curve,{smooth=.5}={}){
  if(!Array.isArray(curve)||curve.length<2)throw Error('Curve required.');
  const out=curve.map((v,i)=>{if(i===0||i===curve.length-1)return v;return v*(1-smooth)+((curve[i-1]+curve[i+1])/2)*smooth;});
  return {version:1,kind:'mocap_cleanup',samples:out.length,out};
}

export function audioToFace({duration=1,fps=30}={}){
  const frames=Math.ceil(duration*fps);const visemes=[];for(let i=0;i<frames;i++)visemes.push({t:i/fps,jaw:Math.abs(Math.sin(i*.4))*.4,mouth:Math.abs(Math.sin(i*.7))*.3});
  return {version:1,kind:'audio_to_face',frames,visemes};
}

export function aiRotoMask({width=64,height=64,seed=1}={}){
  const mask=new Uint8Array(width*height);let s=seed;for(let i=0;i<mask.length;i++){s=(s*1664525+1013904223)>>>0;mask[i]=s%100>60?255:0;}
  return {version:1,kind:'ai_roto',width,height,mask,coverage:mask.reduce((a,b)=>a+(b>0),0)/mask.length};
}

export function aiSceneScatter({count=20,prompt='forest props'}={}){
  const items=[];for(let i=0;i<count;i++)items.push({id:uid(),prompt,position:[(Math.random()-.5)*10,0,(Math.random()-.5)*10]});
  return {version:1,kind:'ai_scatter',count,items};
}

export function aiGaussianCapture({views=12}={}){
  return {version:1,kind:'ai_gs_capture',views,splats:views*500,status:'preview'};
}

export function neuralViewportPreview({res=256,spp=1}={}){
  return {version:1,kind:'neural_viewport',res,spp,latencyMs:12};
}

export function nlCommandParse(text){
  if(typeof text!=='string'||!text.trim())throw Error('Command required.');
  const lower=text.toLowerCase();
  let intent='unknown',args={};
  if(lower.includes('extrude'))intent='mesh.extrude';
  else if(lower.includes('subdivide'))intent='mesh.subdivide';
  else if(lower.includes('render'))intent='render.still';
  else if(lower.includes('animate'))intent='anim.key';
  const n=text.match(/(\d+(\.\d+)?)/);if(n)args.amount=Number(n[1]);
  return {version:1,kind:'nl_command',text,intent,args};
}

export function smartSelectSegments(mesh,{segments=4}={}){
  const verts=mesh.positions.length/3|0;const labels=new Int32Array(verts);
  for(let i=0;i<verts;i++)labels[i]=i%segments;
  return {version:1,kind:'smart_select',segments,labels};
}
