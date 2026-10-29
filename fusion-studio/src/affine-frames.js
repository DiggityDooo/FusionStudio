import * as THREE from 'three';

const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),length=a=>Math.hypot(...a),det=c=>dot(c[0],[c[1][1]*c[2][2]-c[1][2]*c[2][1],c[1][2]*c[2][0]-c[1][0]*c[2][2],c[1][0]*c[2][1]-c[1][1]*c[2][0]]);
const rotation=cols=>new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(...cols.map(c=>new THREE.Vector3(...c)))).normalize().toArray();
// Original bounded 3x3 Jacobi SVD. Two TRS frames represent a static affine
// transform, including shear/reflection/singular scales, without a non-TRS
// glTF node matrix. The original project matrix remains untouched.
export function affineTrsFrames(matrix){
 const e=matrix.elements;if(e.length!==16||e.some(v=>!Number.isFinite(v)||Math.abs(v)>1e12)||[3,7,11].some(i=>Math.abs(e[i])>1e-12)||Math.abs(e[15]-1)>1e-12)throw Error('Only finite affine model transforms can be exchanged. Keep the original project for perspective matrices.');
 const norm=Math.max(...[0,1,2,4,5,6,8,9,10].map(i=>Math.abs(e[i]))),a=[[e[0],e[4],e[8]],[e[1],e[5],e[9]],[e[2],e[6],e[10]]].map(row=>row.map(v=>norm?v/norm:0)),b=Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>a.reduce((sum,row)=>sum+row[i]*row[j],0))),v=[[1,0,0],[0,1,0],[0,0,1]];
 for(let step=0;step<64;step++){
  let p=0,q=1;for(const [i,j]of [[0,2],[1,2]])if(Math.abs(b[i][j])>Math.abs(b[p][q])){p=i;q=j;}if(Math.abs(b[p][q])<1e-15)break;
  const tau=(b[q][q]-b[p][p])/(2*b[p][q]),t=(tau>=0?1:-1)/(Math.abs(tau)+Math.hypot(1,tau)),c=1/Math.hypot(1,t),s=t*c,off=b[p][q];b[p][p]-=t*off;b[q][q]+=t*off;b[p][q]=b[q][p]=0;
  for(let k=0;k<3;k++){if(k!==p&&k!==q){const x=b[k][p],y=b[k][q];b[k][p]=b[p][k]=c*x-s*y;b[k][q]=b[q][k]=s*x+c*y;}const x=v[k][p],y=v[k][q];v[k][p]=c*x-s*y;v[k][q]=s*x+c*y;}
 }
 const order=[0,1,2].sort((i,j)=>b[j][j]-b[i][i]),vc=order.map(i=>v.map(row=>row[i])),uc=[],scale=[];
 for(let j=0;j<3;j++){
  const raw=a.map(row=>dot(row,vc[j]));let candidate=[...raw];for(const u of uc){const projection=dot(candidate,u);candidate=candidate.map((x,i)=>x-projection*u[i]);}
  if(length(candidate)<1e-14){let best=null;for(let axis=0;axis<3;axis++){let r=[0,0,0];r[axis]=1;for(const u of uc){const projection=dot(r,u);r=r.map((x,i)=>x-projection*u[i]);}if(!best||length(r)>length(best))best=r;}candidate=best;}
  const l=length(candidate),u=candidate.map(x=>x/l);uc.push(u);scale.push(dot(raw,u)*norm);
 }
 if(det(uc)<0){uc[2]=uc[2].map(x=>-x);scale[2]*=-1;}if(det(vc)<0){vc[2]=vc[2].map(x=>-x);scale[2]*=-1;}
 const frames=[{position:[e[12],e[13],e[14]],quaternion:rotation(uc),scale},{position:[0,0,0],quaternion:rotation([0,1,2].map(i=>vc.map(col=>col[i]))),scale:[1,1,1]}],compose=f=>new THREE.Matrix4().compose(new THREE.Vector3(...f.position),new THREE.Quaternion(...f.quaternion),new THREE.Vector3(...f.scale)),reconstructed=compose(frames[0]).multiply(compose(frames[1])),error=Math.max(...e.map((x,i)=>Math.abs(x-reconstructed.elements[i])));
 if(error>Math.max(norm,1e-300)*1e-9)throw Error('Affine transform factorization exceeded its reconstruction limit. Keep the original matrix and inspect its conditioning.');return {frames,maxError:error};
}

export function prepareAffineExchange(root,clips=[]){
 root.updateMatrixWorld(true);const animated=new Set();for(const clip of clips)for(const track of clip.tracks){const p=THREE.PropertyBinding.parseTrackName(track.name);if(!['position','quaternion','scale'].includes(p.propertyName))continue;let node=THREE.PropertyBinding.findNode(root,p.nodeName);if(p.objectName==='bones')node=node?.skeleton?.getBoneByName(p.objectIndex)||node?.skeleton?.bones?.[Number(p.objectIndex)];if(node)animated.add(node);}
 const candidates=[];root.traverse(n=>{if(n!==root&&!n.matrixAutoUpdate)candidates.push(n);});const report={version:1,staticFrames:0,maxError:0};
 for(const node of candidates){if(animated.has(node))throw Error('Animation targets a fixed matrix on '+(node.name||node.uuid)+'. Bake or enable its TRS animation before exchanging it; the original project stays intact.');const {frames,maxError}=affineTrsFrames(node.matrix),parent=node.parent,index=parent.children.indexOf(node);let at=parent;for(const f of frames){const group=new THREE.Group();group.name='Preserved affine frame';group.position.fromArray(f.position);group.quaternion.fromArray(f.quaternion);group.scale.fromArray(f.scale);group.updateMatrix();at.add(group);if(at===parent){parent.children.splice(parent.children.indexOf(group),1);parent.children.splice(index,0,group);}at=group;}at.add(node);node.position.set(0,0,0);node.quaternion.identity();node.scale.set(1,1,1);node.matrix.identity();node.matrixAutoUpdate=true;report.staticFrames++;report.maxError=Math.max(report.maxError,maxError);}
 root.updateMatrixWorld(true);root.userData.fusion_affine_export=report;return report;
}
