import * as THREE from 'three';
import {validateTangentInput,validateTangents,TANGENT_CORNER_LIMIT} from './tangent-data.js';
function corners(geometry){
 const p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv,count=geometry.index?.count||p?.count;
 if(!p||!n||!uv||p.itemSize!==3||n.itemSize!==3||uv.itemSize!==2||n.count!==p.count||uv.count!==p.count||count%3||count>TANGENT_CORNER_LIMIT)throw Error('Normal-mapped meshes need positions, unit normals and UV0, within 200,000 triangles, for MikkTSpace export.');
 const attributes=[...Object.values(geometry.attributes),...Object.values(geometry.morphAttributes).flat()],bytes=attributes.reduce((sum,a)=>sum+count*a.itemSize*a.array.BYTES_PER_ELEMENT,0);if(bytes>96*1048576)throw Error('Expanded tangent geometry exceeds 96 MiB. Reduce the working mesh or export with authored tangents.');
 const positions=new Float32Array(count*3),normals=new Float32Array(count*3),uvs=new Float32Array(count*2);
 for(let c=0;c<count;c++){const i=geometry.index?geometry.index.getX(c):c;if(!Number.isSafeInteger(i)||i<0||i>=p.count)throw Error('Invalid tangent source index.');positions.set([p.getX(i),p.getY(i),p.getZ(i)],c*3);normals.set([n.getX(i),n.getY(i),n.getZ(i)],c*3);uvs.set([uv.getX(i),uv.getY(i)],c*2);}
 return {positions,normals,uvs};
}
export function tangentWorker(input,{signal,timeoutMs=30000}={}){
 if(signal?.aborted)return Promise.reject(Error('Tangent generation cancelled.'));
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./tangent-worker.js',import.meta.url),{type:'module'}),id=crypto.randomUUID();let done=false;
  const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);worker.terminate();error?reject(error):resolve(result);},cancel=()=>finish(Error('Tangent generation cancelled.')),timer=setTimeout(()=>finish(Error('Tangent generation exceeded 30 seconds. Reduce the working mesh.')),timeoutMs);
  worker.onerror=e=>{e.preventDefault?.();finish(Error('Tangent worker failed: '+e.message));};worker.onmessageerror=()=>finish(Error('Malformed tangent worker message.'));worker.onmessage=({data})=>{if(data?.id!==id){finish(Error('Tangent reply belongs to another request.'));return;}data.error?finish(Error(data.error)):finish(null,data);};signal?.addEventListener('abort',cancel,{once:true});worker.postMessage({id,input});if(signal?.aborted)cancel();
 });
}
// Used exclusively on the disposable exchange scene. Editable geometry and
// garment/source caches never receive expanded corner buffers or tangents.
export async function addExchangeTangents(root,{signal,compute=tangentWorker}={}){
 const meshes=[];root.traverse(m=>{if(m.isMesh&&[].concat(m.material).some(mat=>mat?.normalMap)&&!m.geometry.attributes.tangent)meshes.push(m);});
 for(const mesh of meshes)for(const material of [].concat(mesh.material)){const texture=material?.normalMap;if(!texture)continue;if(texture.channel!==0||material.normalMapType!==THREE.TangentSpaceNormalMap||texture.offset.x!==0||texture.offset.y!==0||texture.repeat.x!==1||texture.repeat.y!==1||texture.rotation!==0||texture.center.x!==0||texture.center.y!==0||!texture.matrixAutoUpdate&&!texture.matrix.equals(new THREE.Matrix3()))throw Error('Generated tangents currently require tangent-space normal maps on UV0 without texture-coordinate transforms. Keep authored tangents or export without generation.');}
 if(meshes.reduce((sum,m)=>sum+(m.geometry.index?.count||m.geometry.attributes.position?.count||0),0)>1200000)throw Error('MikkTSpace export supports 400,000 generated triangles per scene. Split the working export.');
 const report={version:1,algorithm:'MikkTSpace',threeVersion:THREE.REVISION,generated:[],preservedAuthored:0};
 root.traverse(m=>{if(m.isMesh&&m.geometry.attributes.tangent)report.preservedAuthored++;});
 for(const mesh of meshes){if(signal?.aborted)throw Error('Tangent generation cancelled.');const geometry=mesh.geometry,input=corners(geometry),metrics=validateTangentInput(input),result=await compute(input,{signal});if(signal?.aborted)throw Error('Tangent generation cancelled.');const tangent=validateTangents(result.tangents,input),copy=geometry.index?geometry.toNonIndexed():geometry.clone();copy.setAttribute('tangent',new THREE.BufferAttribute(tangent,4));mesh.geometry=copy;report.generated.push({mesh:mesh.name,sourceVertices:geometry.attributes.position.count,...metrics,milliseconds:result.metrics?.milliseconds??null});}
 return report;
}
