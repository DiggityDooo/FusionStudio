'use strict';
// Scene units and axis conversion (A26 "Scene units and axis
// conversion (Y-up/Z-up)"). Frames are defined by their basis vectors
// in one canonical frame (Maya-style: X right, Y up, Z toward viewer,
// right-handed). A conversion between any two frames is the orthogonal
// matrix B_dst^-1 * B_src; since the bases are orthonormal this is
// B_dst^T * B_src. Handedness-changing conversions (determinant -1)
// flip triangle winding, and this kernel says so loudly instead of
// silently mirroring geometry.

// Basis vectors of each frame's X, Y, Z axes, in canonical coords.
const FRAMES = {
  maya: { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] },       // Y-up, right-handed
  blender: { x: [1, 0, 0], y: [0, 0, -1], z: [0, 1, 0] },   // Z-up, right-handed
  unity: { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, -1] },     // Y-up, left-handed
  unreal: { x: [0, 0, -1], y: [1, 0, 0], z: [0, 1, 0] },    // Z-up, left-handed
};

export const FRAME_NAMES = Object.keys(FRAMES);

export const UNIT_SCALES = { m: 1, cm: 0.01, mm: 0.001, km: 1000, in: 0.0254, ft: 0.3048 };

function basisMatrix(frame) {
  const f = FRAMES[frame];
  if (!f) throw new Error(`scene-units: unknown frame '${frame}' (have ${FRAME_NAMES.join(', ')})`);
  // Columns are the frame's axis vectors.
  return [
    f.x[0], f.y[0], f.z[0],
    f.x[1], f.y[1], f.z[1],
    f.x[2], f.y[2], f.z[2],
  ];
}

function matMul(a, b) {
  const out = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    for (let k = 0; k < 3; k++) out[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  }
  return out;
}

function transpose(m) {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

function determinant(m) {
  return m[0] * (m[4] * m[8] - m[5] * m[7])
       - m[1] * (m[3] * m[8] - m[5] * m[6])
       + m[2] * (m[3] * m[7] - m[4] * m[6]);
}

/** Row-major 3x3 converting coordinates from one frame to another. */
export function conversionMatrix(from, to) {
  if (from === to) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  return matMul(transpose(basisMatrix(to)), basisMatrix(from));
}

/** True when the conversion mirrors geometry (handedness change). */
export function flipsWinding(from, to) {
  return determinant(conversionMatrix(from, to)) < 0;
}

export function convertVector(m, v) {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/** Convert a flat position/direction array; returns a new Float32Array. */
export function convertPositions(positions, m, scale = 1) {
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const v = convertVector(m, [positions[i], positions[i + 1], positions[i + 2]]);
    out[i] = v[0] * scale; out[i + 1] = v[1] * scale; out[i + 2] = v[2] * scale;
  }
  return out;
}

/** Reverse each triangle's winding; returns a new Uint32Array. */
export function flipWinding(indices) {
  const out = new Uint32Array(indices.length);
  for (let t = 0; t < indices.length; t += 3) {
    out[t] = indices[t]; out[t + 1] = indices[t + 2]; out[t + 2] = indices[t + 1];
  }
  return out;
}

export function unitScale(fromUnit, toUnit) {
  const a = UNIT_SCALES[fromUnit], b = UNIT_SCALES[toUnit];
  if (a === undefined || b === undefined) {
    throw new Error(`scene-units: unknown unit '${a === undefined ? fromUnit : toUnit}' (have ${Object.keys(UNIT_SCALES).join(', ')})`);
  }
  return a / b;
}

/**
 * Convert a mesh between frames and units. Returns new arrays; indices
 * are winding-flipped iff the frame change mirrors. Normals rotate
 * with the same matrix (orthogonal, so no inverse-transpose needed)
 * and are not unit-scaled.
 */
export function convertMesh(mesh, { from, to, fromUnit = 'm', toUnit = 'm' } = {}) {
  const m = conversionMatrix(from, to);
  const scale = unitScale(fromUnit, toUnit);
  const result = {
    positions: convertPositions(mesh.positions, m, scale),
    indices: flipsWinding(from, to) ? flipWinding(mesh.indices) : new Uint32Array(mesh.indices),
  };
  if (mesh.normals) result.normals = convertPositions(mesh.normals, m, 1);
  result.windingFlipped = flipsWinding(from, to);
  return result;
}

function quatToMatrix(q) {
  const [x, y, z, w] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ];
}

function matrixToQuat(m) {
  const trace = m[0] + m[4] + m[8];
  let x, y, z, w;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    w = s / 4; x = (m[7] - m[5]) / s; y = (m[2] - m[6]) / s; z = (m[3] - m[1]) / s;
  } else if (m[0] > m[4] && m[0] > m[8]) {
    const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2;
    w = (m[7] - m[5]) / s; x = s / 4; y = (m[1] + m[3]) / s; z = (m[2] + m[6]) / s;
  } else if (m[4] > m[8]) {
    const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2;
    w = (m[2] - m[6]) / s; x = (m[1] + m[3]) / s; y = s / 4; z = (m[5] + m[7]) / s;
  } else {
    const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2;
    w = (m[3] - m[1]) / s; x = (m[2] + m[6]) / s; y = (m[5] + m[7]) / s; z = s / 4;
  }
  const len = Math.hypot(x, y, z, w) || 1;
  return [x / len, y / len, z / len, w / len];
}

/**
 * Convert a quaternion [x,y,z,w] between frames:
 * q' = C * q * C^-1 with C the frame conversion. For mirrored
 * conversions this is the standard basis-change conjugation; note a
 * mirrored frame also negates the rotation sense, which the
 * conjugation accounts for.
 */
export function convertQuaternion(q, from, to) {
  const c = conversionMatrix(from, to);
  const r = quatToMatrix(q);
  const converted = matMul(matMul(c, r), transpose(c));
  return matrixToQuat(converted);
}
