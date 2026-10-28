// MoGraph kernel (A30 baseline): cloners, effectors, fields/falloffs,
// procedural profile generators and SVG spline import.
// Works on { positions, indices } meshes and instance transforms
// { position, rotation (deg XYZ), scale }.
// Note: `src/mograph.js` holds the other session's A30 preview module;
// this file carries the test-verified kernel (tests/mograph.test.mjs).

import { curvePoint } from './nurbs.js';
import { mergeMeshes, transformMesh } from './feature-tree.js';

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

// Compose a 3x4 row-major matrix from translation, Euler XYZ degrees, scale.
export function composeMatrix({ position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] } = {}) {
  const [rx, ry, rz] = rotation.map((d) => d * Math.PI / 180);
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  // R = Rz * Ry * Rx
  const r = [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx,
  ];
  return [
    r[0] * scale[0], r[1] * scale[1], r[2] * scale[2], position[0],
    r[3] * scale[0], r[4] * scale[1], r[5] * scale[2], position[1],
    r[6] * scale[0], r[7] * scale[1], r[8] * scale[2], position[2],
  ];
}

export function identityTransform() {
  return { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
}

export function realizeClones(mesh, transforms) {
  return mergeMeshes(transforms.map((t) => transformMesh(mesh, composeMatrix(t))));
}

export function gridCloner({ counts = [2, 2, 1], spacing = [2, 2, 2], offset = [0, 0, 0] } = {}) {
  const out = [];
  for (let z = 0; z < counts[2]; z++) for (let y = 0; y < counts[1]; y++) for (let x = 0; x < counts[0]; x++) {
    out.push({ ...identityTransform(), position: [offset[0] + x * spacing[0], offset[1] + y * spacing[1], offset[2] + z * spacing[2]] });
  }
  return out;
}

export function radialCloner({ count = 8, radius = 5, axis = 'z', startDeg = 0 } = {}) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = (startDeg + i / count * 360) * Math.PI / 180;
    const position = axis === 'y' ? [radius * Math.cos(a), 0, radius * Math.sin(a)] : [radius * Math.cos(a), radius * Math.sin(a), 0];
    const rotation = axis === 'y' ? [0, -a * 180 / Math.PI, 0] : [0, 0, a * 180 / Math.PI];
    out.push({ ...identityTransform(), position, rotation });
  }
  return out;
}

export function splineCloner(curve, { count = 8, align = true } = {}) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const u = count === 1 ? 0 : i / (count - 1);
    const position = curvePoint(curve, u);
    let rotation = [0, 0, 0];
    if (align) {
      const ahead = curvePoint(curve, Math.min(1, u + 0.01));
      rotation = [0, 0, Math.atan2(ahead[1] - position[1], ahead[0] - position[0]) * 180 / Math.PI];
    }
    out.push({ ...identityTransform(), position, rotation });
  }
  return out;
}

// Distribute clones on a mesh surface (area-weighted triangle sampling).
export function surfaceCloner(mesh, { count = 16, seed = 1 } = {}) {
  const rand = rng(seed);
  const tris = [];
  let total = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const p = mesh.positions, idx = mesh.indices;
    const A = [p[idx[i] * 3], p[idx[i] * 3 + 1], p[idx[i] * 3 + 2]];
    const B = [p[idx[i + 1] * 3], p[idx[i + 1] * 3 + 1], p[idx[i + 1] * 3 + 2]];
    const C = [p[idx[i + 2] * 3], p[idx[i + 2] * 3 + 1], p[idx[i + 2] * 3 + 2]];
    const ab = B.map((v, j) => v - A[j]), ac = C.map((v, j) => v - A[j]);
    const area = 0.5 * Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]);
    total += area;
    tris.push({ A, B, C, area, cum: total });
  }
  const out = [];
  for (let n = 0; n < count; n++) {
    const pick = rand() * total;
    const tri = tris.find((t) => pick <= t.cum) || tris[tris.length - 1];
    let u = rand(), v = rand();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const position = tri.A.map((a, j) => a + u * (tri.B[j] - a) + v * (tri.C[j] - a));
    out.push({ ...identityTransform(), position });
  }
  return out;
}

// --- effectors ---------------------------------------------------------------

export function randomEffector(transforms, { seed = 1, position = [0, 0, 0], rotation = [0, 0, 0], scale = [0, 0, 0] } = {}) {
  const rand = rng(seed);
  return transforms.map((t) => ({
    position: t.position.map((v, i) => v + (rand() * 2 - 1) * position[i]),
    rotation: t.rotation.map((v, i) => v + (rand() * 2 - 1) * rotation[i]),
    scale: t.scale.map((v, i) => Math.max(0.001, v + (rand() * 2 - 1) * scale[i])),
  }));
}

// Classic step effector: instances ramp from start to end over index range.
export function stepEffector(transforms, { fromScale = 0, toScale = 1, offset = [0, 0, 0] } = {}) {
  const n = transforms.length;
  return transforms.map((t, i) => {
    const w = n <= 1 ? 1 : i / (n - 1);
    const s = fromScale + (toScale - fromScale) * w;
    return {
      position: t.position.map((v, j) => v + offset[j] * w),
      rotation: t.rotation.slice(),
      scale: t.scale.map((v) => v * s),
    };
  });
}

// Delay/spring-ish smoothing toward target scales (procedural animation aid).
export function delayEffector(transforms, targetScales, { strength = 0.5 } = {}) {
  return transforms.map((t, i) => ({
    ...t,
    scale: t.scale.map((v, j) => v + ((targetScales[i]?.[j] ?? v) - v) * strength),
  }));
}

// --- fields / falloffs ---------------------------------------------------------

export function sphericalField({ center = [0, 0, 0], radius = 5, falloff = 2 } = {}) {
  return {
    weightAt(p) {
      const d = Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2]);
      if (d <= radius - falloff) return 1;
      if (d >= radius) return 0;
      const t = (radius - d) / falloff;
      return t * t * (3 - 2 * t);
    },
  };
}

export function linearField({ origin = [0, 0, 0], direction = [1, 0, 0], length = 10, falloff = 2 } = {}) {
  const len = Math.hypot(...direction) || 1;
  const dir = direction.map((v) => v / len);
  return {
    weightAt(p) {
      const d = (p[0] - origin[0]) * dir[0] + (p[1] - origin[1]) * dir[1] + (p[2] - origin[2]) * dir[2];
      if (d <= 0) return 1;
      if (d >= length) return 0;
      const t = 1 - Math.max(0, d - (length - falloff)) / falloff;
      return Math.min(1, Math.max(0, t));
    },
  };
}

// Blend each transform toward an effect pose by the field weight.
export function applyField(transforms, field, { offset = [0, 0, 0], scaleTo = null, rotateTo = null } = {}) {
  return transforms.map((t) => {
    const w = field.weightAt(t.position);
    return {
      position: t.position.map((v, i) => v + offset[i] * w),
      rotation: rotateTo ? t.rotation.map((v, i) => v + (rotateTo[i] - v) * w) : t.rotation.slice(),
      scale: scaleTo ? t.scale.map((v, i) => v + (scaleTo[i] - v) * w) : t.scale.slice(),
    };
  });
}

// --- procedural profile generators (feed feature-tree extrude) -----------------

export function starPolygon({ points = 5, outer = 10, inner = 4 } = {}) {
  const out = [];
  for (let i = 0; i < points * 2; i++) {
    const a = i / (points * 2) * Math.PI * 2, r = i % 2 === 0 ? outer : inner;
    out.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return out;
}

export function gearPolygon({ teeth = 12, outer = 10, root = 8 } = {}) {
  const out = [];
  const step = Math.PI * 2 / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    out.push(
      [root * Math.cos(a), root * Math.sin(a)],
      [outer * Math.cos(a + step * 0.25), outer * Math.sin(a + step * 0.25)],
      [outer * Math.cos(a + step * 0.5), outer * Math.sin(a + step * 0.5)],
      [root * Math.cos(a + step * 0.75), root * Math.sin(a + step * 0.75)],
    );
  }
  return out;
}

export function spiralPoints({ turns = 3, radius = 10, points = 64, growth = 0 } = {}) {
  const out = [];
  for (let i = 0; i <= points; i++) {
    const t = i / points, a = t * turns * Math.PI * 2, r = radius * (growth ? t : 1);
    out.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return out;
}

// --- 3D block text (5x7 cell font, extruded) -----------------------------------
// A deliberately simple block font: every filled cell becomes a box, so text
// is real watertight-per-cell geometry. No bevels and no outline fonts —
// per-character transforms below are the animation surface.

export const BLOCK_FONT = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '....#', '....#', '....#', '....#', '#...#', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '.#.#.', '..#..', '..#..', '..#..', '.#.#.', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '..##.', '.#...', '#....', '#####'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.....', '..#..'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '..##.', '..#..', '.....', '..#..'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  ':': ['.....', '.....', '..#..', '.....', '.....', '..#..', '.....'],
};

function cellBox(x, y, z, w, h, d) {
  const v = [[x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y + h, z], [x, y, z + d], [x + w, y, z + d], [x + w, y + h, z + d], [x, y + h, z + d]];
  const faces = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
  const positions = [], indices = [];
  for (const f of faces) { const b = positions.length / 3; f.forEach((i) => positions.push(...v[i])); indices.push(b, b + 2, b + 1, b, b + 3, b + 2); }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

// Build extruded block text. Returns merged mesh plus per-character meshes
// (in reading order) for animation. Supports '\n' line breaks.
export function textToMesh(text, { cell = 1, depth = 1, tracking = 1, lineHeight = 9 } = {}) {
  if (typeof text !== 'string' || !text.length) throw new Error('Text required.');
  const advance = (5 + tracking) * cell;
  const characters = [];
  const meshes = [];
  let cursorX = 0, cursorY = 0, maxX = 0;
  for (const ch of text.toUpperCase()) {
    if (ch === '\n') { cursorX = 0; cursorY -= lineHeight * cell; continue; }
    if (ch === ' ') { cursorX += advance; continue; }
    const glyph = BLOCK_FONT[ch];
    if (!glyph) throw new Error(`No block glyph for character: ${JSON.stringify(ch)}`);
    const cells = [];
    glyph.forEach((row, r) => {
      [...row].forEach((mark, c) => { if (mark === '#') cells.push(cellBox(cursorX + c * cell, cursorY + (6 - r) * cell, 0, cell, cell, depth)); });
    });
    const charMesh = mergeMeshes(cells);
    characters.push({ char: ch, index: characters.length, offsetX: cursorX, offsetY: cursorY, mesh: charMesh });
    meshes.push(charMesh);
    cursorX += advance;
    maxX = Math.max(maxX, cursorX);
  }
  return {
    mesh: meshes.length ? mergeMeshes(meshes) : { positions: new Float32Array(), indices: new Uint32Array() },
    characters, width: maxX - tracking * cell, cell, depth,
  };
}

// Per-character animation: wave (sine bounce) or spin (sine rocking).
export function animateText(textResult, t, { mode = 'wave', amplitude = 0.6, speed = 3, phase = 0.7 } = {}) {
  const meshes = textResult.characters.map((c, i) => {
    const wave = Math.sin(t * speed + i * phase);
    const matrix = mode === 'spin'
      ? composeMatrix({ position: [c.offsetX, c.offsetY + amplitude * 0.2 * wave, 0], rotation: [0, 0, wave * 18] })
      : composeMatrix({ position: [c.offsetX, c.offsetY + amplitude * wave, 0] });
    // Character meshes are built at their offsets; rebuild from glyph-local
    // coordinates by first undoing the baked offset.
    const local = transformMesh(c.mesh, composeMatrix({ position: [-c.offsetX, -c.offsetY, 0] }));
    return transformMesh(local, matrix);
  });
  return meshes.length ? mergeMeshes(meshes) : textResult.mesh;
}

// --- grease pencil strokes ------------------------------------------------------
// Strokes are 3D polylines with per-point radius (pressure). They mesh as
// parallel-transport tubes or flat ribbons; frames support onion skinning.

export function createGreasePencil() {
  return { layers: [{ name: 'Layer 1', strokes: [] }] };
}

export function addStroke(gp, points, { layer = 0, radius = 0.1, radii = null, color = [0, 0, 0], frame = 0, closed = false } = {}) {
  if (!Array.isArray(points) || points.length < 2) throw new Error('Stroke needs at least two points.');
  points.forEach((p) => { if (!Array.isArray(p) || p.length !== 3 || p.some((v) => !Number.isFinite(v))) throw new Error('Stroke points must be finite [x, y, z].'); });
  if (!gp.layers[layer]) throw new Error(`Grease pencil layer ${layer} missing.`);
  const stroke = {
    points: points.map((p) => p.slice()),
    radii: radii ? radii.slice() : points.map(() => radius),
    color: color.slice(), frame, closed,
  };
  if (stroke.radii.length !== points.length || stroke.radii.some((r) => !(r > 0))) throw new Error('Radii must be positive and match point count.');
  gp.layers[layer].strokes.push(stroke);
  return stroke;
}

// Strokes visible at a frame, with onion-skin ghosts fading by distance.
export function strokesAtFrame(gp, frame, { onion = 0 } = {}) {
  const out = [];
  for (const layer of gp.layers) {
    for (const stroke of layer.strokes) {
      const dist = Math.abs(stroke.frame - frame);
      if (dist === 0) out.push({ stroke, opacity: 1, ghost: false });
      else if (onion > 0 && dist <= onion) out.push({ stroke, opacity: 1 - 0.6 * (dist / (onion + 1)), ghost: true });
    }
  }
  return out;
}

// Douglas-Peucker simplification.
export function simplifyStroke(points, tolerance = 0.05) {
  if (points.length <= 2) return points.map((p) => p.slice());
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  const distToSeg = (p, a, b) => {
    const ab = b.map((v, i) => v - a[i]);
    const len2 = ab.reduce((s, v) => s + v * v, 0);
    const t = len2 ? Math.min(1, Math.max(0, p.reduce((s, v, i) => s + (v - a[i]) * ab[i], 0) / len2)) : 0;
    return Math.hypot(p[0] - (a[0] + ab[0] * t), p[1] - (a[1] + ab[1] * t), p[2] - (a[2] + ab[2] * t));
  };
  while (stack.length) {
    const [lo, hi] = stack.pop();
    let maxD = 0, maxI = -1;
    for (let i = lo + 1; i < hi; i++) { const d = distToSeg(points[i], points[lo], points[hi]); if (d > maxD) { maxD = d; maxI = i; } }
    if (maxD > tolerance && maxI > 0) { keep[maxI] = true; stack.push([lo, maxI], [maxI, hi]); }
  }
  return points.filter((_, i) => keep[i]);
}

// Chaikin corner cutting (one pass roughly doubles point count).
export function smoothStroke(points, iterations = 1) {
  let pts = points.map((p) => p.slice());
  for (let it = 0; it < iterations; it++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      out.push(a.map((v, j) => v * 0.75 + b[j] * 0.25), a.map((v, j) => v * 0.25 + b[j] * 0.75));
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

// Parallel-transport frames along a polyline: [{ tangent, normal, binormal }].
function strokeFrames(points) {
  const tangents = points.map((p, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(...t) || 1;
    return t.map((v) => v / len);
  });
  let normal = Math.abs(tangents[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const frames = [];
  for (let i = 0; i < points.length; i++) {
    const t = tangents[i];
    const dot = normal[0] * t[0] + normal[1] * t[1] + normal[2] * t[2];
    normal = normal.map((v, j) => v - dot * t[j]);
    const len = Math.hypot(...normal);
    if (len < 1e-8) normal = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    else normal = normal.map((v) => v / len);
    const binormal = [t[1] * normal[2] - t[2] * normal[1], t[2] * normal[0] - t[0] * normal[2], t[0] * normal[1] - t[1] * normal[0]];
    frames.push({ tangent: t, normal: normal.slice(), binormal });
  }
  return frames;
}

// Sweep a circular profile along the stroke (open ends).
export function strokeToTube(stroke, { sides = 8 } = {}) {
  if (!Number.isInteger(sides) || sides < 3) throw new Error('Tube needs at least three sides.');
  const frames = strokeFrames(stroke.points);
  const positions = [], indices = [];
  stroke.points.forEach((p, i) => {
    const { normal, binormal } = frames[i];
    for (let s = 0; s < sides; s++) {
      const a = s / sides * Math.PI * 2, r = stroke.radii[i];
      positions.push(
        p[0] + (normal[0] * Math.cos(a) + binormal[0] * Math.sin(a)) * r,
        p[1] + (normal[1] * Math.cos(a) + binormal[1] * Math.sin(a)) * r,
        p[2] + (normal[2] * Math.cos(a) + binormal[2] * Math.sin(a)) * r,
      );
    }
  });
  const rings = stroke.closed ? stroke.points.length : stroke.points.length - 1;
  for (let i = 0; i < rings; i++) {
    const next = (i + 1) % stroke.points.length;
    for (let s = 0; s < sides; s++) {
      const a = i * sides + s, b = i * sides + (s + 1) % sides, c = next * sides + s, d = next * sides + (s + 1) % sides;
      indices.push(a, b, c, b, d, c);
    }
  }
  if (!stroke.closed && stroke.points.length > 1) {
    // End caps: triangle fans to the spine endpoints.
    const start = positions.length / 3;
    positions.push(...stroke.points[0]);
    const end = positions.length / 3;
    positions.push(...stroke.points[stroke.points.length - 1]);
    const lastRing = (stroke.points.length - 1) * sides;
    for (let s = 0; s < sides; s++) {
      const sNext = (s + 1) % sides;
      indices.push(start, sNext, s);
      indices.push(end, lastRing + s, lastRing + sNext);
    }
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

// Flat ribbon in the stroke's local plane (perpendicular to `up`).
export function strokeToRibbon(stroke, { up = [0, 0, 1] } = {}) {
  const positions = [], indices = [];
  const frames = strokeFrames(stroke.points);
  stroke.points.forEach((p, i) => {
    const t = frames[i].tangent;
    let side = [t[1] * up[2] - t[2] * up[1], t[2] * up[0] - t[0] * up[2], t[0] * up[1] - t[1] * up[0]];
    const len = Math.hypot(...side) || 1;
    side = side.map((v) => v / len);
    const r = stroke.radii[i];
    positions.push(p[0] - side[0] * r, p[1] - side[1] * r, p[2] - side[2] * r, p[0] + side[0] * r, p[1] + side[1] * r, p[2] + side[2] * r);
  });
  for (let i = 0; i < stroke.points.length - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    indices.push(a, c, b, b, c, d);
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

// --- toon shading & outlines -----------------------------------------------------

function meshVertexNormals(mesh) {
  const normals = new Float32Array(mesh.positions.length);
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const vs = [0, 1, 2].map((k) => mesh.indices[i + k] * 3);
    const A = [mesh.positions[vs[0]], mesh.positions[vs[0] + 1], mesh.positions[vs[0] + 2]];
    const B = [mesh.positions[vs[1]], mesh.positions[vs[1] + 1], mesh.positions[vs[1] + 2]];
    const C = [mesh.positions[vs[2]], mesh.positions[vs[2] + 1], mesh.positions[vs[2] + 2]];
    const ab = B.map((v, j) => v - A[j]), ac = C.map((v, j) => v - A[j]);
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    for (const o of vs) { normals[o] += n[0]; normals[o + 1] += n[1]; normals[o + 2] += n[2]; }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= len; normals[i + 1] /= len; normals[i + 2] /= len;
  }
  return normals;
}

// Inverted-hull outline: displace along vertex normals, flip winding so the
// shell renders inside-out (the classic toon outline). Combine with the
// source mesh for a renderable pair.
export function toonOutline(mesh, { width = 0.05 } = {}) {
  if (!(width > 0)) throw new Error('Outline width must be positive.');
  const normals = meshVertexNormals(mesh);
  const positions = new Float32Array(mesh.positions.length);
  for (let i = 0; i < positions.length; i++) positions[i] = mesh.positions[i] + normals[i] * width;
  const indices = new Uint32Array(mesh.indices.length);
  for (let i = 0; i < mesh.indices.length; i += 3) {
    indices[i] = mesh.indices[i];
    indices[i + 1] = mesh.indices[i + 2];
    indices[i + 2] = mesh.indices[i + 1];
  }
  return { positions, indices };
}

// Quantized diffuse for cel shading: returns a band value in [0, 1].
export function toonShade(normal, lightDir, { bands = 3, ambient = 0.15 } = {}) {
  const nl = Math.hypot(...normal) || 1, ll = Math.hypot(...lightDir) || 1;
  const diffuse = Math.max(0, (normal[0] * lightDir[0] + normal[1] * lightDir[1] + normal[2] * lightDir[2]) / (nl * ll));
  const stepped = Math.floor(diffuse * bands) / Math.max(1, bands - 1);
  return ambient + (1 - ambient) * Math.min(1, stepped);
}

// Silhouette edges from a view direction: boundary edges plus edges where
// the two adjacent faces straddle the view plane. Expects a welded mesh.
export function silhouetteEdges(mesh, viewDir) {
  const len = Math.hypot(...viewDir) || 1;
  const view = viewDir.map((v) => v / len);
  const faceNormals = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const vs = [0, 1, 2].map((k) => mesh.indices[i + k] * 3);
    const A = [mesh.positions[vs[0]], mesh.positions[vs[0] + 1], mesh.positions[vs[0] + 2]];
    const B = [mesh.positions[vs[1]], mesh.positions[vs[1] + 1], mesh.positions[vs[1] + 2]];
    const C = [mesh.positions[vs[2]], mesh.positions[vs[2] + 1], mesh.positions[vs[2] + 2]];
    const ab = B.map((v, j) => v - A[j]), ac = C.map((v, j) => v - A[j]);
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const l = Math.hypot(...n) || 1;
    faceNormals.push(n.map((v) => v / l));
  }
  const edgeFaces = new Map();
  for (let f = 0; f < faceNormals.length; f++) {
    const tri = [mesh.indices[f * 3], mesh.indices[f * 3 + 1], mesh.indices[f * 3 + 2]];
    for (let e = 0; e < 3; e++) {
      const a = tri[e], b = tri[(e + 1) % 3];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (!edgeFaces.has(key)) edgeFaces.set(key, []);
      edgeFaces.get(key).push(f);
    }
  }
  const segments = [];
  for (const [key, faces] of edgeFaces) {
    const silhouette = faces.length === 1
      || (faceNormals[faces[0]][0] * view[0] + faceNormals[faces[0]][1] * view[1] + faceNormals[faces[0]][2] * view[2] >= 0)
        !== (faceNormals[faces[1]][0] * view[0] + faceNormals[faces[1]][1] * view[1] + faceNormals[faces[1]][2] * view[2] >= 0);
    if (!silhouette) continue;
    const [a, b] = key.split('_').map(Number);
    segments.push({
      from: [mesh.positions[a * 3], mesh.positions[a * 3 + 1], mesh.positions[a * 3 + 2]],
      to: [mesh.positions[b * 3], mesh.positions[b * 3 + 1], mesh.positions[b * 3 + 2]],
    });
  }
  return segments;
}

// --- procedural animation presets --------------------------------------------------
// A preset maps instance index -> { delay, duration } and evaluates eased
// per-instance animation over time. Easings are exact at their endpoints.

export const EASINGS = {
  linear: (u) => u,
  easeOutCubic: (u) => 1 - (1 - u) ** 3,
  easeInOutQuad: (u) => (u < 0.5 ? 2 * u * u : 1 - ((-2 * u + 2) ** 2) / 2),
  easeOutBack: (u) => 1 + 2.70158 * ((u - 1) ** 3) + 1.70158 * ((u - 1) ** 2),
  bounceOut: (u) => {
    const n1 = 7.5625, d1 = 2.75;
    if (u < 1 / d1) return n1 * u * u;
    if (u < 2 / d1) return n1 * ((u -= 1.5 / d1) * u) + 0.75;
    if (u < 2.5 / d1) return n1 * ((u -= 2.25 / d1) * u) + 0.9375;
    return n1 * ((u -= 2.625 / d1) * u) + 0.984375;
  },
};

export const MOGRAPH_PRESETS = {
  cascadeIn: { easing: 'easeOutCubic', stagger: 0.08, duration: 0.6, from: { scale: 0, offsetY: -1.5 } },
  typewriter: { easing: 'linear', stagger: 0.12, duration: 0.01, from: { scale: 0 } },
  wavePulse: { easing: 'easeInOutQuad', stagger: 0.15, duration: 1.2, from: { scale: 0.4 } },
  dropIn: { easing: 'bounceOut', stagger: 0.1, duration: 0.9, from: { scale: 1, offsetY: 6 } },
  spinIn: { easing: 'easeOutBack', stagger: 0.07, duration: 0.7, from: { scale: 0, spinDeg: -120 } },
};

export function evaluatePreset(transforms, presetName, t, overrides = {}) {
  const preset = { ...MOGRAPH_PRESETS[presetName], ...overrides };
  if (!MOGRAPH_PRESETS[presetName] && !overrides.easing) throw new Error(`Unknown mograph preset: ${presetName}`);
  const ease = EASINGS[preset.easing];
  if (!ease) throw new Error(`Unknown easing: ${preset.easing}`);
  const { stagger = 0.1, duration = 0.6, from = {} } = preset;
  return transforms.map((tr, i) => {
    const local = Math.min(1, Math.max(0, (t - i * stagger) / duration));
    const e = ease(local);
    return {
      position: [tr.position[0], tr.position[1] + (from.offsetY || 0) * (1 - e), tr.position[2]],
      rotation: [tr.rotation[0], tr.rotation[1], tr.rotation[2] + (from.spinDeg || 0) * (1 - e)],
      scale: tr.scale.map((s) => s * ((from.scale ?? 1) + (1 - (from.scale ?? 1)) * e)),
    };
  });
}

// --- audio-reactive animation -----------------------------------------------------
// Radix-2 FFT (power-of-two lengths) over PCM samples -> band energies ->
// instance animation. No audio decoding; feed it sample arrays.

export function fftMagnitudes(samples) {
  const n = samples.length;
  if (n < 2 || (n & (n - 1)) !== 0) throw new Error('FFT needs a power-of-two sample count (>= 2).');
  const re = Float64Array.from(samples), im = new Float64Array(n);
  // Hann window reduces spectral leakage.
  for (let i = 0; i < n; i++) re[i] *= 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let size = 2; size <= n; size *= 2) {
    const half = size / 2, ang = -2 * Math.PI / size;
    for (let base = 0; base < n; base += size) {
      for (let k = 0; k < half; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const a = base + k, b = a + half;
        const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
      }
    }
  }
  const mags = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) mags[i] = Math.hypot(re[i], im[i]) / (n / 4);
  return mags;
}

export function bandEnergies(magnitudes, sampleRate, bands = { bass: [20, 250], mid: [250, 4000], treble: [4000, 16000] }) {
  const binHz = sampleRate / (magnitudes.length * 2);
  const out = {};
  for (const [name, [lo, hi]] of Object.entries(bands)) {
    let sum = 0, count = 0;
    for (let i = 0; i < magnitudes.length; i++) {
      const hz = i * binHz;
      if (hz >= lo && hz < hi) { sum += magnitudes[i]; count++; }
    }
    out[name] = count ? sum / count : 0;
  }
  return out;
}

// Attack/release envelope follower for beat-like response.
export function envelopeFollow(values, { attack = 0.6, release = 0.12 } = {}) {
  const out = [];
  let level = 0;
  for (const v of values) {
    level = v > level ? level + (v - level) * attack : level + (v - level) * release;
    out.push(level);
  }
  return out;
}

export function audioDrive(transforms, energies, { band = 'bass', height = 2, baseScale = 0.2 } = {}) {
  const energy = Math.min(1, energies[band] ?? 0);
  return transforms.map((tr, i) => {
    const per = Array.isArray(energies.values) ? Math.min(1, energies.values[i % energies.values.length]) : energy;
    return {
      position: [tr.position[0], tr.position[1] + per * height, tr.position[2]],
      rotation: tr.rotation.slice(),
      scale: tr.scale.map((s) => s * (baseScale + per * (1 - baseScale))),
    };
  });
}

// --- camera-mapped 2.5D cards --------------------------------------------------------
// A card at `distance` along the camera forward that exactly fills the
// frustum slice there (parallax layer setup).
export function cameraCard({ position = [0, 0, 0], target = [0, 0, -1], fovDeg = 50, aspect = 16 / 9 } = {}, distance, { fill = 1 } = {}) {
  if (!(distance > 0)) throw new Error('Card distance must be positive.');
  const forward = [target[0] - position[0], target[1] - position[1], target[2] - position[2]];
  const fl = Math.hypot(...forward) || 1;
  const f = forward.map((v) => v / fl);
  const height = 2 * distance * Math.tan(fovDeg * Math.PI / 360) * fill;
  return {
    center: position.map((v, i) => v + f[i] * distance),
    forward: f,
    width: height * aspect,
    height,
    distance,
  };
}

export function parallaxCards(camera, distances, opts = {}) {
  return distances.map((d) => cameraCard(camera, d, opts));
}

// --- SVG import (path subset: M/L/H/V/C/Q/Z, absolute + relative) ---------------

const TOKEN = /([MLHVCQZSAmlhvqzsat])|(-?\d*\.?\d+(?:e-?\d+)?)/g;

export function parseSvgPath(d, { curveSegments = 16 } = {}) {
  if (typeof d !== 'string' || !d.trim()) throw new Error('SVG path data required.');
  const tokens = [...d.matchAll(TOKEN)].map((m) => m[1] || m[2]);
  const paths = [];
  let current = [], i = 0, cmd = null, cx = 0, cy = 0, sx = 0, sy = 0;
  const num = () => {
    if (i >= tokens.length || /[MLHVCQZSAmlhvqzsat]/i.test(tokens[i])) throw new Error('Malformed SVG path: number expected.');
    return Number(tokens[i++]);
  };
  const flush = () => { if (current.length > 1) paths.push(current); current = []; };
  while (i < tokens.length) {
    if (/[MLHVCQZSAmlhvqzsat]/.test(tokens[i])) { cmd = tokens[i++]; } else if (!cmd) throw new Error('SVG path must start with a command.');
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case 'Z':
        if (current.length) { current.push(current[0].slice()); cx = sx; cy = sy; }
        break;
      case 'M': {
        flush();
        const x = num(), y = num();
        cx = rel ? cx + x : x; cy = rel ? cy + y : y; sx = cx; sy = cy;
        current = [[cx, cy]];
        cmd = rel ? 'l' : 'L';
        break;
      }
      case 'L': { const x = num(), y = num(); cx = rel ? cx + x : x; cy = rel ? cy + y : y; current.push([cx, cy]); break; }
      case 'H': { const x = num(); cx = rel ? cx + x : x; current.push([cx, cy]); break; }
      case 'V': { const y = num(); cy = rel ? cy + y : y; current.push([cx, cy]); break; }
      case 'C': {
        let [x1, y1, x2, y2, x, y] = [num(), num(), num(), num(), num(), num()];
        if (rel) { x1 += cx; y1 += cy; x2 += cx; y2 += cy; x += cx; y += cy; }
        for (let s = 1; s <= curveSegments; s++) {
          const t = s / curveSegments, mt = 1 - t;
          current.push([
            mt ** 3 * cx + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t ** 3 * x,
            mt ** 3 * cy + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t ** 3 * y,
          ]);
        }
        cx = x; cy = y;
        break;
      }
      case 'Q': {
        let [x1, y1, x, y] = [num(), num(), num(), num()];
        if (rel) { x1 += cx; y1 += cy; x += cx; y += cy; }
        for (let s = 1; s <= curveSegments; s++) {
          const t = s / curveSegments, mt = 1 - t;
          current.push([mt * mt * cx + 2 * mt * t * x1 + t * t * x, mt * mt * cy + 2 * mt * t * y1 + t * t * y]);
        }
        cx = x; cy = y;
        break;
      }
      default: throw new Error(`Unsupported SVG path command: ${cmd}`);
    }
  }
  flush();
  return paths;
}
