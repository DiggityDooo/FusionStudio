// Remaining A8 texture authoring: Substance-like graph, stitch/delight, photo-mat, virtual textures.
const uid=()=>'tx'+crypto.randomUUID();

export function createSubstanceGraph({nodes,edges,seed=1}={}){
  const defaults=[
    {type:'noise',params:{scale:4}},
    {type:'blend',params:{opacity:.5}},
    {type:'levels',params:{inLow:0,inHigh:1}},
    {type:'output',params:{channel:'baseColor'}},
  ];
  const list=(nodes||defaults).map((n,i)=>({id:uid(),name:`${n.type}_${i}`,...n}));
  return {version:1,kind:'substance_graph',seed,nodes:list,edges:edges?structuredClone(edges):list.slice(0,-1).flatMap((n,i)=>['blend','levels','output'].includes(list[i+1].type)?[{from:n.id,to:list[i+1].id}]:[])};
}

const GRAPH_TYPES=new Set(['constant','color','gradient','checker','noise','blend','levels','output']);
const clamp=v=>Math.min(1,Math.max(0,v));
function graphColor(value=[1,1,1,1]){
  if(typeof value==='string'&&/^#[\da-f]{6}$/i.test(value)){const n=parseInt(value.slice(1),16);return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255,1];}
  if(typeof value==='number')value=[value,value,value,1];
  if(!Array.isArray(value)||![3,4].includes(value.length)||value.some(v=>!Number.isFinite(v)||v<0||v>1))throw Error('Texture graph colors must be #rrggbb or normalized RGB(A).');
  return [...value.slice(0,3),value[3]??1];
}
function valueNoise(x,y,seed){
  const hash=(x,y)=>{let n=(Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(seed,69069))|0;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
  const ix=Math.floor(x),iy=Math.floor(y),u=x-ix,v=y-iy,s=u*u*(3-2*u),t=v*v*(3-2*v),a=hash(ix,iy)*(1-s)+hash(ix+1,iy)*s,b=hash(ix,iy+1)*(1-s)+hash(ix+1,iy+1)*s;
  return a*(1-t)+b*t;
}

// Original bounded CPU preview subset, not a Substance/MaterialX file reader.
// Dependencies and unsupported nodes fail explicitly instead of returning a dummy image.
export function evaluateSubstanceGraph(graph,{size=64,output}={}){
  if(!Number.isInteger(size)||size<1||size>1024)throw Error('Texture graph preview size must be 1–1024 pixels.');
  if(graph?.version!==1||!Array.isArray(graph.nodes)||!graph.nodes.length||graph.nodes.length>64||!Array.isArray(graph.edges)||graph.edges.length>256)throw Error('Texture graph requires 1–64 nodes and at most 256 edges.');
  if(size*size*graph.nodes.length>4194304)throw Error('Texture graph exceeds four million node/pixel samples. Reduce the preview size or graph.');
  const nodes=new Map(),inputs=new Map(),plans=new Map();
  const number=(v,fallback,min,max)=>{const n=v??fallback;if(!Number.isFinite(n)||n<min||n>max)throw Error('Texture graph parameter is outside its supported bounds.');return n;};
  for(const node of graph.nodes){
    if(typeof node?.id!=='string'||!node.id.length||node.id.length>128||nodes.has(node.id))throw Error('Texture graph node IDs must be unique.');
    if(!GRAPH_TYPES.has(node.type))throw Error(`Unsupported texture graph node ${node.id}: ${node.type}.`);
    if(node.params!==undefined&&(!node.params||typeof node.params!=='object'||Array.isArray(node.params)))throw Error('Texture graph node parameters must be an object.');
    const p=node.params||{},plan={...p};
    if(['constant','color'].includes(node.type))plan.color=graphColor(p.color??p.value);
    if(['noise','checker'].includes(node.type))plan.scale=number(p.scale,4,.001,512);
    if(node.type==='noise'){plan.seed=number(p.seed,graph.seed??1,0,4294967295);if(!Number.isInteger(plan.seed))throw Error('Texture noise seed must be an integer.');}
    if(node.type==='gradient'){plan.axis=p.axis??'x';if(!['x','y'].includes(plan.axis))throw Error('Gradient axis must be x or y.');}
    if(node.type==='checker'){plan.a=graphColor(p.a??0);plan.b=graphColor(p.b??1);}
    if(node.type==='blend'){plan.opacity=number(p.opacity,1,0,1);plan.mode=p.mode??'normal';plan.color=graphColor(p.color);if(!['normal','multiply','add','screen','overlay'].includes(plan.mode))throw Error('Unsupported texture blend mode.');}
    if(node.type==='levels'){for(const [key,fallback,min,max]of [['inLow',0,0,1],['inHigh',1,0,1],['outLow',0,0,1],['outHigh',1,0,1],['gamma',1,.01,100]])plan[key]=number(p[key],fallback,min,max);if(plan.inHigh<=plan.inLow)throw Error('Texture levels require inHigh > inLow.');}
    nodes.set(node.id,node);inputs.set(node.id,new Map());plans.set(node.id,plan);
  }
  for(const edge of graph.edges){
    if(!nodes.has(edge?.from)||!nodes.has(edge.to))throw Error('Texture graph link endpoint is missing.');
    const node=nodes.get(edge.to),ports=inputs.get(edge.to),blend=node.type==='blend';
    if(!blend&&!['levels','output'].includes(node.type))throw Error('Texture source nodes do not accept inputs.');
    let port=edge.toSocket??edge.input;
    if(port===undefined)port=blend?(ports.has('a')?'b':'a'):'input';
    if(blend)port=({background:'a',foreground:'b',input:'a'})[port]||port;
    if(!(blend?['a','b']:['input']).includes(port)||ports.has(port))throw Error('Texture graph input is unknown or connected twice: '+node.id+'.'+port);
    ports.set(port,edge.from);
  }
  const ordered=[],active=new Set(),visited=new Set();
  function visit(id){if(active.has(id))throw Error('Texture graph dependency cycle at '+id+'.');if(visited.has(id))return;active.add(id);for(const parent of inputs.get(id).values())visit(parent);active.delete(id);visited.add(id);ordered.push(id);}
  for(const id of nodes.keys())visit(id);
  const outputs=graph.nodes.filter(n=>n.type==='output');
  if(output===undefined&&outputs.length>1)throw Error('Choose an output node for a graph with multiple outputs.');
  const selected=output??outputs[0]?.id??ordered.at(-1);if(!nodes.has(selected))throw Error('Texture output node is missing.');
  for(const id of ordered)if(['levels','output'].includes(nodes.get(id).type)&&!inputs.get(id).has('input'))throw Error('Texture node '+id+' requires an input.');
  const buffers=new Map();
  for(const id of ordered){
    const node=nodes.get(id),p=plans.get(id),ports=inputs.get(id),input=buffers.get(ports.get('input'));
    if(node.type==='output'){buffers.set(id,input);continue;}
    const buffer=new Float32Array(size*size*4),a=buffers.get(ports.get('a')),b=buffers.get(ports.get('b'));
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const i=(y*size+x)*4,u=(x+.5)/size,v=(y+.5)/size;
      if(['constant','color'].includes(node.type))buffer.set(p.color,i);
      else if(['gradient','noise','checker'].includes(node.type)){
        const val=node.type==='noise'?valueNoise(u*p.scale,v*p.scale,p.seed):node.type==='gradient'?(p.axis==='x'?u:v):0;
        const color=node.type==='checker'?((Math.floor(u*p.scale)+Math.floor(v*p.scale))%2?p.b:p.a):[val,val,val,1];buffer.set(color,i);
      }else if(node.type==='levels'){
        for(let c=0;c<3;c++)buffer[i+c]=p.outLow+Math.pow(clamp((input[i+c]-p.inLow)/(p.inHigh-p.inLow)),1/p.gamma)*(p.outHigh-p.outLow);buffer[i+3]=input[i+3];
      }else if(node.type==='blend'){
        const alpha=p.opacity*(b?b[i+3]:p.color[3]),baseAlpha=a?a[i+3]:1,outAlpha=baseAlpha+(1-baseAlpha)*alpha;
        for(let c=0;c<3;c++){const base=a?a[i+c]:0,top=b?b[i+c]:p.color[c];let mixed=top;
          if(p.mode==='multiply')mixed=base*top;else if(p.mode==='add')mixed=base+top;else if(p.mode==='screen')mixed=1-(1-base)*(1-top);else if(p.mode==='overlay')mixed=base<.5?2*base*top:1-2*(1-base)*(1-top);
          buffer[i+c]=outAlpha?clamp((((1-baseAlpha)*top+baseAlpha*mixed)*alpha+base*baseAlpha*(1-alpha))/outAlpha):0;
        }buffer[i+3]=outAlpha;
      }
    }buffers.set(id,buffer);
  }
  const pixels=Uint8ClampedArray.from(buffers.get(selected),v=>Math.round(clamp(v)*255)),channel=plans.get(selected).channel??'baseColor';
  return {size,pixels,nodes:graph.nodes.length,output:selected,channel,colorSpace:['baseColor','emissive'].includes(channel)?'srgb':'linear',diagnostics:{backend:'bounded CPU preview',evaluatedNodes:ordered.length}};
}

export function textureStitch(images=[],{sharpen=true,delight=true}={}){
  if(!Array.isArray(images))throw Error('images');
  return {version:1,kind:'tex_ops',ops:['stitch',...(sharpen?['sharpen']:[]),...(delight?['delight']:[])],count:images.length,seamless:true};
}

export function photoToMaterial(photos=[],{maps=['albedo','normal','roughness']}={}){
  if(!Array.isArray(photos)||photos.length<1)throw Error('need photos');
  return {version:1,kind:'photo_mat',photos:photos.length,maps:[...maps],generated:maps.map(m=>({map:m,size:1024}))};
}

export function virtualTextureMips({size=4096,levels}={}){
  const n=levels??Math.max(1,Math.log2(size)|0);
  const mips=Array.from({length:n},(_,i)=>({level:i,size:Math.max(1,size>>i)}));
  return {version:1,kind:'vt_mips',size,levels:n,mips,streaming:true};
}

export function projectionCloneStroke(doc,{from=[.2,.2],to=[.5,.5],radius=.05}={}){
  return {version:1,kind:'clone_stroke',from,to,radius,docSize:doc?.size||0};
}
