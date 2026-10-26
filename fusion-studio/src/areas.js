const leaf=(type='log')=>({id:crypto.randomUUID(),type});
export function validateLayout(tree,depth=0,ids=new Set()){
 if(!tree||depth>5||typeof tree.id!=='string'||ids.has(tree.id))throw Error('Invalid area layout');ids.add(tree.id);
 if(tree.children){if(!['row','column'].includes(tree.axis)||tree.children.length!==2||!Number.isFinite(tree.ratio)||tree.ratio<.15||tree.ratio>.85)throw Error('Invalid split');tree.children.forEach(n=>validateLayout(n,depth+1,ids));}
 else if(!['viewport','log'].includes(tree.type))throw Error('Unsupported editor');return tree;
}
export class AreaLayout {
 constructor(viewport,{storage=localStorage,onError=console.error,logs=()=>[]}={}){
  Object.assign(this,{viewport,storage,onError,logs});this.key='fusion-layout-v1';this.workspace='Layout';this.layouts={};this.maximized=null;
  try{const data=JSON.parse(storage.getItem(this.key)||'null');if(data?.version===1){for(const tree of Object.values(data.layouts)){validateLayout(tree);if(this.leaves(tree).filter(n=>n.type==='viewport').length!==1)throw Error('Layout requires one viewport');}this.layouts=data.layouts;}}catch(e){onError(e);}
  this.host=document.createElement('section');this.host.className='area-host';viewport.replaceWith(this.host);this.parking=document.createDocumentFragment();this.render();
 }
 get tree(){return this.layouts[this.workspace]??=leaf('viewport');}
 leaves(node=this.tree){return node.children?node.children.flatMap(n=>this.leaves(n)):[node];}
 find(id,node=this.tree){if(node.id===id)return node;return node.children?.map(n=>this.find(id,n)).find(Boolean);}
 persist(){try{this.storage.setItem(this.key,JSON.stringify({version:1,layouts:this.layouts}));}catch(e){this.onError(e);}}
 activate(workspace){this.workspace=workspace;this.maximized=null;this.render();}
 split(id,axis){if(this.leaves().length>=6)return;const node=this.find(id),old={...node,id:crypto.randomUUID()};Object.assign(node,{axis,ratio:.65,children:[old,leaf()]});delete node.type;this.persist();this.render();}
 join(id){this.maximized=null;const walk=node=>{if(node.children?.some(n=>n.id===id)){const kept=node.children.find(n=>n.id!==id);const closing=node.children.find(n=>n.id===id);if(this.leaves(closing).some(n=>n.type==='viewport'))this.leaves(kept)[0].type='viewport';Object.keys(node).forEach(k=>delete node[k]);Object.assign(node,kept);return true;}return node.children?.some(walk);};walk(this.tree);this.persist();this.render();}
 retype(id,type){const node=this.find(id);if(node.type===type)return;const other=this.leaves().find(n=>n.type===type);if(type==='viewport'){other.type='log';node.type='viewport';}else {const target=this.leaves().find(n=>n.id!==id);if(!target)return;target.type='viewport';node.type='log';}this.persist();this.render();}
 render(){
  this.parking.append(this.viewport);this.host.replaceChildren();
  const build=node=>{
   const el=document.createElement('div');el.dataset.area=node.id;
   if(node.children){el.className='area-split '+node.axis;el.style.setProperty('--ratio',node.ratio*100+'%');
    const handle=document.createElement('div');handle.className='area-divider';handle.setAttribute('role','separator');handle.tabIndex=0;handle.setAttribute('aria-label','Resize editor areas');handle.setAttribute('aria-orientation',node.axis==='row'?'vertical':'horizontal');
    const resize=value=>{node.ratio=Math.max(.15,Math.min(.85,value));el.style.setProperty('--ratio',node.ratio*100+'%');};
    handle.onpointerdown=e=>{handle.setPointerCapture(e.pointerId);handle.onpointermove=event=>{const box=el.getBoundingClientRect();resize(node.axis==='row'?(event.clientX-box.left)/box.width:(event.clientY-box.top)/box.height);};handle.onpointerup=()=>{handle.onpointermove=null;this.persist();};};
    handle.onkeydown=e=>{if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(e.key)){e.preventDefault();resize(node.ratio+(['ArrowLeft','ArrowUp'].includes(e.key)?-.025:.025));this.persist();}};
    el.append(build(node.children[0]),handle,build(node.children[1]));return el;
   }
   el.className='editor-area';const bar=document.createElement('header');bar.className='area-bar';const select=document.createElement('select');select.setAttribute('aria-label','Editor type');
   for(const [value,label] of [['viewport','3D Viewport'],['log','Info / History']]){const option=new Option(label,value);select.add(option);}select.value=node.type;if(this.leaves().length===1)select.options[1].disabled=true;select.onchange=()=>this.retype(node.id,select.value);bar.append(select);
   const button=(label,fn)=>{const b=document.createElement('button');b.textContent=label;b.onclick=fn;bar.append(b);};
   button('Split ↔',()=>this.split(node.id,'row'));button('Split ↕',()=>this.split(node.id,'column'));button(this.maximized?'Restore':'Maximize',()=>{this.maximized=this.maximized?null:node.id;this.render();});if(this.leaves().length>1)button('Join',()=>this.join(node.id));
   el.append(bar);if(node.type==='viewport')el.append(this.viewport);else {const log=document.createElement('pre');log.className='area-log';log.textContent=this.logs().join('\n')||'Operator events and undo history appear here.';el.append(log);}return el;
  };
  this.host.append(build(this.maximized?this.find(this.maximized):this.tree));
 }
 refreshLog(){for(const el of this.host.querySelectorAll('.area-log'))el.textContent=this.logs().join('\n')||'No operator events yet.';}
}
