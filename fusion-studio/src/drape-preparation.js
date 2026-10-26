import * as THREE from 'three';
import {buildPattern,validatePattern} from './patterns.js';
import {applyFabricResponse} from './fabric-materials.js';
import {canonicalPlacementPositions} from './garment-placement.js';

export function previewDrapeSettings(input={}){
 const steps=input.steps??160,iterations=input.iterations??10;
 if(!Number.isInteger(steps)||steps<1||steps>240||!Number.isInteger(iterations)||iterations<1||iterations>24)throw Error('Drape settings require 1–240 steps and 1–24 solver iterations.');
 return {steps,iterations};
}
function checkDrapeWork(request){
 const {steps,iterations}=previewDrapeSettings(request),vertices=request.positions.length,triangles=request.faces.length;
 if(vertices>60000||triangles>100000)throw Error('Linked draping supports 60,000 vertices and 100,000 triangles. Increase particle distance and keep the previous drape.');
 if((vertices+triangles*3)*steps*iterations*Math.max(1,request.colliders.length)>600000000)throw Error('This drape exceeds the preview work limit. Reduce solver iterations or steps in Drape settings, or increase pattern particle distance. The previous drape is retained.');
}

export function gradePattern(base,body){
  validatePattern(base);
  if(!Number.isFinite(body.height)||body.height<1.2||body.height>2.2)throw Error('Live fit supports body heights from 1.2 to 2.2 m.');
  const doc=structuredClone(base),h=body.height/1.8,width=Math.max(body.shoulders,body.waist,body.hips),depth=body.chest;
  if(!Number.isFinite(width)||!Number.isFinite(depth)||width<.5||width>2||depth<.5||depth>2)throw Error('Body proportions exceed live-fit limits.');
  for(const panel of doc.panels){const grade=([x,y])=>[x*h*width,y*h];panel.points=panel.points.map(grade);for(const ring of [panel,...(panel.holes||[])]){if(ring!==panel)ring.points=ring.points.map(grade);for(const segment of ring.segments||[])if(segment.controls)segment.controls=segment.controls.map(grade);}for(const line of panel.internalLines||[])line.points=line.points.map(grade);panel.position=panel.position.map((v,i)=>v*h*(i===0?width:i===2?depth:1));}
  return doc;
}
// Build only from an immutable scene capture; no live object or document access.
export function buildDrapeInput(base,captured,settings={}){
  if(!captured||typeof captured.imported!=='boolean'||!Array.isArray(captured.world)||captured.world.length!==16||captured.world.some(v=>!Number.isFinite(v)))throw Error('Invalid captured garment inputs.');
  const {imported,capture,body,triangleCollider,colliders}=captured,doc=gradePattern(base,body),data=buildPattern(doc),scale=body.height/1.8,world=new THREE.Matrix4().fromArray(captured.world);
  const positions=[],sourcePositions=[],restPositions=[];for(let i=0;i<data.positions.length;i+=3){
    const v=new THREE.Vector3().fromArray(data.positions,i);restPositions.push(v.clone().applyMatrix4(world).toArray());
    const h=scale,x=v.x/h,y=v.y/h,side=Math.sign(v.z);
    if(Math.abs(x)>.28&&y>1.17){v.z=side*h*.13*Math.sqrt(Math.max(.01,1-((y-1.36)/.17)**2));}
    else {const depth=.18-Math.max(0,Math.min(1,(y-1.35)/.15))*.10;v.z=side*h*depth*Math.sqrt(Math.max(.01,1-(x/(.31*Math.max(body.shoulders,body.waist)))**2));}
    if(data.pins.includes(i/3))v.z=0;if(capture)sourcePositions.push(v.clone().add(new THREE.Vector3(...body.origin)).toArray());positions.push(v.applyMatrix4(world).toArray());
  }
  const fabrics={cotton:[1e-7,1e-4],denim:[1e-8,1e-5],silk:[5e-7,1e-3]};const [stretch,bend]=fabrics[doc.fabric];
  const detailed=imported||base.version===2;
  const input={doc,data,body,placement:capture?{capture,positions:sourcePositions,faces:data.faces,sewing:data.sewing,pins:data.pins}:null,request:{...(detailed?{triangleCollider,seamTopology:base.version===2,solidContact:imported,initializeOutside:imported,materialCoordinates:Array.from({length:data.uvs.length/2},(_,i)=>data.uvs.slice(i*2,i*2+2)),fabricCompliance:[stretch,stretch*1.5,stretch*3],friction:.25,triangleSelfCollision:true}:{}),positions,restPositions:capture?canonicalPlacementPositions(restPositions):restPositions,faces:data.faces,sewing:data.sewing,pins:data.pins,colliders,steps:settings.steps??160,iterations:settings.iterations??10,stretch,bend,thickness:.003,selfCollision:true,executionBudget:'offline'}};
  if(settings.fabricResponse){input.request.materialCoordinates=Array.from({length:data.uvs.length/2},(_,i)=>data.uvs.slice(i*2,i*2+2));input.request=applyFabricResponse(input.request,settings.fabricResponse,new THREE.Vector3().setFromMatrixColumn(world,0).length());}checkDrapeWork(input.request);return input;
}
