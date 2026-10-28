'use strict';
// CNC toolpath generation (A24 "CNC toolpath generation (CAM)"):
// polygon offsetting (miter with clamp) and concentric pocket
// clearing paths. Polygons are [[x, y], ...] (either winding).

export function signedArea(polygon) {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

export function polygonPerimeter(polygon) {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    sum += Math.hypot(x2 - x1, y2 - y1);
  }
  return sum;
}

function segmentsIntersect(p1, p2, p3, p4) {
  const d1 = (p2[0] - p1[0]) * (p3[1] - p1[1]) - (p2[1] - p1[1]) * (p3[0] - p1[0]);
  const d2 = (p2[0] - p1[0]) * (p4[1] - p1[1]) - (p2[1] - p1[1]) * (p4[0] - p1[0]);
  const d3 = (p4[0] - p3[0]) * (p1[1] - p3[1]) - (p4[1] - p3[1]) * (p1[0] - p3[0]);
  const d4 = (p4[0] - p3[0]) * (p2[1] - p3[1]) - (p4[1] - p3[1]) * (p2[0] - p3[0]);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export function pointInPolygon(polygon, [px, py]) {
  // Boundary counts as inside (within 1e-9).
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % n];
    const len2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    const t = len2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / len2));
    if (Math.hypot(px - (x1 + (x2 - x1) * t), py - (y1 + (y2 - y1) * t)) < 1e-9) return true;
  }
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** True when the closed polygon has no self-intersections. */
export function isSimplePolygon(polygon) {
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i || (i === 0 && j === n - 1)) continue;
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      const a = polygon[i], b = polygon[(i + 1) % n];
      const c = polygon[j], d = polygon[(j + 1) % n];
      if (segmentsIntersect(a, b, c, d)) return false;
    }
  }
  return true;
}

/**
 * Offset a simple polygon by distance d (positive = outward).
 * Miter joins with a clamp (bevel fallback beyond miterLimit).
 * Returns null when the offset collapses (area vanishes or the
 * ring self-intersects).
 */
export function offsetPolygon(polygon, d, { miterLimit = 2 } = {}) {
  if (polygon.length < 3) throw new Error('toolpath: polygon needs >= 3 points');
  let pts = polygon.map((p) => [...p]);
  if (signedArea(pts) < 0) pts.reverse(); // normalize to CCW
  const n = pts.length;
  // Outward (right-side) normals per edge for a CCW polygon.
  const normals = [];
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % n];
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 1e-15) throw new Error('toolpath: degenerate edge');
    normals.push([(y2 - y1) / len, -(x2 - x1) / len]);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n;
    const n1 = normals[prev], n2 = normals[i];
    const v = pts[i];
    const denom = 1 + n1[0] * n2[0] + n1[1] * n2[1];
    if (denom < 1e-9) {
      // Near-180-degree fold: fall back to a bevel pair.
      out.push([v[0] + n1[0] * d, v[1] + n1[1] * d]);
      out.push([v[0] + n2[0] * d, v[1] + n2[1] * d]);
      continue;
    }
    const miter = [(n1[0] + n2[0]) / denom, (n1[1] + n2[1]) / denom];
    const miterLen = Math.hypot(...miter);
    if (miterLen > miterLimit) {
      const scale = (miterLimit / miterLen);
      out.push([v[0] + miter[0] * d * scale * (Math.sign(d) || 1), v[1] + miter[1] * d * scale * (Math.sign(d) || 1)]);
    } else {
      out.push([v[0] + miter[0] * d, v[1] + miter[1] * d]);
    }
  }
  if (out.length < 3) return null;
  const area = signedArea(out);
  // Collapse detection: inward offset past the medial axis flips or
  // zeroes the area / self-intersects.
  if (d < 0 && area <= 1e-12) return null;
  if (d > 0 && area <= 0) return null;
  if (!isSimplePolygon(out)) return null;
  // Overshoot detection: miter vertices that crossed the shape form
  // a phantom ring (a 10-square inset by 15 yields a valid-looking
  // 20x20 rectangle of crossed vertices). Inward offsets must stay
  // inside the original; outward offsets must stay outside it.
  if (d < 0 && out.some((p) => !pointInPolygon(pts, p))) return null;
  if (d > 0 && out.some((p) => pointInPolygon(pts, p))) return null;
  // The -7 inset of the same square produces a phantom that stays
  // INSIDE: its tell is that every ring edge runs backwards against
  // its source edge. Genuine offsets preserve edge direction.
  if (out.length === n) {
    for (let i = 0; i < n; i++) {
      const se = [pts[(i + 1) % n][0] - pts[i][0], pts[(i + 1) % n][1] - pts[i][1]];
      const oe = [out[(i + 1) % n][0] - out[i][0], out[(i + 1) % n][1] - out[i][1]];
      if (se[0] * oe[0] + se[1] * oe[1] <= 0) return null;
    }
  }
  return out;
}

/**
 * Concentric pocket-clearing toolpath: rings at toolRadius,
 * toolRadius + stepover, ... until the offset collapses.
 * Returns { rings, totalLength, clearedArea } where clearedArea is
 * estimated as stock area minus the final uncut island area.
 */
export function pocketToolpath(polygon, { toolDiameter = 1, stepover = null } = {}) {
  if (toolDiameter <= 0) throw new Error('toolpath: toolDiameter must be positive');
  const step = stepover ?? toolDiameter * 0.6;
  if (step <= 0) throw new Error('toolpath: stepover must be positive');
  const stockArea = Math.abs(signedArea(polygon));
  const rings = [];
  let inset = toolDiameter / 2;
  let lastIslandArea = stockArea;
  for (let guard = 0; guard < 10000; guard++) {
    const ring = offsetPolygon(polygon, -inset);
    if (!ring) break;
    rings.push(ring);
    lastIslandArea = Math.abs(signedArea(ring));
    inset += step;
  }
  const totalLength = rings.reduce((s, ring) => s + polygonPerimeter(ring), 0);
  // Conservative cleared-area estimate: stock minus the island
  // enclosed by the last ring. (The final ring's own inward tool
  // reach clears further; this deliberately under-claims.)
  return { rings, totalLength, clearedArea: rings.length ? stockArea - lastIslandArea : 0, stockArea };
}

/** Profile (contour) toolpath: single offset ring outside/inside. */
export function profileToolpath(polygon, { toolDiameter = 1, side = 'outside' } = {}) {
  const d = (side === 'outside' ? 1 : -1) * (toolDiameter / 2);
  const ring = offsetPolygon(polygon, d);
  if (!ring) throw new Error('toolpath: profile offset collapsed');
  return { ring, length: polygonPerimeter(ring) };
}
