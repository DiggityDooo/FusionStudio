import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {compactPrimitive} from '../src/geometry-interchange.js';
import {createSkinWeightModel,weightPatch,applySkinPatch,brushRegion} from '../src/skin-weights.js';
const fixture=JSON.parse(fs.readFileSync('test-output/dson-integration-results.json')),bytes=fs.readFileSync(fixture.output),{scene:original}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');original.traverse(n=>{if(n.isSkinnedMesh)n.geometry=compactPrimitive(n.geometry);});const rows=[];
for(const copies of [1,2,3]){
 const root=new THREE.Group();for(let i=0;i<copies;i++)root.add(clone(original));const start=performance.now(),model=await createSkinWeightModel(root),prepareMs=performance.now()-start,mesh=model.meshes[0],source=model.rows.get(model.vertexKeys.get(mesh.uuid)[mesh.geometry.index.getX(0)]),point=model.position(source).toArray(),brushStart=performance.now(),region=brushRegion(model,{meshId:mesh.uuid,faceIndex:0,point,radius:.06}),brushMs=performance.now()-brushStart;
 const row=[...model.rows.values()].find(r=>r.weights.size>1),[bone,value]=[...row.weights][0],patch=weightPatch(model,[{key:row.key,boneId:bone,value:Math.min(.95,value+.05)}]),applyStart=performance.now(),report=await applySkinPatch(root,patch),applyMs=performance.now()-applyStart;assert.equal(report.changedVertices,1);rows.push({copies,triangles:50312*copies,sourceVertices:model.rows.size,viewportVertices:model.vertexCount,joints:model.bones.size,prepareMs,brushVertices:region.size,brushMs,applyMs});
}
const report={passed:true,cpu:os.cpus()[0].model,rows,limits:['300,000 viewport vertices, 2,048 joints, 1,024 skinned parts.','Preparation and commit hash current input buffers; commit also clones affected geometry. They are not frame-rate guarantees.','Repeated detailed Genesis figures measure scaling; they are not additional paid content in the application.']};fs.writeFileSync('test-output/skin-weights-performance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
