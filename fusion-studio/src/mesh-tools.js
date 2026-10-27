import * as THREE from 'three';

export function canonicalGeometry(source){
  const pos=source.attributes.position,uv=source.attributes.uv,map=new Map(),positions=[],uvs=[],remap=[];
  for(let i=0;i<pos.count;i++){
    const key=[pos.getX(i),pos.getY(i),pos.getZ(i)].map(n=>Math.round(n*1e6)).join(',');
    let index=map.get(key);if(index===undefined){index=positions.length/3;map.set(key,index);positions.push(pos.getX(i),pos.getY(i),pos.getZ(i));uvs.push(uv?.getX(i)||0,uv?.getY(i)||0);}remap.push(index);
  }
  const old=source.index?.array||Array.from({length:pos.count},(_,i)=>i);const indices=Array.from(old,i=>remap[i]);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
}
export function coplanarFaces(geometry,faceIndex){
  const p=geometry.attributes.position,idx=geometry.index?.array||Array.from({length:p.count},(_,i)=>i);
  const a=new THREE.Vector3().fromBufferAttribute(p,idx[faceIndex*3]),b=new THREE.Vector3().fromBufferAttribute(p,idx[faceIndex*3+1]),c=new THREE.Vector3().fromBufferAttribute(p,idx[faceIndex*3+2]);
  const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();const plane=normal.dot(a);const faces=[];
  for(let f=0;f<idx.length/3;f++){
    const p0=new THREE.Vector3().fromBufferAttribute(p,idx[f*3]),p1=new THREE.Vector3().fromBufferAttribute(p,idx[f*3+1]),p2=new THREE.Vector3().fromBufferAttribute(p,idx[f*3+2]);
    const n=p1.clone().sub(p0).cross(p2.clone().sub(p0)).normalize();
    if(n.dot(normal)>.9999&&Math.abs(normal.dot(p0)-plane)<1e-5)faces.push(f);
  }
  return {faces,normal};
}
export function extrudeRegion(source,faceIndex,distance=.15){
  const selected=coplanarFaces(source,faceIndex);const geo=canonicalGeometry(source);const idx=Array.from(geo.index.array);const pos=Array.from(geo.attributes.position.array);const uv=Array.from(geo.attributes.uv.array);
  const selectedSet=new Set(selected.faces),vertexSet=new Set(),boundary=new Map();
  for(const f of selected.faces){const t=idx.slice(f*3,f*3+3);for(const i of t)vertexSet.add(i);for(let e=0;e<3;e++){const a=t[e],b=t[(e+1)%3],key=Math.min(a,b)+':'+Math.max(a,b);const item=boundary.get(key);if(item)item.count++;else boundary.set(key,{a,b,count:1});}}
  const duplicate=new Map();for(const vertex of vertexSet){const n=pos.length/3;duplicate.set(vertex,n);const point=new THREE.Vector3(pos[vertex*3],pos[vertex*3+1],pos[vertex*3+2]).addScaledVector(selected.normal,distance);pos.push(...point.toArray());uv.push(uv[vertex*2],uv[vertex*2+1]);}
  const next=[];for(let f=0;f<idx.length/3;f++)if(!selectedSet.has(f))next.push(...idx.slice(f*3,f*3+3));
  for(const f of selected.faces)next.push(...idx.slice(f*3,f*3+3).map(i=>duplicate.get(i)));
  for(const {a,b,count} of boundary.values())if(count===1){const c=duplicate.get(a),d=duplicate.get(b);next.push(a,b,c,b,d,c);}
  const result=new THREE.BufferGeometry();result.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));result.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));result.setIndex(next);result.computeVertexNormals();result.computeBoundingSphere();geo.dispose();return result;
}
export function deleteRegion(source,faceIndex){
  const {faces}=coplanarFaces(source,faceIndex),set=new Set(faces);const geo=source.clone();const idx=Array.from(source.index?.array||Array.from({length:source.attributes.position.count},(_,i)=>i));const next=[];
  for(let f=0;f<idx.length/3;f++)if(!set.has(f))next.push(...idx.slice(f*3,f*3+3));geo.clearGroups();geo.setIndex(next);geo.computeVertexNormals();geo.computeBoundingSphere();return geo;
}
export const SCULPT_BRUSHES=[
  {id:'draw',label:'Draw',icon:'brush'},{id:'draw-sharp',label:'Draw Sharp',icon:'pen-line'},
  {id:'inflate',label:'Inflate',icon:'expand'},{id:'deflate',label:'Deflate',icon:'shrink'},
  {id:'blob',label:'Blob',icon:'circle'},{id:'clay',label:'Clay',icon:'layers'},
  {id:'clay-strips',label:'Clay Strips',icon:'rectangle-horizontal'},{id:'layer',label:'Layer',icon:'layers-2'},
  {id:'crease',label:'Crease',icon:'fold-vertical'},{id:'crease-sharp',label:'Crease Sharp',icon:'pen-tool'},
  {id:'crease-polish',label:'Crease Polish',icon:'sparkles'},{id:'smooth',label:'Smooth',icon:'waves'},
  {id:'flatten',label:'Flatten',icon:'align-horizontal-justify-center'},{id:'contrast',label:'Contrast',icon:'contrast'},
  {id:'fill',label:'Fill',icon:'arrow-up-from-line'},{id:'deepen',label:'Deepen',icon:'arrow-down-from-line'},
  {id:'scrape',label:'Scrape',icon:'slice'},{id:'peaks',label:'Peaks',icon:'mountain'},
  {id:'pinch',label:'Pinch',icon:'shrink'},{id:'magnify',label:'Magnify',icon:'expand'},
  {id:'nudge',label:'Nudge',icon:'move'},{id:'thumb',label:'Thumb',icon:'hand'},
  {id:'snake-hook',label:'Snake Hook',icon:'hook'},{id:'grab',label:'Grab',icon:'grab'},
  {id:'rotate',label:'Rotate',icon:'rotate-3d'},{id:'slide-relax',label:'Slide / Relax',icon:'shuffle'},
  {id:'mask',label:'Mask',icon:'shield'},{id:'multi-plane-scrape',label:'Multi-plane Scrape',icon:'triangle-right'},
  {id:'elastic-deform',label:'Elastic Deform',icon:'spline'},{id:'cloth',label:'Cloth',icon:'waves-2',note:'Artistic wrinkle deformation — not a cloth simulation'},
  {id:'pose',label:'Pose',icon:'bone'},{id:'annotate',label:'Annotate',icon:'message-square'},
];
// Paired tools: holding invert (Shift) switches to the defined counterpart instead of a sign flip that may do nothing.
export const INVERT_PAIRS={pinch:'magnify',magnify:'pinch',fill:'deepen',deepen:'fill',scrape:'peaks',peaks:'scrape',flatten:'contrast',contrast:'flatten'};
export function maskAttribute(geo){
  let attr=geo.attributes.mask;
  if(!attr){attr=new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count),1);attr.name='mask';geo.setAttribute('mask',attr);}
  return attr;
}
export const MESH_FILTERS=[
  {id:'smooth',label:'Smooth mesh'},{id:'sharpen',label:'Sharpen mesh'},
  {id:'relax',label:'Relax (tangential)'},{id:'volume-smooth',label:'Volume-preserving smooth'},
  {id:'mask-blur',label:'Blur mask'},{id:'mask-grow',label:'Grow mask'},{id:'mask-shrink',label:'Shrink mask'},
];
function meshVolume(geo){ // signed volume of a closed triangle mesh, for volume-preserving smoothing
  const p=geo.attributes.position,idx=geo.index?.array;if(!idx)return 0;
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();let volume=0;
  for(let i=0;i<idx.length;i+=3){a.fromBufferAttribute(p,idx[i]);b.fromBufferAttribute(p,idx[i+1]);c.fromBufferAttribute(p,idx[i+2]);volume+=a.dot(b.cross(c))/6;}
  return volume;
}
export function applyMeshFilter(geo,kind,amount=.5){
  const p=geo.attributes.position,adjacency=adjacencyFor(geo),before=new Float32Array(p.array);
  const prior=new THREE.Vector3(),avg=new THREE.Vector3(),tan=new THREE.Vector3(),nrm=new THREE.Vector3();
  const laplacian=i=>{const neighbors=adjacency[i];avg.set(0,0,0);if(!neighbors||!neighbors.size)return null;for(const j of neighbors)avg.add(tan.set(before[j*3],before[j*3+1],before[j*3+2]));return avg.divideScalar(neighbors.size);};
  if(kind==='mask-blur'||kind==='mask-grow'||kind==='mask-shrink'){
    const attr=maskAttribute(geo),source=new Float32Array(attr.array);
    for(let i=0;i<attr.count;i++){const neighbors=adjacency[i];if(!neighbors||!neighbors.size)continue;let value=source[i];
      if(kind==='mask-blur'){let sum=source[i];for(const j of neighbors)sum+=source[j];value=sum/(neighbors.size+1);}
      else if(kind==='mask-grow'){for(const j of neighbors)value=Math.max(value,source[j]);}
      else {for(const j of neighbors)value=Math.min(value,source[j]);}
      attr.array[i]=kind==='mask-blur'?THREE.MathUtils.lerp(source[i],value,THREE.MathUtils.clamp(amount*2,0,1)):value;}
    attr.needsUpdate=true;return attr.count;
  }
  const volumeBefore=kind==='volume-smooth'?meshVolume(geo):0,centerBefore=new THREE.Vector3();
  if(kind==='volume-smooth')geo.computeBoundingBox(),geo.boundingBox.getCenter(centerBefore);
  let touched=0;
  for(let i=0;i<p.count;i++){
    const protection=geo.attributes.mask?THREE.MathUtils.clamp(geo.attributes.mask.array[i]||0,0,1):0;
    const a=laplacian(i);if(!a)continue;prior.set(before[i*3],before[i*3+1],before[i*3+2]);
    const f=amount*(1-protection);if(f<=0)continue;touched++;
    if(kind==='smooth'||kind==='volume-smooth')prior.lerp(a,Math.min(1,f));
    else if(kind==='sharpen')prior.add(tan.copy(prior).sub(a).multiplyScalar(Math.min(1,f)));
    else if(kind==='relax'){tan.copy(a).sub(prior);nrm.fromBufferAttribute(geo.attributes.normal,i);tan.addScaledVector(nrm,-tan.dot(nrm));prior.addScaledVector(tan,Math.min(1,f));}
    else return 0;
    p.setXYZ(i,prior.x,prior.y,prior.z);
  }
  if(kind==='volume-smooth'&&Math.abs(volumeBefore)>1e-12){
    const volumeAfter=meshVolume(geo);
    if(Math.abs(volumeAfter)>1e-12){const scale=Math.cbrt(volumeBefore/volumeAfter);geo.computeBoundingBox();const centerAfter=geo.boundingBox.getCenter(new THREE.Vector3());
      for(let i=0;i<p.count;i++){prior.fromBufferAttribute(p,i).sub(centerAfter).multiplyScalar(scale).add(centerBefore);p.setXYZ(i,prior.x,prior.y,prior.z);} }
  }
  p.needsUpdate=true;geo.computeVertexNormals();geo.computeBoundingSphere();geo.computeBoundingBox();return touched;
}
export function clearMask(geo){const attr=geo.attributes.mask;if(attr){attr.array.fill(0);attr.needsUpdate=true;} }
// M6 Dyntopo-style local refinement: conforming red-green splits of triangles
// near the brush whose edges exceed the detail size. Shape keys and multiple
// material groups are rejected BEFORE any mutation (their contracts are not
// transferable by midpoint interpolation); UVs and mask are interpolated.
export function dyntopoRefine(geo, center, radius, detailSize, passes = 3) {
  if (!geo.index) throw Error('Dyntopo refinement needs an indexed mesh.');
  if (Object.keys(geo.morphAttributes || {}).length) throw Error('Dyntopo refinement cannot preserve shape keys. Apply or remove morphs, or use a static working copy.');
  if ((geo.groups || []).length > 1) throw Error('Dyntopo refinement cannot preserve multiple material groups. Use a single-material working copy.');
  const centerV = new THREE.Vector3(...center);
  let totalSplit = 0;
  for (let pass = 0; pass < passes; pass++) {
    const p = geo.attributes.position, idx = Array.from(geo.index.array);
    const centroid = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const selected = new Set();
    for (let t = 0; t < idx.length; t += 3) {
      a.fromBufferAttribute(p, idx[t]); b.fromBufferAttribute(p, idx[t + 1]); c.fromBufferAttribute(p, idx[t + 2]);
      centroid.copy(a).add(b).add(c).divideScalar(3);
      if (centroid.distanceTo(centerV) > radius) continue;
      const longest = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
      if (longest > detailSize) selected.add(t / 3);
    }
    if (!selected.size) break;
    const edgeKey = (i, j) => i < j ? i + '_' + j : j + '_' + i;
    const splitEdges = new Set();
    for (const t of selected) for (let e = 0; e < 3; e++) splitEdges.add(edgeKey(idx[t * 3 + e], idx[t * 3 + (e + 1) % 3]));
    const positions = [], uvs = geo.attributes.uv ? [] : null, masks = geo.attributes.mask ? [] : null;
    for (let i = 0; i < p.count; i++) { positions.push(p.getX(i), p.getY(i), p.getZ(i)); if (uvs) uvs.push(geo.attributes.uv.getX(i), geo.attributes.uv.getY(i)); if (masks) masks.push(geo.attributes.mask.array[i]); }
    const midpoint = new Map();
    const midIndex = (i, j) => {
      const key = edgeKey(i, j);
      if (midpoint.has(key)) return midpoint.get(key);
      const index = positions.length / 3;
      positions.push((p.getX(i) + p.getX(j)) / 2, (p.getY(i) + p.getY(j)) / 2, (p.getZ(i) + p.getZ(j)) / 2);
      if (uvs) uvs.push((geo.attributes.uv.getX(i) + geo.attributes.uv.getX(j)) / 2, (geo.attributes.uv.getY(i) + geo.attributes.uv.getY(j)) / 2);
      if (masks) masks.push((geo.attributes.mask.array[i] + geo.attributes.mask.array[j]) / 2);
      midpoint.set(key, index);
      return index;
    };
    const out = [];
    for (let t = 0; t < idx.length / 3; t++) {
      const [i0, i1, i2] = [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]];
      const m01 = splitEdges.has(edgeKey(i0, i1)) ? midIndex(i0, i1) : -1;
      const m12 = splitEdges.has(edgeKey(i1, i2)) ? midIndex(i1, i2) : -1;
      const m20 = splitEdges.has(edgeKey(i2, i0)) ? midIndex(i2, i0) : -1;
      const splits = [m01, m12, m20].filter(m => m >= 0).length;
      if (!splits) { out.push(i0, i1, i2); continue; }
      totalSplit++;
      if (splits === 3) out.push(i0, m01, m20, m01, i1, m12, m20, m12, i2, m01, m12, m20);
      else if (splits === 1) {
        if (m01 >= 0) out.push(i0, m01, i2, m01, i1, i2);
        else if (m12 >= 0) out.push(i1, m12, i0, m12, i2, i0);
        else out.push(i2, m20, i1, m20, i0, i1);
      } else {
        if (m01 >= 0 && m12 >= 0) out.push(i0, m01, i2, m01, m12, i2, m01, i1, m12);
        else if (m12 >= 0 && m20 >= 0) out.push(i1, m12, i0, m12, m20, i0, m12, i2, m20);
        else out.push(i2, m20, i1, m20, m01, i1, m20, i0, m01);
      }
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (uvs) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    if (masks) { const attr = new THREE.BufferAttribute(new Float32Array(masks), 1); attr.name = 'mask'; geo.setAttribute('mask', attr); }
    geo.setIndex(out);
    geo.computeVertexNormals();
    geo.computeBoundingSphere(); geo.computeBoundingBox();
  }
  return totalSplit;
}
// M6 Simplify (plan 9.4): local Dyntopo edge collapse. Short edges under the
// brush collapse to their midpoint only when the link condition keeps the
// mesh manifold, neither endpoint is boundary or fully mask-protected, and no
// neighbouring face flips. Rejections happen before any mutation, as with
// refinement; UVs and mask are averaged onto the surviving vertex.
export function dyntopoCollapse(geo, center, radius, detailSize, {maxCollapses = 1024, maxPasses = 8} = {}) {
  if (!geo.index) throw Error('Dyntopo collapse needs an indexed mesh.');
  if (Object.keys(geo.morphAttributes || {}).length) throw Error('Dyntopo collapse cannot preserve shape keys. Apply or remove morphs, or use a static working copy.');
  if ((geo.groups || []).length > 1) throw Error('Dyntopo collapse cannot preserve multiple material groups. Use a single-material working copy.');
  const centerV = new THREE.Vector3(...center);
  let collapsed = 0, removedFaces = 0;
  const skipped = {protected: 0, boundary: 0, link: 0, flip: 0};
  const posOf = (arr, i) => [arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]];
  for (let pass = 0; pass < maxPasses && collapsed < maxCollapses; pass++) {
    const p = geo.attributes.position, idx = geo.index.array, count = p.count;
    const mask = geo.attributes.mask, uv = geo.attributes.uv;
    const facesOf = Array.from({length: count}, () => []);
    const edgeFaces = new Map(), ekey = (a, b) => a < b ? a * count + b : b * count + a;
    for (let f = 0; f < idx.length / 3; f++) {
      const tri = [idx[f * 3], idx[f * 3 + 1], idx[f * 3 + 2]];
      for (let e = 0; e < 3; e++) {
        facesOf[tri[e]].push(f);
        const key = ekey(tri[e], tri[(e + 1) % 3]);
        if (!edgeFaces.has(key)) edgeFaces.set(key, []);
        edgeFaces.get(key).push(tri[(e + 2) % 3]);
      }
    }
    const boundaryVerts = new Set();
    for (const [key, opposites] of edgeFaces) if (opposites.length === 1) { boundaryVerts.add(Math.floor(key / count)); boundaryVerts.add(key % count); }
    const neighbors = new Map();
    const neighborsOf = v => {
      if (!neighbors.has(v)) { const set = new Set(); for (const f of facesOf[v]) for (let e = 0; e < 3; e++) if (idx[f * 3 + e] !== v) set.add(idx[f * 3 + e]); neighbors.set(v, set); }
      return neighbors.get(v);
    };
    const candidates = [];
    for (const [key, opposites] of edgeFaces) {
      if (opposites.length > 2) continue;
      const a = Math.floor(key / count), b = key % count;
      const pa = posOf(p.array, a), pb = posOf(p.array, b);
      const mid = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2];
      const len = Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
      if (len >= detailSize) continue;
      if (Math.hypot(mid[0] - centerV.x, mid[1] - centerV.y, mid[2] - centerV.z) > radius) continue;
      candidates.push({a, b, len, mid});
    }
    candidates.sort((x, y) => x.len - y.len);
    if (!candidates.length) break;
    const used = new Set(), remap = new Map(), midpoints = new Map();
    const faceNormal = (tri, override) => {
      const [A, B, C] = tri.map(v => override?.has(v) ? override.get(v) : posOf(p.array, v));
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
      return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    };
    for (const {a, b, mid} of candidates) {
      if (collapsed >= maxCollapses) break;
      if (used.has(a) || used.has(b)) continue;
      if ((mask && (mask.array[a] >= 0.999 || mask.array[b] >= 0.999))) { skipped.protected++; continue; }
      if (boundaryVerts.has(a) || boundaryVerts.has(b)) { skipped.boundary++; continue; }
      const opposites = edgeFaces.get(ekey(a, b)) || [];
      const common = [...neighborsOf(a)].filter(v => neighborsOf(b).has(v));
      if (common.length !== opposites.length || !common.every(v => opposites.includes(v))) { skipped.link++; continue; }
      const override = new Map([[a, mid], [b, mid]]);
      let flips = false;
      for (const v of [a, b]) for (const f of facesOf[v]) {
        const tri = [idx[f * 3], idx[f * 3 + 1], idx[f * 3 + 2]];
        if (tri.includes(a) && tri.includes(b)) continue;
        const before = faceNormal(tri), after = faceNormal(tri, override);
        const dot = before[0] * after[0] + before[1] * after[1] + before[2] * after[2];
        if (!(dot > 0) || Math.hypot(...after) < 1e-12) { flips = true; break; }
      }
      if (flips) { skipped.flip++; continue; }
      remap.set(b, a); midpoints.set(a, mid); used.add(a); used.add(b); collapsed++;
    }
    if (!remap.size) break;
    for (const [v, mid] of midpoints) {
      const other = [...remap].find(([, target]) => target === v)?.[0];
      p.setXYZ(v, mid[0], mid[1], mid[2]);
      if (uv && other !== undefined) uv.setXY(v, (uv.getX(v) + uv.getX(other)) / 2, (uv.getY(v) + uv.getY(other)) / 2);
      if (mask && other !== undefined) mask.array[v] = (mask.array[v] + mask.array[other]) / 2;
    }
    const remapped = v => remap.get(v) ?? v;
    const newIdx = [];
    for (let f = 0; f < idx.length / 3; f++) {
      const tri = [remapped(idx[f * 3]), remapped(idx[f * 3 + 1]), remapped(idx[f * 3 + 2])];
      if (new Set(tri).size < 3) { removedFaces++; continue; }
      newIdx.push(...tri);
    }
    const keep = new Map(), usedVerts = [...new Set(newIdx)].sort((x, y) => x - y);
    usedVerts.forEach((v, i) => keep.set(v, i));
    const positions = new Float32Array(usedVerts.length * 3), uvs = uv ? new Float32Array(usedVerts.length * 2) : null, masks = mask ? new Float32Array(usedVerts.length) : null;
    for (const [oldV, newV] of keep) {
      positions.set(posOf(p.array, oldV), newV * 3);
      if (uvs) { uvs[newV * 2] = uv.getX(oldV); uvs[newV * 2 + 1] = uv.getY(oldV); }
      if (masks) masks[newV] = mask.array[oldV];
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    if (uvs) geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    if (masks) { const attr = new THREE.BufferAttribute(masks, 1); attr.name = 'mask'; geo.setAttribute('mask', attr); }
    if (geo.attributes.normal) geo.deleteAttribute('normal');
    geo.setIndex(newIdx.map(v => keep.get(v)));
    geo.computeVertexNormals();
    geo.computeBoundingSphere(); geo.computeBoundingBox();
  }
  return {collapsed, removedFaces, skipped};
}
// M6 Multires: Loop subdivision for a retained-source working copy. The level is
// a document property (userData.multires); the source geometry JSON is stored on
// the copy so levels can be re-evaluated without touching the original object.
export function subdivideGeometry(geo, levels = 1) {
  if (!geo.index) throw Error('Multires subdivision needs an indexed mesh.');
  if (Object.keys(geo.morphAttributes || {}).length) throw Error('Multires cannot preserve shape keys. Use a static working copy first.');
  if ((geo.groups || []).length > 1) throw Error('Multires cannot preserve multiple material groups. Use a single-material working copy.');
  let current = geo;
  for (let level = 0; level < levels; level++) {
    const p = current.attributes.position, idx = Array.from(current.index.array);
    const adjacency = adjacencyFor(current);
    const edgeKey = (i, j) => i < j ? i + '_' + j : j + '_' + i;
    const edgeOpposites = new Map();
    for (let t = 0; t < idx.length; t += 3) {
      const tri = [idx[t], idx[t + 1], idx[t + 2]];
      for (let e = 0; e < 3; e++) {
        const key = edgeKey(tri[e], tri[(e + 1) % 3]);
        if (!edgeOpposites.has(key)) edgeOpposites.set(key, []);
        edgeOpposites.get(key).push(tri[(e + 2) % 3]);
      }
    }
    const positions = [], uvs = current.attributes.uv ? [] : null, masks = current.attributes.mask ? [] : null;
    const v = new THREE.Vector3(), avg = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { // Loop vertex rule
      v.fromBufferAttribute(p, i);
      const neighbors = [...(adjacency[i] || [])];
      if (neighbors.length >= 3) {
        avg.set(0, 0, 0);
        for (const j of neighbors) avg.add(new THREE.Vector3().fromBufferAttribute(p, j));
        avg.divideScalar(neighbors.length);
        const beta = neighbors.length === 3 ? 3 / 16 : 3 / (8 * neighbors.length);
        v.multiplyScalar(1 - beta * neighbors.length * (neighbors.length === 3 ? 1 : 1)).lerp(avg, beta * neighbors.length);
      }
      positions.push(v.x, v.y, v.z);
      if (uvs) uvs.push(current.attributes.uv.getX(i), current.attributes.uv.getY(i));
      if (masks) masks.push(current.attributes.mask.array[i]);
    }
    const edgeIndex = new Map();
    const edgePoint = (i, j) => {
      const key = edgeKey(i, j);
      if (edgeIndex.has(key)) return edgeIndex.get(key);
      const a = new THREE.Vector3().fromBufferAttribute(p, i), b = new THREE.Vector3().fromBufferAttribute(p, j);
      const opposites = edgeOpposites.get(key) || [];
      let point;
      if (opposites.length === 2) {
        const o1 = new THREE.Vector3().fromBufferAttribute(p, opposites[0]), o2 = new THREE.Vector3().fromBufferAttribute(p, opposites[1]);
        point = a.multiplyScalar(3 / 8).add(b.multiplyScalar(3 / 8)).add(o1.multiplyScalar(1 / 8)).add(o2.multiplyScalar(1 / 8));
      } else point = a.add(b).divideScalar(2);
      const index = positions.length / 3;
      positions.push(point.x, point.y, point.z);
      if (uvs) uvs.push((current.attributes.uv.getX(i) + current.attributes.uv.getX(j)) / 2, (current.attributes.uv.getY(i) + current.attributes.uv.getY(j)) / 2);
      if (masks) masks.push((current.attributes.mask.array[i] + current.attributes.mask.array[j]) / 2);
      edgeIndex.set(key, index);
      return index;
    };
    const out = [];
    for (let t = 0; t < idx.length; t += 3) {
      const [i0, i1, i2] = [idx[t], idx[t + 1], idx[t + 2]];
      const m01 = edgePoint(i0, i1), m12 = edgePoint(i1, i2), m20 = edgePoint(i2, i0);
      out.push(i0, m01, m20, m01, i1, m12, m20, m12, i2, m01, m12, m20);
    }
    const next = new THREE.BufferGeometry();
    next.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (uvs) next.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    if (masks) { const attr = new THREE.BufferAttribute(new Float32Array(masks), 1); attr.name = 'mask'; next.setAttribute('mask', attr); }
    next.setIndex(out);
    next.computeVertexNormals();
    next.computeBoundingSphere(); next.computeBoundingBox();
    current = next;
  }
  return current;
}
export function geometryDataJSON(geo) { // data-form JSON even for parametric primitives (mirrors the editor's save path)
  const buffer = new THREE.BufferGeometry();
  buffer.uuid = geo.uuid; buffer.name = geo.name;
  for (const key of ['index', 'attributes', 'morphAttributes', 'morphTargetsRelative', 'groups', 'boundingSphere', 'userData']) buffer[key] = geo[key];
  const json = buffer.toJSON(); delete json.metadata; return json;
}
function geometryStateHash(geo) { // divergence guard: any sculpt/topology edit changes this
  const p = geo.attributes.position, bits = new Uint32Array(p.array.buffer, p.array.byteOffset, p.array.length);
  let hash = 2166136261 >>> 0;
  const mix = v => { hash ^= v; hash = Math.imul(hash, 16777619); };
  mix(p.count); mix(geo.index ? geo.index.count : 0);
  for (let i = 0; i < bits.length; i += 7) mix(bits[i]);
  if (geo.index) { const idx = geo.index.array; mix(idx[0]); mix(idx[idx.length - 1]); }
  return (hash >>> 0).toString(16);
}
export function createMultiresCopy(object, level = 1) {
  if (!object?.isMesh) throw Error('Select a mesh for a multires working copy.');
  const copy = object.clone(true);
  copy.name = object.name + ' (Multires)';
  copy.geometry = subdivideGeometry(object.geometry.clone(), level);
  copy.userData = {...object.userData, multires: {version: 1, sourceName: object.name, level, cleanHash: geometryStateHash(copy.geometry)}, multiresSourceGeometry: geometryDataJSON(object.geometry)};
  delete copy.userData.modifierStack;
  return copy;
}
export function setMultiresLevel(object, level) {
  const source = object?.userData.multiresSourceGeometry;
  if (!source) throw Error('This object has no retained multires source.');
  const clean = object.userData.multires?.cleanHash;
  if (clean && geometryStateHash(object.geometry) !== clean)
    throw Error('This multires copy has sculpting or topology changes that a level change would discard (it rebuilds from the retained source). Duplicate the copy to keep the work, or undo back to the clean level state first.');
  const base = new THREE.BufferGeometryLoader().parse(source);
  object.geometry.dispose?.();
  object.geometry = subdivideGeometry(base, level);
  object.userData.multires = {...object.userData.multires, level, cleanHash: geometryStateHash(object.geometry)};
  return object;
}
// Annotations are scene data on the object, never geometry (plan 8.3). Points are
// stored in mesh-local space so markers follow the object transform.
export function addAnnotation(object, localPoint, text) {
  const list = object.userData.fusion_annotations ||= [];
  const entry = {id: `note-${list.length + 1}-${Math.round(localPoint.x * 1e4)}-${Math.round(localPoint.y * 1e4)}`, point: [localPoint.x, localPoint.y, localPoint.z], text: String(text || 'Note')};
  list.push(entry);
  return entry;
}
export function removeAnnotation(object, id) {
  const list = object.userData.fusion_annotations || [];
  const next = list.filter(a => a.id !== id);
  object.userData.fusion_annotations = next;
  return next.length !== list.length;
}
export function annotationMarkers(object) {
  const list = object?.userData.fusion_annotations || [];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(list.flatMap(a => a.point), 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({color: 0xf5a623, size: 0.02, sizeAttenuation: true}));
  points.name = 'Annotation markers';
  return points;
}
// M6 working-copy transfer: topology-changing results (remesh/decimate/stack GLB
// roundtrips) must not silently lose the sculpt mask. Nearest-vertex transfer in
// local space; material slots and UVs keep their own explicit contracts.
export function transferMask(sourceGeo,targetGeo){
  const source=sourceGeo?.attributes?.mask;if(!source)return false;
  const sp=sourceGeo.attributes.position,tp=targetGeo.attributes.position;
  const target=maskAttribute(targetGeo),sv=new THREE.Vector3(),tv=new THREE.Vector3();
  for(let i=0;i<tp.count;i++){tv.fromBufferAttribute(tp,i);let best=0,bd=Infinity;
    for(let j=0;j<sp.count;j++){sv.fromBufferAttribute(sp,j);const d=tv.distanceToSquared(sv);if(d<bd){bd=d;best=j;}}
    target.array[i]=source.array[best];}
  target.needsUpdate=true;return true;
}
export function invertMask(geo){const attr=maskAttribute(geo);for(let i=0;i<attr.count;i++)attr.array[i]=1-attr.array[i];attr.needsUpdate=true;}
export const FALLOFFS=['smooth','sphere','root','sharp','linear','constant'];
export function falloffValue(kind,t){ // t = distance/radius in [0,1]
  const u=Math.max(0,1-t);
  switch(kind){case 'sphere':return Math.sqrt(Math.max(0,1-t*t));case 'root':return Math.sqrt(u);case 'sharp':return u*u*u;case 'linear':return u;case 'constant':return 1;default:return u*u*(3-2*u);}
}
let adjacencyCache={key:null,adjacency:null,faces:null};
function topologyKey(geo){ // vertex count alone is NOT topology identity (plan 7.6)
  const idx=geo.index?.array,p=geo.attributes.position;
  if(!idx)return `noidx:${p.count}`;
  let sum=0;const step=Math.max(1,Math.floor(idx.length/64));
  for(let i=0;i<idx.length;i+=step)sum=(sum*31+idx[i])>>>0;
  return `${p.count}:${idx.length}:${idx[0]}:${idx[idx.length-1]}:${sum}`;
}
function adjacencyFor(geo){
  const key=geo.uuid+':'+topologyKey(geo);
  if(adjacencyCache.key===key)return adjacencyCache.adjacency;
  const p=geo.attributes.position,adjacency=Array.from({length:p.count},()=>new Set());const indices=geo.index?.array||Array.from({length:p.count},(_,i)=>i);
  for(let i=0;i<indices.length;i+=3){const tri=[indices[i],indices[i+1],indices[i+2]];for(const a of tri)for(const b of tri)if(a!==b)adjacency[a].add(b);}
  adjacencyCache={key,adjacency,faces:adjacencyCache.key===key?adjacencyCache.faces:null};return adjacency;
}
function facesFor(geo){ // vertex -> face indices, cached with the same topology identity
  const key=geo.uuid+':'+topologyKey(geo);
  if(adjacencyCache.key===key&&adjacencyCache.faces)return adjacencyCache.faces;
  adjacencyFor(geo);
  const p=geo.attributes.position,faces=Array.from({length:p.count},()=>[]);
  const indices=geo.index?.array||[];
  for(let f=0;f<indices.length/3;f++)for(let e=0;e<3;e++)faces[indices[f*3+e]].push(f);
  adjacencyCache={key,adjacency:adjacencyCache.adjacency,faces};return faces;
}
// Partial normal recompute: only faces touching affected vertices (hot-path, plan M8).
const normalScratch={stamp:0,faceMark:null,vertMark:null};
export function recomputeNormalsPartial(geo,affected){
  const p=geo.attributes.position,n=geo.attributes.normal,idx=geo.index?.array;
  if(!idx||!affected.length||affected.length>p.count*0.5){geo.computeVertexNormals();return false;}
  const faces=facesFor(geo),pa=p.array,na=n.array,faceCount=idx.length/3;
  // Stamp-marked scratch arrays: Set allocation/lookup dominated this path.
  if(!normalScratch.faceMark||normalScratch.faceMark.length<faceCount)normalScratch.faceMark=new Uint32Array(faceCount);
  if(!normalScratch.vertMark||normalScratch.vertMark.length<p.count)normalScratch.vertMark=new Uint32Array(p.count);
  if(++normalScratch.stamp===0xffffffff){normalScratch.faceMark.fill(0);normalScratch.vertMark.fill(0);normalScratch.stamp=1;}
  const stamp=normalScratch.stamp,fm=normalScratch.faceMark,vm=normalScratch.vertMark,faceList=[],coveredList=[];
  for(const i of affected)for(const f of faces[i]||[])if(fm[f]!==stamp){fm[f]=stamp;faceList.push(f);}
  // Only vertices of the initial faces have complete face coverage after one
  // expansion ring; second-ring vertices keep their existing normals because
  // none of their faces changed shape.
  for(const f of faceList)for(let e=0;e<3;e++){const v=idx[f*3+e];if(vm[v]!==stamp){vm[v]=stamp;coveredList.push(v);}}
  for(const i of coveredList)for(const f of faces[i]||[])if(fm[f]!==stamp){fm[f]=stamp;faceList.push(f);}
  for(const i of coveredList){const i3=i*3;na[i3]=0;na[i3+1]=0;na[i3+2]=0;}
  for(const f of faceList){
    const v0=idx[f*3],v1=idx[f*3+1],v2=idx[f*3+2],i0=v0*3,i1=v1*3,i2=v2*3;
    const ax=pa[i0],ay=pa[i0+1],az=pa[i0+2];
    const abx=pa[i1]-ax,aby=pa[i1+1]-ay,abz=pa[i1+2]-az,acx=pa[i2]-ax,acy=pa[i2+1]-ay,acz=pa[i2+2]-az;
    const cx=aby*acz-abz*acy,cy=abz*acx-abx*acz,cz=abx*acy-aby*acx;
    if(vm[v0]===stamp){na[i0]+=cx;na[i0+1]+=cy;na[i0+2]+=cz;}
    if(vm[v1]===stamp){na[i1]+=cx;na[i1+1]+=cy;na[i1+2]+=cz;}
    if(vm[v2]===stamp){na[i2]+=cx;na[i2+1]+=cy;na[i2+2]+=cz;}
  }
  for(const i of coveredList){const i3=i*3,x=na[i3],y=na[i3+1],z=na[i3+2],l=Math.sqrt(x*x+y*y+z*z);if(l>0){na[i3]=x/l;na[i3+1]=y/l;na[i3+2]=z/l;}}
  n.needsUpdate=true;return true;
}
export function pressureScale(brush,event){ // pen pressure scales strength; mouse/touch and disabled pressure stay at full strength
  if(!brush?.pressure||!event||event.pointerType!=='pen')return 1;
  const p=Number(event.pressure);if(!Number.isFinite(p)||p<=0)return 1;
  return Math.min(1,p);
}
const DRAG_MODES=new Set(['nudge','thumb','snake-hook','grab']);
export function sculptGeometry(mesh,point,radius=.12,strength=.01,mode='inflate',invert=false,opts={}){
  const geo=mesh.geometry,p=geo.attributes.position,n=geo.attributes.normal;mesh.updateWorldMatrix(true,false);
  if(mode==='annotate')return 0; // annotations are scene data, handled by MeshTools
  if(mode==='simplify')return 0; // topology action (Dyntopo edge collapse), handled by MeshTools
  if(invert&&INVERT_PAIRS[mode]){mode=INVERT_PAIRS[mode];invert=false;}
  const falloffKind=opts.falloff||'smooth',dir=invert?-1:1;
  const inverse=mesh.matrixWorld.clone().invert(),normalMatrix=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const brushNormal=(opts.normal?opts.normal.clone():new THREE.Vector3(0,0,1)).normalize();
  const drag=opts.delta?opts.delta.clone():new THREE.Vector3();
  const mask=geo.attributes.mask,protection=i=>mask?THREE.MathUtils.clamp(mask.array[i]||0,0,1):0;
  if(mode==='mask'){ // persistent protection channel; never touches positions or vertex colors
    const attr=maskAttribute(geo);let touched=0;
    const pa=p.array,me=mesh.matrixWorld.elements,r2=radius*radius;
    for(let i=0;i<p.count;i++){const i3=i*3,dx=me[0]*pa[i3]+me[4]*pa[i3+1]+me[8]*pa[i3+2]+me[12]-point.x,dy=me[1]*pa[i3]+me[5]*pa[i3+1]+me[9]*pa[i3+2]+me[13]-point.y,dz=me[2]*pa[i3]+me[6]*pa[i3+1]+me[10]*pa[i3+2]+me[14]-point.z,d2=dx*dx+dy*dy+dz*dz;if(d2>r2)continue;attr.array[i]=THREE.MathUtils.clamp(attr.array[i]+dir*falloffValue(falloffKind,Math.sqrt(d2)/radius)*Math.abs(strength)*24,0,1);touched++;}
    attr.needsUpdate=true;return touched;
  }
  const affected=[],world=new THREE.Vector3(),vNormal=new THREE.Vector3(),tmp=new THREE.Vector3(),tmp2=new THREE.Vector3();
  let maxShift=0; // largest local-space displacement, tracked inline for conservative bounds
  // Clay Strips frame: tangent along stroke direction, binormal across it, both in the brush plane.
  const tangent=new THREE.Vector3(1,0,0);if(drag.lengthSq()>1e-12)tangent.copy(drag).addScaledVector(brushNormal,-drag.dot(brushNormal));
  if(tangent.lengthSq()<1e-9)tangent.set(1,0,0).addScaledVector(brushNormal,-brushNormal.x);tangent.normalize();
  const binormal=new THREE.Vector3().crossVectors(brushNormal,tangent).normalize();
  const reach=mode==='elastic-deform'?radius*3:radius; // Elastic Deform's gaussian field extends past the brush circle
  const pa=p.array,me=mesh.matrixWorld.elements,reachSq=reach*reach;
  for(let i=0;i<p.count;i++){
    const i3=i*3,lx=pa[i3],ly=pa[i3+1],lz=pa[i3+2];
    const dx=me[0]*lx+me[4]*ly+me[8]*lz+me[12]-point.x,dy=me[1]*lx+me[5]*ly+me[9]*lz+me[13]-point.y,dz=me[2]*lx+me[6]*ly+me[10]*lz+me[14]-point.z,d2=dx*dx+dy*dy+dz*dz;
    if(d2>reachSq)continue;
    const distance=Math.sqrt(d2);world.set(point.x+dx,point.y+dy,point.z+dz);
    const f0=falloffValue(falloffKind,distance/radius),f=f0*(1-protection(i));if(f<=0&&mode!=='smooth'&&mode!=='elastic-deform')continue;
    affected.push(i);
    if(mode==='smooth'||mode==='slide-relax'||mode==='crease-polish')continue;
    vNormal.fromBufferAttribute(n,i).applyMatrix3(normalMatrix).normalize();
    const height=tmp.copy(world).sub(point).dot(brushNormal); // signed height above brush plane
    const k=Math.min(1,Math.abs(strength)*22); // plane-tool rate
    switch(mode){
      case 'draw': world.addScaledVector(brushNormal,strength*f*dir); break;
      case 'draw-sharp': world.addScaledVector(brushNormal,strength*falloffValue('sharp',distance/radius)*(1-protection(i))*dir); break;
      case 'inflate': world.addScaledVector(vNormal,strength*f*dir); break;
      case 'deflate': world.addScaledVector(vNormal,-strength*f*dir); break;
      case 'blob': world.addScaledVector(vNormal,strength*falloffValue('sphere',distance/radius)*(1-protection(i))*dir); break;
      case 'clay': { const target=strength*8*dir; const step=THREE.MathUtils.clamp(target-height,-Math.abs(strength)*f*4,Math.abs(strength)*f*4); world.addScaledVector(brushNormal,step); break; }
      case 'clay-strips': { // oriented rectangular footprint: soft along tangent, bounded across binormal
        tmp2.copy(world).sub(point);const u=tmp2.dot(tangent)/radius,v=tmp2.dot(binormal)/radius;
        const rect=Math.max(0,1-Math.abs(v))*(0.35+0.65*Math.max(0,1-Math.abs(u)));
        const target=strength*8*dir,step=THREE.MathUtils.clamp(target-height,-Math.abs(strength)*rect*(1-protection(i))*4,Math.abs(strength)*rect*(1-protection(i))*4);
        world.addScaledVector(brushNormal,step); break; }
      case 'layer': { // capped relative to the stroke-start base captured by MeshTools (opts.layerBase, local coords)
        if(opts.layerBase){tmp2.fromArray(opts.layerBase,i*3).applyMatrix4(mesh.matrixWorld);const baseHeight=tmp2.sub(point).dot(brushNormal);const target=baseHeight+strength*10*dir;const step=THREE.MathUtils.clamp(target-height,-Math.abs(strength)*f*4,Math.abs(strength)*f*4);world.addScaledVector(brushNormal,step);} break; }
      case 'crease': world.addScaledVector(brushNormal,-strength*f*dir*.7).add(tmp.copy(point).sub(world).multiplyScalar(f*.18)); break;
      case 'crease-sharp': world.addScaledVector(brushNormal,-strength*falloffValue('sharp',distance/radius)*(1-protection(i))*dir).add(tmp.copy(point).sub(world).multiplyScalar(f*.3)); break;
      case 'flatten': world.addScaledVector(brushNormal,-height*k*f); break;
      case 'contrast': world.addScaledVector(brushNormal,Math.sign(height)*Math.abs(strength)*f*1.4); break;
      case 'fill': if(height<0)world.addScaledVector(brushNormal,-height*k*f); break;
      case 'deepen': if(height<0)world.addScaledVector(brushNormal,-Math.abs(strength)*f*1.4); break;
      case 'scrape': if(height>0)world.addScaledVector(brushNormal,-height*Math.min(1,Math.abs(strength)*26)*f).add(tmp.copy(point).sub(world).multiplyScalar(f*.08)); break;
      case 'peaks': if(height>0)world.addScaledVector(brushNormal,Math.abs(strength)*f*1.4); break;
      case 'pinch': case 'magnify': { tmp.copy(world).sub(point); tmp.addScaledVector(brushNormal,-tmp.dot(brushNormal)); world.addScaledVector(tmp,(mode==='pinch'?-1:1)*Math.min(.6,Math.abs(strength)*14)*f); break; }
      case 'nudge': world.addScaledVector(drag,f); break;
      case 'thumb': world.addScaledVector(drag,f*.8).addScaledVector(brushNormal,-height*Math.min(1,Math.abs(strength)*10)*f); break;
      case 'snake-hook': world.addScaledVector(drag,f*f*1.6); break;
      case 'grab': world.addScaledVector(drag,f); break;
      case 'rotate': { const angle=strength*14*f*dir; tmp.copy(world).sub(point).applyAxisAngle(brushNormal,angle); world.copy(point).add(tmp); break; }
      case 'multi-plane-scrape': { // two planes meeting at a crease along the binormal through the brush center
        const angle=(opts.planeAngle??Math.PI/3),n2=tmp2.copy(brushNormal).applyAxisAngle(binormal,angle).normalize();
        tmp.copy(world).sub(point);const u=tmp.dot(tangent);
        const useSecond=u>0,planeNormal=useSecond?n2:brushNormal,h=tmp.dot(planeNormal);
        world.addScaledVector(planeNormal,-h*Math.min(1,Math.abs(strength)*24)*f); break; }
      case 'cloth': { // artistic wrinkle deformation (NOT a simulation): folds across the stroke direction
        tmp.copy(world).sub(point);const u=tmp.dot(tangent),wavelength=Math.max(radius/2.5,1e-4);
        const wave=Math.sin(u/wavelength*Math.PI*2)*Math.abs(strength)*2.2*f*dir;
        world.addScaledVector(brushNormal,wave).addScaledVector(tangent,Math.cos(u/wavelength*Math.PI*2)*Math.abs(strength)*.5*f*dir); break; }
      case 'pose': { // bend the region beyond the brush center around the binormal pivot axis
        tmp.copy(world).sub(point);const u=tmp.dot(tangent);
        if(u>0){const bend=strength*14*dir*Math.min(1,u/radius)*(0.3+0.7*f0);tmp.applyAxisAngle(binormal,bend);world.copy(point).add(tmp);} break; }
      case 'elastic-deform': { // gaussian field reaching beyond the brush radius, unlike Grab's bounded falloff
        const sigma=radius*1.35,g=Math.exp(-(distance*distance)/(2*sigma*sigma))*(1-protection(i));
        world.addScaledVector(drag,g); break; }
      default: world.addScaledVector(vNormal,strength*f*dir);
    }
    world.applyMatrix4(inverse);
    const shx=world.x-lx,shy=world.y-ly,shz=world.z-lz,sh=Math.sqrt(shx*shx+shy*shy+shz*shz);if(sh>maxShift)maxShift=sh;
    pa[i3]=world.x;pa[i3+1]=world.y;pa[i3+2]=world.z;
  }
  let postShift=0;
  if(mode==='smooth'||mode==='slide-relax'||mode==='crease-polish'||(opts.autosmooth>0&&affected.length)){
    // Read the POST-primary positions (plan 7.6: autosmooth must not smooth the pre-stroke mesh over the brush result).
    const post=new Float32Array(p.array);
    const isPrimary=mode==='smooth'||mode==='slide-relax'||mode==='crease-polish';
    const amount=isPrimary?Math.min(.6,Math.abs(strength)*16):Math.min(.5,opts.autosmooth);
    const adjacency=adjacencyFor(geo),prior=new THREE.Vector3(),avg=new THREE.Vector3(),tan=new THREE.Vector3(),wp=new THREE.Vector3();
    for(const i of affected){const neighbors=adjacency[i];if(!neighbors||!neighbors.size)continue;avg.set(0,0,0);for(const j of neighbors)avg.add(tan.set(post[j*3],post[j*3+1],post[j*3+2]));avg.divideScalar(neighbors.size);prior.set(post[i*3],post[i*3+1],post[i*3+2]);
      wp.copy(prior).applyMatrix4(mesh.matrixWorld);const wf=falloffValue(falloffKind,Math.min(1,wp.distanceTo(point)/radius))*(1-protection(i));
      if(mode==='slide-relax'){ tan.copy(avg).sub(prior);vNormal.fromBufferAttribute(n,i);tan.addScaledVector(vNormal,-tan.dot(vNormal));prior.addScaledVector(tan,amount*.5*wf); }
      else if(mode==='crease-polish'){ // smooth the flanks, spare the crease center itself
        const centerSparing=1-falloffValue('sharp',Math.min(1,wp.distanceTo(point)/radius));prior.lerp(avg,amount*centerSparing*wf); }
      else prior.lerp(avg,amount*wf);
      p.setXYZ(i,prior.x,prior.y,prior.z);
      const psh=Math.hypot(prior.x-post[i*3],prior.y-post[i*3+1],prior.z-post[i*3+2]);if(psh>postShift)postShift=psh;}
  }
  p.needsUpdate=true;
  recomputeNormalsPartial(geo,affected);
  // Conservative bounds: expand by the largest local shift instead of rescanning the mesh.
  maxShift+=postShift; // a vertex can move in both passes; sum of maxima stays conservative
  const bp=new THREE.Vector3();
  if(geo.boundingSphere)geo.boundingSphere.radius+=maxShift;else geo.computeBoundingSphere();
  if(geo.boundingBox){for(const i of affected)geo.boundingBox.expandByPoint(bp.fromBufferAttribute(p,i));}else geo.computeBoundingBox();
  return affected.length;
}

export class MeshTools{
  constructor(editor){
    this.editor=editor;this.mode='object';this.brush={radius:.15,strength:.014,type:'draw',falloff:'smooth',autosmooth:0,symmetry:{x:false,y:false,z:false},dyntopo:{enabled:false,detail:0.03},pressure:true,spacing:.3};this.activeMesh=null;this.lastDabPoint=null;this.faceIndex=null;this.stroke=false;this.lastPoint=null;
    this.faceHighlight=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({color:'#ff9b33',transparent:true,opacity:.4,side:THREE.DoubleSide,depthTest:false}));this.faceHighlight.visible=false;this.faceHighlight.renderOrder=10;editor.scene.add(this.faceHighlight);
    const canvas=editor.renderer.domElement;
    canvas.addEventListener('pointerdown',e=>{if(this.mode==='object'||e.button!==0||e.altKey)return;const hit=this.hit(e);if(!hit)return;e.stopImmediatePropagation();this.editor.orbit.enabled=false;canvas.setPointerCapture(e.pointerId);if(this.mode==='sculpt'){this.stroke=true;this._annotateArmed=true;this.lastPoint=hit.point.clone();this.lastDabPoint=null;this.beginStrokeSnapshot(hit.object);this.layerBase=this.brush.type==='layer'?{uuid:hit.object.geometry.uuid,base:new Float32Array(hit.object.geometry.attributes.position.array)}:null;this.applyBrush(hit,e.shiftKey,e);}else {this.activeMesh=hit.object;this.faceIndex=hit.faceIndex;this.showFace();this.editor.change('mesh-selection');}},true);
    canvas.addEventListener('pointermove',e=>{if(this.mode==='sculpt'&&this.stroke){const hit=this.hit(e);if(hit)this.applyBrush(hit,e.shiftKey,e);e.stopImmediatePropagation();}},true);
    const end=e=>{if(this.mode==='object'||e.altKey||e.button!==0)return;e.stopImmediatePropagation();this.editor.orbit.enabled=true;if(this.stroke){this.stroke=false;this.lastPoint=null;this.lastDabPoint=null;this.strokeSnapshot=null;this.editor.commit();}};
    canvas.addEventListener('pointerup',end,true);
    canvas.addEventListener('pointercancel',e=>{if(this.stroke){e.stopImmediatePropagation();this.cancelStroke();}},true); // capture loss cancels the uncommitted gesture (plan 14.2)
    canvas.ownerDocument?.addEventListener?.('keydown',e=>{if(e.key==='Escape'&&this.stroke)this.cancelStroke();});
  }
  beginStrokeSnapshot(mesh){const g=mesh.geometry,copy=(attr,itemSize)=>attr?new Float32Array(attr.array):null;this.strokeSnapshot={mesh,position:copy(g.attributes.position),normal:copy(g.attributes.normal),uv:copy(g.attributes.uv),mask:copy(g.attributes.mask),index:g.index?g.index.array.slice():null};}
  cancelStroke(){ // Escape / pointer-cancel: restore the exact pre-stroke geometry, no history entry
    const snap=this.strokeSnapshot;if(!this.stroke||!snap)return;const g=snap.mesh.geometry;
    g.setAttribute('position',new THREE.BufferAttribute(snap.position,3));
    if(snap.normal)g.setAttribute('normal',new THREE.BufferAttribute(snap.normal,3));else if(g.attributes.normal)g.deleteAttribute('normal');
    if(snap.uv)g.setAttribute('uv',new THREE.BufferAttribute(snap.uv,2));
    if(snap.mask){const attr=new THREE.BufferAttribute(snap.mask,1);attr.name='mask';g.setAttribute('mask',attr);}else if(g.attributes.mask)g.deleteAttribute('mask');
    g.setIndex(snap.index?Array.from(snap.index):null);g.computeBoundingSphere();g.computeBoundingBox();
    this.stroke=false;this.strokeSnapshot=null;this.lastPoint=null;this.lastDabPoint=null;this.editor.orbit.enabled=true;this.editor.change('sculpt-cancelled');
  }
  hit(event){const e=this.editor,r=e.renderer.domElement.getBoundingClientRect();e.pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);e.ray.setFromCamera(e.pointer,e.camera);return e.ray.intersectObject(e.selected||e.root,true).find(h=>h.object.isMesh&&!h.object.isSkinnedMesh);}
  setMode(mode){this.mode=mode;this.faceHighlight.visible=false;this.faceIndex=null;this.activeMesh=null;this.editor.transform.detach();if(mode==='object'&&this.editor.selected)this.editor.transform.attach(this.editor.selected);this.editor.change('mode');}
  showFace(){if(!this.activeMesh||this.faceIndex===null)return;const mesh=this.activeMesh;const geo=mesh.geometry,idx=geo.index?.array||Array.from({length:geo.attributes.position.count},(_,i)=>i),pos=[];const {faces}=coplanarFaces(geo,this.faceIndex);
    for(const f of faces)for(let j=0;j<3;j++)pos.push(...new THREE.Vector3().fromBufferAttribute(geo.attributes.position,idx[f*3+j]).toArray());
    this.faceHighlight.geometry.dispose();this.faceHighlight.geometry=new THREE.BufferGeometry();this.faceHighlight.geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));mesh.updateWorldMatrix(true,false);this.faceHighlight.matrixAutoUpdate=false;this.faceHighlight.matrix.copy(mesh.matrixWorld);this.faceHighlight.visible=true;
  }
  extrude(distance){if(this.editor.creatorShapeSession||this.activeMesh?.userData.fusion_shape_session)throw Error('Shape-key edits must preserve topology. Use vertex transforms or sculpt brushes, or cancel and make a static working copy.');if(this.editor.selected?.userData.modifierStack)throw Error('Use Component Editing on the retained source cage to keep the modifier stack evaluated.');return this.editor.operators?this.editor.operators.run('mesh.extrude_region',{distance}):this._extrude(distance);}
  _extrude(distance){if(this.editor.creatorShapeSession||this.activeMesh?.userData.fusion_shape_session)throw Error('Shape-key edits must preserve topology. Use vertex transforms or sculpt brushes, or cancel and make a static working copy.');if(this.faceIndex===null||!this.activeMesh)throw Error('Click a face in Edit Mode first.');const mesh=this.activeMesh,result=extrudeRegion(mesh.geometry,this.faceIndex,distance);mesh.geometry.dispose();mesh.geometry=result;if(Array.isArray(mesh.material))mesh.material=mesh.material[0];mesh.userData={...mesh.userData,fusion_kind:'mesh'};this.faceHighlight.visible=false;this.faceIndex=null;this.editor.commit();}
  deleteFace(){if(this.editor.creatorShapeSession||this.activeMesh?.userData.fusion_shape_session)throw Error('Shape-key edits must preserve topology. Use vertex transforms or sculpt brushes, or cancel and make a static working copy.');if(this.editor.selected?.userData.modifierStack)throw Error('Use Component Editing on the retained source cage to keep the modifier stack evaluated.');if(this.faceIndex===null||!this.activeMesh)throw Error('Click a face first.');const mesh=this.activeMesh;const geo=deleteRegion(mesh.geometry,this.faceIndex);mesh.geometry.dispose();mesh.geometry=geo;if(Array.isArray(mesh.material))mesh.material=mesh.material[0];this.faceHighlight.visible=false;this.faceIndex=null;this.editor.commit();}
  refreshAnnotations(object){
    if(this.annotationOverlay){this.editor.scene.remove(this.annotationOverlay);this.annotationOverlay.geometry.dispose();this.annotationOverlay=null;}
    if(!object?.userData.fusion_annotations?.length)return;
    const markers=annotationMarkers(object);object.updateWorldMatrix(true,false);
    markers.position.setFromMatrixPosition(object.matrixWorld);markers.quaternion.setFromRotationMatrix(object.matrixWorld);markers.scale.setFromMatrixScale(object.matrixWorld);
    this.annotationOverlay=markers;this.editor.scene.add(markers);
  }
  applyBrush(hit,invert,event){if(this.editor.selected?.userData.modifierStack){this.stroke=false;this.editor.orbit.enabled=true;this.editor.change('operator-error',Error('Apply the modifier stack before sculpting. Use Component Editing for retained source geometry.'));return;}this.activeMesh=hit.object;
    if(this.brush.type==='annotate'){if(!this._annotateArmed)return;this._annotateArmed=false;const local=hit.object.worldToLocal(hit.point.clone());addAnnotation(hit.object,local,this.annotationText||'Note');this.refreshAnnotations(hit.object);this.editor.change('annotation');return;}
    const mesh=hit.object,delta=this.lastPoint?hit.point.clone().sub(this.lastPoint):new THREE.Vector3();
    if(this.brush.type==='simplify'){ // plan 9.4: local edge collapse, Dyntopo-only, never a silent whole-object decimate
      if(!this.brush.dyntopo?.enabled){this.stroke=false;this.editor.orbit.enabled=true;this.editor.change('operator-error',Error('Simplify collapses edges locally and requires Dyntopo. Enable Dyntopo for this working copy, or use the Decimate modifier for whole-object reduction.'));return;}
      try{const report=dyntopoCollapse(mesh.geometry,mesh.worldToLocal(hit.point.clone()).toArray(),this.brush.radius,this.brush.dyntopo.detail);this.lastPoint=hit.point.clone();this.lastDabPoint=null;this.editor.change('sculpt-stroke',report);}catch(error){this.stroke=false;this.editor.orbit.enabled=true;this.editor.change('operator-error',error);}
      return;
    }
    if(this.brush.dyntopo?.enabled&&this.brush.type!=='mask'){try{dyntopoRefine(mesh.geometry,mesh.worldToLocal(hit.point.clone()).toArray(),this.brush.radius,this.brush.dyntopo.detail);}catch(error){this.stroke=false;this.editor.orbit.enabled=true;this.editor.change('operator-error',error);return;}}
    const normal=hit.face?hit.face.normal.clone().transformDirection(mesh.matrixWorld):new THREE.Vector3(0,0,1);
    const strength=this.brush.strength*pressureScale(this.brush,event);
    const dabAt=(point,dabDelta)=>{
      const opts={falloff:this.brush.falloff,autosmooth:this.brush.autosmooth,delta:dabDelta,normal,layerBase:this.layerBase&&this.layerBase.uuid===mesh.geometry.uuid?this.layerBase.base:null};
      const points=[point];
      const sym=this.brush.symmetry;if(sym&&(sym.x||sym.y||sym.z)){ // mirror the stroke across mesh-local axes
        mesh.updateWorldMatrix(true,false);const inv=mesh.matrixWorld.clone().invert(),local=point.clone().applyMatrix4(inv),combos=new Set(['0,0,0']);
        for(const cx of (sym.x?[0,1]:[0]))for(const cy of (sym.y?[0,1]:[0]))for(const cz of (sym.z?[0,1]:[0]))combos.add(cx+','+cy+','+cz);
        for(const key of combos){if(key==='0,0,0')continue;const [cx,cy,cz]=key.split(',').map(Number);const m=local.clone();if(cx)m.x*=-1;if(cy)m.y*=-1;if(cz)m.z*=-1;points.push(m.applyMatrix4(mesh.matrixWorld));}
      }
      for(const p of points)sculptGeometry(mesh,p,this.brush.radius,strength,this.brush.type,invert,p===point?opts:{...opts,delta:dabDelta.clone()});
    };
    // Dab spacing (plan 14.2): displacement must depend on path length, not on
    // how densely the pointer reports events. Drag-family brushes consume the
    // raw delta instead and are exempt.
    const spaced=!DRAG_MODES.has(this.brush.type)&&!['pose','rotate','elastic-deform'].includes(this.brush.type);
    if(spaced&&this.lastDabPoint){
      const spacing=Math.max(1e-4,this.brush.radius*(this.brush.spacing??.3)),from=this.lastDabPoint,dist=from.distanceTo(hit.point);
      if(dist<spacing){this.lastPoint=hit.point.clone();return;}
      const steps=Math.min(64,Math.floor(dist/spacing)),step=hit.point.clone().sub(from).multiplyScalar(spacing/dist);
      for(let k=1;k<=steps;k++){dabAt(from.clone().addScaledVector(step,k),step);this.lastDabPoint=from.clone().addScaledVector(step,k);}
    }else{dabAt(hit.point,delta);this.lastDabPoint=hit.point.clone();}
    this.lastPoint=hit.point.clone();this.editor.change('sculpt-stroke');}
}
