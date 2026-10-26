const {_electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
(async()=>{
 const {starterPattern,migratePattern}=await import('../src/patterns.js'),base=migratePattern(starterPattern());
 base.panels[0].holes=[{id:'opening',points:[[-.06,.2],[.06,.2],[.06,.34],[-.06,.34]],segments:[0,1,2,3].map(i=>({id:'opening_'+i,type:'line'}))}];base.panels[0].internalLines=[{id:'fold',points:[[-.2,.1],[-.2,.5]]}];base.seams=[{id:'partial',a:{panel:'front',segment:'front_s1',start:.17,end:.83},b:{panel:'back',segment:'back_s3',start:.09,end:.91},reverse:true}];
 const runtime=path.join(output,'pattern-apply-performance-'+Date.now()),app=await _electron.launch({args:[root],env:{...process.env,FUSION_DATA_DIR:runtime},timeout:30000}),page=await app.firstWindow(),rows=[];
 const identity=()=>page.evaluate(async()=>{const data=JSON.stringify(fusionEditor.serialize()),hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data));return {hash:Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join(''),cursor:fusionEditor.journal.cursor,entries:fusionEditor.journal.entries.length};});
 try{
  await app.evaluate(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows())w.webContents.setBackgroundThrottling(false);});await page.waitForFunction(()=>window.fusionOperators);await page.evaluate(()=>{fusionEditor.template('blank');window.patternPushes=0;const push=fusionEditor.journal.push.bind(fusionEditor.journal);fusionEditor.journal.push=(entry)=>{patternPushes++;return push(entry);};});
  let targetId=null;
  for(const distance of [.025,.016,.011,.008,.005]){
   const doc={...structuredClone(base),particleDistance:distance},before=await identity(),pushes=await page.evaluate(()=>patternPushes);
   const result=await page.evaluate(async({doc,targetId})=>{
    const gaps=[];let running=true,previous=performance.now();const tick=now=>{gaps.push(now-previous);previous=now;if(running)requestAnimationFrame(tick);};requestAnimationFrame(tick);
    const started=performance.now();let out;try{const g=await fusionOperators.run('cloth.apply_pattern',{doc,targetId});out={completed:true,id:g.uuid,quality:structuredClone(g.userData.patternMeshQuality)};}catch(error){out={completed:false,error:error.message};}
    out.milliseconds=performance.now()-started;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));running=false;out.frames=gaps.length;out.maximumFrameGapMs=Math.max(...gaps);out.meanFrameGapMs=gaps.reduce((a,b)=>a+b,0)/gaps.length;return out;
   },{doc,targetId});
   assert.ok(result.frames>=3);if(result.completed){targetId=result.id;assert.equal(await page.evaluate(()=>patternPushes),pushes+1);assert.ok(result.quality.triangles>=4000);}else{assert.deepEqual(await identity(),before);assert.equal(await page.evaluate(()=>patternPushes),pushes);}
   rows.push({particleDistance:distance,...result});console.log(JSON.stringify(rows.at(-1)));
  }
  const report={integrityChecksPassed:true,allSizesCompleted:rows.every(r=>r.completed),uiFrameTargetMs:33.3,uiFrameTargetMet:rows.every(r=>r.maximumFrameGapMs<=33.3),scope:'Own holed panels with internal line and partial sewing; serial desktop measurements include mesh delivery, history and GPU upload. One run per size, uncontrolled host load; not drape or general interactivity proof.',runtime,rows};fs.writeFileSync(path.join(output,'pattern-apply-performance-results.json'),JSON.stringify(report,null,2));if(!report.allSizesCompleted)process.exitCode=2;
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
