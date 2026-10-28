'use strict';
// Terrain erosion kernels on plain height grids (Float32Array, res x res,
// row-major). Hydraulic erosion uses the standard droplet algorithm
// (sediment capacity proportional to speed x slope x water); thermal
// erosion relaxes slopes above a talus angle. Both conserve sediment
// exactly by construction; the hydraulic solver reports how much sediment
// droplets carried off the map so tests can audit the balance.

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = a + 0x6d2b79f5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Bilinear height + gradient at float grid coords (x, y in cell units).
function sampleHeight(heights, res, x, y) {
  const xi = Math.min(res - 2, Math.max(0, Math.floor(x)));
  const yi = Math.min(res - 2, Math.max(0, Math.floor(y)));
  const fx = Math.min(1, Math.max(0, x - xi));
  const fy = Math.min(1, Math.max(0, y - yi));
  const i = yi * res + xi;
  const h00 = heights[i], h10 = heights[i + 1], h01 = heights[i + res], h11 = heights[i + res + 1];
  const gx = (h10 - h00) * (1 - fy) + (h11 - h01) * fy;
  const gy = (h01 - h00) * (1 - fx) + (h11 - h10) * fx;
  const h = (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy;
  return { h, gx, gy };
}

function bilinearCells(res, x, y) {
  const xi = Math.min(res - 2, Math.max(0, Math.floor(x)));
  const yi = Math.min(res - 2, Math.max(0, Math.floor(y)));
  const fx = Math.min(1, Math.max(0, x - xi));
  const fy = Math.min(1, Math.max(0, y - yi));
  const i = yi * res + xi;
  return [
    { i, w: (1 - fx) * (1 - fy) },
    { i: i + 1, w: fx * (1 - fy) },
    { i: i + res, w: (1 - fx) * fy },
    { i: i + res + 1, w: fx * fy },
  ];
}

function distribute(heights, res, x, y, amount) {
  for (const cell of bilinearCells(res, x, y)) heights[cell.i] += amount * cell.w;
}

// Erosion/deposition brush: spread an event over the cells within radius
// 2.5 of the droplet, weights proportional to (1 - dist/2.5), normalized to
// sum 1 over in-bounds cells. Concentrating a whole event into one bilinear
// cell (weight up to 1.0) creates spike/pit pairs whose gradients amplify
// each pass -- the brush is what keeps the classic algorithm stable.
function brushCells(res, x, y) {
  const cells = [];
  let total = 0;
  const cx = Math.round(x), cy = Math.round(y);
  for (let oy = -2; oy <= 2; oy++) {
    for (let ox = -2; ox <= 2; ox++) {
      const gx = cx + ox, gy = cy + oy;
      if (gx < 0 || gy < 0 || gx >= res || gy >= res) continue;
      const dist = Math.hypot(gx - x, gy - y);
      const w = Math.max(0, 1 - dist / 2.5);
      if (w <= 0) continue;
      cells.push({ i: gy * res + gx, w });
      total += w;
    }
  }
  if (total > 0) for (const cell of cells) cell.w /= total;
  return cells;
}

function brushDistribute(heights, cells, amount) {
  for (const cell of cells) heights[cell.i] += amount * cell.w;
}

/**
 * Droplet hydraulic erosion. Mutates `heights`; returns sediment audit
 * {eroded, deposited, exported} with deposited - eroded = -exported +
 * change in total height (exactly, up to float rounding).
 */
export function hydraulicErosion(heights, res, options = {}) {
  const droplets = options.droplets ?? 2000;
  const lifetime = options.lifetime ?? 30;
  const inertia = options.inertia ?? 0.05;
  // Default 1 (not the 4 common in demos): those demos use much taller
  // height scales. On unit-scale terrains factor 4 lets sediment loads
  // grow until deposit dumps seed spike/pit pairs that amplify without
  // bound (bisected empirically; see tests). maxSpeed caps the same
  // feedback through the capacity term.
  const capacityFactor = options.capacityFactor ?? 1;
  const minCapacity = options.minCapacity ?? 0.01;
  const erodeSpeed = options.erodeSpeed ?? 0.3;
  const depositSpeed = options.depositSpeed ?? 0.3;
  const evaporateSpeed = options.evaporateSpeed ?? 0.01;
  const gravity = options.gravity ?? -4;
  const rand = mulberry(options.seed ?? 1);
  let eroded = 0, deposited = 0, exported = 0;

  for (let d = 0; d < droplets; d++) {
    let px = rand() * (res - 2) + 0.5;
    let py = rand() * (res - 2) + 0.5;
    let dx = 0, dy = 0;
    let sediment = 0, water = 1, speed = 1;
    for (let step = 0; step < lifetime; step++) {
      const { h, gx, gy } = sampleHeight(heights, res, px, py);
      dx = dx * inertia - gx * (1 - inertia);
      dy = dy * inertia - gy * (1 - inertia);
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) {
        const ang = rand() * Math.PI * 2;
        dx = Math.cos(ang); dy = Math.sin(ang);
      } else { dx /= len; dy /= len; }
      px += dx; py += dy;
      if (px < 0 || px >= res - 1 || py < 0 || py >= res - 1) {
        exported += sediment;
        sediment = 0;
        break;
      }
      const newH = sampleHeight(heights, res, px, py).h;
      const dh = newH - h;
      const capacity = Math.max(-dh * speed * water * capacityFactor, minCapacity);
      const brush = brushCells(res, px, py);
      if (sediment > capacity || dh > 0) {
        const amount = dh > 0 ? Math.min(dh, sediment) : (sediment - capacity) * depositSpeed;
        sediment -= amount;
        deposited += amount;
        brushDistribute(heights, brush, amount);
      } else {
        // Erode, but never take a cell below the droplet's sampled height
        // at its new position (weighted headroom over the brush).
        let removable = 0;
        for (const cell of brush) {
          removable += cell.w * Math.max(0, heights[cell.i] - newH);
        }
        const amount = Math.min((capacity - sediment) * erodeSpeed, -dh, removable);
        sediment += amount;
        eroded += amount;
        brushDistribute(heights, brush, -amount);
      }
      // Descending (dh < 0) accelerates the droplet: speed^2 += dh * gravity
      // with gravity negative by convention (default -4). Speed is capped:
      // uncapped speed growth makes capacity (and thus erosion) feed back
      // on pit/spike gradients until heights explode -- the cap is the
      // droplet's terminal velocity and keeps the solver in its stable
      // regime for unit-scale terrains.
      speed = Math.min(Math.sqrt(Math.max(0, speed * speed + dh * gravity)), options.maxSpeed ?? 2);
      water *= (1 - evaporateSpeed);
      if (water < 0.01) break;
    }
    if (sediment > 0) {
      // Dying droplet deposits what it carries (or exports it off-map).
      if (options.deathDeposit === false) {
        exported += sediment;
      } else if (px >= 0 && px < res - 1 && py >= 0 && py < res - 1) {
        deposited += sediment;
        brushDistribute(heights, brushCells(res, px, py), sediment);
      } else {
        exported += sediment;
      }
    }
  }
  return { eroded, deposited, exported };
}

/**
 * Thermal erosion: iteratively move material from cells whose slope to a
 * lower neighbour exceeds the talus slope. Conserves total height exactly
 * (material only moves between cells). Returns iterations used.
 */
export function thermalErosion(heights, res, options = {}) {
  const talus = options.talus ?? 0.5; // max allowed height diff per cell step
  const rate = options.rate ?? 0.5;
  const maxIterations = options.maxIterations ?? 200;
  const next = new Float32Array(heights.length);
  for (let iter = 0; iter < maxIterations; iter++) {
    next.set(heights);
    let maxExcess = 0;
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const i = y * res + x;
        // Find the lowest neighbour; relax toward it if too steep.
        let lowest = -1, lowestH = heights[i];
        if (x > 0 && heights[i - 1] < lowestH) { lowestH = heights[i - 1]; lowest = i - 1; }
        if (x < res - 1 && heights[i + 1] < lowestH) { lowestH = heights[i + 1]; lowest = i + 1; }
        if (y > 0 && heights[i - res] < lowestH) { lowestH = heights[i - res]; lowest = i - res; }
        if (y < res - 1 && heights[i + res] < lowestH) { lowestH = heights[i + res]; lowest = i + res; }
        if (lowest < 0) continue;
        const excess = (heights[i] - lowestH) - talus;
        if (excess <= 0) continue;
        maxExcess = Math.max(maxExcess, excess);
        const move = excess * 0.5 * rate;
        next[i] -= move;
        next[lowest] += move;
      }
    }
    heights.set(next);
    if (maxExcess < 1e-6) return iter + 1;
  }
  return maxIterations;
}

/** Total variation (sum of |gradient| magnitudes) -- a roughness measure. */
export function totalVariation(heights, res) {
  let tv = 0;
  for (let y = 0; y < res - 1; y++) {
    for (let x = 0; x < res - 1; x++) {
      const i = y * res + x;
      tv += Math.abs(heights[i + 1] - heights[i]) + Math.abs(heights[i + res] - heights[i]);
    }
  }
  return tv;
}
