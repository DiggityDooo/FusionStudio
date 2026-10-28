'use strict';
// Lens distortion (A11 "Lens distortion, chromatic aberration,
// vignette and lens flare"): Brown-Conrady radial (k1, k2, k3)
// and tangential (p1, p2) distortion on normalized image
// coordinates, iterative undistortion, plus the standard
// post terms that pair with it (vignette falloff and per-channel
// radial scaling for chromatic aberration).
// Model: with r^2 = x^2 + y^2 and L = 1 + k1 r^2 + k2 r^4 + k3 r^6,
//   xd = x L + (p1 (r^2 + 2 y^2) + 2 p2 x y)
//   yd = y L + (p2 (r^2 + 2 x^2) + 2 p1 x y)

export const IDENTITY_LENS = { k1: 0, k2: 0, k3: 0, p1: 0, p2: 0 };

function withDefaults(lens = {}) {
  return { ...IDENTITY_LENS, ...lens };
}

export function distortPoint([x, y], lens = {}) {
  const { k1, k2, k3, p1, p2 } = withDefaults(lens);
  const r2 = x * x + y * y;
  const radial = 1 + k1 * r2 + k2 * r2 * r2 + k3 * r2 * r2 * r2;
  return [
    x * radial + p1 * (r2 + 2 * y * y) + 2 * p2 * x * y,
    y * radial + p2 * (r2 + 2 * x * x) + 2 * p1 * x * y,
  ];
}

/**
 * Invert distortion by Newton iteration on the 2D residual
 * distort(x) - xd = 0 (fixed-point iteration oscillates for
 * strong pincushion coefficients; Newton converges
 * quadratically). Throws if the residual stays large.
 */
export function undistortPoint([xd, yd], lens = {}, { iterations = 50 } = {}) {
  const params = withDefaults(lens);
  let [x, y] = [xd, yd];
  const residual = (px, py) => {
    const [dx, dy] = distortPoint([px, py], params);
    return [dx - xd, dy - yd];
  };
  let [fx, fy] = residual(x, y);
  for (let i = 0; i < iterations; i++) {
    if (Math.hypot(fx, fy) < 1e-13) return [x, y];
    const h = 1e-6;
    const [fxx, fxy] = residual(x + h, y);
    const [fyx, fyy] = residual(x, y + h);
    const j00 = (fxx - fx) / h, j10 = (fxy - fy) / h;
    const j01 = (fyx - fx) / h, j11 = (fyy - fy) / h;
    const det = j00 * j11 - j01 * j10;
    if (Math.abs(det) < 1e-15) throw new Error('lens: undistortion Jacobian is singular');
    x -= (fx * j11 - fy * j10) / det;
    y -= (fy * j00 - fx * j01) / det;
    [fx, fy] = residual(x, y);
  }
  if (Math.hypot(fx, fy) > 1e-9) throw new Error('lens: undistortion did not converge');
  return [x, y];
}

/** Distort/undistort whole point sets ([[x, y], ...]). */
export function distortPoints(points, lens = {}) {
  return points.map((p) => distortPoint(p, lens));
}
export function undistortPoints(points, lens = {}, options) {
  return points.map((p) => undistortPoint(p, lens, options));
}

/**
 * Vignette multiplier at normalized radius r:
 * 1 - strength * smoothstep(start, end, r)^power... implemented
 * as 1 - strength * s where s is the clamped smooth ramp, so the
 * center is untouched and the corners fall to 1 - strength.
 */
export function vignette(r, { strength = 0.5, start = 0.6, end = 1.4, power = 1 } = {}) {
  if (!(strength >= 0 && strength <= 1)) throw new Error('lens: vignette strength must be in [0, 1]');
  if (!(end > start)) throw new Error('lens: vignette end must exceed start');
  if (!(r >= 0)) throw new Error('lens: radius must be >= 0');
  const t = Math.min(1, Math.max(0, (r - start) / (end - start)));
  const s = t * t * (3 - 2 * t);
  return 1 - strength * Math.pow(s, power);
}

/**
 * Chromatic aberration: per-channel radial scale about the image
 * center. channelScales: [sR, sG, sB] applied to normalized
 * coordinates (green usually stays 1).
 */
function sampleBilinear(data, width, height, px, py) {
  const x = Math.min(width - 1, Math.max(0, px));
  const y = Math.min(height - 1, Math.max(0, py));
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const out = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const v00 = data[(x0 + width * y0) * 4 + c], v10 = data[(x1 + width * y0) * 4 + c];
    const v01 = data[(x0 + width * y1) * 4 + c], v11 = data[(x1 + width * y1) * 4 + c];
    out[c] = (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
  }
  return out;
}

/**
 * Warp a compositor image buffer ({ width, height, data RGBA })
 * through the lens. mode 'undistort': each clean output pixel
 * pulls from its distorted location (removes distortion);
 * mode 'distort': the inverse mapping. Pixel centers map to
 * normalized coordinates about the image center with
 * scale = min(width, height) / 2. Bilinear sampling, edge-clamped.
 */
export function warpImageBuffer(buffer, lens = {}, { mode = 'undistort' } = {}) {
  if (mode !== 'undistort' && mode !== 'distort') throw new Error(`lens: unknown warp mode ${mode}`);
  const { width, height, data } = buffer;
  if (!width || !height || data.length !== width * height * 4) throw new Error('lens: malformed image buffer');
  const cx = width / 2, cy = height / 2, scale = Math.min(width, height) / 2;
  const out = new Float32Array(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const n = [(x + 0.5 - cx) / scale, (y + 0.5 - cy) / scale];
      const src = mode === 'undistort' ? distortPoint(n, lens) : undistortPoint(n, lens);
      const px = src[0] * scale + cx - 0.5, py = src[1] * scale + cy - 0.5;
      const sample = sampleBilinear(data, width, height, px, py);
      out.set(sample, (x + width * y) * 4);
    }
  }
  return { width, height, data: out, aovs: buffer.aovs || {} };
}

/**
 * 2D similarity (Procrustes) estimation: find scale, rotation
 * angle (radians), and translation mapping fromPoints onto
 * toPoints in the least-squares sense. Closed form via centered
 * cross-covariance sums. Returns { scale, angle, translation,
 * rms } with rms the residual point error.
 */
export function estimateSimilarity2D(fromPoints, toPoints) {
  if (!fromPoints?.length || fromPoints.length !== toPoints.length) {
    throw new Error('lens: point sets must be non-empty and equal in length');
  }
  const n = fromPoints.length;
  const centroid = (pts) => [
    pts.reduce((s, p) => s + p[0], 0) / n,
    pts.reduce((s, p) => s + p[1], 0) / n,
  ];
  const cf = centroid(fromPoints), ct = centroid(toPoints);
  let a = 0, b = 0, normF = 0;
  for (let i = 0; i < n; i++) {
    const fx = fromPoints[i][0] - cf[0], fy = fromPoints[i][1] - cf[1];
    const tx = toPoints[i][0] - ct[0], ty = toPoints[i][1] - ct[1];
    a += fx * tx + fy * ty;
    b += fx * ty - fy * tx;
    normF += fx * fx + fy * fy;
  }
  if (normF < 1e-15) throw new Error('lens: degenerate source point set');
  const angle = Math.atan2(b, a);
  const scale = Math.hypot(a, b) / normF;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const translation = [
    ct[0] - scale * (cos * cf[0] - sin * cf[1]),
    ct[1] - scale * (sin * cf[0] + cos * cf[1]),
  ];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const mx = scale * (cos * fromPoints[i][0] - sin * fromPoints[i][1]) + translation[0];
    const my = scale * (sin * fromPoints[i][0] + cos * fromPoints[i][1]) + translation[1];
    sum += (mx - toPoints[i][0]) ** 2 + (my - toPoints[i][1]) ** 2;
  }
  return { scale, angle, translation, rms: Math.sqrt(sum / n) };
}

/** Apply a similarity from estimateSimilarity2D to a point. */
export function applySimilarity2D({ scale, angle, translation }, [x, y]) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return [
    scale * (cos * x - sin * y) + translation[0],
    scale * (sin * x + cos * y) + translation[1],
  ];
}

export function chromaticAberration([x, y], channelScales = [1.002, 1, 0.998]) {
  if (channelScales.length !== 3 || channelScales.some((s) => !(s > 0))) {
    throw new Error('lens: channelScales must be three positive numbers');
  }
  return channelScales.map((s) => [x * s, y * s]);
}
