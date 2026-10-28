'use strict';
import {Triangle,Vector3} from 'three';
// BVH acceleration (A23 "Real-time ray tracing and path-traced
// mode" core): a median-split bounding volume hierarchy over mesh
// triangles with nearest-hit ray casting. Results are identical to
// brute force; only the traversal cost differs.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Möller–Trumbore ray/triangle: returns t or null. */
export function rayTriangle(origin, dir, a, b, c) {
  const e1 = sub(b, a), e2 = sub(c, a);
  const p = cross(dir, e2);
  const det = dot(e1, p);
  if (Math.abs(det) < 1e-12) return null;
  const invDet = 1 / det;
  const tv = sub(origin, a);
  const u = dot(tv, p) * invDet;
  if (u < -1e-9 || u > 1 + 1e-9) return null;
  const q = cross(tv, e1);
  const v = dot(dir, q) * invDet;
  if (v < -1e-9 || u + v > 1 + 1e-9) return null;
  const t = dot(e2, q) * invDet;
  return t > 0 ? t : null;
}

function vertexAt(positions, i) {
  return [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
}

function triangleBounds(positions, indices, t) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < 3; k++) {
    const p = vertexAt(positions, indices[t * 3 + k]);
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p[i]);
      max[i] = Math.max(max[i], p[i]);
    }
  }
  return { min, max, centroid: min.map((v, i) => (v + max[i]) / 2) };
}

/** Build a BVH over the mesh's triangles. */
export function buildBVH(mesh, { maxLeafSize = 4 } = {}) {
  const triCount = mesh.indices.length / 3;
  const bounds = [];
  for (let t = 0; t < triCount; t++) bounds.push(triangleBounds(mesh.positions, mesh.indices, t));
  const nodes = [];
  function build(triList) {
    const nodeIndex = nodes.length;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const t of triList) {
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], bounds[t].min[i]);
        max[i] = Math.max(max[i], bounds[t].max[i]);
      }
    }
    const node = { min, max, left: -1, right: -1, triangles: null };
    nodes.push(node);
    if (triList.length <= maxLeafSize) {
      node.triangles = triList;
      return nodeIndex;
    }
    // Split at the median centroid along the widest axis.
    let axis = 0, widest = -1;
    for (let i = 0; i < 3; i++) {
      if (max[i] - min[i] > widest) { widest = max[i] - min[i]; axis = i; }
    }
    const sorted = [...triList].sort((a, b) => bounds[a].centroid[axis] - bounds[b].centroid[axis]);
    const mid = Math.floor(sorted.length / 2);
    if (mid === 0 || mid === sorted.length) {
      node.triangles = triList;
      return nodeIndex;
    }
    node.left = build(sorted.slice(0, mid));
    node.right = build(sorted.slice(mid));
    return nodeIndex;
  }
  const root = triCount ? build(Array.from({ length: triCount }, (_, i) => i)) : -1;
  return { nodes, root, mesh };
}

/** Nearest surface point, with AABB distance pruning and stable triangle ties.
 * Uses Three's tested point/triangle primitive; the query is never a scratch
 * vector, avoiding aliasing between the original point and candidate results.
 */
export function closestPointBVH(bvh,point,{maxDistance=Infinity,stats=null}={}){
  if(!point||point.length!==3||!Array.from(point).every(Number.isFinite)||typeof maxDistance!=='number'||Number.isNaN(maxDistance)||maxDistance<0)throw Error('Nearest surface query requires finite XYZ and a nonnegative distance.');
  const distance=node=>{let d=0;for(let a=0;a<3;a++){const gap=Math.max(node.min[a]-point[a],0,point[a]-node.max[a]);d+=gap*gap;}return d;};
  const query=new Vector3(...point),candidate=new Vector3(),triangle=new Triangle(),normal=new Vector3(),p=bvh.mesh.positions,indices=bvh.mesh.indices;
  let best=null,bestSquared=maxDistance*maxDistance;const stack=bvh.nodes.length?[0]:[];
  while(stack.length){const node=bvh.nodes[stack.pop()];if(distance(node)>bestSquared)continue;if(stats)stats.nodesVisited=(stats.nodesVisited||0)+1;
    if(node.triangles){for(const t of node.triangles){if(stats)stats.trianglesTested=(stats.trianglesTested||0)+1;triangle.a.fromArray(p,indices[t*3]*3);triangle.b.fromArray(p,indices[t*3+1]*3);triangle.c.fromArray(p,indices[t*3+2]*3);triangle.closestPointToPoint(query,candidate);const d=query.distanceToSquared(candidate);
      if(d<bestSquared||d===bestSquared&&(!best||t<best.triangle)){bestSquared=d;triangle.getNormal(normal);best={triangle:t,point:candidate.toArray(),normal:normal.toArray(),distance:Math.sqrt(d)};}
    }}else{const left=node.left,right=node.right,dl=distance(bvh.nodes[left]),dr=distance(bvh.nodes[right]);if(dl<dr){if(dr<=bestSquared)stack.push(right);if(dl<=bestSquared)stack.push(left);}else{if(dl<=bestSquared)stack.push(left);if(dr<=bestSquared)stack.push(right);}}
  }
  return best;
}

function rayBox(origin, dir, min, max) {
  let tmin = 0, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dir[i]) < 1e-18) {
      if (origin[i] < min[i] || origin[i] > max[i]) return null;
    } else {
      let t1 = (min[i] - origin[i]) / dir[i];
      let t2 = (max[i] - origin[i]) / dir[i];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

/**
 * Nearest hit: { t, triangle, point } or null. `stats` (optional)
 * accumulates { nodesVisited, trianglesTested }.
 */
export function raycastBVH(bvh, origin, dir, stats = null) {
  if (bvh.root < 0) return null;
  const { nodes, mesh } = bvh;
  let best = null;
  const stack = [bvh.root];
  while (stack.length) {
    const node = nodes[stack.pop()];
    if (stats) stats.nodesVisited++;
    const entry = rayBox(origin, dir, node.min, node.max);
    if (entry === null || (best && entry > best.t)) continue;
    if (node.triangles) {
      for (const t of node.triangles) {
        if (stats) stats.trianglesTested++;
        const a = vertexAt(mesh.positions, mesh.indices[t * 3]);
        const b = vertexAt(mesh.positions, mesh.indices[t * 3 + 1]);
        const c = vertexAt(mesh.positions, mesh.indices[t * 3 + 2]);
        const hit = rayTriangle(origin, dir, a, b, c);
        if (hit !== null && (!best || hit < best.t)) {
          best = {
            t: hit,
            triangle: t,
            point: [origin[0] + dir[0] * hit, origin[1] + dir[1] * hit, origin[2] + dir[2] * hit],
          };
        }
      }
    } else {
      // Visit nearer child first for earlier pruning.
      const leftEntry = rayBox(origin, dir, nodes[node.left].min, nodes[node.left].max);
      const rightEntry = rayBox(origin, dir, nodes[node.right].min, nodes[node.right].max);
      if (leftEntry !== null && rightEntry !== null) {
        if (leftEntry < rightEntry) { stack.push(node.right); stack.push(node.left); }
        else { stack.push(node.left); stack.push(node.right); }
      } else {
        if (leftEntry !== null) stack.push(node.left);
        if (rightEntry !== null) stack.push(node.right);
      }
    }
  }
  return best;
}

/** Brute-force nearest hit (reference implementation). */
export function raycastBruteForce(mesh, origin, dir, stats = null) {
  let best = null;
  const triCount = mesh.indices.length / 3;
  for (let t = 0; t < triCount; t++) {
    if (stats) stats.trianglesTested++;
    const a = vertexAt(mesh.positions, mesh.indices[t * 3]);
    const b = vertexAt(mesh.positions, mesh.indices[t * 3 + 1]);
    const c = vertexAt(mesh.positions, mesh.indices[t * 3 + 2]);
    const hit = rayTriangle(origin, dir, a, b, c);
    if (hit !== null && (!best || hit < best.t)) {
      best = {
        t: hit,
        triangle: t,
        point: [origin[0] + dir[0] * hit, origin[1] + dir[1] * hit, origin[2] + dir[2] * hit],
      };
    }
  }
  return best;
}
