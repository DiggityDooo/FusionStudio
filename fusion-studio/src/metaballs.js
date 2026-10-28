// Volume builder / metaballs (A30 baseline; also feeds A4 SDF work).
// Scalar fields are functions (x, y, z) => value; surfaces are extracted
// with marching tetrahedra over a regular grid. Vertices are welded by
// grid-edge key so the result is an indexed, watertight mesh when the
// isosurface does not touch the grid boundary.

export function metaballField(balls) {
  if (!Array.isArray(balls) || balls.length === 0) throw new Error('Metaballs need at least one ball.');
  for (const b of balls) if (!(b.radius > 0)) throw new Error('Ball radius must be positive.');
  return (x, y, z) => {
    let sum = 0;
    for (const b of balls) {
      const d2 = (x - b.center[0]) ** 2 + (y - b.center[1]) ** 2 + (z - b.center[2]) ** 2;
      const r = b.radius;
      if (d2 < r * r) {
        const t = 1 - d2 / (r * r);
        sum += (b.strength ?? 1) * t * t;
      }
    }
    return sum;
  };
}

export function sdfSphere(center, radius) {
  return (x, y, z) => radius - Math.hypot(x - center[0], y - center[1], z - center[2]);
}

export function fieldUnion(a, b) { return (x, y, z) => Math.max(a(x, y, z), b(x, y, z)); }
export function fieldIntersect(a, b) { return (x, y, z) => Math.min(a(x, y, z), b(x, y, z)); }
export function fieldSubtract(a, b) { return (x, y, z) => Math.min(a(x, y, z), -b(x, y, z)); }

export function fieldSmoothUnion(a, b, k = 0.5) {
  if (!(k > 0)) throw new Error('Smoothness k must be positive.');
  // Polynomial smooth maximum for positive-inside fields.
  return (x, y, z) => {
    const fa = a(x, y, z), fb = b(x, y, z);
    const h = Math.min(1, Math.max(0, 0.5 + 0.5 * (fa - fb) / k));
    return fa * h + fb * (1 - h) + k * h * (1 - h);
  };
}

// Cube corner offsets and the six tetrahedra around the v0-v6 diagonal.
const CORNERS = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];
const TETS = [
  [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6],
  [0, 7, 4, 6], [0, 4, 5, 6], [0, 5, 1, 6],
];

export function polygonizeField(field, { min = [-5, -5, -5], max = [5, 5, 5], res = 24, iso = 0 } = {}) {
  if (!Number.isInteger(res) || res < 1 || res > 128) throw new Error('Resolution out of range (1..128).');
  const size = max.map((v, a) => v - min[a]);
  if (size.some((v) => !(v > 0))) throw new Error('Invalid grid bounds.');
  const step = size.map((v) => v / res);
  const nx = res + 1;
  const gridIndex = (i, j, k) => i + nx * (j + nx * k);
  const values = new Float32Array(nx * nx * nx);
  const positions = new Float32Array(nx * nx * nx * 3);
  for (let k = 0; k < nx; k++) for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) {
    const x = min[0] + i * step[0], y = min[1] + j * step[1], z = min[2] + k * step[2];
    const id = gridIndex(i, j, k);
    values[id] = field(x, y, z);
    positions.set([x, y, z], id * 3);
  }
  const vertexByEdge = new Map();
  const outPos = [], outIdx = [];
  const edgeVertex = (ga, gb) => {
    const key = ga < gb ? `${ga}_${gb}` : `${gb}_${ga}`;
    if (vertexByEdge.has(key)) return vertexByEdge.get(key);
    const fa = values[ga], fb = values[gb];
    const t = (iso - fa) / ((fb - fa) || 1);
    const id = outPos.length / 3;
    for (let a = 0; a < 3; a++) outPos.push(positions[ga * 3 + a] + (positions[gb * 3 + a] - positions[ga * 3 + a]) * t);
    vertexByEdge.set(key, id);
    return id;
  };
  const gradient = (x, y, z) => {
    const e = 1e-3;
    return [field(x + e, y, z) - field(x - e, y, z), field(x, y + e, z) - field(x, y - e, z), field(x, y, z + e) - field(x, y, z - e)];
  };
  const pushTri = (a, b, c) => {
    // Orient outward: geometric normal must oppose the field gradient.
    const A = [outPos[a * 3], outPos[a * 3 + 1], outPos[a * 3 + 2]];
    const B = [outPos[b * 3], outPos[b * 3 + 1], outPos[b * 3 + 2]];
    const C = [outPos[c * 3], outPos[c * 3 + 1], outPos[c * 3 + 2]];
    const ab = B.map((v, i) => v - A[i]), ac = C.map((v, i) => v - A[i]);
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const centroid = A.map((v, i) => (v + B[i] + C[i]) / 3);
    const g = gradient(...centroid);
    if (n[0] * g[0] + n[1] * g[1] + n[2] * g[2] > 0) outIdx.push(a, c, b);
    else outIdx.push(a, b, c);
  };
  for (let k = 0; k < res; k++) for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const cornerIds = CORNERS.map(([di, dj, dk]) => gridIndex(i + di, j + dj, k + dk));
    for (const tet of TETS) {
      const ids = tet.map((c) => cornerIds[c]);
      const inside = ids.filter((id) => values[id] > iso);
      if (inside.length === 0 || inside.length === 4) continue;
      const outside = ids.filter((id) => values[id] <= iso);
      const cross = (a, b) => edgeVertex(a, b);
      if (inside.length === 1) {
        const [a] = inside;
        pushTri(cross(a, outside[0]), cross(a, outside[1]), cross(a, outside[2]));
      } else if (inside.length === 3) {
        const [o] = outside;
        pushTri(cross(o, inside[0]), cross(o, inside[1]), cross(o, inside[2]));
      } else {
        const [a, b] = inside, [c, d] = outside;
        const ac = cross(a, c), ad = cross(a, d), bc = cross(b, c), bd = cross(b, d);
        pushTri(ac, ad, bd);
        pushTri(ac, bd, bc);
      }
    }
  }
  return { positions: new Float32Array(outPos), indices: new Uint32Array(outIdx) };
}

// Convenience: polygonize metaballs around their combined bounds.
export function metaballMesh(balls, { res = 28, iso = 0.35, padding = 1 } = {}) {
  const field = metaballField(balls);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const b of balls) for (let a = 0; a < 3; a++) {
    min[a] = Math.min(min[a], b.center[a] - b.radius - padding);
    max[a] = Math.max(max[a], b.center[a] + b.radius + padding);
  }
  return polygonizeField(field, { min, max, res, iso });
}
