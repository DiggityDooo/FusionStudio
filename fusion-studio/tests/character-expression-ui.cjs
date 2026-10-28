// Actual public-foundation character, UI expression edits, rig history, reopen
// and exchange. Generated artifacts stay in an isolated ignored profile.
const {_electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),runtime=path.join(root,'test-output','character-expression-'+Date.now());
(async()=>{
 fs.mkdirSync(runtime,{recursive:true});const app=await _electron.launch({args:[root],env:{...process.env,FUSION_DATA_DIR:runtime},timeout:60000}),page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const idle=()=>page.waitForFunction(()=>!fusionOperators.running&&!document.querySelector('#app').classList.contains('busy'),null,{timeout:240000});
 try{
  await page.waitForFunction(()=>window.fusionOperators,null,{timeout:60000});if(await page.locator('#recovery-skip').count())await page.locator('#recovery-skip').click();
  await page.evaluate(async()=>{fusionEditor.template('blank');await fusionOperators.run('character.creator_create',{sex:'female'});const c=fusionEditor.selected;await fusionOperators.run('character.creator_shape',{targetId:c.uuid,action:'create',name:'mouthSmile',deltas:[100,.002,.001,0]});});
  await page.locator('[data-workspace="Character"]').click();
  const state=()=>page.evaluate(()=>{const e=fusionEditor,c=e.root.children.find(n=>n.userData.fusion_creator),b=c.getObjectByName('Body');return {id:c.uuid,cursor:e.journal.cursor,recipe:structuredClone(c.userData.fusion_creator.recipe),morphs:[...b.morphTargetInfluences],triangles:b.geometry.index.count/3};});
  const before=await state();assert.equal(before.triangles,26756);
  await page.locator('#ct-expr').selectOption('smile');await page.locator('#ct-expr-apply').click();await idle();const smile=await state();assert.equal(smile.cursor,before.cursor+1);assert.equal(smile.recipe.shapes[0].value,1);assert.equal(smile.morphs[0],1);
  await page.locator('#ct-expr').selectOption('neutral');await page.locator('#ct-expr-apply').click();await idle();const neutral=await state();assert.deepEqual(neutral.recipe,before.recipe);assert.equal(neutral.morphs[0],0);assert.equal(neutral.cursor,smile.cursor+1);
  await page.evaluate(()=>fusionEditor.undo());await idle();assert.deepEqual((await state()).recipe,smile.recipe);await page.evaluate(()=>fusionEditor.redo());await idle();assert.deepEqual((await state()).recipe,neutral.recipe);
  const mirror=await page.evaluate(async()=>{
   const e=fusionEditor,c=e.root.children.find(n=>n.userData.fusion_creator);e.select(c);const left=c.getObjectByName('upperarm_l'),right=c.getObjectByName('upperarm_r');left.rotation.x=.3;e.commit();
   const before={left:left.quaternion.toArray(),right:right.quaternion.toArray()},cursor=e.journal.cursor;await fusionOperators.run('rig.pose_mirror',{axis:'x'});return {before,after:{left:left.quaternion.toArray(),right:right.quaternion.toArray()},cursor,afterCursor:e.journal.cursor};
  });assert.equal(mirror.afterCursor,mirror.cursor+1);mirror.after.right.forEach((v,i)=>assert.ok(Math.abs(v-mirror.before.left[i])<1e-7));
  await page.evaluate(()=>fusionEditor.undo());await idle();const undone=await page.evaluate(()=>fusionEditor.root.children.find(n=>n.userData.fusion_creator).getObjectByName('upperarm_l').quaternion.toArray());assert.deepEqual(undone,mirror.before.left);await page.evaluate(()=>fusionEditor.redo());await idle();
  const saved=await page.evaluate(()=>fusion.save(fusionEditor.document('Expression integrity')));await page.evaluate(async file=>fusionEditor.load(await fusion.loadRecent(file)),saved.path);await idle();assert.deepEqual((await state()).recipe,neutral.recipe);
  await page.evaluate(async()=>{const c=fusionEditor.root.children.find(n=>n.userData.fusion_creator);fusionEditor.select(c);await fusionOperators.run('character.expression',{targetId:c.uuid,name:'smile',weight:.6});});await idle();
  const exchange=await page.evaluate(async()=>{const e=fusionEditor,data=await e.glb(false,{includeAnimations:false});return fusion.job({action:'glb',data,name:'Expression integrity'});});assert.ok(fs.statSync(exchange.output).size>10000);assert.deepEqual(errors,[]);
  const result={passed:true,runtime,sourceVertices:19158,bodyTriangles:26756,saved:saved.path,export:exchange.output,checks:['actual expression button','neutral restores named shape and influence','one history entry per expression','undo redo','neutral-frame pose reflection','mirror rig undo redo','project save reopen','GLB exchange'],errors};fs.writeFileSync(path.join(runtime,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(error){await page.screenshot({path:path.join(runtime,'failure.png')}).catch(()=>{});throw error;}finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
