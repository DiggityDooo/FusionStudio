import * as THREE from 'three';
import {NAVIGATION,HELD_KEYS,keyName,navigationAction,navigationScheme} from './keymap.js';

const NATIVE={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.ROTATE,RIGHT:THREE.MOUSE.PAN},SLOT=['LEFT','MIDDLE','RIGHT'],ROTATING=0,FLY_KEYS={w:[0,0,-1],s:[0,0,1],a:[-1,0,0],d:[1,0,0],q:[0,-1,0],e:[0,1,0]};
// OrbitControls swaps rotate and pan while Ctrl/Meta/Shift is held; compensate so the scheme's action wins.
export function orbitButton(action,e){const swap=e.ctrlKey||e.metaKey||e.shiftKey;return action==='orbit'?(swap?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE):action==='pan'?(swap?THREE.MOUSE.ROTATE:THREE.MOUSE.PAN):action==='zoom'?THREE.MOUSE.DOLLY:-1;}
export class ViewportNavigation {
  constructor(editor,settings,{onContext=null}={}){
    this.editor=editor;this.settings=settings;this.onContext=onContext;this.held=new Set();this.fly=null;this.flySpeed=3;const canvas=editor.renderer.domElement,doc=canvas.ownerDocument,orbit=editor.orbit;
    canvas.addEventListener('pointerdown',e=>this.down(e),true);
    canvas.addEventListener('wheel',e=>{if(!this.fly)return;e.preventDefault();e.stopImmediatePropagation();this.flySpeed=Math.min(100,Math.max(.1,this.flySpeed*(e.deltaY<0?1.25:.8)));},{capture:true,passive:false});
    // Orbit Controls always looks at its target, so orbiting around the selection recenters on it once the drag moves.
    orbit.addEventListener('start',()=>{this.recenter=orbit.state===ROTATING&&this.settings().orbitSelection;});
    orbit.addEventListener('change',()=>{if(this.recenter){this.recenter=false;this.aroundSelection();}});
    orbit.addEventListener('end',()=>{this.recenter=false;});
    doc.addEventListener('keydown',e=>{const key=keyName(e);if(this.fly&&FLY_KEYS[key]&&!e.ctrlKey&&!e.altKey){e.preventDefault();e.stopImmediatePropagation();this.fly.keys.add(key);return;}if(this.heldConsumes(e)&&!/INPUT|SELECT|TEXTAREA/.test(doc.activeElement?.tagName))this.held.add(key);if(e.key==='Alt')e.preventDefault();},true);
    doc.addEventListener('keyup',e=>{const key=keyName(e);this.held.delete(key);this.fly?.keys.delete(key);if(e.key==='Alt')e.preventDefault();},true);
    doc.defaultView?.addEventListener('blur',()=>{this.held.clear();this.endFly();});
    this.apply();
  }
  // Held navigation keys (Houdini Space, C4D 1/2/3) are reserved for navigation, not key bindings.
  heldConsumes(e){const key=keyName(e),map=NAVIGATION[navigationScheme(this.settings())]?.map;return HELD_KEYS.includes(key)&&!e.ctrlKey&&!e.altKey&&!e.shiftKey&&!!map&&Object.keys(map).some(c=>c.startsWith(key+'+'));}
  apply(){const s=this.settings(),orbit=this.editor.orbit;orbit.zoomToCursor=s.zoomToCursor;orbit.zoomSpeed=s.invertZoom?-1:1;Object.assign(orbit.mouseButtons,NATIVE);}
  down(e){
    if(e.pointerType==='touch'||!SLOT[e.button])return;const orbit=this.editor.orbit,action=navigationAction(this.settings(),e,this.held);
    const context=NAVIGATION[navigationScheme(this.settings())]?.context;
    if(context&&action===null&&e.button===2&&this.onContext){e.preventDefault();e.stopImmediatePropagation();this.onContext(e,context);return;}
    orbit.mouseButtons[SLOT[e.button]]=action===undefined?NATIVE[SLOT[e.button]]:orbitButton(action,e);
    if(action==='fly')this.startFly(e);
  }
  aroundSelection(){const editor=this.editor;if(!editor.selected)return;const box=new THREE.Box3().setFromObject(editor.selected);if(!box.isEmpty())editor.orbit.target.copy(box.getCenter(new THREE.Vector3()));}
  startFly(e){
    const editor=this.editor,canvas=editor.renderer.domElement,doc=canvas.ownerDocument;e.preventDefault();this.endFly();
    const move=ev=>{if(ev.pointerId!==this.fly?.pointer)return;const euler=new THREE.Euler().setFromQuaternion(editor.camera.quaternion,'YXZ');euler.y-=(ev.clientX-this.fly.x)*.004;euler.x=THREE.MathUtils.clamp(euler.x-(ev.clientY-this.fly.y)*.004,-1.55,1.55);editor.camera.quaternion.setFromEuler(euler);this.fly.x=ev.clientX;this.fly.y=ev.clientY;this.retarget();},up=ev=>{if(ev.pointerId===this.fly?.pointer)this.endFly();};
    this.fly={pointer:e.pointerId,x:e.clientX,y:e.clientY,keys:new Set(),distance:Math.max(editor.camera.position.distanceTo(editor.orbit.target),.5),last:performance.now(),move,up};
    editor.orbit.enabled=false;canvas.setPointerCapture?.(e.pointerId);doc.addEventListener('pointermove',move);doc.addEventListener('pointerup',up);
  }
  retarget(){const camera=this.editor.camera;this.editor.orbit.target.copy(camera.position).addScaledVector(new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion),this.fly.distance);}
  endFly(){if(!this.fly)return;const doc=this.editor.renderer.domElement.ownerDocument;doc.removeEventListener('pointermove',this.fly.move);doc.removeEventListener('pointerup',this.fly.up);this.fly=null;this.editor.orbit.enabled=true;}
  tick(now){
    if(!this.fly)return;const dt=Math.min(.1,(now-this.fly.last)/1000);this.fly.last=now;if(!this.fly.keys.size)return;
    const camera=this.editor.camera,v=new THREE.Vector3();for(const k of this.fly.keys)v.add(new THREE.Vector3(...FLY_KEYS[k]));
    const vertical=v.y;v.y=0;v.applyQuaternion(camera.quaternion).add(new THREE.Vector3(0,vertical,0));if(!v.lengthSq())return;
    camera.position.addScaledVector(v.normalize(),this.flySpeed*dt);this.retarget();
  }
}
