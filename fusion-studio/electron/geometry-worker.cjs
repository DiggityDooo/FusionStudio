// One fixed native operation per disposable process. The parent owns its OS
// handle and kills it on cancellation, timeout, malformed output or completion.
const send=data=>process.parentPort?process.parentPort.postMessage(data):process.send(data);
let received=false;
function execute(data){
 if(received)return;received=true;const id=data?.id;
 try{
  if(data?.version!==1||typeof id!=='string'||!/^[0-9a-f]{32}$/.test(id)||!['analyzeMesh','drapeGarment','editMesh','bindGarment','placeGarment','auditClothContacts','auditSurfaceContacts'].includes(data.method)||typeof data.payload!=='string'||data.payload.length>96000000||typeof data.binary!=='string')throw Error('Invalid geometry process request.');
  const native=require(data.binary);send({version:1,id,phase:'started'});
  setImmediate(()=>{try{const result=JSON.parse(native[data.method](data.payload));send({version:1,id,phase:'result',result});}catch(error){send({version:1,id,phase:'result',error:error.message});}});
 }catch(error){send({version:1,id,phase:'result',error:error.message});}
}
if(process.parentPort)process.parentPort.on('message',e=>execute(e.data));else{process.on('message',execute);process.on('disconnect',()=>process.exit(0));}
send({version:1,phase:'ready'});
