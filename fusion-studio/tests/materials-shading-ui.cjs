const {_electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
(async()=>{
 const runtime=path.join(output,'materials-shading-ui-'+Date.now()),env={...process.env,FUSION_DATA_DIR:runtime};let app;const errors=[];
 try{
  app=await _electron.launch({args:[root],env,timeout:30000});const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>window.fusionEditor);if(await page.locator('#recovery-skip').count())await page.locator('#recovery-skip').click();
  await page.evaluate(()=>fusionEditor.template('blank'));await page.locator('[data-primitive="cube"]').click();await page.waitForFunction(()=>fusionEditor.root.children.length===1&&!fusionOperators.running);
  await page.locator('[data-workspace="Shading"]').click();
  assert.ok(await page.locator('[data-preset="Glass"]').count());assert.ok(await page.locator('[data-preset="Hair"]').count());assert.ok(await page.locator('[data-preset="Toon"]').count());
  await page.locator('[data-preset="Glass"]').click();
  await page.waitForFunction(()=>{const m=fusionEditor.selectedMaterial();return m?.isMeshPhysicalMaterial&&m.transmission===1;});
  assert.equal(await page.locator('#material-transmission').inputValue(),'1');
  assert.match(await page.locator('#material-ior').inputValue(),/1\.4/);
  await page.locator('[data-preset="Metal"]').click();
  await page.waitForFunction(()=>fusionEditor.selectedMaterial()?.metalness>.9);
  await page.evaluate(()=>{const el=document.querySelector('#material-clearcoat');el.value='0.8';el.dispatchEvent(new Event('change'));});
  await page.waitForFunction(()=>Math.abs(fusionEditor.selectedMaterial().clearcoat-.8)<.02);
  await page.locator('[data-ray="shadow"]').uncheck();
  assert.equal(await page.evaluate(()=>fusionEditor.selected.userData.fusion_ray_visibility.shadow),false);
  await page.locator('#enable-vcol').click();
  await page.waitForFunction(()=>{const m=fusionEditor.selected;let g;m.traverse(n=>{if(n.isMesh)g=n.geometry;});return !!(g?.attributes.color)&&fusionEditor.selectedMaterial().vertexColors;});
  await page.locator('#material-unique').click();
  await page.locator('[data-preset="Toon"]').click();
  await page.waitForFunction(()=>fusionEditor.selectedMaterial()?.isMeshToonMaterial);
  await page.locator('#add-decal').click();
  await page.waitForFunction(()=>{let found=false;fusionEditor.selected.traverse(n=>{if(n.userData.fusion_decal)found=true;});return found;});
  await page.screenshot({path:path.join(output,'materials-shading-ui.png')});
  const sidecar=await page.evaluate(()=>fusionEditor.surfaceSidecar());assert.ok(sidecar.materials.length>=1);assert.equal(sidecar.materials[0].rayVisibility.shadow,false);
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'materials-shading-ui-results.json'),JSON.stringify({passed:true,checks:['Glass preset sets transmission and IOR','Metal then clearcoat persist on MeshPhysicalMaterial','Ray visibility flags serialize on the object','Vertex colours become a shader input','Toon preset uses MeshToonMaterial'],sidecar,errors,runtime},null,2));console.log('Materials shading desktop PASS');
 }finally{if(app)await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
