const {_electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
(async()=>{
 const prior=JSON.parse(fs.readFileSync(path.join(output,'rounded-neckline-ui-results.json'),'utf8'));assert.equal(prior.passed,true);assert.equal(prior.neckline,'rounded');
 const bytes=fs.readFileSync(prior.saved),project=JSON.parse(bytes),runtime=path.join(output,'rounded-neckline-inspection-'+Date.now());
 const executable=process.env.FUSION_TEST_EXECUTABLE,app=await _electron.launch({...(executable?{executablePath:executable}:{args:[root]}),env:{...process.env,FUSION_DATA_DIR:runtime},timeout:30000}),page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.waitForFunction(()=>window.fusionOperators);await page.evaluate(async doc=>{await fusionEditor.load(doc);fusionEditor.select(fusionEditor.root.children.find(n=>n.userData.liveGarment?.fittedSurface));},project);
  const before=await page.evaluate(()=>({scene:JSON.stringify(fusionEditor.serialize()),history:fusionEditor.journal.cursor})),audit=await page.evaluate(()=>fusionOperators.run('hybrid.contact_audit'));
  await page.locator('#cloth-contact-close').click();assert.equal(audit.complete,true);for(const key of ['crossings','coplanarOverlaps','clearanceViolations','degenerateFaces'])assert.equal(audit[key],0,key);
  assert.deepEqual(await page.evaluate(()=>({scene:JSON.stringify(fusionEditor.serialize()),history:fusionEditor.journal.cursor})),before);
  const render=await page.evaluate(async()=>fusion.job({action:'render',name:'Rounded neckline close inspection',data:await fusionEditor.glb(false,{includeAnimations:false}),params:{samples:32,width:960,height:720,device:'CPU',camera:{position:[.08,1.52,.85],target:[0,1.38,0]}}}));
  assert.ok(fs.statSync(render.output).size>10000);assert.deepEqual(errors,[]);assert.deepEqual(fs.readFileSync(prior.saved),bytes);
  const report={passed:true,executable:executable||'development',audit,render:render.output,source:prior.saved,runtime,checks:['saved rounded design and pose','read-only final contact audit','same-scene close render','saved project unchanged'],errors};fs.writeFileSync(path.join(output,'rounded-neckline-inspection-results.json'),JSON.stringify(report,null,2));console.log('Rounded neckline contact/render inspection PASS',JSON.stringify({audit,render:render.output}));
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
