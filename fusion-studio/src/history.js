// Mixed history: channel deltas never serialize mesh buffers. Unmigrated edits
// retain exact scene snapshots. The baseline is materialized only at a snapshot boundary.
const checkpointOwner=Symbol('history-checkpoint-owner');
export class CommandHistory {
  constructor({capture,restore,applyTransform,applyInsertion,applyRig,applyMetadata,onChange=()=>{},limit=200}){Object.assign(this,{capture,restore,applyTransform,applyInsertion,applyRig,applyMetadata,onChange,limit});this.entries=[];this.cursor=0;this.baseline=null;this.pending=new Map();this.insertions=new Map();this.rigs=new Map();this.metadataChanges=new Map();this.restoring=false;}
  reset(){this.entries=[];this.cursor=0;this.baseline=this.capture();this.pending.clear();this.insertions.clear();this.rigs.clear();this.metadataChanges.clear();this.onChange();}
  checkpoint(){
    if(this.restoring)throw Error('Finish undo or redo before starting a dependent update.');
    return {[checkpointOwner]:this,entryObjects:this.entries.slice(),entries:this.entries.map(entry=>({...entry})),cursor:this.cursor,baseline:this.baseline,pending:new Map(this.pending),insertions:new Map(this.insertions),rigs:new Map(this.rigs),metadataChanges:new Map([...this.metadataChanges].map(([id,fields])=>[id,new Map(fields)]))};
  }
  restoreCheckpoint(state){
    if(state?.[checkpointOwner]!==this)throw Error('The history checkpoint belongs to another document.');
    this.entries=state.entryObjects.slice();for(let i=0;i<this.entries.length;i++){const entry=this.entries[i],saved=state.entries[i];for(const key of Object.keys(entry))if(!Object.hasOwn(saved,key))delete entry[key];Object.assign(entry,saved);}this.cursor=state.cursor;this.baseline=state.baseline;this.pending=new Map(state.pending);this.insertions=new Map(state.insertions);this.rigs=new Map(state.rigs);this.metadataChanges=new Map([...state.metadataChanges].map(([id,fields])=>[id,new Map(fields)]));this.onChange();
  }
  materialize(){
    if(!this.pending.size&&!this.insertions.size&&!this.rigs.size&&!this.metadataChanges.size)return this.baseline;
    const doc=JSON.parse(this.baseline);
    for(const [id,data] of this.insertions){doc.object.children=(doc.object.children||[]).filter(n=>n.uuid!==id);if(data){doc.object.children.push(data.object);for(const key of ['geometries','materials','textures','images','skeletons','animations'])if(data[key])doc[key]=[...new Map([...(doc[key]||[]),...data[key]].map(n=>[n.uuid,n])).values()];}}
    const visit=node=>{const state=this.pending.get(node.uuid);if(state){if(node.matrix===undefined&&state.position&&node.matrixAutoUpdate!==false){node.position=state.position;node.quaternion=state.quaternion;node.scale=state.scale;}else node.matrix=Array.isArray(state)?state:state.matrix;}const rig=this.rigs.get(node.uuid);if(rig){node.userData??={};if(node.userData.fusion_deformation){if(rig.deformationPose)node.userData.fusion_deformation.rotationState=rig.deformationPose;else delete node.userData.fusion_deformation.rotationState;}for(const [key,value] of [['fusion_ik',rig.controls],['fusion_joint_limits',rig.limits??null],['pose',rig.pose]]){if(value===null)delete node.userData[key];else node.userData[key]=value;}}for(const [key,value] of this.metadataChanges.get(node.uuid)||[]){node.userData??={};if(value===null)delete node.userData[key];else node.userData[key]=value;}for(const child of node.children||[])visit(child);};visit(doc.object);
    this.baseline=JSON.stringify(doc);this.pending.clear();this.insertions.clear();this.rigs.clear();this.metadataChanges.clear();return this.baseline;
  }
  push(entry){this.entries.splice(this.cursor);this.entries.push(entry);while(this.entries.length>this.limit||(this.entries.length>1&&this.snapshotCharacters>60000000&&this.entries.some(e=>e.type==='snapshot')))this.entries.shift();this.cursor=this.entries.length;this.onChange();}
  snapshot(label='Scene edit'){
    if(this.restoring)return;
    if(this.baseline===null)return this.reset();
    const before=this.materialize(),after=this.capture();if(before===after)return;
    this.baseline=after;this.push({type:'snapshot',label,before,after});
  }
  transform(id,before,after,label='Transform'){
    if(JSON.stringify(before)===JSON.stringify(after))return;
    this.cacheTransform(id,after);this.push({type:'transform',label,id,before,after});
  }
  insert(source,label){const data=structuredClone(source),id=data.object.uuid;this.insertions.set(id,data);this.push({type:'insert',label,id,data});}
  cacheTransform(id,state){this.pending.set(id,structuredClone(state));}
  cacheRig(state){this.rigs.set(state.ownerId,{controls:structuredClone(state.controls),limits:structuredClone(state.limits??null),pose:structuredClone(state.pose),deformationPose:structuredClone(state.deformationPose??null)});for(const bone of state.bones)this.cacheTransform(bone.id,bone);}
  rig(before,after,label='Pose rig'){if(JSON.stringify(before)===JSON.stringify(after))return;const entry=structuredClone({type:'rig',label,before,after});this.cacheRig(entry.after);this.push(entry);}
  cacheMetadata(id,key,value){if(!this.metadataChanges.has(id))this.metadataChanges.set(id,new Map());this.metadataChanges.get(id).set(key,structuredClone(value));}
  metadata(id,key,before,after,label='Change metadata'){if(JSON.stringify(before)===JSON.stringify(after))return;const entry=structuredClone({type:'metadata',id,key,before,after,label});this.cacheMetadata(id,key,entry.after);this.push(entry);}
  async step(direction){
    if(this.restoring)return false;
    const at=direction<0?this.cursor-1:this.cursor,entry=this.entries[at];if(!entry)return false;
    this.restoring=true;
    try{
      const state=direction<0?entry.before:entry.after;
      if(entry.type==='transform'){this.applyTransform(entry.id,state);this.cacheTransform(entry.id,state);}
      else if(entry.type==='rig'){this.applyRig(state);this.cacheRig(state);}
      else if(entry.type==='metadata'){await this.applyMetadata(entry.id,entry.key,state);this.cacheMetadata(entry.id,entry.key,state);}
      else if(entry.type==='insert'){const data=direction<0?null:entry.data;await this.applyInsertion(entry.id,data);this.insertions.set(entry.id,data);}
      else {await this.restore(JSON.parse(state));this.baseline=state;this.pending.clear();this.insertions.clear();this.rigs.clear();this.metadataChanges.clear();}
      this.cursor+=direction;this.onChange();return true;
    }finally{this.restoring=false;}
  }
  get canUndo(){return this.cursor>0;}
  get canRedo(){return this.cursor<this.entries.length;}
  get deltaBytes(){return this.entries.filter(e=>e.type!=='snapshot').reduce((n,e)=>n+JSON.stringify(e).length*2,0);}
  get snapshotCharacters(){return [...new Set([this.baseline,...this.entries.filter(e=>e.type==='snapshot').flatMap(e=>[e.before,e.after])])].reduce((n,s)=>n+(s?.length||0),0);}
}
