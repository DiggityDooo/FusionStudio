'use strict';
// UV-space lightmap baking (A23 "Lightmap baking"): rasterize a
// mesh's UV triangles into a texture and evaluate direct lighting
// (Lambert + inverse-square point falloff + shadow rays) per
// texel, reusing the occlusion machinery from ./light-bake.js.
// Texel (i, j) maps to uv ((i+0.5)/res, (j+0.5)/res); a texel is
// covered when its center falls inside a UV triangle (no gutter
// dilation). Uncovered texels stay at the background value.

import { computeVertexNormals, isOccluded } from './light-bake.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function shadePoint(mesh, occluders, p, n, lights, shadowEpsilon, bvh) {
  const origin = [p[0] + n[0] * shadowEpsilon, p[1] + n[1] * shadowEpsilon, p[2] + n[2] * shadowEpsilon];
  let r = 0, g = 0, b = 0;
  for (const light of lights) {
    let dirToLight, attenuation, maxDist;
    if (light.type === 'directional') {
      const len = Math.hypot(...light.direction) || 1;
      dirToLight = light.direction.map((v) => -v / len);
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
      throw new Error(`lightmap: unsupported light type ${light.type}`);
    }
    const cos = dot(n, dirToLight);
    if (cos <= 0) continue;
    let occluded = isOccluded(mesh, origin, dirToLight, maxDist, bvh);
    for (let i = 0; !occluded && i < occluders.length; i++) {
      occluded = isOccluded(occluders[i], origin, dirToLight, maxDist, null);
    }
    if (occluded) continue;
    const color = light.color || [1, 1, 1];
    r += color[0] * attenuation * cos;
    g += color[1] * attenuation * cos;
    b += color[2] * attenuation * cos;
  }
  return [r, g, b];
}

/**
 * Bake a lightmap for `mesh` (requires mesh.uvs, 2 floats per
 * vertex). occluders: extra meshes that cast shadows but receive
 * none. Returns { data (RGB Float32Array, res*res*3), resolution,
 * coveredTexels }.
 */
export function bakeLightmap(mesh, lights, { resolution = 64, shadowEpsilon = 1e-4, bvh = null, occluders = [], background = 0 } = {}) {
  if (!mesh.uvs) throw new Error('lightmap: mesh.uvs is required');
  if (!Number.isInteger(resolution) || resolution < 1 || resolution > 4096) throw new Error('lightmap: resolution out of range');
  const positions = mesh.positions;
  const uvs = mesh.uvs;
  const indices = mesh.indices;
  const normals = mesh.normals || computeVertexNormals(mesh);
  const res = resolution;
  const data = new Float32Array(res * res * 3).fill(background);
  const covered = new Uint8Array(res * res);
  const vertexAt = (arr, i) => [arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]];

  for (let t = 0; t + 2 < indices.length; t += 3) {
    const tri = [indices[t], indices[t + 1], indices[t + 2]];
    const uv = tri.map((vi) => [uvs[vi * 2], uvs[vi * 2 + 1]]);
    const area2 = (uv[1][0] - uv[0][0]) * (uv[2][1] - uv[0][1]) - (uv[2][0] - uv[0][0]) * (uv[1][1] - uv[0][1]);
    if (Math.abs(area2) < 1e-15) continue;
    const minI = Math.max(0, Math.floor(Math.min(...uv.map((p) => p[0])) * res));
    const maxI = Math.min(res - 1, Math.floor(Math.max(...uv.map((p) => p[0])) * res));
    const minJ = Math.max(0, Math.floor(Math.min(...uv.map((p) => p[1])) * res));
    const maxJ = Math.min(res - 1, Math.floor(Math.max(...uv.map((p) => p[1])) * res));
    const wp = tri.map((vi) => vertexAt(positions, vi));
    const wn = tri.map((vi) => vertexAt(normals, vi));
    for (let j = minJ; j <= maxJ; j++) {
      for (let i = minI; i <= maxI; i++) {
        const cu = (i + 0.5) / res, cv = (j + 0.5) / res;
        // Barycentric coordinates of the texel center.
        const w0 = ((uv[1][0] - cu) * (uv[2][1] - cv) - (uv[2][0] - cu) * (uv[1][1] - cv)) / area2;
        const w1 = ((uv[2][0] - cu) * (uv[0][1] - cv) - (uv[0][0] - cu) * (uv[2][1] - cv)) / area2;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-9 || w1 < -1e-9 || w2 < -1e-9) continue;
        const p = [0, 1, 2].map((a) => w0 * wp[0][a] + w1 * wp[1][a] + w2 * wp[2][a]);
        let n = [0, 1, 2].map((a) => w0 * wn[0][a] + w1 * wn[1][a] + w2 * wn[2][a]);
        const nl = Math.hypot(...n);
        if (nl < 1e-12) continue;
        n = n.map((v) => v / nl);
        const [r, g, b] = shadePoint(mesh, occluders, p, n, lights, shadowEpsilon, bvh);
        const idx = (i + res * j) * 3;
        // Later triangles overwrite earlier ones (overlapping UV
        // islands are a content error; do not blend them).
        covered[i + res * j] = 1;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
      }
    }
  }
  let coveredTexels = 0;
  for (const c of covered) coveredTexels += c;
  return { data, resolution: res, coveredTexels };
}
