export class OperatorRegistry {
  constructor(context,{preflight=async()=>true,onEvent=()=>{},locked=()=>false}={}){Object.assign(this,{context,preflight,onEvent,locked});this.definitions=new Map();this.running=null;}
  register(operator){if(this.definitions.has(operator.id))throw Error('Duplicate operator: '+operator.id);this.definitions.set(operator.id,operator);}
  list(){return [...this.definitions.values()].map(op=>({id:op.id,label:op.label,hidden:!!op.hidden,available:op.poll?.(this.context)!==false}));}
  async run(id,properties={}){
    const op=this.definitions.get(id);if(!op)throw Error('Unknown operator: '+id);
    if(this.context.creatorShapeSession&&!['character.creator_shape_apply','character.creator_shape_cancel','mesh.components'].includes(id))throw Error('Apply or cancel the active shape-key edit first.');
    if(this.running||this.locked())throw Error('Finish or cancel the current operation first.');
    if(op.poll?.(this.context)===false)throw Error(op.unavailable||'This operation is unavailable for the current selection.');
    const props=op.validate?op.validate(properties):properties;
    const controller=new AbortController();this.running={id,controller};this.onEvent({id,label:op.label,status:'started'});
    try{
      const decision=await this.preflight(op,this.context,props);
      if(!decision||controller.signal.aborted){this.onEvent({id,label:op.label,status:'cancelled'});return null;}
      if(op.poll?.(this.context)===false)throw Error('Selection changed before the operation could execute.');
      const result=await op.execute(this.context,{...props,workingCopy:decision==='copy'},controller.signal);this.onEvent({id,label:op.label,status:'complete'});return result;
    }catch(error){this.onEvent({id,label:op.label,status:'failed',message:error.message});throw error;}
    finally{this.running=null;this.onEvent({id,label:op.label,status:'idle'});}
  }
  cancel(){this.running?.controller.abort();}
}

export function registerFoundationOperators(registry,editor,render){
  registry.register({id:'object.transform',label:'Transform object',undo:'delta',poll:()=>!!editor.selected,validate:p=>{
    if(!['position','rotation','scale'].includes(p.kind)||!['x','y','z'].includes(p.axis)||!Number.isFinite(p.value))throw Error('Invalid transform properties');return p;
  },execute:(_,p)=>editor._transformField(p.kind,p.axis,p.value)});
  registry.register({id:'object.transform_gesture',label:'Transform object',undo:'delta',poll:()=>!!editor.selected,execute:(_,p)=>editor.finishTransform(p)});
  for(const type of ['cube','sphere','cylinder','torus','plane','cone'])registry.register({id:'mesh.add_'+type,label:'Add '+type,undo:'delta',execute:()=>editor._primitive(type)});
  registry.register({id:'mesh.extrude_region',label:'Extrude face region',undo:'snapshot',compatibility:'extrude',poll:()=>!!editor.meshTools.activeMesh&&editor.meshTools.faceIndex!==null,unavailable:'Click a face in Edit Mode first.',validate:p=>{if(!Number.isFinite(p.distance)||Math.abs(p.distance)>1000)throw Error('Extrusion distance must be finite and within 1000 meters');return p;},execute:(_,p)=>editor.extrudeOperator(p.distance,p.workingCopy)});
  registry.register({id:'history.undo',label:'Undo',undo:'none',poll:()=>!!editor.journal?.canUndo,execute:()=>editor._undo()});
  registry.register({id:'history.redo',label:'Redo',undo:'none',poll:()=>!!editor.journal?.canRedo,execute:()=>editor._redo()});
  registry.register({id:'history.adjust_transform',label:'Adjust last transform',undo:'none',poll:()=>editor.journal?.cursor===editor.journal?.entries.length&&editor.journal?.entries.at(-1)?.type==='transform',validate:p=>{if(!['position','rotation','scale'].includes(p.kind)||!['x','y','z'].includes(p.axis)||!Number.isFinite(p.value))throw Error('Invalid transform properties');return p;},execute:(_,p)=>editor.adjustTransform(p)});
  registry.register({id:'render.image',label:'Render image',undo:'none',execute:render});
}
