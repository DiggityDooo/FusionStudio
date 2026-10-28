'use strict';
// Road/spline ribbon generation (A20 "Road/spline/river/water-body
// tools"): Catmull-Rom spline through control points, parallel-
// transport frames (twist-stable even through vertical sections),
// and a flat ribbon mesh of constant width with arc-length UVs.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => {
  const l = Math.hypot(...a);
  if (l < 1e-12) throw new Error('ribbon: degenerate vector');
  return a.map((v) => v / l);
};

/** Sample a Catmull-Rom spline (open or closed) at even parameter steps. */
export function sampleCatmullRom(controlPoints, { samplesPerSegment = 8, closed = false } = {}) {
  if (controlPoints.length < 2) throw new Error('ribbon: needs >= 2 control points');
  if (closed && controlPoints.length < 3) throw new Error('ribbon: closed spline needs >= 3 points');
  const pts = controlPoints;
  const get = (i) => {
    if (closed) return pts[((i % pts.length) + pts.length) % pts.length];
    return pts[Math.max(0, Math.min(pts.length - 1, i))];
  };
  const segments = closed ? pts.length : pts.length - 1;
  const samples = [];
  for (let s = 0; s < segments; s++) {
    const p0 = get(s - 1), p1 = get(s), p2 = get(s + 1), p3 = get(s + 2);
    for (let j = 0; j < samplesPerSegment; j++) {
      const t = j / samplesPerSegment, t2 = t * t, t3 = t2 * t;
      samples.push([0, 1, 2].map((k) => 0.5 * (
        2 * p1[k] + (-p0[k] + p2[k]) * t
        + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
        + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3
      )));
    }
  }
  if (!closed) samples.push([...pts[pts.length - 1]]);
  return samples;
}

/** Rotate vector v by the rotation taking unit a to unit b (Rodrigues). */
function rotateFromTo(v, a, b) {
  const axisRaw = cross(a, b);
  const axisLen = Math.hypot(...axisRaw);
  const cos = Math.max(-1, Math.min(1, dot(a, b)));
  if (axisLen < 1e-9) {
    if (cos > 0) return [...v];
    // 180-degree turn: pick any perpendicular axis.
    const perp = Math.abs(a[0]) < 0.9 ? norm(cross(a, [1, 0, 0])) : norm(cross(a, [0, 1, 0]));
    return sub(scale(perp, 2 * dot(perp, v)), v);
  }
  const axis = scale(axisRaw, 1 / axisLen);
  const sin = axisLen;
  return add(
    add(scale(v, cos), scale(cross(axis, v), sin)),
    scale(axis, dot(axis, v) * (1 - cos)),
  );
}

/**
 * Parallel-transport frames along a polyline: returns
 * [{ point, tangent, side, up }] with side/up perpendicular to the
 * tangent and minimally twisted from sample to sample.
 */
export function parallelTransportFrames(points, { closed = false, initialUp = [0, 1, 0] } = {}) {
  const n = points.length;
  const count = closed ? n : n;
  const tangents = [];
  for (let i = 0; i < count; i++) {
    const prev = points[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const next = points[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    tangents.push(norm(sub(next, prev)));
  }
  // Initial up: the world up projected perpendicular to the tangent.
  let up = sub(initialUp, scale(tangents[0], dot(initialUp, tangents[0])));
  if (Math.hypot(...up) < 1e-6) up = sub([1, 0, 0], scale(tangents[0], tangents[0][0]));
  up = norm(up);
  const frames = [];
  for (let i = 0; i < count; i++) {
    if (i > 0) {
      up = norm(rotateFromTo(up, tangents[i - 1], tangents[i]));
      // Re-orthogonalize against accumulated drift.
      up = norm(sub(up, scale(tangents[i], dot(up, tangents[i]))));
    }
    const side = norm(cross(up, tangents[i]));
    frames.push({ point: points[i], tangent: tangents[i], side, up });
  }
  return frames;
}

/**
 * Build a ribbon mesh. Returns the standard mesh convention:
 * { positions, normals, uvs, indices } (Float32/Uint32 arrays).
 * u runs along arc length / width (tileable), v across [0, 1].
 */
export function buildRibbon(controlPoints, { width = 2, samplesPerSegment = 8, closed = false, heightfield = null, heightOffset = 0.02 } = {}) {
  if (width <= 0) throw new Error('ribbon: width must be positive');
  const samples = sampleCatmullRom(controlPoints, { samplesPerSegment, closed });
  const frames = parallelTransportFrames(samples, { closed });
  const rows = closed ? frames.length + 1 : frames.length;
  const positions = new Float32Array(rows * 2 * 3);
  const normals = new Float32Array(rows * 2 * 3);
  const uvs = new Float32Array(rows * 2 * 2);
  const half = width / 2;
  let arc = 0;
  for (let i = 0; i < rows; i++) {
    const frame = frames[i % frames.length];
    if (i > 0) {
      const prev = frames[(i - 1) % frames.length];
      arc += Math.hypot(...sub(frame.point, prev.point));
    }
    const left = add(frame.point, scale(frame.side, -half));
    const right = add(frame.point, scale(frame.side, half));
    positions.set(left, i * 6);
    positions.set(right, i * 6 + 3);
    normals.set(frame.up, i * 6);
    normals.set(frame.up, i * 6 + 3);
    uvs.set([arc / width, 0], i * 4);
    uvs.set([arc / width, 1], i * 4 + 2);
  }
  const indices = [];
  for (let i = 0; i < rows - 1; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
    indices.push(a, b, c, b, d, c);
  }
  if (heightfield) {
    // Terrain conformance: drape every vertex onto the heightfield
    // and derive normals from its gradient.
    const step = 0.25;
    for (let v = 0; v < rows * 2; v++) {
      const x = positions[v * 3], z = positions[v * 3 + 2];
      positions[v * 3 + 1] = heightfield(x, z) + heightOffset;
      const gx = (heightfield(x + step, z) - heightfield(x - step, z)) / (2 * step);
      const gz = (heightfield(x, z + step) - heightfield(x, z - step)) / (2 * step);
      const inv = 1 / Math.hypot(gx, 1, gz);
      normals[v * 3] = -gx * inv;
      normals[v * 3 + 1] = inv;
      normals[v * 3 + 2] = -gz * inv;
    }
  }
  return { positions, normals, uvs, indices: new Uint32Array(indices), arcLength: arc };
}
