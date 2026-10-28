'use strict';
// Proxy weight transfer (A14 "Proxy-based weight transfer for
// clothes", "Fit and weight transfer for clothing to a character"):
// copy skin weights from a source mesh to target vertices by
// closest point on the source surface with barycentric
// interpolation of the corner weights. Targets farther than
// maxDistance from the surface fall back to their nearest source
// vertex's weights and are counted in the stats. Skin data uses
// the packed indices/weights layout from ./skin-reduce.js.

/** Closest point on triangle (a, b, c) to p (Ericson's region tests). */
export function closestPointOnTriangle(p, a, b, c) {
  const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return { point: [...a], barycentric: [1, 0, 0] };
  const bp = sub(p, b);
  const d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return { point: [...b], barycentric: [0, 1, 0] };
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return { point: [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v], barycentric: [1 - v, v, 0] };
  }
  const cp = sub(p, c);
  const d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return { point: [...c], barycentric: [0, 0, 1] };
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return { point: [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w], barycentric: [1 - w, 0, w] };
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return {
      point: [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w],
      barycentric: [0, 1 - w, w],
    };
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  return {
    point: [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w],
    barycentric: [1 - v - w, v, w],
  };
}

function vertexWeights(skin, vertex) {
  const out = new Map();
  for (let s = 0; s < skin.stride; s++) {
    const joint = skin.indices[vertex * skin.stride + s];
    const w = skin.weights[vertex * skin.stride + s];
    if (joint >= 0 && w > 0) out.set(joint, (out.get(joint) || 0) + w);
  }
  return out;
}

/**
 * Transfer source skin weights to target positions.
 * sourceMesh: { positions, indices }; sourceSkin: packed skin.
 * options: { maxDistance = Infinity }.
 * Returns { skin (packed, stride = source stride), stats:
 * { transferred, fallback, meanDistance, maxDistance } }.
 * Brute-force over source triangles (proxy meshes are small).
 */
export function transferWeights(sourceMesh, sourceSkin, targetPositions, { maxDistance = Infinity } = {}) {
  if (!(maxDistance > 0)) throw new Error('transfer: maxDistance must be positive');
  const { positions, indices } = sourceMesh;
  const sourceCount = positions.length / 3;
  if (sourceSkin.indices.length !== sourceCount * sourceSkin.stride) {
    throw new Error('transfer: skin does not match the source mesh');
  }
  const targetCount = targetPositions.length / 3;
  const stride = sourceSkin.stride;
  const outIndices = new Int32Array(targetCount * stride).fill(-1);
  const outWeights = new Float32Array(targetCount * stride);
  let transferred = 0, fallback = 0, distanceSum = 0, farthest = 0;

  const posAt = (i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  for (let t = 0; t < targetCount; t++) {
    const p = [targetPositions[t * 3], targetPositions[t * 3 + 1], targetPositions[t * 3 + 2]];
    let best = null;
    for (let f = 0; f + 2 < indices.length; f += 3) {
      const tri = [indices[f], indices[f + 1], indices[f + 2]];
      const hit = closestPointOnTriangle(p, posAt(tri[0]), posAt(tri[1]), posAt(tri[2]));
      const d = Math.hypot(p[0] - hit.point[0], p[1] - hit.point[1], p[2] - hit.point[2]);
      if (!best || d < best.distance) best = { distance: d, tri, barycentric: hit.barycentric };
    }
    distanceSum += best.distance;
    farthest = Math.max(farthest, best.distance);
    const blended = new Map();
    if (best.distance <= maxDistance) {
      transferred++;
      best.tri.forEach((vertex, k) => {
        const w = best.barycentric[k];
        if (w === 0) return;
        for (const [joint, weight] of vertexWeights(sourceSkin, vertex)) {
          blended.set(joint, (blended.get(joint) || 0) + weight * w);
        }
      });
    } else {
      fallback++;
      // Nearest source vertex fallback.
      let nearest = -1, nearestD = Infinity;
      for (let v = 0; v < sourceCount; v++) {
        const q = posAt(v);
        const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
        if (d < nearestD) { nearestD = d; nearest = v; }
      }
      for (const [joint, weight] of vertexWeights(sourceSkin, nearest)) blended.set(joint, weight);
    }
    const pairs = [...blended.entries()].sort((a, b) => b[1] - a[1]);
    const total = pairs.reduce((s, [, w]) => s + w, 0) || 1;
    pairs.slice(0, stride).forEach(([joint, w], s) => {
      outIndices[t * stride + s] = joint;
      outWeights[t * stride + s] = w / total;
    });
  }
  return {
    skin: { indices: outIndices, weights: outWeights, stride },
    stats: {
      transferred, fallback,
      meanDistance: targetCount ? distanceSum / targetCount : 0,
      maxDistance: farthest,
    },
  };
}
