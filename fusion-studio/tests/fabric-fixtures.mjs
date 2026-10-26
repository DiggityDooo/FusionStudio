export const material=()=>({version:1,densityKgM2:.2,warpNpm:1000,weftNpm:100,shearNpm:100,bendingNm:0,seamNpm2:1e6,dampingPerSecond:12,timeStep:1/120});
export function fabricCoupon(nx=20,ny=50,{width=.2,height=.5,traction=1,gravity=[0,0,0],transpose=false}={}){
 const positions=[],uv=[],faces=[],pins=[],forces=[];
 for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++){const u=x/nx*width,v=y/ny*height;positions.push([u-width/2,1.5+v,0]);uv.push(transpose?[v,u]:[u,v]);if(y===ny)pins.push(positions.length-1);if(y===0&&traction)forces.push({vertex:positions.length-1,force:[0,-traction*width/nx*(x===0||x===nx?.5:1),0]});}
 for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const a=y*(nx+1)+x,b=a+1,c=a+nx+1,d=c+1;faces.push([a,b,c],[b,d,c]);}
 return {positions,restPositions:structuredClone(positions),faces,sewing:[],pins,colliders:[],steps:240,iterations:4,stretch:1e-7,bend:1e-4,thickness:.003,selfCollision:false,materialCoordinates:uv,fabricMaterial:material(),gravity,forces};
}
export function extension(request,result,nx){let sum=0,weight=0;for(let i=0;i<=nx;i++){const w=i===0||i===nx?.5:1;sum+=(request.restPositions[i][1]-result.positions[i][1])*w;weight+=w;}return sum/weight;}
