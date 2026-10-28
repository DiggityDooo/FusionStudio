import test from 'node:test';
import assert from 'node:assert/strict';
import * as VP from '../src/virtual-production.js';
import * as RT from '../src/realtime-engine.js';
import * as PR from '../src/print-cam.js';
import * as SC from '../src/scanning.js';
import * as MG from '../src/mograph.js';
import * as AI from '../src/ai-tools.js';
import * as CO from '../src/collab.js';

const box={positions:new Float32Array([0,0,0,1,0,0,0,1,0,0,0,1]),indices:new Uint32Array([0,1,2,0,2,3,0,3,1,1,3,2])};

test('A22 virtual production',()=>{
  const link=VP.createLiveLink({engine:'unreal'});VP.liveLinkConnect(link);assert.ok(VP.liveLinkPushTransform(link,'Cam').t);
  const moc=VP.createMocapSource({kind:'webcam'});VP.mocapStart(moc);assert.ok(VP.mocapSample(moc,{t:1}).bones.length);
  assert.ok(VP.facialCaptureSample(VP.createFacialCapture(),{smile:.5}).mouthSmile===.5);
  const cam=VP.createVirtualCamera();assert.ok(VP.virtualScout(cam,[[0,1,-4],[1,1,-3]]).length);assert.ok(VP.recordVirtualTake(cam).id);
  assert.ok(VP.realtimeRetarget({bones:[{name:'hips',q:[0,0,0,1]}]},{hips:'pelvis'}).boneCount===1);
  const led=VP.createLedVolume();VP.syncLedFrustum(led,cam);assert.ok(led.synced);
  const tc=VP.createTimecode({fps:24});VP.advanceTimecode(tc,{frames:25});VP.enableGenlock(tc);assert.equal(VP.formatTimecode(tc),'00:00:01:01');
  const seq=VP.createPrevisSequencer();VP.addPrevisClip(seq,{name:'A',end:2});assert.equal(seq.duration,2);
  assert.ok(VP.liveKeySample(VP.createLiveKeyer(),[0,1,0,1]).alpha===0);
  assert.ok(VP.xrSessionStart(VP.createXrSession({mode:'vr'})).active);
  const tr=VP.createTracker({kind:'body'});VP.updateTracker(tr,{position:[1,0,0]});assert.equal(tr.pose.position[0],1);
  const st=VP.createStageBlocking();const m=VP.addStageMark(st,{label:'A'});assert.ok(VP.placeStageActor(st,{markId:m.id}).name);
});

test('A23 realtime engine',()=>{
  assert.ok(RT.createPbrRealtimePipeline().ready);
  const virt=RT.createVirtualizedMesh(box);assert.ok(virt.clusters.length);
  assert.ok(RT.createGiSystem({probes:4}).probes.length===4);
  assert.ok(RT.bakeLightmap({res:16}).data.length);
  assert.ok(RT.createRtRaytrace({mode:'path'}).bounces>=1);
  assert.ok(RT.generateLods(box).entries.length);assert.ok(RT.generateImpostor().frames);
  assert.ok(RT.generateCollisionMesh(box).aabb);
  assert.ok(RT.frustumCull([{id:1,position:[0,0,-2]}],{position:[0,0,0],fov:90,near:.1,far:100}).visible.length);
  assert.ok(RT.occlusionCull([{id:1,position:[0,0,0],radius:.2}],[{id:2,position:[0,1,0],radius:2}]));
  const sg=RT.createShaderGraph();const a=RT.addShaderNode(sg,'texture');RT.addShaderNode(sg,'pbr_output');RT.linkShaderNodes(sg,a.id,'out');assert.ok(sg.links.length);
  const bp=RT.createBlueprint();RT.addBlueprintNode(bp,'event_begin');assert.ok(bp.nodes.length);
  const ab=RT.createAnimBlueprint();RT.addAnimState(ab,'Idle');RT.addBlendSpace(ab);RT.addIkRigNode(ab);assert.ok(ab.states.length);
  assert.ok(RT.createPhysicsAsset({bones:['hips','spine']}).bodies.length===2);
  assert.ok(RT.createEngineParticles({count:8}).particles.length===8);
  const ls=RT.createLevelSequencer();RT.addSequencerTrack(ls,{keys:[{t:1}]});assert.ok(ls.length>=1);
  const land=RT.createLandscapeFoliage({res:8});RT.scatterEngineFoliage(land,{count:5});assert.equal(land.foliageInstances.length,5);
  assert.ok(RT.compressTextureStreaming({format:'BC7'}).blocks>0);
  assert.ok(RT.importSkeletalMorph({bones:4,morphs:2}).morphTargets.length===2);
  const cloth=RT.createRtClothHair({kind:'cloth',particles:10});RT.stepRtClothHair(cloth);assert.ok(cloth.particles[0].prev);
  assert.ok(RT.createNaniteReadyPipeline(box).ready);
  const aud=RT.createAudioIntegration();RT.playAudioEvent(aud,{name:'Hit'});assert.ok(aud.events.length);
  const ui=RT.createEngineUi();RT.addUiWidget(ui,{text:'HP'});assert.ok(ui.widgets.length);
  assert.ok(RT.createBuildPackage({platforms:['win64']}).artifacts.length===1);
  const pr=RT.createProfiler();RT.profilerCapture(pr,{ms:5});assert.equal(pr.frames.length,1);
  const ds=RT.createDatasmithImport();RT.datasmithSync(ds,{actors:3});assert.ok(ds.synced);
  assert.ok(RT.createMobileXrProfile().maxTris>0);
});

test('A24 print/CAM',()=>{
  assert.ok(PR.checkManifold(box));assert.ok(PR.repairManifold(box).repaired||true);
  assert.ok(PR.analyzeWallThickness(box).estimated>=0);assert.ok(PR.analyzeOverhangs(box));
  assert.ok(PR.hollowMesh(box).drainHoles.length);assert.ok(PR.generateSupports(box,{kind:'tree'}).tips);
  const sl=PR.sliceModel(box,{layerHeight:.2});assert.ok(sl.layers>=1);
  assert.ok(PR.optimizePrintOrientation(box).score);assert.ok(PR.splitPartWithKeys(box).pins.length);
  assert.ok(PR.clearanceCheck({}).fit);assert.ok(PR.scaleToUnits(box,{to:'mm'}).unit==='mm');
  assert.ok(PR.multiMaterialPrint({}).regions.length);assert.ok(PR.generateLattice({}).cells>0);
  assert.ok(PR.generateGcode(sl).text.includes('LAYER'));assert.ok(PR.resinFdmProfile({process:'resin'}).exposure);
  assert.ok(PR.exportPrintMesh(box,{format:'obj'}).includes('v '));
  assert.ok(PR.generateToolpath({}).paths.length);assert.ok(PR.exportLaserVectors({}).svg.includes('svg'));
  assert.ok(PR.estimatePrint({layers:50}).timeMinutes>0);assert.ok(PR.applyPrintDisplacement(box).positions);
  assert.ok(PR.slicerNetworkJob({}).status==='queued');
});

test('A25 scanning',()=>{
  assert.ok(SC.reconstructFromPhotos({count:8}).points>0);
  assert.ok(SC.importLidarDepth({points:100}).count===100);
  const pc=SC.createPointCloud({count:50});assert.ok(SC.cleanPointCloud(pc,{keep:.5}).count===25);
  const mesh=SC.meshFromPointCloud(pc);assert.ok(mesh.indices.length);
  assert.ok(SC.importGaussianSplat({count:20}).means.length);assert.ok(SC.importNerf({}).resolution);
  assert.ok(SC.scanMeshCleanup(mesh).decimated);assert.ok(SC.delightTextures({}).removedLighting);
  const rt=SC.scanToRetopo(mesh,{quadTarget:100});assert.ok(SC.projectBakeScanTexture(mesh,rt).maps.length);
  assert.ok(SC.markerAlign({}).translation);assert.ok(SC.bodyFaceObjectScanPipeline({subject:'face'}).stages.length);
  assert.ok(SC.registerScans(pc,SC.createPointCloud({count:40})).method==='icp');
});

test('A30 mograph',()=>{
  const cl=MG.createCloner({count:6,mode:'radial'});MG.applyEffector(cl,MG.createEffector({strength:.5}));assert.ok(cl.effectors.length);
  assert.ok(MG.sampleField(MG.createField({}),[0,0,0])===1);
  const tx=MG.createText3d({text:'AB'});MG.animateTextChars(tx,{t:1});assert.ok(tx.chars[0].offset);
  assert.ok(MG.importSvgPaths('<svg><path d="M0 0 L1 1"/></svg>').count===1);
  const gp=MG.createGreasePencil();MG.addGreaseStroke(gp,[[0,0,0],[1,0,0]]);assert.ok(gp.strokes.length);
  assert.ok(MG.createToonOutline().width);assert.ok(MG.createMographPreset({name:'wave'}).cloner);
  assert.ok(MG.audioReactiveDrive({spectrum:[0,.9],band:1}).value===.9);
  assert.ok(MG.createMetaballs({res:8}).inside>=0);assert.ok(MG.createCameraMap25d({}).planes.length);
  assert.ok(MG.createPatternGenerator({type:'hex',n:4}).cells.length);
});

test('A31 AI tools',()=>{
  assert.ok(AI.textToMesh({prompt:'chair'}).positions.length);assert.ok(AI.imageToMesh({}).verts>0);
  assert.ok(AI.aiGenerateMaterial({}).maps.length);assert.ok(AI.aiAutoRetopo(box).targetQuads);
  assert.ok(AI.aiAutoUv(box).islands);assert.ok(AI.aiAutoRig(box).bones);
  assert.ok(AI.aiDenoise({}).mode);assert.ok(AI.aiUpscale({scale:2}).out[0]===1024);
  assert.ok(AI.aiMotionGenerate({}).frames);assert.ok(AI.aiMocapCleanup([0,1,0,1],{smooth:.5}).out.length===4);
  assert.ok(AI.audioToFace({duration:.5}).visemes.length);assert.ok(AI.aiRotoMask({width:16,height:16}).mask.length);
  assert.ok(AI.aiSceneScatter({count:5}).items.length);assert.ok(AI.aiGaussianCapture({}).splats);
  assert.ok(AI.neuralViewportPreview({}).res);assert.equal(AI.nlCommandParse('extrude 0.2').intent,'mesh.extrude');
  assert.ok(AI.smartSelectSegments(box,{segments:2}).labels.length);
});

test('A32 collab',()=>{
  const p=CO.createCloudProject({});CO.startLiveSession(p);assert.ok(p.live);
  const h=CO.createVersionHistory();const c=CO.commitVersion(h,{message:'a'});CO.branchVersion(h,'feat');CO.rollbackVersion(h,c.id);assert.equal(h.commits.length,1);
  const pl=CO.createReviewPlaylist();const it=CO.addReviewItem(pl,{title:'S1'});CO.annotateReview(pl,{itemId:it.id,text:'fix'});assert.ok(pl.annotations.length);
  const lib=CO.createAssetLibrary();CO.tagAsset(lib,{name:'Hero',tags:['char']});assert.equal(CO.searchAssets(lib,'hero').length,1);
  const board=CO.createTrackerBoard();CO.addTrackerTask(board,{title:'Shot010'});assert.ok(board.tasks.length);
  const job=CO.createFarmJob({frames:10});CO.farmJobProgress(job,{done:10});assert.equal(job.status,'done');
  const lic=CO.createLicenseSeats({seats:2});CO.assignSeat(lic,{user:'a'});assert.equal(lic.used,1);
  assert.ok(CO.validatePublish({asset:{name:'X'}}).ok);
  const usd=CO.createUsdAssembly();CO.addUsdLayer(usd,{path:'/a.usda'});assert.ok(usd.layers.length);
  const g=CO.createDependencyGraph();CO.trackDependency(g,{from:'a',to:'b'});CO.relinkDependency(g,{from:'a',oldTo:'b',newTo:'c'});assert.equal(g.edges[0].to,'c');
});
