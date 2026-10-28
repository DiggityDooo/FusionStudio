'use strict';
// Floor plan to 3D (A20 "Floor plan to 3D conversion"): extrude 2D
// wall segments into 3D walls with door/window openings. Openings
// split each wall into full-height runs, sills (below windows), and
// lintels (above openings). Returns the mesh plus the piece list so
// callers can audit exactly what was built.

function wallFrame(wall) {
  const dx = wall.to[0] - wall.from[0];
  const dz = wall.to[1] - wall.from[1];
  const length = Math.hypot(dx, dz);
  if (length < 1e-12) throw new Error('floorplan: zero-length wall');
  const dir = [dx / length, dz / length];
  const normal = [-dir[1], dir[0]]; // in XZ: perpendicular
  return { dir, normal, length };
}

/** Validate + normalize openings: sorted, inside the wall, non-overlapping. */
function normalizeOpenings(wall, length) {
  const openings = (wall.openings || []).map((o) => ({
    offset: o.offset,
    width: o.width,
    height: o.height,
    sill: o.sill ?? 0,
  }));
  for (const o of openings) {
    if (o.width <= 0 || o.height <= 0) throw new Error('floorplan: opening dimensions must be positive');
    if (o.offset < 0 || o.offset + o.width > length) throw new Error('floorplan: opening lies outside the wall');
    if (o.sill + o.height > wall.height) throw new Error('floorplan: opening exceeds wall height');
  }
  openings.sort((a, b) => a.offset - b.offset);
  for (let i = 1; i < openings.length; i++) {
    if (openings[i].offset < openings[i - 1].offset + openings[i - 1].width) {
      throw new Error('floorplan: overlapping openings');
    }
  }
  return openings;
}

/**
 * Decompose one wall into axis-aligned (wall-frame) boxes:
 * { along: [start, end], vertical: [bottom, top] } in wall-local
 * coordinates (x along wall, y up, z across thickness centered).
 */
export function wallPieces(wall) {
  const { length } = wallFrame(wall);
  const openings = normalizeOpenings(wall, length);
  const height = wall.height;
  const pieces = [];
  let cursor = 0;
  for (const o of openings) {
    if (o.offset > cursor) pieces.push({ along: [cursor, o.offset], vertical: [0, height], kind: 'run' });
    if (o.sill > 0) pieces.push({ along: [o.offset, o.offset + o.width], vertical: [0, o.sill], kind: 'sill' });
    if (o.sill + o.height < height) {
      pieces.push({ along: [o.offset, o.offset + o.width], vertical: [o.sill + o.height, height], kind: 'lintel' });
    }
    cursor = o.offset + o.width;
  }
  if (cursor < length) pieces.push({ along: [cursor, length], vertical: [0, height], kind: 'run' });
  return { pieces, length, openings };
}

function emitBox(positions, normals, indices, frame, wall, piece) {
  const [a0, a1] = piece.along;
  const [v0, v1] = piece.vertical;
  const t = wall.thickness / 2;
  const corner = (along, y, side) => {
    const px = wall.from[0] + frame.dir[0] * along + frame.normal[0] * side;
    const pz = wall.from[1] + frame.dir[1] * along + frame.normal[1] * side;
    return [px, y, pz];
  };
  // 8 corners: (along a0/a1) x (y v0/v1) x (side -t/+t)
  const c = [];
  for (const along of [a0, a1]) for (const y of [v0, v1]) for (const side of [-t, t]) {
    c.push(corner(along, y, side));
  }
  // c index: along*4 + y*2 + side
  const faces = [
    // outward-facing quads (two triangles each), normals computed below per-face constant
    { quad: [0, 1, 3, 2], n: [-frame.dir[0], 0, -frame.dir[1]] }, // start cap
    { quad: [5, 4, 6, 7], n: [frame.dir[0], 0, frame.dir[1]] }, // end cap
    { quad: [1, 5, 7, 3], n: [frame.normal[0], 0, frame.normal[1]] }, // +side
    { quad: [4, 0, 2, 6], n: [-frame.normal[0], 0, -frame.normal[1]] }, // -side
    { quad: [2, 3, 7, 6], n: [0, 1, 0] }, // top
    { quad: [4, 5, 1, 0], n: [0, -1, 0] }, // bottom
  ];
  for (const face of faces) {
    const base = positions.length / 3;
    for (const ci of face.quad) {
      positions.push(c[ci][0], c[ci][1], c[ci][2]);
      normals.push(face.n[0], face.n[1], face.n[2]);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

/**
 * Build walls into a mesh. walls: [{ from: [x,z], to: [x,z],
 * height, thickness, openings?: [{ offset, width, height, sill? }] }]
 * Returns { mesh, pieces } where pieces are world-space boxes
 * { min, max } in wall-frame terms flattened for auditing:
 * each entry { wallIndex, kind, along, vertical, frame }.
 */
export function buildFloorPlan(walls) {
  const positions = [];
  const normals = [];
  const indices = [];
  const audited = [];
  walls.forEach((wall, wallIndex) => {
    if (wall.height <= 0 || wall.thickness <= 0) throw new Error('floorplan: wall height/thickness must be positive');
    const frame = wallFrame(wall);
    const { pieces } = wallPieces(wall);
    for (const piece of pieces) {
      emitBox(positions, normals, indices, frame, wall, piece);
      audited.push({ wallIndex, kind: piece.kind, along: piece.along, vertical: piece.vertical });
    }
  });
  return {
    mesh: {
      positions: Float32Array.from(positions),
      normals: Float32Array.from(normals),
      indices: Uint32Array.from(indices),
    },
    pieces: audited,
  };
}

/** Analytic volume: wall boxes minus opening voids (per wall; corner overlaps between walls not accounted). */
export function floorPlanVolume(walls) {
  let volume = 0;
  for (const wall of walls) {
    const { length, openings } = wallPieces(wall);
    volume += length * wall.height * wall.thickness;
    for (const o of openings) volume -= o.width * o.height * wall.thickness;
  }
  return volume;
}
