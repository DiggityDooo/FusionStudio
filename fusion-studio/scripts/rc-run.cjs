// Execute a release gate with compact output and an explicit exit-code receipt.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),[label,script,...args]=process.argv.slice(2);
if(!/^[a-z0-9_-]+$/.test(label||'')||!script)throw Error('Usage: node scripts/rc-run.cjs LABEL SCRIPT [ARGS]');
const folder=path.join(root,'test-output/rc-20261103/gates');fs.mkdirSync(folder,{recursive:true});const log=path.join(folder,label+'.log'),receipt=path.join(folder,label+'.json'),started=new Date().toISOString(),stream=fs.createWriteStream(log);
const child=spawn(process.execPath,[script,...args],{cwd:root,env:{...process.env},windowsHide:true,stdio:['ignore','pipe','pipe']});
child.stdout.pipe(stream,{end:false});child.stderr.pipe(stream,{end:false});child.on('error',error=>{stream.write(error.stack+'\n');});child.on('close',(code,signal)=>{stream.end(()=>{const result={label,started,completed:new Date().toISOString(),command:[process.execPath,script,...args],executable:process.env.FUSION_TEST_EXECUTABLE||'development',creatorSex:process.env.FUSION_CREATOR_SEX||null,fingerprint:process.env.FUSION_RC_FINGERPRINT||null,exitCode:code,signal,log};fs.writeFileSync(receipt,JSON.stringify(result,null,2));console.log(JSON.stringify(result));process.exitCode=code??1;});});
