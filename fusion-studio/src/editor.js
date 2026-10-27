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
import {SceneObjectHelpers,createLight,createCamera} from './scene-objects.js';
import {normalizeRenderSettings} from './render-ui.js';
import {checkerTexture} from './uv-tools.js';

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
    const pointerDown=this.transform.pointerDown.bind(this.transform);this.transform.pointerDown=p=>{this.transform.getHelper().updateMatrixWorld(true);pointerDown(p);};
    this.transform.addEventListener('dragging-changed',e=>{this.orbit.enabled=!e.value;if(e.value){this.timeline.playing=false;this.transformStart=this.ik?.active?{ik:true,before:this.captureRig(this.ik.owner)}:this.selected?{id:this.selected.uuid,before:this.captureTransform(this.selected)}:null;}else if(this.transformStart){const gesture=this.transformStart;this.transformStart=null;if(this.operators)this.operators.run(gesture.ik?'rig.ik_finish':'object.transform_gesture',gesture).catch(error=>this.change('operator-error',error));else if(gesture.ik)this.finishRig(gesture.before);else this.finishTransform(gesture);}});
    this.transform.addEventListener('objectChange',()=>{if(this.ik?.active){try{this.ik.preview();}catch(error){this.change('operator-error',error);}}else this.change('transform');});
    this.outline=new THREE.BoxHelper(new THREE.Object3D(),0xe8b28a);this.outline.visible=false;this.scene.add(this.outline);
    this.ray=new THREE.Raycaster();this.pointer=new THREE.Vector2();this.down=null;
    this.renderer.domElement.addEventListener('pointerdown',e=>{this.down={x:e.clientX,y:e.clientY};});
    this.renderer.domElement.addEventListener('pointerup',e=>{if(!this.down || Math.hypot(e.clientX-this.down.x,e.clientY-this.down.y)>5 || this.transform.dragging || this.transform.axis)return;this.pointer.copy(this.ndc(e));this.ray.setFromCamera(this.pointer,this.camera);const hit=this.ray.intersectObjects([...this.root.children.filter(o=>!this.localView||this.localView.has(o.uuid)),...this.sceneHelpers.pickables()],true).sort((a,b)=>a.distance-b.distance).map(h=>h.object.userData.helperFor?{...h,object:h.object.userData.helperFor}:h).find(h=>{if(!this.unclipped(h))return false;let o=h.object;while(o&&o!==this.root){if(!o.visible)return false;o=o.parent;}return true;});let obj=hit?.object;while(obj&&obj.parent!==this.root)obj=obj.parent;this.select(obj||null);});
    this.perspectiveCamera=this.camera;this.resize=new ResizeObserver(()=>{const w=element.clientWidth,h=element.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);this.fitCameras();});this.resize.observe(element);
    // The quad view under the pointer becomes active before any tool sees the event.
    const hover=e=>{if(this.quad&&(e.type==='pointerdown'||!e.buttons)&&!this.transform.dragging)this.activateView(this.viewAt(e));};element.addEventListener('pointerdown',hover,true);element.addEventListener('pointermove',hover,true);
    this.history=[];this.historyAt=-1;this.wireframe=false;this.tool='translate';this.localView=null;this.quad=null;this.section=null;this.bookmarks=[];this.xray=false;this.xrayMaterials=new WeakMap();this.measure=new MeasureTool(this);this.sceneHelpers=new SceneObjectHelpers(this);this.viewFov=this.camera.fov;this.ik=new IKHandles(this);this.meshTools=new MeshTools(this);this.timeline=new Timeline(this);
    this.renderer.setAnimationLoop(time=>{this.timeline.tick(time);this.ik.sync();this.weightPaint?.sync();this.navigation?.tick(time);this.orbit.update();if(this.selected)this.outline.setFromObject(this.selected);const isolated=this.localView&&this.root.children.filter(o=>o.visible&&!this.localView.has(o.uuid));for(const o of isolated||[])o.visible=false;this.sceneHelpers.sync();const swapped=this.xray?this.applyXray():this.uvChecker?this.applyChecker():null;this.draw();for(const [mesh,material] of swapped||[])mesh.material=material;for(const o of isolated||[])o.visible=true;this.measure.sync();});
  }
  material(color=colors.clay){return new THREE.MeshStandardMaterial({color,roughness:.58,metalness:.05});}
  mesh(name,geometry,color,position=[0,0,0],scale=[1,1,1],rotation=[0,0,0]){
    const obj=new THREE.Mesh(geometry,this.material(color));obj.name=name;obj.position.fromArray(position);obj.scale.fromArray(scale);obj.rotation.set(...rotation);obj.castShadow=true;obj.receiveShadow=true;obj.userData.source='Fusion';return obj;
  }
  primitive(type){return this.operators?this.operators.run('mesh.add_'+type):this._primitive(type);}
  _primitive(type){
    const geometry={cube:()=>new THREE.BoxGeometry(1,1,1,1,1,1),sphere:()=>new THREE.SphereGeometry(.6,48,32),cylinder:()=>new THREE.CylinderGeometry(.5,.5,1.2,48),torus:()=>new THREE.TorusGeometry(.6,.18,24,64),plane:()=>new THREE.BoxGeometry(2,.06,2),cone:()=>new THREE.ConeGeometry(.65,1.4,48),capsule:()=>new THREE.CapsuleGeometry(.4,.8,12,32)}[type];
    if(!geometry)return;return this.insertObject(this.mesh(type[0].toUpperCase()+type.slice(1),geometry(),colors.clay,[0,.7,0]),'Add '+type);
  }
  template(name){
    this.select(null);this.bookmarks=[];this.disposeRoot();this.root=new THREE.Group();this.root.name='Workspace';this.scene.add(this.root);
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
  disposeRoot(){this.scene.remove(this.root);this.root.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of [].concat(o.material))m.dispose();}});}
  select(obj){if(this.weightPaint?.active&&obj!==this.weightPaint.owner)this.weightPaint.stop(false);this.ik?.detach();this.selected=obj;this.transform.detach();this.outline.visible=!!obj;if(obj){if(this.tool!=='select'&&(!this.meshTools||this.meshTools.mode==='object'))this.transform.attach(obj);this.outline.setFromObject(obj);}this.change('selection');}
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
  draw(){
    const r=this.renderer;if(!this.quad){r.render(this.scene,this.camera);return;}
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
  insertObject(object,label){this.ensureHistory();object.updateMatrix();this.root.add(object);this.select(object);this.journal.insert(object.toJSON(),label);this.change('scene');return object;}
  addLight(kind){const light=createLight(kind),target=this.orbit.target;light.position.copy(target).add(new THREE.Vector3(2,3,2));light.lookAt(target);return this.insertObject(light,'Add '+light.name);}
  addCamera(){const camera=createCamera(this.camera,this.renderAspect||1.2);this.insertObject(camera,'Add camera');if(!this.activeCamera())this.setActiveCamera(camera);return camera;}
  activeCamera(){const id=this.root.userData.fusion_active_camera;return id?this.root.getObjectByProperty('uuid',id)??null:null;}
  setActiveCamera(camera){if(!camera?.isCamera)throw Error('Select a camera first.');this.root.userData.fusion_active_camera=camera.uuid;this.commit();}
  // Camera view: the viewport adopts the scene camera's pose and field of view; orbiting afterwards leaves the camera untouched.
  lookThrough(camera=this.activeCamera()){if(!camera)throw Error('Add or choose an active camera first.');this.settleOrbit();this.setProjection(false);camera.updateWorldMatrix(true,false);const c=this.camera;camera.matrixWorld.decompose(c.position,c.quaternion,new THREE.Vector3());c.fov=camera.fov;c.updateProjectionMatrix();this.orbit.target.copy(c.position).addScaledVector(new THREE.Vector3(0,0,-1).applyQuaternion(c.quaternion),camera.userData.fusion_focus||5);this.orbit.update();this.change('view');}
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
  view(name){this.settleOrbit();if(this.camera.isPerspectiveCamera&&this.camera.fov!==this.viewFov){this.camera.fov=this.viewFov;this.camera.updateProjectionMatrix();}const offset={front:[0,0,1],back:[0,0,-1],right:[1,0,0],left:[-1,0,0],top:[0,1,.001],bottom:[0,-1,.001],perspective:[.7,.4,1]}[name];const dist=this.camera.position.distanceTo(this.orbit.target);this.camera.position.copy(this.orbit.target).add(new THREE.Vector3(...offset).normalize().multiplyScalar(dist));this.orbit.update();}
  snap(on){this.transform.setTranslationSnap(on?.1:null);this.transform.setRotationSnap(on?THREE.MathUtils.degToRad(15):null);this.transform.setScaleSnap(on?.1:null);}
  wire(on){this.wireframe=on;this.root.traverse(o=>{if(o.material)for(const m of [].concat(o.material))m.wireframe=on;});}
  remove(){if(!this.selected)return;this.root.remove(this.selected);this.select(null);this.commit();}
  duplicate(offset=true){if(!this.selected)return;const obj=cloneSkeleton(this.selected),id=THREE.MathUtils.generateUUID();obj.traverse(o=>{if(o.geometry)o.geometry=o.geometry.clone();if(o.material)o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();if(o.userData.fusion_id)o.userData.fusion_id=id;});obj.userData.fusion_id=id;if(offset)obj.position.x+=.3;obj.name+=' copy';this.root.add(obj);this.select(obj);this.commit();return obj;}
  rename(name){if(this.selected){this.selected.name=name.slice(0,80)||'Object';this.commit();}}
  transformField(kind,axis,value){return this.operators?this.operators.run('object.transform',{kind,axis,value}):this._transformField(kind,axis,value);}
  _transformField(kind,axis,value){if(!this.selected||!Number.isFinite(value))return;const before=this.captureTransform(this.selected);if(kind==='scale'&&Math.abs(value)<.001)value=.001;this.selected[kind][axis]=kind==='rotation'?THREE.MathUtils.degToRad(value):value;this.finishTransform({id:this.selected.uuid,before});}
  captureTransform(object){object.updateMatrix();return {position:object.position.toArray(),quaternion:object.quaternion.toArray(),scale:object.scale.toArray(),matrix:object.matrix.toArray()};}
  finishTransform({id,before}){const object=this.root.getObjectByProperty('uuid',id);if(!object)return;try{validateIKScales(this.root);}catch(error){object.position.fromArray(before.position);object.quaternion.fromArray(before.quaternion);object.scale.fromArray(before.scale);object.updateMatrixWorld(true);this.change('transform');throw error;}this.ensureHistory();this.journal.transform(id,before,this.captureTransform(object));this.change('scene');}
  adjustTransform({kind,axis,value}){const entry=this.journal.entries.at(-1),object=this.root.getObjectByProperty('uuid',entry.id);if(!object)throw Error('Transform target is missing');const before=this.captureTransform(object);if(kind==='scale'&&Math.abs(value)<.001)value=.001;object[kind][axis]=kind==='rotation'?THREE.MathUtils.degToRad(value):value;try{validateIKScales(this.root);}catch(error){object.position.fromArray(before.position);object.quaternion.fromArray(before.quaternion);object.scale.fromArray(before.scale);object.updateMatrixWorld(true);throw error;}entry.after=this.captureTransform(object);this.journal.cacheTransform(entry.id,entry.after);this.select(object);this.journal.onChange();this.change('scene');}
  surface(key,value){if(!this.selected)return;const creator=creatorRoot(this.selected);if(creator){if(!['color','roughness','metalness'].includes(key)||this.selected.isMesh&&this.selected!==creator.getObjectByName('Body')){this.change('operator-error',Error('Edit generated eye and hair materials in Character > Skin or Hair.'));return;}this.ensureHistory();const recipe=structuredClone(creator.userData.fusion_creator.recipe);recipe.appearance[key==='color'?'customColor':key]=value;try{changeCreator(creator,recipe);}catch(error){this.change('operator-error',error);return;}this.commit();return;}if(this.selected.userData.modifierStack){this.change('operator-error',Error('Apply the modifier stack before changing evaluated materials.'));return;}this.selected.traverse(o=>{if(o.material)for(const m of [].concat(o.material)){if(key==='color')m.color.set(value);else m[key]=value;m.needsUpdate=true;}});this.commit();}
  visible(id){const obj=this.root.children.find(o=>o.uuid===id);if(obj){obj.visible=!obj.visible;if(obj===this.selected&&!obj.visible)this.select(null);this.commit();}}
  serialize(){
    // Save current channels even when no render has occurred since an edit.
    this.root.updateMatrixWorld(true);
    this.root.traverse(n=>{if(n.geometry&&!n.geometry.boundingSphere)n.geometry.computeBoundingSphere();});
    this.imageJSONCache??=new WeakMap();const document=serializeScene(this.root,this.imageJSONCache,creatorDerivedGeometry(this.root)),geometries=new Map(),nodes=new Map();
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
    const physical=new Map();this.root.traverse(n=>{for(const m of [].concat(n.material||[]))if(m.isMeshPhysicalMaterial)physical.set(m.uuid,m);});
    for(const material of document.materials||[])if(physical.has(material.uuid)){material.ior=physical.get(material.uuid).ior;delete material.reflectivity;}
    return document;
  }
  document(name){if(this.creatorShapeSession)throw Error('Apply or cancel the shape-key edit before saving.');return {format:'fusion-studio',version:2,applicationVersion:appPackage.version,projectId:this.root.uuid,name,units:'meters',manifest:{schema:2,evaluation:'dependency-graph-v1',geometry:'three-json-embedded'},scene:this.serialize(),timeline:{frame:this.timeline.frame,end:this.timeline.end,fps:this.timeline.fps},camera:{position:this.camera.position.toArray(),target:this.orbit.target.toArray()},...this.bookmarks.length?{views:structuredClone(this.bookmarks)}:{},...this.renderSettings?{render:structuredClone(this.renderSettings)}:{}};}
  async restore(json,{preserveFrame=false,fromHistory=false}={}){const frame=this.timeline.frame;this.evaluation?.invalidate();if(fromHistory)json=this.historyImages.expand(json);const root=await new ProjectLoader().parseAsync(json);root.traverse(n=>{validateGarmentFinishing(n);if(n.userData.liveGarment?.settings?.fabricResponse)fabricResponse(n.userData.liveGarment.settings.fabricResponse);if(n.userData.liveGarment?.fittedSurface)validateFittedSurface(n.userData.liveGarment.fittedSurface);if(n.userData.fusion_joint_limits)validateJointLimits(n);validatePoseLibrary(n);validateSkinEdit(n);if(n.userData.fusion_body_measurements)validateMeasurementSnapshot(n.userData.fusion_body_measurements);validateFormulaRotations(n);});this.select(null);this.disposeRoot();this.root=root;this.scene.add(root);root.traverse(o=>{if(o.isMesh&&!creatorRoot(o)){o.castShadow=true;o.receiveShadow=true;}});this.wire(this.wireframe);this.components?.reset();this.meshTools.setMode('object');this.timeline.reset();if(preserveFrame)this.timeline.frame=frame;this.change('scene');}
  async load(doc){const vec=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);if(doc.views!==undefined&&!(Array.isArray(doc.views)&&doc.views.every(b=>typeof b?.name==='string'&&vec(b.position)&&vec(b.target))))throw Error('Saved view bookmarks are invalid.');const render=doc.render===undefined?null:normalizeRenderSettings(doc.render);await this.restore(doc.scene);if(render&&this.renderSettings)Object.assign(this.renderSettings,render);this.bookmarks=structuredClone(doc.views||[]);if(doc.camera){this.camera.position.fromArray(doc.camera.position);this.orbit.target.fromArray(doc.camera.target);}else this.frame(this.root);if(doc.timeline){this.timeline.end=doc.timeline.end;this.timeline.fps=doc.timeline.fps;this.timeline.evaluate(doc.timeline.frame);}this.history=[];this.historyAt=-1;this.commit();}
  ensureHistory(){
    if(!this.journal||this.history.length===0){
      this.historyImages=new HistoryImages();
      this.journal=new CommandHistory({capture:()=>this.historyImages.capture(this.serialize()),restore:doc=>this.restore(doc,{preserveFrame:true,fromHistory:true}),applyMetadata:(id,key,value)=>{const object=this.root.getObjectByProperty('uuid',id);if(!object||key!=='fusion_body_measurements')throw Error('Measurement history target is missing or invalid.');if(value)validateMeasurementSnapshot(value);if(value===null)delete object.userData[key];else object.userData[key]=structuredClone(value);this.evaluation?.invalidate();},applyRig:state=>this.applyRig(state),applyInsertion:async(id,data)=>{const prior=this.root.getObjectByProperty('uuid',id);if(prior){this.root.remove(prior);if(this.selected===prior)this.select(null);prior.geometry?.dispose();for(const mat of [].concat(prior.material||[]))mat.dispose();}if(data){const object=await new ProjectLoader().parseAsync(data);this.root.add(object);this.select(object);}},applyTransform:(id,state)=>{const object=this.root.getObjectByProperty('uuid',id);if(!object)throw Error('History target is missing');object.position.fromArray(state.position);object.quaternion.fromArray(state.quaternion);object.scale.fromArray(state.scale);object.updateMatrixWorld(true);},onChange:()=>{if(this.journal&&this.historyImages.payloads.size>8)this.historyImages.prune([this.journal.baseline,...this.journal.entries.filter(e=>e.type==='snapshot').flatMap(e=>[e.before,e.after])]);this.history=[{label:'Initial state'},...this.journal.entries];this.historyAt=this.journal.cursor;}});
      this.journal.reset();
    }
  }
  commit(){this.evaluation?.invalidate();if(this.journal?.restoring||this.batching)return;this.ensureHistory();this.journal.snapshot();this.change('scene');}
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
    if(this.creatorShapeSession)throw Error('Apply or cancel the shape-key edit before exporting or rendering.');
    const content=new THREE.Scene();const source=selectedOnly&&this.selected?[this.selected]:this.root.children;
    for(const object of source){const report=evaluateCharacter(object);if(!report.valid)throw Error('Resolve or pause character dependency errors before export or rendering.');}const animations=includeAnimations?this.timeline.exportClips():[];
    for(const obj of source)if(obj.visible&&!obj.userData.fusion_reference&&(!excludeNative||!obj.userData.nativeBlend)){const report=evaluateCharacter(obj);if(!report.valid)throw Error('Resolve or pause character dependency errors before export or rendering.');const evaluated=await stackExportObject(obj),copy=cloneSkeleton(evaluated),original=[],cloned=[];evaluated.traverse(n=>original.push(n));copy.traverse(n=>cloned.push(n));for(let i=0;i<original.length;i++){cloned[i].uuid=original[i].uuid;delete cloned[i].userData.fusion_ik;delete cloned[i].userData.fusion_joint_limits;delete cloned[i].userData.fusion_pose_presets;delete cloned[i].userData.fusion_skin_edit;delete cloned[i].userData.fusion_body_measurements;if(cloned[i].geometry)cloned[i].geometry=stripGarmentFinishGeometry(cloned[i].geometry,{clone:true});if(cloned[i].userData.liveGarment){delete cloned[i].userData.liveGarment.finish;delete cloned[i].userData.liveGarment.finishDiagnostics;delete cloned[i].userData.liveGarment.placement;delete cloned[i].userData.liveGarment.placementDiagnostics;delete cloned[i].userData.liveGarment.fittedSurface;delete cloned[i].userData.liveGarment.fittedDiagnostics;}delete cloned[i].userData.fusion_morph_presets;delete cloned[i].userData.nativeBlend;delete cloned[i].userData.modifierStack;if(cloned[i].isPerspectiveCamera)cloned[i].userData.fusion_vfov=cloned[i].fov;if(cloned[i].isLight)cloned[i].userData.fusion_intensity=cloned[i].intensity;}bakeCharacterExchange(copy);copy.userData.fusion_id=obj.userData.fusion_id||obj.uuid;content.add(copy);if(includeAnimations&&!this.timeline.needsIKBake())obj.traverse(node=>{for(const clip of node.animations||[])if(!animations.includes(clip))animations.push(clip);});}
    if(signal?.aborted)throw Error('GLB export cancelled.');
    this.lastTangentReport=generateTangents?await addExchangeTangents(content,{signal}):null;
    const buffer=await new GLTFExporter().parseAsync(content,{binary:true,onlyVisible:true,animations});
    if(signal?.aborted)throw Error('GLB export cancelled.');
    const bytes=new Uint8Array(buffer);let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);
  }
  characterRenderMaterials(){return creatorRenderMaterials(this.root);}
  async importGLB(base64,name,replace=null){
    const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));const gltf=await new GLTFLoader().parseAsync(bytes.buffer,'');
    let authoredExchange=false;gltf.scene.traverse(n=>{if(n.userData.fusion_deformation)authoredExchange=true;});if(authoredExchange)bakeCharacterExchange(gltf.scene);const group=gltf.scene;group.traverse(n=>{if(n.isMesh)n.geometry=compactPrimitive(n.geometry);});group.name=name;group.userData.source='Imported';group.animations=gltf.animations;
    group.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}if(o.isBone)o.userData.fusion_source_quaternion=o.quaternion.toArray();});
    if(replace){this.root.remove(replace);}this.root.add(group);this.timeline.register(group,gltf.animations);this.select(group);this.commit();this.frame(group);return group;
  }
  attachNativeScene(owner,resource){attachNativeScene(owner,resource);this.commit();}
  addCharacter(settings={}){const group=createCharacter(settings);this.root.add(group);this.select(group);this.commit();this.frame(group);return group;}
  rebuildCharacter(settings){const old=findCharacter(this.selected);if(!old)throw Error('Select a Fusion character first.');const pose={},bones=new Map();old.traverse(n=>{if(n.isBone){pose[n.name]=[n.rotation.x,n.rotation.y,n.rotation.z].map(v=>v*180/Math.PI);bones.set(n.name,n.uuid);}});const next=createCharacter({...old.userData.character,...settings},pose);next.uuid=old.uuid;next.traverse(n=>{if(n.isBone&&bones.has(n.name))n.uuid=bones.get(n.name);});next.name=old.name;next.position.copy(old.position);next.quaternion.copy(old.quaternion);next.scale.multiply(old.scale).multiplyScalar(1.8/old.userData.character.height);next.userData.fusion_id=old.userData.fusion_id;retainProceduralSkin(old,next);if(old.userData.fusion_pose_presets)next.userData.fusion_pose_presets=structuredClone(old.userData.fusion_pose_presets);if(old.userData.fusion_joint_limits)next.userData.fusion_joint_limits=structuredClone(old.userData.fusion_joint_limits);if(old.userData.fusion_ik){next.userData.fusion_ik=structuredClone(old.userData.fusion_ik);solveSceneIK(next);}if(next.userData.fusion_joint_limits)solveSceneIK(next);this.root.remove(old);this.root.add(next);this.select(next);this.commit();return next;}
  poseCharacter(pose){const target=findCharacter(this.selected);if(!target)throw Error('Select a character first.');if(hasSceneIK(target))throw Error('Disable IK controls before applying a whole-body pose. Their current poses will be retained.');this.editRig(target,()=>applyPose(target,pose),'Apply character pose');}
  addGarment(settings={},height=1.8){const group=createGarment(settings,height);this.root.add(group);this.select(group);this.commit();return group;}
  rebuildGarment(settings){const old=this.selected;if(old?.userData.fusion_kind!=='garment')throw Error('Select a Fusion pattern first.');const next=createGarment({...old.userData.garment,...settings},old.userData.characterHeight);next.uuid=old.uuid;next.position.copy(old.position);next.quaternion.copy(old.quaternion);next.scale.copy(old.scale);next.name=old.name;next.userData.fusion_id=old.userData.fusion_id;next.traverse(n=>{if(n.userData.fusion_cloth)n.userData.fusion_id=next.userData.fusion_id;});this.root.remove(old);this.root.add(next);this.select(next);this.commit();return next;}
  clearParametric(object){object.traverse(n=>{if(n.geometry)n.geometry=stripGarmentFinishGeometry(n.geometry,{clone:true});if(n.userData.fusion_kind)n.userData.fusion_kind='mesh';delete n.userData.fusion_creator;delete n.userData.fusion_creator_part;delete n.userData.fusion_hair_preview;delete n.userData.character;delete n.userData.garment;delete n.userData.patternProject;delete n.userData.patternMeshQuality;delete n.userData.liveGarment;delete n.userData.collisionShapes;delete n.userData.fusion_ik;delete n.userData.fusion_joint_limits;delete n.userData.fusion_skin_edit;delete n.userData.fusion_pose_presets;delete n.userData.fusion_morph_presets;delete n.userData.dazNative;delete n.userData.nativeSource;delete n.userData.nativeBlend;delete n.userData.fusion_native_object;});}
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
