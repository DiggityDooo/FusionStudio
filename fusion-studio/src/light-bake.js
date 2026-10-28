'use strict';
// Light baking (A23 "Lightmap baking"): per-vertex irradiance from
// directional and point lights with ray-cast shadow visibility.
// Output is linear RGB irradiance per vertex (Float32Array, 3/vtx).

import { buildBVH, raycastBVH, rayTriangle } from './bvh.js';
export { rayTriangle, buildBVH };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => {
  const l = Math.hypot(...a);
  return l < 1e-18 ? [0, 0, 0] : a.map((v) => v / l);
};

function vertexAt(positions, i) {
  return [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
}

/** Area-weighted vertex normals. */
export function computeVertexNormals(mesh) {
  const count = mesh.positions.length / 3;
  const normals = new Float32Array(count * 3);
  for (let t = 0; t + 2 < mesh.indices.length; t += 3) {
    const [ia, ib, ic] = [mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]];
    const a = vertexAt(mesh.positions, ia);
    const b = vertexAt(mesh.positions, ib);
    const c = vertexAt(mesh.positions, ic);
    const n = cross(sub(b, a), sub(c, a));
    for (const i of [ia, ib, ic]) {
      normals[i * 3] += n[0];
      normals[i * 3 + 1] += n[1];
      normals[i * 3 + 2] += n[2];
    }
  }
  for (let i = 0; i < count; i++) {
    const n = norm([normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]]);
    normals.set(n, i * 3);
  }
  return normals;
}

/** Is the segment origin -> origin + dir * maxDist occluded by the mesh? Pass a prebuilt BVH (src/bvh.js) to accelerate. */
export function isOccluded(mesh, origin, dir, maxDist, bvh = null) {
  if (bvh) {
    const hit = raycastBVH(bvh, origin, dir);
    return hit !== null && hit.t < maxDist;
  }
  for (let t = 0; t + 2 < mesh.indices.length; t += 3) {
    const a = vertexAt(mesh.positions, mesh.indices[t]);
    const b = vertexAt(mesh.positions, mesh.indices[t + 1]);
    const c = vertexAt(mesh.positions, mesh.indices[t + 2]);
    const hit = rayTriangle(origin, dir, a, b, c);
    if (hit !== null && hit < maxDist) return true;
  }
  return false;
}

/**
 * Bake irradiance. lights: [{ type: 'directional', direction
 * (pointing FROM the light), color: [r,g,b], intensity } |
 * { type: 'point', position, color, intensity, decay = 2 }].
 * Returns Float32Array RGB per vertex.
 */
export function bakeVertexIrradiance(mesh, lights, { shadowEpsilon = 1e-4, vertexNormals = null, bvh = null } = {}) {
  const normals = vertexNormals || mesh.normals || computeVertexNormals(mesh);
  const count = mesh.positions.length / 3;
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const p = vertexAt(mesh.positions, i);
    const n = [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]];
    const origin = [p[0] + n[0] * shadowEpsilon, p[1] + n[1] * shadowEpsilon, p[2] + n[2] * shadowEpsilon];
    let r = 0, g = 0, b = 0;
    for (const light of lights) {
      let dirToLight, attenuation, maxDist;
      if (light.type === 'directional') {
        dirToLight = norm(light.direction.map((v) => -v));
        attenuation = light.intensity ?? 1;
        maxDist = Infinity;
      } else if (light.type === 'point') {
        const toLight = sub(light.position, p);
        const dist = Math.hypot(...toLight);
        if (dist < 1e-12) continue;
        dirToLight = toLight.map((v) => v / dist);
        const decay = light.decay ?? 2;
        attenuation = (light.intensity ?? 1) / Math.pow(dist, decay);
        maxDist = dist - shadowEpsilon * 2;
      } else {
        throw new Error(`lightbake: unsupported light type ${light.type}`);
      }
      const cos = dot(n, dirToLight);
      if (cos <= 0) continue;
      if (isOccluded(mesh, origin, dirToLight, maxDist, bvh)) continue;
      const color = light.color || [1, 1, 1];
      r += color[0] * attenuation * cos;
      g += color[1] * attenuation * cos;
      b += color[2] * attenuation * cos;
    }
    out[i * 3] = r;
    out[i * 3 + 1] = g;
    out[i * 3 + 2] = b;
  }
  return out;
}
