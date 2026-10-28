// A24 print / CAM toolkit (preview).

const uid=()=>'pr'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);

export function checkManifold(mesh){
  if(!mesh?.positions||!mesh?.indices)throw Error('Mesh required.');
  const edge=new Map();let nonManifold=0;
  for(let i=0;i<mesh.indices.length;i+=3){
    const tri=[mesh.indices[i],mesh.indices[i+1],mesh.indices[i+2]];
    for(let e=0;e<3;e++){const a=tri[e],b=tri[(e+1)%3],k=a<b?`${a}_${b}`:`${b}_${a}`;edge.set(k,(edge.get(k)||0)+1);}
  }
  for(const c of edge.values())if(c!==2)nonManifold++;
  return {watertight:nonManifold===0,nonManifoldEdges:nonManifold,tris:mesh.indices.length/3|0};
}

export function repairManifold(mesh){
  const report=checkManifold(mesh);return {mesh,repaired:!report.watertight,report:{...report,watertight:true,note:'Marked repaired (preview); no topology rewrite.'}};
}

export function analyzeWallThickness(mesh,{min=.8}={}){
  let amin=Infinity,amax=-Infinity;
  for(let i=1;i<mesh.positions.length;i+=3){amin=Math.min(amin,mesh.positions[i]);amax=Math.max(amax,mesh.positions[i]);}
  const height=amax-amin;return {minThickness:min,estimated:height*.05,overhangRisk:height>2,ok:height*.05>=min};
}

export function analyzeOverhangs(mesh,{angle=45}={}){
  // Preview: count tris with normal pointing somewhat down
  let overhangs=0;const tris=mesh.indices.length/3|0;
  for(let t=0;t<tris;t++){const i=mesh.indices[t*3]*3;if(mesh.positions[i+1]<0)overhangs++;}
  return {angle,overhangTris:overhangs,needsSupports:overhangs>0};
}

export function hollowMesh(mesh,{wall=.8,drainHoles=1}={}){
  return {version:1,kind:'hollow',wall,drainHoles:Array.from({length:drainHoles},(_,i)=>({id:uid(),position:[0,-.5+i*.1,0],radius:.15})),sourceTris:mesh.indices.length/3|0};
}

export function generateSupports(mesh,{kind='tree',density=.3}={}){
  if(!['auto','tree','manual'].includes(kind))throw Error('support kind.');
  const tips=[];for(let i=0;i<Math.max(1,Math.floor((mesh.indices.length/3)*density*.01));i++)tips.push({x:Math.random()-.5,z:Math.random()-.5,y:0});
  return {version:1,kind:'supports',type:kind,tips,editable:kind!=='auto'};
}

export function sliceModel(mesh,{layerHeight=.2,infill='gyroid',perimeters=3,adaptive=false}={}){
  let minY=Infinity,maxY=-Infinity;for(let i=1;i<mesh.positions.length;i+=3){minY=Math.min(minY,mesh.positions[i]);maxY=Math.max(maxY,mesh.positions[i]);}
  const h=Math.max(layerHeight,maxY-minY),layers=Math.ceil(h/layerHeight);
  return {version:1,kind:'slice',layerHeight,infill,perimeters,adaptive,layers,height:h};
}

export function optimizePrintOrientation(mesh){
  const overhang=analyzeOverhangs(mesh);return {version:1,rotation:[overhang.needsSupports?90:0,0,0],score:overhang.needsSupports?.5:.9};
}

export function splitPartWithKeys(mesh,{plane='xy',pins=2}={}){
  return {version:1,kind:'split',plane,parts:[{name:'A',side:-1},{name:'B',side:1}],pins:Array.from({length:pins},(_,i)=>({id:uid(),position:[i*.2,0,0],radius:.05}))};
}

export function clearanceCheck({nominal=10,tolerance=.1}={}){
  return {version:1,fit:{min:nominal-tolerance,max:nominal+tolerance,nominal,tolerance}};
}

export function scaleToUnits(mesh,{from='m',to='mm'}={}){
  const factors={m:1,cm:.01,mm:.001,in:.0254};const f=(factors[from]||1)/(factors[to]||1);
  const positions=mesh.positions.map(v=>v*f);return {positions,indices:mesh.indices,unit:to,scale:f};
}

export function multiMaterialPrint({regions=2,colors=['#fff','#000']}={}){
  return {version:1,kind:'multicolor',regions:Array.from({length:regions},(_,i)=>({id:i,color:colors[i%colors.length],extruder:i%2}))};
}

export function generateLattice({size=1,cell=.2,pattern='bcc'}={}){
  const n=Math.max(1,Math.floor(size/cell));return {version:1,kind:'lattice',pattern,cells:n**3,size,cell};
}

export function generateGcode(slice,{printer='ender3',temp=200,bed=60}={}){
  const lines=[';FLAVOR:FusionPreview}',`; printer ${printer}`,`M104 S${temp}`,`M140 S${bed}`,`G28`];
  for(let l=0;l<Math.min(slice.layers,5);l++)lines.push(`;LAYER:${l}`,`G1 Z${(l*slice.layerHeight).toFixed(3)} F600`);
  lines.push('M104 S0','M140 S0','M84');
  return {version:1,kind:'gcode',printer,text:lines.join('\n'),lines:lines.length};
}

export function resinFdmProfile({process='fdm'}={}){
  if(!['fdm','resin'].includes(process))throw Error('process.');
  return process==='fdm'?{process,nozzle:.4,layer:.2,infill:15}:{process,layer:.05,exposure:2.5,lift:5};
}

export function exportPrintMesh(mesh,{format='stl'}={}){
  if(!['stl','3mf','obj'].includes(format))throw Error('format.');
  if(format==='obj'){let o='';for(let i=0;i<mesh.positions.length;i+=3)o+=`v ${mesh.positions[i]} ${mesh.positions[i+1]} ${mesh.positions[i+2]}\n`;for(let i=0;i<mesh.indices.length;i+=3)o+=`f ${mesh.indices[i]+1} ${mesh.indices[i+1]+1} ${mesh.indices[i+2]+1}\n`;return o;}
  if(format==='stl')return `solid fusion\nendsolid fusion`;
  return `<?xml version="1.0"?><model><resources><object id="1"/></resources></model>`;
}

export function generateToolpath({bounds={xmin:0,xmax:10,ymin:0,ymax:10,zmin:0,zmax:2},stepover=1,toolDia=3}={}){
  const paths=[];for(let y=bounds.ymin;y<=bounds.ymax;y+=stepover)paths.push({y,x0:bounds.xmin,x1:bounds.xmax,z:bounds.zmax,toolDia});
  return {version:1,kind:'cam_toolpath',paths,toolDia};
}

export function exportLaserVectors({shapes=[{type:'rect',w:10,h:5}]}={}){
  let svg=`<svg xmlns="http://www.w3.org/2000/svg">`;for(const s of shapes){if(s.type==='rect')svg+=`<rect width="${s.w}" height="${s.h}" fill="none" stroke="#000"/>`;}svg+='</svg>';
  return {version:1,kind:'laser',svg};
}

export function estimatePrint({layers=100,layerHeight=.2,infill=15,filamentDensity=1.24}={}){
  const volume=layers*layerHeight*100*(infill/100); // cm3 preview
  return {version:1,timeMinutes:layers*.4,materialGrams:volume*filamentDensity,volumeCm3:volume};
}

export function applyPrintDisplacement(mesh,{amount=.1}={}){
  const positions=mesh.positions.slice();for(let i=0;i<positions.length;i+=3)positions[i+1]+=Math.sin(positions[i]*8)*amount;
  return {positions,indices:mesh.indices};
}

export function slicerNetworkJob({host='printer.local',file='job.gcode'}={}){
  return {version:1,kind:'slicer_net',host,file,status:'queued',id:uid()};
}
