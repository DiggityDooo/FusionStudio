'use strict';
// G-code emission for CAM toolpaths (A24 "CNC toolpath generation
// (CAM)"): turn pocket/profile rings from ./toolpath.js into an
// RS274-style program with safe-Z retracts, depth passes, modal
// feeds, and honest motion statistics (cut / plunge / rapid
// distances and a feed-based time estimate). No machine dialect
// post-processing beyond the generic header/footer.

import { pocketToolpath, profileToolpath, polygonPerimeter } from './toolpath.js';

const fmt = (v) => {
  const s = v.toFixed(3);
  return s === '-0.000' ? '0.000' : s;
};

function checkOptions({ depth, stepdown, feed, plungeFeed, spindle, safeZ, rapidFeed }) {
  if (!(depth > 0)) throw new Error('gcode: depth must be positive');
  if (!(stepdown > 0)) throw new Error('gcode: stepdown must be positive');
  if (!(feed > 0)) throw new Error('gcode: feed must be positive');
  if (!(plungeFeed > 0)) throw new Error('gcode: plungeFeed must be positive');
  if (!(spindle > 0)) throw new Error('gcode: spindle must be positive');
  if (!(safeZ > 0)) throw new Error('gcode: safeZ must be positive');
  if (!(rapidFeed > 0)) throw new Error('gcode: rapidFeed must be positive');
}

/** Depth pass levels: -stepdown, -2*stepdown, ..., clamped at -depth. */
export function depthPasses(depth, stepdown) {
  const levels = [];
  for (let d = stepdown; d < depth; d += stepdown) levels.push(-d);
  levels.push(-depth);
  return levels;
}

/**
 * Emit a program cutting each ring once per depth pass
 * (pass-major: every ring is cut at each level before going
 * deeper). Rings are [[x, y], ...] open point lists; each is cut
 * as a closed loop returning to its first point.
 */
export function ringsToGcode(rings, {
  depth = 1, stepdown = depth, safeZ = 5, feed = 300, plungeFeed = 120,
  spindle = 12000, rapidFeed = 3000, programName = 'FUSION-CAM',
} = {}) {
  checkOptions({ depth, stepdown, feed, plungeFeed, spindle, safeZ, rapidFeed });
  if (!rings.length) throw new Error('gcode: no rings to cut');
  for (const ring of rings) {
    if (!ring || ring.length < 2) throw new Error('gcode: each ring needs >= 2 points');
  }
  const levels = depthPasses(depth, stepdown);
  const lines = [
    '%',
    `(${programName})`,
    'G21 (mm)',
    'G90 (absolute)',
    'G17 (XY plane)',
    `M3 S${Math.round(spindle)}`,
  ];
  let cutDist = 0, plungeDist = 0, rapidDist = 0;
  let cur = [0, 0, safeZ]; // assumed start: origin at safe height
  const rapidTo = (x, y, z) => {
    rapidDist += Math.hypot(x - cur[0], y - cur[1], z - cur[2]);
    cur = [x, y, z];
  };
  lines.push(`G0 Z${fmt(safeZ)}`);
  levels.forEach((z, passIndex) => {
    lines.push(`(pass ${passIndex + 1} of ${levels.length} at Z${fmt(z)})`);
    rings.forEach((ring, ringIndex) => {
      const [sx, sy] = ring[0];
      lines.push(`G0 X${fmt(sx)} Y${fmt(sy)}`);
      rapidTo(sx, sy, cur[2]);
      lines.push(`G1 Z${fmt(z)} F${Math.round(plungeFeed)}`);
      plungeDist += cur[2] - z;
      cur = [sx, sy, z];
      for (let i = 1; i <= ring.length; i++) {
        const [x, y] = ring[i % ring.length];
        cutDist += Math.hypot(x - cur[0], y - cur[1]);
        cur = [x, y, z];
        lines.push(i === 1
          ? `G1 X${fmt(x)} Y${fmt(y)} F${Math.round(feed)}`
          : `G1 X${fmt(x)} Y${fmt(y)}`);
      }
      lines.push(`G0 Z${fmt(safeZ)}`);
      rapidTo(cur[0], cur[1], safeZ);
      void ringIndex;
    });
  });
  lines.push('M5', 'M30', '%');
  const estimatedMinutes = cutDist / feed + plungeDist / plungeFeed + rapidDist / rapidFeed;
  return {
    gcode: lines.join('\n') + '\n',
    stats: {
      passes: levels.length,
      levels,
      cutDistance: cutDist,
      plungeDistance: plungeDist,
      rapidDistance: rapidDist,
      estimatedMinutes,
    },
  };
}

/** Pocket-clear a polygon and emit its G-code program. */
export function pocketGcode(polygon, { toolDiameter = 1, stepover = null, ...options } = {}) {
  const path = pocketToolpath(polygon, { toolDiameter, stepover });
  if (!path.rings.length) throw new Error('gcode: pocket produced no rings (tool too large?)');
  const result = ringsToGcode(path.rings, options);
  return { ...result, toolpath: path };
}

/** Profile-cut a polygon (outside/inside) and emit its program. */
export function profileGcode(polygon, { toolDiameter = 1, side = 'outside', ...options } = {}) {
  const path = profileToolpath(polygon, { toolDiameter, side });
  const result = ringsToGcode([path.ring], options);
  return { ...result, toolpath: path };
}

export { polygonPerimeter };
