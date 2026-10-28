'use strict';
// Chroma keying (A22 "Live compositing and keying"): excess-channel
// keyer with despill. For a key color, the key channel is its
// dominant channel; a pixel's "keyness" is its excess of that channel
// over the other two, normalized by the key color's own excess.
// alpha = 1 - smoothstep(similarity - blend, similarity, keyness):
// pixels at/above `similarity` key out fully, the blend band gives
// soft edges. Despill clamps the key channel to the max of the other
// channels on non-opaque pixels (removes color fringing).

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / Math.max(edge1 - edge0, 1e-9), 0, 1);
  return t * t * (3 - 2 * t);
}

function keyChannelOf(key) {
  let best = 0;
  for (let c = 1; c < 3; c++) if (key[c] > key[best]) best = c;
  return best;
}

function excess(pixel, channel) {
  const others = [0, 1, 2].filter((c) => c !== channel);
  return pixel[channel] - Math.max(pixel[others[0]], pixel[others[1]]);
}

/**
 * Keyness of one pixel in [0, 1]: 1 = indistinguishable from the key
 * color by channel excess, 0 = no key-channel excess at all.
 */
export function keyness(pixel, key) {
  const channel = keyChannelOf(key);
  const keyExcess = excess(key, channel);
  if (keyExcess <= 0) throw new Error('chroma-key: key color has no dominant channel (gray/white cannot key)');
  return clamp(excess(pixel, channel) / keyExcess, 0, 1);
}

/** Alpha (0 transparent .. 1 opaque) for one pixel. */
export function chromaAlpha(pixel, key, { similarity = 0.6, blend = 0.15 } = {}) {
  if (!(similarity > 0 && similarity <= 1)) throw new Error('chroma-key: similarity must be in (0, 1]');
  if (!(blend >= 0)) throw new Error('chroma-key: blend must be >= 0');
  return 1 - smoothstep(similarity - blend, similarity, keyness(pixel, key));
}

/** Despill one pixel: cap the key channel at the max of the others. */
export function despillPixel(pixel, key, strength = 1) {
  const channel = keyChannelOf(key);
  const others = [0, 1, 2].filter((c) => c !== channel);
  const cap = Math.max(pixel[others[0]], pixel[others[1]]);
  const out = [...pixel];
  out[channel] = pixel[channel] + (Math.min(pixel[channel], cap) - pixel[channel]) * clamp(strength, 0, 1);
  return out;
}

/**
 * Key an RGB(A) image. data: Uint8Array/ClampedArray, 3 or 4 bytes
 * per pixel (alpha input ignored). Returns { width, height, data }
 * RGBA with keyed alpha and (optionally) despilled color.
 */
export function chromaKeyImage({ width, height, data }, { key = [0, 255, 0], similarity = 0.6, blend = 0.15, despill = true, despillStrength = 1 } = {}) {
  const bytesPerPixel = data.length / (width * height);
  if (![3, 4].includes(bytesPerPixel)) throw new Error('chroma-key: image data must be RGB or RGBA');
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const src = [data[i * bytesPerPixel], data[i * bytesPerPixel + 1], data[i * bytesPerPixel + 2]];
    const alpha = chromaAlpha(src, key, { similarity, blend });
    const color = despill && alpha > 0 ? despillPixel(src, key, despillStrength) : src;
    out[i * 4] = color[0];
    out[i * 4 + 1] = color[1];
    out[i * 4 + 2] = color[2];
    out[i * 4 + 3] = Math.round(alpha * 255);
  }
  return { width, height, data: out };
}

/** Premultiply RGB by alpha (for compositing pipelines). */
export function premultiply({ width, height, data }) {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < width * height; i++) {
    const a = data[i * 4 + 3] / 255;
    out[i * 4] = Math.round(data[i * 4] * a);
    out[i * 4 + 1] = Math.round(data[i * 4 + 1] * a);
    out[i * 4 + 2] = Math.round(data[i * 4 + 2] * a);
    out[i * 4 + 3] = data[i * 4 + 3];
  }
  return { width, height, data: out };
}

/** Composite foreground (RGBA) over an opaque background (RGB). */
export function compositeOver(fg, bg) {
  if (fg.width !== bg.width || fg.height !== bg.height) throw new Error('chroma-key: size mismatch');
  const out = new Uint8Array(fg.width * fg.height * 3);
  for (let i = 0; i < fg.width * fg.height; i++) {
    const a = fg.data[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) {
      out[i * 3 + c] = Math.round(fg.data[i * 4 + c] * a + bg.data[i * 3 + c] * (1 - a));
    }
  }
  return { width: fg.width, height: fg.height, data: out };
}
