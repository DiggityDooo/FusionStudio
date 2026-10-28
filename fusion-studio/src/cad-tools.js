// A3 CAD toolkit layered on the NURBS kernel — sketches, history, solids, I/O, analysis extras.
import {
  validateCurve,curvePoint,curveDerivative,curveLength,interpolateCurve,
  tessellateCurve,tessellateSurface,arcCurve,bezierCurve,surfacePoint,extrudeSurface,revolveSurface
} from './nurbs.js';

const uid=()=>'cad'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);

/** Join end-to-end curves into one interpolated polyline curve (G0). */
export function joinCurves(curves,{samples=24}={}){
  if(!Array.isArray(curves)||curves.length<2)throw Error('joinCurves needs 2+ curves.');
  const pts=[];
  for(let i=0;i<curves.length;i++){
    const c=validateCurve(curves[i]);
    for(let s=i===0?0:1;s<=samples;s++)pts.push(curvePoint(c,s/samples));
  }
  return interpolateCurve(pts,Math.min(3,pts.length-1));
}

/** Cubic Hermite blend between end of A and start of B. */
export function blendCurves(curveA,curveB,{tension=.5,samples=16}={}){
  const a=validateCurve(curveA),b=validateCurve(curveB);
  const p0=curvePoint(a,1),p1=curvePoint(b,0);
  let t0=curveDerivative(a,1),t1=curveDerivative(b,0);
  const n0=Math.hypot(...t0)||1,n1=Math.hypot(...t1)||1;
  t0=t0.map(v=>v/n0*tension);t1=t1.map(v=>v/n1*tension);
  const pts=[];
  for(let i=0;i<=samples;i++){
    const u=i/samples,u2=u*u,u3=u2*u;
    const h00=2*u3-3*u2+1,h10=u3-2*u2+u,h01=-2*u3+3*u2,h11=u3-u2;
    pts.push([0,1,2].map(ax=>h00*p0[ax]+h10*t0[ax]+h01*p1[ax]+h11*t1[ax]));
  }
  return interpolateCurve(pts,3);
}

/** Circular fillet between two lines meeting at an angle (planar XY). */
export function filletCurves(curveA,curveB,{radius=.25}={}){
  if(!(radius>0)||radius>10)throw Error('Invalid fillet radius.');
  const a=validateCurve(curveA),b=validateCurve(curveB);
  const corner=curvePoint(a,1),start=curvePoint(b,0);
  if(Math.hypot(corner[0]-start[0],corner[1]-start[1],corner[2]-start[2])>1e-4)throw Error('Curves must meet for fillet.');
  const tA=curveDerivative(a,1),tB=curveDerivative(b,0);
  const nA=Math.hypot(tA[0],tA[1])||1,nB=Math.hypot(tB[0],tB[1])||1;
  const uA=[tA[0]/nA,tA[1]/nA],uB=[tB[0]/nB,tB[1]/nB];
  const cos=Math.min(1,Math.max(-1,-(uA[0]*uB[0]+uA[1]*uB[1])));
  const ang=Math.acos(cos);
  if(ang<1e-3||ang>Math.PI-1e-3)throw Error('Fillet needs a corner angle.');
  const sweep=180-ang*180/Math.PI;
  const arc=arcCurve(radius,Math.min(180,Math.max(5,sweep)));
  // Place arc so endpoints sit near the corner (preview placement).
  const mid=[corner[0],corner[1],corner[2]];
  const placed={...arc,points:arc.points.map(p=>[p[0]+mid[0]-radius,p[1]+mid[1],p[2]+mid[2]])};
  return {fillet:placed,radius,sweep};
}

/** Zebra-stripe samples along U or V for surface continuity visualization. */
export function zebraStripes(surface,{stripes=12,axis='u',samples=48}={}){
  const out=[];
  for(let s=0;s<stripes;s++){
    const k=(s+.5)/stripes,line=[];
    for(let i=0;i<=samples;i++){
      const t=i/samples;
      const u=axis==='u'?k:t,v=axis==='u'?t:k;
      line.push(surfacePoint(surface,u,v));
    }
    out.push({index:s,points:line});
  }
  return out;
}

/** Untrim marker — clears UV polygon trim metadata. */
export function untrimSurface(surface){
  const s={...surface};delete s.trimPolygon;return s;
}

/** Surface fillet preview: blend strip between two surface edges (sampled). */
export function surfaceFillet(surfA,surfB,{radius=.1,samples=12}={}){
  const pts=[];
  for(let i=0;i<=samples;i++){
    const u=i/samples;
    const a=surfacePoint(surfA,u,1),b=surfacePoint(surfB,u,0);
    const m=[0,1,2].map(ax=>(a[ax]+b[ax])/2);
    m[1]+=radius;pts.push(m);
  }
  return interpolateCurve(pts,3);
}

// —— Sketch + constraints ——
export function createSketch({name='Sketch',plane='XY'}={}){
  return {version:1,id:uid(),name,plane,entities:[],constraints:[],solved:false};
}

export function addSketchEntity(sketch,type,params){
  if(!['line','circle','arc','point','rect'].includes(type))throw Error('Unknown sketch entity.');
  const e={id:uid(),type,params:{...params}};sketch.entities.push(e);sketch.solved=false;return e;
}

export function addSketchConstraint(sketch,type,refs,value){
  if(!['coincident','distance','horizontal','vertical','parallel','equal','fixed'].includes(type))throw Error('Unknown constraint.');
  if(!Array.isArray(refs)||!refs.length)throw Error('Constraint needs refs.');
  const c={id:uid(),type,refs:[...refs],value:value??null};sketch.constraints.push(c);sketch.solved=false;return c;
}

/** Very small constraint solver: applies distance/horizontal/vertical/coincident to point entities. */
export function solveSketch(sketch,{iterations=32}={}){
  const pts=new Map();
  for(const e of sketch.entities){
    if(e.type==='point')pts.set(e.id,{x:e.params.x||0,y:e.params.y||0});
    if(e.type==='line'){pts.set(e.id+':a',{x:e.params.x1||0,y:e.params.y1||0});pts.set(e.id+':b',{x:e.params.x2||0,y:e.params.y2||0});}
  }
  for(let iter=0;iter<iterations;iter++){
    for(const c of sketch.constraints){
      if(c.type==='fixed'){const p=pts.get(c.refs[0]);if(p&&c.value){p.x=c.value.x??p.x;p.y=c.value.y??p.y;}}
      if(c.type==='coincident'){const a=pts.get(c.refs[0]),b=pts.get(c.refs[1]);if(a&&b){const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;a.x=b.x=mx;a.y=b.y=my;}}
      if(c.type==='horizontal'){const a=pts.get(c.refs[0]),b=pts.get(c.refs[1]);if(a&&b){const my=(a.y+b.y)/2;a.y=b.y=my;}}
      if(c.type==='vertical'){const a=pts.get(c.refs[0]),b=pts.get(c.refs[1]);if(a&&b){const mx=(a.x+b.x)/2;a.x=b.x=mx;}}
      if(c.type==='distance'&&c.value!=null){const a=pts.get(c.refs[0]),b=pts.get(c.refs[1]);if(a&&b){
        const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1e-9,t=c.value/len;const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
        a.x=mx-dx*t/2;a.y=my-dy*t/2;b.x=mx+dx*t/2;b.y=my+dy*t/2;}}
    }
  }
  for(const e of sketch.entities){
    if(e.type==='point'){const p=pts.get(e.id);if(p){e.params.x=p.x;e.params.y=p.y;}}
    if(e.type==='line'){const a=pts.get(e.id+':a'),b=pts.get(e.id+':b');if(a&&b){e.params.x1=a.x;e.params.y1=a.y;e.params.x2=b.x;e.params.y2=b.y;}}
  }
  sketch.solved=true;return sketch;
}

export function sketchToCurves(sketch){
  const curves=[];
  for(const e of sketch.entities){
    if(e.type==='line')curves.push(bezierCurve([[e.params.x1,e.params.y1,0],[e.params.x1,e.params.y1,0],[e.params.x2,e.params.y2,0],[e.params.x2,e.params.y2,0]]));
    if(e.type==='circle')curves.push(arcCurve(e.params.r||1,360));
  }
  return curves;
}

// —— Feature tree / parametric history ——
export function createFeatureTree({name='Part'}={}){
  return {version:1,id:uid(),name,features:[],rebuildCount:0};
}

export function addFeature(tree,type,params={}){
  if(!['sketch','extrude','revolve','fillet','boolean','sheet','mirror','pattern'].includes(type))throw Error('Unknown feature.');
  const f={id:uid(),type,params:{...params},suppressed:false};tree.features.push(f);return f;
}

export function rebuildFeatureTree(tree,context={}){
  const solids=[];let sketch=context.sketch||null;
  for(const f of tree.features){
    if(f.suppressed)continue;
    if(f.type==='sketch')sketch=f.params.sketch||sketch;
    if(f.type==='extrude'&&f.params.curve)solids.push({kind:'extrude',surface:extrudeSurface(f.params.curve,[0,0,f.params.depth||1]),featureId:f.id});
    if(f.type==='revolve'&&f.params.curve)solids.push({kind:'revolve',surface:revolveSurface(f.params.curve,f.params.angle||360),featureId:f.id});
    if(f.type==='boolean'&&solids.length>=2){const r=brepBoolean(solids.at(-2).bbox||boxSolid(1),solids.at(-1).bbox||boxSolid(.5),f.params.op||'union');solids.push({kind:'boolean',result:r,featureId:f.id});}
  }
  tree.rebuildCount++;tree.lastSolids=solids;return tree;
}

// —— Assembly mates ——
export function createAssembly({name='Assembly'}={}){
  return {version:1,id:uid(),name,parts:[],mates:[]};
}

export function addAssemblyPart(asm,part){
  const p={id:uid(),name:part.name||'Part',transform:part.transform||[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],bbox:part.bbox||null};
  asm.parts.push(p);return p;
}

export function addMate(asm,type,aId,bId,params={}){
  if(!['coincident','concentric','distance','angle','parallel','lock'].includes(type))throw Error('Unknown mate.');
  if(!asm.parts.some(p=>p.id===aId)||!asm.parts.some(p=>p.id===bId))throw Error('Mate parts missing.');
  const m={id:uid(),type,a:aId,b:bId,params:{...params}};asm.mates.push(m);return m;
}

export function solveAssembly(asm){
  // Preview: coincident/distance mates nudge part B translation toward A.
  for(const m of asm.mates){
    const a=asm.parts.find(p=>p.id===m.a),b=asm.parts.find(p=>p.id===m.b);if(!a||!b)continue;
    if(m.type==='coincident'||m.type==='lock'){b.transform[12]=a.transform[12];b.transform[13]=a.transform[13];b.transform[14]=a.transform[14];}
    if(m.type==='distance'){b.transform[12]=a.transform[12]+(m.params.dx||m.params.distance||0);b.transform[13]=a.transform[13]+(m.params.dy||0);b.transform[14]=a.transform[14]+(m.params.dz||0);}
  }
  asm.solved=true;return asm;
}

// —— Sheet metal ——
export function createSheetMetal({length=2,width=1,thickness=.05,bendAngle=90,bendRadius=.05}={}){
  if(thickness<=0||thickness>.5)throw Error('Invalid thickness.');
  return {version:1,kind:'sheet_metal',length,width,thickness,bends:[{angle:bendAngle,radius:bendRadius,location:length/2}],flatPattern:null};
}

export function unfoldSheetMetal(sheet){
  let flatLen=sheet.length;
  for(const b of sheet.bends)flatLen+=b.angle*Math.PI/180*(b.radius+sheet.thickness/2);
  sheet.flatPattern={length:flatLen,width:sheet.width,thickness:sheet.thickness};return sheet.flatPattern;
}

// —— BREP-like solid boxes + voxel boolean ——
export function boxSolid({xmin=0,ymin=0,zmin=0,xmax=1,ymax=1,zmax=1}={}){
  if(xmax<=xmin||ymax<=ymin||zmax<=zmin)throw Error('Invalid box.');
  return {version:1,kind:'brep_box',xmin,ymin,zmin,xmax,ymax,zmax};
}

export function brepBoolean(a,b,op='union',{res=24}={}){
  if(!['union','subtract','intersect'].includes(op))throw Error('Boolean op.');
  const xmin=Math.min(a.xmin,b.xmin),ymin=Math.min(a.ymin,b.ymin),zmin=Math.min(a.zmin,b.zmin);
  const xmax=Math.max(a.xmax,b.xmax),ymax=Math.max(a.ymax,b.ymax),zmax=Math.max(a.zmax,b.zmax);
  const inside=(s,x,y,z)=>x>=s.xmin&&x<=s.xmax&&y>=s.ymin&&y<=s.ymax&&z>=s.zmin&&z<=s.zmax;
  let count=0;const voxels=[];
  for(let i=0;i<res;i++)for(let j=0;j<res;j++)for(let k=0;k<res;k++){
    const x=xmin+(i+.5)/res*(xmax-xmin),y=ymin+(j+.5)/res*(ymax-ymin),z=zmin+(k+.5)/res*(zmax-zmin);
    const ia=inside(a,x,y,z),ib=inside(b,x,y,z);
    const hit=op==='union'?ia||ib:op==='intersect'?ia&&ib:ia&&!ib;
    if(hit){count++;voxels.push([i,j,k]);}
  }
  return {version:1,kind:'brep_voxel',op,res,bounds:{xmin,ymin,zmin,xmax,ymax,zmax},occupied:count,voxels:voxels.slice(0,512)};
}

// —— Measurement / tolerances ——
export function measureExact(entity,{kind='length'}={}){
  if(kind==='length'&&entity.points)return {kind,value:curveLength(entity),unit:'m',tolerance:1e-6};
  if(kind==='box'&&entity.xmin!=null)return {kind:'bbox',dx:entity.xmax-entity.xmin,dy:entity.ymax-entity.ymin,dz:entity.zmax-entity.zmin,tolerance:1e-9};
  throw Error('Unsupported measure.');
}

export function setTolerance(doc,{linear=1e-6,angular=1e-4}={}){
  doc.tolerances={linear,angular};return doc.tolerances;
}

// —— STEP / IGES (lightweight text interchange of curves) ——
export function exportIgesCurves(curves){
  let out='S      1\n'; // start
  out+='1H,,1H;,4HSLOT,11HFusionStudio,32HLightweight IGES curve export,;G      1\n';
  let d=1,p=1;
  for(const c of curves){
    const v=validateCurve(c);
    out+=`126${String(d).padStart(7)}P${String(p).padStart(7)}\n`;d++;
    const pts=v.points.flat().map(n=>n.toFixed(6)).join(',');
    out+=`126,${v.degree},${v.points.length-1},0,0,1,0,${pts};P${String(p++).padStart(7)}\n`;
  }
  out+=`S      1G      1D${String(d-1).padStart(7)}P${String(p-1).padStart(7)}T      1\n`;
  return out;
}

export function exportStepCurves(curves){
  let n=1;const lines=['ISO-10303-21;','HEADER;','FILE_DESCRIPTION((\'Fusion Studio curve STEP\'),\'2;1\');','FILE_NAME(\'fusion_curves.stp\',\'\',(\'Fusion\'),(\'Fusion Studio\'),\'\',\'\',\'\');','FILE_SCHEMA((\'AUTOMOTIVE_DESIGN\'));','ENDSEC;','DATA;'];
  for(const c of curves){
    const v=validateCurve(c);
    const ids=[];
    for(const p of v.points){lines.push(`#${n}=CARTESIAN_POINT('',(${p.map(x=>x.toFixed(6)).join(',')}));`);ids.push(n++); }
    lines.push(`#${n}=B_SPLINE_CURVE_WITH_KNOTS('',${v.degree},(${ids.map(i=>'#'+i).join(',')}),.UNSPECIFIED.,.F.,.F.,(${v.knots.map(k=>k.toFixed(6)).join(',')}),(${v.knots.map(()=>1).join(',')}),.UNSPECIFIED.);`);n++;
  }
  lines.push('ENDSEC;','END-ISO-10303-21;');
  return lines.join('\n');
}

export function importStepCartesianPoints(text){
  if(typeof text!=='string'||!text.includes('ISO-10303-21'))throw Error('Not STEP.');
  const pts=[];
  for(const m of text.matchAll(/CARTESIAN_POINT\(''?,?\(([^)]+)\)/gi)){
    const nums=m[1].split(',').map(Number);if(nums.length>=3&&nums.every(Number.isFinite))pts.push(nums.slice(0,3));
  }
  return pts;
}

// —— Drawings / GD&T / dimensions ——
export function createDrawingView({name='Front',projection='ortho',scale=1}={}){
  return {version:1,id:uid(),name,projection,scale,dimensions:[],gdt:[]};
}

export function addLinearDimension(view,{a=[0,0],b=[1,0],offset=.2}={}){
  const value=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const d={id:uid(),kind:'linear',a,b,offset,value};view.dimensions.push(d);return d;
}

export function addGdtCallout(view,{feature='surface',frame='⟂|A|0.1'}={}){
  const g={id:uid(),feature,frame};view.gdt.push(g);return g;
}

// —— Exploded views ——
export function createExplodedView(parts,{factor=1.5}={}){
  if(!Array.isArray(parts)||!parts.length)throw Error('Parts required.');
  return {version:1,kind:'exploded',factor,transforms:parts.map((p,i)=>({id:p.id||i,offset:[i*factor,0,0],name:p.name||`P${i}`}))};
}

// —— Configurations / design tables ——
export function createConfigurationTable({name='Configs'}={}){
  return {version:1,id:uid(),name,parameters:['length','width','height'],rows:[]};
}

export function addConfiguration(table,values,label){
  if(!Array.isArray(values)||values.length!==table.parameters.length)throw Error('Row size mismatch.');
  const row={id:uid(),label:label||`Cfg${table.rows.length+1}`,values:[...values]};table.rows.push(row);return row;
}

export function applyConfiguration(solidParams,table,rowId){
  const row=table.rows.find(r=>r.id===rowId);if(!row)throw Error('Config missing.');
  const out={...solidParams};table.parameters.forEach((p,i)=>out[p]=row.values[i]);return out;
}

// —— Topology optimization / generative (preview density field) ——
export function topologyOptimize({res=16,load=[0, -1, 0],volFrac=.4}={}){
  if(res<4||res>64)throw Error('Res 4–64.');
  const dens=new Float32Array(res*res*res);const target=Math.floor(dens.length*volFrac);
  // Heuristic: denser near load axis (y).
  const scores=[];
  for(let z=0;z<res;z++)for(let y=0;y<res;y++)for(let x=0;x<res;x++){
    const s=1-Math.abs(y/(res-1)-.5)*2+Math.abs(load[1]);scores.push({i:x+y*res+z*res*res,s});
  }
  scores.sort((a,b)=>b.s-a.s);for(let k=0;k<target;k++)dens[scores[k].i]=1;
  return {version:1,kind:'topo_opt',res,volFrac,occupied:target,density:dens};
}

// —— FEA basics (bar truss) ——
export function feaBarTruss({nodes=[[0,0],[1,0],[.5,.8]],bars=[[0,1],[1,2],[2,0]],E=210e9,A=1e-4,loads={2:[0,-1000]}}={}){
  if(nodes.length<2||bars.length<1)throw Error('Invalid truss.');
  // Preview: axial stress estimate from load magnitude / A.
  const results=bars.map(([i,j],idx)=>{
    const ni=nodes[i],nj=nodes[j],len=Math.hypot(nj[0]-ni[0],nj[1]-ni[1])||1;
    const loadMag=Object.values(loads).reduce((s,f)=>s+Math.hypot(f[0]||0,f[1]||0),0);
    const force=loadMag/(bars.length||1),stress=force/A,strain=stress/E;
    return {bar:idx,length:len,force,stress,strain};
  });
  return {version:1,kind:'fea_truss',nodes,bars,E,A,results,maxStress:Math.max(...results.map(r=>Math.abs(r.stress)))};
}

export function meshFromCadSurface(surface,uSegs=24,vSegs=24){
  return tessellateSurface(surface,uSegs,vSegs);
}

export function meshFromCadCurve(curve,segments=64){
  return tessellateCurve(curve,segments);
}
