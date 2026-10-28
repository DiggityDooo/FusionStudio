'use strict';
// Subsurface scattering profile (A12 "Subsurface and SSS
// rendering modes"): the normalized-diffusion reflectance
// profile (Christensen-Burley family) used to blur lighting by
// scattering distance, plus wrap diffuse for cheap SSS shading.
//   R(r) = (exp(-r/d) + exp(-r/(3d))) / (8 * pi * d * r)
// which is normalized: the integral of R(r) * 2 * pi * r over
// r in [0, inf) is exactly 1 (the two terms contribute 1/4 and
// 3/4), so a profile blur conserves energy per channel.
// Per-channel scatter distances model wavelength-dependent
// transport (red travels farthest in skin-like media).

/**
 * Radial reflectance at distance r (r > 0) for scatter distance
 * d. At r = 0 the profile has an integrable 1/r singularity; the
 * value is evaluated at a small epsilon instead (documented).
 */
export function scatteringProfile(r, d) {
  if (!(d > 0)) throw new Error('sss: scatter distance must be positive');
  if (!(r >= 0)) throw new Error('sss: radius must be >= 0');
  const rr = Math.max(r, d * 1e-6);
  return (Math.exp(-rr / d) + Math.exp(-rr / (3 * d))) / (8 * Math.PI * d * rr);
}

/** RGB profile at distance r for a material scatter radius. */
export function scatteringProfileRGB(r, { radius = 1, channelScale = [1, 0.55, 0.32] } = {}) {
  if (!(radius > 0)) throw new Error('sss: radius must be positive');
  if (channelScale.length !== 3 || channelScale.some((s) => !(s > 0))) {
    throw new Error('sss: channelScale must be three positive numbers');
  }
  return channelScale.map((s) => scatteringProfile(r, radius * s));
}

/**
 * Discrete blur kernel (weights over texel offsets) built from
 * the profile: weight_i = R(|offset_i|), normalized to sum 1 so
 * the blur conserves energy exactly.
 */
export function profileKernel({ radius = 1, channelScale = [1, 0.55, 0.32], texelSize = 0.1, taps = 8 } = {}) {
  if (!(texelSize > 0)) throw new Error('sss: texelSize must be positive');
  if (!Number.isInteger(taps) || taps < 1) throw new Error('sss: taps must be a positive integer');
  const offsets = [];
  for (let i = -taps; i <= taps; i++) offsets.push(i);
  const raw = offsets.map((i) => scatteringProfileRGB(Math.abs(i) * texelSize, { radius, channelScale }));
  const sums = [0, 1, 2].map((c) => raw.reduce((s, w) => s + w[c], 0));
  const weights = raw.map((w) => [w[0] / sums[0], w[1] / sums[1], w[2] / sums[2]]);
  return { offsets, weights };
}

/**
 * Wrap diffuse: clamp((cosTheta + wrap) / (1 + wrap), 0, 1) —
 * light wraps around the terminator; wrap = 0 is plain Lambert.
 */
export function wrapDiffuse(cosTheta, wrap = 0.5) {
  if (!(wrap >= 0)) throw new Error('sss: wrap must be >= 0');
  return Math.min(1, Math.max(0, (cosTheta + wrap) / (1 + wrap)));
}

/**
 * Translucency/back-light term: light shining through the
 * material toward the viewer, attenuated by thickness.
 * viewDir points from the surface toward the viewer; lightDir
 * is the light's travel direction (the repo convention), so the
 * term peaks when the light continues straight to the viewer:
 * intensity = pow(max(dot(view, lightTravel), 0), power) *
 * exp(-thickness / d).
 */
export function translucency(viewDir, lightDir, thickness, { power = 4, scatterDistance = 1 } = {}) {
  if (!(power > 0) || !(scatterDistance > 0)) throw new Error('sss: power/scatterDistance must be positive');
  if (!(thickness >= 0)) throw new Error('sss: thickness must be >= 0');
  const norm = (v) => {
    const len = Math.hypot(...v);
    if (len < 1e-15) throw new Error('sss: zero-length direction');
    return v.map((x) => x / len);
  };
  const v = norm(viewDir), l = norm(lightDir);
  const facing = Math.max(0, v[0] * l[0] + v[1] * l[1] + v[2] * l[2]);
  return Math.pow(facing, power) * Math.exp(-thickness / scatterDistance);
}
