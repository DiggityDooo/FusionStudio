export function createSceneTools(editor,operators,{locked=()=>false}={}){
 let revision=0;
 const context=()=>({projectId:editor.root.uuid,revision});
 const inspect=object=>{if(!object)return null;const geometry=object.geometry;return {id:object.uuid,parentId:object.parent===editor.root?null:object.parent?.uuid,name:object.name,type:object.type,position:object.position.toArray(),rotation:object.rotation.toArray().slice(0,3).map(v=>v*180/Math.PI),scale:object.scale.toArray(),vertices:geometry?.attributes.position?.count||0,triangles:geometry?(geometry.index?.count??geometry.attributes.position?.count??0)/3:0,skinned:!!object.isSkinnedMesh,morphs:Object.keys(object.morphTargetDictionary||{}),materials:[].concat(object.material||[]).map(m=>({id:m.uuid,name:m.name})),preservedNative:!!object.userData?.nativeBlend};};
 return {changed(){revision++;},context,async invoke(tool,args={}){
  if(tool==='scene_inspect'){const objects=[];editor.root.traverse(o=>{if(o!==editor.root)objects.push(inspect(o));});return {...context(),selectionId:editor.selected?.uuid||null,objects};}
  if(tool==='selection_inspect')return {...context(),selection:inspect(editor.selected)};
  if(args.projectId!==editor.root.uuid||args.revision!==revision)throw Error('Scene changed. Inspect the current project and revision before editing.');
  if(locked()||operators.running||editor.meshTools?.stroke||editor.transform?.dragging||editor.creatorShapeSession)throw Error('Finish or cancel the current Fusion operation first.');
  const before=editor.selected;try{
   if(['selection_set','object_transform'].includes(tool)){const target=editor.root.getObjectByProperty('uuid',args.objectId);if(!target||target===editor.root)throw Error('Object is no longer in this scene.');editor.select(target);}
   if(tool==='primitive_add')await operators.run('mesh.add_'+args.type);
   else if(tool==='object_transform')await operators.run('object.transform',{kind:args.kind,axis:args.axis,value:args.value});
   else if(tool==='history_undo')await operators.run('history.undo');
   else if(tool==='history_redo')await operators.run('history.redo');
   else if(tool!=='selection_set')throw Error('Unsupported Fusion tool.');
   revision++;return {...context(),selection:inspect(editor.selected)};
  }catch(error){editor.select(before&&editor.root.getObjectByProperty('uuid',before.uuid)||null);throw error;}
 }};
}
