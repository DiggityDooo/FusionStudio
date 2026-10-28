'use strict';
// Scene streaming / world partition (A20 "Scene streaming/world
// partition"): a uniform XZ grid over the world. Objects register
// their AABBs into every cell they overlap; view-driven streaming
// computes deterministic load/unload diffs with hysteresis so cells
// on the border do not thrash.

export function createWorldPartition({ cellSize = 64, origin = [0, 0] } = {}) {
  if (cellSize <= 0) throw new Error('partition: cellSize must be positive');
  return { cellSize, origin: [...origin], cells: new Map(), objects: new Map() };
}

export function cellKey(cx, cz) {
  return `${cx}:${cz}`;
}

export function cellCoordsForPoint(partition, x, z) {
  return [
    Math.floor((x - partition.origin[0]) / partition.cellSize),
    Math.floor((z - partition.origin[1]) / partition.cellSize),
  ];
}

/** All cell keys an AABB { min: [x,y,z], max: [x,y,z] } overlaps (XZ). */
export function cellsForAABB(partition, aabb) {
  const [cx0, cz0] = cellCoordsForPoint(partition, aabb.min[0], aabb.min[2]);
  const [cx1, cz1] = cellCoordsForPoint(partition, aabb.max[0], aabb.max[2]);
  const keys = [];
  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cz = cz0; cz <= cz1; cz++) keys.push(cellKey(cx, cz));
  }
  return keys;
}

/** Register (or re-register) an object with its world AABB. */
export function registerObject(partition, id, aabb) {
  unregisterObject(partition, id);
  const keys = cellsForAABB(partition, aabb);
  partition.objects.set(id, { aabb, cells: keys });
  for (const key of keys) {
    if (!partition.cells.has(key)) partition.cells.set(key, new Set());
    partition.cells.get(key).add(id);
  }
  return keys;
}

export function unregisterObject(partition, id) {
  const existing = partition.objects.get(id);
  if (!existing) return false;
  for (const key of existing.cells) {
    const set = partition.cells.get(key);
    if (set) {
      set.delete(id);
      if (set.size === 0) partition.cells.delete(key);
    }
  }
  partition.objects.delete(id);
  return true;
}

function aabbOverlaps(a, b) {
  return a.min[0] <= b.max[0] && a.max[0] >= b.min[0]
    && a.min[2] <= b.max[2] && a.max[2] >= b.min[2];
}

/**
 * Objects whose cells intersect the query AABB. With exact = true,
 * results are filtered by real AABB overlap (no false positives).
 */
export function queryObjects(partition, aabb, { exact = true } = {}) {
  const keys = cellsForAABB(partition, aabb);
  const found = new Set();
  for (const key of keys) {
    const set = partition.cells.get(key);
    if (set) for (const id of set) found.add(id);
  }
  const ids = [...found];
  if (!exact) return ids.sort();
  return ids.filter((id) => aabbOverlaps(partition.objects.get(id).aabb, aabb)).sort();
}

/**
 * Streaming diff for a view AABB. Cells intersecting the view are
 * wanted; loaded cells outside the view EXPANDED by `hysteresis`
 * (world units) are unloaded — the margin stops border thrash.
 * Returns { toLoad: [keys], toUnload: [keys] } (sorted).
 */
export function streamingUpdate(partition, viewAABB, loadedCells, { hysteresis = 16 } = {}) {
  const wanted = new Set(cellsForAABB(partition, viewAABB));
  const keepAABB = {
    min: [viewAABB.min[0] - hysteresis, viewAABB.min[1], viewAABB.min[2] - hysteresis],
    max: [viewAABB.max[0] + hysteresis, viewAABB.max[1], viewAABB.max[2] + hysteresis],
  };
  const keep = new Set(cellsForAABB(partition, keepAABB));
  const toLoad = [...wanted].filter((k) => !loadedCells.has(k)).sort();
  const toUnload = [...loadedCells].filter((k) => !keep.has(k)).sort();
  return { toLoad, toUnload };
}

/** Apply a streaming diff to a loaded-cells set. Returns the set. */
export function applyStreamingDiff(loadedCells, { toLoad, toUnload }) {
  for (const k of toLoad) loadedCells.add(k);
  for (const k of toUnload) loadedCells.delete(k);
  return loadedCells;
}

/** Objects in the currently loaded cells (what the renderer draws). */
export function loadedObjects(partition, loadedCells) {
  const found = new Set();
  for (const key of loadedCells) {
    const set = partition.cells.get(key);
    if (set) for (const id of set) found.add(id);
  }
  return [...found].sort();
}
