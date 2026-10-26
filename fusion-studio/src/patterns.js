import * as THREE from 'three';
import {seedPatternInterior} from './pattern-meshing.js';
import {improvePatternAngles,hasPoorPatternAngles} from './pattern-quality.js';



export const FABRICS={cotton:{stiffness:12,mass:.25,bending:.25},silk:{stiffness:6,mass:.08,bending:.04},denim:{stiffness:35,mass:.5,bending:1.2}};

export function starterPattern(){return {version:1,subdivision:3,fabric:'cotton',color:'#48677c',sewingForce:50,collisionDistance:.002,panels:[

  {id:'front',name:'Front',points:[[-.28,0],[.28,0],[.28,.65],[-.28,.65]],position:[0,.8,.2],flip:false,pins:[2]},

  {id:'back',name:'Back',points:[[-.28,0],[.28,0],[.28,.65],[-.28,.65]],position:[0,.8,-.2],flip:true,pins:[2]}

 ],seams:[{a:['front',1],b:['back',3],reverse:true},{a:['front',3],b:['back',1],reverse:true}]};}

export function tshirtPattern(){

 const doc=starterPattern(),points=[[-.30,0],[.30,0],[.30,.35],[.48,.35],[.48,.55],[.20,.65],[.10,.65],[.07,.58],[-.07,.58],[-.10,.65],[-.20,.65],[-.48,.55],[-.48,.35],[-.30,.35]];

 for(const panel of doc.panels){panel.points=structuredClone(points);panel.position=[0,.83,panel.flip?-.22:.22];panel.pins=panel.flip?[5,9]:[];}

 doc.seams=[1,2,4,5,9,10,12,13].map(i=>({a:['front',i],b:['back',(14-i)%14],reverse:true}));return doc;

}

const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);

const length=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);

function intersects(a,b,c,d){

  const ab1=cross(a,b,c),ab2=cross(a,b,d),cd1=cross(c,d,a),cd2=cross(c,d,b),eps=1e-9;

  const on=(p,x,y)=>Math.abs(cross(x,y,p))<eps&&p[0]>=Math.min(x[0],y[0])-eps&&p[0]<=Math.max(x[0],y[0])+eps&&p[1]>=Math.min(x[1],y[1])-eps&&p[1]<=Math.max(x[1],y[1])+eps;

  return (ab1*ab2<0&&cd1*cd2<0)||on(c,a,b)||on(d,a,b)||on(a,c,d)||on(b,c,d);

}

export function validatePattern(doc){

  if(doc?.version===2)return validatePatternV2(doc);

  if(doc?.version!==1||!Array.isArray(doc.panels)||doc.panels.length<1||doc.panels.length>16)throw Error('A pattern needs 1–16 panels.');

  if(!Number.isInteger(doc.subdivision)||doc.subdivision<1||doc.subdivision>5)throw Error('Mesh subdivision must be between 1 and 5.');

  if(!Object.hasOwn(FABRICS,doc.fabric)||!/^#[0-9a-f]{6}$/i.test(doc.color))throw Error('Choose a supported fabric and color.');

  if(!Number.isFinite(doc.sewingForce)||doc.sewingForce<.1||doc.sewingForce>200||!Number.isFinite(doc.collisionDistance)||doc.collisionDistance<.0005||doc.collisionDistance>.02)throw Error('Sewing force must be 0.1–200; collision distance must be 0.0005–0.02 m.');

  const ids=new Map();let estimate=0;

  for(const panel of doc.panels){

    if(typeof panel.id!=='string'||!/^[a-zA-Z0-9_-]{1,60}$/.test(panel.id)||ids.has(panel.id))throw Error('Panel IDs must be unique.');ids.set(panel.id,panel);

    if(typeof panel.name!=='string'||panel.name.length>80||typeof panel.flip!=='boolean')throw Error('Invalid panel properties.');

    if(!Array.isArray(panel.position)||panel.position.length!==3||panel.position.some(v=>!Number.isFinite(v)||Math.abs(v)>20))throw Error('Panel placement must stay within 20 meters.');

    const p=panel.points;if(!Array.isArray(p)||p.length<3||p.length>64||p.some(v=>!Array.isArray(v)||v.length!==2||v.some(n=>!Number.isFinite(n)||Math.abs(n)>5)))throw Error('Each panel needs 3–64 points within 5 meters.');

    let area=0;for(let i=0;i<p.length;i++){const next=(i+1)%p.length;if(length(p[i],p[next])<.001)throw Error(panel.name+': edges must be at least 1 mm long.');area+=p[i][0]*p[next][1]-p[next][0]*p[i][1];

      for(let j=i+1;j<p.length;j++){if(j===next||(j+1)%p.length===i)continue;if(intersects(p[i],p[next],p[j],p[(j+1)%p.length]))throw Error(panel.name+': the outline crosses or touches itself.');}}

    if(Math.abs(area)<.000002)throw Error(panel.name+': the panel has no usable area.');

    if(!Array.isArray(panel.pins)||panel.pins.some(i=>!Number.isInteger(i)||i<0||i>=p.length))throw Error('A pinned edge is missing.');

    estimate+=(p.length-2)*4**doc.subdivision;

  }

  if(estimate>60000)throw Error('Pattern mesh exceeds 60,000 triangles. Lower subdivision or simplify the outlines.');

  if(!Array.isArray(doc.seams)||doc.seams.length>64)throw Error('A pattern supports up to 64 seams.');

  const used=new Set(),warnings=[];

  for(const seam of doc.seams){const lengths=[];

    if(typeof seam.reverse!=='boolean')throw Error('Choose a seam direction.');

    for(const ref of [seam.a,seam.b]){if(!Array.isArray(ref)||ref.length!==2||!ids.has(ref[0]))throw Error('A seam references a missing panel.');const panel=ids.get(ref[0]),edge=ref[1];if(!Number.isInteger(edge)||edge<0||edge>=panel.points.length)throw Error('A seam references a missing edge.');const key=ref.join(':');if(used.has(key))throw Error('An edge can belong to only one seam.');used.add(key);lengths.push(length(panel.points[edge],panel.points[(edge+1)%panel.points.length]));}

    if(Math.abs(lengths[0]-lengths[1])/Math.max(...lengths)>.1)warnings.push('Seam '+seam.a.join(':')+' ↔ '+seam.b.join(':')+' differs by more than 10% in length; expect gathering or stretching.');

    const a=ids.get(seam.a[0]),b=ids.get(seam.b[0]),pinned=(p,i)=>p.pins.includes(i)||p.pins.includes((i+p.points.length-1)%p.points.length);

    const world=(p,i)=>[(p.flip?-1:1)*p.points[i][0]+p.position[0],p.points[i][1]+p.position[1],p.position[2]];

    for(let end=0;end<2;end++){const ai=(seam.a[1]+end)%a.points.length,bi=(seam.b[1]+(seam.reverse?1-end:end))%b.points.length;

      if(pinned(a,ai)&&pinned(b,bi)&&Math.hypot(...world(a,ai).map((v,i)=>v-world(b,bi)[i]))>.001){const warning='Some seam endpoints are pinned apart; adjust their pins or panel placement before expecting those endpoints to close.';if(!warnings.includes(warning))warnings.push(warning);}}

  }

  if(!doc.panels.some(p=>p.pins.length))warnings.push('No pinned edges: gravity can drop the garment away from the body.');

  return {warnings,triangles:estimate};

}



export function buildPattern(doc){

  if(doc?.version===2)return buildPatternV2(doc);

  validatePattern(doc);const positions=[],uvs=[],faces=[],edges=new Map(),pins=new Set(),groups=[];

  for(const panel of doc.panels){

    const points=panel.points.map(p=>[...p]),outline=points.map((_,i)=>[i,(i+1)%points.length]);

    let triangles=THREE.ShapeUtils.triangulateShape(points.map(p=>new THREE.Vector2(...p)),[]);

    const expected=Math.abs(THREE.ShapeUtils.area(points.map(p=>new THREE.Vector2(...p))));

    const actual=triangles.reduce((sum,t)=>sum+Math.abs(cross(points[t[0]],points[t[1]],points[t[2]]))/2,0);

    if(Math.abs(actual-expected)>1e-7)throw Error('Panel triangulation failed. Simplify the outline.');

    for(let level=0;level<doc.subdivision;level++){

      const cache=new Map(),mid=(a,b)=>{const k=[a,b].sort((x,y)=>x-y).join(':');if(cache.has(k))return cache.get(k);const i=points.length;points.push([(points[a][0]+points[b][0])/2,(points[a][1]+points[b][1])/2]);cache.set(k,i);return i;};

      triangles=triangles.flatMap(([a,b,c])=>{const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);return [[a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]];});

      for(let edge=0;edge<outline.length;edge++){const chain=outline[edge],next=[];for(let i=0;i<chain.length-1;i++)next.push(chain[i],mid(chain[i],chain[i+1]));next.push(chain.at(-1));outline[edge]=next;}

    }

    const base=positions.length/3,start=faces.length*3;

    for(const [x,y] of points){positions.push((panel.flip?-x:x)+panel.position[0],y+panel.position[1],panel.position[2]);uvs.push(x,y);}

    for(const t of triangles){const [a,b,c]=t;const positive=cross(points[a],points[b],points[c])>0;faces.push((positive?[a,b,c]:[a,c,b]).map(i=>i+base));}

    for(let i=0;i<outline.length;i++){const chain=outline[i].map(v=>base+v);edges.set(panel.id+':'+i,chain);if(panel.pins.includes(i))for(const v of chain)pins.add(v);}

    groups.push({start,count:faces.length*3-start,panel:panel.id});

  }

  const sewing=[],existing=new Set(),edgeKey=(a,b)=>a<b?a+':'+b:b+':'+a;

  for(const [a,b,c] of faces)for(const [x,y] of [[a,b],[b,c],[c,a]])existing.add(edgeKey(x,y));

  for(const seam of doc.seams){const a=edges.get(seam.a.join(':')),b=[...edges.get(seam.b.join(':'))];if(seam.reverse)b.reverse();for(let i=0;i<a.length;i++){const key=edgeKey(a[i],b[i]);if(a[i]!==b[i]&&!existing.has(key)){sewing.push([a[i],b[i]]);existing.add(key);}}}

  return {positions,uvs,faces,sewing,pins:[...pins],groups};

}

export function createPatternObject(doc,data=buildPattern(doc)){

  const group=new THREE.Group();group.name='Sewn garment';group.userData={fusion_kind:'pattern',fusion_id:THREE.MathUtils.generateUUID(),patternProject:structuredClone(doc),source:'Fusion sewn pattern'};

  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(data.uvs,2));geometry.setIndex(data.faces.flat());geometry.computeVertexNormals();

  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:doc.color,roughness:.85,side:THREE.DoubleSide}));mesh.name='Pattern panels';mesh.userData={fusion_cloth:true,fusion_id:group.userData.fusion_id};mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return group;

}

export function patternPayload(object){

  const doc=object.userData.patternProject,data=buildPattern(doc);object.updateWorldMatrix(true,false);const v=new THREE.Vector3(),vertices=[];

  for(let i=0;i<data.positions.length;i+=3){v.fromArray(data.positions,i).applyMatrix4(object.matrixWorld);vertices.push(v.toArray());}

  return {vertices,faces:data.faces,uvs:data.uvs,sewing:data.sewing,pins:data.pins,color:doc.color,sewingForce:doc.sewingForce,collisionDistance:doc.collisionDistance,...FABRICS[doc.fabric]};

}



// Version 2 keeps authored points separate from tessellated vertices. Segment IDs,

// not triangle indices, are the persistent attachment coordinates for sewing.

const MAX_PATTERN_TRIANGLES=200000;

const segmentId=(ring,i)=>`${ring}_s${i}`;

const finitePoint=p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<=5);

export function migratePattern(input){

  if(input?.version===2)return structuredClone(input);

  validatePattern(input);const doc=structuredClone(input);doc.version=2;doc.particleDistance=.04;

  for(const p of doc.panels){p.segments=p.points.map((_,i)=>({id:segmentId(p.id,i),type:'line'}));p.holes=[];p.internalLines=[];p.darts=[];p.pins=p.pins.map(i=>p.segments[i].id);}

  doc.seams=doc.seams.map((s,i)=>({id:`seam_${i}`,a:{panel:s.a[0],segment:segmentId(s.a[0],s.a[1]),start:0,end:1},b:{panel:s.b[0],segment:segmentId(s.b[0],s.b[1]),start:0,end:1},reverse:s.reverse}));return doc;

}

export function patternSegmentPoint(ring,index,t){const a=ring.points[index],b=ring.points[(index+1)%ring.points.length],s=ring.segments[index];if(s.type==='line')return a.map((v,i)=>v+(b[i]-v)*t);const u=1-t;return a.map((v,i)=>u*u*u*v+3*u*u*t*s.controls[0][i]+3*u*t*t*s.controls[1][i]+t*t*t*b[i]);}

function rings(panel){return [panel,...(panel.holes||[])];}

function findSegment(doc,ref){const p=doc.panels.find(p=>p.id===ref?.panel);if(!p)throw Error('A seam references a missing panel.');for(const ring of rings(p)){const index=ring.segments.findIndex(s=>s.id===ref.segment);if(index>=0)return {panel:p,ring,index,segment:ring.segments[index]};}throw Error('A seam references a missing segment.');}

// Chord and control-polygon lengths bound a cubic's arc length. Subdivide
// independently of display tessellation so measurements survive mesh refinement.
function segmentArcLength(ring,index,start=0,end=1,tolerance=1e-6){
  const a=ring.points[index],b=ring.points[(index+1)%ring.points.length],segment=ring.segments[index];
  if(segment.type==='line')return {length:length(a,b)*(end-start),errorBound:0,converged:true};
  const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
  const split=(p,t)=>{const a=mix(p[0],p[1],t),b=mix(p[1],p[2],t),c=mix(p[2],p[3],t),d=mix(a,b,t),e=mix(b,c,t),f=mix(d,e,t);return [[p[0],a,d,f],[f,e,c,p[3]]];};
  let curve=[a,...segment.controls,b];if(end<1)curve=split(curve,end)[0];if(start>0)curve=split(curve,start/end)[1];
  const stack=[{curve,tolerance,depth:0}];let total=0,errorBound=0,converged=true,subdivisions=0;
  while(stack.length){const item=stack.pop(),p=item.curve,chord=length(p[0],p[3]),polygon=length(p[0],p[1])+length(p[1],p[2])+length(p[2],p[3]),gap=Math.max(0,polygon-chord);
    if(gap<=2*item.tolerance||item.depth>=18||subdivisions>=4096){total+=(polygon+chord)/2;errorBound+=gap/2;if(gap>2*item.tolerance)converged=false;}
    else {const halves=split(p,.5);subdivisions++;for(const curve of halves)stack.push({curve,tolerance:item.tolerance/2,depth:item.depth+1});}
  }
  return {length:total,errorBound,converged};
}

function approximateLength(ring,i,start=0,end=1){return segmentArcLength(ring,i,start,end).length;}

/** Physical measurements of authored sewing ranges, in metres.
 * Positive ease means side A is longer than B, with percentage relative to B.
 * Mismatch uses the longer side as denominator, matching validation warnings.
 */
export function measurePatternSeams(input,{tolerance=1e-6}={}){
  if(!Number.isFinite(tolerance)||tolerance<1e-9||tolerance>1e-4)throw Error('Seam measurement tolerance must be 0.000000001–0.0001 m.');
  validatePattern(input);const doc=input.version===1?migratePattern(input):input,warnings=[];
  const seams=doc.seams.map(seam=>{
    const side=ref=>{const {ring,index}=findSegment(doc,ref);return {...ref,...segmentArcLength(ring,index,ref.start,ref.end,tolerance),startPoint:patternSegmentPoint(ring,index,ref.start),endPoint:patternSegmentPoint(ring,index,ref.end)};};
    const a=side(seam.a),b=side(seam.b),deltaLength=a.length-b.length,easeRatio=deltaLength/b.length,mismatchRatio=Math.abs(deltaLength)/Math.max(a.length,b.length),lengthRatio=Math.max(a.length,b.length)/Math.min(a.length,b.length),issues=[];
    if(mismatchRatio>.1)issues.push(`Seam ${seam.id}: side ${deltaLength>0?'A':'B'} is ${(Math.abs(deltaLength)*1000).toFixed(1)} mm longer (${(mismatchRatio*100).toFixed(1)}% mismatch). Adjust the range or plan gathering/stretching.`);
    if(!a.converged||!b.converged)issues.push(`Seam ${seam.id}: curve measurement reached its subdivision limit; simplify the curve or use the reported error bound.`);
    warnings.push(...issues);
    return {id:seam.id,a,b,lengthA:a.length,lengthB:b.length,deltaLength,easeRatio,easePercent:easeRatio*100,mismatchRatio,lengthRatio,reverse:seam.reverse,orientation:seam.reverse?'reversed':'same',endpoints:{a:[a.startPoint,a.endPoint],b:seam.reverse?[b.endPoint,b.startPoint]:[b.startPoint,b.endPoint]},warnings:issues};
  });
  return {units:'m',tolerance,seams,totalLengthA:seams.reduce((n,s)=>n+s.lengthA,0),totalLengthB:seams.reduce((n,s)=>n+s.lengthB,0),maxMismatchRatio:Math.max(0,...seams.map(s=>s.mismatchRatio)),meanMismatchRatio:seams.length?seams.reduce((n,s)=>n+s.mismatchRatio,0)/seams.length:0,maxLengthRatio:Math.max(1,...seams.map(s=>s.lengthRatio)),meanLengthRatio:seams.length?seams.reduce((n,s)=>n+s.lengthRatio,0)/seams.length:1,warnings};
}

function pointInside(p,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}

function sampleRing(ring){const p=[];for(let i=0;i<ring.points.length;i++){const n=ring.segments[i].type==='cubic'?32:1;for(let j=0;j<n;j++)p.push(patternSegmentPoint(ring,i,j/n));}return p;}

function validateRing(ring,label,ids){if(!Array.isArray(ring.points)||ring.points.length<3||ring.points.length>128||!ring.points.every(finitePoint)||!Array.isArray(ring.segments)||ring.segments.length!==ring.points.length)throw Error(label+': needs 3–128 vertices and one stable segment per edge.');for(const s of ring.segments){if(typeof s.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(s.id)||ids.has(s.id))throw Error('Segment IDs must be unique within a panel.');ids.add(s.id);if(!['line','cubic'].includes(s.type)||s.type==='cubic'&&(!Array.isArray(s.controls)||s.controls.length!==2||!s.controls.every(finitePoint)))throw Error('A cubic segment needs two finite control points.');}

  const poly=sampleRing(ring);let area=0;for(let i=0;i<poly.length;i++){const n=(i+1)%poly.length;if(length(poly[i],poly[n])<1e-7)throw Error(label+': coincident boundary points.');area+=poly[i][0]*poly[n][1]-poly[n][0]*poly[i][1];for(let j=i+1;j<poly.length;j++){if(j===n||(j+1)%poly.length===i)continue;if(intersects(poly[i],poly[n],poly[j],poly[(j+1)%poly.length]))throw Error(label+': outline crosses or touches itself.');}}if(Math.abs(area)<1e-6)throw Error(label+': no usable area.');return poly;

}

function validatePatternV2(doc){

  if(!Array.isArray(doc.panels)||!doc.panels.length||doc.panels.length>16)throw Error('A pattern needs 1–16 panels.');if(!Number.isFinite(doc.particleDistance)||doc.particleDistance<.005||doc.particleDistance>.2)throw Error('Particle distance must be 0.005–0.2 m.');

  if(!Object.hasOwn(FABRICS,doc.fabric)||!/^#[0-9a-f]{6}$/i.test(doc.color))throw Error('Choose a supported fabric and color.');if(!Number.isFinite(doc.sewingForce)||doc.sewingForce<.1||doc.sewingForce>200||!Number.isFinite(doc.collisionDistance)||doc.collisionDistance<.0005||doc.collisionDistance>.02)throw Error('Invalid sewing force or collision distance.');

  const panelIds=new Set(),warnings=[];let area=0;

  for(const p of doc.panels){if(typeof p.id!=='string'||!/^[a-zA-Z0-9_-]{1,60}$/.test(p.id)||panelIds.has(p.id))throw Error('Panel IDs must be unique.');panelIds.add(p.id);if(typeof p.name!=='string'||p.name.length>80||typeof p.flip!=='boolean'||!Array.isArray(p.position)||p.position.length!==3||p.position.some(v=>!Number.isFinite(v)||Math.abs(v)>20))throw Error('Invalid panel properties or placement.');const ids=new Set(),outer=validateRing(p,p.name,ids);if(!Array.isArray(p.holes)||p.holes.length>12||!Array.isArray(p.internalLines)||p.internalLines.length>32)throw Error('A panel supports at most 12 holes and 32 internal lines.');const holes=p.holes.map((h,i)=>validateRing(h,p.name+' hole '+(i+1),ids)),all=[outer,...holes];for(let h=0;h<holes.length;h++){if(!holes[h].every(v=>pointInside(v,outer)))throw Error('Every hole must stay inside its panel.');for(let j=0;j<h;j++)if(pointInside(holes[h][0],holes[j])||pointInside(holes[j][0],holes[h]))throw Error('Holes cannot overlap or nest.');}

    for(let r=0;r<all.length;r++)for(let s=r+1;s<all.length;s++)for(let i=0;i<all[r].length;i++)for(let j=0;j<all[s].length;j++)if(intersects(all[r][i],all[r][(i+1)%all[r].length],all[s][j],all[s][(j+1)%all[s].length]))throw Error('Hole and panel boundaries cannot touch or cross.');

    if(!Array.isArray(p.pins)||p.pins.some(id=>!ids.has(id)&&!(Number.isInteger(id)&&id>=0&&id<p.points.length)))throw Error('A pinned segment is missing.');

    const lineIds=new Set();for(const line of p.internalLines){if(typeof line.id!=='string'||lineIds.has(line.id)||!Array.isArray(line.points)||line.points.length<2||line.points.length>32||!line.points.every(finitePoint))throw Error('Internal lines need unique IDs and 2–32 points.');lineIds.add(line.id);for(const pt of line.points)if(!pointInside(pt,outer)||holes.some(h=>pointInside(pt,h)))throw Error('Internal lines must stay strictly inside the fabric.');for(let i=0;i<line.points.length-1;i++){if(length(line.points[i],line.points[i+1])<.001)throw Error('Internal line segments must be at least 1 mm.');for(const poly of all)for(let j=0;j<poly.length;j++)if(intersects(line.points[i],line.points[i+1],poly[j],poly[(j+1)%poly.length]))throw Error('Internal lines cannot cross a boundary.');}}

    const lineEdges=p.internalLines.flatMap(l=>l.points.slice(1).map((v,i)=>[l.points[i],v]));for(let i=0;i<lineEdges.length;i++)for(let j=i+1;j<lineEdges.length;j++){const [a,b]=lineEdges[i],[c,d]=lineEdges[j];if([a,b].some(x=>[c,d].some(y=>length(x,y)<1e-8)))continue;if(intersects(a,b,c,d))throw Error('Internal lines cannot cross.');}

    area+=Math.abs(THREE.ShapeUtils.area(outer.map(v=>new THREE.Vector2(...v))))-holes.reduce((n,h)=>n+Math.abs(THREE.ShapeUtils.area(h.map(v=>new THREE.Vector2(...v)))),0);

  }

  if(!Array.isArray(doc.seams)||doc.seams.length>128)throw Error('A pattern supports at most 128 seams.');const used=new Map(),seamIds=new Set();for(const seam of doc.seams){if(typeof seam.id!=='string'||!seam.id||seamIds.has(seam.id))throw Error('Seam IDs must be unique.');seamIds.add(seam.id);if(typeof seam.reverse!=='boolean')throw Error('Choose a seam direction.');const lengths=[];for(const ref of [seam.a,seam.b]){const {ring,index}=findSegment(doc,ref);if(!Number.isFinite(ref.start)||!Number.isFinite(ref.end)||ref.start<0||ref.end>1||ref.end-ref.start<.001)throw Error('Seam ranges need 0 ≤ start < end ≤ 1.');const key=ref.panel+':'+ref.segment,list=used.get(key)||[];if(list.some(([a,b])=>Math.min(ref.end,b)-Math.max(ref.start,a)>1e-8))throw Error('Overlapping parts of a segment can belong to only one seam.');list.push([ref.start,ref.end]);used.set(key,list);lengths.push(approximateLength(ring,index,ref.start,ref.end));}if(Math.abs(lengths[0]-lengths[1])/Math.max(...lengths)>.1)warnings.push('A seam differs by more than 10% in length; expect gathering or stretching.');}

  if(!doc.panels.some(p=>p.pins.length))warnings.push('No pinned segments: gravity can drop the garment away from the body.');const triangles=Math.ceil(area/(doc.particleDistance**2)*4);if(triangles>MAX_PATTERN_TRIANGLES)throw Error('Pattern estimate exceeds 200,000 triangles. Increase particle distance.');return {warnings,triangles,estimated:true};

}



export function addPatternDart(doc,panelId,index,width=.04,depth=.12){

  if(doc.version!==2)throw Error('Upgrade this pattern before adding a dart.');const p=doc.panels.find(p=>p.id===panelId);if(!p||!Number.isInteger(index)||!p.segments[index])throw Error('Select a boundary segment for the dart.');const old=p.segments[index];if(old.type!=='line')throw Error('A dart currently needs a straight boundary segment.');if(doc.seams.some(s=>[s.a,s.b].some(r=>r.panel===panelId&&r.segment===old.id))||p.pins.includes(old.id)||p.pins.includes(index))throw Error('Remove sewing and pins on this segment before adding a dart.');const a=p.points[index],b=p.points[(index+1)%p.points.length],len=length(a,b);if(!Number.isFinite(width)||!Number.isFinite(depth)||width<=.002||width>=len*.8||depth<=.002)throw Error('Dart width must fit inside the edge and depth must exceed 2 mm.');const dx=(b[0]-a[0])/len,dy=(b[1]-a[1])/len,mid=a.map((v,i)=>(v+b[i])/2),sign=Math.sign(THREE.ShapeUtils.area(p.points.map(v=>new THREE.Vector2(...v)))),left=[mid[0]-dx*width/2,mid[1]-dy*width/2],right=[mid[0]+dx*width/2,mid[1]+dy*width/2],tip=[mid[0]-dy*depth*sign,mid[1]+dx*depth*sign];let id=`${old.id}_dart`;while(p.segments.some(s=>s.id.startsWith(id)))id+='_1';const snapshot=structuredClone(doc);p.points.splice(index+1,0,left,tip,right);p.segments.splice(index,1,{id:old.id,type:'line'},{id:id+'_a',type:'line'},{id:id+'_b',type:'line'},{id:id+'_tail',type:'line'});p.darts??=[];p.darts.push({id,segments:[id+'_a',id+'_b'],width,depth});doc.seams.push({id,a:{panel:panelId,segment:id+'_a',start:0,end:1},b:{panel:panelId,segment:id+'_b',start:0,end:1},reverse:true,dart:true});try{validatePattern(doc);}catch(e){Object.assign(doc,snapshot);throw e;}return id;

}



function buildPatternV2(doc){

  validatePatternV2(doc);const positions=[],uvs=[],faces=[],pins=new Set(),groups=[],segmentChains={},internalChains={},angleRefinement={},triangulationWork={},h=doc.particleDistance,parameters=new Map(),key=(p,s)=>p+':'+s;

  const speeds=new Map(),intervals=new Map();
  for(const p of doc.panels)for(const ring of rings(p))for(let i=0;i<ring.segments.length;i++){
    const s=ring.segments[i],control=s.type==='cubic'?[ring.points[i],...s.controls,ring.points[(i+1)%ring.points.length]]:null;
    // A cubic's derivative is bounded by three times its longest control edge.
    // This guarantees authored boundary chords fit the particle distance before
    // interior refinement, so corresponding seams never split independently.
    speeds.set(key(p.id,s.id),control?3*Math.max(...control.slice(1).map((p,j)=>length(control[j],p))):approximateLength(ring,i));
    intervals.set(key(p.id,s.id),[]);
  }
  for(const seam of doc.seams){const n=Math.max(...[seam.a,seam.b].map(r=>Math.ceil(speeds.get(key(r.panel,r.segment))*(r.end-r.start)/(h*.95))));for(const r of [seam.a,seam.b])intervals.get(key(r.panel,r.segment)).push({start:r.start,end:r.end,n});}
  for(const [k,speed] of speeds){const spans=intervals.get(k),breaks=[...new Set([0,1,...spans.flatMap(r=>[r.start,r.end])])].sort((a,b)=>a-b),ts=[];for(let i=1;i<breaks.length;i++){const a=breaks[i-1],b=breaks[i],seam=spans.find(r=>Math.abs(r.start-a)<1e-10&&Math.abs(r.end-b)<1e-10),n=seam?.n||Math.max(1,Math.ceil(speed*(b-a)/(h*.95)));for(let j=0;j<n;j++)ts.push(a+(b-a)*j/n);}ts.push(1);parameters.set(k,ts);}
  const edgeKey=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;

  for(const p of doc.panels){const points=[],localChains={},contours=[];

    for(const ring of rings(p)){const contour=[];for(let i=0;i<ring.segments.length;i++){const id=ring.segments[i].id,ts=parameters.get(key(p.id,id)),chain=[];for(const t of ts.slice(0,-1)){chain.push(points.length);contour.push(points.length);points.push(patternSegmentPoint(ring,i,t));}localChains[id]={indices:chain,parameters:ts};}for(let i=0;i<ring.segments.length;i++)localChains[ring.segments[i].id].indices.push(localChains[ring.segments[(i+1)%ring.segments.length].id].indices[0]);contours.push(contour);}

    let tris=THREE.ShapeUtils.triangulateShape(contours[0].map(i=>new THREE.Vector2(...points[i])),contours.slice(1).map(c=>c.map(i=>new THREE.Vector2(...points[i]))));const orient=t=>cross(points[t[0]],points[t[1]],points[t[2]])>0?t:[t[0],t[2],t[1]];tris=tris.map(orient);

    const actual=tris.reduce((n,t)=>n+Math.abs(cross(...t.map(i=>points[i])))/2,0),expected=Math.abs(THREE.ShapeUtils.area(contours[0].map(i=>new THREE.Vector2(...points[i]))))-contours.slice(1).reduce((n,c)=>n+Math.abs(THREE.ShapeUtils.area(c.map(i=>new THREE.Vector2(...points[i])))),0);if(Math.abs(actual-expected)>1e-7)throw Error('Constrained boundary triangulation did not preserve panel area.');

    const insert=pt=>{let existing=points.findIndex(v=>length(v,pt)<1e-9);if(existing>=0)return existing;const affected=[];for(let i=0;i<tris.length;i++){const t=tris[i],cs=t.map((a,j)=>cross(points[a],points[t[(j+1)%3]],pt));if(cs.every(v=>v>=-1e-10))affected.push(i);}if(!affected.length)throw Error('An internal line escaped its panel.');const id=points.length;points.push(pt);const replace=[];for(const i of affected){const t=tris[i];for(let j=0;j<3;j++){const a=t[j],b=t[(j+1)%3];if(Math.abs(cross(points[a],points[b],pt))>1e-10)replace.push(orient([a,b,id]));}}const remove=new Set(affected);tris=tris.filter((_,i)=>!remove.has(i)).concat(replace);return id;};

    const constraints=new Set();for(const c of Object.values(localChains))for(let i=1;i<c.indices.length;i++)constraints.add(edgeKey(c.indices[i-1],c.indices[i]));

    // Defer a new crossing diagonal until other crossings have been tried;
    // immediately flipping it back can cycle without recovering the constraint.
    const recover=(a,b)=>{const deferred=new Set();for(let attempt=0;attempt<10000;attempt++){const adjacency=new Map();for(let f=0;f<tris.length;f++)for(let j=0;j<3;j++){const u=tris[f][j],v=tris[f][(j+1)%3],k=edgeKey(u,v);if(!adjacency.has(k))adjacency.set(k,[]);adjacency.get(k).push(f);}if(adjacency.has(edgeKey(a,b))){constraints.add(edgeKey(a,b));return;}let changed=false;for(const [k,adj] of adjacency){if(adj.length!==2||constraints.has(k)||deferred.has(k))continue;const [u,v]=k.split(':').map(Number);if([u,v].includes(a)||[u,v].includes(b)||cross(points[a],points[b],points[u])*cross(points[a],points[b],points[v])>=-1e-16||cross(points[u],points[v],points[a])*cross(points[u],points[v],points[b])>=-1e-16)continue;const x=tris[adj[0]].find(i=>i!==u&&i!==v),y=tris[adj[1]].find(i=>i!==u&&i!==v);if(cross(points[x],points[y],points[u])*cross(points[x],points[y],points[v])>=-1e-16||adjacency.has(edgeKey(x,y)))continue;tris[adj[0]]=orient([x,y,u]);tris[adj[1]]=orient([y,x,v]);deferred.add(edgeKey(x,y));changed=true;break;}if(!changed){if(deferred.size){deferred.clear();continue;}break;}}throw Error('Could not recover an internal-line constraint. Simplify or move the line.');};

    const lines={};for(const l of p.internalLines){const chain=[];for(let i=0;i<l.points.length-1;i++){const a=l.points[i],b=l.points[i+1],n=Math.ceil(length(a,b)/h);for(let j=0;j<n;j++)chain.push(insert(a.map((v,d)=>v+(b[d]-v)*j/n)));}chain.push(insert(l.points.at(-1)));for(let j=1;j<chain.length;j++)recover(chain[j-1],chain[j]);lines[l.id]=chain;}

    const improve=(maximumEdge=Infinity)=>{const adj=new Map(),add=f=>{const t=tris[f];for(let j=0;j<3;j++){const k=edgeKey(t[j],t[(j+1)%3]);if(!adj.has(k))adj.set(k,new Set());adj.get(k).add(f);}},remove=f=>{const t=tris[f];for(let j=0;j<3;j++){const k=edgeKey(t[j],t[(j+1)%3]);adj.get(k)?.delete(f);}};for(let i=0;i<tris.length;i++)add(i);const queue=[...adj.keys()];let budget=tris.length*40;while(queue.length&&budget-->0){const k=queue.pop(),fs=adj.get(k);if(fs?.size!==2||constraints.has(k))continue;const [f,g]=fs,[u,v]=k.split(':').map(Number),x=tris[f].find(i=>i!==u&&i!==v),y=tris[g].find(i=>i!==u&&i!==v);if(x===y||length(points[x],points[y])>maximumEdge||adj.get(edgeKey(x,y))?.size||cross(points[x],points[y],points[u])*cross(points[x],points[y],points[v])>=-1e-20)continue;const t=orient([u,v,x]),a=points[t[0]].map((n,i)=>n-points[y][i]),b=points[t[1]].map((n,i)=>n-points[y][i]),c=points[t[2]].map((n,i)=>n-points[y][i]),sq=p=>p[0]*p[0]+p[1]*p[1],det=sq(a)*(b[0]*c[1]-b[1]*c[0])-sq(b)*(a[0]*c[1]-a[1]*c[0])+sq(c)*(a[0]*b[1]-a[1]*b[0]);if(det<=1e-18)continue;remove(f);remove(g);tris[f]=orient([x,y,u]);tris[g]=orient([y,x,v]);add(f);add(g);for(const fi of [f,g])for(let j=0;j<3;j++)queue.push(edgeKey(tris[fi][j],tris[fi][(j+1)%3]));}};

    improve();const seeded=seedPatternInterior(points,tris,constraints,h,MAX_PATTERN_TRIANGLES-faces.length,contours);triangulationWork[p.id]=seeded.work;improve();

    // Split every long edge once per pass, sharing midpoint indices. All 1/2/3

    // split cases are conforming; no hanging vertices or deleted constraints.

    for(let pass=0;pass<12;pass++){const mids=new Map();for(const t of tris)for(let j=0;j<3;j++){const a=t[j],b=t[(j+1)%3],k=edgeKey(a,b);if(length(points[a],points[b])>h*1.001&&!mids.has(k)){mids.set(k,points.length);points.push(points[a].map((v,d)=>(v+points[b][d])/2));}}if(!mids.size)break;const next=[];for(const [a,b,c] of tris){const ab=mids.get(edgeKey(a,b)),bc=mids.get(edgeKey(b,c)),ca=mids.get(edgeKey(c,a)),count=[ab,bc,ca].filter(v=>v!==undefined).length;if(!count)next.push([a,b,c]);else if(count===3)next.push([a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]);else if(count===1){if(ab!==undefined)next.push([a,ab,c],[ab,b,c]);else if(bc!==undefined)next.push([b,bc,a],[bc,c,a]);else next.push([c,ca,b],[ca,a,b]);}else if(ab===undefined)next.push([c,ca,bc],[ca,a,b],[ca,b,bc]);else if(bc===undefined)next.push([a,ab,ca],[ab,b,c],[ab,c,ca]);else next.push([b,bc,ab],[bc,c,a],[bc,a,ab]);}tris=next;if(faces.length+tris.length>MAX_PATTERN_TRIANGLES)throw Error('Pattern mesh exceeds 200,000 triangles. Increase particle distance.');for(const chain of Object.values(localChains)){const ids=[],ts=[];for(let j=0;j<chain.indices.length-1;j++){ids.push(chain.indices[j]);ts.push(chain.parameters[j]);const mid=mids.get(edgeKey(chain.indices[j],chain.indices[j+1]));if(mid!==undefined){ids.push(mid);ts.push((chain.parameters[j]+chain.parameters[j+1])/2);}}ids.push(chain.indices.at(-1));ts.push(chain.parameters.at(-1));chain.indices=ids;chain.parameters=ts;}for(const [id,chain] of Object.entries(lines)){const out=[];for(let j=0;j<chain.length-1;j++){out.push(chain[j]);const mid=mids.get(edgeKey(chain[j],chain[j+1]));if(mid!==undefined)out.push(mid);}out.push(chain.at(-1));lines[id]=out;}constraints.clear();for(const chain of [...Object.values(localChains).map(c=>c.indices),...Object.values(lines)])for(let i=1;i<chain.length;i++)constraints.add(edgeKey(chain[i-1],chain[i]));improve();}

    constraints.clear();for(const chain of [...Object.values(localChains).map(c=>c.indices),...Object.values(lines)])for(let i=1;i<chain.length;i++)constraints.add(edgeKey(chain[i-1],chain[i]));improve();

    // Smooth only unconstrained interior vertices; reject moves that invert a

    // face or exceed the requested maximum edge length. Boundary IDs stay fixed.

    const fixed=new Set([...constraints].flatMap(k=>k.split(':').map(Number)));

    for(let iteration=0;iteration<12;iteration++){const incident=Array.from({length:points.length},()=>[]),neighbors=Array.from({length:points.length},()=>new Set());for(const t of tris)for(let j=0;j<3;j++){incident[t[j]].push(t);neighbors[t[j]].add(t[(j+1)%3]);neighbors[t[j]].add(t[(j+2)%3]);}for(let i=0;i<points.length;i++){if(fixed.has(i)||!neighbors[i].size)continue;const n=[...neighbors[i]],old=points[i],avg=[0,0];for(const j of n){avg[0]+=points[j][0]/n.length;avg[1]+=points[j][1]/n.length;}points[i]=old.map((v,d)=>(v+avg[d])/2);if(incident[i].some(t=>cross(...t.map(j=>points[j]))<=1e-12)||n.some(j=>length(points[i],points[j])>h*1.001))points[i]=old;}improve();}

    angleRefinement[p.id]=improvePatternAngles(points,tris,constraints,h);if(angleRefinement[p.id].vertexMoves)improve(h*1.001);
    if(hasPoorPatternAngles(points,tris))angleRefinement[p.id].steiner=seedPatternInterior(points,tris,constraints,h,MAX_PATTERN_TRIANGLES-faces.length,contours,{qualityOnly:true}).quality;

    const base=positions.length/3,start=faces.length*3;for(const [x,y] of points){positions.push((p.flip?-x:x)+p.position[0],y+p.position[1],p.position[2]);uvs.push(x,y);}for(const t of tris)faces.push(t.map(i=>i+base));for(const [id,chain] of Object.entries(localChains)){segmentChains[key(p.id,id)]={indices:chain.indices.map(i=>i+base),parameters:chain.parameters};if(p.pins.includes(id)||p.pins.some(i=>Number.isInteger(i)&&p.segments[i]?.id===id))for(const v of chain.indices)pins.add(v+base);}for(const [id,chain] of Object.entries(lines))internalChains[key(p.id,id)]=chain.map(i=>i+base);groups.push({start,count:faces.length*3-start,panel:p.id});

  }

  const sewing=[],unique=new Set(),seamCorrespondence=[];for(const s of doc.seams){const get=ref=>{const chain=segmentChains[key(ref.panel,ref.segment)];return chain.indices.filter((_,i)=>chain.parameters[i]>=ref.start-1e-9&&chain.parameters[i]<=ref.end+1e-9);};const a=get(s.a),b=get(s.b);if(s.reverse)b.reverse();if(a.length!==b.length)throw Error('Seam refinement produced inconsistent sample counts.');const pairs=[];for(let i=0;i<a.length;i++){if(a[i]===b[i])continue;const k=edgeKey(a[i],b[i]);pairs.push([a[i],b[i]]);if(!unique.has(k)){unique.add(k);sewing.push([a[i],b[i]]);}}seamCorrespondence.push({id:s.id,pairs});}

  let minAngle=180,maxEdge=0,minArea=Infinity;for(const t of faces){const p=t.map(i=>[uvs[i*2],uvs[i*2+1]]),lens=[length(p[1],p[2]),length(p[2],p[0]),length(p[0],p[1])];minArea=Math.min(minArea,Math.abs(cross(...p))/2);maxEdge=Math.max(maxEdge,...lens);for(let i=0;i<3;i++){const a=lens[i],b=lens[(i+1)%3],c=lens[(i+2)%3];minAngle=Math.min(minAngle,Math.acos(Math.max(-1,Math.min(1,(b*b+c*c-a*a)/(2*b*c))))*180/Math.PI);}}

  if(minArea<1e-14)throw Error('Pattern triangulation contains degenerate faces.');return {positions,uvs,faces,sewing,pins:[...pins],groups,segmentChains,internalChains,seamCorrespondence,quality:{angleRefinement,triangulationWork,triangles:faces.length,vertices:positions.length/3,minAngleDegrees:minAngle,targetMinAngleDegrees:20,qualityTargetMet:minAngle>=20,maxEdge,particleDistance:h,warnings:minAngle<20?['The 20° minimum-angle target is unmet. Inspect acute corners and narrow constraint spacing before final simulation.']:[]}};

}

