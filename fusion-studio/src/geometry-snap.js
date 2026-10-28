import * as THREE from 'three';
import {PointIndex} from './point-index.js';
import {buildBVH,closestPointBVH} from './bvh.js';

export const GEOMETRY_SNAP_MODES=['vertex','edge','face','surface'];
export const SNAP_LABELS={increment:'Increment',grid:'Grid',vertex:'Vertex',edge:'Edge',face:'Triangle center',surface:'Surface'};
export const SNAP_LIMITS={vertices:300000,triangles:300000,edges:450000,pixels:20};
const point=(p,id)=>[p[id*3],p[id*3+1],p[id*3+2]];
const boxDistance=(node,p)=>node.min.reduce((sum,v,a)=>sum+Math.max(v-p[a],0,p[a]-node.max[a])**2,0);

// Separate segment bounds are necessary: the nearest triangle's edges need
// not be the nearest edges in the scene.
class SegmentIndex{
  constructor(positions,segments){
    this.positions=positions;this.segments=segments;this.nodes=[];
    const bounds=new Float64Array(segments.length*6),ids=Uint32Array.from({length:segments.length},(_,i)=>i);
    segments.forEach(([a,b],id)=>{for(let c=0;c<3;c++){bounds[id*6+c]=Math.min(positions[a*3+c],positions[b*3+c]);bounds[id*6+3+c]=Math.max(positions[a*3+c],positions[b*3+c]);}});
    const select=(lo,hi,k,axis)=>{
      const coordinate=id=>bounds[id*6+axis]+bounds[id*6+3+axis],less=(a,b)=>coordinate(a)<coordinate(b)||coordinate(a)===coordinate(b)&&a<b;
      while(lo<hi){const pivot=ids[(lo+hi)>>1];let i=lo,j=hi;while(i<=j){while(less(ids[i],pivot))i++;while(less(pivot,ids[j]))j--;if(i<=j){const v=ids[i];ids[i++]=ids[j];ids[j--]=v;}}if(k<=j)hi=j;else if(k>=i)lo=i;else break;}
    };
    const build=(lo,hi)=>{
      const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
      for(let i=lo;i<=hi;i++){const id=ids[i];for(let a=0;a<3;a++){min[a]=Math.min(min[a],bounds[id*6+a]);max[a]=Math.max(max[a],bounds[id*6+3+a]);}}
      const index=this.nodes.length,node={min,max,left:-1,right:-1,ids:null};this.nodes.push(node);
      if(hi-lo<8)node.ids=Array.from(ids.subarray(lo,hi+1));
      else {let axis=0;for(let a=1;a<3;a++)if(max[a]-min[a]>max[axis]-min[axis])axis=a;const mid=(lo+hi)>>1;select(lo,hi,mid,axis);node.left=build(lo,mid);node.right=build(mid+1,hi);}
      return index;
    };
    if(segments.length)build(0,segments.length-1);
  }
  nearest(p,maxDistance,stats){
    let best=null,squared=maxDistance**2;const stack=this.nodes.length?[0]:[];
    while(stack.length){const node=this.nodes[stack.pop()];if(boxDistance(node,p)>squared)continue;
      if(node.ids){for(const id of node.ids){stats.segmentsTested++;const [i,j]=this.segments[id],a=point(this.positions,i),b=point(this.positions,j),d=b.map((v,k)=>v-a[k]),den=d.reduce((s,v)=>s+v*v,0),t=den?Math.max(0,Math.min(1,d.reduce((s,v,k)=>s+(p[k]-a[k])*v,0)/den)):0,q=a.map((v,k)=>v+t*d[k]),distance=q.reduce((s,v,k)=>s+(v-p[k])**2,0);
        if(distance<squared||distance===squared&&(!best||id<best.index)){squared=distance;best={index:id,point:q,distance:Math.sqrt(distance)};}
      }}else {const left=this.nodes[node.left],right=this.nodes[node.right];if(boxDistance(left,p)<boxDistance(right,p)){stack.push(node.right,node.left);}else stack.push(node.left,node.right);}
    }
    return best;
  }
}

export class GeometrySnapIndex{
  constructor(root,exclude,mode,{include=()=>true}={}){
    if(!GEOMETRY_SNAP_MODES.includes(mode))throw Error('Choose a supported geometric snap mode.');
    this.mode=mode;this.records=[];this.snapshots=[];this.diagnostics=[];const positions=[],indices=[],segments=[],p=new THREE.Vector3();
    root.updateMatrixWorld(true);
    const meshes=[];root.traverseVisible(n=>{if(n.isMesh&&include(n)){for(let parent=n;parent;parent=parent.parent)if(parent===exclude)return;meshes.push(n);}});meshes.sort((a,b)=>a.uuid.localeCompare(b.uuid));
    for(const mesh of meshes){
      if(mesh.isInstancedMesh){this.diagnostics.push('Instanced mesh targets are unsupported: '+mesh.name);continue;}
      const g=mesh.geometry,attribute=g?.attributes.position;if(!attribute)continue;
      if([].concat(mesh.material||[]).length&&[].concat(mesh.material).every(m=>m.visible===false))continue;
      if(attribute.count+positions.length/3>SNAP_LIMITS.vertices)throw Error('Geometric snapping exceeds 300,000 target vertices. Hide unrelated objects or use a simpler target.');
      if(!mesh.matrixWorld.elements.every(Number.isFinite))throw Error('A snap target has a non-finite transform.');
      mesh.skeleton?.update();const offset=positions.length/3;
      for(let i=0;i<attribute.count;i++){mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld);if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||!Number.isFinite(p.z))throw Error('A snap target contains non-finite evaluated vertices.');positions.push(p.x,p.y,p.z);}
      const index=g.index,count=index?.count??attribute.count,start=g.drawRange.start,end=Math.min(count,start+g.drawRange.count),edges=new Map(),visibleVertices=new Set();
      if(!Number.isInteger(start)||start<0||count%3||start%3||!(g.drawRange.count>=0)||g.drawRange.count!==Infinity&&!Number.isInteger(g.drawRange.count))throw Error('A snap target has an invalid triangle draw range.');
      for(let i=start;i+2<end;i+=3){
        const group=g.groups.find(group=>i>=group.start&&i<group.start+group.count);if(Array.isArray(mesh.material)&&group&&mesh.material[group.materialIndex]?.visible===false)continue;
        const face=[0,1,2].map(c=>index?index.getX(i+c):i+c);if(face.some(v=>!Number.isInteger(v)||v<0||v>=attribute.count))throw Error('A snap target references a missing vertex.');
        if(mode==='vertex'){for(const id of face)visibleVertices.add(id);continue;}
        if(mode==='edge'){for(let c=0;c<3;c++){const a=face[c],b=face[(c+1)%3],key=Math.min(a,b)*attribute.count+Math.max(a,b);if(!edges.has(key))edges.set(key,[a,b]);}}
        else {
          if(this.records.length>=SNAP_LIMITS.triangles)throw Error('Geometric snapping exceeds 300,000 target triangles. Hide unrelated objects or use a simpler target.');
          const record={meshId:mesh.uuid,component:i/3};
          if(mode==='face')record.p=[0,1,2].map(c=>face.reduce((s,id)=>s+positions[(offset+id)*3+c],0)/3);
          else indices.push(...face.map(id=>offset+id));
          this.records.push(record);
        }
      }
      if(mode==='vertex')for(const id of [...visibleVertices].sort((a,b)=>a-b))this.records.push({meshId:mesh.uuid,component:id,p:point(positions,offset+id)});
      if(mode==='edge')for(const [a,b]of edges.values()){
        if(segments.length>=SNAP_LIMITS.edges)throw Error('Geometric snapping exceeds 450,000 target edges. Hide unrelated objects or use a simpler target.');
        segments.push([offset+a,offset+b]);this.records.push({meshId:mesh.uuid,component:[a,b]});
      }
      this.snapshots.push({mesh,geometry:g,position:attribute,version:attribute.version,index,iv:index?.version,matrix:mesh.matrixWorld.clone(),morphs:JSON.stringify(mesh.morphTargetInfluences||[]),bones:mesh.skeleton?.bones.map(b=>({bone:b,matrix:b.matrixWorld.clone()}))});
    }
    if(mode==='vertex'||mode==='face')this.index=new PointIndex(this.records);
    else if(mode==='edge')this.index=new SegmentIndex(positions,segments);
    else this.index=buildBVH({positions,indices});
  }
  current(){return this.snapshots.every(s=>s.mesh.geometry===s.geometry&&s.geometry.attributes.position===s.position&&s.position.version===s.version&&s.geometry.index===s.index&&s.index?.version===s.iv&&s.mesh.matrixWorld.equals(s.matrix)&&JSON.stringify(s.mesh.morphTargetInfluences||[])===s.morphs&&(!s.bones||s.bones.every(b=>b.bone.matrixWorld.equals(b.matrix))));}
  nearest(query,maxDistance=Infinity){
    const p=query?.isVector3?query.toArray():query;if(!p||p.length!==3||!p.every(Number.isFinite)||typeof maxDistance!=='number'||Number.isNaN(maxDistance)||maxDistance<0)throw Error('Snap queries need finite XYZ and a nonnegative distance.');
    const stats={segmentsTested:0},hit=this.mode==='surface'?closestPointBVH(this.index,p,{maxDistance,stats}):this.index.nearest(p,maxDistance,stats);
    if(!hit)return null;const id=hit.triangle??hit.index,record=this.records[id];
    return {...record,point:hit.point||record.p.slice(),distance:hit.distance,mode:this.mode,stats};
  }
}

export function constrainedSnapPosition(proposed,target,{axis='XYZ',space='world',quaternion=new THREE.Quaternion()}={}){
  if(!['X','Y','Z','XY','YZ','XZ','XYZ'].includes(axis)||!['world','local'].includes(space))throw Error('Geometric snapping supports translation axes and planes.');
  const result=proposed.clone(),delta=target.clone().sub(proposed);
  if(space==='local'&&axis!=='XYZ')delta.applyQuaternion(quaternion.clone().invert());
  for(const component of ['X','Y','Z'])if(!axis.includes(component))delta[component.toLowerCase()]=0;
  if(space==='local'&&axis!=='XYZ')delta.applyQuaternion(quaternion);
  return result.add(delta);
}

export class GeometrySnapGesture{
  constructor(editor){this.editor=editor;this.session=null;this.cache=null;this.last=null;this.diagnostics=[];this.marker=null;}
  begin(){
    this.end();this.last=null;this.diagnostics=[];const e=this.editor,snap=e.foundation?.state.snap,object=e.selected;
    if(!snap?.enabled||!GEOMETRY_SNAP_MODES.includes(snap.mode)||e.transform.mode!=='translate'||e.ik?.active||!object)return;
    try{
      const visible=n=>{let top=n;while(top.parent&&top.parent!==e.root)top=top.parent;if(e.localView&&!e.localView.has(top.uuid))return false;return !e.foundation.state.collections.some(c=>!c.selectable&&c.members.some(id=>id===n.uuid||id===top.uuid));};
      e.root.updateMatrixWorld(true);const inventory=[];e.root.traverseVisible(n=>{if(!n.isMesh||!visible(n))return;for(let p=n;p;p=p.parent)if(p===object)return;inventory.push([n.uuid,n.geometry?.uuid,n.geometry?.drawRange,n.geometry?.groups,[].concat(n.material||[]).map(m=>m.visible)]);});inventory.sort((a,b)=>a[0].localeCompare(b[0]));
      const signature=JSON.stringify(inventory),cached=this.cache,index=cached?.root===e.root&&cached.object===object&&cached.mode===snap.mode&&cached.signature===signature&&cached.index.current()?cached.index:new GeometrySnapIndex(e.root,object,snap.mode,{include:visible});this.diagnostics=index.diagnostics;
      this.cache={root:e.root,object,mode:snap.mode,signature,index};
      this.session={root:e.root,revision:e.evaluation?.epoch,object,mode:snap.mode,index};
      if(this.diagnostics.length)e.change('operator-error',Error(this.diagnostics.join('; ')));
    }catch(error){this.diagnostics=[error.message];e.change('operator-error',error);}
  }
  apply(){
    const e=this.editor,s=this.session,snap=e.foundation?.state.snap;if(!s||!snap?.enabled||snap.mode!==s.mode||e.root!==s.root||e.evaluation?.epoch!==s.revision||e.selected!==s.object||e.transform.object!==s.object||e.transform.mode!=='translate')return null;
    e.root.updateMatrixWorld(true);if(!s.index.current()){this.end();this.diagnostics=['Snap targets changed. Start another drag to refresh them.'];e.change('operator-error',Error(this.diagnostics[0]));return null;}
    const p=s.object.getWorldPosition(new THREE.Vector3()),camera=e.camera,rect=e.viewRect(),direction=camera.getWorldDirection(new THREE.Vector3()),depth=p.clone().sub(camera.getWorldPosition(new THREE.Vector3())).dot(direction);
    if(depth<=camera.near||rect.height<=0)return null;
    const worldPerPixel=camera.isOrthographicCamera?(camera.top-camera.bottom)/camera.zoom/rect.height:2*depth*Math.tan(THREE.MathUtils.degToRad(camera.fov)*.5)/camera.zoom/rect.height;
    const hit=s.index.nearest(p,SNAP_LIMITS.pixels*worldPerPixel);this.last=hit;if(this.marker)this.marker.visible=false;if(!hit)return null;
    const world=constrainedSnapPosition(p,new THREE.Vector3(...hit.point),{axis:e.transform.axis||'XYZ',space:e.transform.space,quaternion:e.transform.worldQuaternionStart||s.object.getWorldQuaternion(new THREE.Quaternion())}),parent=s.object.parent;
    if(!parent||!parent.matrixWorld.elements.every(Number.isFinite)||Math.abs(parent.matrixWorld.determinant())<1e-12){this.diagnostics=['Snapping requires an invertible parent transform.'];return null;}
    s.object.position.copy(parent.worldToLocal(world));s.object.updateMatrixWorld(true);
    if(e.scene){if(!this.marker){this.marker=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([0,0,0],3)),new THREE.PointsMaterial({color:0xe8b28a,size:9,sizeAttenuation:false,depthTest:false}));this.marker.name='Snap target';this.marker.renderOrder=20;e.scene.add(this.marker);}this.marker.position.fromArray(hit.point);this.marker.visible=true;}
    return hit;
  }
  end(){this.session=null;if(this.marker)this.marker.visible=false;}
  clear(){this.end();this.cache=null;this.last=null;}
}
