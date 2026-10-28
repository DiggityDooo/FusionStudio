// A25 scanning / photogrammetry / NeRF previews.

const uid=()=>'sc'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);

export function reconstructFromPhotos({count=24,resolution=1024}={}){
  if(count<3)throw Error('Need 3+ photos.');
  return {version:1,kind:'photogrammetry',photos:count,resolution,points:count*800,mesh:{verts:count*200,tris:count*400},status:'preview'};
}

export function importLidarDepth({points=5000,format='ply'}={}){
  const cloud=new Float32Array(points*3);for(let i=0;i<cloud.length;i++)cloud[i]=(Math.random()-.5)*2;
  return {version:1,kind:'lidar',format,count:points,positions:cloud};
}

export function createPointCloud({count=1000}={}){
  const positions=new Float32Array(count*3),colors=new Float32Array(count*3);
  for(let i=0;i<count;i++){positions[i*3]=(Math.random()-.5);positions[i*3+1]=Math.random();positions[i*3+2]=(Math.random()-.5);colors[i*3]=colors[i*3+1]=colors[i*3+2]=.7;}
  return {version:1,kind:'point_cloud',count,positions,colors};
}

export function cleanPointCloud(cloud,{keep=.8}={}){
  const n=Math.floor(cloud.count*keep),positions=cloud.positions.slice(0,n*3),colors=cloud.colors?.slice(0,n*3);
  return {version:1,kind:'point_cloud',count:n,positions,colors,cleaned:true};
}

export function meshFromPointCloud(cloud,{method='poisson'}={}){
  const verts=Math.min(cloud.count,500);const positions=cloud.positions.slice(0,verts*3);
  const indices=[];for(let i=0;i<verts-2;i++)indices.push(0,i+1,i+2);
  return {version:1,kind:'scan_mesh',method,positions,indices:new Uint32Array(indices)};
}

export function importGaussianSplat({count=1000}={}){
  const means=new Float32Array(count*3),scales=new Float32Array(count*3),colors=new Float32Array(count*3);
  for(let i=0;i<count*3;i++){means[i]=(Math.random()-.5)*.5;scales[i]=.01+Math.random()*.02;colors[i]=Math.random();}
  return {version:1,kind:'gaussian_splat',count,means,scales,colors};
}

export function importNerf({resolution=128}={}){
  return {version:1,kind:'nerf',resolution,mlp:'preview',frames:0};
}

export function scanMeshCleanup(mesh,{fillHoles=true,decimate=.5}={}){
  const verts=mesh.positions.length/3|0,keep=Math.max(4,Math.floor(verts*decimate));
  return {version:1,positions:mesh.positions.slice(0,keep*3),indices:mesh.indices?.slice(0,Math.floor((mesh.indices?.length||0)*decimate))||new Uint32Array(),holesFilled:!!fillHoles,decimated:true};
}

export function delightTextures({maps=1}={}){
  return {version:1,kind:'delight',maps,removedLighting:true};
}

export function scanToRetopo(mesh,{quadTarget=500}={}){
  return {version:1,kind:'scan_retopo',quads:quadTarget,sourceVerts:mesh.positions.length/3|0};
}

export function markerAlign({markersA=[[0,0,0],[1,0,0],[0,1,0]],markersB=[[0,0,0],[1,0,0],[0,1,0]]}={}){
  if(markersA.length<3||markersB.length<3)throw Error('Need 3+ markers.');
  const dx=markersB[0][0]-markersA[0][0],dy=markersB[0][1]-markersA[0][1],dz=markersB[0][2]-markersA[0][2];
  return {version:1,kind:'marker_align',translation:[dx,dy,dz],rmse:0};
}

export function bodyFaceObjectScanPipeline({subject='body'}={}){
  if(!['body','face','object'].includes(subject))throw Error('subject.');
  return {version:1,kind:'scan_pipeline',subject,stages:['capture','align','mesh','texture','retopo'],status:'ready'};
}

export function projectBakeScanTexture(scanMesh,retopo,{size=1024}={}){
  return {version:1,kind:'scan_bake',size,sourceVerts:scanMesh.positions.length/3|0,targetQuads:retopo.quads||0,maps:['albedo','normal']};
}

export function registerScans(a,b,{method='icp'}={}){
  const ca=[0,0,0],cb=[0,0,0];
  for(let i=0;i<a.positions.length;i+=3){ca[0]+=a.positions[i];ca[1]+=a.positions[i+1];ca[2]+=a.positions[i+2];}
  for(let i=0;i<b.positions.length;i+=3){cb[0]+=b.positions[i];cb[1]+=b.positions[i+1];cb[2]+=b.positions[i+2];}
  const na=a.positions.length/3,nb=b.positions.length/3;
  return {version:1,kind:'registration',method,translation:[cb[0]/nb-ca[0]/na,cb[1]/nb-ca[1]/na,cb[2]/nb-ca[2]/na],id:uid()};
}
