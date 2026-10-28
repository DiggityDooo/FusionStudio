import * as THREE from 'three';
import {bonesOf,nodePath,pathNode} from './rig-paths.js';
import {authoredQuaternion,restoreAuthoredRotations} from './formula-rotations.js';

export const RIG_TEMPLATES={
 biped:{label:'Biped',bones:[
  ['Hips',[0,1,0],null],['Spine',[0,.2,0],'Hips'],['Chest',[0,.2,0],'Spine'],['Neck',[0,.18,0],'Chest'],['Head',[0,.12,0],'Neck'],
  ['Shoulder_L',[.12,.12,0],'Chest'],['UpperArm_L',[.22,0,0],'Shoulder_L'],['ForeArm_L',[.25,0,0],'UpperArm_L'],['Hand_L',[.2,0,0],'ForeArm_L'],
  ['Shoulder_R',[-.12,.12,0],'Chest'],['UpperArm_R',[-.22,0,0],'Shoulder_R'],['ForeArm_R',[-.25,0,0],'UpperArm_R'],['Hand_R',[-.2,0,0],'ForeArm_R'],
  ['Thigh_L',[.1,-.05,0],'Hips'],['Shin_L',[0,-.4,0],'Thigh_L'],['Foot_L',[0,-.4,.05],'Shin_L'],
  ['Thigh_R',[-.1,-.05,0],'Hips'],['Shin_R',[0,-.4,0],'Thigh_R'],['Foot_R',[0,-.4,.05],'Shin_R']
 ]},
 quadruped:{label:'Quadruped',bones:[
  ['Hips',[0,.6,-.2],null],['Spine',[0,.05,.25],'Hips'],['Chest',[0,.05,.3],'Spine'],['Neck',[0,.08,.2],'Chest'],['Head',[0,.05,.15],'Neck'],
  ['FrontThigh_L',[.12,-.05,.2],'Chest'],['FrontShin_L',[0,-.3,0],'FrontThigh_L'],['FrontFoot_L',[0,-.25,0],'FrontShin_L'],
  ['FrontThigh_R',[-.12,-.05,.2],'Chest'],['FrontShin_R',[0,-.3,0],'FrontThigh_R'],['FrontFoot_R',[0,-.25,0],'FrontShin_R'],
  ['HindThigh_L',[.12,-.05,-.05],'Hips'],['HindShin_L',[0,-.3,0],'HindThigh_L'],['HindFoot_L',[0,-.25,0],'HindShin_L'],
  ['HindThigh_R',[-.12,-.05,-.05],'Hips'],['HindShin_R',[0,-.3,0],'HindThigh_R'],['HindFoot_R',[0,-.25,0],'HindShin_R'],
  ['Tail1',[0,0,-.15],'Hips'],['Tail2',[0,0,-.15],'Tail1']
 ]}
};
export const CONTROL_SHAPES={circle:'Circle',cube:'Cube',diamond:'Diamond',sphere:'Sphere',arrow:'Arrow'};
export const CONSTRAINT_KINDS=['parent','point','orient','aim','scale','copy','limit','follow_path','spring'];
export const RIG_LAYERS=['default','face','body','fingers','secondary'];

const V=()=>new THREE.Vector3(),Q=()=>new THREE.Quaternion(),M=()=>new THREE.Matrix4();

export function createBone(name,position=[0,.2,0]){
  const bone=new THREE.Bone();bone.name=String(name||'Bone').slice(0,80);bone.position.fromArray(position);
  bone.userData.fusion_source_quaternion=[0,0,0,1];bone.userData.fusion_rig_layer='default';return bone;
}

export function createArmature(template='biped',opts={}){
  const spec=RIG_TEMPLATES[template];if(!spec)throw Error('Unknown rig template: '+template);
  const root=new THREE.Group();root.name=opts.name||spec.label+' Armature';
  root.userData={fusion_kind:'armature',fusion_armature:true,fusion_rig_template:template,fusion_rig_layers:[...RIG_LAYERS],fusion_custom_attrs:{},fusion_constraints:[],fusion_control_shapes:{},fusion_ik:[]};
  const map=new Map();
  for(const [name,pos,parent] of spec.bones){
    const bone=createBone(name,pos);
    if(!parent)root.add(bone);
    else{const p=map.get(parent);if(!p)throw Error('Template parent missing: '+parent);p.add(bone);}
    map.set(name,bone);
  }
  orientBonesTowardChildren(root);stampSourceQuaternions(root);return root;
}

export function addBone(owner,parentBone,name='Bone',offset=[0,.2,0]){
  if(!owner)throw Error('Select an armature or character first.');
  const parent=parentBone?.isBone?parentBone:bonesOf(owner)[0]||owner;
  const bone=createBone(name,offset);parent.add(bone);stampSourceQuaternions(owner);return bone;
}

export function orientBonesTowardChildren(root){
  root.updateWorldMatrix(true,true);
  const bones=bonesOf(root);
  for(const bone of bones){
    const child=bone.children.find(c=>c.isBone);if(!child)continue;
    const dir=child.position.clone();if(dir.lengthSq()<1e-12)continue;
    // Local +Y aims along the child offset (Blender-like bone roll baseline).
    const q=Q().setFromUnitVectors(V().set(0,1,0),dir.clone().normalize());
    bone.quaternion.copy(q);child.position.set(0,dir.length(),0);
  }
  root.updateWorldMatrix(true,true);
}

export function stampSourceQuaternions(root){for(const b of bonesOf(root))b.userData.fusion_source_quaternion=b.quaternion.toArray();}

export function setBoneLayer(bone,layer){if(!RIG_LAYERS.includes(layer)&&layer!=='default')throw Error('Unknown rig layer.');bone.userData.fusion_rig_layer=layer||'default';}
export function setLayerVisible(root,layer,visible){(root.userData.fusion_layer_vis??={})[layer]=!!visible;applyLayerVisibility(root);}
export function applyLayerVisibility(root){
  const vis=root.userData.fusion_layer_vis||{};
  for(const b of bonesOf(root)){const layer=b.userData.fusion_rig_layer||'default';b.visible=vis[layer]!==false;}
}

export function setControlShape(root,bone,shape){
  if(shape&&!CONTROL_SHAPES[shape])throw Error('Unknown control shape.');
  const shapes=root.userData.fusion_control_shapes??={};const id=bone.uuid;
  if(!shape)delete shapes[id];else shapes[id]={bone:nodePath(root,bone),shape,scale:1};
  return shapes[id];
}

export function setCustomAttr(root,name,value,{min=-1e6,max=1e6}={}){
  const key=String(name||'').trim().slice(0,40);if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key))throw Error('Custom attribute names must be identifiers.');
  if(!Number.isFinite(value)||value<min||value>max)throw Error('Custom attribute out of range.');
  (root.userData.fusion_custom_attrs??={})[key]={value,min,max};return root.userData.fusion_custom_attrs[key];
}

export function mirrorName(name){
  const swap=(word,next)=>word===word.toUpperCase()?next.toUpperCase():word===word.toLowerCase()?next.toLowerCase():next;
  if(/Left/i.test(name))return name.replace(/Left/gi,m=>swap(m,'Right'));
  if(/Right/i.test(name))return name.replace(/Right/gi,m=>swap(m,'Left'));
  if(/^[lr][A-Z]/.test(name))return (name[0]==='l'?'r':'l')+name.slice(1);
  return name.replace(/(^|[_.-])([LR])(?=$|[_.-])/gi,(m,a,side)=>a+({L:'R',R:'L',l:'r',r:'l'}[side]));
}

export function mirrorPose(root,{axis='x'}={}){
  if(!['x','y','z'].includes(axis))throw Error('Mirror axis must be x, y or z.');
  if(root.userData.fusion_ik?.some(c=>c.enabled))throw Error('Disable active IK before mirroring the authored pose.');
  const bones=bonesOf(root),byName=new Map(),frames=new Map([[root,Q()]]),rest=new Map(),planned=[];
  const unit=value=>{const q=value?.isQuaternion?value.clone():Q().fromArray(value);if(q.toArray().some(v=>!Number.isFinite(v))||Math.abs(q.length()-1)>1e-4)throw Error('Pose mirroring requires finite unit rest and authored rotations.');return q.normalize();};
  for(const b of bones){if(byName.has(b.name))throw Error('Pose mirroring needs unique bone names: '+b.name);byName.set(b.name,b);}
  // Reflect a rotation delta in the owner's neutral frame, then express it in
  // the destination's rest axes. Mirrored bone rolls need not be identical.
  const frame=node=>{if(frames.has(node))return frames.get(node);if(!node?.parent)throw Error('Mirror joint is outside this character.');const s=node.scale;if(s.x<=0||s.y<=0||s.z<=0||Math.max(s.x,s.y,s.z)-Math.min(s.x,s.y,s.z)>1e-5)throw Error('Pose mirroring requires positive uniform scale within the rig.');const q=unit(node.isBone?(node.userData.fusion_source_quaternion||[0,0,0,1]):node.quaternion);rest.set(node,q);const value=frame(node.parent).clone().multiply(q);frames.set(node,value);return value;};
  const flips={x:[1,-1,-1],y:[-1,1,-1],z:[-1,-1,1]}[axis];
  for(const source of bones){
    frame(source);const target=byName.get(mirrorName(source.name))||source;frame(target);
    const parent=frame(source.parent),destination=frame(target.parent),delta=parent.clone().multiply(unit(authoredQuaternion(root,source))).multiply(rest.get(source).clone().invert()).multiply(parent.clone().invert());
    delta.set(delta.x*flips[0],delta.y*flips[1],delta.z*flips[2],delta.w);
    planned.push([target,destination.clone().invert().multiply(delta).multiply(destination).multiply(rest.get(target)).normalize()]);
  }
  restoreAuthoredRotations(root);for(const [bone,q]of planned)bone.quaternion.copy(q);
  root.updateWorldMatrix(true,true);return bones.length;
}

export function setIkBlend(control,blend){
  if(!Number.isFinite(blend)||blend<0||blend>1)throw Error('IK blend must be 0–1.');
  control.blend=blend;return control;
}

export function applyIkBlend(root,control,fkQuats){
  const blend=control.blend??1;if(blend>=1||!fkQuats?.length)return;
  const links=control.chain.map(p=>pathNode(root,p));
  links.forEach((bone,i)=>{if(!bone||!fkQuats[i])return;bone.quaternion.slerpQuaternions(Q().fromArray(fkQuats[i]),bone.quaternion,blend).normalize();});
  if(control.keepOrientation&&control._fkEnd){const end=pathNode(root,control.end);if(end)end.quaternion.slerpQuaternions(Q().fromArray(control._fkEnd),end.quaternion,blend).normalize();}
}

export function captureFkBases(root,control){
  control._fkBase=control.chain.map(p=>{const b=pathNode(root,p);return b?b.quaternion.toArray():[0,0,0,1];});
  const end=pathNode(root,control.end);control._fkEnd=end?end.quaternion.toArray():null;
}

export function addConstraint(root,{kind,owner,target,weight=1,axis='y',offset=[0,0,0],space='world'}={}){
  if(!CONSTRAINT_KINDS.includes(kind))throw Error('Unsupported constraint: '+kind);
  if(!owner?.isBone)throw Error('Constraint owner must be a bone.');
  if(target!=null&&!target.isObject3D)throw Error('Constraint target is invalid.');
  if(!Number.isFinite(weight)||weight<0||weight>1)throw Error('Constraint weight must be 0–1.');
  if(!['world','local','parent'].includes(space))throw Error('Unsupported constraint space.');
  const entry={id:THREE.MathUtils.generateUUID(),kind,owner:nodePath(root,owner),target:target?nodePath(root,target):null,weight,axis,offset:[...offset],space,enabled:true};
  (root.userData.fusion_constraints??=[]).push(entry);return entry;
}

export function evaluateConstraints(root){
  const list=root.userData.fusion_constraints||[];if(!list.length)return 0;
  root.updateWorldMatrix(true,true);let applied=0;
  for(const c of list){
    if(!c.enabled||!c.weight)continue;
    const owner=pathNode(root,c.owner);if(!owner?.isBone)continue;
    const target=c.target?pathNode(root,c.target):null;
    const w=c.weight;
    if(c.kind==='point'&&target){
      const world=target.getWorldPosition(V());if(c.space==='local')owner.parent.worldToLocal(world);
      else if(c.space==='world')owner.parent.worldToLocal(world);
      owner.position.lerp(world.add(V().fromArray(c.offset||[0,0,0])),w);applied++;
    }else if(c.kind==='orient'&&target){
      const q=target.getWorldQuaternion(Q());const parent=owner.parent.getWorldQuaternion(Q()).invert();
      owner.quaternion.slerp(parent.multiply(q),w).normalize();applied++;
    }else if(c.kind==='aim'&&target){
      const from=owner.getWorldPosition(V()),to=target.getWorldPosition(V()),dir=to.sub(from);if(dir.lengthSq()<1e-12)continue;
      const up=V().set(0,1,0),look=M().lookAt(V(),dir.normalize(),up),qw=Q().setFromRotationMatrix(look);
      const parent=owner.parent.getWorldQuaternion(Q()).invert();owner.quaternion.slerp(parent.multiply(qw),w).normalize();applied++;
    }else if(c.kind==='copy'&&target){
      owner.position.lerp(owner.parent.worldToLocal(target.getWorldPosition(V())),w);
      const q=target.getWorldQuaternion(Q()),parent=owner.parent.getWorldQuaternion(Q()).invert();
      owner.quaternion.slerp(parent.multiply(q),w).normalize();
      owner.scale.lerp(target.scale,w);applied++;
    }else if(c.kind==='parent'&&target){
      const m=M().copy(target.matrixWorld);owner.parent.updateWorldMatrix(true,false);
      const local=M().copy(owner.parent.matrixWorld).invert().multiply(m);
      const p=V(),q=Q(),s=V();local.decompose(p,q,s);
      owner.position.lerp(p,w);owner.quaternion.slerp(q,w).normalize();owner.scale.lerp(s,w);applied++;
    }else if(c.kind==='scale'&&target){owner.scale.lerp(target.scale,w);applied++;}
    else if(c.kind==='follow_path'&&target){
      // Target is an Object3D whose children[0].. define a polyline; offset[0] is 0–1 along the path.
      const pts=[];target.traverse(n=>{if(n!==target&&n.isObject3D&&!n.isBone)pts.push(n.getWorldPosition(V()));});
      if(pts.length<2){pts.push(target.getWorldPosition(V()),target.localToWorld(V().set(0,0,-1)));}
      const t=THREE.MathUtils.clamp(c.offset?.[0]??0,0,1),seg=Math.min(pts.length-2,Math.floor(t*(pts.length-1)));
      const localT=(t*(pts.length-1))-seg,pos=pts[seg].clone().lerp(pts[seg+1],localT);
      owner.position.lerp(owner.parent.worldToLocal(pos),w);applied++;
    }else if(c.kind==='spring'){
      const rest=V().fromArray(owner.userData.fusion_spring_rest||owner.position.toArray());
      owner.userData.fusion_spring_rest??=owner.position.toArray();
      owner.position.lerp(rest,1-w*.5);applied++;
    }else if(c.kind==='limit'){
      const min=c.offset||[-Math.PI,-Math.PI,-Math.PI],max=c.axis==='y'?[Math.PI,Math.PI,Math.PI]:[Math.PI,Math.PI,Math.PI];
      owner.rotation.x=THREE.MathUtils.clamp(owner.rotation.x,min[0],max[0]);
      owner.rotation.y=THREE.MathUtils.clamp(owner.rotation.y,min[1],max[1]);
      owner.rotation.z=THREE.MathUtils.clamp(owner.rotation.z,min[2],max[2]);applied++;
    }
  }
  root.updateWorldMatrix(true,true);return applied;
}

export function setSpace(root,bone,{space='world',reference=null}={}){
  if(!['world','local','parent','custom'].includes(space))throw Error('Unsupported space.');
  bone.userData.fusion_space={space,reference:reference?nodePath(root,reference):null};
  return bone.userData.fusion_space;
}

export function addTwistJoint(parentBone,name='Twist',factor=.5){
  if(!parentBone?.isBone)throw Error('Twist parent must be a bone.');
  if(!Number.isFinite(factor)||factor<=0||factor>=1)throw Error('Twist factor must be between 0 and 1.');
  const child=parentBone.children.find(c=>c.isBone);if(!child)throw Error('Twist joints need a child bone.');
  const twist=createBone(name,[0,child.position.length()*factor,0]);
  const rest=child.position.length();parentBone.remove(child);parentBone.add(twist);twist.add(child);child.position.set(0,rest*(1-factor),0);
  twist.userData.fusion_twist={factor,driven:true};return twist;
}

export function applyTwist(root){
  let n=0;
  for(const bone of bonesOf(root)){
    const t=bone.userData.fusion_twist;if(!t?.driven)continue;
    const child=bone.children.find(c=>c.isBone),parent=bone.parent;if(!child||!parent?.isBone)continue;
    // Distribute parent Y twist toward the child.
    const pe=new THREE.Euler().setFromQuaternion(parent.quaternion,'YXZ');
    bone.rotation.y=pe.y*t.factor;n++;
  }
  return n;
}

export function setStretch(bone,{enabled=true,axis='y',min=.5,max=2}={}){
  if(!bone?.isBone)throw Error('Stretch target must be a bone.');
  if(!['x','y','z'].includes(axis))throw Error('Stretch axis invalid.');
  if(!(min>0&&max>=min&&max<=10))throw Error('Stretch limits invalid.');
  bone.userData.fusion_stretch={enabled:!!enabled,axis,min,max,rest:bone.scale[axis]};return bone.userData.fusion_stretch;
}

export function applyStretch(root,control){
  if(!control?.stretch)return;
  const links=control.chain.map(p=>pathNode(root,p)),end=pathNode(root,control.end);if(!links.length||!end)return;
  const start=links.at(-1).getWorldPosition(V()),tip=end.getWorldPosition(V()),target=root.localToWorld(V().fromArray(control.target));
  const rest=start.distanceTo(tip)||1e-5,reach=start.distanceTo(target),ratio=THREE.MathUtils.clamp(reach/rest,.5,2);
  for(const bone of links){const s=bone.userData.fusion_stretch;if(!s?.enabled)continue;bone.scale[s.axis]=THREE.MathUtils.clamp((s.rest||1)*ratio,s.min,s.max);}
}

export function createFootRoll(root,footBone){
  if(!footBone?.isBone)throw Error('Foot roll needs a foot bone.');
  const ankle=footBone.parent;if(!ankle?.isBone)throw Error('Foot needs an ankle/shin parent.');
  const roll=createBone(footBone.name+'_Roll',[0,0,0]);ankle.add(roll);
  // Reparent foot under roll empty-equivalent bone at same world pose.
  ankle.updateWorldMatrix(true,true);footBone.updateWorldMatrix(true,true);
  const world=footBone.matrixWorld.clone();ankle.remove(footBone);roll.add(footBone);
  const local=M().copy(roll.matrixWorld).invert().multiply(world);const p=V(),q=Q(),s=V();local.decompose(p,q,s);
  footBone.position.copy(p);footBone.quaternion.copy(q);footBone.scale.copy(s);
  roll.userData.fusion_foot_roll={foot:nodePath(root,footBone),angle:0};return roll;
}

export function applyFootRoll(root){
  let n=0;
  for(const bone of bonesOf(root)){
    const fr=bone.userData.fusion_foot_roll;if(!fr)continue;
    bone.rotation.x=fr.angle||0;n++;
  }
  return n;
}

export function evaluateRigExtras(root){
  applyTwist(root);applyFootRoll(root);
  for(const c of root.userData.fusion_ik||[])if(c.enabled&&c.stretch)applyStretch(root,c);
  return evaluateConstraints(root);
}
