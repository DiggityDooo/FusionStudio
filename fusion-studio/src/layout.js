'use strict';
// Interior layout (A20 "Interior design and furniture placement
// tools"): deterministic axis-aligned rectangle placement inside
// a rectangular room. Items are placed largest-first at candidate
// positions derived from room/keep-out/placed edges (first-fit in
// z-then-x scan order, unrotated before rotated). Keep-out zones
// (door swings, circulation) are never overlapped; items flagged
// againstWall must touch a wall. Anything that cannot be placed
// is reported in `unplaced` rather than forced.

const EPS = 1e-9;

function overlaps(a, b) {
  return a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS
    && a.z < b.z + b.d - EPS && b.z < a.z + a.d - EPS;
}

function validateRect(rect, label) {
  if (!(rect.w > 0) || !(rect.d > 0)) throw new Error(`layout: ${label} size must be positive`);
}

/**
 * room: { width, depth }; keepOuts: [{ x, z, w, d }];
 * items: [{ id, w, d, allowRotate?, againstWall? }].
 * Returns { placed: [{ id, x, z, w, d, rotated }], unplaced: [id] }.
 */
export function layoutRoom({ room, keepOuts = [], items }) {
  if (!(room.width > 0) || !(room.depth > 0)) throw new Error('layout: room size must be positive');
  keepOuts.forEach((r, i) => validateRect(r, `keep-out ${i}`));
  items.forEach((item) => validateRect(item, `item ${item.id}`));
  const ordered = [...items].sort((a, b) => (b.w * b.d - a.w * a.d) || String(a.id).localeCompare(String(b.id)));
  const blockers = keepOuts.map((r) => ({ ...r }));
  const placed = [];
  const unplaced = [];

  for (const item of ordered) {
    const orientations = [{ w: item.w, d: item.d, rotated: false }];
    if (item.allowRotate !== false && item.w !== item.d) orientations.push({ w: item.d, d: item.w, rotated: true });
    let spot = null;
    for (const o of orientations) {
      if (o.w > room.width + EPS || o.d > room.depth + EPS) continue;
      const xs = new Set([0, room.width - o.w]);
      const zs = new Set([0, room.depth - o.d]);
      for (const r of [...blockers, ...placed]) {
        xs.add(r.x + r.w);
        xs.add(r.x - o.w);
        xs.add(r.x);
        zs.add(r.z + r.d);
        zs.add(r.z - o.d);
        zs.add(r.z);
      }
      const xList = [...xs].filter((x) => x >= -EPS && x <= room.width - o.w + EPS).map((x) => Math.max(0, x)).sort((a, b) => a - b);
      const zList = [...zs].filter((z) => z >= -EPS && z <= room.depth - o.d + EPS).map((z) => Math.max(0, z)).sort((a, b) => a - b);
      for (const z of zList) {
        for (const x of xList) {
          const rect = { x, z, w: o.w, d: o.d };
          if (item.againstWall) {
            const touches = x <= EPS || z <= EPS
              || x + o.w >= room.width - EPS || z + o.d >= room.depth - EPS;
            if (!touches) continue;
          }
          if (blockers.some((r) => overlaps(rect, r))) continue;
          if (placed.some((r) => overlaps(rect, r))) continue;
          spot = { id: item.id, x, z, w: o.w, d: o.d, rotated: o.rotated };
          break;
        }
        if (spot) break;
      }
      if (spot) break;
    }
    if (spot) placed.push(spot);
    else unplaced.push(item.id);
  }
  return { placed, unplaced };
}

/**
 * Independent layout audit: returns a list of violation strings
 * (empty when valid). Checks room containment, pairwise overlap,
 * keep-out overlap, and wall contact for flagged items.
 */
export function validateLayout({ room, keepOuts = [], items = [], placed }) {
  const violations = [];
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const p of placed) {
    if (p.x < -EPS || p.z < -EPS || p.x + p.w > room.width + EPS || p.z + p.d > room.depth + EPS) {
      violations.push(`${p.id}: outside room`);
    }
    for (const k of keepOuts) if (overlaps(p, k)) violations.push(`${p.id}: overlaps keep-out`);
    const item = byId.get(p.id);
    if (item?.againstWall) {
      const touches = p.x <= EPS || p.z <= EPS
        || p.x + p.w >= room.width - EPS || p.z + p.d >= room.depth - EPS;
      if (!touches) violations.push(`${p.id}: not against a wall`);
    }
  }
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      if (overlaps(placed[i], placed[j])) violations.push(`${placed[i].id}: overlaps ${placed[j].id}`);
    }
  }
  return violations;
}
