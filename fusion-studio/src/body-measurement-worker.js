import {measureNeutralMesh} from './body-measurements.js';
self.onmessage=({data})=>{const {id,mesh,levels}=data;try{self.postMessage({id,report:measureNeutralMesh(mesh,{levels,includeContours:true})});}catch(error){self.postMessage({id,error:error.message});}};
