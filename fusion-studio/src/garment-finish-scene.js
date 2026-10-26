import * as THREE from 'three';
import {FINISH_LIMITS,garmentFinishSettings,validateFinishSource} from './garment-finishing.js';
import {validateSourceInterpolation,interpolateSourceColors} from './garment-refinement.js';
const cacheKey='garmentFinishSource';
export function garmentMesh(owner){const meshes=[];owner.traverse(n=>{if(n.isMesh)meshes.push(n);});if(meshes.length!==1||meshes[0].isSkinnedMesh)throw Error('Finishing requires one static simulation mesh in a linked garment.');return meshes[0];}
export function retainedFinishSource(mesh){
 const cache=mesh.geometry.userData[cacheKey];if(!cache)return null;
 if(![1,2].includes(cache.version))throw Error('Unsupported saved garment finishing source.');const n=validateFinishSource(cache.source),p=mesh.geometry.attributes.position;
 const index=mesh.geometry.index,uv=mesh.geometry.attributes.uv,normal=mesh.geometry.attributes.normal;
 if(!p||!index||!uv||!normal||uv.count!==p.count||normal.count!==p.count||uv.array.some(v=>!Number.isFinite(v))||normal.array.some(v=>!Number.isFinite(v))||p.count>FINISH_LIMITS.vertices||index.count/3>FINISH_LIMITS.triangles||!Array.isArray(cache.faceSource)||cache.faceSource.length!==index.count/3||cache.faceSource.some(i=>!Number.isSafeInteger(i)||i< -1||i>=cache.source.faces.length)||p.array.some(v=>!Number.isFinite(v)||Math.abs(v)>100)||index.array.some(i=>!Number.isSafeInteger(i)||i<0||i>=p.count))throw Error('Saved garment finishing has an invalid source mapping. Reopen a prior version or re-drape.');
 if(cache.version===2)validateSourceInterpolation(cache.sourceInterpolation,n,p.count);else if(!Array.isArray(cache.sourceVertex)||cache.sourceVertex.length!==p.count||cache.sourceVertex.some(i=>!Number.isSafeInteger(i)||i<0||i>=n))throw Error('Saved garment finishing has an invalid vertex mapping.');
 return cache.source;
}
export function captureGarmentSource(owner){
 const mesh=garmentMesh(owner),cached=retainedFinishSource(mesh);if(cached)return structuredClone(cached);
 const g=mesh.geometry,p=g.attributes.position,uv=g.attributes.uv,index=g.index;
 if(!p||!uv||!index||index.count%3||p.count>FINISH_LIMITS.sourceVertices||index.count/3>FINISH_LIMITS.sourceTriangles||Object.keys(g.morphAttributes).length)throw Error('Finishing needs indexed linked panels with UVs, up to 50,000 simulation triangles.');
 const source={positions:Array.from({length:p.count*3},(_,i)=>p.getComponent(Math.floor(i/3),i%3)),uvs:Array.from({length:uv.count*2},(_,i)=>uv.getComponent(Math.floor(i/2),i%2)),faces:Array.from({length:index.count/3},(_,i)=>[index.getX(i*3),index.getX(i*3+1),index.getX(i*3+2)]),sewing:[],groups:structuredClone(g.groups)};
 const normal=g.attributes.normal;if(normal)source.normals=Array.from({length:normal.count*3},(_,i)=>normal.getComponent(Math.floor(i/3),i%3));if(g.userData.strainColors)source.strainColors=Array.from(g.userData.strainColors);validateFinishSource(source);return source;
}
function validateResult(source,result,settings){
 const n=result?.positions?.length/3,sourceCount=source.positions.length/3;
 if(!Number.isInteger(n)||n<6||n>FINISH_LIMITS.vertices||!Array.isArray(result.positions)||result.positions.some(v=>!Number.isFinite(v)||Math.abs(v)>100)||!Array.isArray(result.uvs)||result.uvs.length!==n*2||result.uvs.some(v=>!Number.isFinite(v)||Math.abs(v)>200)||!Array.isArray(result.normals)||result.normals.length!==n*3||result.normals.some(v=>!Number.isFinite(v)||Math.abs(v)>1.001)||!Array.isArray(result.faces)||!result.faces.length||result.faces.length>FINISH_LIMITS.triangles||result.faces.some(t=>!Array.isArray(t)||t.length!==3||t.some(i=>!Number.isSafeInteger(i)||i<0||i>=n))||!Array.isArray(result.faceSource)||result.faceSource.length!==result.faces.length||result.faceSource.some(i=>!Number.isSafeInteger(i)||i< -1||i>=source.faces.length))throw Error('Finishing returned invalid geometry or attribute mappings. The previous garment is retained.');
 if(settings.refinement){validateSourceInterpolation(result.sourceInterpolation,sourceCount,n);const r=result.diagnostics?.refinement;if(!r||r.levels!==settings.refinement||r.strength!==settings.strength||r.boundary!==settings.boundary||!Number.isFinite(r.maximumShiftM)||r.maximumShiftM<0)throw Error('Finishing returned invalid refinement diagnostics.');}else if(!Array.isArray(result.sourceVertex)||result.sourceVertex.length!==n||result.sourceVertex.some(i=>!Number.isSafeInteger(i)||i<0||i>=sourceCount))throw Error('Finishing returned invalid vertex mappings.');
 if(!Array.isArray(result.groups)||result.groups.length>result.faces.length||result.groups.some(g=>!Number.isSafeInteger(g.start)||g.start<0||g.start%3||!Number.isSafeInteger(g.count)||g.count<=0||g.count%3||g.start+g.count>result.faces.length*3||!Number.isSafeInteger(g.materialIndex)||g.materialIndex<0||g.materialIndex>255))throw Error('Finishing returned invalid material remapping.');
 const covered=new Uint8Array(result.faces.length);for(const g of result.groups)for(let f=g.start/3;f<(g.start+g.count)/3;f++){if(covered[f])throw Error('Finishing returned overlapping material groups.');covered[f]=1;}if(covered.some(v=>v!==1))throw Error('Finishing returned incomplete material groups.');
 const d=result.diagnostics;if(!d||d.sourceVertices!==sourceCount||d.sourceTriangles!==source.faces.length||d.vertices!==n||d.triangles!==result.faces.length||d.collisionEvaluated!==false||!Number.isFinite(d.maximumJoinDisplacement)||d.maximumJoinDisplacement<0||d.maximumJoinDisplacement>settings.joinTolerance+1e-12)throw Error('Finishing returned invalid diagnostics.');
}
function geometryFrom(data){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(data.uvs,2));g.setIndex(data.faces.flat());if(data.normals)g.setAttribute('normal',new THREE.Float32BufferAttribute(data.normals,3));else g.computeVertexNormals();for(const group of data.groups)g.addGroup(group.start,group.count,group.materialIndex);g.computeBoundingSphere();return g;}
export function applyGarmentFinishing(owner,source,result,input){
 const settings=garmentFinishSettings(input),mesh=garmentMesh(owner);validateFinishSource(source);let next;
 if(settings.enabled){const fullSource={...structuredClone(source),sewing:structuredClone(result?.sewing||source.sewing)};validateFinishSource(fullSource);validateResult(fullSource,result,settings);next=geometryFrom(result);next.userData[cacheKey]={version:settings.refinement?2:1,source:fullSource,...(settings.refinement?{sourceInterpolation:structuredClone(result.sourceInterpolation)}:{sourceVertex:structuredClone(result.sourceVertex)}),faceSource:structuredClone(result.faceSource)};if(fullSource.strainColors)next.userData.strainColors=settings.refinement?interpolateSourceColors(fullSource.strainColors,result.sourceInterpolation):result.sourceVertex.flatMap(i=>fullSource.strainColors.slice(i*3,i*3+3));owner.userData.liveGarment.finishDiagnostics=structuredClone(result.diagnostics);}
 else{next=geometryFrom(source);if(source.strainColors)next.userData.strainColors=structuredClone(source.strainColors);delete owner.userData.liveGarment.finishDiagnostics;}
 if(owner.userData.liveGarment.heatmap&&next.userData.strainColors)next.setAttribute('color',new THREE.Float32BufferAttribute(next.userData.strainColors,3));
 const previous=mesh.geometry;mesh.geometry=next;owner.userData.liveGarment.finish=settings;previous.dispose();return owner;
}
export function validateGarmentFinishing(owner){
 if(owner.isMesh&&owner.geometry.userData[cacheKey]&&owner.parent?.userData.liveGarment?.finish?.enabled!==true)throw Error('A retained finishing source has lost its linked garment. Use a static working copy or a prior project version.');
 const finish=owner.userData.liveGarment?.finish;if(!finish)return;
 const settings=garmentFinishSettings(finish),mesh=garmentMesh(owner),source=retainedFinishSource(mesh);if(settings.enabled!==!!source)throw Error('Saved garment finishing and simulation geometry disagree. Reopen a prior project version.');
 if(settings.enabled){const d=owner.userData.liveGarment.finishDiagnostics;if(!d||d.sourceTriangles!==source.faces.length||d.triangles!==mesh.geometry.index.count/3||d.collisionEvaluated!==false||!!settings.refinement!==(mesh.geometry.userData[cacheKey].version===2))throw Error('Saved finishing diagnostics do not match its surfaces.');if(settings.refinement&&(d.refinement?.levels!==settings.refinement||d.refinement?.strength!==settings.strength||d.refinement?.boundary!==settings.boundary))throw Error('Saved subdivision settings and diagnostics disagree.');}
}
export function stripGarmentFinishGeometry(geometry,{clone=false}={}){
 if(!geometry.userData[cacheKey])return geometry;const result=clone?geometry.clone():geometry;result.userData={...result.userData};delete result.userData[cacheKey];delete result.userData.strainColors;return result;
}
