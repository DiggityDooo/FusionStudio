import * as THREE from 'three';
import {hybridTransaction} from './hybrid.js';
import {assertLayerEditable,validateSculptLayers,sculptBufferCopy,disposeUnusedSculptGeometry,SCULPT_LAYER_LIMITS} from './sculpt-layers.js';
import {shapeEditingSession} from './shape-session.js';

export function registerSculptMask(registry,editor){
  registry.register({id:'sculpt.mask',label:'Edit sculpt mask',undo:'snapshot',execute:async(_,p,signal)=>{
    if(!['clear','invert'].includes(p.action))throw Error('Choose Clear or Invert for the sculpt mask.');
    if(p.projectId!==undefined&&p.projectId!==editor.root.uuid)throw Error('The mask request belongs to another project.');
    const mesh=editor.selected,shape=shapeEditingSession(editor,mesh);
    if(!mesh?.isMesh||p.meshId!==undefined&&p.meshId!==mesh.uuid)throw Error('Select the mesh whose sculpt mask you want to edit.');
    if(editor.creatorShapeSession&&!shape)throw Error('Select the active neutral shape editing copy.');
    if(!shape)assertLayerEditable(mesh);validateSculptLayers(mesh);
    const geometry=mesh.geometry,position=geometry.attributes.position,mask=geometry.attributes.mask;
    if(!position||position.count>SCULPT_LAYER_LIMITS.vertices||mask&&(mask.itemSize!==1||mask.count!==position.count))throw Error('The sculpt mask has an incompatible vertex mapping or exceeds the supported vertex limit.');
    const values=new Float32Array(position.count);let changed=false;
    for(let i=0;i<values.length;i++){
      const old=mask?mask.getX(i):0;if(!Number.isFinite(old)||old<0||old>1)throw Error('The sculpt mask contains invalid values. Restore a valid project version.');
      values[i]=p.action==='clear'?0:1-old;changed||=values[i]!==old;
    }
    if(!changed)return {changed:false,vertices:values.length};
    const apply=()=>{
      if(signal?.aborted)throw Error('Sculpt mask edit cancelled.');
      const copy=sculptBufferCopy(geometry);copy.setAttribute('mask',new THREE.BufferAttribute(values,1));mesh.geometry=copy;
      return {changed:true,vertices:values.length};
    };
    let result;
    if(shape){result=apply();editor.change('sculpt-stroke');}
    else result=await hybridTransaction(editor,apply,{signal});
    disposeUnusedSculptGeometry(editor,geometry);return result;
  }});
}
