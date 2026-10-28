// A30 motion graphics / cloner / grease pencil previews.

const uid=()=>'mg'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);

export function createCloner({count=8,mode='linear',spacing=1}={}){
  if(!['linear','radial','grid','object'].includes(mode))throw Error('cloner mode.');
  const instances=[];
  for(let i=0;i<count;i++){
    const p=mode==='radial'?[Math.cos(i/count*Math.PI*2)*spacing,0,Math.sin(i/count*Math.PI*2)*spacing]:mode==='grid'?[i%3*spacing,0,Math.floor(i/3)*spacing]:[i*spacing,0,0];
    instances.push({i,position:p,scale:[1,1,1],weight:1});
  }
  return {version:1,kind:'cloner',mode,instances,effectors:[]};
}

export function createEffector({type='plain',strength=1,radius=2}={}){
  if(!['plain','random','shader','delay','formula'].includes(type))throw Error('effector.');
  return {version:1,kind:'effector',type,strength,radius,id:uid()};
}

export function applyEffector(cloner,effector){
  for(const inst of cloner.instances){
    const d=Math.hypot(...inst.position);const w=Math.max(0,1-d/(effector.radius||1));
    inst.weight=w;inst.scale=inst.scale.map(s=>s*(1+effector.strength*w*.5));
  }
  cloner.effectors.push(effector.id);return cloner;
}

export function createField({type='spherical',radius=2,position=[0,0,0]}={}){
  return {version:1,kind:'field',type,radius,position,falloff:'smooth'};
}

export function sampleField(field,point){
  const d=Math.hypot(point[0]-field.position[0],point[1]-field.position[1],point[2]-field.position[2]);
  return Math.max(0,1-d/field.radius);
}

export function createText3d({text='FUSION',depth=.2,bevel=.02}={}){
  return {version:1,kind:'text3d',text,depth,bevel,chars:[...text].map((c,i)=>({c,i,offset:[i*.6,0,0]}))};
}

export function animateTextChars(text3d,{t=0,mode='wave'}={}){
  for(const ch of text3d.chars)ch.offset[1]=mode==='wave'?Math.sin(t+ch.i*.4)*.2:0;
  return text3d;
}

export function importSvgPaths(svgText){
  if(typeof svgText!=='string')throw Error('SVG string required.');
  const paths=[...svgText.matchAll(/d="([^"]+)"/g)].map(m=>m[1]);
  return {version:1,kind:'svg_import',paths,count:paths.length};
}

export function createGreasePencil({name='GP'}={}){
  return {version:1,kind:'grease_pencil',name,strokes:[],layers:[{name:'Lines',visible:true}]};
}

export function addGreaseStroke(gp,points,{thickness=2,color=[0,0,0]}={}){
  if(!Array.isArray(points)||points.length<2)throw Error('Stroke needs 2+ points.');
  const s={id:uid(),points,thickness,color};gp.strokes.push(s);return s;
}

export function createToonOutline({width=1.5,color=[0,0,0]}={}){
  return {version:1,kind:'toon_outline',width,color};
}

export function createMographPreset({name='orbit'}={}){
  const presets={orbit:{cloner:'radial',effector:'plain'},wave:{cloner:'linear',effector:'formula'},scatter:{cloner:'grid',effector:'random'}};
  if(!presets[name])throw Error('Unknown preset.');
  return {version:1,kind:'mograph_preset',name,...presets[name]};
}

export function audioReactiveDrive({spectrum=[.1,.5,.2,.8],band=1}={}){
  const v=spectrum[band]??0;return {version:1,kind:'audio_reactive',value:v,scale:1+v,band};
}

export function createMetaballs({balls=[[0,0,0,1],[1,0,0,1]],threshold=.5,res=16}={}){
  const field=new Float32Array(res**3);
  for(let z=0;z<res;z++)for(let y=0;y<res;y++)for(let x=0;x<res;x++){
    let v=0;const p=[x/(res-1)*2-1,y/(res-1)*2-1,z/(res-1)*2-1];
    for(const [bx,by,bz,r] of balls){const d=Math.hypot(p[0]-bx,p[1]-by,p[2]-bz);v+=r*r/(d*d+1e-6);}
    field[x+y*res+z*res*res]=v;
  }
  let inside=0;for(const v of field)if(v>=threshold)inside++;
  return {version:1,kind:'metaballs',res,threshold,field,inside};
}

export function createCameraMap25d({imageSize=[1920,1080],planes=3}={}){
  return {version:1,kind:'cam_map_25d',imageSize,planes:Array.from({length:planes},(_,i)=>({z:-i*.5,opacity:1}))};
}

export function createPatternGenerator({type='tiles',n=8}={}){
  if(!['tiles','dots','stripes','voronoi','hex'].includes(type))throw Error('pattern.');
  const cells=[];for(let i=0;i<n;i++)for(let j=0;j<n;j++)cells.push({i,j,u:i/n,v:j/n});
  return {version:1,kind:'pattern',type,cells};
}
