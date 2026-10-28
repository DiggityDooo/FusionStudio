// 2D sketch constraint solver (A3 sketch-based modeling baseline).
// Entities: points, lines (point pairs), circles (centre point + radius).
// Constraints are residual functions; solving is damped Gauss-Newton over
// point coordinates and radii with a numeric Jacobian.

export function createSketch() {
  return { points: [], lines: [], circles: [], constraints: [] };
}

export function addPoint(sketch, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Point coordinates must be finite.');
  sketch.points.push({ x, y });
  return sketch.points.length - 1;
}

export function addLine(sketch, a, b) {
  if (a === b) throw new Error('Line endpoints must differ.');
  sketch.lines.push({ a, b });
  return sketch.lines.length - 1;
}

export function addCircle(sketch, c, r) {
  if (!(r > 0)) throw new Error('Circle radius must be positive.');
  sketch.circles.push({ c, r });
  return sketch.circles.length - 1;
}

const TYPES = ['coincident', 'fix', 'horizontal', 'vertical', 'distance', 'radius', 'equalRadius', 'pointOnLine', 'parallel', 'perpendicular', 'angle', 'tangent'];

export function addConstraint(sketch, constraint) {
  if (!TYPES.includes(constraint.type)) throw new Error(`Unknown constraint: ${constraint.type}`);
  sketch.constraints.push({ ...constraint });
  return sketch.constraints.length - 1;
}

function lineDir(sketch, line) {
  const a = sketch.points[line.a], b = sketch.points[line.b];
  return [b.x - a.x, b.y - a.y];
}

function constraintResiduals(sketch, c) {
  const P = (i) => sketch.points[i];
  switch (c.type) {
    case 'coincident': { const a = P(c.a), b = P(c.b); return [a.x - b.x, a.y - b.y]; }
    case 'fix': { const a = P(c.a); return [a.x - c.x, a.y - c.y]; }
    case 'horizontal': { const a = P(c.a), b = P(c.b); return [a.y - b.y]; }
    case 'vertical': { const a = P(c.a), b = P(c.b); return [a.x - b.x]; }
    case 'distance': { const a = P(c.a), b = P(c.b); return [Math.hypot(a.x - b.x, a.y - b.y) - c.value]; }
    case 'radius': return [sketch.circles[c.circle].r - c.value];
    case 'equalRadius': return [sketch.circles[c.a].r - sketch.circles[c.b].r];
    case 'pointOnLine': {
      const p = P(c.point), line = sketch.lines[c.line];
      const a = P(line.a), d = lineDir(sketch, line);
      const len = Math.hypot(...d) || 1;
      return [((d[0] * (p.y - a.y) - d[1] * (p.x - a.x)) / len)];
    }
    case 'parallel': {
      const d1 = lineDir(sketch, sketch.lines[c.a]), d2 = lineDir(sketch, sketch.lines[c.b]);
      const l = (Math.hypot(...d1) * Math.hypot(...d2)) || 1;
      return [(d1[0] * d2[1] - d1[1] * d2[0]) / l];
    }
    case 'perpendicular': {
      const d1 = lineDir(sketch, sketch.lines[c.a]), d2 = lineDir(sketch, sketch.lines[c.b]);
      const l = (Math.hypot(...d1) * Math.hypot(...d2)) || 1;
      return [(d1[0] * d2[0] + d1[1] * d2[1]) / l];
    }
    case 'angle': {
      const d1 = lineDir(sketch, sketch.lines[c.a]), d2 = lineDir(sketch, sketch.lines[c.b]);
      const ang = Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1]);
      let diff = ang - c.value * Math.PI / 180;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      return [diff];
    }
    case 'tangent': {
      const circle = sketch.circles[c.circle], centre = P(circle.c), line = sketch.lines[c.line];
      const a = P(line.a), d = lineDir(sketch, line);
      const len = Math.hypot(...d) || 1;
      const dist = Math.abs(d[0] * (centre.y - a.y) - d[1] * (centre.x - a.x)) / len;
      return [dist - circle.r];
    }
    default: throw new Error(`Unknown constraint: ${c.type}`);
  }
}

export function sketchResiduals(sketch) {
  const out = [];
  for (const c of sketch.constraints) out.push(...constraintResiduals(sketch, c));
  return out;
}

function getParams(sketch) {
  const v = [];
  for (const p of sketch.points) v.push(p.x, p.y);
  for (const c of sketch.circles) v.push(c.r);
  return v;
}

function setParams(sketch, v) {
  let i = 0;
  for (const p of sketch.points) { p.x = v[i++]; p.y = v[i++]; }
  for (const c of sketch.circles) c.r = v[i++];
}

// Solve linear system A x = b (Gaussian elimination with partial pivoting).
function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-14) continue;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let cc = col; cc <= n; cc++) M[r][cc] -= f * M[col][cc];
    }
  }
  return M.map((row, i) => (Math.abs(row[i]) < 1e-14 ? 0 : row[n] / row[i]));
}

function jacobianRank(J, rows, cols) {
  // Rank of J via elimination on J^T J eigenvalues is overkill; use row echelon.
  const M = J.map((row) => row.slice());
  let rank = 0;
  for (let col = 0; col < cols && rank < rows; col++) {
    let piv = -1;
    for (let r = rank; r < rows; r++) if (Math.abs(M[r][col]) > 1e-10) { piv = r; break; }
    if (piv < 0) continue;
    [M[rank], M[piv]] = [M[piv], M[rank]];
    for (let r = 0; r < rows; r++) {
      if (r === rank) continue;
      const f = M[r][col] / M[rank][col];
      for (let cc = col; cc < cols; cc++) M[r][cc] -= f * M[rank][cc];
    }
    rank++;
  }
  return rank;
}

export function solveSketch(sketch, { iterations = 100, tolerance = 1e-9 } = {}) {
  const params0 = getParams(sketch);
  const n = params0.length;
  let lambda = 1e-6;
  let residuals = sketchResiduals(sketch);
  let cost = residuals.reduce((s, r) => s + r * r, 0);
  let iter = 0;
  for (; iter < iterations; iter++) {
    const maxRes = Math.max(0, ...residuals.map(Math.abs));
    if (maxRes < tolerance) break;
    // Numeric Jacobian (forward differences).
    const base = getParams(sketch);
    const J = residuals.map(() => new Array(n).fill(0));
    for (let j = 0; j < n; j++) {
      const h = 1e-7 * Math.max(1, Math.abs(base[j]));
      const trial = base.slice(); trial[j] += h;
      setParams(sketch, trial);
      const r = sketchResiduals(sketch);
      for (let i = 0; i < r.length; i++) J[i][j] = (r[i] - residuals[i]) / h;
    }
    setParams(sketch, base);
    // (J^T J + lambda I) step = -J^T r
    const A = Array.from({ length: n }, () => new Array(n).fill(0));
    const g = new Array(n).fill(0);
    for (let i = 0; i < residuals.length; i++) {
      for (let j = 0; j < n; j++) {
        g[j] += J[i][j] * residuals[i];
        for (let k = 0; k < n; k++) A[j][k] += J[i][j] * J[i][k];
      }
    }
    for (let j = 0; j < n; j++) A[j][j] += lambda;
    const step = solveLinear(A, g.map((v) => -v));
    const trial = base.map((v, j) => v + step[j]);
    setParams(sketch, trial);
    const trialRes = sketchResiduals(sketch);
    const trialCost = trialRes.reduce((s, r) => s + r * r, 0);
    if (trialCost < cost) {
      residuals = trialRes; cost = trialCost; lambda = Math.max(1e-12, lambda * 0.3);
    } else {
      setParams(sketch, base);
      lambda *= 10;
      if (lambda > 1e9) break;
    }
  }
  // Degrees of freedom from the final Jacobian rank.
  const base = getParams(sketch);
  const J = residuals.map(() => new Array(n).fill(0));
  for (let j = 0; j < n; j++) {
    const h = 1e-7 * Math.max(1, Math.abs(base[j]));
    const trial = base.slice(); trial[j] += h;
    setParams(sketch, trial);
    const r = sketchResiduals(sketch);
    for (let i = 0; i < r.length; i++) J[i][j] = (r[i] - residuals[i]) / h;
  }
  setParams(sketch, base);
  const rank = jacobianRank(J, residuals.length, n);
  const maxResidual = Math.max(0, ...residuals.map(Math.abs));
  return { converged: maxResidual < 1e-7, maxResidual, iterations: iter, dof: n - rank, variables: n, constraints: residuals.length };
}
