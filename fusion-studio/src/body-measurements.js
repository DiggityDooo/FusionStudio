import * as THREE from 'three';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {evaluateCharacter} from './deformation.js';

export const TORSO_LEVELS=Object.freeze({hips:.54,waist:.64,chest:.74});
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function contains(points,p){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function crosses(a,b,c,d){const on=(p,a,b)=>Math.abs(cross(a,b,p))<1e-12&&p[0]>=Math.min(a[0],b[0])-1e-10&&p[0]<=Math.max(a[0],b[0])+1e-10&&p[1]>=Math.min(a[1],b[1])-1e-10&&p[1]<=Math.max(a[1],b[1])+1e-10;return (cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)||on(c,a,b)||on(d,a,b)||on(a,c,d)||on(b,c,d);}
function checkedMesh(mesh){
  const {positions:p,triangles:t}=mesh||{};
  if(!p||!t||p.length<9||p.length%3||t.length%3||t.length<3||p.length>1500000||t.length>600000)throw Error('Measurements require 1–200,000 triangles and at most 500,000 vertices.');
  for(const v of p)if(!Number.isFinite(v)||Math.abs(v)>100)throw Error('Measurement geometry contains invalid coordinates or exceeds 100 m.');
  for(const i of t)if(!Number.isInteger(i)||i<0||i>=p.length/3)throw Error('Measurement geometry contains an invalid triangle index.');
}

// Intersect triangles, weld material-split endpoints, then trace actual closed loops.
// Open/branched components are retained as diagnostics, never closed by a hull.
export function sectionContours(mesh,y,{tolerance=.000001,validated=false}={}){
  if(!validated)checkedMesh(mesh);
  if(!Number.isFinite(y)||!Number.isFinite(tolerance)||tolerance<1e-7||tolerance>.0001)throw Error('Invalid measurement plane or welding tolerance.');
  const {positions:p,triangles:t}=mesh,nodes=[],adj=[],bins=new Map(),edges=new Set();let coplanar=0;
  const node=point=>{const cell=point.map(v=>Math.floor(v/tolerance));for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)for(const i of bins.get(`${cell[0]+x}:${cell[1]+z}`)||[])if(distance(nodes[i],point)<=tolerance)return i;
    if(nodes.length>=50000)throw Error('Measurement section exceeds 50,000 intersection points.');
    const i=nodes.length,key=cell.join(':');nodes.push(point);adj.push(new Set());if(!bins.has(key))bins.set(key,[]);bins.get(key).push(i);return i;};
  for(let i=0;i<t.length;i+=3){const ids=[t[i]*3,t[i+1]*3,t[i+2]*3],hits=[];
    if(ids.every(j=>Math.abs(p[j+1]-y)<1e-10)){coplanar++;continue;}
    for(let e=0;e<3;e++){const a=ids[e],b=ids[(e+1)%3],da=p[a+1]-y,db=p[b+1]-y;if(Math.abs(da)<1e-10&&Math.abs(db)<1e-10)coplanar++;
      if((da<=0&&db>0)||(db<=0&&da>0)){const u=da/(da-db),point=[p[a]+u*(p[b]-p[a]),p[a+2]+u*(p[b+2]-p[a+2])];if(!hits.some(h=>distance(h,point)<tolerance*.1))hits.push(point);}}
    if(hits.length!==2||distance(hits[0],hits[1])<1e-12)continue;
    const a=node(hits[0]),b=node(hits[1]);if(a===b)continue;const key=a<b?`${a}:${b}`:`${b}:${a}`;if(edges.has(key))continue;edges.add(key);adj[a].add(b);adj[b].add(a);
  }
  const visited=new Set(),contours=[],invalid=[];
  for(let first=0;first<nodes.length;first++){if(visited.has(first))continue;const component=[],stack=[first];visited.add(first);
    while(stack.length){const i=stack.pop();component.push(i);for(const next of adj[i])if(!visited.has(next)){visited.add(next);stack.push(next);}}
    if(component.some(i=>adj[i].size!==2)||component.length<3){invalid.push({points:component.length,reason:'open-or-branched'});continue;}
    if(component.length>4096){invalid.push({points:component.length,reason:'section-too-complex'});continue;}
    const loop=[];let previous=-1,current=first;do{loop.push(nodes[current]);const next=[...adj[current]].find(i=>i!==previous);previous=current;current=next;}while(current!==first&&loop.length<=component.length);
    if(current!==first||loop.length!==component.length){invalid.push({points:component.length,reason:'invalid-loop'});continue;}
    contours.push(loop);
  }
  return {contours,invalid,coplanar,intersectionPoints:nodes.length};
}

export function torsoMeasurements(mesh,{levels=TORSO_LEVELS,center=null,includeContours=false}={}){
  checkedMesh(mesh);const start=performance.now(),p=mesh.positions,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<p.length;i++) {const axis=i%3;min[axis]=Math.min(min[axis],p[i]);max[axis]=Math.max(max[axis],p[i]);}
  const height=max[1]-min[1];if(height<1.2||height>2.2)throw Error('Character height must be 1.2–2.2 m for automatic garment measurements. Adjust source units first.');
  const axis=center||mesh.measurementAxis||[(min[0]+max[0])/2,(min[2]+max[2])/2],origin=[axis[0],min[1],axis[1]],sections={},warnings=[];
  if(axis.length!==2||axis.some(v=>!Number.isFinite(v)))throw Error('Invalid torso measurement axis.');
  for(const name of Object.keys(TORSO_LEVELS)){
    const fraction=levels[name];if(!Number.isFinite(fraction)||fraction<.45||fraction>.85)throw Error('Torso measurement levels must be between 45% and 85% of source height.');
    let y=min[1]+height*fraction,cut=sectionContours(mesh,y,{validated:true}),offset=0;
    // Avoid a coincident triangle edge with one deterministic, reported 0.1 mm shift.
    if(cut.coplanar){offset=.0001;y+=offset;cut=sectionContours(mesh,y,{validated:true});}
    const candidates=cut.contours.filter(loop=>contains(loop,axis));
    let issue=cut.coplanar?'The plane coincides with surface triangles.':cut.invalid.length?'The section contains open or branched boundaries.':candidates.length!==1?`Expected one torso contour around the center; found ${candidates.length}.`:null;
    const loop=candidates[0];
    if(!issue)for(let i=0;i<loop.length&&!issue;i++)for(let j=i+2;j<loop.length;j++){if((j+1)%loop.length===i)continue;if(crosses(loop[i],loop[(i+1)%loop.length],loop[j],loop[(j+1)%loop.length])){issue='The torso contour crosses itself.';break;}}
    if(issue){sections[name]={valid:false,fraction,height:y-min[1],issue};warnings.push(`${name}: ${issue} Repair or isolate the body mesh before measurement grading.`);continue;}
    const low=[Infinity,Infinity],high=[-Infinity,-Infinity];let circumference=0;for(let i=0;i<loop.length;i++){circumference+=distance(loop[i],loop[(i+1)%loop.length]);for(let a=0;a<2;a++){low[a]=Math.min(low[a],loop[i][a]);high[a]=Math.max(high[a],loop[i][a]);}}
    sections[name]={valid:true,fraction,height:y-min[1],circumference,width:high[0]-low[0],depth:high[1]-low[1],center:[(high[0]+low[0])/2,(high[1]+low[1])/2],contourPoints:loop.length,otherClosedContours:cut.contours.length-1,planeOffset:offset,...(includeContours?{outline:loop}: {})};
  }
  if(!(levels.hips<levels.waist&&levels.waist<levels.chest))throw Error('Measurement levels must be ordered hips, waist, chest.');
  return {version:1,method:'neutral-morph-triangle-sections',fidelity:'Inspired',valid:Object.values(sections).every(s=>s.valid),height,origin,sections,warnings,sourceVertices:p.length/3,sourceTriangles:mesh.triangles.length/3,milliseconds:performance.now()-start};
}

export function neutralCharacterMesh(root,{includePosed=false,allowTilted=false,jointNames=null}={}){
  // Dependency evaluation may initialize metadata, correctives and driver caches.
  // Evaluate a private skeleton copy so inspection/cancellation cannot edit the scene.
  root.updateWorldMatrix(true,true);const source=root;root=cloneSkeleton(source);const originals=[],copies=[];source.traverse(n=>originals.push(n));root.traverse(n=>copies.push(n));for(let i=0;i<originals.length;i++)copies[i].uuid=originals[i].uuid;
  root.matrix.copy(source.matrixWorld);root.matrixAutoUpdate=false;
  const report=evaluateCharacter(root);if(!report.valid)throw Error('Resolve character dependency errors before measuring the body.');
  root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion(),translation=new THREE.Vector3();root.matrixWorld.decompose(translation,rotation,scale);
  const axes=[0,1,2].map(i=>new THREE.Vector3().setFromMatrixColumn(root.matrixWorld,i).normalize());
  if(Math.min(...scale.toArray())<=0||Math.max(...scale.toArray())-Math.min(...scale.toArray())>1e-6||root.matrixWorld.determinant()<=0||axes.some((a,i)=>axes.slice(i+1).some(b=>Math.abs(a.dot(b))>1e-6)))throw Error('Apply a positive uniform character scale without shear before body measurement.');
  if(!allowTilted&&new THREE.Vector3(0,1,0).applyQuaternion(rotation).dot(new THREE.Vector3(0,1,0))<.9999)throw Error('Keep the character upright before measurement grading. Yaw rotation is supported.');
  const positions=[],triangles=[],posedPositions=includePosed?[]:null,point=new THREE.Vector3(),anchors={};let meshes=0,measurementAxis;
  if(jointNames&&(!Object.keys(jointNames).length||Object.keys(jointNames).length>16||Object.values(jointNames).some(n=>typeof n!=='string'||!n.length||n.length>200)))throw Error('Invalid reviewed joint mapping.');
  root.traverseVisible(mesh=>{if(!mesh.isSkinnedMesh||root.userData.fusion_creator&&mesh.userData.fusion_creator_part!=='body')return;let parent=mesh.parent;while(parent&&parent!==root){if(parent.isBone)throw Error('Measure a body mesh that is independent of posed bone parenting.');parent=parent.parent;}
    const g=mesh.geometry,n=g.attributes.position.count,index=g.index,offset=positions.length/3;if(positions.length/3+n>500000||triangles.length+(index?.count||n)>600000)throw Error('Character measurement mesh limit exceeded.');
    if(includePosed)mesh.skeleton.update();const matrix=inverse.clone().multiply(mesh.matrixWorld);
    if(root.userData.fusion_creator){const pelvis=mesh.skeleton.bones.findIndex(b=>b.name==='pelvis');if(pelvis<0)throw Error('The creator garment rig is missing its pelvis landmark.');const bind=new THREE.Vector3().setFromMatrixPosition(mesh.skeleton.boneInverses[pelvis].clone().invert()).applyMatrix4(mesh.bindMatrix.clone().invert()).applyMatrix4(matrix);measurementAxis=[bind.x,bind.z];}
    for(const [key,name] of Object.entries(jointNames||{})){const matches=mesh.skeleton.bones.flatMap((b,i)=>b.name===name?[i]:[]);if(matches.length>1)throw Error('Ambiguous reviewed joint: '+name);if(matches.length){const anchor=new THREE.Vector3().setFromMatrixPosition(mesh.skeleton.boneInverses[matches[0]].clone().invert()).applyMatrix4(mesh.bindMatrix.clone().invert()).applyMatrix4(matrix).toArray();if(anchors[key]&&new THREE.Vector3(...anchors[key]).distanceTo(new THREE.Vector3(...anchor))>1e-5)throw Error('Inconsistent bind landmark across body parts: '+name);anchors[key]=anchor;}}
    for(let i=0;i<n;i++){THREE.Mesh.prototype.getVertexPosition.call(mesh,i,point);point.applyMatrix4(matrix);positions.push(point.x,point.y,point.z);if(includePosed){mesh.getVertexPosition(i,point);point.applyMatrix4(mesh.matrixWorld);posedPositions.push(point.x,point.y,point.z);}}
    for(let i=0;i<(index?.count||n);i++)triangles.push(offset+(index?index.getX(i):i));meshes++;
  });
  if(!meshes)throw Error('Select an imported skinned body to measure.');
  for(const key of Object.keys(jointNames||{}))if(!anchors[key])throw Error('The reviewed joint is missing from the body skeleton: '+jointNames[key]);
  return {positions,triangles,worldScale:scale.x,sourceId:root.userData.fusion_id||root.uuid,...(measurementAxis?{measurementAxis}:{}),...(jointNames?{anchors}:{}),...(includePosed?{posedPositions,worldMatrix:root.matrixWorld.toArray()}: {})};
}

export function measureNeutralMesh(mesh,options={}){
  const report=torsoMeasurements(mesh,options);
  report.worldScale=mesh.worldScale;report.sourceId=mesh.sourceId;
  report.notes=['Circumferences follow surface contours at fixed source-height levels, not anatomical landmarks or medical measurements.','Bone posing is excluded; current resolved morphs, including active correctives, are included.','Measurements use source-local metres. Positive uniform object scale is applied separately during placement.'];
  return report;
}

export function measureCharacter(root,options={}){const start=performance.now(),report=measureNeutralMesh(neutralCharacterMesh(root),options);report.milliseconds=performance.now()-start;return report;}

export function validateMeasurementSnapshot(snapshot){
  const r=snapshot?.report,levels=snapshot?.levels;
  if(snapshot?.version!==1||!r||r.version!==1||r.method!=='neutral-morph-triangle-sections'||r.fidelity!=='Inspired'||typeof r.valid!=='boolean'||typeof r.sourceId!=='string'||r.sourceId.length>100||!Number.isFinite(r.height)||r.height<1.2||r.height>2.2||!Number.isFinite(r.worldScale)||r.worldScale<=0||!Number.isFinite(r.milliseconds)||r.milliseconds<0)throw Error('Invalid saved body measurement report.');
  if(!levels||!Object.keys(TORSO_LEVELS).every(n=>Number.isFinite(levels[n])&&levels[n]>=.45&&levels[n]<=.85)||!(levels.hips<levels.waist&&levels.waist<levels.chest))throw Error('Invalid saved body measurement planes.');
  if(!r.sections||Object.keys(r.sections).length!==3||!Number.isInteger(r.sourceVertices)||r.sourceVertices<3||r.sourceVertices>500000||!Number.isInteger(r.sourceTriangles)||r.sourceTriangles<1||r.sourceTriangles>200000)throw Error('Invalid saved body measurement source.');
  for(const name of Object.keys(TORSO_LEVELS)){
    const s=r.sections?.[name];if(!s||typeof s.valid!=='boolean'||s.fraction!==levels[name]||!Number.isFinite(s.height)||s.height<0||s.height>r.height+.001)throw Error('Invalid saved body measurement section.');
    if(s.valid){for(const key of ['circumference','width','depth'])if(!Number.isFinite(s[key])||s[key]<=0||s[key]>10)throw Error('Invalid saved body measurement dimension.');if(s.outline&&(!Array.isArray(s.outline)||s.outline.length<3||s.outline.length>4096||s.outline.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||Math.abs(v)>100))))throw Error('Invalid saved body measurement outline.');}
    else if(typeof s.issue!=='string'||s.issue.length>1000)throw Error('Invalid saved body measurement diagnostic.');
  }
  if(r.valid!==Object.values(r.sections).every(s=>s.valid)||!Array.isArray(r.warnings)||r.warnings.length>20||r.warnings.some(w=>typeof w!=='string'||w.length>1000))throw Error('Invalid saved body measurement diagnostics.');
  return snapshot;
}
