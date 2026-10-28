'use strict';
// Voronoi fracture kernel (2D): cell polygons by half-plane clipping, Lloyd
// relaxation, and extruded shard prisms for plate shattering. Voronoi cells
// are convex, so shard prisms triangulate by fan. 3D tetrahedral fracture,
// glue/constraint networks, and UI wiring are not claimed here.

/** Signed area of a polygon (positive = CCW). Points are [x, y]. */
export function polygonArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** Area-weighted centroid of a polygon. */
export function polygonCentroid(poly) {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    const cross = x1 * y2 - x2 * y1;
    a += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  a /= 2;
  if (Math.abs(a) < 1e-15) {
    // Degenerate polygon: fall back to the vertex average.
    let x = 0, y = 0;
    for (const p of poly) { x += p[0]; y += p[1]; }
    return [x / poly.length, y / poly.length];
  }
  return [cx / (6 * a), cy / (6 * a)];
}

// Clip a convex polygon by the half-plane of points at least as close to
// `site` as to `other` (perpendicular bisector half-plane).
function clipBisector(poly, site, other) {
  const mx = (site[0] + other[0]) / 2, my = (site[1] + other[1]) / 2;
  const dx = other[0] - site[0], dy = other[1] - site[1];
  const inside = (p) => (p[0] - mx) * dx + (p[1] - my) * dy <= 1e-12;
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ain = inside(a), bin = inside(b);
    if (ain) out.push(a);
    if (ain !== bin) {
      const ta = (a[0] - mx) * dx + (a[1] - my) * dy;
      const tb = (b[0] - mx) * dx + (b[1] - my) * dy;
      const t = ta / (ta - tb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/**
 * Compute Voronoi cells for `sites` clipped to axis-aligned `bounds`
 * {minX, minY, maxX, maxY}. Returns one entry per site:
 * {site, polygon, area, centroid}. Duplicate or dominated sites yield
 * empty polygons with area 0.
 */
export function computeVoronoi(sites, bounds) {
  const rect = [
    [bounds.minX, bounds.minY], [bounds.maxX, bounds.minY],
    [bounds.maxX, bounds.maxY], [bounds.minX, bounds.maxY],
  ];
  return sites.map((site, s) => {
    let poly = rect;
    for (let o = 0; o < sites.length && poly.length; o++) {
      if (o === s) continue;
      const other = sites[o];
      if (other[0] === site[0] && other[1] === site[1]) {
        if (o < s) { poly = []; break; } // exact duplicate: first site wins
        continue;
      }
      poly = clipBisector(poly, site, other);
    }
    const area = poly.length ? Math.abs(polygonArea(poly)) : 0;
    return {
      site: [site[0], site[1]],
      polygon: poly,
      area,
      centroid: poly.length ? polygonCentroid(poly) : [site[0], site[1]],
    };
  });
}

/**
 * Lloyd relaxation: repeatedly move each site to its cell centroid.
 * Returns the relaxed sites (input not mutated).
 */
export function lloydRelaxation(sites, bounds, iterations = 10) {
  let current = sites.map((s) => [s[0], s[1]]);
  for (let it = 0; it < iterations; it++) {
    const cells = computeVoronoi(current, bounds);
    current = cells.map((cell, i) => (cell.area > 0 ? cell.centroid : current[i]));
  }
  return current;
}

/**
 * Extrude a convex 2D polygon into a prism mesh of the given depth
 * (z from 0 to depth). Returns {positions: Float32Array, indices: Uint32Array}.
 */
export function shardPrism(polygon, depth) {
  const k = polygon.length;
  const positions = new Float32Array(k * 2 * 3);
  for (let i = 0; i < k; i++) {
    positions.set([polygon[i][0], polygon[i][1], 0], i * 3);
    positions.set([polygon[i][0], polygon[i][1], depth], (k + i) * 3);
  }
  const indices = [];
  // Fans: for a CCW polygon (seen from +z) the bottom fan must wind CW from
  // above (outward normal -z) and the top fan CCW (outward +z); reversed
  // for a CW polygon. Getting this wrong costs exactly 2/3 of the signed
  // volume — the divergence-theorem test catches it.
  const flip = polygonArea(polygon) < 0;
  for (let i = 1; i < k - 1; i++) {
    if (flip) indices.push(0, i, i + 1); else indices.push(0, i + 1, i);
    if (flip) indices.push(k, k + i + 1, k + i); else indices.push(k, k + i, k + i + 1);
  }
  for (let i = 0; i < k; i++) {
    const j = (i + 1) % k;
    if (flip) indices.push(i, k + i, j, j, k + i, k + j);
    else indices.push(i, j, k + i, j, k + j, k + i);
  }
  return { positions, indices: new Uint32Array(indices) };
}

/**
 * Fracture a rectangular plate into Voronoi shards.
 * @returns array of {polygon, area, centroid, volume, mesh}
 */
export function fracturePlate({ width, height, sites, depth = 0.1 }) {
  const bounds = { minX: -width / 2, minY: -height / 2, maxX: width / 2, maxY: height / 2 };
  return computeVoronoi(sites, bounds)
    .filter((cell) => cell.area > 1e-12)
    .map((cell) => ({
      ...cell,
      volume: cell.area * depth,
      mesh: shardPrism(cell.polygon, depth),
    }));
}

/** Deterministic site scatter (mulberry32) for reproducible fractures. */
export function scatterSites(count, bounds, seed = 1) {
  let a = seed >>> 0;
  const rand = () => {
    a |= 0; a = a + 0x6d2b79f5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const sites = [];
  for (let i = 0; i < count; i++) {
    sites.push([
      bounds.minX + rand() * (bounds.maxX - bounds.minX),
      bounds.minY + rand() * (bounds.maxY - bounds.minY),
    ]);
  }
  return sites;
}
