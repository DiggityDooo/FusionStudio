'use strict';
// Panorama / 360 rendering (A29 "Panorama (360) renders and
// interactive web viewers"): equirectangular projection math plus a
// small reference splat renderer used to verify the mapping end to
// end. Convention: direction (x east, y up, z south, north = -z);
// u goes around the horizon (u=0.5 faces north... see below), v=0 is
// the zenith, v=1 the nadir.
//
// u = fract(atan2(x, -z) / 2pi + 0.5): north (-z) -> 0.5, east -> 0.75.
// v = acos(y) / pi.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function directionToUV(dir) {
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  if (len < 1e-12) throw new Error('panorama: zero direction');
  const [x, y, z] = [dir[0] / len, dir[1] / len, dir[2] / len];
  // At the poles longitude is degenerate; pin u = 0.5 deterministically.
  let u = (Math.abs(x) < 1e-12 && Math.abs(z) < 1e-12)
    ? 0.5
    : Math.atan2(x, -z) / (2 * Math.PI) + 0.5;
  u -= Math.floor(u);
  const v = Math.acos(clamp(y, -1, 1)) / Math.PI;
  return [u, v];
}

export function uvToDirection(u, v) {
  const theta = (u - 0.5) * 2 * Math.PI; // around Y from north
  const phi = v * Math.PI;               // from zenith
  const sinPhi = Math.sin(phi);
  return [
    sinPhi * Math.sin(theta),
    Math.cos(phi),
    -sinPhi * Math.cos(theta),
  ];
}

/**
 * Reference equirect renderer: splat colored points (positions
 * relative to the camera at the origin) into an RGB image, nearest
 * point winning each pixel. Returns { width, height, data, depth }
 * with data a Uint8Array RGB and depth a Float32Array (Infinity =
 * background). Point size is one pixel -- this verifies projection
 * and occlusion, not antialiasing.
 */
export function renderPointsEquirect({ width = 64, height = 32, points = [], background = [0, 0, 0] } = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('panorama: width/height must be positive integers');
  }
  const data = new Uint8Array(width * height * 3);
  const depth = new Float32Array(width * height).fill(Infinity);
  for (let i = 0; i < width * height; i++) {
    data[i * 3] = background[0]; data[i * 3 + 1] = background[1]; data[i * 3 + 2] = background[2];
  }
  for (const point of points) {
    const dist = Math.hypot(point.position[0], point.position[1], point.position[2]);
    if (dist < 1e-9) continue;
    const [u, v] = directionToUV(point.position);
    const px = Math.min(width - 1, Math.floor(u * width));
    const py = Math.min(height - 1, Math.floor(v * height));
    const idx = py * width + px;
    if (dist < depth[idx]) {
      depth[idx] = dist;
      data[idx * 3] = point.color[0];
      data[idx * 3 + 1] = point.color[1];
      data[idx * 3 + 2] = point.color[2];
    }
  }
  return { width, height, data, depth };
}

/** Pixel-center direction for an equirect image pixel (for viewers). */
export function pixelDirection(width, height, px, py) {
  return uvToDirection((px + 0.5) / width, (py + 0.5) / height);
}
