'use strict';
// Monte Carlo irradiance / ambient occlusion (A10 "Global
// illumination: path tracing, irradiance cache, light cache,
// photon mapping, ray-traced GI"): cosine-weighted hemisphere
// sampling with the matching pdf (cos/pi), so the estimator
//   E ~= (1/N) sum( L * cos(theta_i) / pdf_i * visibility_i )
// has a zero-variance identity on an unoccluded uniform sky:
// every sample contributes exactly pi * L. Occlusion is supplied
// by the caller as (origin, direction) => boolean, keeping the
// estimator geometry-agnostic; an analytic ray-sphere occluder
// helper is included.

import { mulberry32 } from './scatter.js';

function tangentFrame(normal) {
  const ref = Math.abs(normal[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const t = [
    ref[1] * normal[2] - ref[2] * normal[1],
    ref[2] * normal[0] - ref[0] * normal[2],
    ref[0] * normal[1] - ref[1] * normal[0],
  ];
  const tl = Math.hypot(...t);
  const tangent = t.map((v) => v / tl);
  const bitangent = [
    normal[1] * tangent[2] - normal[2] * tangent[1],
    normal[2] * tangent[0] - normal[0] * tangent[2],
    normal[0] * tangent[1] - normal[1] * tangent[0],
  ];
  return { tangent, bitangent };
}

/** Cosine-weighted hemisphere direction (Malley's method). */
export function cosineHemisphereDirection(normal, u1, u2) {
  const len = Math.hypot(...normal);
  if (len < 1e-15) throw new Error('gi: normal must be non-zero');
  const n = normal.map((v) => v / len);
  const { tangent, bitangent } = tangentFrame(n);
  const r = Math.sqrt(Math.min(1, Math.max(0, u1)));
  const phi = 2 * Math.PI * u2;
  const lx = r * Math.cos(phi), ly = r * Math.sin(phi);
  const lz = Math.sqrt(Math.max(0, 1 - u1));
  return [
    tangent[0] * lx + bitangent[0] * ly + n[0] * lz,
    tangent[1] * lx + bitangent[1] * ly + n[1] * lz,
    tangent[2] * lx + bitangent[2] * ly + n[2] * lz,
  ];
}

/** Ray-sphere intersection distance (smallest positive t) or null. */
export function raySphere(origin, direction, center, radius) {
  const ox = origin[0] - center[0], oy = origin[1] - center[1], oz = origin[2] - center[2];
  const b = ox * direction[0] + oy * direction[1] + oz * direction[2];
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const t0 = -b - root;
  if (t0 > 1e-9) return t0;
  const t1 = -b + root;
  return t1 > 1e-9 ? t1 : null;
}

/**
 * Estimate irradiance from a uniform sky of the given radiance.
 * isOccluded(origin, direction) => boolean (may be null for an
 * open sky). Returns { irradiance, ambientOcclusion (0..1,
 * irradiance normalized by pi * radiance), standardError (on
 * irradiance), samples }.
 */
export function estimateIrradiance({ point, normal, isOccluded = null, samples = 1024, seed = 1, radiance = 1 } = {}) {
  if (!Number.isInteger(samples) || samples < 1) throw new Error('gi: samples must be a positive integer');
  if (!(radiance >= 0)) throw new Error('gi: radiance must be >= 0');
  const rng = mulberry32(seed);
  const origin = [point[0], point[1], point[2]];
  let sum = 0, sumSq = 0;
  for (let i = 0; i < samples; i++) {
    const dir = cosineHemisphereDirection(normal, rng(), rng());
    const visible = isOccluded ? (isOccluded(origin, dir) ? 0 : 1) : 1;
    // cos/pdf = pi exactly for the cosine-weighted pdf.
    const value = Math.PI * radiance * visible;
    sum += value;
    sumSq += value * value;
  }
  const mean = sum / samples;
  const variance = Math.max(0, sumSq / samples - mean * mean);
  return {
    irradiance: mean,
    ambientOcclusion: radiance > 0 ? mean / (Math.PI * radiance) : 1,
    standardError: Math.sqrt(variance / samples),
    samples,
  };
}
