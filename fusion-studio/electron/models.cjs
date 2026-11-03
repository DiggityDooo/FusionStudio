const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const text=(value,label,max=2048)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('Invalid '+label+'.');return value.trim();};
function profile(input){
 const name=text(input?.name,'profile name',100),model=text(input.model,'model ID',256),adapter=input.adapter;
 if(!['openai-compatible','ollama'].includes(adapter))throw Error('Unsupported model adapter.');
 const url=new URL(text(input.baseUrl,'base URL'));if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('Base URL must be HTTP(S), without embedded credentials, query or fragment.');
 return {name,model,adapter,baseUrl:url.href.replace(/\/$/,'')};
}
class ModelConnections{
 constructor(root,{seal,open,fetchImpl=fetch,timeoutMs=120000}={}){this.file=path.join(root,'model-connections.json');this.seal=seal;this.open=open;this.fetch=fetchImpl;this.timeoutMs=timeoutMs;this.active=new Map();this.profiles=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')).profiles:[];if(!Array.isArray(this.profiles))throw Error('Invalid model connection settings.');}
 list(){return this.profiles.map(({secret,...p})=>({...p,hasKey:!!secret}));}
 persist(){fs.mkdirSync(path.dirname(this.file),{recursive:true});const temp=this.file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temp,JSON.stringify({version:1,profiles:this.profiles},null,2),{flag:'wx'});fs.renameSync(temp,this.file);}
 async save(input){const p=profile(input),old=input.id?this.profiles.find(p=>p.id===input.id):null;if(input.id&&!old)throw Error('Model profile no longer exists.');let secret=old?.secret;
  if(input.clearKey)secret=undefined;
  if(input.apiKey!==undefined&&input.apiKey!==''){if(typeof input.apiKey!=='string'||input.apiKey.length>8192)throw Error('Invalid API key.');if(!this.seal)throw Error('Encrypted key storage is unavailable.');secret=Buffer.from(await this.seal(input.apiKey)).toString('base64');}
  const next={id:old?.id||crypto.randomUUID(),...p,...(secret?{secret}:{})},before=this.profiles;this.profiles=old?before.map(p=>p.id===old.id?next:p):[...before,next];try{this.persist();}catch(error){this.profiles=before;throw error;}return this.list().find(p=>p.id===next.id);
 }
 remove(id){if(this.active.size)throw Error('Cancel the model request before deleting a profile.');if(!this.profiles.some(p=>p.id===id))throw Error('Model profile no longer exists.');const before=this.profiles;this.profiles=before.filter(p=>p.id!==id);try{this.persist();}catch(error){this.profiles=before;throw error;}return this.list();}
 cancel(id){const pending=this.active.get(id);if(!pending)return false;pending.cancelled=true;pending.controller.abort();return true;}
 close(){for(const id of this.active.keys())this.cancel(id);}
 async chat({profileId,messages,requestId=crypto.randomUUID(),test=false}={}){
  const p=this.profiles.find(p=>p.id===profileId);if(!p)throw Error('Choose a saved model profile.');
  if(!Array.isArray(messages)||!messages.length||messages.length>100||messages.some(m=>!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string'||!m.content.trim())||Buffer.byteLength(JSON.stringify(messages))>256*1024)throw Error('Conversation must contain 1–100 text messages below 256 KiB.');
  text(requestId,'request ID',100);if(this.active.size)throw Error('A model request is already running.');
  const pending={controller:new AbortController(),cancelled:false,timedOut:false};this.active.set(requestId,pending);const timer=setTimeout(()=>{pending.timedOut=true;pending.controller.abort();},this.timeoutMs);
  try{
   const key=p.secret?await this.open(Buffer.from(p.secret,'base64')):null;
   const endpoint=p.baseUrl+(p.adapter==='ollama'?'/api/chat':'/chat/completions');
   const body={model:p.model,messages:messages.map(({role,content})=>({role,content})),stream:false,...(test?(p.adapter==='ollama'?{options:{num_predict:16}}:{max_tokens:16}):{})};
   const response=await this.fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key}:{})},body:JSON.stringify(body),signal:pending.controller.signal});
   if(!response.ok)throw Error(response.status===401||response.status===403?'Model authentication failed.':response.status===404?'Model or API route was not found.':response.status===429?'Model service rate limit reached.':'Model service rejected request (HTTP '+response.status+').');
   let bytes=0,chunks=[];for await(const chunk of response.body){bytes+=chunk.length;if(bytes>2*1024*1024){pending.controller.abort();throw Error('Model response exceeds 2 MiB.');}chunks.push(chunk);}
   let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('Model service returned invalid JSON.');}
   const content=p.adapter==='ollama'?data.message?.content:data.choices?.[0]?.message?.content;
   if(typeof content!=='string'||!content.trim())throw Error('Model service returned no text response.');
   return {requestId,profileId:p.id,model:p.model,message:{role:'assistant',content}};
  }catch(error){if(pending.cancelled)throw Error('Model request cancelled.');if(pending.timedOut)throw Error('Model request timed out.');if(error instanceof TypeError)throw Error('Cannot reach model service. Check base URL and server availability.');throw error;}
  finally{clearTimeout(timer);this.active.delete(requestId);}
 }
 test(profileId,requestId){return this.chat({profileId,requestId,messages:[{role:'user',content:'Reply with OK.'}],test:true}).then(r=>({ok:true,model:r.model}));}
}
module.exports={ModelConnections,profile};
