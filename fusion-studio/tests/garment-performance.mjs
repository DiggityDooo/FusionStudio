import fs from 'node:fs';
import os from 'node:os';
import {createRequire} from 'node:module';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {starterPattern,migratePattern,buildPattern} from '../src/patterns.js';
import {liveTshirtPattern,drapeRequest} from '../src/hybrid.js';
const native=createRequire(import.meta.url)('../native/fusion_geometry.node'),meshing=[],drape=[];
for(const h of [.04,.018,.011]){const doc=migratePattern(starterPattern());doc.particleDistance=h;const start=performance.now(),data=buildPattern(doc);meshing.push({particleDistance:h,milliseconds:performance.now()-start,...data.quality});}
const fixture=JSON.parse(fs.readFileSync('test-output/dson-integration-results.json')),bytes=fs.readFileSync(fixture.output),{scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
for(const h of [.05,.04,.025]){const doc=liveTshirtPattern();doc.particleDistance=h;const start=performance.now(),{request,data}=drapeRequest(doc,scene,{steps:5,iterations:6}),result=JSON.parse(native.drapeGarment(JSON.stringify(request)));drape.push({particleDistance:h,triangles:data.faces.length,colliderTriangles:request.triangleCollider.triangles.length,steps:5,iterations:6,preparationAndSolveMs:performance.now()-start,...result.metrics});}
const report={date:new Date().toISOString(),cpu:os.cpus()[0].model,meshing,drape,limits:'Individual local samples, not frame-rate claims. Drape is only 5 steps for size scaling, not a converged fit. Full Genesis drape and visual acceptance are separate gates. Geometry jobs retain their 30-second cancellation limit; fine garments may exceed it.'};fs.writeFileSync('test-output/garment-performance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
