'use strict';
// Hair shading (A17 "Hair shading (melanin-based, color ramp,
// root/tip color)"): a melanin absorption model in the Chiang et
// al. / Principled-Hair family. Two pigment endmembers
// (eumelanin: brown-black, pheomelanin: red-yellow) contribute
// absorption coefficients sigma; the strand albedo follows
// Beer-Lambert attenuation exp(-sigma * path). The anisotropic
// highlight is the classic Kajiya-Kay lobe. Endmember spectra are
// model parameters (defaults after Chiang et al. 2016) — the
// verified content is the mixing/attenuation law, not a claim of
// measured spectra.

export const EUMELANIN_ABSORPTION = [0.419, 0.697, 1.37];
export const PHEOMELANIN_ABSORPTION = [0.187, 0.4, 1.05];

function checkParams({ melanin, pheomelaninRatio }) {
  if (!(melanin >= 0)) throw new Error('hair: melanin must be >= 0');
  if (!(pheomelaninRatio >= 0 && pheomelaninRatio <= 1)) throw new Error('hair: pheomelaninRatio must be in [0, 1]');
}

/**
 * Absorption coefficient (per channel) for a melanin load:
 * melanin (>= 0, ~0..2 in practice) split between the two
 * pigments by pheomelaninRatio (0 = all eu, 1 = all pheo).
 */
export function absorptionCoefficient({ melanin = 1, pheomelaninRatio = 0 } = {}, endmembers = {}) {
  checkParams({ melanin, pheomelaninRatio });
  const eu = endmembers.eumelanin || EUMELANIN_ABSORPTION;
  const pheo = endmembers.pheomelanin || PHEOMELANIN_ABSORPTION;
  const euAmount = melanin * (1 - pheomelaninRatio);
  const pheoAmount = melanin * pheomelaninRatio;
  return [0, 1, 2].map((c) => eu[c] * euAmount + pheo[c] * pheoAmount);
}

/** Strand albedo (per-channel reflectance) after `pathLength` of absorption. */
export function hairAlbedo(params = {}, pathLength = 1) {
  if (!(pathLength > 0)) throw new Error('hair: pathLength must be positive');
  const sigma = absorptionCoefficient(params);
  return sigma.map((s) => Math.exp(-s * pathLength));
}

/**
 * Root-to-tip albedo gradient: pigment parameters are
 * interpolated (the physical route — tips are usually more
 * weathered, i.e. lower melanin), then each segment's albedo is
 * evaluated. Returns segments+1 albedos, endpoints exact.
 */
export function strandAlbedoGradient(rootParams, tipParams, segments = 8) {
  if (!Number.isInteger(segments) || segments < 1) throw new Error('hair: segments must be a positive integer');
  checkParams({ melanin: rootParams.melanin ?? 1, pheomelaninRatio: rootParams.pheomelaninRatio ?? 0 });
  checkParams({ melanin: tipParams.melanin ?? 1, pheomelaninRatio: tipParams.pheomelaninRatio ?? 0 });
  const out = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    out.push(hairAlbedo({
      melanin: (rootParams.melanin ?? 1) * (1 - t) + (tipParams.melanin ?? 1) * t,
      pheomelaninRatio: (rootParams.pheomelaninRatio ?? 0) * (1 - t) + (tipParams.pheomelaninRatio ?? 0) * t,
    }));
  }
  return out;
}

/**
 * Kajiya-Kay anisotropic specular: pow(sin(angle(tangent,
 * halfVector)), shininess) — maximal when the half-vector is
 * perpendicular to the strand tangent.
 */
export function kajiyaKaySpecular(tangent, lightDir, viewDir, shininess = 40) {
  if (!(shininess > 0)) throw new Error('hair: shininess must be positive');
  const norm = (v) => {
    const len = Math.hypot(...v);
    if (len < 1e-15) throw new Error('hair: zero-length direction');
    return v.map((x) => x / len);
  };
  const t = norm(tangent), l = norm(lightDir), v = norm(viewDir);
  const h = norm([l[0] + v[0], l[1] + v[1], l[2] + v[2]]);
  const th = Math.min(1, Math.abs(t[0] * h[0] + t[1] * h[1] + t[2] * h[2]));
  return Math.pow(Math.sqrt(1 - th * th), shininess);
}
