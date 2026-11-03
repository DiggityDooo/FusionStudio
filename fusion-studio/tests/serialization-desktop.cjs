const {candidateLaunch}=require('./candidate-launch.cjs');
const {_electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
(async()=>{
 const runtime=path.join(output,'serialization-desktop-'+Date.now());
 const app=await _electron.launch({...candidateLaunch(root,{packaged:true}),env:{...process.env,FUSION_DATA_DIR:runtime},timeout:30000});const errors=[];
 try{
  const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>window.fusionEditor);
  const record=await page.evaluate(async()=>{
   const e=fusionEditor;e.template('blank');const mesh=await e.primitive('sphere');
   mesh.position.x=.2;e.commit();const original=Array.from(mesh.geometry.attributes.position.array);
   e.meshTools.applyBrush({object:mesh,point:mesh.position.clone().add(mesh.position.clone().set(0,.6,0))},false);mesh.geometry.attributes.uv.setXY(0,.123,.456);e.commit();
   const expected=Array.from(mesh.geometry.attributes.position.array),uv=Array.from(mesh.geometry.attributes.uv.array);
   if(!expected.some((n,i)=>n!==original[i]))throw Error('Brush did not deform the fixture');
   await e.undo();if(e.root.children[0].geometry.attributes.position.array.some((n,i)=>n!==original[i]))throw Error('Undo did not restore source geometry');
   await e.redo();const doc=e.document('Serialization regression');const saved=await fusion.save(doc);return {saved,expected,uv,doc};
  });
  const disk=JSON.parse(fs.readFileSync(record.saved.path,'utf8'));assert.equal(disk.applicationVersion,'0.7.0');
  await page.evaluate(async({disk,expected,uv})=>{const e=fusionEditor;await e.load(disk);const mesh=e.root.children[0];if(mesh.position.x!==.2)throw Error('Transform lost');if(mesh.geometry.attributes.position.array.some((n,i)=>n!==expected[i]))throw Error('Sculpt data lost');if(mesh.geometry.attributes.uv.array.some((n,i)=>n!==uv[i]))throw Error('UV lost');e.select(mesh);e.frame(mesh);},{disk,expected:record.expected,uv:record.uv});
  await page.screenshot({path:path.join(output,'serialization-desktop.png')});assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'serialization-desktop-results.json'),JSON.stringify({passed:true,version:'0.7.0',checks:['packaged actual brush edit','immediate transform','geometry undo/redo','disk save/reload','UV preservation'],saved:record.saved.path,errors},null,2));console.log('Packaged serialization regression PASS');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
