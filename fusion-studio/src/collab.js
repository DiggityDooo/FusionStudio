// A32 collaboration / pipeline previews.

const uid=()=>'co'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);

export function createCloudProject({name='Project',users=['you']}={}){
  return {version:1,kind:'cloud_project',id:uid(),name,users:[...users],sessions:[],live:false};
}

export function startLiveSession(project,{user='you'}={}){
  const s={id:uid(),user,joined:Date.now()};project.sessions.push(s);project.live=true;return s;
}

export function createVersionHistory({name='main'}={}){
  return {version:1,kind:'versions',branch:name,commits:[],branches:[{name,head:null}]};
}

export function commitVersion(hist,{message='update',author='you'}={}){
  const c={id:uid(),message,author,t:Date.now(),parent:hist.commits.at(-1)?.id||null};
  hist.commits.push(c);const br=hist.branches.find(b=>b.name===hist.branch);if(br)br.head=c.id;return c;
}

export function branchVersion(hist,name){
  if(hist.branches.some(b=>b.name===name))throw Error('Branch exists.');
  const b={name,head:hist.commits.at(-1)?.id||null};hist.branches.push(b);return b;
}

export function rollbackVersion(hist,commitId){
  const i=hist.commits.findIndex(c=>c.id===commitId);if(i<0)throw Error('Commit missing.');
  hist.commits=hist.commits.slice(0,i+1);const br=hist.branches.find(b=>b.name===hist.branch);if(br)br.head=commitId;return hist;
}

export function createReviewPlaylist({name='Cuts'}={}){
  return {version:1,kind:'review',name,items:[],annotations:[]};
}

export function addReviewItem(playlist,{title='Shot',uri=''}={}){
  const it={id:uid(),title,uri};playlist.items.push(it);return it;
}

export function annotateReview(playlist,{itemId,text,timecode=0}={}){
  const a={id:uid(),itemId,text,timecode,t:Date.now()};playlist.annotations.push(a);return a;
}

export function createAssetLibrary({name='Lib'}={}){
  return {version:1,kind:'asset_lib',name,assets:[]};
}

export function tagAsset(lib,{name,tags=[],metadata={}}={}){
  const a={id:uid(),name,tags:[...tags],metadata:{...metadata}};lib.assets.push(a);return a;
}

export function searchAssets(lib,query){
  const q=String(query).toLowerCase();
  return lib.assets.filter(a=>a.name.toLowerCase().includes(q)||a.tags.some(t=>t.toLowerCase().includes(q)));
}

export function createTrackerBoard({name='Shots'}={}){
  return {version:1,kind:'tracker',name,tasks:[]};
}

export function addTrackerTask(board,{title,type='shot',status='todo',asset=null}={}){
  const t={id:uid(),title,type,status,asset};board.tasks.push(t);return t;
}

export function createFarmJob({frames=100,priority=50}={}){
  return {version:1,kind:'farm_job',id:uid(),frames,priority,status:'queued',workers:0};
}

export function farmJobProgress(job,{done=0,workers=1}={}){
  job.workers=workers;job.done=done;job.status=done>=job.frames?'done':'running';return job;
}

export function createLicenseSeats({seats=5,product='Fusion Studio'}={}){
  return {version:1,kind:'license',product,seats,used:0,assignments:[]};
}

export function assignSeat(lic,{user}={}){
  if(lic.used>=lic.seats)throw Error('No seats.');
  const a={user,t:Date.now()};lic.assignments.push(a);lic.used++;return a;
}

export function validatePublish({asset,checks=['name','thumbnail','schema']}={}){
  const results=checks.map(c=>({check:c,ok:c==='name'?!!asset?.name:true}));
  return {version:1,kind:'publish_validate',ok:results.every(r=>r.ok),results};
}

export function createUsdAssembly({name='shot.usda'}={}){
  return {version:1,kind:'usd_assembly',name,layers:[],sublayers:[]};
}

export function addUsdLayer(asm,{path,opinion='weaker'}={}){
  const L={id:uid(),path,opinion};asm.layers.push(L);asm.sublayers.push(path);return L;
}

export function createDependencyGraph(){
  return {version:1,kind:'deps',nodes:[],edges:[]};
}

export function trackDependency(graph,{from,to,kind='ref'}={}){
  if(!graph.nodes.includes(from))graph.nodes.push(from);
  if(!graph.nodes.includes(to))graph.nodes.push(to);
  graph.edges.push({from,to,kind});return graph;
}

export function relinkDependency(graph,{from,oldTo,newTo}={}){
  const e=graph.edges.find(x=>x.from===from&&x.to===oldTo);if(!e)throw Error('Edge missing.');
  e.to=newTo;if(!graph.nodes.includes(newTo))graph.nodes.push(newTo);return e;
}
