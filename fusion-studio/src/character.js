import * as THREE from 'three';
import {enforceJointLimits} from './joint-limits.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export const CHARACTER_DEFAULTS={height:1.8,shoulders:1,chest:1,waist:1,hips:1,limbs:1,head:1,skin:'#c8a18c'};
const v=(x,y,z=0)=>new THREE.Vector3(x,y,z);
export function createCharacter(settings={},pose={}){
  const p={...CHARACTER_DEFAULTS,...settings};
  const group=new THREE.Group();group.name='Character';group.userData={fusion_kind:'character',fusion_id:THREE.MathUtils.generateUUID(),source:'Fusion character',character:p,pose:{...pose}};
  const positions={
    Pelvis:v(0,.94),Spine:v(0,1.1),Chest:v(0,1.36),Neck:v(0,1.49),Head:v(0,1.64),
    UpperArm_L:v(.24*p.shoulders,1.37),Forearm_L:v(.39*p.shoulders,1.13),Hand_L:v(.49*p.shoulders,.9),
    UpperArm_R:v(-.24*p.shoulders,1.37),Forearm_R:v(-.39*p.shoulders,1.13),Hand_R:v(-.49*p.shoulders,.9),
    Thigh_L:v(.115*p.hips,.91),Shin_L:v(.115*p.hips,.51),Foot_L:v(.115*p.hips,.09),
    Thigh_R:v(-.115*p.hips,.91),Shin_R:v(-.115*p.hips,.51),Foot_R:v(-.115*p.hips,.09),
  };
  const parents={Pelvis:null,Spine:'Pelvis',Chest:'Spine',Neck:'Chest',Head:'Neck',UpperArm_L:'Chest',Forearm_L:'UpperArm_L',Hand_L:'Forearm_L',UpperArm_R:'Chest',Forearm_R:'UpperArm_R',Hand_R:'Forearm_R',Thigh_L:'Pelvis',Shin_L:'Thigh_L',Foot_L:'Shin_L',Thigh_R:'Pelvis',Shin_R:'Thigh_R',Foot_R:'Shin_R'};
  const names=Object.keys(positions);const bones=names.map(n=>{const b=new THREE.Bone();b.name=n;b.userData.fusion_joint=n;return b;});
  const boneMap=Object.fromEntries(names.map((n,i)=>[n,bones[i]]));
  for(const name of names){const b=boneMap[name];const parent=parents[name];b.position.copy(positions[name]);if(parent){b.position.sub(positions[parent]);boneMap[parent].add(b);}}
  const parts=[];group.userData.collisionShapes=[];
  function part(geometry,matIndex,boneName,center,scale=[1,1,1],rotation=null){
    if(matIndex===0){const radius=geometry.parameters?.radius||Math.max(geometry.parameters?.radiusTop||0,geometry.parameters?.radiusBottom||0);const cylinder=geometry.type==='CylinderGeometry',radii=cylinder?[radius,geometry.parameters.height/2+radius,radius]:scale;group.userData.collisionShapes.push({bone:boneName,center:center.toArray(),radii,halfLength:cylinder?geometry.parameters.height/2:null,rotation:(rotation||new THREE.Quaternion()).toArray()});}
    const g=geometry.toNonIndexed();g.scale(...scale);if(rotation)g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(rotation));g.translate(center.x,center.y,center.z);
    const n=g.attributes.position.count;const indices=new Uint16Array(n*4),weights=new Float32Array(n*4);const b=names.indexOf(boneName);
    for(let i=0;i<n;i++){indices[i*4]=b;weights[i*4]=1;}
    g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
    g.userData.material=matIndex;parts.push(g);
  }
  function ellipsoid(bone,center,scale,material=0){part(new THREE.SphereGeometry(1,24,16),material,bone,center,scale);}
  function limb(a,b,r1,r2,bone,material=0){
    const delta=b.clone().sub(a);const q=new THREE.Quaternion().setFromUnitVectors(v(0,1),delta.clone().normalize());
    part(new THREE.CylinderGeometry(r2,r1,delta.length(),24,4),material,bone,a.clone().add(b).multiplyScalar(.5),[1,1,1],q);
    ellipsoid(bone,a,[r1,r1,r1],material);ellipsoid(bone,b,[r2,r2,r2],material);
  }
  ellipsoid('Pelvis',v(0,.96),[.195*p.hips,.16,.13]);
  ellipsoid('Spine',v(0,1.16),[.17*p.waist,.22,.115*p.waist]);
  ellipsoid('Chest',v(0,1.32),[.225*p.shoulders,.18,.145*p.chest]);
  limb(positions.Neck,v(0,1.57),.07,.065,'Neck');
  ellipsoid('Head',v(0,1.655,.004),[.108*p.head,.145*p.head,.105*p.head]);
  ellipsoid('Head',v(0,1.59,.044),[.076*p.head,.064*p.head,.075*p.head]);
  ellipsoid('Head',v(0,1.646,.101),[.024,.033,.035]);
  for(const side of ['L','R']){
    const sign=side==='L'?1:-1;
    ellipsoid('Head',v(sign*.112*p.head,1.645,0),[.021,.043,.025]);
    ellipsoid('Head',v(sign*.039*p.head,1.684,.096),[.021,.014,.011],1);
    ellipsoid('Head',v(sign*.039*p.head,1.685,.106),[.009,.01,.004],2);
    limb(positions['UpperArm_'+side],positions['Forearm_'+side],.082*p.limbs,.061*p.limbs,'UpperArm_'+side);
    limb(positions['Forearm_'+side],positions['Hand_'+side],.064*p.limbs,.039*p.limbs,'Forearm_'+side);
    ellipsoid('Hand_'+side,positions['Hand_'+side].clone().add(v(sign*.019,-.055,.01)),[.046,.073,.031]);
    limb(positions['Thigh_'+side],positions['Shin_'+side],.102*p.limbs,.071*p.limbs,'Thigh_'+side);
    limb(positions['Shin_'+side],positions['Foot_'+side],.077*p.limbs,.044*p.limbs,'Shin_'+side);
    ellipsoid('Foot_'+side,positions['Foot_'+side].clone().add(v(0,-.045,.065)),[.059,.043,.13]);
  }
  const geometry=mergeGeometries(parts,false);let start=0;
  for(const g of parts){geometry.addGroup(start,g.attributes.position.count,g.userData.material);start+=g.attributes.position.count;g.dispose();}
  const materials=[new THREE.MeshStandardMaterial({color:p.skin,roughness:.61}),new THREE.MeshStandardMaterial({color:'#e4e3d9',roughness:.25}),new THREE.MeshStandardMaterial({color:'#35454b',roughness:.3})];
  const body=new THREE.SkinnedMesh(geometry,materials);body.name='Body';body.castShadow=true;body.receiveShadow=true;body.userData={source:'Fusion parametric body',fusion_kind:'body'};body.add(bones[0]);group.add(body);group.updateMatrixWorld(true);
  const skeleton=new THREE.Skeleton(bones);body.bind(skeleton);group.scale.setScalar(p.height/1.8);
  applyPose(group,pose);return group;
}
export function findCharacter(obj){let found=null;obj?.traverse(n=>{if(!found&&n.userData.fusion_kind==='character')found=n;});return found;}
export function applyPose(group,pose){
  group.userData.pose={...pose};
  group.traverse(n=>{if(n.isBone){const value=pose[n.name]||[0,0,0];n.rotation.set(...value.map(THREE.MathUtils.degToRad));}});enforceJointLimits(group);group.traverse(n=>{if(n.isBone&&pose[n.name])group.userData.pose[n.name]=[n.rotation.x,n.rotation.y,n.rotation.z].map(THREE.MathUtils.radToDeg);});group.updateMatrixWorld(true);
}
export const POSES={
  relaxed:{},
  'T pose':{UpperArm_L:[0,0,58],UpperArm_R:[0,0,-58]},
  wave:{UpperArm_L:[0,0,130],Forearm_L:[0,0,55],Head:[0,0,-8]},
  seated:{Thigh_L:[-78,0,0],Thigh_R:[-78,0,0],Shin_L:[82,0,0],Shin_R:[82,0,0]},
  stride:{Thigh_L:[-25,0,0],Thigh_R:[25,0,0],Shin_R:[20,0,0],UpperArm_L:[20,0,0],UpperArm_R:[-20,0,0]},
};
