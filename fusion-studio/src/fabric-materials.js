import {clothContactIssues} from './cloth-contacts.js';
// Original nominal studies. These are editable SI parameters, not calibrated
// cotton/denim/silk data or reconstructed proprietary fabric presets.
export const FABRIC_STUDIES=Object.freeze({
 'Woven study':{densityKgM2:.2,warpNpm:1500,weftNpm:1000,shearNpm:150,bendingNm:.00005},
 'Heavy woven study':{densityKgM2:.4,warpNpm:5000,weftNpm:3500,shearNpm:500,bendingNm:.0002},
 'Soft study':{densityKgM2:.08,warpNpm:350,weftNpm:250,shearNpm:40,bendingNm:.000005}
});
export function fabricResponse(input={}){
 const m={version:1,...FABRIC_STUDIES['Woven study'],seamNpm2:1e6,contactNpm:1e5,linearSolver:'auto',dampingPerSecond:6,timeStep:1/120,linearIterations:64,linearTolerance:1e-5,linearAbsoluteToleranceN:1e-10,...input.material};
 const limits={densityKgM2:[.01,2],warpNpm:[1,1e6],weftNpm:[1,1e6],shearNpm:[1,1e6],bendingNm:[0,1],seamNpm2:[1e3,1e9],contactNpm:[1e3,1e8],dampingPerSecond:[0,50],timeStep:[1/240,1/30],linearIterations:[4,512],linearTolerance:[1e-8,1e-2],linearAbsoluteToleranceN:[1e-14,1e-3]};
 if(input.version!==undefined&&input.version!==1||m.version!==1)throw Error('Unsupported saved fabric-response version.');
 if(!['auto','pcg','sparse'].includes(m.linearSolver))throw Error('Fabric linearSolver must be auto, pcg or sparse.');
 const material={version:1,linearSolver:m.linearSolver};for(const [k,[lo,hi]] of Object.entries(limits)){const v=m[k];if(!Number.isFinite(v)||v<lo||v>hi||k==='linearIterations'&&!Number.isInteger(v))throw Error(`Fabric ${k} must be ${lo}–${hi}.`);material[k]=v;}
 const friction=input.friction??.3,steps=input.steps??160,iterations=input.iterations??4;if(!Number.isFinite(friction)||friction<0||friction>1||!Number.isInteger(steps)||steps<1||steps>240||!Number.isInteger(iterations)||iterations<1||iterations>24)throw Error('Fabric response needs friction 0–1, 1–240 steps and 1–24 material iterations.');
 let preview;if(input.preview){const p=input.preview;if(!Number.isInteger(p.steps)||p.steps<1||p.steps>240||!Number.isInteger(p.iterations)||p.iterations<1||p.iterations>24)throw Error('Invalid saved preview settings.');preview={steps:p.steps,iterations:p.iterations};}
 return {version:1,material,friction,steps,iterations,...preview?{preview}:{}};
}
export function applyFabricResponse(request,input,uniformScale=1){
 if(!input)return request;const response=fabricResponse(input);
 if(!Number.isFinite(uniformScale)||uniformScale<=0||uniformScale>100||!Array.isArray(request.materialCoordinates))throw Error('Physical fabric needs consistent rest geometry and grain coordinates.');
 return {...request,fabricMaterial:response.material,friction:response.friction,steps:response.steps,iterations:response.iterations,materialCoordinates:request.materialCoordinates.map(p=>p.map(v=>v*uniformScale)),seamTopology:true,triangleSelfCollision:true,executionBudget:'offline'};
}
export function fabricResponseIssues(metrics,input){
 const p=metrics?.physicalFabric;if(!p)return [];const {material}=fabricResponse(input),issues=[];
 if(p.maximumSpeedMps>.02)issues.push(`Cloth is still moving at ${p.maximumSpeedMps.toFixed(3)} m/s; allow more settling.`);
 if(p.lastLinearAbsoluteResidualN>material.linearAbsoluteToleranceN&&p.lastLinearRelativeResidual>material.linearTolerance)issues.push(`Material solve missed the requested accuracy (${p.lastLinearRelativeResidual.toExponential(2)} relative residual; target ${material.linearTolerance.toExponential(2)}). Increase solve iterations or reduce the timestep.`);
 if(p.unconvergedContactSets>0)issues.push(`${p.unconvergedContactSets} contact solves did not settle within their work limit.`);
 if(p.stalledProjections>0)issues.push(`Material line search stalled ${p.stalledProjections} times; inspect the source arrangement and solve settings.`);
 issues.push(...clothContactIssues(metrics.clothContact));
 return issues;
}
