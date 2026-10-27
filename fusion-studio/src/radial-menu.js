// Pie / marking (radial), quad and popup list menus opened at the pointer.
// Releasing the opening key/button over an item runs it; a quick tap leaves the menu open for clicking (or runs `tap`).
export const DEAD_ZONE=30,HOLD_MS=250,RADIUS=120;
// Sector 0 is straight up; sectors run clockwise.
export function sectorIndex(dx,dy,count){if(count<1||Math.hypot(dx,dy)<DEAD_ZONE)return -1;const a=(Math.atan2(dx,-dy)+2*Math.PI)%(2*Math.PI);return Math.round(a/(2*Math.PI/count))%count;}
export const QUADRANTS=['top-left','top-right','bottom-left','bottom-right'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class RadialMenu {
  constructor(doc=document){this.doc=doc;this.root=null;this.last={x:innerWidth/2,y:innerHeight/2};doc.addEventListener('pointermove',e=>{this.last={x:e.clientX,y:e.clientY};},true);}
  get open(){return !!this.root;}
  // spec: {title, layout:'pie'|'quad'|'list', items:[{label,run,shortcut?,group?,disabled?}], x?, y?, holdKey?, holdButton?, tap?, filter?}
  show(spec){
    this.close();const {layout='pie',items}=spec,x=spec.x??this.last.x,y=spec.y??this.last.y,started=performance.now(),doc=this.doc;
    const root=doc.createElement('div');root.className=`radial-menu radial-${layout}`;root.setAttribute('role','menu');root.setAttribute('aria-label',spec.title);this.root=root;let hot=-1,query='';
    const visible=()=>items.map((item,i)=>({item,i})).filter(({item})=>!query||item.label.toLowerCase().includes(query));
    const draw=()=>{
      const list=visible(),button=({item,i},n)=>`<button role="menuitem" aria-label="${esc(item.label)}" data-radial="${i}" class="radial-item${i===hot?' hot':''}" ${item.disabled?'disabled':''}>${layout==='pie'&&n<9?`<small>${n+1}</small>`:''}${esc(item.label)}${item.shortcut?`<kbd>${esc(item.shortcut)}</kbd>`:''}</button>`;
      const body=layout==='quad'?QUADRANTS.map((q,k)=>`<div class="radial-quadrant ${q}">${list.filter(({item})=>(item.group??0)===k).map(button).join('')}</div>`).join(''):list.map(button).join('');
      root.innerHTML=`<div class="radial-anchor" style="left:${x}px;top:${y}px"><div class="radial-title">${esc(spec.title)}${spec.filter?`<span class="radial-query">${esc(query)||'type to filter'}</span>`:''}</div>${body}</div>`;
      const radius=Math.max(RADIUS,list.length*18);if(layout==='pie')list.forEach(({i},n)=>{const a=n*2*Math.PI/list.length,el=root.querySelector(`[data-radial="${i}"]`);el.style.transform=`translate(calc(${Math.sin(a)*radius}px - 50%),calc(${-Math.cos(a)*radius}px - 50%))`;});
      root.querySelectorAll('[data-radial]').forEach(el=>{el.onclick=e=>{e.stopPropagation();this.pick(items[Number(el.dataset.radial)]);};el.onpointerenter=()=>{hot=Number(el.dataset.radial);mark();};});
    };
    const mark=()=>root.querySelectorAll('[data-radial]').forEach(el=>el.classList.toggle('hot',Number(el.dataset.radial)===hot));
    const aim=e=>{if(layout!=='pie')return;const list=visible(),s=sectorIndex(e.clientX-x,e.clientY-y,list.length);hot=s<0?-1:list[s].i;mark();};
    const release=()=>{const held=performance.now()-started>HOLD_MS;if(hot>=0)this.pick(items[hot]);else if(held)this.close();else if(spec.tap){this.close();spec.tap();}};
    root.onpointermove=aim;root.onpointerdown=e=>{if(e.target===root){e.preventDefault();this.close();}};root.oncontextmenu=e=>e.preventDefault();
    root.onpointerup=e=>{if(spec.holdButton!==undefined&&e.button===spec.holdButton){spec.holdButton=undefined;release();}};
    this.keys=e=>{
      if(!this.root)return;if(e.type==='keyup'){if(spec.holdKey&&e.key.toLowerCase()===spec.holdKey){spec.holdKey=null;release();}return;}
      e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;
      if(e.key==='Escape'){this.close();return;}
      if(e.key==='Enter'&&hot>=0){this.pick(items[hot]);return;}
      const list=visible();
      if(spec.filter&&(e.key.length===1||e.key==='Backspace')){query=e.key==='Backspace'?query.slice(0,-1):query+e.key.toLowerCase();hot=visible()[0]?.i??-1;draw();return;}
      if(/^[1-9]$/.test(e.key)&&list[Number(e.key)-1]){this.pick(list[Number(e.key)-1].item);}
    };
    doc.addEventListener('keydown',this.keys,true);doc.addEventListener('keyup',this.keys,true);
    doc.body.append(root);draw();return root;
  }
  pick(item){if(!item||item.disabled)return;this.close();item.run();}
  close(){if(!this.root)return;this.root.remove();this.root=null;this.doc.removeEventListener('keydown',this.keys,true);this.doc.removeEventListener('keyup',this.keys,true);}
}
