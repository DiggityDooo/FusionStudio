import * as MikkTSpace from 'three/addons/libs/mikktspace.module.js';
import {validateTangentInput,validateTangents} from './tangent-data.js';
self.onmessage=async({data})=>{
 const {id,input}=data;
 try{const metrics=validateTangentInput(input),start=performance.now();await MikkTSpace.ready;const tangents=MikkTSpace.generateTangents(input.positions,input.normals,input.uvs);for(let i=3;i<tangents.length;i+=4)tangents[i]*=-1;validateTangents(tangents,input);self.postMessage({id,tangents,metrics:{...metrics,milliseconds:performance.now()-start}},[tangents.buffer]);}catch(error){self.postMessage({id,error:error.message});}
};
