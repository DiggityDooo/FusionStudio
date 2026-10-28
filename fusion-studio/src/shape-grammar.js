// Shape grammars (A4 rule-based generation): Stiny-style parametric shape
// replacement over 2D line-segment shapes. Rules match their left-hand side
// under similarity transforms (translation, rotation, uniform scale,
// optional reflection) and replace the matched segments with the
// transformed right-hand side.

const EPS = 1e-9;

const ptEq = (a, b, eps = 1e-7) => Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps;

export function validateShape(shape, what = 'shape') {
  if (!Array.isArray(shape)) throw new Error(`${what} must be an array of segments.`);
  for (const seg of shape) {
    if (!Array.isArray(seg) || seg.length !== 2 || seg.some((p) => !Array.isArray(p) || p.length !== 2 || p.some((v) => !Number.isFinite(v)))) {
      throw new Error(`${what} segments must be [[x, y], [x, y]] with finite coordinates.`);
    }
  }
  return shape;
}

export function shapeLength(shape) {
  return shape.reduce((s, [[x1, y1], [x2, y2]]) => s + Math.hypot(x2 - x1, y2 - y1), 0);
}

// Map local points through the similarity defined by sending lhs segment
// (a -> b) onto target segment (c -> d); mirror flips the perpendicular.
function makeMapper(a, b, c, d, mirror) {
  const e1 = [b[0] - a[0], b[1] - a[1]];
  const len2 = e1[0] * e1[0] + e1[1] * e1[1];
  if (len2 < EPS) throw new Error('Rule LHS first segment is degenerate.');
  const f = [d[0] - c[0], d[1] - c[1]];
  return (p) => {
    const rel = [p[0] - a[0], p[1] - a[1]];
    const alpha = (rel[0] * e1[0] + rel[1] * e1[1]) / len2;
    const beta = (rel[0] * -e1[1] + rel[1] * e1[0]) / len2 * mirror;
    return [
      c[0] + alpha * f[0] + beta * -f[1],
      c[1] + alpha * f[1] + beta * f[0],
    ];
  };
}

function segmentIndexIn(shape, p, q) {
  for (let i = 0; i < shape.length; i++) {
    const [a, b] = shape[i];
    if ((ptEq(a, p) && ptEq(b, q)) || (ptEq(a, q) && ptEq(b, p))) return i;
  }
  return -1;
}

// All matches of `lhs` inside `shape` (first-segment pairing search).
export function findMatches(shape, lhs, { allowMirror = true } = {}) {
  validateShape(shape); validateShape(lhs, 'rule LHS');
  if (!lhs.length) throw new Error('Rule LHS must not be empty.');
  const [la, lb] = lhs[0];
  const matches = [];
  for (let i = 0; i < shape.length; i++) {
    for (const [c, d] of [shape[i], [shape[i][1], shape[i][0]]]) {
      for (const mirror of allowMirror ? [1, -1] : [1]) {
        const map = makeMapper(la, lb, c, d, mirror);
        const indices = [];
        let ok = true;
        for (const seg of lhs) {
          const idx = segmentIndexIn(shape, map(seg[0]), map(seg[1]));
          if (idx < 0) { ok = false; break; }
          indices.push(idx);
        }
        if (ok) matches.push({ map, indices: [...new Set(indices)] });
      }
    }
  }
  return matches;
}

function dedupeSegments(segments) {
  const out = [];
  for (const seg of segments) if (segmentIndexIn(out, seg[0], seg[1]) < 0) out.push(seg);
  return out;
}

// Apply the first match of a rule; returns the new shape or null.
export function applyRule(shape, rule) {
  const matches = findMatches(shape, rule.lhs, rule);
  if (!matches.length) return null;
  const { map, indices } = matches[0];
  const removed = new Set(indices);
  const next = shape.filter((_, i) => !removed.has(i));
  for (const seg of rule.rhs) next.push([map(seg[0]), map(seg[1])]);
  return dedupeSegments(next);
}

// Apply a rule to every distinct match in parallel (one derivation level).
// Matches are grouped by their matched segment set so orientation/mirror
// duplicates of the same sub-shape apply only once; matched sets may share
// segments (removed once, right-hand sides unioned and deduped).
export function applyRuleParallel(shape, rule) {
  const matches = findMatches(shape, rule.lhs, rule);
  if (!matches.length) return { shape, applied: 0 };
  const bySet = new Map();
  for (const m of matches) {
    const key = m.indices.slice().sort((a, b) => a - b).join(',');
    if (!bySet.has(key)) bySet.set(key, m);
  }
  const chosen = [...bySet.values()];
  const removed = new Set();
  chosen.forEach((m) => m.indices.forEach((i) => removed.add(i)));
  const next = shape.filter((_, i) => !removed.has(i));
  for (const m of chosen) for (const seg of rule.rhs) next.push([m.map(seg[0]), m.map(seg[1])]);
  return { shape: dedupeSegments(next), applied: chosen.length };
}

// Sequential derivation: at each step apply the first rule that matches.
export function derive(initial, rules, { steps = 16 } = {}) {
  validateShape(initial, 'initial shape');
  if (!Array.isArray(rules) || !rules.length) throw new Error('Derivation needs at least one rule.');
  rules.forEach((r) => { validateShape(r.lhs, 'rule LHS'); validateShape(r.rhs, 'rule RHS'); });
  let shape = initial.map((seg) => seg.map((p) => p.slice()));
  const history = [shape.length];
  let applied = 0;
  for (let s = 0; s < steps; s++) {
    let progressed = false;
    for (const rule of rules) {
      const next = applyRule(shape, rule);
      if (next) { shape = next; applied++; progressed = true; break; }
    }
    history.push(shape.length);
    if (!progressed) break;
  }
  return { shape, applied, history };
}

// The classic Koch rule: one segment -> four segments with a triangular bump.
export function kochRule() {
  const y = Math.sqrt(3) / 6;
  return {
    name: 'koch',
    lhs: [[[0, 0], [1, 0]]],
    rhs: [
      [[0, 0], [1 / 3, 0]],
      [[1 / 3, 0], [1 / 2, y]],
      [[1 / 2, y], [2 / 3, 0]],
      [[2 / 3, 0], [1, 0]],
    ],
  };
}

// Square -> subdivided square. The outline is re-emitted as half segments
// so the four sub-squares are themselves matchable at the next level.
export function squareSubdivisionRule() {
  const outline = [
    [[0, 0], [1, 0]], [[1, 0], [1, 1]], [[1, 1], [0, 1]], [[0, 1], [0, 0]],
  ];
  const halves = [
    [[0, 0], [0.5, 0]], [[0.5, 0], [1, 0]],
    [[1, 0], [1, 0.5]], [[1, 0.5], [1, 1]],
    [[1, 1], [0.5, 1]], [[0.5, 1], [0, 1]],
    [[0, 1], [0, 0.5]], [[0, 0.5], [0, 0]],
    [[0.5, 0], [0.5, 0.5]], [[0.5, 0.5], [0.5, 1]],
    [[0, 0.5], [0.5, 0.5]], [[0.5, 0.5], [1, 0.5]],
  ];
  return { name: 'square-subdivide', lhs: outline, rhs: halves };
}
