'use strict';
// Exploded views (A29 "Exploded views and technical illustrations"):
// move parts away from an assembly origin (radially, along an axis,
// or per-part custom directions), optionally in two stages -- groups
// separate from the origin first, then parts separate from their
// group centers. factor 0 is the assembled state; offsets scale
// linearly with factor so the view is animatable.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const length = (a) => Math.hypot(a[0], a[1], a[2]);

function directionFrom(center, origin) {
  const d = sub(center, origin);
  const len = length(d);
  return len < 1e-12 ? { dir: [0, 0, 0], dist: 0 } : { dir: scale(d, 1 / len), dist: len };
}

/**
 * Compute exploded positions.
 * parts: [{ name, center, direction? (custom mode), group? }]
 * options: { factor = 1, mode = 'radial' | 'axis' | 'custom',
 *   origin = centroid, axis = [0,1,0], groupFactor = factor }
 * Radial: offset = normalize(center-origin) * (factor * distance).
 * Axis:   offset = axis * (factor * signed distance along axis).
 * Custom: offset = part.direction (normalized) * (factor * distance).
 * With groups (radial/custom), a part's offset is
 * groupOffset(at groupFactor) + localOffset(at factor).
 * Returns [{ name, center (original), offset, position }].
 */
export function explodedView(parts, { factor = 1, mode = 'radial', origin = null, axis = [0, 1, 0], groupFactor = null } = {}) {
  if (!Array.isArray(parts) || parts.length === 0) throw new Error('exploded-view: needs at least one part');
  if (!['radial', 'axis', 'custom'].includes(mode)) throw new Error(`exploded-view: unknown mode '${mode}'`);
  const center = origin || parts.reduce(
    (acc, p) => add(acc, p.center), [0, 0, 0]).map((v) => v / parts.length);
  const gFactor = groupFactor === null ? factor : groupFactor;

  const groupCenters = new Map();
  for (const part of parts) {
    if (part.group === undefined) continue;
    const list = groupCenters.get(part.group) || [];
    list.push(part.center);
    groupCenters.set(part.group, list);
  }
  for (const [name, list] of groupCenters) {
    groupCenters.set(name, list.reduce((a, c) => add(a, c), [0, 0, 0]).map((v) => v / list.length));
  }

  function offsetFor(partCenter, from, f) {
    if (f === 0) return [0, 0, 0];
    if (mode === 'axis') {
      const axLen = length(axis);
      if (axLen < 1e-12) throw new Error('exploded-view: axis mode needs a non-zero axis');
      const ax = scale(axis, 1 / axLen);
      const signed = sub(partCenter, from).reduce((s, v, i) => s + v * ax[i], 0);
      return scale(ax, f * signed);
    }
    const { dir, dist } = directionFrom(partCenter, from);
    return scale(dir, f * dist);
  }

  return parts.map((part) => {
    let offset;
    if (mode === 'custom') {
      if (!part.direction) throw new Error(`exploded-view: part '${part.name}' needs a direction in custom mode`);
      const len = length(part.direction);
      if (len < 1e-12) throw new Error(`exploded-view: part '${part.name}' has a zero direction`);
      const dir = scale(part.direction, 1 / len);
      const { dist } = directionFrom(part.center, center);
      offset = scale(dir, factor * Math.max(dist, 1));
    } else if (part.group !== undefined && groupCenters.has(part.group)) {
      const gc = groupCenters.get(part.group);
      offset = add(offsetFor(gc, center, gFactor), offsetFor(part.center, gc, factor));
    } else {
      offset = offsetFor(part.center, center, factor);
    }
    return { name: part.name, center: [...part.center], offset, position: add(part.center, offset) };
  });
}

/** Assemble interpolation helper: positions at an in-between factor. */
export function explodedAt(parts, options, t) {
  return explodedView(parts, { ...options, factor: (options.factor ?? 1) * t, groupFactor: (options.groupFactor ?? options.factor ?? 1) * t });
}
