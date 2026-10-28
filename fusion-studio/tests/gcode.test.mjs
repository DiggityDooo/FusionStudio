import test from 'node:test';
import assert from 'node:assert/strict';
import { depthPasses, pocketGcode, profileGcode, ringsToGcode } from '../src/gcode.js';
import { pocketToolpath, polygonPerimeter, profileToolpath } from '../src/toolpath.js';

const SQUARE = [[0, 0], [10, 0], [10, 10], [0, 10]];

// Independent RS274-subset parser: modal motion/feed/position,
// integrates move distances by class. Shares no code with the
// emitter, so distance/time agreement is a real cross-check.
function parseGcode(text, { start = [0, 0, 5], rapidFeed = 3000 } = {}) {
  let mode = null, feed = 0;
  const pos = [...start];
  const out = { cut: 0, plunge: 0, rapid: 0, time: 0, minZ: Infinity, cutZ: new Set(), endpoints: [], moves: 0 };
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\(.*?\)/g, '').trim();
    if (!line || line === '%') continue;
    const words = {};
    for (const m of line.matchAll(/([A-Z])(-?\d+(?:\.\d+)?)/g)) words[m[1]] = parseFloat(m[2]);
    if (words.G === 0 || words.G === 1) mode = words.G;
    if (words.F !== undefined) feed = words.F;
    if (words.X === undefined && words.Y === undefined && words.Z === undefined) continue;
    const next = [
      words.X !== undefined ? words.X : pos[0],
      words.Y !== undefined ? words.Y : pos[1],
      words.Z !== undefined ? words.Z : pos[2],
    ];
    const dxy = Math.hypot(next[0] - pos[0], next[1] - pos[1]);
    const dz = next[2] - pos[2];
    out.moves++;
    if (mode === 0) {
      const d = Math.hypot(dxy, dz);
      out.rapid += d;
      out.time += d / rapidFeed;
    } else if (mode === 1) {
      if (dxy > 0) {
        out.cut += dxy;
        out.time += dxy / feed;
        out.cutZ.add(next[2]);
        out.endpoints.push([next[0], next[1], next[2]]);
      } else if (dz !== 0) {
        out.plunge += Math.abs(dz);
        out.time += Math.abs(dz) / feed;
      }
    }
    out.minZ = Math.min(out.minZ, next[2]);
    pos.splice(0, 3, ...next);
  }
  return out;
}

test('depth pass levels step down and clamp at the final depth', () => {
  assert.deepEqual(depthPasses(1.2, 0.5), [-0.5, -1.0, -1.2]);
  assert.deepEqual(depthPasses(1, 1), [-1]);
  assert.deepEqual(depthPasses(2, 0.75), [-0.75, -1.5, -2]);
});

test('pocket program parses back to the exact toolpath motion', () => {
  const options = { toolDiameter: 1, stepover: 0.5, depth: 1.2, stepdown: 0.5, feed: 300, plungeFeed: 120, spindle: 12000 };
  const { gcode, stats, toolpath } = pocketGcode(SQUARE, options);
  assert.ok(gcode.startsWith('%\n'));
  assert.match(gcode, /G21/);
  assert.match(gcode, /G90/);
  assert.match(gcode, /M3 S12000/);
  assert.match(gcode, /M30/);
  const parsed = parseGcode(gcode);
  // Cut distance = rings length x passes, from the parser and from
  // the toolpath kernel independently.
  const ringsLength = toolpath.rings.reduce((s, r) => s + polygonPerimeter(r), 0);
  assert.ok(Math.abs(parsed.cut - ringsLength * 3) < 1e-3, `parsed cut ${parsed.cut} vs ${ringsLength * 3}`);
  assert.ok(Math.abs(stats.cutDistance - ringsLength * 3) < 1e-9);
  // Depth discipline: never below -depth, cut exactly at pass levels.
  assert.ok(Math.abs(parsed.minZ - -1.2) < 1e-9, `minZ ${parsed.minZ}`);
  assert.deepEqual([...parsed.cutZ].sort((a, b) => a - b), [-1.2, -1.0, -0.5]);
  // Every cutting endpoint is a ring vertex (within print rounding).
  const vertices = new Set();
  for (const ring of toolpath.rings) for (const [x, y] of ring) vertices.add(`${x.toFixed(3)},${y.toFixed(3)}`);
  assert.equal(parsed.endpoints.length, 3 * toolpath.rings.reduce((s, r) => s + r.length, 0));
  for (const [x, y] of parsed.endpoints) {
    assert.ok(vertices.has(`${x.toFixed(3)},${y.toFixed(3)}`), `endpoint ${x},${y} is a ring vertex`);
  }
  // Time estimate: emitter stats vs parser-integrated motion agree.
  assert.ok(Math.abs(parsed.time - stats.estimatedMinutes) / stats.estimatedMinutes < 1e-3,
    `time ${stats.estimatedMinutes} vs parsed ${parsed.time}`);
  assert.ok(Math.abs(parsed.plunge - stats.plungeDistance) < 1e-3);
  assert.ok(Math.abs(parsed.rapid - stats.rapidDistance) < 1e-3);
});

test('profile program: single ring per pass, exact perimeter scaling', () => {
  const { gcode, stats } = profileGcode(SQUARE, { toolDiameter: 2, side: 'outside', depth: 0.8, stepdown: 0.4 });
  const expected = profileToolpath(SQUARE, { toolDiameter: 2, side: 'outside' });
  assert.ok(Math.abs(expected.length - 48) < 1e-9);
  const parsed = parseGcode(gcode);
  assert.equal(stats.passes, 2);
  assert.ok(Math.abs(parsed.cut - 96) < 1e-3, `profile cut ${parsed.cut}`);
  assert.deepEqual([...parsed.cutZ].sort((a, b) => a - b), [-0.8, -0.4]);
});

test('invalid programs are rejected before emitting', () => {
  assert.throws(() => ringsToGcode([], {}), /no rings/);
  assert.throws(() => ringsToGcode([[[0, 0], [1, 0], [1, 1]]], { depth: 0 }), /depth must be positive/);
  assert.throws(() => ringsToGcode([[[0, 0], [1, 0], [1, 1]]], { depth: 1, stepdown: -1 }), /stepdown must be positive/);
  assert.throws(() => ringsToGcode([[[0, 0]]], { depth: 1 }), />= 2 points/);
  assert.throws(() => pocketGcode(SQUARE, { toolDiameter: 30, depth: 1 }), /no rings/);
  assert.throws(() => pocketGcode(SQUARE, { toolDiameter: 1, depth: 1, feed: 0 }), /feed must be positive/);
  // A known-good direct ring emission: triangle ring, one pass.
  const { stats } = ringsToGcode([[[0, 0], [3, 0], [0, 4]]], { depth: 2 });
  assert.ok(Math.abs(stats.cutDistance - 12) < 1e-9, '3-4-5 triangle perimeter per pass');
});
