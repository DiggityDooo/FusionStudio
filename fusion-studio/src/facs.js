'use strict';
// FACS facial expressions & corrective shapes (A16 "Facial expression
// presets and facial pose libraries", "Facial expression libraries
// and corrective shapes"; A13 FACS-based face rigging): expressions
// are recipes of Facial Action Coding System action units (AUs).
// Compose presets additively with clamping; corrective shapes fire
// from AU combinations (weight = weakest trigger), which is how real
// rigs fix volume artifacts of naive AU blending. AU weights are
// scalars or { left, right } for asymmetric units.

export const ACTION_UNITS = {
  AU1: 'inner brow raiser', AU2: 'outer brow raiser', AU4: 'brow lowerer',
  AU5: 'upper lid raiser', AU6: 'cheek raiser', AU7: 'lid tightener',
  AU9: 'nose wrinkler', AU10: 'upper lip raiser', AU12: 'lip corner puller',
  AU14: 'dimpler', AU15: 'lip corner depressor', AU16: 'lower lip depressor', AU17: 'chin raiser',
  AU18: 'lip pucker', AU20: 'lip stretcher', AU23: 'lip tightener',
  AU25: 'lips part', AU26: 'jaw drop', AU27: 'mouth stretch',
  AU43: 'eyes closed', AU45: 'blink',
};

export const EXPRESSIONS = {
  neutral: {},
  happiness: { AU6: 0.7, AU12: 1.0, AU25: 0.25 },
  sadness: { AU1: 0.85, AU4: 0.5, AU15: 0.8, AU17: 0.3 },
  anger: { AU4: 1.0, AU5: 0.6, AU7: 0.7, AU10: 0.4, AU23: 0.8 },
  surprise: { AU1: 0.7, AU2: 0.9, AU5: 0.85, AU26: 0.65 },
  fear: { AU1: 0.8, AU2: 0.7, AU4: 0.6, AU5: 0.9, AU20: 0.6, AU26: 0.5 },
  disgust: { AU9: 0.9, AU10: 0.8, AU15: 0.4, AU16: 0 },
  contempt: { AU12: { left: 0.85, right: 0.1 }, AU14: { left: 0.7, right: 0 } },
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));

function sidesOf(value) {
  if (typeof value === 'number') return { left: value, right: value };
  return { left: value.left ?? 0, right: value.right ?? 0 };
}

function checkAU(au) {
  if (!ACTION_UNITS[au]) throw new Error(`facs: unknown action unit '${au}'`);
}

/**
 * Compose expression layers [{ expression | aus, weight }] into an
 * AU map { AU: {left, right} }, summed and clamped to [0, 1].
 * `expression` names a preset; `aus` gives a raw AU recipe.
 */
export function composeExpressions(layers) {
  const out = {};
  for (const layer of layers) {
    const weight = layer.weight ?? 1;
    if (!(weight >= 0)) throw new Error('facs: layer weight must be >= 0');
    let recipe;
    if (layer.expression !== undefined) {
      recipe = EXPRESSIONS[layer.expression];
      if (!recipe) throw new Error(`facs: unknown expression '${layer.expression}'`);
    } else if (layer.aus) {
      recipe = layer.aus;
    } else {
      throw new Error('facs: layer needs an expression name or aus');
    }
    for (const [au, value] of Object.entries(recipe)) {
      checkAU(au);
      if (typeof value === 'number' && value === 0) continue;
      const sides = sidesOf(value);
      const cur = out[au] || { left: 0, right: 0 };
      cur.left = clamp01(cur.left + sides.left * weight);
      cur.right = clamp01(cur.right + sides.right * weight);
      out[au] = cur;
    }
  }
  return out;
}

/**
 * Corrective-shape rules: [{ name, when: { AU: minWeight, ... },
 * scale = 1 }]. A corrective's weight is scale * min(trigger
 * strengths) -- it only fires when ALL triggers are present.
 * Trigger strength for an AU is min(left, right) unless the rule
 * names a side via 'AU12.left'.
 */
export function evaluateCorrectives(auMap, rules) {
  const out = {};
  for (const rule of rules) {
    let weakest = Infinity;
    for (const [key, minWeight] of Object.entries(rule.when)) {
      const [au, side] = key.split('.');
      checkAU(au);
      const entry = auMap[au];
      if (!entry) { weakest = 0; break; }
      const strength = side === 'left' ? entry.left : side === 'right' ? entry.right : Math.min(entry.left, entry.right);
      weakest = Math.min(weakest, strength / (minWeight || 1));
    }
    const weight = clamp01((weakest === Infinity ? 0 : weakest) * (rule.scale ?? 1));
    if (weight > 0) out[rule.name] = weight;
  }
  return out;
}

/**
 * Map an AU map to blendshape weights via { AU: shapeName } or
 * { AU: { shape, scale, splitSides } }: with splitSides, shapes are
 * emitted as `${shape}_L` / `${shape}_R`; otherwise the max side.
 */
export function toBlendshapeWeights(auMap, mapping) {
  const out = {};
  for (const [au, spec] of Object.entries(mapping)) {
    checkAU(au);
    const entry = auMap[au];
    if (!entry) continue;
    const conf = typeof spec === 'string' ? { shape: spec } : spec;
    const scale = conf.scale ?? 1;
    if (conf.splitSides) {
      if (entry.left > 0) out[`${conf.shape}_L`] = clamp01(entry.left * scale);
      if (entry.right > 0) out[`${conf.shape}_R`] = clamp01(entry.right * scale);
    } else {
      const w = clamp01(Math.max(entry.left, entry.right) * scale);
      if (w > 0) out[conf.shape] = w;
    }
  }
  return out;
}

/** Full pipeline: layers -> AUs -> blendshapes + correctives. */
export function evaluateFace(layers, { mapping = {}, correctives = [] } = {}) {
  const aus = composeExpressions(layers);
  return {
    aus,
    shapes: toBlendshapeWeights(aus, mapping),
    correctives: evaluateCorrectives(aus, correctives),
  };
}
