import test from 'node:test';
import assert from 'node:assert/strict';
import { shadowLength, isSunlit, sunlitFraction, sunStudyDay, sunPath } from '../src/sun-study.js';
import { sunDirection } from '../src/solar.js';

const WALL = { min: [2, 0, -10], max: [4, 3, 10] };
const POINT = [0, 1, 0];

test('shadow length follows h / tan(elevation) exactly', () => {
  assert.ok(Math.abs(shadowLength(10, 45) - 10) < 1e-9);
  assert.ok(Math.abs(shadowLength(10, Math.atan(0.5) * 180 / Math.PI) - 20) < 1e-9);
  assert.equal(shadowLength(5, 0), Infinity);
  assert.equal(shadowLength(5, -10), Infinity);
  assert.equal(shadowLength(0, 45), 0);
});

test('ray casting against boxes: lit and shaded geometry cases', () => {
  const east45 = sunDirection(45, 90); // toward east, 45 degrees up
  assert.equal(isSunlit(POINT, east45, [WALL]), false, 'low eastern sun is blocked by the wall');
  const eastSteep = sunDirection(80, 90);
  assert.equal(isSunlit(POINT, eastSteep, [WALL]), true, 'steep sun clears the wall top');
  const west45 = sunDirection(45, 270);
  assert.equal(isSunlit(POINT, west45, [WALL]), true, 'western sun is unobstructed');
  assert.equal(isSunlit(POINT, sunDirection(-5, 90), []), false, 'below horizon is never sunlit');
  assert.equal(isSunlit(POINT, east45, []), true, 'no obstacles, no shade');
  // A point inside the box is shaded (ray starts inside: t interval includes 0..exit).
  assert.equal(isSunlit([3, 1, 0], east45, [WALL]), false);
  // Misses sideways: point far north of the wall's z extent... wall spans z -10..10, use z=20.
  assert.equal(isSunlit([0, 1, 20], east45, [WALL]), true);
});

test('equator equinox: a wall shades the point for the morning only', () => {
  const study = sunStudyDay({ point: POINT, latitude: 0, dayOfYear: 80, boxes: [WALL], stepMinutes: 5 });
  assert.ok(Math.abs(study.sunrise - 6) < 0.1, `sunrise ${study.sunrise}`);
  assert.ok(Math.abs(study.sunset - 18) < 0.1);
  assert.ok(Math.abs(study.dayLength - 12) < 0.2);
  // Analytic transition: ray over the wall top when 1 + 2*tan(el) = 3
  // -> el = 45 deg -> 9:00 at the equator on the equinox.
  assert.ok(study.shadeHours > 2.4 && study.shadeHours < 3.6, `shade ${study.shadeHours.toFixed(2)}h (analytic ~3h)`);
  assert.ok(Math.abs(study.sunHours + study.shadeHours - study.dayLength) < 1e-6);
  const shaded = study.intervals.filter((i) => !i.lit);
  assert.equal(shaded.length, 1, 'one contiguous morning shade block');
  assert.ok(Math.abs(shaded[0].start - study.sunrise) < 1e-9, 'shade starts at sunrise');
  assert.ok(shaded[0].end > 8.4 && shaded[0].end < 9.6, `shade ends ~9:00, got ${shaded[0].end.toFixed(2)}`);
  const lit = study.intervals.filter((i) => i.lit);
  assert.equal(lit[lit.length - 1].end, study.sunset, 'day ends sunlit');
});

test('no obstacles means a fully sunlit day; polar night returns cleanly', () => {
  const open = sunStudyDay({ point: POINT, latitude: 40, dayOfYear: 172, boxes: [], stepMinutes: 30 });
  assert.equal(open.intervals.length, 1);
  assert.equal(open.intervals[0].lit, true);
  assert.ok(Math.abs(open.shadeHours) < 1e-9);
  const polar = sunStudyDay({ point: POINT, latitude: 80, dayOfYear: 355, boxes: [] });
  assert.equal(polar.polar, 'night');
  assert.deepEqual(polar.intervals, []);
});

test('sun path sampling and sunlit fractions behave', () => {
  const path = sunPath({ latitude: 0, dayOfYear: 80, stepMinutes: 60 });
  assert.ok(path.length >= 12);
  const noon = path.reduce((a, b) => (b.elevation > a.elevation ? b : a));
  assert.ok(noon.elevation > 88, `equator equinox noon elevation ${noon.elevation.toFixed(1)}`);
  assert.ok(Math.abs(noon.solarTime - 12) <= 0.5);
  const morning = path[1];
  assert.ok(morning.azimuth > 80 && morning.azimuth < 100, 'morning sun in the east');

  const points = [[0, 1, 0], [0, 1, 20], [10, 1, 0]];
  const frac = sunlitFraction(points, sunDirection(45, 90), [WALL]);
  assert.ok(Math.abs(frac - 2 / 3) < 1e-9, `fraction ${frac}`);
  assert.equal(sunlitFraction([], sunDirection(45, 90), []), 0);
});
