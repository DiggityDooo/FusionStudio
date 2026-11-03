import {visibleAnimationClips} from './animation-visibility.js';
import {prepareAffineExchange} from './affine-frames.js';
import {validateGarmentFinishing,stripGarmentFinishGeometry} from './garment-finish-scene.js';
import {evaluateCharacter,evaluateSceneDeformation,bakeCharacterExchange} from './deformation.js';
import {stackExportObject} from './modifier-stack.js';
import {jointLocalAngles,jointReference,validateJointLimits} from './joint-limits.js';
import {validatePoseLibrary} from './pose-library.js';
import {validateSkinEdit,retainProceduralSkin} from './skin-weights.js';
import {fabricResponse} from './fabric-materials.js';
import {validateFittedSurface} from './surface-fit.js';
import {validateMeasurementSnapshot} from './body-measurements.js';
import {validateFormulaRotations,restoreAuthoredRotations} from './formula-rotations.js';
import {attachNativeScene} from './native-scene.js';
import {retainPhysicalIor,copyExportMaterials} from './material-snapshot.js';
import {compactPrimitive} from './geometry-interchange.js';
import {addExchangeTangents} from './derived-tangents.js';
import {ProjectLoader} from './project-loader.js';
import {creatorRoot,creatorRenderMaterials,creatorDerivedGeometry,changeCreator} from './character-creator.js';
import {serializeScene} from './scene-serialization.js';
import appPackage from '../package.json' with {type:'json'};
import {IKHandles,bonesOf,solveIK,solveSceneIK,hasSceneIK,validateIKScales,pathNode} from './ik.js';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {createCharacter,applyPose,findCharacter} from './character.js';
import {createGarment} from './garments.js';
import {MeshTools} from './mesh-tools.js';
import {Timeline} from './timeline.js';
import {CommandHistory} from './history.js';
import {HistoryImages} from './history-images.js';
import {MeasureTool} from './measure.js';
import {SceneObjectHelpers,createLight,createCamera,LIGHT_RIGS,CAMERA_RIGS,lightingSidecar,cameraSidecar,makeMeshLight,paintPlacement,applyKelvin,assembleCameraRig,stampCameraExtras,validateCameraTrack,guideMarkup,applyCameraPreset} from './scene-objects.js';
import {applyCameraProcedural,captureCameraRest} from './cameras.js';
import {toViewportIntensity,authoredPower,defaultUnit} from './lighting.js';
import {normalizeRenderSettings} from './render-ui.js';
import {checkerTexture} from './uv-tools.js';
import {DecalGeometry} from 'three/addons/geometries/DecalGeometry.js';
import {applyPreset,applySurface,applySurfaceField,applyRayVisibility,applyObjectOverride,addVertexColors,makeUnique,shareInstance,readSurface,stampRenderIds,surfaceSidecar,SURFACE_PRESETS} from './materials.js';
import {createArmature,addBone as appendBone} from './armature.js';
import {attachSceneFoundation,validateFoundationState} from './scene-foundation.js';
import {validateAnimationKeys,validateTimelineSettings} from './animation-data.js';
import {validateFollowPath} from './animation.js';
import {validateSculptLayers} from './sculpt-layers.js';
import {discardShapeSession} from './shape-session.js';

const colors={clay:'#bfc8c7',orange:'#d47843',ink:'#333b42',fabric:'#58636a',cream:'#e5dfcb'};
export class Editor {
  constructor(element,change){
    this.change=change;this.element=element;this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#3b3b3b');
    this.scene.fog=new THREE.Fog('#3b3b3b',22,65);this.root=new THREE.Group();this.root.name='Workspace';this.scene.add(this.root);
    this.renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.2;
    element.append(this.renderer.domElement);this.renderer.domElement.setAttribute('aria-label','3D modeling viewport');this.renderer.domElement.tabIndex=0;this.renderer.domElement.addEventListener('pointerdown',()=>this.renderer.domElement.focus({preventScroll:true}),true);
    this.camera=new THREE.PerspectiveCamera(38,1,.01,10000);this.camera.position.set(5.4,3.8,7.2);
    this.orbit=new OrbitControls(this.camera,this.renderer.domElement);this.orbit.target.set(0,1.35,0);this.orbit.enableDamping=true;
    this.orbit.mouseButtons.MIDDLE=THREE.MOUSE.ROTATE;
    const ambient=new THREE.HemisphereLight(0xe9f0ff,0x5d5962,2.3);this.scene.add(ambient);
    const key=new THREE.DirectionalLight(0xffe4ca,4);key.position.set(4,7,5);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-10;key.shadow.camera.right=10;key.shadow.camera.top=10;key.shadow.camera.bottom=-10;key.shadow.normalBias=.04;this.scene.add(key);
    const rim=new THREE.DirectionalLight(0x8eb3ff,3);rim.position.set(-4,4,-4);this.scene.add(rim);this.studioLights={ambient,key,rim};
    this.ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#363636',roughness:1}));this.ground.rotation.x=-Math.PI/2;this.ground.position.y=-.055;this.ground.receiveShadow=true;this.scene.add(this.ground);
    this.grid=new THREE.GridHelper(40,80,0x585858,0x454545);this.grid.position.y=-.045;this.grid.material.transparent=true;this.grid.material.opacity=.5;this.scene.add(this.grid);
    this.transform=new TransformControls(this.camera,this.renderer.domElement);this.transform.setSize(.85);this.scene.add(this.transform.getHelper());this.transform._getPointer=e=>({...this.ndc(e),button:e.button});
    // TransformControls picks the axis on pointer-down but orients its drag plane only when rendered; refresh it first.
    const pointerDown=this.transform.pointerDown.bind(this.transform);this.transform.pointerDown=p=>{if(this.operators?.running||this.batching||this.sculptLayerPreview||this.weightPaint?.stroke)return;this.transform.getHelper().updateMatrixWorld(true);pointerDown(p);};
    this.transform.addEventListener('dragging-changed',e=>{this.orbit.enabled=!e.value;if(e.value){this.timeline.playing=false;this.transformStart=this.ik?.active?{ik:true,before:this.captureRig(this.ik.owner)}:this.selected?{id:this.selected.uuid,before:this.captureTransform(this.selected)}:null;this.foundation?.snapGesture.begin();}else {this.foundation?.snapGesture.end();if(this.transformStart){const gesture=this.transformStart;this.transformStart=null;if(this.operators)this.operators.run(gesture.ik?'rig.ik_finish':'object.transform_gesture',gesture).catch(error=>this.change('operator-error',error));else if(gesture.ik)this.finishRig(gesture.before);else this.finishTransform(gesture);}}});
    this.transform.addEventListener('objectChange',()=>{if(this.ik?.active){try{this.ik.preview();}catch(error){this.change('operator-error',error);}}else {try{this.foundation?.snapGesture.apply();}catch(error){this.change('operator-error',error);}this.change('transform');}});
    this.outline=new THREE.BoxHelper(new THREE.Object3D(),0xe8b28a);this.outline.visible=false;this.scene.add(this.outline);
    this.ray=new THREE.Raycaster();this.pointer=new THREE.Vector2();this.down=null;
    this.renderer.domElement.addEventListener('pointerdown',e=>{this.down={x:e.clientX,y:e.clientY};});
    this.renderer.domElement.addEventListener('pointerup',e=>{if(!this.down || Math.hypot(e.clientX-this.down.x,e.clientY-this.down.y)>5 || this.transform.dragging || this.transform.axis)return;this.pointer.copy(this.ndc(e));this.ray.setFromCamera(this.pointer,this.camera);const hit=this.ray.intersectObjects([...this.root.children.filter(o=>!this.localView||this.localView.has(o.uuid)),...this.sceneHelpers.pickables()],true).sort((a,b)=>a.distance-b.distance).map(h=>h.object.userData.helperFor?{...h,object:h.object.userData.helperFor}:h).find(h=>{if(!this.unclipped(h))return false;let o=h.object;while(o&&o!==this.root){if(!o.visible)return false;o=o.parent;}return true;});if(this.lightPaint){if(hit)this.placePaintedLight(hit);return;}let obj=hit?.object;while(obj&&obj.parent!==this.root&&!obj.isCamera&&!obj.isLight)obj=obj.parent;this.select(obj||null);});
    this.perspectiveCamera=this.camera;this.resize=new ResizeObserver(()=>{const w=element.clientWidth,h=element.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);this.fitCameras();});this.resize.observe(element);
    // The quad view under the pointer becomes active before any tool sees the event.
    const hover=e=>{if(this.quad&&(e.type==='pointerdown'||!e.buttons)&&!this.transform.dragging)this.activateView(this.viewAt(e));};element.addEventListener('pointerdown',hover,true);element.addEventListener('pointermove',hover,true);
    this.history=[];this.historyAt=-1;this.wireframe=false;this.tool='translate';this.localView=null;this.quad=null;this.section=null;this.bookmarks=[];this.xray=false;this.xrayMaterials=new WeakMap();this.measure=new MeasureTool(this);this.sceneHelpers=new SceneObjectHelpers(this);this.viewFov=this.camera.fov;this.ik=new IKHandles(this);this.meshTools=new MeshTools(this);this.timeline=new Timeline(this);
    this.ipr=false;this.iprAccum=0;this.iprKey='';this.renderQueue=[];this.proxyMaterials=new WeakMap();
    attachSceneFoundation(this);
    this.renderer.setAnimationLoop(time=>{
this.timeline.tick(time);this.syncLookThrough();this.ik.sync();this.weightPaint?.sync();this.navigation?.tick(time);this.orbit.update();if(this.selected)this.outline.setFromObject(this.selected);const isolated=this.localView&&this.root.children.filter(o=>o.visible&&!this.localView.has(o.uuid));for(const o of isolated||[])o.visible=false;this.sceneHelpers.sync();const swapped=this.xray?this.applyXray():this.uvChecker?this.applyChecker():this.applyProxy();this.draw();for(const [mesh,material] of swapped||[])mesh.material=material;for(const o of isolated||[])o.visible=true;this.measure.sync();});
  }
  material(color=colors.clay){return applySurface(new THREE.MeshPhysicalMaterial(),{color,roughness:.58,metalness:.05});}
  mesh(name,geometry,color,position=[0,0,0],scale=[1,1,1],rotation=[0,0,0]){
    const obj=new THREE.Mesh(geometry,this.material(color));obj.name=name;obj.position.fromArray(position);obj.scale.fromArray(scale);obj.rotation.set(...rotation);obj.castShadow=true;obj.receiveShadow=true;obj.userData.source='Fusion';return obj;
  }
  primitive(type){return this.operators?this.operators.run('mesh.add_'+type):this._primitive(type);}
  _primitive(type){
    const geometry={cube:()=>new THREE.BoxGeometry(1,1,1,1,1,1),sphere:()=>new THREE.SphereGeometry(.6,48,32),cylinder:()=>new THREE.CylinderGeometry(.5,.5,1.2,48),torus:()=>new THREE.TorusGeometry(.6,.18,24,64),plane:()=>new THREE.BoxGeometry(2,.06,2),cone:()=>new THREE.ConeGeometry(.65,1.4,48),capsule:()=>new THREE.CapsuleGeometry(.4,.8,12,32)}[type];
    if(!geometry)return;return this.insertObject(this.mesh(type[0].toUpperCase()+type.slice(1),geometry(),colors.clay,[0,.7,0]),'Add '+type);
  }
  template(name){
    this.select(null);this.bookmarks=[];this.disposeRoot();this.root=new THREE.Group();this.root.name='Workspace';this.scene.add(this.root);this.foundation?.hydrate();
    const add=(...args)=>{const m=this.mesh(...args);this.root.add(m);return m;};
    if(name==='studio'){
      this.root.add(createCharacter());this.root.add(createGarment({type:'tunic',width:.45,length:.58,flare:.025,color:'#3b6683'}));
      add('Display base',new THREE.CylinderGeometry(.77,.82,.07,80),colors.ink,[0,-.035,0]);
      this.orbit.target.set(0,.95,0);this.camera.position.set(3.1,2.2,4.6);
    }else if(name==='character'){
      add('Display plinth',new THREE.CylinderGeometry(1.12,1.18,.12,96),colors.ink,[0,.06,0]);
      const limb=(n,p,s,c=colors.clay)=>add(n,new THREE.CapsuleGeometry(.16,.5,8,24),c,p,s);
      limb('Leg · L',[-.23,.75,0],[1,1.45,1]);limb('Leg · R',[.23,.75,0],[1,1.45,1]);
      add('Boot · L',new THREE.SphereGeometry(1,32,24),colors.ink,[-.23,.25,.12],[.2,.17,.36]);
      add('Boot · R',new THREE.SphereGeometry(1,32,24),colors.ink,[.23,.25,.12],[.2,.17,.36]);
      add('Hip form',new THREE.SphereGeometry(1,48,32),colors.fabric,[0,1.34,0],[.44,.33,.25]);
      add('Jacket shell',new THREE.CylinderGeometry(.36,.46,.76,64,4),colors.orange,[0,1.84,0],[1.22,1,.7]);
      add('Jacket hem',new THREE.TorusGeometry(.44,.045,16,64),colors.ink,[0,1.48,0],[1.22,.7,1],[-Math.PI/2,0,0]);
      const la=limb('Sleeve · L',[-.57,1.84,0],[1.13,1.2,1.13],colors.orange);la.rotation.z=-.23;
      const ra=limb('Sleeve · R',[.57,1.84,0],[1.13,1.2,1.13],colors.orange);ra.rotation.z=.23;
      limb('Hand · L',[-.7,1.3,0],[.75,.48,.75]);limb('Hand · R',[.7,1.3,0],[.75,.48,.75]);
      add('Neck',new THREE.CylinderGeometry(.135,.15,.24,32),colors.clay,[0,2.31,0]);
      add('Collar',new THREE.TorusGeometry(.185,.06,16,48),colors.ink,[0,2.245,0],[1,1,1],[-Math.PI/2,0,0]);
      add('Head form',new THREE.SphereGeometry(1,48,32),colors.cream,[0,2.62,0],[.245,.32,.245]);
      add('Jacket seam',new THREE.BoxGeometry(.022,.61,.018),colors.ink,[0,1.86,.29]);
      add('Utility pocket',new THREE.BoxGeometry(.18,.21,.035),colors.orange,[-.23,1.92,.27]);
      this.orbit.target.set(0,1.4,0);this.camera.position.set(4.5,3.1,6.6);
    }else if(name==='product'){
      add('Base',new THREE.CylinderGeometry(1.4,1.4,.12,96),colors.ink,[0,.06,0]);
      add('Vessel',new THREE.CylinderGeometry(.6,.48,1.5,64,8),colors.orange,[0,.86,0]);
      add('Lid',new THREE.CylinderGeometry(.62,.62,.14,64),colors.ink,[0,1.68,0]);
      add('Handle',new THREE.TorusGeometry(.48,.1,24,64),colors.cream,[.66,1.05,0]);
      this.frame();
    }else {this.orbit.target.set(0,.5,0);this.camera.position.set(5,4,6);}
    this.timeline?.reset();this.meshTools?.setMode('object');this.history=[];this.historyAt=-1;this.commit();
  }
  disposeRoot(){this.cancelTransform();this.foundation?.snapGesture.clear();this.sculptLayerPreview?.cancel();this.meshTools?.cancelStroke?.();discardShapeSession(this);this.scene.remove(this.root);this.root.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of [].concat(o.material))m.dispose();}});}
  select(obj){if(obj!==this.selected){this.cancelTransform();this.sculptLayerPreview?.cancel();this.meshTools?.cancelStroke?.();}if(this.weightPaint?.active&&obj!==this.weightPaint.owner)this.weightPaint.stop(false);this.ik?.detach();this.selected=obj;this.transform.detach();this.outline.visible=!!obj;if(obj){if(this.tool!=='select'&&(!this.meshTools||this.meshTools.mode==='object'))this.transform.attach(obj);this.outline.setFromObject(obj);}this.change('selection');}
  mode(mode){this.tool=mode;if(mode==='select'){if(!this.ik?.active)this.transform.detach();return;}this.transform.setMode(this.ik?.active?'translate':mode);if(this.selected&&!this.transform.object&&!this.ik?.active&&this.meshTools.mode==='object')this.transform.attach(this.selected);}
  viewRect(){const r=this.renderer.domElement.getBoundingClientRect();if(!this.quad)return r;const [x0,y0,x1,y1]=this.quad.views[this.quad.active].rect;return {left:r.left+x0*r.width,top:r.top+y0*r.height,width:(x1-x0)*r.width,height:(y1-y0)*r.height};}
  ndc(e){const r=this.viewRect();return new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);}
  viewAt(e){const r=this.renderer.domElement.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;return this.quad.views.findIndex(({rect:[x0,y0,x1,y1]})=>x>=x0&&x<x1&&y>=y0&&y<y1);}
  useCamera(c){this.camera=c;this.orbit.object=c;this.transform.camera=c;}
  activateView(i){const q=this.quad;if(!q||i<0||i===q.active)return;this.settleOrbit();q.views[q.active].target.copy(this.orbit.target);q.active=i;const v=q.views[i];this.useCamera(v.camera);this.orbit.target.copy(v.target);this.orbit.enableRotate=v.user;this.orbit.update();this.transform.getHelper().updateMatrixWorld(true);this.change('view');}
  // Quad view: orthographic Top / Front / Right and the user camera, drawn into one canvas with scissoring.
  toggleQuad(){
    this.settleOrbit();
    if(this.quad){this.activateView(3);this.quad=null;this.orbit.enableRotate=true;this.fitCameras();this.change('view');return;}
    const box=new THREE.Box3().setFromObject(this.root),center=box.isEmpty()?new THREE.Vector3():box.getCenter(new THREE.Vector3()),size=box.isEmpty()?4:Math.max(box.getSize(new THREE.Vector3()).length(),1);
    const side=(label,dir,rect)=>{const camera=new THREE.OrthographicCamera(-1,1,size*.6,-size*.6,-10000,10000);camera.position.copy(center).addScaledVector(new THREE.Vector3(...dir).normalize(),size*2);camera.lookAt(center);return {label,user:false,camera,target:center.clone(),rect};};
    this.quad={active:3,views:[side('top',[0,1,.0001],[0,0,.5,.5]),side('front',[0,0,1],[.5,0,1,.5]),side('right',[1,0,0],[0,.5,.5,1]),{label:null,user:true,camera:this.camera,target:this.orbit.target.clone(),rect:[.5,.5,1,1]}]};
    this.fitCameras();this.change('view');
  }
  refreshQuadOverlay(){
    let overlay=this.element.querySelector(':scope>.quad-overlay');if(!this.quad){overlay?.remove();return;}
    if(!overlay){overlay=document.createElement('div');overlay.className='quad-overlay';this.element.style.position||='relative';this.element.append(overlay);}
    overlay.innerHTML=this.quad.views.map(({label,rect:[x0,y0,x1,y1]},i)=>`<div class="${i===this.quad.active?'active':''}" style="left:${x0*100}%;top:${y0*100}%;width:${(x1-x0)*100}%;height:${(y1-y0)*100}%"><span>${label?label[0].toUpperCase()+label.slice(1):'User'}</span></div>`).join('');
  }
  applyProxy(){return this.overrideMaterials(m=>{let c=this.proxyMaterials.get(m);if(!c){c=m.clone();c.wireframe=true;c.color?.setHex(0x88ccff);this.proxyMaterials.set(m,c);}return c;},n=>!!n.userData.fusion_proxy);}
  setIpr(on){this.ipr=!!on;this.iprAccum=0;this.iprKey='';this.change('view');}
  drawIpr(){
    const r=this.renderer,w=Math.max(1,this.element.clientWidth),h=Math.max(1,this.element.clientHeight),c=this.camera;
    const key=c.matrixWorld.elements.map(v=>+v.toFixed(4)).join()+c.projectionMatrix.elements.map(v=>+v.toFixed(4)).join();
    if(key!==this.iprKey){this.iprKey=key;this.iprAccum=0;}
    if(!this.iprCurr||this.iprCurr.width!==w||this.iprCurr.height!==h){
      this.iprCurr?.dispose();this.iprAcc?.dispose();this.iprNext?.dispose();
      const spec={type:THREE.HalfFloatType};this.iprCurr=new THREE.WebGLRenderTarget(w,h,spec);this.iprAcc=new THREE.WebGLRenderTarget(w,h,spec);this.iprNext=new THREE.WebGLRenderTarget(w,h,spec);
      if(!this.iprMix){this.iprMix=new THREE.ShaderMaterial({uniforms:{tAcc:{value:null},tNew:{value:null},w:{value:1}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',fragmentShader:'varying vec2 vUv;uniform sampler2D tAcc,tNew;uniform float w;void main(){gl_FragColor=mix(texture2D(tAcc,vUv),texture2D(tNew,vUv),w);}'});this.iprScene=new THREE.Scene();this.iprCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);this.iprScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.iprMix));}
    }
    const prev=r.getRenderTarget();
    r.setRenderTarget(this.iprCurr);r.render(this.scene,c);
    this.iprMix.uniforms.tNew.value=this.iprCurr.texture;this.iprMix.uniforms.tAcc.value=this.iprAcc.texture;this.iprMix.uniforms.w.value=this.iprAccum===0?1:1/(this.iprAccum+1);
    r.setRenderTarget(this.iprNext);r.render(this.iprScene,this.iprCam);
    const swap=this.iprAcc;this.iprAcc=this.iprNext;this.iprNext=swap;
    this.iprMix.uniforms.tNew.value=this.iprAcc.texture;this.iprMix.uniforms.tAcc.value=this.iprAcc.texture;this.iprMix.uniforms.w.value=1;
    r.setRenderTarget(prev);r.render(this.iprScene,this.iprCam);this.iprAccum++;
  }
  draw(){
    const r=this.renderer;if(this.ipr&&!this.quad){this.drawIpr();return;}if(!this.quad){r.render(this.scene,this.camera);return;}
    const W=this.element.clientWidth,H=this.element.clientHeight,helper=this.transform.getHelper(),shown=helper.visible;r.setScissorTest(true);
    this.quad.views.forEach(({rect:[x0,y0,x1,y1],camera},i)=>{const x=x0*W,y=(1-y1)*H,w=(x1-x0)*W-1,h=(y1-y0)*H-1;r.setViewport(x,y,w,h);r.setScissor(x,y,w,h);helper.visible=shown&&i===this.quad.active;r.render(this.scene,camera);});
    helper.visible=shown;r.setScissorTest(false);r.setViewport(0,0,W,H);
  }
  fitCameras(){for(const c of this.quad?this.quad.views.map(v=>v.camera):[this.camera])this.fitCamera(c);}
  fitCamera(c=this.camera){const W=this.element.clientWidth||1,H=this.element.clientHeight||1,v=this.quad?.views.find(v=>v.camera===c),w=v?W*(v.rect[2]-v.rect[0]):W,h=v?H*(v.rect[3]-v.rect[1]):H;if(c.isOrthographicCamera){const half=(c.top-c.bottom)/2;Object.assign(c,{left:-half*w/h,right:half*w/h});}else c.aspect=w/h;c.updateProjectionMatrix();}
  // Orthographic height matches the perspective frustum at the target distance, so toggling keeps framing.
  setProjection(ortho){
    if(this.quad&&!this.quad.views[this.quad.active].user)return;this.settleOrbit();const from=this.camera,dist=from.position.distanceTo(this.orbit.target),tan=Math.tan(THREE.MathUtils.degToRad(this.perspectiveCamera.fov)/2);if(ortho===!!from.isOrthographicCamera)return;
    let to;if(ortho){const half=dist*tan;to=new THREE.OrthographicCamera(-half,half,half,-half,-10000,10000);to.position.copy(from.position);}
    else{to=this.perspectiveCamera;const visible=(from.top-from.bottom)/from.zoom/2/tan,dir=from.position.clone().sub(this.orbit.target).normalize();to.position.copy(this.orbit.target).addScaledVector(dir,visible);}
    to.quaternion.copy(from.quaternion);if(this.quad)this.quad.views[this.quad.active].camera=to;this.useCamera(to);this.fitCamera();this.orbit.update();this.change('view');
  }
  renderCamera(){const c=this.camera;return {position:c.position.toArray(),target:this.orbit.target.toArray(),fov:this.perspectiveCamera.fov,...c.isOrthographicCamera?{orthoHeight:(c.top-c.bottom)/c.zoom}:{}};}
  hideSelected(){if(!this.selected)return;const obj=this.selected;obj.visible=false;this.select(null);this.commit();}
  revealAll(){const hidden=this.root.children.filter(o=>!o.visible);if(!hidden.length)return;for(const o of hidden)o.visible=true;this.commit();}
  // Local view is display-only: other objects are skipped while rendering and picking, never saved hidden.
  toggleLocalView(){if(this.localView){this.localView=null;this.frame(this.root);}else if(this.selected){this.localView=new Set([this.selected.uuid]);this.frame(this.selected);}this.change('view');}
  // Viewport-only section: renderer-global clipping keeps p[axis] <= offset (or >= when flipped), grid included, as Blender's clipping region does.
  setSection(section){this.section=section?{...section,plane:new THREE.Plane(new THREE.Vector3(...['x','y','z'].map(a=>a===section.axis?(section.flip?1:-1):0)),section.flip?-section.offset:section.offset)}:null;this.renderer.clippingPlanes=this.section?[this.section.plane]:[];}
  // X-ray draws see-through clones swapped in for one frame; saved materials never change.
  xrayMaterial(m){let c=this.xrayMaterials.get(m);if(!c||c.userData.sourceVersion!==m.version){c?.dispose();c=m.clone();c.userData={sourceVersion:m.version};this.xrayMaterials.set(m,c);}c.color?.copy(m.color);Object.assign(c,{transparent:true,opacity:Math.min(m.opacity,.35),depthWrite:false,wireframe:m.wireframe});return c;}
  // Display overrides swap materials for one frame only; callers restore the returned [mesh, material] pairs.
  overrideMaterials(replace,include=()=>true){const swapped=[];this.root.traverse(n=>{if(n.isMesh&&n.material&&include(n)){swapped.push([n,n.material]);n.material=Array.isArray(n.material)?n.material.map(replace):replace(n.material);}});return swapped;}
  applyXray(){return this.overrideMaterials(m=>this.xrayMaterial(m));}
  // UV checker: a shared lit material with a numbered grid on meshes that have texture coordinates.
  applyChecker(){const checker=this.checkerMaterial??=new THREE.MeshStandardMaterial({map:checkerTexture(),roughness:.75});return this.overrideMaterials(()=>checker,n=>!!n.geometry.attributes.uv);}
  async addReference(url,name='Reference'){
    const texture=await new THREE.TextureLoader().loadAsync(url);texture.colorSpace=THREE.SRGBColorSpace;const {width,height}=texture.image;
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(2*width/height,2),new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:.6,side:THREE.DoubleSide,depthWrite:false}));
    plane.name=name.slice(0,80);plane.userData.fusion_reference=true;plane.position.copy(this.orbit.target);plane.quaternion.copy(this.camera.quaternion);
    return this.insertObject(plane,'Add reference image');
  }
  insertObject(object,label){this.ensureHistory();object.updateMatrix();this.root.add(object);this.select(object);this.journal.insert(retainPhysicalIor(object,object.toJSON()),label);this.change('scene');return object;}
  addLight(kind){const light=createLight(kind),target=this.orbit.target;light.position.copy(target).add(new THREE.Vector3(2,3,2));light.lookAt(target);return this.insertObject(light,'Add '+light.name);}
  addArmature(template='biped'){const armature=createArmature(template);armature.position.copy(this.orbit.target);return this.insertObject(armature,'Add '+armature.name);}
  addBone(name='Bone'){
    const owner=this.selected;if(!owner)throw Error('Select an armature or bone first.');
    let root=owner,parent=owner.isBone?owner:bonesOf(owner)[0];
    while(root.parent&&root.parent!==this.root)root=root.parent;
    if(!parent){parent=appendBone(root,root,name);this.select(parent);this.commit();return parent;}
    const bone=appendBone(root,parent,name);this.ensureHistory();this.select(bone);this.commit();return bone;
  }
  addLightRig(name){
    const spec=LIGHT_RIGS[name];if(!spec)throw Error('Unknown lighting rig.');
    const target=this.orbit.target.clone();let last;
    for(const item of spec){const light=createLight(item.kind);light.name=item.name;light.position.copy(target).add(new THREE.Vector3(...item.offset));light.lookAt(new THREE.Vector3(...(item.look||[0,1,0])).add(target));light.userData.fusion_group=item.group;light.userData.fusion_power=item.intensity;light.intensity=item.intensity;if(item.kelvin)applyKelvin(light,item.kelvin);if(item.soft!=null)light.userData.fusion_soft=item.soft;if(item.area)light.userData.fusion_area=item.area;if(item.angle)light.angle=item.angle*Math.PI/360;last=this.insertObject(light,'Add '+name+' '+light.name);}
    return last;
  }
  startLightPaint(kind='point'){this.lightPaint=kind;this.change('light-paint',kind);}
  cancelLightPaint(){if(!this.lightPaint)return;this.lightPaint=null;this.change('light-paint',null);}
  placePaintedLight(hit){const kind=this.lightPaint||'point',pose=paintPlacement(hit,kind),light=createLight(kind);light.position.fromArray(pose.position);light.lookAt(...pose.target);this.lightPaint=null;this.insertObject(light,'Paint '+light.name);this.change('light-paint',null);return light;}
  makeMeshLight(opts){if(!this.selected?.isMesh)throw Error('Select a mesh to use as a light.');makeMeshLight(this.selected,opts);this.commit();return this.selected;}
  lightingSidecar(){return lightingSidecar(this.root);}
  cameraSidecar(){return cameraSidecar(this.root);}
  setLightMixer(group,value){const mixer=this.root.userData.fusion_light_mixer||(this.root.userData.fusion_light_mixer={});if(!Number.isFinite(value)||value<0||value>16)throw Error('Mixer values must be 0–16.');mixer[group]=value;}
  setContactShadows(on){this.renderer.shadowMap.type=on?THREE.VSMShadowMap:THREE.PCFSoftShadowMap;this.root.traverse(l=>{if(l.isLight&&l.shadow){l.shadow.bias=on?-0.0004:-0.0001;l.shadow.normalBias=on?.02:.04;}});this.contactShadows=!!on;}
  addCamera(opts={}){const camera=createCamera(this.camera,this.renderAspect||1.2,opts);this.insertObject(camera,opts.ortho?'Add ortho camera':'Add camera');if(!this.activeCamera())this.setActiveCamera(camera);return camera;}
  addCameraRig(kind){if(!CAMERA_RIGS[kind])throw Error('Unknown camera rig.');const camera=createCamera(this.camera,this.renderAspect||1.2),empty=assembleCameraRig(kind,camera,this.orbit.target);this.ensureHistory();this.root.add(empty);if(!this.activeCamera())this.root.userData.fusion_active_camera=camera.uuid;this.select(camera);this.journal.insert(empty.toJSON(),'Add '+empty.name);this.change('scene');return camera;}
  applyCameraPreset(name){const camera=this.selected?.isCamera?this.selected:this.activeCamera();if(!camera)throw Error('Select a camera first.');applyCameraPreset(camera,name);this.commit();return camera;}
  importCameraTrack(input){const camera=this.selected?.isCamera?this.selected:this.activeCamera();if(!camera)throw Error('Select a camera first.');camera.userData.fusion_track=validateCameraTrack(input);captureCameraRest(camera);this.commit();return camera;}
  activeCamera(){const id=this.root.userData.fusion_active_camera;return id?this.root.getObjectByProperty('uuid',id)??null:null;}
  setActiveCamera(camera){if(!camera?.isCamera)throw Error('Select a camera first.');this.root.userData.fusion_active_camera=camera.uuid;this.commit();}
  // Camera view: the viewport adopts the scene camera's pose and projection; orbiting afterwards leaves the camera untouched unless shake/follow/track is live.
  lookThrough(camera=this.activeCamera()){if(!camera)throw Error('Add or choose an active camera first.');this.settleOrbit();const ortho=!!(camera.isOrthographicCamera||camera.userData.fusion_ortho);this.setProjection(ortho);camera.updateWorldMatrix(true,false);const c=this.camera;camera.matrixWorld.decompose(c.position,c.quaternion,new THREE.Vector3());if(ortho&&c.isOrthographicCamera){const h=camera.userData.fusion_ortho_height||(camera.top-camera.bottom)/(camera.zoom||1);c.top=h/2;c.bottom=-h/2;this.fitCamera(c);}else if(c.isPerspectiveCamera){c.fov=camera.fov;c.updateProjectionMatrix();}this.orbit.target.copy(c.position).addScaledVector(new THREE.Vector3(0,0,-1).applyQuaternion(c.quaternion),camera.userData.fusion_focus||5);this.orbit.update();this.lookCamera=camera;this.refreshCameraGuides();this.change('view');}
  syncLookThrough(){const camera=this.lookCamera;if(!camera?.parent){this.lookCamera=null;return;}const u=camera.userData;if(!(u.fusion_shake_amp||u.fusion_follow||u.fusion_track))return;applyCameraProcedural(camera,this.timeline.frame,this.timeline.fps,this.root);camera.updateWorldMatrix(true,false);camera.matrixWorld.decompose(this.camera.position,this.camera.quaternion,new THREE.Vector3());}
  refreshCameraGuides(){const camera=this.lookCamera||(this.selected?.isCamera?this.selected:this.activeCamera()),html=guideMarkup(camera?.userData.fusion_guides);let el=this.element.querySelector(':scope>.camera-guides');if(!html){el?.remove();return;}if(!el){el=document.createElement('div');el.className='camera-guides';el.setAttribute('aria-hidden','true');this.element.style.position||='relative';this.element.append(el);}el.outerHTML=html;}
  alignCameraToView(camera=this.activeCamera()){if(!camera)throw Error('Add or choose an active camera first.');this.select(camera);return this.placeSelection(()=>{this.camera.updateWorldMatrix(true,false);camera.position.copy(this.camera.position);camera.quaternion.copy(this.camera.quaternion);});}
  // Viewport environment preview (material-preview style); `texture` is an equirectangular HDR or null to restore studio shading.
  setEnvironment(texture,{strength=1,rotation=0}={}){
    // PMREM filtering needs a 16-pixel cube face, i.e. an equirectangular image at least 64 pixels wide.
    if(texture&&texture.image.width<64){texture.dispose();throw Error('Environment previews need an image at least 64 pixels wide.');}
    if(this.environment!==texture){this.environment?.dispose();this.environmentTarget?.dispose();this.environmentTarget=null;}this.environment=texture;
    if(texture){texture.mapping=THREE.EquirectangularReflectionMapping;this.environmentTarget??=(this.pmrem??=new THREE.PMREMGenerator(this.renderer)).fromEquirectangular(texture);this.scene.environment=this.environmentTarget.texture;this.scene.background=texture;this.scene.environmentIntensity=this.scene.backgroundIntensity=strength;this.scene.environmentRotation.y=this.scene.backgroundRotation.y=THREE.MathUtils.degToRad(rotation);this.scene.fog=null;}
    else{this.scene.environment=null;this.scene.background=new THREE.Color('#3b3b3b');this.scene.fog=new THREE.Fog('#3b3b3b',22,65);}
  }
  bounds(){const b=new THREE.Box3().setFromObject(this.root);return b.isEmpty()?{min:[-1,-1,-1],max:[1,1,1]}:{min:b.min.toArray(),max:b.max.toArray()};}
  unclipped(hit){return !this.section||this.section.plane.distanceToPoint(hit.point)>=0;}
  saveBookmark(name=`View ${this.bookmarks.length+1}`){this.settleOrbit();this.bookmarks.push({name,position:this.camera.position.toArray(),target:this.orbit.target.toArray(),ortho:!!this.camera.isOrthographicCamera,zoom:this.camera.zoom});return this.bookmarks.at(-1);}
  recallBookmark(i){const b=this.bookmarks[i];if(!b)return;this.settleOrbit();this.setProjection(b.ortho);this.camera.position.fromArray(b.position);this.orbit.target.fromArray(b.target);this.camera.zoom=b.zoom??1;this.camera.updateProjectionMatrix();this.orbit.update();this.change('view');}
  placeSelection(update){const obj=this.selected;if(!obj)return;const gesture={id:obj.uuid,before:this.captureTransform(obj)};update(obj.position);obj.updateMatrixWorld(true);return this.operators?this.operators.run('object.transform_gesture',gesture):this.finishTransform(gesture);}
  dropToFloor(){const obj=this.selected;if(!obj)return;const box=new THREE.Box3().setFromObject(obj);if(box.isEmpty())return;return this.transformField('position','y',obj.position.y-box.min.y);}
  frame(obj=this.selected||this.root){const box=new THREE.Box3().setFromObject(obj);if(box.isEmpty())return;const center=box.getCenter(new THREE.Vector3());const size=Math.max(box.getSize(new THREE.Vector3()).length(),.5);const direction=this.camera.position.clone().sub(this.orbit.target).normalize();this.orbit.target.copy(center);this.camera.position.copy(center).addScaledVector(direction,size*1.5);this.camera.updateProjectionMatrix();}
  // Damped Orbit Controls keep applying leftover drag motion; flushing it keeps snapped views exact.
  settleOrbit(){const damping=this.orbit.enableDamping;this.orbit.enableDamping=false;this.orbit.update();this.orbit.enableDamping=damping;}
  view(name){this.lookCamera=null;this.settleOrbit();if(this.camera.isPerspectiveCamera&&this.camera.fov!==this.viewFov){this.camera.fov=this.viewFov;this.camera.updateProjectionMatrix();}const offset={front:[0,0,1],back:[0,0,-1],right:[1,0,0],left:[-1,0,0],top:[0,1,.001],bottom:[0,-1,.001],perspective:[.7,.4,1]}[name];const dist=this.camera.position.distanceTo(this.orbit.target);this.camera.position.copy(this.orbit.target).add(new THREE.Vector3(...offset).normalize().multiplyScalar(dist));this.orbit.update();}
  snap(on){this.foundation?.setSnap({enabled:!!on})??(this.transform.setTranslationSnap(on?.1:null),this.transform.setRotationSnap(on?THREE.MathUtils.degToRad(15):null),this.transform.setScaleSnap(on?.1:null));}
  wire(on){this.wireframe=on;this.root.traverse(o=>{if(o.material)for(const m of [].concat(o.material))m.wireframe=on;});}
  remove(){if(!this.selected)return;this.root.remove(this.selected);this.select(null);this.commit();}
  duplicate(offset=true){if(!this.selected)return;const obj=cloneSkeleton(this.selected),id=THREE.MathUtils.generateUUID();obj.traverse(o=>{if(o.geometry)o.geometry=o.geometry.clone();if(o.material)o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();if(o.userData.fusion_id)o.userData.fusion_id=id;});obj.userData.fusion_id=id;if(offset)obj.position.x+=.3;obj.name+=' copy';this.root.add(obj);this.select(obj);this.commit();return obj;}
  rename(name){if(this.selected){this.selected.name=name.slice(0,80)||'Object';this.commit();}}
  transformField(kind,axis,value){return this.operators?this.operators.run('object.transform',{kind,axis,value}):this._transformField(kind,axis,value);}
  _transformField(kind,axis,value){if(!this.selected||!Number.isFinite(value))return;const before=this.captureTransform(this.selected);if(kind==='scale'&&Math.abs(value)<.001)value=.001;this.selected[kind][axis]=kind==='rotation'?THREE.MathUtils.degToRad(value):value;this.finishTransform({id:this.selected.uuid,before});}
  captureTransform(object){object.updateMatrix();return {position:object.position.toArray(),quaternion:object.quaternion.toArray(),scale:object.scale.toArray(),matrix:object.matrix.toArray()};}
  finishTransform({id,before}){const object=this.root.getObjectByProperty('uuid',id);if(!object)return;try{validateIKScales(this.root);}catch(error){object.position.fromArray(before.position);object.quaternion.fromArray(before.quaternion);object.scale.fromArray(before.scale);object.updateMatrixWorld(true);this.change('transform');throw error;}if(object.isCamera)captureCameraRest(object);this.ensureHistory();this.journal.transform(id,before,this.captureTransform(object));if(this.timeline?.autoKey&&this.selected){try{this.timeline.insert();}catch{/* auto-key skipped if selection invalid */}}this.change('scene');}
  adjustTransform({kind,axis,value}){const entry=this.journal.entries.at(-1),object=this.root.getObjectByProperty('uuid',entry.id);if(!object)throw Error('Transform target is missing');const before=this.captureTransform(object);if(kind==='scale'&&Math.abs(value)<.001)value=.001;object[kind][axis]=kind==='rotation'?THREE.MathUtils.degToRad(value):value;try{validateIKScales(this.root);}catch(error){object.position.fromArray(before.position);object.quaternion.fromArray(before.quaternion);object.scale.fromArray(before.scale);object.updateMatrixWorld(true);throw error;}entry.after=this.captureTransform(object);this.journal.cacheTransform(entry.id,entry.after);this.select(object);this.journal.onChange();this.change('scene');}
  surface(key,value){if(!this.selected)return;const creator=creatorRoot(this.selected);if(creator){if(!['color','roughness','metalness'].includes(key)||this.selected.isMesh&&this.selected!==creator.getObjectByName('Body')){this.change('operator-error',Error('Edit generated eye and hair materials in Character > Skin or Hair.'));return;}this.ensureHistory();const recipe=structuredClone(creator.userData.fusion_creator.recipe);recipe.appearance[key==='color'?'customColor':key]=value;try{changeCreator(creator,recipe);}catch(error){this.change('operator-error',error);return;}this.commit();return;}if(this.selected.userData.modifierStack){this.change('operator-error',Error('Apply the modifier stack before changing evaluated materials.'));return;}this.selected.traverse(o=>{if(o.isMesh&&o.material&&!o.userData.fusion_outline&&!o.userData.fusion_decal)applySurfaceField(o,key,value);});this.commit();}
  applyPreset(name,{instance=false}={}){if(!this.selected)return;if(this.selected.userData.modifierStack){this.change('operator-error',Error('Apply the modifier stack before changing evaluated materials.'));return;}if(!SURFACE_PRESETS[name])throw Error('Unknown material preset.');const instanceId=instance?(this.selectedMaterial()?.userData.fusion_surface?.instanceId||THREE.MathUtils.generateUUID()):'';this.selected.traverse(o=>{if(o.isMesh&&o.material&&!o.userData.fusion_outline&&!o.userData.fusion_decal){applyPreset(o,name,{instanceId});if(name==='Toon')this.toonOutline(o,true);else if(o.userData.fusion_outline===undefined)this.toonOutline(o,false);}});if(instance)shareInstance(this.root,this.selectedMaterial());this.commit();}
  toonOutline(mesh,enable){const drop=[];mesh.traverse(n=>{if(n.userData.fusion_outline)drop.push(n);});for(const n of drop)n.removeFromParent();if(!enable)return;const outline=new THREE.Mesh(mesh.geometry,new THREE.MeshBasicMaterial({color:0x111111,side:THREE.BackSide}));outline.name='Toon outline';outline.scale.setScalar(1.035);outline.userData.fusion_outline=true;mesh.add(outline);}
  setRayVisibility(flags){if(!this.selected)return;applyRayVisibility(this.selected,flags);this.commit();}
  setMaterialOverride(record){if(!this.selected)return;applyObjectOverride(this.selected,record);this.commit();}
  makeMaterialUnique(){if(!this.selected)return;this.selected.traverse(o=>{if(o.isMesh&&o.material)makeUnique(o);});this.commit();}
  enableVertexColors(){if(!this.selected)return;this.selected.traverse(o=>{if(!o.isMesh)return;addVertexColors(o.geometry,readSurface([].concat(o.material)[0]).color);applySurfaceField(o,'vertexColor',true);});this.commit();}
  addDecal({size=.2,color='#ffffff'}={}){const mesh=this.selected;if(!mesh?.isMesh)throw Error('Select a mesh to project a decal.');mesh.updateWorldMatrix(true,false);const position=new THREE.Vector3(),normal=new THREE.Vector3();mesh.getWorldPosition(position);normal.subVectors(this.camera.position,position).normalize();const orientation=new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),normal));const geo=new DecalGeometry(mesh,position,orientation,new THREE.Vector3(size,size,size)),mat=applySurface(new THREE.MeshPhysicalMaterial(),{color,roughness:.55,metalness:0,opacity:.95,alphaMode:'blend'});const decal=new THREE.Mesh(geo,mat);decal.name='Decal';decal.userData.fusion_decal={version:1,size};decal.renderOrder=2;mesh.add(decal);this.commit();return decal;}
  surfaceSidecar(){return surfaceSidecar(this.root);}
  visible(id){const obj=this.root.children.find(o=>o.uuid===id);if(obj){obj.visible=!obj.visible;if(obj===this.selected&&!obj.visible)this.select(null);this.commit();}}
  serialize({immutableImages=false}={}){
    if(this.sculptLayerPreview)throw Error('Finish or cancel the sculpt layer slider before saving.');
    this.root.traverse(n=>validateSculptLayers(n));
    if(this.foundation)this.root.userData.fusion_scene_foundation=this.foundation.snapshot();
    if(this.timeline?.snapshot)this.root.userData.fusion_timeline_settings=this.timeline.snapshot();
    // Save current channels even when no render has occurred since an edit.
    this.root.updateMatrixWorld(true);
    this.root.traverse(n=>{if(n.geometry&&!n.geometry.boundingSphere)n.geometry.computeBoundingSphere();});
    this.imageJSONCache??=new WeakMap();const document=serializeScene(this.root,this.imageJSONCache,creatorDerivedGeometry(this.root),{immutableImages}),geometries=new Map(),nodes=new Map();
    this.root.traverse(node=>nodes.set(node.uuid,node));
    // ObjectLoader decomposes serialized matrices back into TRS. Imported
    // quaternions can be slightly non-unit, so this changes skin evaluation on
    // the first reopen. Keep the authored values exactly; manual matrices keep
    // their original representation (including shear).
    const retainTransform=json=>{const node=nodes.get(json.uuid);if(node?.matrixAutoUpdate){delete json.matrix;json.position=node.position.toArray();json.quaternion=node.quaternion.toArray();json.scale=node.scale.toArray();}for(const child of json.children||[])retainTransform(child);};retainTransform(document.object);
    this.root.traverse(node=>{if(node.geometry)geometries.set(node.geometry.uuid,node.geometry);});
    document.geometries=document.geometries?.map(json=>{
      const geometry=geometries.get(json.uuid);
      if(!geometry?.parameters)return json;
      // Generator recipes no longer describe manually edited positions/UVs.
      // A serialization-only buffer view avoids cloning or mutating live data.
      const buffer=new THREE.BufferGeometry();buffer.uuid=geometry.uuid;buffer.name=geometry.name;
      for(const key of ['index','attributes','morphAttributes','morphTargetsRelative','groups','boundingSphere','userData'])buffer[key]=geometry[key];
      const encoded=buffer.toJSON();delete encoded.metadata;return encoded;
    });
    // Physical material reflectivity is a deprecated alias derived from IOR.
    // Loading both introduces round-off and false history changes.
    return retainPhysicalIor(this.root,document);
  }
  document(name){if(this.sculptLayerPreview||this.meshTools?.stroke)throw Error('Finish or cancel the sculpt gesture before saving.');if(this.creatorShapeSession)throw Error('Apply or cancel the shape-key edit before saving.');return structuredClone({format:'fusion-studio',version:2,applicationVersion:appPackage.version,projectId:this.root.uuid,name,units:'meters',manifest:{schema:2,evaluation:'dependency-graph-v1',geometry:'three-json-embedded'},scene:this.serialize(),timeline:{frame:this.timeline.frame,end:this.timeline.end,fps:this.timeline.fps},camera:{position:this.camera.position.toArray(),target:this.orbit.target.toArray()},...this.bookmarks.length?{views:structuredClone(this.bookmarks)}:{},...this.renderSettings?{render:structuredClone(this.renderSettings)}:{}});}
  async restore(json,{preserveFrame=false,fromHistory=false}={}){const frame=this.timeline.frame;this.evaluation?.invalidate();if(fromHistory)json=this.historyImages.expand(json);const root=await new ProjectLoader().parseAsync(json);const foundationSettings=validateFoundationState(root.userData.fusion_scene_foundation,root.userData.units);validateTimelineSettings(root.userData.fusion_timeline_settings);validateAnimationKeys(root.userData.fusion_timeline||[]);root.traverse(n=>{validateSculptLayers(n);validateFollowPath(n.userData.fusion_follow_path);validateGarmentFinishing(n);if(n.userData.liveGarment?.settings?.fabricResponse)fabricResponse(n.userData.liveGarment.settings.fabricResponse);if(n.userData.liveGarment?.fittedSurface)validateFittedSurface(n.userData.liveGarment.fittedSurface);if(n.userData.fusion_joint_limits)validateJointLimits(n);validatePoseLibrary(n);validateSkinEdit(n);if(n.userData.fusion_body_measurements)validateMeasurementSnapshot(n.userData.fusion_body_measurements);validateFormulaRotations(n);});this.select(null);this.disposeRoot();this.root=root;this.scene.add(root);this.foundation?.hydrate(foundationSettings);this.wire(this.wireframe);this.components?.reset();this.meshTools.setMode('object');this.timeline.reset();if(preserveFrame)this.timeline.frame=frame;this.change('scene');}
  async load(doc){const vec=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);if(doc.views!==undefined&&!(Array.isArray(doc.views)&&doc.views.every(b=>typeof b?.name==='string'&&vec(b.position)&&vec(b.target))))throw Error('Saved view bookmarks are invalid.');const render=doc.render===undefined?null:normalizeRenderSettings(doc.render);await this.restore(doc.scene);if(render&&this.renderSettings)Object.assign(this.renderSettings,render);this.bookmarks=structuredClone(doc.views||[]);if(doc.camera){this.camera.position.fromArray(doc.camera.position);this.orbit.target.fromArray(doc.camera.target);}else this.frame(this.root);if(doc.timeline){this.timeline.end=doc.timeline.end;this.timeline.fps=doc.timeline.fps;this.timeline.evaluate(doc.timeline.frame);}this.history=[];this.historyAt=-1;this.commit();}
  ensureHistory(){
    if(!this.journal||this.history.length===0){
      this.historyImages=new HistoryImages();
      this.journal=new CommandHistory({capture:()=>this.historyImages.capture(this.serialize({immutableImages:true})),restore:doc=>this.restore(doc,{preserveFrame:true,fromHistory:true}),applyMetadata:(id,key,value)=>{const object=this.root.getObjectByProperty('uuid',id);if(!object||key!=='fusion_body_measurements')throw Error('Measurement history target is missing or invalid.');if(value)validateMeasurementSnapshot(value);if(value===null)delete object.userData[key];else object.userData[key]=structuredClone(value);this.evaluation?.invalidate();},applyRig:state=>this.applyRig(state),applyInsertion:async(id,data)=>{const prior=this.root.getObjectByProperty('uuid',id);if(prior){this.root.remove(prior);if(this.selected===prior)this.select(null);prior.geometry?.dispose();for(const mat of [].concat(prior.material||[]))mat.dispose();}if(data){const object=await new ProjectLoader().parseAsync(structuredClone(data));this.root.add(object);this.select(object);}},applyTransform:(id,state)=>{const object=this.root.getObjectByProperty('uuid',id);if(!object)throw Error('History target is missing');object.position.fromArray(state.position);object.quaternion.fromArray(state.quaternion);object.scale.fromArray(state.scale);object.updateMatrixWorld(true);},onChange:()=>{if(this.journal&&this.historyImages.payloads.size>8)this.historyImages.prune([this.journal.baseline,...this.journal.entries.filter(e=>e.type==='snapshot').flatMap(e=>[e.before,e.after])]);this.history=[{label:'Initial state'},...this.journal.entries];this.historyAt=this.journal.cursor;}});
      this.journal.reset();
    }
  }
  historyCheckpoint(){
    this.ensureHistory();const pool=this.historyImages,journal=this.journal,state=journal.checkpoint(),snapshot=pool.capture(this.serialize({immutableImages:true})),release=pool.retainIds(pool.payloads.keys());
    return {restore:async()=>{if(this.journal!==journal)throw Error('Scene history changed during rollback. Keep the current project and reopen its saved version.');try{await this.restore(pool.expand(JSON.parse(snapshot)));}finally{journal.restoreCheckpoint(state);}},release:()=>{release();if(pool===this.historyImages&&pool.payloads.size>8)pool.prune([this.journal.baseline,...this.journal.entries.filter(e=>e.type==='snapshot').flatMap(e=>[e.before,e.after])]);}};
  }
  commit(){this.evaluation?.invalidate();if(this.journal?.restoring||this.batching)return;this.ensureHistory();this.journal.snapshot();this.change('scene');}
  cancelTransform(){
    if(!this.transform?.dragging)return false;
    const gesture=this.transformStart;this.transformStart=null;this.foundation?.snapGesture.end();this.transform.reset();this.transform.pointerUp(null);
    if(gesture?.ik)this.applyRig(gesture.before);this.orbit.enabled=true;this.change('transform');return true;
  }
  async extrudeOperator(distance,workingCopy){
    if(this.selected?.userData.modifierStack)throw Error('Use Component Editing on the retained source cage to keep the modifier stack evaluated.');
    this.ensureHistory();const before=this.journal.materialize(),selection=this.selected?.uuid,face=this.meshTools.faceIndex,meshes=[];this.selected.traverse(n=>{if(n.isMesh)meshes.push(n);});const index=meshes.indexOf(this.meshTools.activeMesh);this.batching=true;
    try{if(workingCopy){const original=this.selected,copy=this.duplicate(false),next=[];original.visible=false;this.clearParametric(copy);copy.traverse(n=>{if(n.isMesh)next.push(n);});this.meshTools.activeMesh=next[index];this.meshTools.faceIndex=face;}this.meshTools._extrude(distance);}
    catch(error){await this.restore(JSON.parse(before),{fromHistory:true});this.select(this.root.getObjectByProperty('uuid',selection)||null);throw error;}
    finally{this.batching=false;}
    this.commit();
  }
  async undo(){return this.operators?this.operators.run('history.undo'):this._undo();}
  async redo(){return this.operators?this.operators.run('history.redo'):this._redo();}
  async _undo(){const selectedId=this.selected?.uuid;await this.journal?.step(-1);if(!this.selected&&selectedId)this.select(this.root.getObjectByProperty('uuid',selectedId)||null);this.change('scene');}
  async _redo(){const selectedId=this.selected?.uuid;await this.journal?.step(1);if(!this.selected&&selectedId)this.select(this.root.getObjectByProperty('uuid',selectedId)||null);this.change('scene');}
  async glb(selectedOnly=false,{includeAnimations=true,excludeNative=false,generateTangents=false,signal}={}){
    if(this.sculptLayerPreview||this.meshTools?.stroke)throw Error('Finish or cancel the sculpt gesture before exporting or rendering.');
    if(this.creatorShapeSession)throw Error('Apply or cancel the shape-key edit before exporting or rendering.');
    const content=new THREE.Scene(),materialCopies=new WeakMap();const source=selectedOnly&&this.selected?[this.selected]:this.root.children;
    for(const object of source){object.traverse(n=>validateSculptLayers(n));const report=evaluateCharacter(object);if(!report.valid)throw Error('Resolve or pause character dependency errors before export or rendering.');}const animations=includeAnimations?this.timeline.exportClips():[],animationReport=includeAnimations?this.timeline.lastExportReport:null;
    if(animationReport)content.userData.fusion_animation_export=structuredClone(animationReport);
    for(const obj of source)if(obj.visible&&!obj.userData.fusion_reference&&(!excludeNative||!obj.userData.nativeBlend)){const report=evaluateCharacter(obj);if(!report.valid)throw Error('Resolve or pause character dependency errors before export or rendering.');const evaluated=await stackExportObject(obj),copy=copyExportMaterials(cloneSkeleton(evaluated),materialCopies),original=[],cloned=[];evaluated.traverse(n=>original.push(n));copy.traverse(n=>cloned.push(n));for(let i=0;i<original.length;i++){cloned[i].uuid=original[i].uuid;delete cloned[i].userData.fusion_ik;delete cloned[i].userData.fusion_joint_limits;delete cloned[i].userData.fusion_pose_presets;delete cloned[i].userData.fusion_skin_edit;delete cloned[i].userData.fusion_body_measurements;if(cloned[i].geometry)cloned[i].geometry=stripGarmentFinishGeometry(cloned[i].geometry,{clone:true});if(cloned[i].userData.liveGarment){delete cloned[i].userData.liveGarment.finish;delete cloned[i].userData.liveGarment.finishDiagnostics;delete cloned[i].userData.liveGarment.placement;delete cloned[i].userData.liveGarment.placementDiagnostics;delete cloned[i].userData.liveGarment.fittedSurface;delete cloned[i].userData.liveGarment.fittedDiagnostics;}delete cloned[i].userData.fusion_sculpt_layers;delete cloned[i].userData.fusion_morph_presets;delete cloned[i].userData.nativeBlend;delete cloned[i].userData.modifierStack;if(cloned[i].isCamera)stampCameraExtras(cloned[i]);if(cloned[i].isLight){const kind=cloned[i].userData.fusion_light||'point';cloned[i].userData.fusion_intensity=toViewportIntensity(kind,cloned[i].userData.fusion_unit||defaultUnit(kind),authoredPower(cloned[i]),cloned[i]);if(!cloned[i].userData.fusion_id)cloned[i].userData.fusion_id=original[i].uuid;}}const outlines=[];copy.traverse(n=>{if(n.userData.fusion_outline)outlines.push(n);});for(const n of outlines)n.removeFromParent();stampRenderIds(copy);bakeCharacterExchange(copy);copy.userData.fusion_id=obj.userData.fusion_id||obj.uuid;content.add(copy);if(includeAnimations)obj.traverseVisible(node=>{let lod=false;for(let n=node;n&&n!==obj.parent;n=n.parent)if(n.userData.fusion_lod_level)lod=true;if(!animationReport?.fullEvaluation||lod)for(const clip of node.animations||[])if(!animations.includes(clip))animations.push(clip);});}
    if(signal?.aborted)throw Error('GLB export cancelled.');
    this.lastTangentReport=generateTangents?await addExchangeTangents(content,{signal}):null;
    const visibleClips=visibleAnimationClips(content,this.root,animations);animations.splice(0,animations.length,...visibleClips.clips);content.userData.fusion_animation_visibility=visibleClips.report;
    prepareAffineExchange(content,animations);
    const buffer=await new GLTFExporter().parseAsync(content,{binary:true,onlyVisible:true,animations,trs:true});
    if(signal?.aborted)throw Error('GLB export cancelled.');
    const bytes=new Uint8Array(buffer);let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);
  }
  characterRenderMaterials(){return creatorRenderMaterials(this.root);}
  async importGLB(base64,name,replace=null,{metadata={},nativeBlend=null,signal}={}){
    const project=this.root,ownedMetadata=structuredClone(metadata),ownedNative=nativeBlend?structuredClone(nativeBlend):null;
    if(signal?.aborted)throw Error('Model import cancelled.');
    const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));const gltf=await new GLTFLoader().parseAsync(bytes.buffer,'');
    if(this.root!==project)throw Error('Project changed during model import.');
    if(signal?.aborted)throw Error('Model import cancelled.');
    let authoredExchange=false;gltf.scene.traverse(n=>{if(n.userData.fusion_deformation)authoredExchange=true;});if(authoredExchange)bakeCharacterExchange(gltf.scene);const group=gltf.scene;group.traverse(n=>{if(n.isMesh)n.geometry=compactPrimitive(n.geometry);});group.name=name;group.userData.source='Imported';group.animations=gltf.animations;
    group.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}if(o.isBone)o.userData.fusion_source_quaternion=o.quaternion.toArray();});
    group.userData={...group.userData,...ownedMetadata};if(ownedNative)attachNativeScene(group,ownedNative);
    // Commit imported controls with the asset. Export must not lazily create
    // document state after save/reopen or outside the import's history entry.
    if(group.userData.dazNative)evaluateCharacter(group);
    group.traverse(n=>validateSculptLayers(n));const checkpoint=this.batching?null:this.historyCheckpoint(),selected=this.selected?.uuid,frame=this.timeline.frame;
    try{if(replace){this.root.remove(replace);}this.root.add(group);this.timeline.register(group,gltf.animations);this.select(group);this.commit();this.frame(group);return group;}
    catch(error){if(checkpoint){await checkpoint.restore();this.timeline.frame=frame;this.select(this.root.getObjectByProperty('uuid',selected)||null);}throw error;}
    finally{checkpoint?.release();}
  }
  attachNativeScene(owner,resource){attachNativeScene(owner,resource);this.commit();}
  addCharacter(settings={}){const group=createCharacter(settings);this.root.add(group);this.select(group);this.commit();this.frame(group);return group;}
  rebuildCharacter(settings){const old=findCharacter(this.selected);if(!old)throw Error('Select a Fusion character first.');const pose={},bones=new Map();old.traverse(n=>{if(n.isBone){pose[n.name]=[n.rotation.x,n.rotation.y,n.rotation.z].map(v=>v*180/Math.PI);bones.set(n.name,n.uuid);}});const next=createCharacter({...old.userData.character,...settings},pose);next.uuid=old.uuid;next.traverse(n=>{if(n.isBone&&bones.has(n.name))n.uuid=bones.get(n.name);});next.name=old.name;next.position.copy(old.position);next.quaternion.copy(old.quaternion);next.scale.multiply(old.scale).multiplyScalar(1.8/old.userData.character.height);next.userData.fusion_id=old.userData.fusion_id;retainProceduralSkin(old,next);if(old.userData.fusion_pose_presets)next.userData.fusion_pose_presets=structuredClone(old.userData.fusion_pose_presets);if(old.userData.fusion_joint_limits)next.userData.fusion_joint_limits=structuredClone(old.userData.fusion_joint_limits);if(old.userData.fusion_ik){next.userData.fusion_ik=structuredClone(old.userData.fusion_ik);solveSceneIK(next);}if(next.userData.fusion_joint_limits)solveSceneIK(next);this.root.remove(old);this.root.add(next);this.select(next);this.commit();return next;}
  poseCharacter(pose){const target=findCharacter(this.selected);if(!target)throw Error('Select a character first.');if(hasSceneIK(target))throw Error('Disable IK controls before applying a whole-body pose. Their current poses will be retained.');this.editRig(target,()=>applyPose(target,pose),'Apply character pose');}
  addGarment(settings={},height=1.8){const group=createGarment(settings,height);this.root.add(group);this.select(group);this.commit();return group;}
  rebuildGarment(settings){const old=this.selected;if(old?.userData.fusion_kind!=='garment')throw Error('Select a Fusion pattern first.');const next=createGarment({...old.userData.garment,...settings},old.userData.characterHeight);next.uuid=old.uuid;next.position.copy(old.position);next.quaternion.copy(old.quaternion);next.scale.copy(old.scale);next.name=old.name;next.userData.fusion_id=old.userData.fusion_id;next.traverse(n=>{if(n.userData.fusion_cloth)n.userData.fusion_id=next.userData.fusion_id;});this.root.remove(old);this.root.add(next);this.select(next);this.commit();return next;}
  clearParametric(object){object.traverse(n=>{if(n.geometry)n.geometry=stripGarmentFinishGeometry(n.geometry,{clone:true});if(n.userData.fusion_kind)n.userData.fusion_kind='mesh';delete n.userData.fusion_sculpt_layers;delete n.userData.fusion_creator;delete n.userData.fusion_creator_part;delete n.userData.fusion_hair_preview;delete n.userData.character;delete n.userData.garment;delete n.userData.patternProject;delete n.userData.patternMeshQuality;delete n.userData.liveGarment;delete n.userData.collisionShapes;delete n.userData.fusion_ik;delete n.userData.fusion_joint_limits;delete n.userData.fusion_skin_edit;delete n.userData.fusion_pose_presets;delete n.userData.fusion_morph_presets;delete n.userData.dazNative;delete n.userData.nativeSource;delete n.userData.nativeBlend;delete n.userData.fusion_native_object;});}
  staticDuplicate(){
    if(!this.selected)throw Error('Select an object first.');const original=this.selected;original.updateWorldMatrix(true,true);original.traverse(n=>{if(n.isSkinnedMesh)n.skeleton.update();});
    const copy=new THREE.Group();copy.name=original.name+' static copy';copy.position.copy(original.position);copy.quaternion.copy(original.quaternion);copy.scale.copy(original.scale);copy.userData={source:'Static working copy',fusion_kind:'mesh',fusion_id:THREE.MathUtils.generateUUID()};
    const inverse=original.matrixWorld.clone().invert();
    original.traverse(source=>{if(!source.isMesh)return;const geometry=stripGarmentFinishGeometry(source.geometry.clone()),p=geometry.attributes.position,point=new THREE.Vector3();for(let i=0;i<p.count;i++){source.getVertexPosition(i,point);p.setXYZ(i,point.x,point.y,point.z);}geometry.deleteAttribute('skinIndex');geometry.deleteAttribute('skinWeight');geometry.morphAttributes={};geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();const mesh=new THREE.Mesh(geometry,Array.isArray(source.material)?source.material.map(m=>m.clone()):source.material.clone());mesh.name=source.name;const relative=inverse.clone().multiply(source.matrixWorld);relative.decompose(mesh.position,mesh.quaternion,mesh.scale);mesh.castShadow=true;mesh.receiveShadow=true;mesh.visible=source.visible;copy.add(mesh);});
    original.visible=false;this.root.add(copy);this.select(copy);this.commit();return copy;
  }
  shade(smooth=true){if(this.selected?.userData.modifierStack){this.change('operator-error',Error('Apply the modifier stack before changing evaluated shading.'));return;}this.selected?.traverse(n=>{if(n.isMesh){n.geometry.computeVertexNormals();for(const m of [].concat(n.material)){m.flatShading=!smooth;m.needsUpdate=true;}}});this.commit();}
  uvProject(){if(this.selected?.userData.modifierStack){this.change('operator-error',Error('Apply the modifier stack before projecting evaluated UVs.'));return;}this.selected?.traverse(n=>{if(n.isMesh&&!n.isSkinnedMesh){const g=n.geometry,p=g.attributes.position,uv=[];g.computeBoundingBox();const size=g.boundingBox.getSize(new THREE.Vector3());for(let i=0;i<p.count;i++)uv.push((p.getX(i)-g.boundingBox.min.x)/Math.max(size.x,.001),(p.getY(i)-g.boundingBox.min.y)/Math.max(size.y,.001));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));}});this.commit();}
  captureRig(owner){return {ownerId:owner.uuid,controls:structuredClone(owner.userData.fusion_ik??null),limits:structuredClone(owner.userData.fusion_joint_limits??null),deformationPose:structuredClone(owner.userData.fusion_deformation?.rotationState??null),pose:structuredClone(owner.userData.pose??null),bones:bonesOf(owner).map(bone=>({id:bone.uuid,...this.captureTransform(bone)}))};}
  applyRig(state){
    const owner=this.root.getObjectByProperty('uuid',state.ownerId);if(!owner)throw Error('Rig history target is missing.');
    const active=this.ik?.owner===owner?{id:this.ik.controlId,kind:this.ik.kind}:null;
    for(const [key,value] of [['fusion_ik',state.controls],['fusion_joint_limits',state.limits??null],['pose',state.pose]]){if(value===null)delete owner.userData[key];else owner.userData[key]=structuredClone(value);}
    if(owner.userData.fusion_deformation){if(state.deformationPose)owner.userData.fusion_deformation.rotationState=structuredClone(state.deformationPose);else delete owner.userData.fusion_deformation.rotationState;}
    for(const record of state.bones){const bone=owner.getObjectByProperty('uuid',record.id);if(!bone)throw Error('Rig history joint is missing.');bone.position.fromArray(record.position);bone.quaternion.fromArray(record.quaternion);bone.scale.fromArray(record.scale);}
    owner.updateWorldMatrix(true,true);evaluateSceneDeformation(owner);this.select(owner);if(active&&owner.userData.fusion_ik?.some(c=>c.id===active.id&&c.enabled))this.ik.attach(owner,active.id,active.kind);
  }
  finishRig(before,label='Pose rig'){if(this.batching)return;const owner=this.root.getObjectByProperty('uuid',before.ownerId);if(!owner)return;this.ensureHistory();this.journal.rig(before,this.captureRig(owner),label);this.change('scene');}
  editRig(owner,change,label){this.ensureHistory();const before=this.captureRig(owner);try{const result=change();this.finishRig(before,label);return result;}catch(error){this.applyRig(before);throw error;}}
  jointAngles(joint){return jointLocalAngles(this.selected,joint);}
  poseJoint(joint,axis,degrees){
    const owner=this.selected;if(!owner||!['x','y','z'].includes(axis)||!Number.isFinite(degrees))throw Error('Invalid joint rotation.');
    for(const c of owner.userData.fusion_ik||[])if(c.enabled&&(c.chain.some(p=>pathNode(owner,p)===joint)||(c.keepOrientation&&pathNode(owner,c.end)===joint)))throw Error('Disable the IK control before rotating a joint it drives.');
    this.editRig(owner,()=>{restoreAuthoredRotations(owner);const angles=this.jointAngles(joint);angles[axis]=degrees;const base=jointReference(owner,joint),delta=new THREE.Quaternion().setFromEuler(new THREE.Euler(angles.x*Math.PI/180,angles.y*Math.PI/180,angles.z*Math.PI/180));joint.quaternion.copy(base.multiply(delta));solveSceneIK(owner);const character=findCharacter(owner);if(character){character.userData.pose=character.userData.pose||{};character.userData.pose[joint.name]=[joint.rotation.x,joint.rotation.y,joint.rotation.z].map(n=>n*180/Math.PI);}evaluateSceneDeformation(owner);},'Rotate joint');
  }
  setReferencedMorph(property,value,commit=true){if(!this.selected?.userData.dazNative)throw Error('Select a native character first.');const meshes=[];this.selected.traverse(n=>{const map=n.morphTargetDictionary;if(n.isMesh&&map){const index=map[property.label]??map[property.name];if(index!==undefined)meshes.push({mesh:n,index});}});if(!meshes.length)throw Error('This shape is not represented by a loaded morph target. Its native conversion report explains the supported subset.');for(const {mesh,index} of meshes){mesh.morphTargetInfluences[index]=value;mesh.boundingBox=null;mesh.boundingSphere=null;}property.value=value;if(commit)this.commit();return meshes.length;}
  stats(obj=this.root){let triangles=0,meshes=0;obj.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position?.count||0)/3;}});return {meshes,triangles:Math.round(triangles)};}
  selectedMaterial(){let mat;this.selected?.traverse(o=>{if(!mat&&o.material)mat=[].concat(o.material)[0];});return mat;}
}
