const {_electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),runtime=path.join(root,'test-output','window-placement-'+Date.now());
(async()=>{
 fs.mkdirSync(runtime,{recursive:true});const app=await _electron.launch({args:[root],env:{...process.env,FUSION_DATA_DIR:runtime},timeout:60000});
 try{
  const page=await app.firstWindow();await page.waitForFunction(()=>window.fusionEditor);
  const result=await app.evaluate(({screen,BrowserWindow})=>{const primary=screen.getPrimaryDisplay().id,displays=screen.getAllDisplays().map(d=>({id:d.id,label:d.label,workArea:d.workArea})),window=BrowserWindow.getAllWindows()[0],bounds=window.getBounds();return {primary,displays,bounds,actualDisplay:screen.getDisplayMatching(bounds).id};});
  const preferenceFile=path.join(root,'window-placement.local.json'),preference=fs.existsSync(preferenceFile)?JSON.parse(fs.readFileSync(preferenceFile,'utf8')):null,target=result.displays.find(d=>d.id!==result.primary);
  if(preference?.display==='secondary'&&target){assert.equal(result.actualDisplay,target.id);const a=target.workArea,b=result.bounds;assert.ok(b.x>=a.x&&b.y>=a.y&&b.x+b.width<=a.x+a.width&&b.y+b.height<=a.y+a.height);}
  const report={passed:true,runtime,preference,...result,secondaryVerified:preference?.display==='secondary'&&!!target&&result.actualDisplay===target.id};
  fs.writeFileSync(path.join(runtime,'results.json'),JSON.stringify(report,null,2));await page.screenshot({path:path.join(runtime,'fusion-secondary.png')});console.log(JSON.stringify(report));
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
