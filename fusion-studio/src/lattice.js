'use strict';
// Lattice generation (A24 "Lattice/infill generation"): beam lattices
// filling a box volume, emitted as merged prism meshes in the repo
// convention { positions, indices, normals }. Cell types: 'grid'
// (cube edges) and 'bcc' (corners to body center). Struts are regular
// prisms; joints overlap (struts are not trimmed), which the volume
// estimator reports honestly as an upper bound.

function addPrism(P, I, a, b, radius, sides) {
  const dir = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...dir);
  if (len < 1e-9) return;
  const d = dir.map((v) => v / len);
  // Any stable perpendicular frame.
  const helper = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = [
    d[1] * helper[2] - d[2] * helper[1],
    d[2] * helper[0] - d[0] * helper[2],
    d[0] * helper[1] - d[1] * helper[0],
  ];
  const ul = Math.hypot(...u);
  const uu = u.map((v) => v / ul);
  const vv = [
    d[1] * uu[2] - d[2] * uu[1],
    d[2] * uu[0] - d[0] * uu[2],
    d[0] * uu[1] - d[1] * uu[0],
  ];
  const base = P.length / 3;
  for (const [center, flip] of [[a, 1], [b, -1]]) {
    void flip;
    for (let s = 0; s < sides; s++) {
      const ang = (s / sides) * Math.PI * 2;
      const radial = [
        uu[0] * Math.cos(ang) + vv[0] * Math.sin(ang),
        uu[1] * Math.cos(ang) + vv[1] * Math.sin(ang),
        uu[2] * Math.cos(ang) + vv[2] * Math.sin(ang),
      ];
      P.push(center[0] + radial[0] * radius, center[1] + radial[1] * radius, center[2] + radial[2] * radius);
    }
  }
  P.push(...a, ...b); // cap centers at base+2*sides, base+2*sides+1
  const capA = base + 2 * sides, capB = capA + 1;
  for (let s = 0; s < sides; s++) {
    const n = (s + 1) % sides;
    const a0 = base + s, a1 = base + n, b0 = base + sides + s, b1 = base + sides + n;
    I.push(a0, b1, b0, a0, a1, b1);       // side
    I.push(capA, a1, a0);                  // cap A (facing -dir)
    I.push(capB, b0, b1);                  // cap B (facing +dir)
  }
}

function computeNormals(positions, indices) {
  const normals = new Float32Array(positions.length);
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const ux = positions[b * 3] - ax, uy = positions[b * 3 + 1] - ay, uz = positions[b * 3 + 2] - az;
    const vx = positions[c * 3] - ax, vy = positions[c * 3 + 1] - ay, vz = positions[c * 3 + 2] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { normals[v * 3] += nx; normals[v * 3 + 1] += ny; normals[v * 3 + 2] += nz; }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= l; normals[i + 1] /= l; normals[i + 2] /= l;
  }
  return normals;
}

function latticeStruts({ size, cell, type }) {
  const [nx, ny, nz] = [0, 1, 2].map((axis) => Math.max(1, Math.round(size[axis] / cell)));
  const step = [size[0] / nx, size[1] / ny, size[2] / nz];
  const node = (i, j, k) => [i * step[0], j * step[1], k * step[2]];
  const struts = [];
  if (type === 'grid') {
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) for (let k = 0; k <= nz; k++) {
      if (i < nx) struts.push([node(i, j, k), node(i + 1, j, k)]);
      if (j < ny) struts.push([node(i, j, k), node(i, j + 1, k)]);
      if (k < nz) struts.push([node(i, j, k), node(i, j, k + 1)]);
    }
  } else if (type === 'bcc') {
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
      const center = [(i + 0.5) * step[0], (j + 0.5) * step[1], (k + 0.5) * step[2]];
      for (const di of [0, 1]) for (const dj of [0, 1]) for (const dk of [0, 1]) {
        struts.push([node(i + di, j + dj, k + dk), center]);
      }
    }
  } else {
    throw new Error(`lattice: unknown cell type '${type}' (grid, bcc)`);
  }
  return { struts, cells: [nx, ny, nz] };
}

/**
 * Generate a lattice mesh in a box from the origin to `size`.
 * Returns the mesh plus meta { strutCount, cells, totalStrutLength }.
 */
export function generateLattice({ size = [3, 3, 3], cell = 1, type = 'grid', strutRadius = 0.06, sides = 6 } = {}) {
  if (size.some((v) => !(v > 0))) throw new Error('lattice: size components must be positive');
  if (!(cell > 0) || !(strutRadius > 0)) throw new Error('lattice: cell and strutRadius must be positive');
  if (!Number.isInteger(sides) || sides < 3) throw new Error('lattice: sides must be an integer >= 3');
  const { struts, cells } = latticeStruts({ size, cell, type });
  const P = [], I = [];
  let totalStrutLength = 0;
  for (const [a, b] of struts) {
    totalStrutLength += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    addPrism(P, I, a, b, strutRadius, sides);
  }
  const mesh = {
    positions: new Float32Array(P),
    indices: new Uint32Array(I),
    normals: null,
    meta: { strutCount: struts.length, cells, totalStrutLength, type },
  };
  mesh.normals = computeNormals(mesh.positions, mesh.indices);
  return mesh;
}

/**
 * Relative density estimate: strut material volume / bounding volume.
 * Prism volume uses the exact polygon cross-section area; joint
 * overlaps are counted multiple times, so this is an upper bound
 * (exact for grid lattices measured per-strut, stated as such).
 */
export function estimateRelativeDensity({ size, cell, type, strutRadius, sides = 6 }) {
  const { struts } = latticeStruts({ size, cell, type });
  const polygonArea = 0.5 * sides * strutRadius * strutRadius * Math.sin((2 * Math.PI) / sides);
  let material = 0;
  for (const [a, b] of struts) {
    material += polygonArea * Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return material / (size[0] * size[1] * size[2]);
}
