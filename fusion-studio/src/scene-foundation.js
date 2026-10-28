// Editor-bound scene foundation for A1: snap, gizmos, hierarchy, layers, selection, units, multi-edit.
import * as THREE from 'three';
import {GEOMETRY_SNAP_MODES,GeometrySnapGesture} from './geometry-snap.js';

const SNAP_MODES=['vertex','edge','face','grid','surface','increment'];
const GIZMO_SPACES=['global','local','normal','gimbal'];
const SEL_TOOLS=['box','lasso','paint','loop','ring','grow','shrink','similar','soft'];

const defaults=()=>({snap:{enabled:false,mode:'increment',increment:.1,angleDeg:15,pivot:'median'},gizmo:{space:'global',active:'move'},collections:[{id:'col-default',name:'Default',visible:true,selectable:true,members:[]}],selectionTool:'box',softRadius:.25,units:{system:'metric',unit:'m',scale:1},multiIds:[],isolation:null});

export function validateFoundationState(saved,legacyUnits){
  const state=defaults(),bad=()=>{throw Error('Saved scene-tool settings are invalid. Restore a previous project version.');};
  if(saved!==undefined&&(!saved||saved.version!==1||typeof saved!=='object'))bad();
  const s=saved||{},snap={...state.snap,...s.snap},gizmo={...state.gizmo,...s.gizmo};
  const ids=value=>Array.isArray(value)&&value.length<=100000&&value.every(id=>typeof id==='string'&&id.length>0&&id.length<=128);
  if(typeof snap.enabled!=='boolean'||!SNAP_MODES.includes(snap.mode)||!Number.isFinite(snap.increment)||snap.increment<=0||!Number.isFinite(snap.angleDeg)||snap.angleDeg<=0||snap.angleDeg>360||typeof snap.pivot!=='string'||snap.pivot.length>64)bad();
  if(!GIZMO_SPACES.includes(gizmo.space)||!['move','rotate','scale'].includes(gizmo.active))bad();
  const units=s.units??(legacyUnits&&typeof legacyUnits==='object'?legacyUnits:state.units);
  if(!units||!['metric','imperial'].includes(units.system)||typeof units.unit!=='string'||!units.unit.length||units.unit.length>16||!Number.isFinite(units.scale)||units.scale<=0)bad();
  const cols=s.collections??state.collections;if(!Array.isArray(cols)||cols.length>1024)bad();
  const seen=new Set();let total=0;
  for(const c of cols){if(!c||typeof c.id!=='string'||!c.id.length||c.id.length>128||seen.has(c.id)||typeof c.name!=='string'||c.name.length>128||typeof c.visible!=='boolean'||typeof c.selectable!=='boolean'||!ids(c.members))bad();seen.add(c.id);total+=c.members.length;}
  if(total>100000||!ids(s.multiIds??[])||!SEL_TOOLS.includes(s.selectionTool??state.selectionTool)||!Number.isFinite(s.softRadius??state.softRadius)||(s.softRadius??state.softRadius)<=0)bad();
  return structuredClone({...s,version:1,snap,gizmo,units,collections:cols,multiIds:s.multiIds??[],selectionTool:s.selectionTool??state.selectionTool,softRadius:s.softRadius??state.softRadius});
}

function requireSceneObject(editor,object){
  if(!object?.isObject3D||object===editor.root)throw Error('Choose an object inside the scene.');
  for(let p=object.parent;p;p=p.parent)if(p===editor.root)return;
  throw Error('The object is not in this scene.');
}

function reparentPlan(object,parent){
  object.updateWorldMatrix(true,false);parent.updateWorldMatrix(true,false);
  if(![...object.matrixWorld.elements,...parent.matrixWorld.elements].every(Number.isFinite)||parent.matrixWorld.determinant()===0)throw Error('Cannot parent under a singular or non-finite transform.');
  const matrix=parent.matrixWorld.clone().invert().multiply(object.matrixWorld),position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3();
  matrix.decompose(position,quaternion,scale);
  const composed=new THREE.Matrix4().compose(position,quaternion,scale);
  const error=Math.max(...composed.elements.map((v,i)=>Math.abs(v-matrix.elements[i])));
  return {object,parent,matrix,position,quaternion,scale,automatic:object.matrixAutoUpdate&&error<1e-9&&[...position.toArray(),...quaternion.toArray(),...scale.toArray()].every(Number.isFinite)};
}

function applyReparent(plan){
  const {object,parent,matrix,position,quaternion,scale,automatic}=plan;
  parent.add(object);object.matrix.copy(matrix);object.matrixAutoUpdate=automatic;
  // A manual affine matrix retains shear instead of decomposing it away.
  if([...position.toArray(),...quaternion.toArray(),...scale.toArray()].every(Number.isFinite)){object.position.copy(position);object.quaternion.copy(quaternion);object.scale.copy(scale);}
  object.updateMatrixWorld(true);
}

function componentNeighbors(components){
  if(!(components?.ids instanceof Set)||!components.mesh?.geometry||!['vertex','edge','face'].includes(components.kind))throw Error('Select mesh components first.');
  const members=components.members(),neighbors=Array.from({length:members.length},()=>new Set());
  if(components.kind==='vertex'){
    for(const [a,b]of components.edges()){neighbors[a]?.add(b);neighbors[b]?.add(a);}
  }else{
    const incidence=new Map();
    members.forEach((vertices,id)=>{
      const keys=components.kind==='edge'?vertices:vertices.map((v,i)=>[v,vertices[(i+1)%vertices.length]].sort((a,b)=>a-b).join(':'));
      for(const key of keys){if(!incidence.has(key))incidence.set(key,[]);incidence.get(key).push(id);}
    });
    for(const ids of incidence.values())for(const a of ids)for(const b of ids)if(a!==b)neighbors[a].add(b);
  }
  for(const id of components.ids)if(!Number.isInteger(id)||id<0||id>=neighbors.length)throw Error('Component selection is stale. Select the mesh again.');
  return neighbors;
}

export function attachSceneFoundation(editor){
  if(editor.foundation)return editor.foundation;
  const state=defaults();
  const api={
    state,
    snapshot(){
      const {isolation,...saved}=state;
      return validateFoundationState({...editor.root.userData.fusion_scene_foundation,...structuredClone(saved),version:1});
    },
    hydrate(saved=editor.root.userData.fusion_scene_foundation){
      const restored=validateFoundationState(saved,editor.root.userData.units);
      Object.assign(state,restored,{isolation:null});editor.localView=null;
      applySnap(editor,state.snap);editor.transform?.setSpace(state.gizmo.space==='global'?'world':'local');
      return state;
    },
    setSnap({enabled=state.snap.enabled,mode=state.snap.mode,increment=state.snap.increment,angleDeg=state.snap.angleDeg,pivot=state.snap.pivot}={}){
      if(!SNAP_MODES.includes(mode))throw Error('snap mode');
      if(!Number.isFinite(+increment)||+increment<=0||!Number.isFinite(+angleDeg)||+angleDeg<=0||+angleDeg>360)throw Error('Snap increment and angle must be positive finite values.');
      if(typeof pivot!=='string'||pivot.length>64)throw Error('Snap pivot must be a named setting.');
      state.snap={enabled:!!enabled,mode,increment:+increment,angleDeg:+angleDeg,pivot};
      applySnap(editor,state.snap);
      editor.change?.('snap');
      return state.snap;
    },
    setGizmoSpace(space){
      if(!GIZMO_SPACES.includes(space))throw Error('gizmo space');
      state.gizmo.space=space;
      // TransformControls: world vs local; normal/gimbal map to local until dedicated handles ship.
      editor.transform.setSpace(space==='global'?'world':'local');
      return state.gizmo;
    },
    setGizmoMode(mode){
      if(!['move','rotate','scale'].includes(mode))throw Error('gizmo mode');
      state.gizmo.active=mode;
      const map={move:'translate',rotate:'rotate',scale:'scale'};
      editor.mode(map[mode]);
      return state.gizmo;
    },
    parent(child,parent){
      requireSceneObject(editor,child);
      if(parent!==editor.root)requireSceneObject(editor,parent);
      for(let ancestor=parent;ancestor;ancestor=ancestor.parent)if(ancestor===child)throw Error('Cannot parent an object to itself or its descendant.');
      if(child.parent===parent)return {child:child.uuid,parent:parent.uuid};
      applyReparent(reparentPlan(child,parent));
      editor.commit?.();
      return {child:child.uuid,parent:parent.uuid};
    },
    unparent(child){
      requireSceneObject(editor,child);
      if(child.parent===editor.root)return {child:child.uuid,parent:null};
      applyReparent(reparentPlan(child,editor.root));
      editor.commit?.();
      return {child:child.uuid,parent:null};
    },
    group(objects){
      const unique=[...new Set(objects)].filter(Boolean);for(const object of unique)requireSceneObject(editor,object);
      // Grouping a parent and its child keeps their existing relationship.
      const chosen=new Set(unique),list=unique.filter(object=>{for(let p=object.parent;p;p=p.parent)if(chosen.has(p))return false;return true;});
      if(list.length<1)throw Error('group needs objects');
      const g=new THREE.Group();g.name='Group';editor.root.updateWorldMatrix(true,false);g.matrixWorld.copy(editor.root.matrixWorld);
      const plans=list.map(o=>reparentPlan(o,editor.root));
      editor.root.add(g);for(const plan of plans)applyReparent({...plan,parent:g});
      editor.select?.(g);editor.commit?.();
      return g;
    },
    instanceOf(source){
      if(!source)throw Error('source');
      const clone=source.clone(true);
      clone.name=(source.name||'Object')+' instance';
      clone.userData.instanceOf=source.uuid;
      editor.root.add(clone);editor.select?.(clone);editor.commit?.();
      return clone;
    },
    createCollection(name='Layer'){
      if(typeof name!=='string'||!name.length||name.length>128||state.collections.length>=1024)throw Error('Choose a collection name below 129 characters; at most 1,024 collections.');
      const col={id:'col-'+crypto.randomUUID(),name,visible:true,selectable:true,members:[]};
      state.collections.push(col);editor.commit?.();return col;
    },
    assignCollection(object,collectionId){
      const col=state.collections.find(c=>c.id===collectionId);if(!col||!object)throw Error('assign');
      for(const c of state.collections)c.members=c.members.filter(id=>id!==object.uuid);
      col.members.push(object.uuid);
      object.userData.collectionId=collectionId;
      object.visible=col.visible;
      editor.commit?.();
      return col;
    },
    setCollectionVisible(collectionId,visible){
      const col=state.collections.find(c=>c.id===collectionId);if(!col)throw Error('collection');
      col.visible=!!visible;
      for(const id of col.members){const o=editor.root.getObjectByProperty('uuid',id);if(o)o.visible=col.visible;}
      editor.commit?.();
      return col;
    },
    isolateSelection(){
      const sel=editor.selected;if(!sel)throw Error('nothing selected');
      state.isolation=new Set([sel.uuid]);
      editor.localView=state.isolation;
      editor.change?.('view');
      return [...state.isolation];
    },
    clearIsolation(){state.isolation=null;editor.localView=null;editor.change?.('view');},
    setSelectionTool(tool,{softRadius=state.softRadius}={}){
      if(!SEL_TOOLS.includes(tool))throw Error('sel tool');
      if(!Number.isFinite(+softRadius)||+softRadius<=0)throw Error('Soft selection radius must be positive.');
      state.selectionTool=tool;state.softRadius=+softRadius;
      return {tool:state.selectionTool,softRadius:state.softRadius};
    },
    growComponentSelection(components,{by=1}={}){
      if(!Number.isInteger(by)||by<1||by>100)throw Error('Grow steps must be 1–100.');
      const neighbors=componentNeighbors(components);let ids=new Set(components.ids);
      for(let step=0;step<by;step++){const next=new Set(ids);for(const id of ids)for(const neighbor of neighbors[id])next.add(neighbor);ids=next;}
      components.ids=ids;components.update?.();return [...ids];
    },
    shrinkComponentSelection(components,{by=1}={}){
      if(!Number.isInteger(by)||by<1||by>100)throw Error('Shrink steps must be 1–100.');
      const neighbors=componentNeighbors(components);let ids=new Set(components.ids);
      for(let step=0;step<by;step++)ids=new Set([...ids].filter(id=>[...neighbors[id]].every(neighbor=>ids.has(neighbor))));
      components.ids=ids;components.update?.();return [...ids];
    },
    softSelectWeights(components,{center=0,radius=state.softRadius}={}){
      componentNeighbors(components);if(!Number.isFinite(radius)||radius<=0)throw Error('Soft selection radius must be positive.');
      const members=components.members(),mesh=components.mesh;mesh.updateWorldMatrix(true,false);
      const point=id=>{if(!members[id]?.length)throw Error('Soft selection center is missing.');const p=new THREE.Vector3();for(const index of members[id])p.add(new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,index));return p.divideScalar(members[id].length).applyMatrix4(mesh.matrixWorld);};
      const origin=point(center);
      const weights={};
      for(const id of components.ids){
        const d=point(id).distanceTo(origin);
        weights[id]=d>=radius?0:1-d/radius;
      }
      return {kind:'soft_weights',radius,weights};
    },
    setUnits({system='metric',unit='m',scale=1}={}){
      if(!['metric','imperial'].includes(system))throw Error('system');
      if(typeof unit!=='string'||!unit.length||unit.length>16||!Number.isFinite(+scale)||+scale<=0)throw Error('Scene units need a name and positive finite scale.');
      state.units={system,unit,scale:+scale};
      editor.root.userData.units=structuredClone(state.units);
      editor.commit?.();
      return state.units;
    },
    toMeters(value){return value*state.units.scale;},
    fromMeters(value){return value/state.units.scale;},
    setMultiEdit(ids=[]){
      if(!Array.isArray(ids)||ids.length>100000||ids.some(id=>typeof id!=='string'||!id.length||id.length>128))throw Error('Multi-object selection IDs are invalid.');
      state.multiIds=[...ids];
      return {active:state.multiIds.length>1,ids:state.multiIds};
    },
    applyMultiTranslate(delta=[0,0,0]){
      const [dx,dy,dz]=delta;
      for(const id of state.multiIds){
        const o=editor.root.getObjectByProperty('uuid',id);if(!o)continue;
        o.position.x+=dx;o.position.y+=dy;o.position.z+=dz;
      }
      editor.commit?.();
      return state.multiIds.length;
    },
    undoMeta(){
      return {
        kind:'undo_meta',
        depth:editor.historyAt??0,
        limit:200,
        nonDestructive:!!editor.selected?.userData?.modifierStack||true,
        journal:!!editor.journal,
      };
    },
    outlinerTree(){
      return editor.root.children.map(o=>({
        id:o.uuid,name:o.name,visible:o.visible,
        children:o.children.filter(c=>!c.isLight&&!c.isCamera).map(c=>c.uuid),
        instanceOf:o.userData.instanceOf||null,
        collectionId:o.userData.collectionId||null,
      }));
    },
  };
  editor.foundation=api;
  api.snapGesture=new GeometrySnapGesture(editor);
  api.hydrate();
  return api;
}

function applySnap(editor,snap){
  if(!editor.transform)return;
  if(!snap.enabled){
    editor.transform.setTranslationSnap(null);
    editor.transform.setRotationSnap(null);
    editor.transform.setScaleSnap(null);
    return;
  }
  const inc=GEOMETRY_SNAP_MODES.includes(snap.mode)?null:snap.increment;
  editor.transform.setTranslationSnap(inc);
  editor.transform.setRotationSnap(THREE.MathUtils.degToRad(snap.angleDeg));
  editor.transform.setScaleSnap(snap.increment);
}
