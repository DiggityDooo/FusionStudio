const {spawn}=require('node:child_process');
const crypto=require('node:crypto');

// A private stdio channel to a child we own; never connects to a user's Blender.
class PersistentWorker {
  constructor(executable,script,root,env){Object.assign(this,{executable,script,root,env});this.child=null;this.pending=null;this.serial=0;}
  request(spec,onLog){
    if(this.pending)throw Error('Worker is busy.');
    clearTimeout(this.idle);
    return new Promise((resolve,reject)=>{
      this.pending={id:String(++this.serial),spec,onLog,resolve,reject};
      if(!this.child)this.start();else if(this.ready)this.send();
    });
  }
  start(){
    const token=crypto.randomBytes(24).toString('hex');this.prefix='FUSION_RPC_'+token+' ';this.ready=false;let buffer='';
    const child=spawn(this.executable,['--background','--factory-startup','--disable-autoexec','--python-exit-code','1','--python',this.script,'--','--serve',this.root,token],{cwd:this.root,env:this.env,windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.child=child;
    child.stdout.on('data',chunk=>{
      if(this.child!==child)return;
      buffer+=chunk.toString();
      for(let at;(at=buffer.indexOf('\n'))>=0;){const line=buffer.slice(0,at).replace(/\r$/,'');buffer=buffer.slice(at+1);this.line(line);}
      if(buffer.length>65536){this.pending?.onLog(buffer);buffer='';}
    });
    child.stderr.on('data',chunk=>{if(this.child===child)this.pending?.onLog(chunk.toString());});
    child.stdin.on('error',error=>{if(this.child===child)this.stop(error.message);});
    child.on('error',error=>{if(this.child===child)this.stop(error.message);});
    child.on('close',code=>{if(this.child===child)this.stop('Blender worker exited with code '+code+'. Retry to start a fresh worker.');});
  }
  line(line){
    if(!line.startsWith(this.prefix)){this.pending?.onLog(line+'\n');return;}
    let message;try{message=JSON.parse(line.slice(this.prefix.length));}catch{return this.stop('Invalid worker response.');}
    if(message.version!==1)return this.stop('Unsupported worker protocol.');
    if(message.type==='ready'){this.ready=true;this.send();return;}
    const pending=this.pending;
    if(!pending||message.id!==pending.id)return; // Late/stale responses cannot finish another job.
    this.pending=null;
    if(message.ok)pending.resolve({pid:this.child.pid,revision:Number(message.id)});
    else pending.reject(Error(message.error||'Blender operation failed. See job log.'));
    this.idle=setTimeout(()=>this.stop('Idle worker closed.'),60000);this.idle.unref?.();
  }
  send(){const p=this.pending;if(p&&!p.sent){p.sent=true;this.child.stdin.write(JSON.stringify({version:1,id:p.id,spec:p.spec})+'\n');}}
  stop(reason='Job cancelled.'){
    clearTimeout(this.idle);const child=this.child;this.child=null;this.ready=false;
    const p=this.pending;this.pending=null;child?.kill();p?.reject(Error(reason));
  }
}
module.exports={PersistentWorker};
