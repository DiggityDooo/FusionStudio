'use strict';
// Sun study & daylight analysis (A29 "Sun-study and daylight
// analysis"): shadow casting against box obstacles using the solar
// kernel (src/solar.js), shaded/sunlit interval analysis over a day,
// and shadow-length math. Coordinates follow solar.js: x east, y up,
// z south (north = -z). Obstacles are axis-aligned boxes
// { min: [x,y,z], max: [x,y,z] }.

import { sunPosition, sunDirection, sunriseSunset } from './solar.js';

/** Shadow length of a vertical object of `height` at sun elevation (deg). */
export function shadowLength(height, elevationDeg) {
  if (!(height >= 0)) throw new Error('sun-study: height must be >= 0');
  if (elevationDeg <= 0) return Infinity;
  return height / Math.tan((elevationDeg * Math.PI) / 180);
}

function rayHitsBox(origin, dir, box, epsilon = 1e-6) {
  let tMin = 0, tMax = Infinity;
  for (let axis = 0; axis < 3; axis++) {
    if (Math.abs(dir[axis]) < 1e-12) {
      if (origin[axis] < box.min[axis] || origin[axis] > box.max[axis]) return false;
      continue;
    }
    let t1 = (box.min[axis] - origin[axis]) / dir[axis];
    let t2 = (box.max[axis] - origin[axis]) / dir[axis];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  return tMax > epsilon;
}

/**
 * Is a point sunlit given the sun direction TO the sun (unit vector)?
 * Points inside an obstacle count as shaded; sun at/below the horizon
 * (dir[1] <= 0) means no direct sun.
 */
export function isSunlit(point, sunDir, boxes) {
  if (sunDir[1] <= 0) return false;
  for (const box of boxes) {
    if (rayHitsBox(point, sunDir, box)) return false;
  }
  return true;
}

/** Sunlit fraction of a set of points at one moment (daylight factor helper). */
export function sunlitFraction(points, sunDir, boxes) {
  if (points.length === 0) return 0;
  const lit = points.filter((p) => isSunlit(p, sunDir, boxes)).length;
  return lit / points.length;
}

/**
 * Analyze one day for a target point: sample from sunrise to sunset
 * every `stepMinutes`, classify sunlit/shaded (elevation > 0 and no
 * obstacle hit), and merge into intervals.
 * Returns { sunrise, sunset, intervals: [{start, end, lit}],
 * sunHours, shadeHours, dayLength } with times in local solar hours.
 * Polar day/night returns empty intervals with `polar` set.
 */
export function sunStudyDay({ point, latitude, dayOfYear, boxes = [], stepMinutes = 10 }) {
  if (!(stepMinutes > 0)) throw new Error('sun-study: stepMinutes must be positive');
  const { sunrise, sunset, polar } = sunriseSunset({ latitude, dayOfYear });
  if (polar) return { sunrise, sunset, polar, intervals: [], sunHours: 0, shadeHours: 0, dayLength: polar === 'day' ? 24 : 0 };
  const step = stepMinutes / 60;
  const intervals = [];
  let sunHours = 0;
  let current = null;
  for (let t = sunrise; t < sunset - 1e-9; t += step) {
    const mid = Math.min(t + step / 2, sunset);
    const { elevation, azimuth } = sunPosition({ latitude, dayOfYear, solarTime: mid });
    const lit = elevation > 0 && isSunlit(point, sunDirection(elevation, azimuth), boxes);
    if (lit) sunHours += Math.min(step, sunset - t);
    if (!current || current.lit !== lit) {
      current = { start: t, end: Math.min(t + step, sunset), lit };
      intervals.push(current);
    } else {
      current.end = Math.min(t + step, sunset);
    }
  }
  const dayLength = sunset - sunrise;
  return {
    sunrise, sunset, polar: null, intervals,
    sunHours, shadeHours: dayLength - sunHours, dayLength,
  };
}

/** Sun positions along a day: [{solarTime, elevation, azimuth, direction}]. */
export function sunPath({ latitude, dayOfYear, stepMinutes = 30 }) {
  const { sunrise, sunset, polar } = sunriseSunset({ latitude, dayOfYear });
  if (polar) return [];
  const out = [];
  for (let t = sunrise; t <= sunset + 1e-9; t += stepMinutes / 60) {
    const time = Math.min(t, sunset);
    const { elevation, azimuth } = sunPosition({ latitude, dayOfYear, solarTime: time });
    out.push({ solarTime: time, elevation, azimuth, direction: sunDirection(elevation, azimuth) });
  }
  return out;
}
