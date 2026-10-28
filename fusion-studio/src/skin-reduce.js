'use strict';
// Character LOD skin reduction (A16 "Character LOD generation"):
// shrink skinned meshes for lower LOD tiers by capping per-vertex
// joint influences and pruning the joint palette, with exact
// renormalization accounting. Skin data is packed flat arrays:
// indices/weights of length vertexCount * stride; unused slots
// carry weight 0.

function checkSkin(skin) {
  const { indices, weights, stride } = skin;
  if (!Number.isInteger(stride) || stride < 1) throw new Error('skin: stride must be a positive integer');
  if (indices.length !== weights.length || indices.length % stride !== 0) {
    throw new Error('skin: indices/weights must have equal length, a multiple of stride');
  }
  return { indices, weights, stride, vertexCount: indices.length / stride };
}

/**
 * Per-vertex influence pruning: drop weights below epsilon, keep
 * the strongest `keep`, renormalize to sum 1. A vertex left with
 * no influence falls back to its originally strongest joint at
 * weight 1. Returns new packed arrays (same stride) + stats.
 */
export function pruneInfluences(skin, { keep = 4, epsilon = 0 } = {}) {
  const { indices, weights, stride, vertexCount } = checkSkin(skin);
  if (!Number.isInteger(keep) || keep < 1 || keep > stride) throw new Error('skin: keep must be within [1, stride]');
  if (!(epsilon >= 0)) throw new Error('skin: epsilon must be >= 0');
  const outIndices = new Int32Array(indices.length).fill(-1);
  const outWeights = new Float32Array(indices.length);
  let droppedMass = 0, verticesChanged = 0;
  for (let v = 0; v < vertexCount; v++) {
    const base = v * stride;
    const pairs = [];
    let strongest = -1, strongestW = -Infinity;
    for (let s = 0; s < stride; s++) {
      const w = weights[base + s];
      if (w > strongestW) { strongestW = w; strongest = indices[base + s]; }
      if (w > epsilon && indices[base + s] >= 0) pairs.push([indices[base + s], w]);
    }
    pairs.sort((a, b) => b[1] - a[1]);
    const keptPairs = pairs.slice(0, keep);
    const keptSum = keptPairs.reduce((sum, [, w]) => sum + w, 0);
    // Dropped mass is measured against the full original row
    // (epsilon-filtered weights count as dropped too).
    let totalSum = 0;
    for (let s = 0; s < stride; s++) if (weights[base + s] > 0) totalSum += weights[base + s];
    droppedMass += Math.max(0, totalSum - keptSum);
    if (keptPairs.length === 0) {
      if (strongest < 0) throw new Error(`skin: vertex ${v} has no influences`);
      outIndices[base] = strongest;
      outWeights[base] = 1;
      verticesChanged++;
      continue;
    }
    let changed = keptPairs.length !== pairs.length;
    keptPairs.forEach(([joint, w], s) => {
      outIndices[base + s] = joint;
      outWeights[base + s] = w / keptSum;
    });
    // Detect any renormalization drift on untouched rows too.
    if (!changed) {
      for (let s = 0; s < keptPairs.length; s++) {
        if (Math.abs(outWeights[base + s] - keptPairs[s][1]) > 1e-12) { changed = true; break; }
      }
    }
    if (changed) verticesChanged++;
  }
  return {
    skin: { indices: outIndices, weights: outWeights, stride },
    stats: { droppedMass, verticesChanged, vertexCount },
  };
}

/** Per-joint usage: total weight mass and influenced vertex count. */
export function jointUsage(skin, jointCount) {
  const { indices, weights, stride, vertexCount } = checkSkin(skin);
  const mass = new Float64Array(jointCount);
  const vertices = new Uint32Array(jointCount);
  for (let v = 0; v < vertexCount; v++) {
    const seen = new Set();
    for (let s = 0; s < stride; s++) {
      const joint = indices[v * stride + s];
      const w = weights[v * stride + s];
      if (joint < 0 || w === 0) continue;
      if (joint >= jointCount) throw new Error(`skin: joint index ${joint} out of range`);
      mass[joint] += w;
      if (!seen.has(joint)) { vertices[joint]++; seen.add(joint); }
    }
  }
  return { mass, vertices };
}

/**
 * Choose the joint palette for a LOD tier: the `budget` joints
 * with the most weight mass (ties broken by lower index), always
 * including any `required` joints.
 */
export function selectJointPalette(skin, { budget, required = [] } = {}) {
  const { indices } = checkSkin(skin);
  let jointCount = 0;
  for (const j of indices) if (j + 1 > jointCount) jointCount = j + 1;
  for (const r of required) if (r + 1 > jointCount) jointCount = r + 1;
  if (!Number.isInteger(budget) || budget < 1) throw new Error('skin: budget must be a positive integer');
  const { mass } = jointUsage(skin, jointCount);
  const ranked = [...mass.keys()].sort((a, b) => (mass[b] - mass[a]) || (a - b));
  const keep = new Set(required);
  for (const joint of ranked) {
    if (keep.size >= budget) break;
    keep.add(joint);
  }
  if (keep.size > budget) throw new Error('skin: required joints exceed the budget');
  return { palette: [...keep].sort((a, b) => a - b), mass };
}

/**
 * Remove non-palette joints from every vertex, renormalizing;
 * vertices orphaned by the palette fall back to the strongest
 * palette joint globally (by mass). Then prune influences.
 */
export function buildLodSkin(skin, { maxInfluences = 4, jointBudget = Infinity, epsilon = 0, requiredJoints = [] } = {}) {
  const { vertexCount } = checkSkin(skin);
  let palette = null;
  let working = skin;
  if (Number.isFinite(jointBudget)) {
    const selected = selectJointPalette(skin, { budget: jointBudget, required: requiredJoints });
    palette = selected.palette;
    const keepSet = new Set(palette);
    const { indices, weights, stride } = skin;
    const filteredIndices = new Int32Array(indices.length).fill(-1);
    const filteredWeights = new Float32Array(indices.length);
    // Fallback: palette joint with the greatest global mass.
    let fallback = palette[0];
    for (const joint of palette) if (selected.mass[joint] > selected.mass[fallback]) fallback = joint;
    for (let v = 0; v < vertexCount; v++) {
      const base = v * stride;
      let slot = 0, sum = 0;
      for (let s = 0; s < stride; s++) {
        const joint = indices[base + s], w = weights[base + s];
        if (joint >= 0 && w > 0 && keepSet.has(joint)) {
          filteredIndices[base + slot] = joint;
          filteredWeights[base + slot] = w;
          slot++;
          sum += w;
        }
      }
      if (slot === 0) {
        filteredIndices[base] = fallback;
        filteredWeights[base] = 1;
      } else {
        for (let s = 0; s < slot; s++) filteredWeights[base + s] /= sum;
      }
    }
    working = { indices: filteredIndices, weights: filteredWeights, stride };
  }
  const pruned = pruneInfluences(working, { keep: maxInfluences, epsilon });
  return {
    skin: pruned.skin,
    palette,
    stats: {
      ...pruned.stats,
      jointsBefore: new Set([...skin.indices].filter((j) => j >= 0)).size,
      jointsAfter: new Set([...pruned.skin.indices].filter((j) => j >= 0)).size,
    },
  };
}
