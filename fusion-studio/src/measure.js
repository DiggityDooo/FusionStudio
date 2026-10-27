import * as THREE from 'three';

// Viewport ruler: click two surface points per measurement. Display-only (kept out of the scene document).
export class MeasureTool {
  constructor(editor){
    this.editor=editor;this.active=false;this.pending=null;this.items=[];this.group=new THREE.Group();this.group.name='Measurements';editor.scene.add(this.group);
    this.labels=document.createElement('div');this.labels.className='measure-labels';editor.element.style.position||='relative';editor.element.append(this.labels);
    // Capture on the viewport element so the ruler sees clicks before edit, sculpt and gizmo tools.
    editor.element.addEventListener('pointerdown',e=>this.down(e),true);
    document.addEventListener('keydown',e=>{if(this.active&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();this.stop();}},true);
  }
  start(){this.active=true;this.editor.renderer.domElement.style.cursor='crosshair';}
  stop(){this.active=false;this.pending=null;this.editor.renderer.domElement.style.cursor='';this.marker?.removeFromParent();}
  hit(e){const editor=this.editor;editor.ray.setFromCamera(editor.ndc(e),editor.camera);return editor.ray.intersectObjects(editor.root.children.filter(o=>o.visible&&(!editor.localView||editor.localView.has(o.uuid))),true).find(h=>h.object.isMesh&&editor.unclipped(h));}
  down(e){
    if(!this.active||e.button!==0||e.altKey)return;e.preventDefault();e.stopImmediatePropagation();const hit=this.hit(e);if(!hit)return;
    if(!this.pending){this.pending=hit.point.clone();this.marker=this.points([this.pending]);this.group.add(this.marker);return;}
    this.marker.removeFromParent();this.add(this.pending,hit.point.clone());this.pending=null;
  }
  points(list){const g=new THREE.BufferGeometry().setFromPoints(list),p=new THREE.Points(g,new THREE.PointsMaterial({color:0xffd166,size:7,sizeAttenuation:false,depthTest:false}));p.renderOrder=60;return p;}
  add(a,b){
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([a,b]),new THREE.LineBasicMaterial({color:0xffd166,depthTest:false})),ends=this.points([a,b]),label=document.createElement('span');line.renderOrder=60;
    const item={a,b,distance:a.distanceTo(b),line,ends,label};label.textContent=`${item.distance.toFixed(3)} m`;this.group.add(line,ends);this.labels.append(label);this.items.push(item);this.editor.change('measure',item);return item;
  }
  clear(){for(const {line,ends,label} of this.items){line.geometry.dispose();ends.geometry.dispose();line.removeFromParent();ends.removeFromParent();label.remove();}this.items=[];this.stop();}
  sync(){
    if(!this.items.length)return;const rect=this.editor.viewRect(),host=this.editor.element.getBoundingClientRect();
    for(const {a,b,label} of this.items){const p=a.clone().add(b).multiplyScalar(.5).project(this.editor.camera),hidden=p.z<-1||p.z>1;label.hidden=hidden;if(!hidden)Object.assign(label.style,{left:rect.left-host.left+(p.x+1)*rect.width/2+'px',top:rect.top-host.top+(1-p.y)*rect.height/2+'px'});}
  }
}
