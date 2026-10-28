// FFT spectrum ocean (A19 ocean depth): Tessendorf-style Phillips spectrum
// evolved in the frequency domain and inverted with a 2D FFT. Point queries
// evaluate the same modal sum directly, so grid and analytic paths agree.

function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

function gaussianPair(rand) {
  const u = Math.max(1e-12, rand()), v = rand();
  const r = Math.sqrt(-2 * Math.log(u)), a = 2 * Math.PI * v;
  return [r * Math.cos(a), r * Math.sin(a)];
}

// Iterative radix-2 FFT in place; inverse=true applies conjugate scaling.
function fft1d(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let size = 2; size <= n; size *= 2) {
    const half = size / 2, ang = (inverse ? 2 : -2) * Math.PI / size;
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
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

function fft2d(re, im, n, inverse) {
  const rowRe = new Float64Array(n), rowIm = new Float64Array(n);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) { rowRe[x] = re[z * n + x]; rowIm[x] = im[z * n + x]; }
    fft1d(rowRe, rowIm, inverse);
    for (let x = 0; x < n; x++) { re[z * n + x] = rowRe[x]; im[z * n + x] = rowIm[x]; }
  }
  for (let x = 0; x < n; x++) {
    for (let z = 0; z < n; z++) { rowRe[z] = re[z * n + x]; rowIm[z] = im[z * n + x]; }
    fft1d(rowRe, rowIm, inverse);
    for (let z = 0; z < n; z++) { re[z * n + x] = rowRe[z]; im[z * n + x] = rowIm[z]; }
  }
}

const G = 9.81;

export function createOcean({ gridSize = 64, worldSize = 128, windSpeed = 12, windAngle = 0, amplitude = 1, seed = 1, gravity = G } = {}) {
  if (!Number.isInteger(gridSize) || gridSize < 4 || (gridSize & (gridSize - 1)) !== 0) throw new Error('Ocean grid size must be a power of two >= 4.');
  if (!(worldSize > 0) || !(windSpeed > 0)) throw new Error('World size and wind speed must be positive.');
  const rand = makeRng(seed);
  const wind = [Math.cos(windAngle), Math.sin(windAngle)];
  const L = windSpeed * windSpeed / gravity;
  const h0 = new Float64Array(gridSize * gridSize * 2);
  const freq = (i) => (i <= gridSize / 2 ? i : i - gridSize) * 2 * Math.PI / worldSize;
  for (let iz = 0; iz < gridSize; iz++) {
    for (let ix = 0; ix < gridSize; ix++) {
      const kx = freq(ix), kz = freq(iz);
      const k = Math.hypot(kx, kz);
      const o = (iz * gridSize + ix) * 2;
      if (k < 1e-6) continue;
      const dot = Math.abs((kx * wind[0] + kz * wind[1]) / k);
      const phillips = amplitude * Math.exp(-1 / ((k * L) ** 2)) / (k ** 4) * dot * dot;
      const [gr, gi] = gaussianPair(rand);
      const scale = Math.sqrt(phillips / 2);
      h0[o] = gr * scale;
      h0[o + 1] = gi * scale;
    }
  }
  return { gridSize, worldSize, windSpeed, windAngle, amplitude, seed, gravity, h0 };
}

// H(k, t) = h0(k) e^{iwt} + conj(h0(-k)) e^{-iwt}, w = sqrt(g |k|).
function modeAt(ocean, ix, iz, t) {
  const { gridSize: n, worldSize, gravity, h0 } = ocean;
  const freq = (i) => (i <= n / 2 ? i : i - n) * 2 * Math.PI / worldSize;
  const k = Math.hypot(freq(ix), freq(iz));
  const omega = Math.sqrt(gravity * k);
  const o = (iz * n + ix) * 2;
  const mo = (((n - iz) % n) * n + ((n - ix) % n)) * 2;
  const [a, b] = [h0[o], h0[o + 1]];
  const [d, e] = [h0[mo], h0[mo + 1]];
  const c = Math.cos(omega * t), s = Math.sin(omega * t);
  return [
    a * c - b * s + d * c - e * s,
    a * s + b * c - d * s - e * c,
  ];
}

// Continuous height: h(x, z, t) = Re sum_k H(k, t) e^{i (kx x + kz z)}.
export function oceanHeightAt(ocean, x, z, t) {
  const { gridSize: n, worldSize } = ocean;
  const freq = (i) => (i <= n / 2 ? i : i - n) * 2 * Math.PI / worldSize;
  let sum = 0;
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const [hr, hi] = modeAt(ocean, ix, iz, t);
      const phase = freq(ix) * x + freq(iz) * z;
      sum += hr * Math.cos(phase) - hi * Math.sin(phase);
    }
  }
  return sum;
}

// Full heightfield via inverse FFT: out = Re sum_k H(k, t) e^{ikx} on the
// grid (the 1/n^2 IFFT normalization is multiplied back out). Grid node
// (ix, iz) sits at world (ix * worldSize / n, iz * worldSize / n).
export function oceanHeightfield(ocean, t) {
  const { gridSize: n } = ocean;
  const re = new Float64Array(n * n), im = new Float64Array(n * n);
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const [hr, hi] = modeAt(ocean, ix, iz, t);
      re[iz * n + ix] = hr;
      im[iz * n + ix] = hi;
    }
  }
  fft2d(re, im, n, true);
  const out = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) out[i] = re[i] * n * n;
  return out;
}

// Per-vertex normals from a heightfield (central differences).
export function oceanNormals(heights, { gridSize, worldSize }) {
  const cell = worldSize / gridSize;
  const normals = new Float32Array(gridSize * gridSize * 3);
  const at = (x, z) => heights[((z + gridSize) % gridSize) * gridSize + ((x + gridSize) % gridSize)];
  for (let z = 0; z < gridSize; z++) {
    for (let x = 0; x < gridSize; x++) {
      const dx = (at(x + 1, z) - at(x - 1, z)) / (2 * cell);
      const dz = (at(x, z + 1) - at(x, z - 1)) / (2 * cell);
      const inv = 1 / Math.hypot(dx, 1, dz);
      const o = (z * gridSize + x) * 3;
      normals[o] = -dx * inv; normals[o + 1] = inv; normals[o + 2] = -dz * inv;
    }
  }
  return normals;
}

// Total spectral energy (sum |h0|^2), for sea-state calibration checks.
export function oceanEnergy(ocean) {
  let sum = 0;
  for (let i = 0; i < ocean.h0.length; i += 2) sum += ocean.h0[i] ** 2 + ocean.h0[i + 1] ** 2;
  return sum;
}
