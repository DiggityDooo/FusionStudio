'use strict';
// Procedural tree/plant generation (A20 "Procedural tree/plant
// generators (leaf, branch, growth)"): deterministic L-system string
// rewriting plus a 3D turtle interpreter that emits branch segments.
// Rewriting is exactly verifiable (parallel substitution); the turtle
// supports branching brackets, tropism (growth bias toward/away from
// up), per-depth length decay, and seeded angle jitter for variation.

/** Parallel-rewrite `axiom` by `rules` for `iterations` generations. */
export function expandLSystem(axiom, rules, iterations) {
  if (!Number.isInteger(iterations) || iterations < 0) throw new Error('l-system: iterations must be a non-negative integer');
  let current = axiom;
  for (let gen = 0; gen < iterations; gen++) {
    let next = '';
    for (const ch of current) next += rules[ch] !== undefined ? rules[ch] : ch;
    current = next;
  }
  return current;
}

function seededRandom(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function rotate(vec, axis, angleRad) {
  // Rodrigues rotation of vec around unit axis.
  const [x, y, z] = vec, [ax, ay, az] = axis;
  const cos = Math.cos(angleRad), sin = Math.sin(angleRad);
  const dot = ax * x + ay * y + az * z;
  return [
    x * cos + (ay * z - az * y) * sin + ax * dot * (1 - cos),
    y * cos + (az * x - ax * z) * sin + ay * dot * (1 - cos),
    z * cos + (ax * y - ay * x) * sin + az * dot * (1 - cos),
  ];
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (v) => {
  const l = Math.hypot(...v) || 1;
  return v.map((x) => x / l);
};

/**
 * Interpret an L-system string as 3D branches.
 * Symbols: F move+draw, f move, + - turn (yaw), & ^ pitch, \ / roll,
 * [ ] push/pop, | turn 180. Unknown letters are ignored (variables).
 * options: { step, angleDeg, decay (length multiplier per bracket
 * depth), radius, radiusDecay, tropism [x,y,z] strength 0..1,
 * jitterDeg, seed, origin, heading }
 * Returns [{ a, b, radius, depth }] segments.
 */
export function interpretLSystem(text, {
  step = 1, angleDeg = 25, decay = 0.85, radius = 0.08, radiusDecay = 0.7,
  tropism = 0, jitterDeg = 0, seed = 1, origin = [0, 0, 0], heading = [0, 1, 0],
} = {}) {
  const rand = seededRandom(seed);
  const angle = (angleDeg * Math.PI) / 180;
  const jitter = () => (jitterDeg > 0 ? (rand() * 2 - 1) * jitterDeg * Math.PI / 180 : 0);
  let position = [...origin];
  // Turtle frame: dir (heading), left, upv -- orthonormal, with
  // upv = left x dir. Yaw (+/-) is about upv, pitch (&/^) about left,
  // roll (\/) about dir. (Yawing about world Y would do nothing for a
  // vertical shoot; the frame must travel with the turtle.)
  let dir = normalize([...heading]);
  let left = normalize(cross(dir, Math.abs(dir[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
  let upv = normalize(cross(left, dir));
  let depth = 0;
  const stack = [];
  const segments = [];
  const up = [0, 1, 0];

  function applyTropism() {
    if (tropism === 0) return;
    dir = normalize([
      dir[0] + up[0] * tropism * 0.1,
      dir[1] + up[1] * tropism * 0.1,
      dir[2] + up[2] * tropism * 0.1,
    ]);
    upv = normalize(cross(left, dir));
    left = normalize(cross(dir, upv));
  }

  for (const ch of text) {
    switch (ch) {
      case 'F': {
        const len = step * Math.pow(decay, depth);
        const next = [
          position[0] + dir[0] * len,
          position[1] + dir[1] * len,
          position[2] + dir[2] * len,
        ];
        segments.push({ a: [...position], b: next, radius: radius * Math.pow(radiusDecay, depth), depth });
        position = next;
        applyTropism();
        break;
      }
      case 'f': {
        const len = step * Math.pow(decay, depth);
        position = [
          position[0] + dir[0] * len,
          position[1] + dir[1] * len,
          position[2] + dir[2] * len,
        ];
        break;
      }
      case '+': { const a = angle + jitter(); dir = rotate(dir, upv, a); left = rotate(left, upv, a); break; }
      case '-': { const a = -(angle + jitter()); dir = rotate(dir, upv, a); left = rotate(left, upv, a); break; }
      case '&': { const a = angle + jitter(); dir = rotate(dir, left, a); upv = rotate(upv, left, a); break; }
      case '^': { const a = -(angle + jitter()); dir = rotate(dir, left, a); upv = rotate(upv, left, a); break; }
      case '\\': left = rotate(left, dir, angle); upv = rotate(upv, dir, angle); break;
      case '/': left = rotate(left, dir, -angle); upv = rotate(upv, dir, -angle); break;
      case '|': dir = rotate(dir, upv, Math.PI); left = rotate(left, upv, Math.PI); break;
      case '[':
        stack.push({ position: [...position], dir: [...dir], left: [...left], upv: [...upv], depth });
        depth++;
        break;
      case ']': {
        const state = stack.pop();
        if (!state) throw new Error('l-system: unbalanced ] in string');
        ({ position, dir, left, upv, depth } = state);
        break;
      }
      default: break; // variables / ignored symbols
    }
  }
  if (stack.length > 0) throw new Error('l-system: unbalanced [ in string');
  return segments;
}

/** Convenience: expand + interpret a full plant in one call. */
export function generatePlant({ axiom, rules, iterations, ...turtleOptions }) {
  const text = expandLSystem(axiom, rules, iterations);
  const segments = interpretLSystem(text, turtleOptions);
  return { text, segments };
}

/** Total branch length and bounding height of a segment list. */
export function plantStats(segments) {
  let totalLength = 0, maxHeight = -Infinity, minHeight = Infinity;
  for (const s of segments) {
    totalLength += Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]);
    maxHeight = Math.max(maxHeight, s.a[1], s.b[1]);
    minHeight = Math.min(minHeight, s.a[1], s.b[1]);
  }
  return { segmentCount: segments.length, totalLength, maxHeight, minHeight };
}
