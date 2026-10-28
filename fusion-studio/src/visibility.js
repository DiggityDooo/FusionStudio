'use strict';
// Real-time visibility kernel: frustum construction and sphere/AABB
// classification, conservative sphere-cone occlusion, distance-band LOD
// selection with hysteresis, and render-queue sorting (opaque
// front-to-back grouped by material, transparent back-to-front).
// Pure math -- renderer integration is the caller's job.

/** Build the 6 frustum planes from a camera. Plane: [a,b,c,d], inside >= 0. */
export function frustumFromCamera({ position, forward, up = [0, 1, 0], fovY = 60, aspect = 1, near = 0.1, far = 1000 }) {
  const norm = (v) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const f = norm(forward);
  const r = norm([f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]]);
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const tanY = Math.tan((fovY * Math.PI / 180) / 2);
  const tanX = tanY * aspect;
  const [px, py, pz] = position;
  const planeThrough = (normal, point) => [normal[0], normal[1], normal[2], -(normal[0] * point[0] + normal[1] * point[1] + normal[2] * point[2])];
  const at = (dir, dist) => [px + dir[0] * dist, py + dir[1] * dist, pz + dir[2] * dist];
  const edgeNormal = (dirA, dirB) => {
    // Normal of the plane spanned by two frustum edge directions, facing in.
    const n = norm([dirA[1] * dirB[2] - dirA[2] * dirB[1], dirA[2] * dirB[0] - dirA[0] * dirB[2], dirA[0] * dirB[1] - dirA[1] * dirB[0]]);
    return (n[0] * f[0] + n[1] * f[1] + n[2] * f[2]) < 0 ? n : [-n[0], -n[1], -n[2]];
  };
  const dirTL = norm([f[0] - r[0] * tanX + u[0] * tanY, f[1] - r[1] * tanX + u[1] * tanY, f[2] - r[2] * tanX + u[2] * tanY]);
  const dirTR = norm([f[0] + r[0] * tanX + u[0] * tanY, f[1] + r[1] * tanX + u[1] * tanY, f[2] + r[2] * tanX + u[2] * tanY]);
  const dirBL = norm([f[0] - r[0] * tanX - u[0] * tanY, f[1] - r[1] * tanX - u[1] * tanY, f[2] - r[2] * tanX - u[2] * tanY]);
  const dirBR = norm([f[0] + r[0] * tanX - u[0] * tanY, f[1] + r[1] * tanX - u[1] * tanY, f[2] + r[2] * tanX - u[2] * tanY]);
  // Orient every plane so the frustum center is on the inside (a cross
  // product sign heuristic alone inverted the side planes).
  const mid = at(f, (near + far) / 2);
  const orient = (plane) => (
    plane[0] * mid[0] + plane[1] * mid[1] + plane[2] * mid[2] + plane[3] < 0
      ? [-plane[0], -plane[1], -plane[2], -plane[3]]
      : plane
  );
  return [
    planeThrough(f, at(f, near)), // near
    planeThrough([-f[0], -f[1], -f[2]], at(f, far)), // far
    planeThrough(edgeNormal(dirBL, dirTL), position), // left
    planeThrough(edgeNormal(dirTR, dirBR), position), // right
    planeThrough(edgeNormal(dirTL, dirTR), position), // top
    planeThrough(edgeNormal(dirBR, dirBL), position), // bottom
  ].map(orient);
}

function planeDistance(plane, point) {
  return plane[0] * point[0] + plane[1] * point[1] + plane[2] * point[2] + plane[3];
}

/** Classify a sphere vs a frustum: 'outside' | 'inside' | 'intersecting'. */
export function classifySphere(planes, center, radius) {
  let result = 'inside';
  for (const plane of planes) {
    const d = planeDistance(plane, center);
    if (d < -radius) return 'outside';
    if (d < radius) result = 'intersecting';
  }
  return result;
}

/** Classify an AABB vs a frustum (p-vertex / n-vertex test). */
export function classifyAabb(planes, min, max) {
  let result = 'inside';
  for (const plane of planes) {
    const pVertex = [
      plane[0] >= 0 ? max[0] : min[0],
      plane[1] >= 0 ? max[1] : min[1],
      plane[2] >= 0 ? max[2] : min[2],
    ];
    if (planeDistance(plane, pVertex) < 0) return 'outside';
    const nVertex = [
      plane[0] >= 0 ? min[0] : max[0],
      plane[1] >= 0 ? min[1] : max[1],
      plane[2] >= 0 ? min[2] : max[2],
    ];
    if (planeDistance(plane, nVertex) < 0) result = 'intersecting';
  }
  return result;
}

/**
 * Cull a list of {id, center, radius} against a camera.
 * Returns {visible: [ids], culled: [ids]} (intersecting counts as visible).
 */
export function cullScene(objects, camera) {
  const planes = frustumFromCamera(camera);
  const visible = [], culled = [];
  for (const obj of objects) {
    (classifySphere(planes, obj.center, obj.radius ?? 0) === 'outside' ? culled : visible).push(obj.id);
  }
  return { visible, culled };
}

/**
 * Conservative sphere occlusion: is `object` fully hidden behind
 * `occluder` from `cameraPosition`? True iff the object's angular disc is
 * contained in the occluder's angular disc and the occluder is closer.
 * Exact for opaque spheres; conservative (never hides visible geometry).
 */
export function sphereOccluded(cameraPosition, object, occluder) {
  const toObj = [object.center[0] - cameraPosition[0], object.center[1] - cameraPosition[1], object.center[2] - cameraPosition[2]];
  const toOcc = [occluder.center[0] - cameraPosition[0], occluder.center[1] - cameraPosition[1], occluder.center[2] - cameraPosition[2]];
  const dObj = Math.hypot(...toObj), dOcc = Math.hypot(...toOcc);
  if (dOcc >= dObj) return false; // occluder not closer
  if (dObj <= object.radius || dOcc <= occluder.radius) return false; // camera inside a sphere
  const cosSep = (toObj[0] * toOcc[0] + toObj[1] * toOcc[1] + toObj[2] * toOcc[2]) / (dObj * dOcc);
  const sep = Math.acos(Math.max(-1, Math.min(1, cosSep)));
  const angObj = Math.asin(Math.min(1, object.radius / dObj));
  const angOcc = Math.asin(Math.min(1, occluder.radius / dOcc));
  return sep + angObj < angOcc;
}

/** Batch occlusion: returns ids of objects hidden by any occluder. */
export function occlusionCullSpheres(cameraPosition, objects, occluders) {
  const hidden = [];
  for (const obj of objects) {
    if (occluders.some((occ) => occ !== obj && sphereOccluded(cameraPosition, obj, occ))) hidden.push(obj.id);
  }
  return hidden;
}

/**
 * Distance-band LOD selection with hysteresis: once a LOD is active, the
 * object must cross the band edge by `hysteresis` (fraction) before
 * switching, which prevents popping when hovering at a boundary.
 * bands: ascending switch distances [d0, d1, ...] -> LOD i applies below di.
 */
export function selectLod(distance, bands, currentLod = 0, hysteresis = 0.1) {
  let lod = Math.max(0, Math.min(bands.length, currentLod));
  // Farther: step down only after clearing each band edge by hysteresis.
  while (lod < bands.length && distance >= bands[lod] * (1 + hysteresis)) lod++;
  // Nearer: step up only after clearing each band edge inward.
  while (lod > 0 && distance < bands[lod - 1] * (1 - hysteresis)) lod--;
  return lod;
}

/**
 * Sort render items: opaque first (grouped by material, front-to-back),
 * then transparent (back-to-front). Items: {id, depth, material, transparent}.
 * Returns a new array; input untouched. Stable for equal keys.
 */
export function sortRenderQueue(items) {
  const decorated = items.map((item, index) => ({ item, index }));
  decorated.sort((a, b) => {
    const ta = a.item.transparent ? 1 : 0, tb = b.item.transparent ? 1 : 0;
    if (ta !== tb) return ta - tb;
    if (!ta) {
      if (a.item.material !== b.item.material) return a.item.material < b.item.material ? -1 : 1;
      if (a.item.depth !== b.item.depth) return a.item.depth - b.item.depth; // front-to-back
    } else if (a.item.depth !== b.item.depth) {
      return b.item.depth - a.item.depth; // back-to-front
    }
    return a.index - b.index;
  });
  return decorated.map(({ item }) => item);
}
