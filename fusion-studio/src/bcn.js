'use strict';
// BC1/BC3 (DXT1/DXT5) block texture compression (A23 "Texture
// streaming and compression (BCn/ASTC)" -- the BCn half). Endpoints are
// min/max colors quantized to RGB565; indices pick the nearest palette
// entry. Deterministic, no dependencies, exact byte layout:
// BC1 block = 8 bytes (2x RGB565 LE + 32-bit index word),
// BC3 block = 16 bytes (8-byte alpha block + BC1 color block).

function pack565(r, g, b) {
  return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
}
function unpack565(c) {
  const r5 = (c >> 11) & 31, g6 = (c >> 5) & 63, b5 = c & 31;
  return [(r5 << 3) | (r5 >> 2), (g6 << 2) | (g6 >> 4), (b5 << 3) | (b5 >> 2)];
}

function palette(c0, c1, threeColor) {
  const a = unpack565(c0), b = unpack565(c1);
  if (threeColor) {
    return [a, b, a.map((v, i) => (v + b[i]) >> 1), null]; // null = transparent
  }
  return [
    a, b,
    a.map((v, i) => ((2 * v + b[i]) / 3) | 0),
    a.map((v, i) => ((v + 2 * b[i]) / 3) | 0),
  ];
}

function nearestIndex(pal, r, g, b) {
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < pal.length; i++) {
    if (!pal[i]) continue;
    const d = (pal[i][0] - r) ** 2 + (pal[i][1] - g) ** 2 + (pal[i][2] - b) ** 2;
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

/** Encode one 4x4 block. pixels: 16 [r,g,b,a] quads (0..255). */
export function encodeBC1Block(pixels) {
  const hasTransparent = pixels.some((p) => p[3] < 128);
  const opaque = pixels.filter((p) => p[3] >= 128);
  const source = opaque.length > 0 ? opaque : pixels;
  let min = [255, 255, 255], max = [0, 0, 0];
  for (const p of source) {
    for (let c = 0; c < 3; c++) {
      min[c] = Math.min(min[c], p[c]);
      max[c] = Math.max(max[c], p[c]);
    }
  }
  let cMax = pack565(max[0], max[1], max[2]);
  let cMin = pack565(min[0], min[1], min[2]);
  // BC1: c0 > c1 selects the 4-color palette; c0 <= c1 the 3-color +
  // transparent palette. Assign endpoints accordingly.
  let c0, c1;
  if (hasTransparent) { c0 = Math.min(cMax, cMin); c1 = Math.max(cMax, cMin); if (c0 === c1) c1 = c0 + 1 > 0xffff ? c0 - 1 : c1; }
  else { c0 = Math.max(cMax, cMin); c1 = Math.min(cMax, cMin); }
  const pal = palette(c0, c1, hasTransparent);
  const out = new Uint8Array(8);
  const view = new DataView(out.buffer);
  view.setUint16(0, c0, true);
  view.setUint16(2, c1, true);
  let word = 0;
  for (let i = 0; i < 16; i++) {
    const p = pixels[i];
    const idx = hasTransparent && p[3] < 128 ? 3 : nearestIndex(pal, p[0], p[1], p[2]);
    word |= idx << (i * 2);
  }
  view.setUint32(4, word >>> 0, true);
  return out;
}

/** Decode one BC1 block to 16 [r,g,b,a] quads. */
export function decodeBC1Block(block) {
  const view = new DataView(block.buffer, block.byteOffset, 8);
  const c0 = view.getUint16(0, true);
  const c1 = view.getUint16(2, true);
  const threeColor = c0 <= c1;
  const pal = palette(c0, c1, threeColor);
  const word = view.getUint32(4, true);
  const out = [];
  for (let i = 0; i < 16; i++) {
    const idx = (word >>> (i * 2)) & 3;
    const color = pal[idx];
    out.push(color ? [color[0], color[1], color[2], 255] : [0, 0, 0, 0]);
  }
  return out;
}

function encodeAlphaBlock(pixels) {
  let aMax = 0, aMin = 255;
  for (const p of pixels) { aMax = Math.max(aMax, p[3]); aMin = Math.min(aMin, p[3]); }
  const pal = [aMax, aMin];
  for (let i = 1; i <= 6; i++) pal.push(((7 - i) * aMax + i * aMin) / 7);
  const out = new Uint8Array(8);
  out[0] = aMax; out[1] = aMin;
  // 48-bit little-endian index packing, 3 bits per pixel.
  let bitPos = 16;
  for (let i = 0; i < 16; i++) {
    let best = 0, bestDist = Infinity;
    for (let k = 0; k < 8; k++) {
      const d = Math.abs(pal[k] - pixels[i][3]);
      if (d < bestDist) { bestDist = d; best = k; }
    }
    for (let bit = 0; bit < 3; bit++) {
      const byteIndex = (bitPos + bit) >> 3;
      const bitIndex = (bitPos + bit) & 7;
      if ((best >> bit) & 1) out[byteIndex] |= (1 << bitIndex);
    }
    bitPos += 3;
  }
  return out;
}

function decodeAlphaBlock(block) {
  const a0 = block[0], a1 = block[1];
  const pal = a0 > a1
    ? [a0, a1, ...[1, 2, 3, 4, 5, 6].map((i) => (((7 - i) * a0 + i * a1) / 7) | 0)]
    : [a0, a1, ((4 * a0 + a1) / 5) | 0, ((3 * a0 + 2 * a1) / 5) | 0, ((2 * a0 + 3 * a1) / 5) | 0, ((a0 + 4 * a1) / 5) | 0, 0, 255];
  const out = [];
  for (let i = 0; i < 16; i++) {
    const bitPos = 16 + i * 3;
    let idx = 0;
    for (let bit = 0; bit < 3; bit++) {
      const byteIndex = (bitPos + bit) >> 3;
      const bitIndex = (bitPos + bit) & 7;
      if ((block[byteIndex] >> bitIndex) & 1) idx |= (1 << bit);
    }
    out.push(pal[idx]);
  }
  return out;
}

/** Encode one 4x4 BC3 block (alpha block + color block). */
export function encodeBC3Block(pixels) {
  const out = new Uint8Array(16);
  out.set(encodeAlphaBlock(pixels), 0);
  out.set(encodeBC1Block(pixels.map((p) => [p[0], p[1], p[2], 255])), 8);
  return out;
}

export function decodeBC3Block(block) {
  const alphas = decodeAlphaBlock(block.subarray(0, 8));
  const colors = decodeBC1Block(block.subarray(8, 16));
  return colors.map((c, i) => [c[0], c[1], c[2], alphas[i]]);
}

function blockDims(width, height) {
  return { blocksWide: Math.ceil(width / 4), blocksHigh: Math.ceil(height / 4) };
}

function eachBlock(width, height, data, fn) {
  const { blocksWide, blocksHigh } = blockDims(width, height);
  for (let by = 0; by < blocksHigh; by++) {
    for (let bx = 0; bx < blocksWide; bx++) {
      const pixels = [];
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const sx = Math.min(bx * 4 + x, width - 1);
          const sy = Math.min(by * 4 + y, height - 1);
          const o = (sy * width + sx) * 4;
          pixels.push([data[o], data[o + 1], data[o + 2], data[o + 3]]);
        }
      }
      fn(bx, by, pixels);
    }
  }
}

function encodeTexture(width, height, data, blockEncoder, blockBytes) {
  const { blocksWide, blocksHigh } = blockDims(width, height);
  const out = new Uint8Array(blocksWide * blocksHigh * blockBytes);
  eachBlock(width, height, data, (bx, by, pixels) => {
    out.set(blockEncoder(pixels), (by * blocksWide + bx) * blockBytes);
  });
  return { width, height, blocksWide, blocksHigh, data: out };
}

function decodeTexture(tex, blockDecoder, blockBytes) {
  const out = new Uint8Array(tex.width * tex.height * 4);
  const { blocksWide } = blockDims(tex.width, tex.height);
  for (let idx = 0; idx < tex.data.length / blockBytes; idx++) {
    const bx = idx % blocksWide, by = Math.floor(idx / blocksWide);
    const pixels = blockDecoder(tex.data.subarray(idx * blockBytes, (idx + 1) * blockBytes));
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const sx = bx * 4 + x, sy = by * 4 + y;
        if (sx >= tex.width || sy >= tex.height) continue;
        const o = (sy * tex.width + sx) * 4;
        const p = pixels[y * 4 + x];
        out[o] = p[0]; out[o + 1] = p[1]; out[o + 2] = p[2]; out[o + 3] = p[3];
      }
    }
  }
  return { width: tex.width, height: tex.height, data: out };
}

export function encodeBC1Texture(width, height, data) { return encodeTexture(width, height, data, encodeBC1Block, 8); }
export function decodeBC1Texture(tex) { return decodeTexture(tex, decodeBC1Block, 8); }
export function encodeBC3Texture(width, height, data) { return encodeTexture(width, height, data, encodeBC3Block, 16); }
export function decodeBC3Texture(tex) { return decodeTexture(tex, decodeBC3Block, 16); }
