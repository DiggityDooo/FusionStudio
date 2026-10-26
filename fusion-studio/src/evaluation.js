// Scene jobs are projections of an immutable document revision, never its authority.
export class StaleEvaluation extends Error {constructor(){super('The scene changed while this result was being calculated.');this.name='StaleEvaluation';}}
export class SceneEvaluator {
  constructor(editor){this.editor=editor;this.epoch=0;this.serial=0;this.active=new Map();}
  invalidate(){this.epoch++;for(const job of this.active.values())job.abort.abort();this.active.clear();}
  async ticket(object,input){
    const root=this.editor.root,epoch=this.epoch;
    const bytes=new TextEncoder().encode(JSON.stringify(input));
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
    if(root!==this.editor.root||epoch!==this.epoch)throw new StaleEvaluation();
    const ticket={projectId:root.uuid,objectId:object.uuid,revision:epoch,inputHash:hash,requestId:++this.serial};
    return ticket;
  }
  current(ticket){return this.editor.root.uuid===ticket.projectId&&this.epoch===ticket.revision&&!!this.editor.root.getObjectByProperty('uuid',ticket.objectId);}
  async run(object,input,compute){
    const ticket=await this.ticket(object,input),key=object.uuid,abort=new AbortController();
    this.active.get(key)?.abort.abort();const job={ticket,abort};this.active.set(key,job);
    try{const result=await compute(ticket,abort.signal);if(abort.signal.aborted||this.active.get(key)!==job||!this.current(ticket))throw new StaleEvaluation();return result;}
    finally{if(this.active.get(key)===job)this.active.delete(key);}
  }
}
export function dependencyOrder(nodes){
  const map=new Map(nodes.map(n=>[n.id,n]));if(map.size!==nodes.length)throw Error('Duplicate evaluation node ID.');
  const state=new Map(),ordered=[];
  const visit=id=>{if(state.get(id)===1)throw Error('Evaluation dependency cycle: '+id);if(state.get(id)===2)return;const n=map.get(id);if(!n)throw Error('Missing evaluation dependency: '+id);state.set(id,1);for(const d of n.dependencies||[])visit(d);state.set(id,2);ordered.push(n);};
  for(const n of nodes)visit(n.id);return ordered;
}
export async function evaluateGraph(nodes,signal){const values=new Map();for(const n of dependencyOrder(nodes)){if(signal?.aborted)throw Error('Evaluation cancelled.');values.set(n.id,await n.evaluate(values,signal));}return values;}
