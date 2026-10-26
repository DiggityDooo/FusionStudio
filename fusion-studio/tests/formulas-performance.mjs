import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {evaluateFormulas} from '../src/formula-engine.js';
import {evaluateCharacter} from '../src/deformation.js';

function measure(run,count=20){for(let i=0;i<3;i++)run();const samples=[];for(let i=0;i<count;i++){const start=performance.now();run();samples.push(performance.now()-start);}samples.sort((a,b)=>a-b);return {samples:count,medianMs:samples[Math.floor(count/2)],p95Ms:samples[Math.ceil(count*.95)-1],maxMs:samples.at(-1)};}
const graphs=[];for(const count of [128,1024,4096]){const channels=Array.from({length:count+1},(_,i)=>({id:'p'+i,value:i?0:1})),formulas=Array.from({length:count},(_,i)=>({output:'p'+(i+1),operations:[{op:'push',url:'p'+i},{op:'push',val:1},{op:'add'}]}));graphs.push({formulas:count,...measure(()=>{const report=evaluateFormulas(channels,formulas);assert.equal(report.valid,true);assert.equal(report.values['p'+count+'?value'],count+1);})});}
const fixture=JSON.parse(fs.readFileSync('test-output/dson-integration-results.json')),bytes=fs.readFileSync(fixture.output),{scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');const real=measure(()=>{const report=evaluateCharacter(scene);assert.equal(report.valid,true);assert.equal(report.rotations.length,16);});
const report={date:new Date().toISOString(),cpu:os.cpus()[0].model,graphs,genesis:{formulas:20,joints:16,verifiedFrames:137,triangles:50312,...real},scope:'Warm dependency/deformation evaluation only; excludes picking, viewport, history, project serialization and garment drape. Scalar chains use increasing graph sizes; the Genesis surface is a real detailed fixture.'};fs.writeFileSync('test-output/formulas-performance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
