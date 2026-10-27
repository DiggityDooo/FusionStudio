import * as THREE from 'three';

// Approximate blackbody colour (Tanner Helland fit), 1000–40000 K, as sRGB components in 0..1.
export function kelvinToRGB(kelvin){
  const t=Math.min(400,Math.max(10,kelvin/100));let r,g,b;
  if(t<=66){r=255;g=99.4708025861*Math.log(t)-161.1195681661;b=t<=19?0:138.5177312231*Math.log(t-10)-305.0447927307;}
  else{r=329.698727446*Math.pow(t-60,-.1332047592);g=288.1221695283*Math.pow(t-60,-.0755148492);b=255;}
  return [r,g,b].map(v=>Math.min(255,Math.max(0,v))/255);
}
export const LIGHT_KINDS={point:'Point Light',spot:'Spot Light',sun:'Sun Light',area:'Area Light'};
// Point/spot intensity is in candela and sun in lux (three.js and glTF physical units). Area lights are spots in the
// viewport and become true area lights of userData.fusion_area metres in Cycles.
export function createLight(kind){
  if(!LIGHT_KINDS[kind])throw Error('Unknown light type: '+kind);
  const light=kind==='point'?new THREE.PointLight(0xffffff,40,0,2):kind==='sun'?new THREE.DirectionalLight(0xffffff,3):new THREE.SpotLight(0xffffff,kind==='area'?60:80,0,kind==='area'?Math.PI/2:Math.PI/6,kind==='area'?1:.25,2);
  light.name=LIGHT_KINDS[kind];light.castShadow=true;light.userData.fusion_light=kind;light.userData.fusion_soft=kind==='sun'?0:.1;if(kind==='area')light.userData.fusion_area=1;
  if(light.target){light.target.name=light.name+' target';light.target.position.set(0,0,-1);light.add(light.target);}
  return light;
}
export function createCamera(source,aspect){
  const camera=new THREE.PerspectiveCamera(source.isPerspectiveCamera?source.fov:38,aspect,.01,1000);camera.name='Camera';camera.filmGauge=36;
  camera.position.copy(source.position);camera.quaternion.copy(source.quaternion);Object.assign(camera.userData,{fusion_camera:true,fusion_dof:false,fusion_fstop:2.8,fusion_focus:5});return camera;
}
export function applyKelvin(light,kelvin){light.userData.fusion_kelvin=kelvin;light.color.setRGB(...kelvinToRGB(kelvin),THREE.SRGBColorSpace);}
export const focalLength=camera=>camera.getFocalLength();

// Pickable viewport proxies for lights and cameras; kept outside the document root so they are never saved or exported.
export class SceneObjectHelpers {
  constructor(editor){this.editor=editor;this.group=new THREE.Group();this.group.name='Light and camera helpers';editor.scene.add(this.group);this.helpers=new Map();}
  owner(object){let o=object;while(o&&o.parent!==this.editor.root)o=o.parent;return o;}
  build(object){
    const group=new THREE.Group(),color=object.isCamera?0x9ecbff:0xffd75e,proxy=new THREE.Mesh(object.isCamera?new THREE.BoxGeometry(.18,.12,.24):new THREE.SphereGeometry(.07,12,8),new THREE.MeshBasicMaterial({color}));
    proxy.userData.helperFor=object;group.add(proxy);group.matrixAutoUpdate=false;
    if(object.isLight&&object.target){const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,0,-.8)]),new THREE.LineBasicMaterial({color}));group.add(line);}
    const frustum=object.isCamera?new THREE.CameraHelper(object):null;if(frustum)this.group.add(frustum);
    this.group.add(group);return {group,proxy,frustum};
  }
  sync(){
    const live=new Set(),editor=this.editor;let authored=false;
    editor.root.traverse(o=>{if(o.isLight&&o.visible)authored=true;if(!(o.isLight||o.isCamera))return;live.add(o);let h=this.helpers.get(o);if(!h){h=this.build(o);this.helpers.set(o,h);}
      const owner=this.owner(o),shown=o.visible&&owner?.visible!==false&&(!editor.localView||editor.localView.has(owner?.uuid));
      h.group.visible=shown;h.group.matrix.copy(o.matrixWorld);if(h.frustum){h.frustum.visible=shown&&o!==editor.camera;o.updateProjectionMatrix();h.frustum.update();}});
    // Authored lights replace the studio key and rim, as they do in Cycles; the dim ambient stands in for the render world.
    const {ambient,key,rim}=editor.studioLights,lit=authored||!!editor.environment;key.visible=rim.visible=!lit;ambient.intensity=editor.environment?0:authored?.6:2.3;
    for(const [o,h] of this.helpers)if(!live.has(o)){h.group.removeFromParent();h.frustum?.removeFromParent();h.frustum?.dispose();h.proxy.geometry.dispose();this.helpers.delete(o);}
  }
  pickables(){return [...this.helpers.values()].filter(h=>h.group.visible).map(h=>h.proxy);}
}

const field=(id,label,value,attrs='')=>`<label class="field-label" for="${id}">${label}</label><input id="${id}" type="number" value="${value}" ${attrs}>`;
export function sceneObjectPanel(obj,{active}={}){
  if(obj.isLight){const u=obj.userData,kind=u.fusion_light||(obj.isSpotLight?'spot':obj.isDirectionalLight?'sun':'point');
    return `<section class="inspector-section" id="light-panel"><div class="section-heading">${LIGHT_KINDS[kind]?.toUpperCase()||'LIGHT'}</div><div class="color-field"><label>Colour</label><input id="light-color" type="color" value="#${obj.color.getHexString(THREE.SRGBColorSpace)}"></div>
      <label class="check-row"><input id="light-use-kelvin" type="checkbox" ${u.fusion_kelvin?'checked':''}> Colour temperature</label>${field('light-kelvin','Temperature (K)',u.fusion_kelvin||6500,'min="1000" max="12000" step="100"')}
      ${field('light-intensity',kind==='sun'?'Illuminance (lux)':'Intensity (cd)',+obj.intensity.toFixed(3),'min="0" step="any"')}
      ${obj.isSpotLight&&kind!=='area'?field('light-angle','Cone angle (°)',+(obj.angle*360/Math.PI).toFixed(2),'min="1" max="180" step="1"')+field('light-blend','Blend',obj.penumbra,'min="0" max="1" step="0.05"'):''}
      ${kind==='area'?field('light-area','Area size (m)',u.fusion_area,'min="0.01" max="100" step="0.05"'):''}${field('light-soft','Soft shadow radius (m)',u.fusion_soft??0,'min="0" max="10" step="0.01"')}
      <label class="check-row"><input id="light-shadow" type="checkbox" ${obj.castShadow?'checked':''}> Cast shadows</label></section>`;}
  if(obj.isCamera){const u=obj.userData;return `<section class="inspector-section" id="camera-panel"><div class="section-heading">CAMERA${active?' · ACTIVE':''}</div>
    ${field('camera-focal','Focal length (mm)',+focalLength(obj).toFixed(2),'min="4" max="1200" step="1"')}${field('camera-sensor','Sensor width (mm)',obj.filmGauge,'min="1" max="100" step="0.1"')}
    ${field('camera-near','Clip start (m)',obj.near,'min="0.001" step="any"')}${field('camera-far','Clip end (m)',obj.far,'min="0.01" step="any"')}
    <label class="check-row"><input id="camera-dof" type="checkbox" ${u.fusion_dof?'checked':''}> Depth of field (Cycles)</label>${field('camera-fstop','F-stop',u.fusion_fstop??2.8,'min="0.5" max="64" step="0.1"')}${field('camera-focus','Focus distance (m)',u.fusion_focus??5,'min="0.01" step="any"')}
    <div class="shade-buttons"><button id="camera-active">${active?'Active camera':'Set active camera'}</button><button id="camera-look">Look through</button><button id="camera-align">Align to view</button></div></section>`;}
  return '';
}
// Applies one inspector edit; returns false when the value is invalid.
export function editSceneObject(obj,key,value){
  const n=Number(value),finite=Number.isFinite(n);
  switch(key){
    case 'light-color':obj.color.set(value);delete obj.userData.fusion_kelvin;return true;
    case 'light-use-kelvin':if(value)applyKelvin(obj,obj.userData.fusion_kelvin||6500);else delete obj.userData.fusion_kelvin;return true;
    case 'light-kelvin':if(!finite||n<1000||n>12000)return false;applyKelvin(obj,n);return true;
    case 'light-intensity':if(!finite||n<0)return false;obj.intensity=n;return true;
    case 'light-angle':if(!finite||n<1||n>180)return false;obj.angle=n*Math.PI/360;return true;
    case 'light-blend':if(!finite||n<0||n>1)return false;obj.penumbra=n;return true;
    case 'light-area':if(!finite||n<.01||n>100)return false;obj.userData.fusion_area=n;return true;
    case 'light-soft':if(!finite||n<0||n>10)return false;obj.userData.fusion_soft=n;return true;
    case 'light-shadow':obj.castShadow=!!value;return true;
    case 'camera-focal':if(!finite||n<4||n>1200)return false;obj.setFocalLength(n);return true;
    case 'camera-sensor':if(!finite||n<1||n>100)return false;{const f=obj.getFocalLength();obj.filmGauge=n;obj.setFocalLength(f);}return true;
    case 'camera-near':if(!finite||n<=0||n>=obj.far)return false;obj.near=n;obj.updateProjectionMatrix();return true;
    case 'camera-far':if(!finite||n<=obj.near)return false;obj.far=n;obj.updateProjectionMatrix();return true;
    case 'camera-dof':obj.userData.fusion_dof=!!value;return true;
    case 'camera-fstop':if(!finite||n<.5||n>64)return false;obj.userData.fusion_fstop=n;return true;
    case 'camera-focus':if(!finite||n<=0)return false;obj.userData.fusion_focus=n;return true;
  }
  return false;
}
