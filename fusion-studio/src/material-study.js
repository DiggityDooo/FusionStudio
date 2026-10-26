import {fabricResponse} from './fabric-materials.js';
export function materialStudyRequest(input){
 const response=fabricResponse(input),nx=20,ny=50,width=.2,height=.5,traction=1,positions=[],uv=[],faces=[],pins=[],forces=[];
 for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++){const u=x/nx*width,v=y/ny*height,index=positions.length;positions.push([u-width/2,1.5+v,0]);uv.push([u,v]);if(y===ny)pins.push(index);if(y===0)forces.push({vertex:index,force:[0,-traction*width/nx*((x===0||x===nx)?.5:1),0]});}
 for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const a=y*(nx+1)+x,b=a+1,c=a+nx+1,d=c+1;faces.push([a,b,c],[b,d,c]);}
 return {request:{positions,restPositions:structuredClone(positions),faces,sewing:[],pins,colliders:[],steps:240,iterations:response.iterations,stretch:1e-7,bend:1e-4,thickness:.003,selfCollision:false,materialCoordinates:uv,fabricMaterial:response.material,gravity:[0,0,0],forces,executionBudget:'offline'},reference:{nx,ny,width,height,traction,extension:traction*height/response.material.weftNpm,mass:width*height*response.material.densityKgM2}};
}
export function inspectMaterialStudy(input,result){
 const {request,reference:r}=input,m=result?.metrics?.physicalFabric;
 if(!m||!Array.isArray(result.positions)||result.positions.length!==request.positions.length||result.positions.some(p=>!Array.isArray(p)||p.length!==3||p.some(v=>!Number.isFinite(v)))||!Number.isFinite(m.massKg)||!Number.isFinite(m.maximumSpeedMps)||!Number.isFinite(m.maximumFreeForceResidualN))throw Error('The material core returned an invalid strip study.');
 const rows=[];for(let y=0;y<=r.ny;y++){let sum=0,weight=0;for(let x=0;x<=r.nx;x++){const i=y*(r.nx+1)+x,w=x===0||x===r.nx?.5:1;sum+=(request.restPositions[i][1]-result.positions[i][1])*w;weight+=w;}rows.push({height:y/r.ny*r.height,measured:sum/weight,reference:r.extension*(1-y/r.ny)});}
 const extension=rows[0].measured,relativeError=Math.abs(extension/r.extension-1),passed=relativeError<=.02&&m.maximumSpeedMps<.0001&&m.maximumFreeForceResidualN<.0001;
 return {version:1,passed,extension,referenceExtension:r.extension,relativeError,rows,metrics:m,triangles:request.faces.length,simulationSeconds:request.steps*request.fabricMaterial.timeStep,notes:['Known-load numerical model check, not real fabric calibration.','Reference uses an uncoupled uniaxial strip without gravity or contact. Slow or unconverged studies need more settling or solver accuracy.']};
}
