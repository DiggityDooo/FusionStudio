const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const {_electron}=require('playwright');
const {Engine}=require('../electron/core.cjs');const {preflightDson}=require('../electron/dson.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output'),runtime=path.join(output,'audit-'+Date.now());
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
(async()=>{
 fs.mkdirSync(runtime,{recursive:true});const {createServer}=await import('vite');
 const server=await createServer({root,server:{host:'127.0.0.1',port:0},configFile:false});await server.listen();
 const url=server.resolvedUrls.local[0]+'tests/audit-fixture.html';
 let app;const report={date:new Date().toISOString(),hardware:{cpu:os.cpus()[0].model,logicalProcessors:os.cpus().length,totalRAMBytes:os.totalmem()},method:'Single baseline run, three CPU samples where listed; warm OS caches; isolated real Electron editor harness. Excludes production side panels/autosave. Not a performance guarantee.',cases:[],errors:[]};
 const record=()=>fs.writeFileSync(path.join(output,'perf.json'),JSON.stringify(report,null,2));
 try{
  app=await _electron.launch({args:[path.join(__dirname,'audit-main.cjs')],env:{...process.env,FUSION_DATA_DIR:runtime,FUSION_AUDIT_URL:url},timeout:30000});const page=await app.firstWindow();page.on('pageerror',e=>report.errors.push(e.message));await page.waitForFunction(()=>window.audit);
  for(const triangles of [100000,500000,1000000]){
   console.log('Benchmark '+triangles);const item={name:triangles+' triangles',...await page.evaluate(n=>audit.synthetic(n),triangles)};report.cases.push(item);
   item.history=await page.evaluate(()=>audit.commit());record();
   if(triangles===500000)continue;
   item.load=await page.evaluate(()=>audit.load());record();
   item.orbit=await page.evaluate(()=>audit.orbit());
   item.sculpt=await page.evaluate(()=>audit.sculpt());record();
   item.save=await page.evaluate(()=>audit.save());record();
   await page.screenshot({path:path.join(runtime,'mesh-'+triangles+'.png')});
   try{item.boolean=await page.evaluate(()=>audit.boolean());}catch(e){item.boolean={error:e.message};}record();
  }
  const source='C:/Users/Public/Documents/My DAZ 3D Library/People/Genesis 9/Genesis 9.duf',roots=['C:/Users/Public/Documents/My DAZ 3D Library'];
  const item={name:'Genesis 9',HD:{status:'unsupported',reason:'Importer omits HD subdivision deltas; measurements use base topology with referenced base morphs.'}};report.cases.push(item);
  if(fs.existsSync(source)){
   const start=performance.now(),preflight=await preflightDson(runtime,path.join(root,'scripts/dson_importer.py'),source,roots);item.preflightMs=performance.now()-start;item.warnings=preflight.warnings;
   if(!preflight.ok)throw Error('Genesis preflight failed');
   const engine=new Engine(runtime,path.join(root,'scripts/blender_worker.py')),conversionStart=performance.now();
   const result=await engine.run({action:'convert',source,name:'Genesis audit',params:{contentRoots:roots}});item.conversionMs=performance.now()-conversionStart;
   Object.assign(item,await page.evaluate(data=>audit.genesis(data),result.data));item.orbit=await page.evaluate(()=>audit.orbit());item.history=await page.evaluate(()=>audit.commit());item.load=await page.evaluate(()=>audit.load());item.save=await page.evaluate(()=>audit.save());
   item.sculpt={status:'blocked',reason:'Rig/morph data requires a static working copy'};item.boolean={status:'blocked',reason:'Rig/morph data requires a static working copy'};
   item.sources=preflight.dependencies.filter(d=>d.sha256&&d.path).map(d=>({path:d.path,sha256:d.sha256,unchanged:hash(d.path)===d.sha256}));
   await page.screenshot({path:path.join(runtime,'genesis-base.png')});
  }else item.status='skipped: local asset missing';
  report.complete=true;report.runtime=runtime;record();console.log('Baseline saved: '+path.join(output,'perf.json'));
 }finally{record();if(app)await app.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
