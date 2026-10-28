// NURBS / B-spline kernel (A3 CAD baseline).
// Pure math module: no renderer or DOM dependencies. Points are [x, y, z]
// arrays; weights are positive scalars. Curves: { degree, knots, points,
// weights }. Surfaces: { uDegree, vDegree, uKnots, vKnots, points (rows in
// V, each a row of points in U), weights (same shape) }.

function assertFinitePoint(p, what = 'control point') {
  if (!Array.isArray(p) || p.length !== 3 || p.some((v) => !Number.isFinite(v))) {
    throw new Error(`${what} must be a finite [x, y, z] array.`);
  }
}

export function clampKnots(count, degree) {
  // Uniform clamped knot vector for `count` control points.
  if (!Number.isInteger(count) || count < degree + 1) throw new Error('Not enough control points for degree.');
  const inner = count - degree - 1;
  const knots = [];
  for (let i = 0; i <= degree; i++) knots.push(0);
  for (let i = 1; i <= inner; i++) knots.push(i / (inner + 1));
  for (let i = 0; i <= degree; i++) knots.push(1);
  return knots;
}

export function validateCurve(curve) {
  const { degree, knots, points } = curve || {};
  if (!Number.isInteger(degree) || degree < 1 || degree > 12) throw new Error('Curve degree must be 1..12.');
  if (!Array.isArray(points) || points.length < degree + 1) throw new Error('Curve needs at least degree+1 control points.');
  points.forEach((p) => assertFinitePoint(p));
  if (!Array.isArray(knots) || knots.length !== points.length + degree + 1) throw new Error('Knot vector length must be points + degree + 1.');
  for (let i = 1; i < knots.length; i++) if (!(knots[i] >= knots[i - 1])) throw new Error('Knots must be non-decreasing.');
  const weights = curve.weights || points.map(() => 1);
  if (weights.length !== points.length || weights.some((w) => !(w > 0) || !Number.isFinite(w))) throw new Error('Weights must be positive finite numbers.');
  return { degree, knots, points, weights };
}

export function findSpan(knots, count, degree, u) {
  const n = count - 1;
  if (u >= knots[n + 1]) return n;
  if (u <= knots[degree]) return degree;
  let lo = degree, hi = n + 1;
  let mid = (lo + hi) >> 1;
  while (u < knots[mid] || u >= knots[mid + 1]) {
    if (u < knots[mid]) hi = mid; else lo = mid;
    mid = (lo + hi) >> 1;
  }
  return mid;
}

// All non-vanishing basis functions at span (Cox-de Boor, NURBS Book A2.3).
export function basisFunctions(knots, span, degree, u) {
  const N = new Array(degree + 1).fill(0);
  const left = new Array(degree + 1).fill(0);
  const right = new Array(degree + 1).fill(0);
  N[0] = 1;
  for (let j = 1; j <= degree; j++) {
    left[j] = u - knots[span + 1 - j];
    right[j] = knots[span + j] - u;
    let saved = 0;
    for (let r = 0; r < j; r++) {
      const denom = right[r + 1] + left[j - r];
      const temp = denom === 0 ? 0 : N[r] / denom;
      N[r] = saved + right[r + 1] * temp;
      saved = left[j - r] * temp;
    }
    N[j] = saved;
  }
  return N;
}

function weightedSum(points, weights, N, offset) {
  let x = 0, y = 0, z = 0, w = 0;
  for (let i = 0; i < N.length; i++) {
    const p = points[offset + i], c = N[i] * weights[offset + i];
    x += p[0] * c; y += p[1] * c; z += p[2] * c; w += c;
  }
  return [x / w, y / w, z / w];
}

export function curvePoint(curve, u) {
  const c = validateCurve(curve);
  const t = Math.min(1, Math.max(0, u));
  const span = findSpan(c.knots, c.points.length, c.degree, t);
  const N = basisFunctions(c.knots, span, c.degree, t);
  return weightedSum(c.points, c.weights, N, span - c.degree);
}

function evalScalarSpline(knots, values, degree, u) {
  const span = findSpan(knots, values.length, degree, u);
  const N = basisFunctions(knots, span, degree, u);
  let s = 0;
  for (let i = 0; i <= degree; i++) s += N[i] * values[span - degree + i];
  return s;
}

// First derivative of a rational curve: C = A/w, C' = (A' - w' C) / w, where
// A and w come from the homogeneous (weighted) control polygon.
export function curveDerivative(curve, u) {
  const c = validateCurve(curve);
  const p = c.degree;
  const t = Math.min(1, Math.max(0, u));
  const pts = c.points.map((pt, i) => [pt[0] * c.weights[i], pt[1] * c.weights[i], pt[2] * c.weights[i], c.weights[i]]);
  const dPts = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const denom = c.knots[i + p + 1] - c.knots[i + 1];
    const f = denom === 0 ? 0 : p / denom;
    dPts.push([(pts[i + 1][0] - pts[i][0]) * f, (pts[i + 1][1] - pts[i][1]) * f, (pts[i + 1][2] - pts[i][2]) * f, (pts[i + 1][3] - pts[i][3]) * f]);
  }
  const dKnots = c.knots.slice(1, -1);
  const dDeg = p - 1;
  const span = findSpan(dKnots, dPts.length, dDeg, t);
  const N = basisFunctions(dKnots, span, dDeg, t);
  let ax = 0, ay = 0, az = 0, wp = 0;
  for (let i = 0; i <= dDeg; i++) {
    const q = dPts[span - dDeg + i];
    ax += q[0] * N[i]; ay += q[1] * N[i]; az += q[2] * N[i]; wp += q[3] * N[i];
  }
  const w = evalScalarSpline(c.knots, c.weights, p, t);
  const C = curvePoint(c, t);
  return [(ax - C[0] * wp) / w, (ay - C[1] * wp) / w, (az - C[2] * wp) / w];
}

export function bezierCurve(points, weights) {
  points.forEach((p) => assertFinitePoint(p, 'Bezier control point'));
  return validateCurve({ degree: points.length - 1, knots: clampKnots(points.length, points.length - 1), points, weights: weights || points.map(() => 1) });
}

// Exact NURBS circular arc (sweep <= 360 degrees, split into 90-degree spans).
export function arcCurve(radius, sweepDeg = 90) {
  if (!(radius > 0)) throw new Error('Radius must be positive.');
  if (!(sweepDeg > 0 && sweepDeg <= 360)) throw new Error('Sweep must be in (0, 360].');
  const spans = Math.max(1, Math.ceil(sweepDeg / 90));
  const step = (sweepDeg / spans) * Math.PI / 180;
  const w = Math.cos(step / 2);
  const points = [], weights = [];
  for (let s = 0; s < spans; s++) {
    const a0 = s * step, a1 = a0 + step, am = (a0 + a1) / 2;
    const p0 = [radius * Math.cos(a0), radius * Math.sin(a0), 0];
    const p2 = [radius * Math.cos(a1), radius * Math.sin(a1), 0];
    const p1 = [radius * Math.cos(am) / w, radius * Math.sin(am) / w, 0];
    if (s === 0) { points.push(p0); weights.push(1); }
    points.push(p1, p2); weights.push(w, 1);
  }
  const knots = [0, 0, 0];
  for (let s = 1; s < spans; s++) knots.push(s / spans, s / spans);
  knots.push(1, 1, 1);
  return validateCurve({ degree: 2, knots, points, weights });
}

// Boehm knot insertion; returns a new curve with identical shape.
export function insertKnot(curve, u, times = 1) {
  const c = validateCurve(curve);
  if (!(u > 0 && u < 1)) throw new Error('Inserted knot must be inside (0, 1).');
  if (!Number.isInteger(times) || times < 1 || times > c.degree) throw new Error('Insertion count must be 1..degree.');
  let { degree: p, knots, points, weights } = c;
  points = points.map((pt) => pt.slice()); weights = weights.slice(); knots = knots.slice();
  for (let t = 0; t < times; t++) {
    const k = findSpan(knots, points.length, p, u);
    const np = [], nw = [], nk = [];
    for (let i = 0; i <= k - p; i++) { np.push(points[i]); nw.push(weights[i]); }
    for (let i = k - p + 1; i <= k; i++) {
      const denom = knots[i + p] - knots[i];
      const a = denom === 0 ? 0 : (u - knots[i]) / denom;
      const prev = points[i - 1], cur = points[i];
      np.push([
        (1 - a) * prev[0] * weights[i - 1] + a * cur[0] * weights[i],
        (1 - a) * prev[1] * weights[i - 1] + a * cur[1] * weights[i],
        (1 - a) * prev[2] * weights[i - 1] + a * cur[2] * weights[i],
      ].map((v, j) => v / ((1 - a) * weights[i - 1] + a * weights[i])));
      nw.push((1 - a) * weights[i - 1] + a * weights[i]);
    }
    for (let i = k; i < points.length; i++) { np.push(points[i]); nw.push(weights[i]); }
    for (let i = 0; i <= k; i++) nk.push(knots[i]);
    nk.push(u);
    for (let i = k + 1; i < knots.length; i++) nk.push(knots[i]);
    points = np; weights = nw; knots = nk;
  }
  return validateCurve({ degree: p, knots, points, weights });
}

// Split at u into two curves by raising multiplicity of u to the degree.
export function splitCurve(curve, u) {
  const c = validateCurve(curve);
  if (!(u > 0 && u < 1)) throw new Error('Split parameter must be inside (0, 1).');
  const multiplicity = c.knots.filter((k) => k === u).length;
  const refined = multiplicity >= c.degree ? c : insertKnot(c, u, c.degree - multiplicity);
  const k = findSpan(refined.knots, refined.points.length, refined.degree, u);
  const cut = k - refined.degree;
  const left = { degree: refined.degree, knots: [...refined.knots.slice(0, k + 1), u], points: refined.points.slice(0, cut + 1), weights: refined.weights.slice(0, cut + 1) };
  const right = { degree: refined.degree, knots: [...new Array(refined.degree + 1).fill(u), ...refined.knots.slice(k + 1)], points: refined.points.slice(cut), weights: refined.weights.slice(cut) };
  const renorm = (cv) => {
    const lo = cv.knots[0], hi = cv.knots[cv.knots.length - 1];
    return validateCurve({ ...cv, knots: cv.knots.map((x) => (x - lo) / ((hi - lo) || 1)) });
  };
  return [renorm(left), renorm(right)];
}

// Degree elevation for Bezier curves (exact).
export function elevateBezierDegree(points, weights) {
  const n = points.length - 1;
  if (n < 1) throw new Error('Need at least two points.');
  const w = weights || points.map(() => 1);
  const out = [], ow = [];
  for (let i = 0; i <= n + 1; i++) {
    const a = i / (n + 1);
    let x = 0, y = 0, z = 0, ww = 0;
    if (i > 0) { const p = points[i - 1]; x += a * p[0] * w[i - 1]; y += a * p[1] * w[i - 1]; z += a * p[2] * w[i - 1]; ww += a * w[i - 1]; }
    if (i <= n) { const p = points[i]; x += (1 - a) * p[0] * w[i]; y += (1 - a) * p[1] * w[i]; z += (1 - a) * p[2] * w[i]; ww += (1 - a) * w[i]; }
    out.push([x / ww, y / ww, z / ww]); ow.push(ww);
  }
  return { points: out, weights: ow };
}

export function validateSurface(s) {
  const { uDegree, vDegree, uKnots, vKnots, points } = s || {};
  if (!Array.isArray(points) || points.length < 2 || !Array.isArray(points[0]) || points[0].length < 2) throw new Error('Surface grid too small.');
  const cols = points[0].length;
  points.forEach((row) => { if (row.length !== cols) throw new Error('Surface rows must share width.'); row.forEach((p) => assertFinitePoint(p)); });
  if (uKnots.length !== cols + uDegree + 1 || vKnots.length !== points.length + vDegree + 1) throw new Error('Surface knot lengths mismatch grid.');
  const weights = s.weights || points.map((row) => row.map(() => 1));
  return { uDegree, vDegree, uKnots, vKnots, points, weights };
}

export function surfacePoint(s, u, v) {
  const sf = validateSurface(s);
  const tu = Math.min(1, Math.max(0, u)), tv = Math.min(1, Math.max(0, v));
  const us = findSpan(sf.uKnots, sf.points[0].length, sf.uDegree, tu);
  const vs = findSpan(sf.vKnots, sf.points.length, sf.vDegree, tv);
  const Nu = basisFunctions(sf.uKnots, us, sf.uDegree, tu);
  const Nv = basisFunctions(sf.vKnots, vs, sf.vDegree, tv);
  let x = 0, y = 0, z = 0, w = 0;
  for (let j = 0; j <= sf.vDegree; j++) {
    const row = vs - sf.vDegree + j;
    for (let i = 0; i <= sf.uDegree; i++) {
      const col = us - sf.uDegree + i;
      const c = Nu[i] * Nv[j] * sf.weights[row][col], p = sf.points[row][col];
      x += p[0] * c; y += p[1] * c; z += p[2] * c; w += c;
    }
  }
  return [x / w, y / w, z / w];
}

// Bilinear (degree 1x1) patch through four corners.
export function bilinearPatch(corners) {
  if (!Array.isArray(corners) || corners.length !== 4) throw new Error('Need four corners [u0v0, u1v0, u0v1, u1v1].');
  return validateSurface({ uDegree: 1, vDegree: 1, uKnots: [0, 0, 1, 1], vKnots: [0, 0, 1, 1], points: [[corners[0], corners[1]], [corners[2], corners[3]]] });
}

export function extrudeSurface(curve, vector) {
  const c = validateCurve(curve);
  assertFinitePoint(vector, 'extrusion vector');
  const row0 = c.points, row1 = c.points.map((p) => [p[0] + vector[0], p[1] + vector[1], p[2] + vector[2]]);
  return validateSurface({ uDegree: c.degree, vDegree: 1, uKnots: c.knots, vKnots: [0, 0, 1, 1], points: [row0, row1], weights: [c.weights, c.weights.slice()] });
}

export function revolveSurface(curve, angleDeg = 360) {
  // Revolve a profile curve (in XZ plane, x >= 0) about the Z axis.
  const c = validateCurve(curve);
  const arc = arcCurve(1, angleDeg);
  const rows = [];
  const wRows = [];
  for (let j = 0; j < arc.points.length; j++) {
    const [ax, ay] = arc.points[j];
    rows.push(c.points.map((p) => [p[0] * ax, p[0] * ay, p[2]]));
    wRows.push(c.weights.map((w) => w * arc.weights[j]));
  }
  return validateSurface({ uDegree: c.degree, vDegree: 2, uKnots: c.knots, vKnots: arc.knots, points: rows, weights: wRows });
}

export function ruledSurface(curveA, curveB) {
  const a = validateCurve(curveA), b = validateCurve(curveB);
  if (a.degree !== b.degree || a.points.length !== b.points.length) throw new Error('Ruled surface needs matching curve degree/count.');
  return validateSurface({ uDegree: a.degree, vDegree: 1, uKnots: a.knots, vKnots: [0, 0, 1, 1], points: [a.points, b.points], weights: [a.weights, b.weights] });
}

// Global B-spline interpolation through points (NURBS Book A9.1 style).
export function interpolateCurve(points, degree = 3) {
  points.forEach((p) => assertFinitePoint(p, 'interpolation point'));
  const n = points.length - 1;
  if (n < 1) throw new Error('Need at least two points.');
  const p = Math.min(degree, n);
  const params = [0];
  let total = 0;
  const chords = [];
  for (let i = 1; i <= n; i++) { const d = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1], points[i][2] - points[i - 1][2]); chords.push(d); total += d; }
  for (let i = 1; i <= n; i++) params.push(params[i - 1] + chords[i - 1] / (total || 1));
  params[n] = 1;
  const knots = [];
  for (let i = 0; i <= p; i++) knots.push(0);
  for (let j = 1; j <= n - p; j++) { let s = 0; for (let i = j; i < j + p; i++) s += params[i]; knots.push(s / p); }
  for (let i = 0; i <= p; i++) knots.push(1);
  // Solve N * P = D.
  const N = [];
  for (let i = 0; i <= n; i++) {
    const row = new Array(n + 1).fill(0);
    const span = findSpan(knots, n + 1, p, params[i]);
    const bas = basisFunctions(knots, span, p, params[i]);
    for (let j = 0; j <= p; j++) row[span - p + j] = bas[j];
    N.push(row);
  }
  const ctrl = points.map(() => [0, 0, 0]);
  for (let axis = 0; axis < 3; axis++) {
    const A = N.map((row) => row.slice());
    const b = points.map((pt) => pt[axis]);
    for (let col = 0; col <= n; col++) {
      let piv = col;
      for (let r = col + 1; r <= n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
      [A[col], A[piv]] = [A[piv], A[col]]; [b[col], b[piv]] = [b[piv], b[col]];
      for (let r = col + 1; r <= n; r++) {
        const f = A[r][col] / A[col][col];
        for (let cc = col; cc <= n; cc++) A[r][cc] -= f * A[col][cc];
        b[r] -= f * b[col];
      }
    }
    for (let row = n; row >= 0; row--) {
      let s = b[row];
      for (let cc = row + 1; cc <= n; cc++) s -= A[row][cc] * ctrl[cc][axis];
      ctrl[row][axis] = s / A[row][row];
    }
  }
  return validateCurve({ degree: p, knots, points: ctrl, weights: points.map(() => 1) });
}

// Skin/loft: sections must share degree and control-point count.
export function loftSurfaces(sections, vDegree = 3) {
  if (!Array.isArray(sections) || sections.length < 2) throw new Error('Loft needs at least two sections.');
  const curves = sections.map(validateCurve);
  const { degree, points: first } = curves[0];
  curves.forEach((c) => { if (c.degree !== degree || c.points.length !== first.length) throw new Error('Loft sections must share degree and control-point count.'); });
  const cols = first.length;
  const rows = [];
  for (let j = 0; j < cols; j++) {
    const through = curves.map((c) => c.points[j]);
    rows.push(interpolateCurve(through, Math.min(vDegree, curves.length - 1)));
  }
  const vKnots = rows[0].knots;
  return validateSurface({
    uDegree: degree, vDegree: rows[0].degree, uKnots: curves[0].knots, vKnots,
    points: rows[0].points.map((_, vi) => rows.map((r) => r.points[vi])),
    weights: rows[0].points.map(() => rows.map(() => 1)),
  });
}

// Tessellate a curve into polyline points by segment count.
export function tessellateCurve(curve, segments = 32) {
  if (!Number.isInteger(segments) || segments < 1 || segments > 4096) throw new Error('Segments out of range.');
  const out = [];
  for (let i = 0; i <= segments; i++) out.push(curvePoint(curve, i / segments));
  return out;
}

// Tessellate a surface into an indexed triangle mesh (CAD -> mesh conversion).
export function tessellateSurface(s, uSegs = 16, vSegs = 16) {
  const positions = [], uvs = [], indices = [];
  for (let j = 0; j <= vSegs; j++) {
    for (let i = 0; i <= uSegs; i++) {
      const u = i / uSegs, v = j / vSegs;
      positions.push(...surfacePoint(s, u, v));
      uvs.push(u, v);
    }
  }
  for (let j = 0; j < vSegs; j++) {
    for (let i = 0; i < uSegs; i++) {
      const a = j * (uSegs + 1) + i, b = a + 1, c = a + uSegs + 1, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return { positions: new Float32Array(positions), uvs: new Float32Array(uvs), indices: new Uint32Array(indices) };
}

// Arc length by midpoint quadrature over knot spans.
export function curveLength(curve, samplesPerSpan = 32) {
  const c = validateCurve(curve);
  const breaks = [...new Set(c.knots)].sort((a, b) => a - b);
  let length = 0;
  for (let s = 0; s < breaks.length - 1; s++) {
    const a = breaks[s], b = breaks[s + 1], dt = (b - a) / samplesPerSpan;
    for (let i = 0; i < samplesPerSpan; i++) {
      const d = curveDerivative(curve, a + (i + 0.5) * dt);
      length += Math.hypot(d[0], d[1], d[2]) * dt;
    }
  }
  return length;
}

// Second derivative: differentiate the homogeneous derivative curve once more.
export function curveSecondDerivative(curve, u) {
  const c = validateCurve(curve);
  const p = c.degree;
  if (p < 2) return [0, 0, 0];
  const t = Math.min(1, Math.max(0, u));
  const H = c.points.map((pt, i) => [pt[0] * c.weights[i], pt[1] * c.weights[i], pt[2] * c.weights[i], c.weights[i]]);
  const deriv = (ptsArr, knotsArr, deg) => {
    const out = [];
    for (let i = 0; i < ptsArr.length - 1; i++) {
      const denom = knotsArr[i + deg + 1] - knotsArr[i + 1];
      const f = denom === 0 ? 0 : deg / denom;
      out.push(ptsArr[i].map((v, j) => (ptsArr[i + 1][j] - v) * f));
    }
    return out;
  };
  const H1 = deriv(H, c.knots, p);
  const K1 = c.knots.slice(1, -1);
  const H2 = deriv(H1, K1, p - 1);
  const K2 = K1.slice(1, -1);
  const evalH = (ptsArr, knotsArr, deg) => {
    const span = findSpan(knotsArr, ptsArr.length, deg, t);
    const N = basisFunctions(knotsArr, span, deg, t);
    const acc = [0, 0, 0, 0];
    for (let i = 0; i <= deg; i++) { const q = ptsArr[span - deg + i]; for (let j = 0; j < 4; j++) acc[j] += q[j] * N[i]; }
    return acc;
  };
  const A1 = evalH(H1, K1, p - 1), A2 = evalH(H2, K2, p - 2);
  const w = evalScalarSpline(c.knots, c.weights, p, t);
  const C = curvePoint(c, t);
  const C1 = curveDerivative(c, t);
  // C'' = (A'' - w'' C - 2 w' C') / w, with w' = A1[3], w'' = A2[3].
  return [0, 1, 2].map((j) => (A2[j] - A2[3] * C[j] - 2 * A1[3] * C1[j]) / w);
}

// Osculating curvature kappa = |C' x C''| / |C'|^3.
export function curveCurvature(curve, u) {
  const d1 = curveDerivative(curve, u), d2 = curveSecondDerivative(curve, u);
  const cross = [d1[1] * d2[2] - d1[2] * d2[1], d1[2] * d2[0] - d1[0] * d2[2], d1[0] * d2[1] - d1[1] * d2[0]];
  const s = Math.hypot(d1[0], d1[1], d1[2]);
  return s < 1e-14 ? 0 : Math.hypot(...cross) / (s ** 3);
}

// Curvature comb samples: spine point, unit normal (toward curvature centre),
// and comb length proportional to curvature.
export function curvatureComb(curve, samples = 24, scale = 1) {
  const out = [];
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const point = curvePoint(curve, u);
    const d1 = curveDerivative(curve, u), d2 = curveSecondDerivative(curve, u);
    const s2 = d1[0] ** 2 + d1[1] ** 2 + d1[2] ** 2;
    let normal = [0, 0, 0];
    if (s2 > 1e-14) {
      const dot = (d2[0] * d1[0] + d2[1] * d1[1] + d2[2] * d1[2]) / s2;
      normal = [d2[0] - dot * d1[0], d2[1] - dot * d1[1], d2[2] - dot * d1[2]];
      const len = Math.hypot(...normal);
      if (len > 1e-14) normal = normal.map((v) => v / len);
    }
    out.push({ u, point, normal, curvature: curveCurvature(curve, u), length: curveCurvature(curve, u) * scale });
  }
  return out;
}

// Continuity between curve A at its end and curve B at its start.
export function continuityReport(curveA, curveB) {
  const pA = curvePoint(curveA, 1), pB = curvePoint(curveB, 0);
  const gap = Math.hypot(pA[0] - pB[0], pA[1] - pB[1], pA[2] - pB[2]);
  const tA = curveDerivative(curveA, 1), tB = curveDerivative(curveB, 0);
  const lA = Math.hypot(...tA), lB = Math.hypot(...tB);
  let angleDeg = 180;
  if (lA > 1e-14 && lB > 1e-14) {
    const cos = Math.min(1, Math.max(-1, (tA[0] * tB[0] + tA[1] * tB[1] + tA[2] * tB[2]) / (lA * lB)));
    angleDeg = Math.acos(cos) * 180 / Math.PI;
  }
  const kA = curveCurvature(curveA, 1), kB = curveCurvature(curveB, 0);
  return {
    gap, tangentAngleDeg: angleDeg, curvatureJump: Math.abs(kA - kB),
    g0: gap <= 1e-7, g1: gap <= 1e-7 && angleDeg <= 0.01, g2: gap <= 1e-7 && angleDeg <= 0.01 && Math.abs(kA - kB) <= 1e-6,
  };
}

// Offset a curve by distance d along its curvature normal (exact for planar
// curves; sampled + interpolated approximation in general).
export function offsetCurve(curve, distance, samples = 32) {
  const pts = [];
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const p = curvePoint(curve, u);
    const d1 = curveDerivative(curve, u), d2 = curveSecondDerivative(curve, u);
    const s2 = d1[0] ** 2 + d1[1] ** 2 + d1[2] ** 2;
    let n = [0, 0, 0];
    if (s2 > 1e-14) {
      const dot = (d2[0] * d1[0] + d2[1] * d1[1] + d2[2] * d1[2]) / s2;
      n = [d2[0] - dot * d1[0], d2[1] - dot * d1[1], d2[2] - dot * d1[2]];
      const len = Math.hypot(...n);
      if (len > 1e-14) n = n.map((v) => v / len);
    }
    pts.push([p[0] + n[0] * distance, p[1] + n[1] * distance, p[2] + n[2] * distance]);
  }
  return interpolateCurve(pts, 3);
}

// Partial derivatives of a surface via derivative control grids.
export function surfacePartials(s, u, v) {
  const sf = validateSurface(s);
  const H = sf.points.map((row, j) => row.map((p, i) => [p[0] * sf.weights[j][i], p[1] * sf.weights[j][i], p[2] * sf.weights[j][i], sf.weights[j][i]]));
  const derivGrid = (grid, knots, deg, alongU) => {
    if (deg < 1) return grid.map((row) => row.map(() => [0, 0, 0, 0]));
    const step = (row, j) => row.map((q, i) => {
      if (i >= row.length - 1) return null;
      const denom = knots[i + deg + 1] - knots[i + 1];
      const f = denom === 0 ? 0 : deg / denom;
      return q.map((val, m) => (row[i + 1][m] - val) * f);
    }).filter(Boolean);
    if (alongU) return grid.map((row) => step(row));
    const cols = grid[0].length, out = [];
    for (let j = 0; j < grid.length - 1; j++) {
      const denom = knots[j + deg + 1] - knots[j + 1];
      const f = denom === 0 ? 0 : deg / denom;
      out.push(grid[j].map((q, i) => q.map((val, m) => (grid[j + 1][i][m] - val) * f)));
    }
    return out;
  };
  const evalGrid = (grid, uK, vK, uD, vD, tu, tv) => {
    const us = findSpan(uK, grid[0].length, uD, tu), vs = findSpan(vK, grid.length, vD, tv);
    const Nu = basisFunctions(uK, us, uD, tu), Nv = basisFunctions(vK, vs, vD, tv);
    const acc = [0, 0, 0, 0];
    for (let j = 0; j <= vD; j++) for (let i = 0; i <= uD; i++) {
      const q = grid[vs - vD + j][us - uD + i], c = Nu[i] * Nv[j];
      for (let m = 0; m < 4; m++) acc[m] += q[m] * c;
    }
    return acc;
  };
  const tu = Math.min(1, Math.max(0, u)), tv = Math.min(1, Math.max(0, v));
  const S = surfacePoint(sf, tu, tv);
  const Hu = derivGrid(H, sf.uKnots, sf.uDegree, true);
  const Hv = derivGrid(H, sf.vKnots, sf.vDegree, false);
  const Au = evalGrid(Hu, sf.uKnots.slice(1, -1), sf.vKnots, sf.uDegree - 1, sf.vDegree, tu, tv);
  const Av = evalGrid(Hv, sf.uKnots, sf.vKnots.slice(1, -1), sf.uDegree, sf.vDegree - 1, tu, tv);
  const wu = evalGrid(H, sf.uKnots, sf.vKnots, sf.uDegree, sf.vDegree, tu, tv)[3];
  const dU = [0, 1, 2].map((j) => (Au[j] - S[j] * Au[3]) / wu);
  const dV = [0, 1, 2].map((j) => (Av[j] - S[j] * Av[3]) / wu);
  return { dU, dV };
}

export function surfaceNormal(s, u, v) {
  const { dU, dV } = surfacePartials(s, u, v);
  const n = [dU[1] * dV[2] - dU[2] * dV[1], dU[2] * dV[0] - dU[0] * dV[2], dU[0] * dV[1] - dU[1] * dV[0]];
  const len = Math.hypot(...n);
  return len < 1e-14 ? [0, 0, 1] : n.map((x) => x / len);
}

// Fit a B-spline surface through a grid of points (rows in V).
export function surfaceFromPoints(grid, degree = 3) {
  if (!Array.isArray(grid) || grid.length < 2 || grid[0].length < 2) throw new Error('Point grid too small.');
  const rowCurves = grid.map((row) => interpolateCurve(row, Math.min(degree, row.length - 1)));
  const cols = rowCurves[0].points.length;
  const colCurves = [];
  for (let j = 0; j < cols; j++) colCurves.push(interpolateCurve(rowCurves.map((c) => c.points[j]), Math.min(degree, grid.length - 1)));
  return validateSurface({
    uDegree: rowCurves[0].degree, vDegree: colCurves[0].degree,
    uKnots: rowCurves[0].knots, vKnots: colCurves[0].knots,
    points: colCurves[0].points.map((_, vi) => colCurves.map((c) => c.points[vi])),
    weights: colCurves[0].points.map(() => colCurves.map(() => 1)),
  });
}

// Coons (boundary) patch through four boundary curves, fitted to a grid.
export function coonsPatch(bottom, top, left, right, samples = 12) {
  const B = (u) => curvePoint(bottom, u), T = (u) => curvePoint(top, u);
  const L = (v) => curvePoint(left, v), R = (v) => curvePoint(right, v);
  const c00 = B(0), c10 = B(1), c01 = T(0), c11 = T(1);
  const grid = [];
  for (let j = 0; j <= samples; j++) {
    const v = j / samples, row = [];
    for (let i = 0; i <= samples; i++) {
      const u = i / samples;
      const p = [0, 1, 2].map((a) => (
        (1 - v) * B(u)[a] + v * T(u)[a] + (1 - u) * L(v)[a] + u * R(v)[a]
        - ((1 - u) * (1 - v) * c00[a] + u * (1 - v) * c10[a] + (1 - u) * v * c01[a] + u * v * c11[a])
      ));
      row.push(p);
    }
    grid.push(row);
  }
  return surfaceFromPoints(grid, 3);
}

// Two-rail sweep (birail): profile endpoints are pinned to the two rails.
export function birailSurface(profile, railA, railB, samples = 16) {
  const p0 = curvePoint(profile, 0), p1 = curvePoint(profile, 1);
  const chord = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const grid = [];
  for (let j = 0; j <= samples; j++) {
    const u = j / samples;
    const A = curvePoint(railA, u), Bp = curvePoint(railB, u);
    const railChord = [Bp[0] - A[0], Bp[1] - A[1], Bp[2] - A[2]];
    const row = [];
    for (let i = 0; i <= samples; i++) {
      const w = i / samples;
      const P = curvePoint(profile, w);
      row.push([0, 1, 2].map((a) => A[a] + (P[a] - p0[a]) + w * (railChord[a] - chord[a])));
    }
    grid.push(row);
  }
  const surf = surfaceFromPoints(grid, 3);
  return surf;
}

// Closest point on a surface: coarse grid search + Gauss-Newton refinement.
export function closestPointOnSurface(s, target, grid = 24) {
  let bu = 0, bv = 0, bd = Infinity;
  for (let j = 0; j <= grid; j++) for (let i = 0; i <= grid; i++) {
    const u = i / grid, v = j / grid, p = surfacePoint(s, u, v);
    const d = Math.hypot(p[0] - target[0], p[1] - target[1], p[2] - target[2]);
    if (d < bd) { bd = d; bu = u; bv = v; }
  }
  let u = bu, v = bv;
  for (let iter = 0; iter < 16; iter++) {
    const p = surfacePoint(s, u, v), { dU, dV } = surfacePartials(s, u, v);
    const r = [p[0] - target[0], p[1] - target[1], p[2] - target[2]];
    const a = dU[0] ** 2 + dU[1] ** 2 + dU[2] ** 2, b = dU[0] * dV[0] + dU[1] * dV[1] + dU[2] * dV[2], c = dV[0] ** 2 + dV[1] ** 2 + dV[2] ** 2;
    const det = a * c - b * b;
    if (Math.abs(det) < 1e-14) break;
    const gu = r[0] * dU[0] + r[1] * dU[1] + r[2] * dU[2], gv = r[0] * dV[0] + r[1] * dV[1] + r[2] * dV[2];
    const du = -(c * gu - b * gv) / det, dv = -(-b * gu + a * gv) / det;
    u = Math.min(1, Math.max(0, u + du)); v = Math.min(1, Math.max(0, v + dv));
    if (Math.abs(du) + Math.abs(dv) < 1e-10) break;
  }
  const point = surfacePoint(s, u, v);
  return { u, v, point, distance: Math.hypot(point[0] - target[0], point[1] - target[1], point[2] - target[2]) };
}

export function projectCurveOnSurface(curve, s, samples = 32) {
  const out = [];
  for (let i = 0; i <= samples; i++) out.push(closestPointOnSurface(s, curvePoint(curve, i / samples)).point);
  return out;
}

// Tessellate only cells whose centre falls inside a UV trim polygon.
export function tessellateTrimmedSurface(s, polygon, uSegs = 32, vSegs = 32) {
  if (!Array.isArray(polygon) || polygon.length < 3) throw new Error('Trim polygon needs at least three UV points.');
  const inside = (u, v) => {
    let hit = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
      if (((yi > v) !== (yj > v)) && (u < (xj - xi) * (v - yi) / (yj - yi) + xi)) hit = !hit;
    }
    return hit;
  };
  const positions = [], uvs = [], indices = [];
  const vertIndex = new Map();
  const vert = (i, j) => {
    const key = `${i},${j}`;
    if (!vertIndex.has(key)) {
      const u = i / uSegs, v = j / vSegs;
      vertIndex.set(key, positions.length / 3);
      positions.push(...surfacePoint(s, u, v));
      uvs.push(u, v);
    }
    return vertIndex.get(key);
  };
  for (let j = 0; j < vSegs; j++) for (let i = 0; i < uSegs; i++) {
    if (!inside((i + 0.5) / uSegs, (j + 0.5) / vSegs)) continue;
    const a = vert(i, j), b = vert(i + 1, j), c = vert(i, j + 1), d = vert(i + 1, j + 1);
    indices.push(a, c, b, b, c, d);
  }
  return { positions: new Float32Array(positions), uvs: new Float32Array(uvs), indices: new Uint32Array(indices) };
}

// Closest point on curve via Newton iteration from samples (measurement aid).
export function closestPointOnCurve(curve, target, samples = 64) {
  let bestU = 0, bestD = Infinity;
  for (let i = 0; i <= samples; i++) {
    const u = i / samples, p = curvePoint(curve, u);
    const d = Math.hypot(p[0] - target[0], p[1] - target[1], p[2] - target[2]);
    if (d < bestD) { bestD = d; bestU = u; }
  }
  let u = bestU;
  for (let iter = 0; iter < 12; iter++) {
    const p = curvePoint(curve, u), d1 = curveDerivative(curve, u);
    const rx = p[0] - target[0], ry = p[1] - target[1], rz = p[2] - target[2];
    const denom = d1[0] * d1[0] + d1[1] * d1[1] + d1[2] * d1[2];
    if (denom < 1e-14) break;
    const step = (rx * d1[0] + ry * d1[1] + rz * d1[2]) / denom;
    u = Math.min(1, Math.max(0, u - step));
    if (Math.abs(step) < 1e-10) break;
  }
  const point = curvePoint(curve, u);
  return { u, point, distance: Math.hypot(point[0] - target[0], point[1] - target[1], point[2] - target[2]) };
}
