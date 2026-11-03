const {spawnSync}=require('node:child_process'),path=require('node:path');
const script=path.join(__dirname,'capture.cjs'),args=process.argv.slice(2);
for(const extra of args.length?[args]:[[],['--review-only']]){const r=spawnSync(process.execPath,[script,...extra],{stdio:'inherit',windowsHide:true});if(r.status!==0)process.exit(r.status||1);}
