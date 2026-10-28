import * as THREE from 'three';
import {LIGHT_KINDS,AREA_KINDS,POINT_KINDS,LIGHT_UNITS,RAY_KEYS,defaultUnit,authoredPower,applyAuthoredPower,mixerOf,applyLightRays,setBarnDoors} from './lighting.js';
import {cameraDefaults,captureCameraRest,applyCameraPreset,stampCameraExtras,CAMERA_PRESETS,CAMERA_RIGS,PANO_TYPES,GUIDE_TYPES} from './cameras.js';
export {LIGHT_KINDS,LIGHT_RIGS,lightingSidecar,makeMeshLight,paintPlacement,sunSkyRecord,solarPosition,applyMixer,mixerOf} from './lighting.js';
export {CAMERA_PRESETS,CAMERA_RIGS,PANO_TYPES,GUIDE_TYPES,cameraSidecar,applyCameraPreset,stampCameraExtras,assembleCameraRig,validateCameraTrack,guideMarkup} from './cameras.js';

// Approximate blackbody colour (Tanner Helland fit), 1000–40000 K, as sRGB components in 0..1.
export function kelvinToRGB(kelvin){
  const t=Math.min(400,Math.max(10,kelvin/100));let r,g,b;
  if(t<=66){r=255;g=99.4708025861*Math.log(t)-161.1195681661;b=t<=19?0:138.5177312231*Math.log(t-10)-305.0447927307;}
  else{r=329.698727446*Math.pow(t-60,-.1332047592);g=288.1221695283*Math.pow(t-60,-.0755148492);b=255;}
  return [r,g,b].map(v=>Math.min(255,Math.max(0,v))/255);
}
// Point/spot intensity is in candela and sun in lux (three.js and glTF physical units). Area/disk/tube lights are spots in the
// viewport and become true area lights of userData.fusion_area metres in Cycles. Sphere lights are points with a radius.
export function createLight(kind){
  if(!LIGHT_KINDS[kind])throw Error('Unknown light type: '+kind);
  const light=POINT_KINDS.has(kind)?new THREE.PointLight(0xffffff,40,0,2):kind==='sun'?new THREE.DirectionalLight(0xffffff,3):new THREE.SpotLight(0xffffff,AREA_KINDS.has(kind)?60:80,0,AREA_KINDS.has(kind)?Math.PI/2:Math.PI/6,AREA_KINDS.has(kind)?1:.25,2);
  const u=light.userData;light.name=LIGHT_KINDS[kind];light.castShadow=true;
  Object.assign(u,{fusion_light:kind,fusion_soft:kind==='sun'?0:kind==='sphere'?.25:.1,fusion_unit:defaultUnit(kind),fusion_power:light.intensity,fusion_group:'',fusion_portal:false,fusion_contact:false,fusion_caustics:false,fusion_volume:0,fusion_rays:{camera:true,diffuse:true,glossy:true,transmission:true,volumeScatter:true,shadow:true},fusion_barn:[0,0,0,0],fusion_link_include:[],fusion_link_exclude:[]});
  if(AREA_KINDS.has(kind)){u.fusion_area=kind==='tube'?2:1;u.fusion_area_shape=kind==='disk'?'DISK':kind==='tube'?'RECTANGLE':'SQUARE';if(kind==='tube')u.fusion_area_y=.15;}
  if(light.target){light.target.name=light.name+' target';light.target.position.set(0,0,-1);light.add(light.target);}
  return light;
}
export function createCamera(source,aspect,opts={}){
  const near=.01,far=1000;let camera;
  if(opts.ortho){const h=opts.orthoHeight||4;camera=new THREE.OrthographicCamera(-h*aspect/2,h*aspect/2,h/2,-h/2,near,far);camera.userData.fusion_ortho=true;camera.userData.fusion_ortho_height=h;}
  else{camera=new THREE.PerspectiveCamera(source.isPerspectiveCamera?source.fov:38,aspect,near,far);camera.filmGauge=36;}
  camera.name=opts.ortho?'Ortho Camera':'Camera';camera.position.copy(source.position);camera.quaternion.copy(source.quaternion);
  Object.assign(camera.userData,cameraDefaults(opts.ortho?{fusion_ortho:true,fusion_ortho_height:opts.orthoHeight||4}:{}));captureCameraRest(camera);stampCameraExtras(camera);return camera;
}
export function applyKelvin(light,kelvin){light.userData.fusion_kelvin=kelvin;light.color.setRGB(...kelvinToRGB(kelvin),THREE.SRGBColorSpace);}
export const focalLength=camera=>camera.getFocalLength();

// Pickable viewport proxies for lights and cameras; kept outside the document root so they are never saved or exported.
export class SceneObjectHelpers {
  constructor(editor){this.editor=editor;this.group=new THREE.Group();this.group.name='Light and camera helpers';editor.scene.add(this.group);this.helpers=new Map();}
  owner(object){let o=object;while(o&&o.parent!==this.editor.root)o=o.parent;return o;}
  build(object){
    const group=new THREE.Group(),kind=object.userData.fusion_light,color=object.isCamera?0x9ecbff:object.userData.fusion_portal?0x88e0ff:0xffd75e;
    const geo=object.isCamera?new THREE.BoxGeometry(.18,.12,.24):kind==='tube'?new THREE.CylinderGeometry(.04,.04,.35,8):kind==='disk'||kind==='area'?new THREE.CircleGeometry(.12,16):kind==='sun'?new THREE.ConeGeometry(.08,.18,8):new THREE.SphereGeometry(kind==='sphere'?.11:.07,12,8);
    const proxy=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));
    proxy.userData.helperFor=object;group.add(proxy);group.matrixAutoUpdate=false;
    if(object.isLight&&object.target){const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,0,-.8)]),new THREE.LineBasicMaterial({color}));group.add(line);}
    const frustum=object.isCamera?new THREE.CameraHelper(object):null;if(frustum)this.group.add(frustum);
    this.group.add(group);return {group,proxy,frustum};
  }
  sync(){
    const live=new Set(),editor=this.editor;let authored=false;
    const mixer=mixerOf(editor.root);
    editor.root.traverse(o=>{if(o.isLight&&o.visible){authored=true;if(o.userData.fusion_light)applyAuthoredPower(o,mixer);}if(!(o.isLight||o.isCamera))return;live.add(o);let h=this.helpers.get(o);if(!h){h=this.build(o);this.helpers.set(o,h);}
      const owner=this.owner(o),shown=o.visible&&owner?.visible!==false&&(!editor.localView||editor.localView.has(owner?.uuid));
      h.group.visible=shown;h.group.matrix.copy(o.matrixWorld);if(h.frustum){h.frustum.visible=shown&&o!==editor.camera;o.updateProjectionMatrix();h.frustum.update();}});
    // Authored lights replace the studio key and rim, as they do in Cycles; the dim ambient stands in for the render world.
    const {ambient,key,rim}=editor.studioLights,lit=authored||!!editor.environment;key.visible=rim.visible=!lit;ambient.intensity=editor.environment?0:authored?.6:2.3;
    for(const [o,h] of this.helpers)if(!live.has(o)){h.group.removeFromParent();h.frustum?.removeFromParent();h.frustum?.dispose();h.proxy.geometry.dispose();this.helpers.delete(o);}
  }
  pickables(){return [...this.helpers.values()].filter(h=>h.group.visible).map(h=>h.proxy);}
}

const field=(id,label,value,attrs='')=>`<label class="field-label" for="${id}">${label}</label><input id="${id}" type="number" value="${value}" ${attrs}>`;
const opt=(v,label,cur)=>`<option value="${v}" ${String(cur)===String(v)?'selected':''}>${label}</option>`;
const UNIT_LABEL={cd:'Intensity (cd)',lm:'Luminous flux (lm)',lux:'Illuminance (lux)',nits:'Luminance (nits)',ev:'Exposure (EV)'};
export function sceneObjectPanel(obj,{active}={}){
  if(obj.isLight){const u=obj.userData,kind=u.fusion_light||(obj.isSpotLight?'spot':obj.isDirectionalLight?'sun':'point'),unit=u.fusion_unit||defaultUnit(kind),power=authoredPower(obj),flags=u.fusion_rays||{};
    const units=kind==='sun'?['lux','ev']:AREA_KINDS.has(kind)?['cd','nits','lm','ev']:['cd','lm','ev'];
    return `<section class="inspector-section" id="light-panel"><div class="section-heading">${LIGHT_KINDS[kind]?.toUpperCase()||'LIGHT'}</div><div class="color-field"><label>Colour</label><input id="light-color" type="color" value="#${obj.color.getHexString(THREE.SRGBColorSpace)}"></div>
      <label class="check-row"><input id="light-use-kelvin" type="checkbox" ${u.fusion_kelvin?'checked':''}> Colour temperature</label>${field('light-kelvin','Temperature (K)',u.fusion_kelvin||6500,'min="1000" max="12000" step="100"')}
      <label class="field-label" for="light-unit">Units</label><select id="light-unit">${units.map(v=>opt(v,v,unit)).join('')}</select>
      ${field('light-intensity',UNIT_LABEL[unit]||'Intensity',+Number(power).toFixed(3),unit==='ev'?'min="-10" max="16" step="0.1"':'min="0" step="any"')}
      ${obj.isSpotLight&&!AREA_KINDS.has(kind)?field('light-angle','Cone angle (°)',+(obj.angle*360/Math.PI).toFixed(2),'min="1" max="180" step="1"')+field('light-blend','Blend',obj.penumbra,'min="0" max="1" step="0.05"'):''}
      ${AREA_KINDS.has(kind)?field('light-area',kind==='tube'?'Length (m)':'Area size (m)',u.fusion_area||1,'min="0.01" max="100" step="0.05"'):''}
      ${kind==='tube'?field('light-area-y','Diameter (m)',u.fusion_area_y||.15,'min="0.01" max="100" step="0.01"'):''}
      ${field('light-soft',kind==='sun'?'Sun angle (rad)':kind==='sphere'?'Radius (m)':'Soft shadow radius (m)',u.fusion_soft??0,'min="0" max="10" step="0.01"')}
      <label class="field-label" for="light-group">Light group</label><input id="light-group" type="text" maxlength="40" value="${u.fusion_group||''}" placeholder="Key / Fill / Rim">
      <label class="check-row"><input id="light-shadow" type="checkbox" ${obj.castShadow?'checked':''}> Cast shadows</label>
      <label class="check-row"><input id="light-portal" type="checkbox" ${u.fusion_portal?'checked':''}> Portal (interiors)</label>
      <label class="check-row"><input id="light-contact" type="checkbox" ${u.fusion_contact?'checked':''}> Contact shadows</label>
      <label class="check-row"><input id="light-caustics" type="checkbox" ${u.fusion_caustics?'checked':''}> Caustics caster</label>
      ${field('light-volume','Volume / god-ray density',u.fusion_volume||0,'min="0" max="10" step="0.05"')}
      <div class="section-heading">BARN DOORS</div>
      ${['top','bottom','left','right'].map((n,i)=>field('light-barn-'+i,n[0].toUpperCase()+n.slice(1)+' (°)',(u.fusion_barn||[0,0,0,0])[i]||0,'min="0" max="90" step="1"')).join('')}
      <div class="section-heading">LIGHT PATH</div><div class="pass-grid">${RAY_KEYS.map(k=>`<label class="check-row"><input type="checkbox" data-light-ray="${k}" ${flags[k]!==false?'checked':''}> ${k}</label>`).join('')}</div>
      <p class="microcopy" id="light-ies-name">${u.fusion_ies?'IES: '+String(u.fusion_ies).split(/[\\/]/).pop():'No IES profile'}</p>
      <div class="shade-buttons"><button id="light-ies">Choose IES…</button><button id="light-ies-clear" ${u.fusion_ies?'':'disabled'}>Clear IES</button></div>
      <p class="microcopy" id="light-gobo-name">${u.fusion_gobo?'Gobo: '+String(u.fusion_gobo).split(/[\\/]/).pop():'No gobo / cookie'}</p>
      <div class="shade-buttons"><button id="light-gobo">Choose gobo…</button><button id="light-gobo-clear" ${u.fusion_gobo?'':'disabled'}>Clear gobo</button></div>
      <label class="field-label" for="light-include">Link include (object ids)</label><input id="light-include" type="text" value="${(u.fusion_link_include||[]).join(', ')}" placeholder="fusion ids, comma separated">
      <label class="field-label" for="light-exclude">Link exclude (object ids)</label><input id="light-exclude" type="text" value="${(u.fusion_link_exclude||[]).join(', ')}" placeholder="fusion ids, comma separated">
      </section>`;}
  if(obj.isCamera){const u=obj.userData,ortho=!!(obj.isOrthographicCamera||u.fusion_ortho),guides=u.fusion_guides||[];
    return `<section class="inspector-section" id="camera-panel"><div class="section-heading">CAMERA${active?' · ACTIVE':''}${ortho?' · ORTHO':''}</div>
    ${ortho?field('camera-ortho-height','Ortho height (m)',u.fusion_ortho_height||(obj.top-obj.bottom)/(obj.zoom||1),'min="0.001" max="1000" step="0.1"'):field('camera-focal','Focal length (mm)',+focalLength(obj).toFixed(2),'min="4" max="1200" step="1"')+field('camera-sensor','Sensor width (mm)',obj.filmGauge,'min="1" max="100" step="0.1"')}
    ${field('camera-near','Clip start (m)',obj.near,'min="0.001" step="any"')}${field('camera-far','Clip end (m)',obj.far,'min="0.01" step="any"')}
    <label class="check-row"><input id="camera-dof" type="checkbox" ${u.fusion_dof?'checked':''}> Depth of field (Cycles)</label>${field('camera-fstop','F-stop',u.fusion_fstop??2.8,'min="0.5" max="64" step="0.1"')}${field('camera-focus','Focus distance (m)',u.fusion_focus??5,'min="0.01" step="any"')}
    ${field('camera-blades','Bokeh blades',u.fusion_blades||0,'min="0" max="16" step="1"')}${field('camera-bokeh-rot','Bokeh rotation (°)',u.fusion_bokeh_rot||0,'min="-180" max="180" step="1"')}
    <label class="check-row"><input id="camera-motion-blur" type="checkbox" ${u.fusion_motion_blur?'checked':''}> Motion blur</label>${field('camera-shutter','Shutter (°)',u.fusion_shutter??180,'min="1" max="360" step="1"')}
    ${field('camera-distortion','Lens distortion',u.fusion_distortion||0,'min="-1" max="1" step="0.01"')}${field('camera-chromatic','Chromatic aberration',u.fusion_chromatic||0,'min="0" max="1" step="0.01"')}
    ${field('camera-vignette','Vignette',u.fusion_vignette||0,'min="0" max="1" step="0.05"')}${field('camera-flare','Lens flare',u.fusion_flare||0,'min="0" max="1" step="0.05"')}
    ${field('camera-shake-amp','Shake amplitude',u.fusion_shake_amp||0,'min="0" max="1" step="0.01"')}${field('camera-shake-hz','Shake Hz',u.fusion_shake_hz||8,'min="0" max="60" step="0.5"')}
    ${field('camera-shift-x','Tilt-shift X',u.fusion_shift_x||0,'min="-2" max="2" step="0.01"')}${field('camera-shift-y','Tilt-shift Y',u.fusion_shift_y||0,'min="-2" max="2" step="0.01"')}
    <label class="field-label" for="camera-pano">Panorama</label><select id="camera-pano">${PANO_TYPES.map(v=>opt(v,v,u.fusion_pano||'none')).join('')}</select>
    <label class="check-row"><input id="camera-stereo" type="checkbox" ${u.fusion_stereo?'checked':''}> Stereo / VR</label>${field('camera-eye-sep','Eye separation (m)',u.fusion_eye_sep??.065,'min="0.001" max="0.2" step="0.001"')}
    ${field('camera-iso','ISO',u.fusion_iso??100,'min="50" max="102400" step="50"')}${field('camera-wb','White balance (K)',u.fusion_wb??6500,'min="1000" max="12000" step="50"')}
    <label class="field-label" for="camera-follow">Follow object id</label><input id="camera-follow" type="text" maxlength="80" value="${u.fusion_follow||''}" placeholder="fusion id">
    <div class="section-heading">GUIDES</div><div class="pass-grid">${GUIDE_TYPES.map(g=>`<label class="check-row"><input type="checkbox" data-camera-guide="${g}" ${guides.includes(g)?'checked':''}> ${g}</label>`).join('')}</div>
    <label class="field-label" for="camera-preset">Cinematic preset</label><select id="camera-preset"><option value="">Custom</option>${Object.keys(CAMERA_PRESETS).map(n=>opt(n,n,obj.name)).join('')}</select>
    <div class="shade-buttons"><button id="camera-active">${active?'Active camera':'Set active camera'}</button><button id="camera-look">Look through</button><button id="camera-align">Align to view</button></div>
    <p class="microcopy">Look-through is the virtual camera. Import a JSON track (frames/position/quaternion) for matchmove interchange; footage solve and Unreal Live Link are not connected.</p></section>`;}
  return '';
}
const ids=v=>String(v||'').split(/[\s,]+/).map(s=>s.trim()).filter(s=>/^[a-zA-Z0-9_-]{1,80}$/.test(s)).slice(0,256);
// Applies one inspector edit; returns false when the value is invalid.
export function editSceneObject(obj,key,value){
  const n=Number(value),finite=Number.isFinite(n),u=obj.userData;
  switch(key){
    case 'light-color':obj.color.set(value);delete u.fusion_kelvin;return true;
    case 'light-use-kelvin':if(value)applyKelvin(obj,u.fusion_kelvin||6500);else delete u.fusion_kelvin;return true;
    case 'light-kelvin':if(!finite||n<1000||n>12000)return false;applyKelvin(obj,n);return true;
    case 'light-unit':if(!LIGHT_UNITS.includes(value))return false;u.fusion_unit=value;u.fusion_power=authoredPower(obj);applyAuthoredPower(obj);return true;
    case 'light-intensity':if(!finite||n<(u.fusion_unit==='ev'?-10:0)||n>(u.fusion_unit==='ev'?16:1e7))return false;u.fusion_power=n;applyAuthoredPower(obj);return true;
    case 'light-angle':if(!finite||n<1||n>180)return false;obj.angle=n*Math.PI/360;return true;
    case 'light-blend':if(!finite||n<0||n>1)return false;obj.penumbra=n;return true;
    case 'light-area':if(!finite||n<.01||n>100)return false;u.fusion_area=n;applyAuthoredPower(obj);return true;
    case 'light-area-y':if(!finite||n<.01||n>100)return false;u.fusion_area_y=n;applyAuthoredPower(obj);return true;
    case 'light-soft':if(!finite||n<0||n>10)return false;u.fusion_soft=n;applyAuthoredPower(obj);return true;
    case 'light-shadow':obj.castShadow=!!value;return true;
    case 'light-portal':u.fusion_portal=!!value;return true;
    case 'light-contact':u.fusion_contact=!!value;return true;
    case 'light-caustics':u.fusion_caustics=!!value;return true;
    case 'light-volume':if(!finite||n<0||n>10)return false;u.fusion_volume=n;return true;
    case 'light-group':u.fusion_group=String(value||'').slice(0,40);return true;
    case 'light-include':u.fusion_link_include=ids(value);return true;
    case 'light-exclude':u.fusion_link_exclude=ids(value);return true;
    case 'light-barn-0':case 'light-barn-1':case 'light-barn-2':case 'light-barn-3':{
      if(!finite||n<0||n>90)return false;const barn=[...(u.fusion_barn||[0,0,0,0])];barn[Number(key.slice(-1))]=n;setBarnDoors(obj,barn);return true;}
    case 'camera-focal':if(!obj.isPerspectiveCamera||!finite||n<4||n>1200)return false;obj.setFocalLength(n);return true;
    case 'camera-sensor':if(!obj.isPerspectiveCamera||!finite||n<1||n>100)return false;{const f=obj.getFocalLength();obj.filmGauge=n;obj.setFocalLength(f);}return true;
    case 'camera-ortho-height':if(!finite||n<.001||n>1000)return false;u.fusion_ortho_height=n;u.fusion_ortho=true;if(obj.isOrthographicCamera){obj.top=n/2;obj.bottom=-n/2;obj.updateProjectionMatrix();}return true;
    case 'camera-near':if(!finite||n<=0||n>=obj.far)return false;obj.near=n;obj.updateProjectionMatrix();return true;
    case 'camera-far':if(!finite||n<=obj.near)return false;obj.far=n;obj.updateProjectionMatrix();return true;
    case 'camera-dof':u.fusion_dof=!!value;return true;
    case 'camera-fstop':if(!finite||n<.5||n>64)return false;u.fusion_fstop=n;return true;
    case 'camera-focus':if(!finite||n<=0)return false;u.fusion_focus=n;return true;
    case 'camera-blades':if(!finite||n<0||n>16||!Number.isInteger(n))return false;u.fusion_blades=n;return true;
    case 'camera-bokeh-rot':if(!finite||n<-180||n>180)return false;u.fusion_bokeh_rot=n;return true;
    case 'camera-motion-blur':u.fusion_motion_blur=!!value;return true;
    case 'camera-shutter':if(!finite||n<1||n>360)return false;u.fusion_shutter=n;return true;
    case 'camera-distortion':if(!finite||n<-1||n>1)return false;u.fusion_distortion=n;return true;
    case 'camera-chromatic':if(!finite||n<0||n>1)return false;u.fusion_chromatic=n;return true;
    case 'camera-vignette':if(!finite||n<0||n>1)return false;u.fusion_vignette=n;return true;
    case 'camera-flare':if(!finite||n<0||n>1)return false;u.fusion_flare=n;return true;
    case 'camera-shake-amp':if(!finite||n<0||n>1)return false;u.fusion_shake_amp=n;return true;
    case 'camera-shake-hz':if(!finite||n<0||n>60)return false;u.fusion_shake_hz=n;return true;
    case 'camera-shift-x':if(!finite||n<-2||n>2)return false;u.fusion_shift_x=n;return true;
    case 'camera-shift-y':if(!finite||n<-2||n>2)return false;u.fusion_shift_y=n;return true;
    case 'camera-pano':if(!PANO_TYPES.includes(value))return false;u.fusion_pano=value;return true;
    case 'camera-stereo':u.fusion_stereo=!!value;return true;
    case 'camera-eye-sep':if(!finite||n<.001||n>.2)return false;u.fusion_eye_sep=n;return true;
    case 'camera-iso':if(!finite||n<50||n>102400)return false;u.fusion_iso=n;return true;
    case 'camera-wb':if(!finite||n<1000||n>12000)return false;u.fusion_wb=n;return true;
    case 'camera-follow':{const s=String(value||'').trim();if(s&&!/^[a-zA-Z0-9_-]{1,80}$/.test(s))return false;u.fusion_follow=s;return true;}
    case 'camera-preset':if(!CAMERA_PRESETS[value])return false;applyCameraPreset(obj,value);return true;
  }
  return false;
}
export {applyLightRays};
