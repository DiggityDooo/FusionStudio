import fs from 'node:fs';
import * as THREE from 'three';
import {lodInput} from '../src/lod-geometry.js';
import {reduceLod} from '../src/lod-reduction.js';
const rows=[];
for(const [radial,tubular]of [[64,384],[128,384],[128,768]]){
 const geometry=new THREE.TorusGeometry(.5,.15,radial,tubular),start=performance.now(),input=lodInput(geometry),prepareMilliseconds=performance.now()-start;
 for(const keep of [.5,.25]){const started=performance.now(),row={sourceTriangles:input.index.length/3,sourceVertices:input.positions.length/3,keep,prepareMilliseconds};try{const result=reduceLod(input,{keep});rows.push({...row,status:'completed',...result.diagnostics});}catch(error){rows.push({...row,status:'limited',milliseconds:performance.now()-started,error:error.message});if(!/budget exceeded/.test(error.message))throw error;}}
}
const report={date:new Date().toISOString(),backend:'JavaScript CPU; interactive app runs this kernel in a cancellable Web Worker',scope:'Torus charts with UV boundaries, not a general character/pose performance guarantee',rows};fs.mkdirSync(new URL('../test-output/code-review/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../test-output/code-review/lod-performance.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
