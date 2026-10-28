// Parametric feature tree (A3 feature tree / configurations baseline).
// Features build indexed triangle meshes from named parameters. Editing a
// parameter or applying a variant rebuilds downstream geometry. Meshes are
// { positions: Float32Array, indices: Uint32Array } in millimetre-style
// model units (unit-agnostic).

function resolveParams(tree, spec, out = {}) {
  for (const [key, value] of Object.entries(spec || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value) && 'param' in value) {
      if (!(value.param in tree.parameters)) throw new Error(`Unknown parameter: ${value.param}`);
      out[key] = tree.parameters[value.param];
    } else if (Array.isArray(value)) {
      out[key] = value.map((v) => {
        if (v && typeof v === 'object' && 'param' in v) {
          if (!(v.param in tree.parameters)) throw new Error(`Unknown parameter: ${v.param}`);
          return tree.parameters[v.param];
        }
        return v;
      });
    } else out[key] = value;
  }
  return out;
}

export function createFeatureTree() {
  return { parameters: {}, features: [], variants: {} };
}

export function setParameter(tree, name, value) {
  if (!Number.isFinite(value)) throw new Error('Parameter value must be finite.');
  tree.parameters[name] = value;
  return tree;
}

export function defineVariant(tree, name, values) {
  tree.variants[name] = { ...values };
  return tree;
}

export function applyVariant(tree, name) {
  const variant = tree.variants[name];
  if (!variant) throw new Error(`Unknown variant: ${name}`);
  for (const [key, value] of Object.entries(variant)) setParameter(tree, key, value);
  return tree;
}

const FEATURE_TYPES = ['box', 'cylinder', 'sphere', 'extrude', 'revolve', 'transform', 'patternLinear', 'mirror'];

export function addFeature(tree, feature) {
  if (!FEATURE_TYPES.includes(feature.type)) throw new Error(`Unknown feature type: ${feature.type}`);
  if (!feature.id) throw new Error('Feature needs an id.');
  if (tree.features.some((f) => f.id === feature.id)) throw new Error(`Duplicate feature id: ${feature.id}`);
  tree.features.push({ suppressed: false, ...feature });
  return feature;
}

export function suppressFeature(tree, id, suppressed = true) {
  const f = tree.features.find((x) => x.id === id);
  if (!f) throw new Error(`Unknown feature: ${id}`);
  f.suppressed = suppressed;
  return f;
}

// --- mesh helpers -----------------------------------------------------------

function mesh(positions, indices) {
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

export function mergeMeshes(meshes) {
  const positions = [], indices = [];
  for (const m of meshes) {
    const base = positions.length / 3;
    positions.push(...m.positions);
    for (const i of m.indices) indices.push(i + base);
  }
  return mesh(positions, indices);
}

export function transformMesh(m, matrix) {
  const out = new Float32Array(m.positions.length);
  for (let i = 0; i < m.positions.length; i += 3) {
    const x = m.positions[i], y = m.positions[i + 1], z = m.positions[i + 2];
    out[i] = matrix[0] * x + matrix[1] * y + matrix[2] * z + matrix[3];
    out[i + 1] = matrix[4] * x + matrix[5] * y + matrix[6] * z + matrix[7];
    out[i + 2] = matrix[8] * x + matrix[9] * y + matrix[10] * z + matrix[11];
  }
  return { positions: out, indices: m.indices };
}

export const translateMatrix = (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z];
export const scaleMatrix = (x, y, z) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0];
export function rotateZMatrix(deg) {
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0];
}

function boxMesh({ size }) {
  const [x, y, z] = size.map((v) => v / 2);
  const v = [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]];
  const faces = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
  const positions = [], indices = [];
  for (const f of faces) { const b = positions.length / 3; f.forEach((i) => positions.push(...v[i])); indices.push(b, b + 2, b + 1, b, b + 3, b + 2); }
  return mesh(positions, indices);
}

function cylinderMesh({ radius, height, segments = 48 }) {
  const positions = [], indices = [];
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i <= segments; i++) {
      const a = i / segments * Math.PI * 2;
      positions.push(radius * Math.cos(a), radius * Math.sin(a), side * height);
    }
  }
  for (let i = 0; i < segments; i++) {
    const a = i, b = i + 1, c = i + segments + 1, d = c + 1;
    indices.push(a, b, c, b, d, c);
  }
  const bottom = positions.length / 3; positions.push(0, 0, 0);
  const top = positions.length / 3; positions.push(0, 0, height);
  for (let i = 0; i < segments; i++) {
    indices.push(bottom, i + 1, i);
    indices.push(top, i + segments + 1, i + segments + 2);
  }
  return mesh(positions, indices);
}

function sphereMesh({ radius, widthSegs = 32, heightSegs = 16 }) {
  const positions = [], indices = [];
  for (let j = 0; j <= heightSegs; j++) {
    const phi = j / heightSegs * Math.PI;
    for (let i = 0; i <= widthSegs; i++) {
      const theta = i / widthSegs * Math.PI * 2;
      positions.push(radius * Math.sin(phi) * Math.cos(theta), radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi));
    }
  }
  for (let j = 0; j < heightSegs; j++) for (let i = 0; i < widthSegs; i++) {
    const a = j * (widthSegs + 1) + i, b = a + 1, c = a + widthSegs + 1, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  return mesh(positions, indices);
}

// Triangulate a simple polygon (ear clipping, CCW input in XY).
function triangulatePolygon(points) {
  const idx = points.map((_, i) => i);
  const area = points.reduce((s, p, i) => { const q = points[(i + 1) % points.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
  if (area < 0) idx.reverse();
  const tris = [];
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const prev = points[idx[(i - 1 + idx.length) % idx.length]], cur = points[idx[i]], next = points[idx[(i + 1) % idx.length]];
      if (cross(prev, cur, next) <= 0) continue;
      let empty = true;
      for (const j of idx) {
        const p = points[j];
        if (p === prev || p === cur || p === next) continue;
        if (cross(prev, cur, p) >= 0 && cross(cur, next, p) >= 0 && cross(next, prev, p) >= 0) { empty = false; break; }
      }
      if (empty) { tris.push(idx[(i - 1 + idx.length) % idx.length], idx[i], idx[(i + 1) % idx.length]); idx.splice(i, 1); clipped = true; break; }
    }
    if (!clipped) throw new Error('Polygon triangulation failed (self-intersecting profile?).');
  }
  if (idx.length === 3) tris.push(...idx);
  return tris;
}

function extrudeMesh({ profile, depth }) {
  if (!Array.isArray(profile) || profile.length < 3) throw new Error('Extrude profile needs at least three points.');
  const tris = triangulatePolygon(profile);
  const positions = [], indices = [];
  for (const [x, y] of profile) positions.push(x, y, 0);
  for (const [x, y] of profile) positions.push(x, y, depth);
  const n = profile.length;
  for (let t = 0; t < tris.length; t += 3) {
    indices.push(tris[t + 2], tris[t + 1], tris[t]); // bottom (facing -Z)
    indices.push(tris[t] + n, tris[t + 1] + n, tris[t + 2] + n); // top
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.push(i, j, j + n, i, j + n, i + n);
  }
  return mesh(positions, indices);
}

function revolveMesh({ profile, segments = 64 }) {
  // Profile points are [radius, z], revolved about the Z axis.
  const positions = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const a = i / segments * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    for (const [r, z] of profile) positions.push(r * c, r * s, z);
  }
  const rows = profile.length;
  for (let i = 0; i < segments; i++) for (let j = 0; j < rows - 1; j++) {
    const a = i * rows + j, b = a + rows, c = a + 1, d = b + 1;
    indices.push(a, b, c, c, b, d);
  }
  return mesh(positions, indices);
}

// --- build ------------------------------------------------------------------

const BUILDERS = {
  box: (p) => boxMesh(p),
  cylinder: (p) => cylinderMesh(p),
  sphere: (p) => sphereMesh(p),
  extrude: (p) => extrudeMesh(p),
  revolve: (p) => revolveMesh(p),
};

export function buildFeatureTree(tree, { upto = null } = {}) {
  const results = new Map();
  for (const feature of tree.features) {
    if (feature.suppressed) continue;
    const params = resolveParams(tree, feature.params);
    let built;
    if (BUILDERS[feature.type]) {
      built = BUILDERS[feature.type](params);
    } else if (feature.type === 'transform') {
      const base = results.get(feature.base);
      if (!base) throw new Error(`Feature ${feature.id} references missing/suppressed base ${feature.base}.`);
      const matrix = feature.matrix === 'rotateZ' ? rotateZMatrix(params.degrees || 0)
        : feature.matrix === 'scale' ? scaleMatrix(...(params.factor || [1, 1, 1]))
          : translateMatrix(...(params.offset || [0, 0, 0]));
      built = transformMesh(base, matrix);
    } else if (feature.type === 'patternLinear') {
      const base = results.get(feature.base);
      if (!base) throw new Error(`Feature ${feature.id} references missing/suppressed base ${feature.base}.`);
      const copies = [];
      for (let i = 0; i < (params.count || 1); i++) {
        copies.push(transformMesh(base, translateMatrix((params.spacing?.[0] || 0) * i, (params.spacing?.[1] || 0) * i, (params.spacing?.[2] || 0) * i)));
      }
      built = mergeMeshes(copies);
    } else if (feature.type === 'mirror') {
      const base = results.get(feature.base);
      if (!base) throw new Error(`Feature ${feature.id} references missing/suppressed base ${feature.base}.`);
      const flipped = transformMesh(base, scaleMatrix(params.axis === 'y' ? 1 : -1, params.axis === 'y' ? -1 : 1, params.axis === 'z' ? -1 : 1));
      // Flip winding so mirrored faces keep outward orientation.
      const idx = flipped.indices.slice();
      for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
      built = { positions: flipped.positions, indices: idx };
    }
    results.set(feature.id, built);
    if (upto && feature.id === upto) break;
  }
  return results;
}

// --- measurement (exact-ish mesh quantities) --------------------------------

export function meshBounds(m) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], m.positions[i + a]);
      max[a] = Math.max(max[a], m.positions[i + a]);
    }
  }
  return { min, max, size: max.map((v, a) => v - min[a]) };
}

export function meshVolume(m) {
  let volume = 0;
  for (let i = 0; i < m.indices.length; i += 3) {
    const a = m.indices[i] * 3, b = m.indices[i + 1] * 3, c = m.indices[i + 2] * 3;
    const p = m.positions;
    volume += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
      - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c])
      + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
  }
  return volume;
}

export function meshSurfaceArea(m) {
  let area = 0;
  for (let i = 0; i < m.indices.length; i += 3) {
    const a = m.indices[i] * 3, b = m.indices[i + 1] * 3, c = m.indices[i + 2] * 3;
    const p = m.positions;
    const ab = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
    const ac = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    area += 0.5 * Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]);
  }
  return area;
}
