'use strict';
// Solar position + sky model kernel (NOAA-style low-precision solar math,
// good to ~0.01-0.05 degrees in elevation for 2000-2100). Feeds sky
// atmospheres and time-of-day systems.
//
// Conventions: latitude +north, longitude +east, hour is local solar time
// unless computed via solarTimeFromClock. Angles in degrees at the API
// boundary. Azimuth is compass (0 = north, 90 = east, clockwise).

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Solar declination (degrees) for a day of year (Cooper/NOAA form). */
export function solarDeclination(dayOfYear) {
  return -23.44 * Math.cos((360 / 365) * (dayOfYear + 10) * D2R);
}

/** Equation of time in minutes for a day of year (NOAA approximation). */
export function equationOfTime(dayOfYear) {
  const b = (360 / 365) * (dayOfYear - 81) * D2R;
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

/**
 * Sun elevation/azimuth from latitude, day of year, and LOCAL SOLAR time
 * (hours, 12 = solar noon). Returns {elevation, azimuth, declination,
 * hourAngle} in degrees. Azimuth is compass from north.
 */
export function sunPosition({ latitude, dayOfYear, solarTime }) {
  const declination = solarDeclination(dayOfYear);
  const hourAngle = 15 * (solarTime - 12); // degrees, negative morning
  const latR = latitude * D2R, decR = declination * D2R, haR = hourAngle * D2R;
  const sinEl = Math.sin(latR) * Math.sin(decR) + Math.cos(latR) * Math.cos(decR) * Math.cos(haR);
  const elevation = Math.asin(Math.max(-1, Math.min(1, sinEl))) * R2D;
  // Compass azimuth from north, clockwise.
  const y = -Math.cos(decR) * Math.sin(haR);
  const x = Math.sin(decR) * Math.cos(latR) - Math.cos(decR) * Math.cos(haR) * Math.sin(latR);
  let azimuth = Math.atan2(y, x) * R2D;
  if (azimuth < 0) azimuth += 360;
  return { elevation, azimuth, declination, hourAngle };
}

/** Convert clock time to local solar time (hours). */
export function solarTimeFromClock({ dayOfYear, clockHour, longitude, timezoneMeridian }) {
  return clockHour + (equationOfTime(dayOfYear) + 4 * (longitude - timezoneMeridian)) / 60;
}

/** Sunrise/sunset local solar times from the sunrise equation. */
export function sunriseSunset({ latitude, dayOfYear }) {
  const declination = solarDeclination(dayOfYear) * D2R;
  const latR = latitude * D2R;
  const cosH = -Math.tan(latR) * Math.tan(declination);
  if (cosH < -1) return { sunrise: null, sunset: null, polar: 'day' };
  if (cosH > 1) return { sunrise: null, sunset: null, polar: 'night' };
  const h = Math.acos(cosH) * R2D / 15; // hours from noon
  return { sunrise: 12 - h, sunset: 12 + h, polar: null };
}

/** Unit sun direction vector (x east, y up, z south) from elevation/azimuth. */
export function sunDirection(elevation, azimuth) {
  const el = elevation * D2R, az = azimuth * D2R;
  return [
    Math.cos(el) * Math.sin(az),
    Math.sin(el),
    -Math.cos(el) * Math.cos(az),
  ];
}

/** Smooth daylight factor: 0 below -6 deg (civil twilight), 1 above +6. */
export function daylightFactor(elevation) {
  const t = Math.max(0, Math.min(1, (elevation + 6) / 12));
  return t * t * (3 - 2 * t);
}

/**
 * Simple analytic sky color for a view direction: zenith/horizon gradient
 * by view elevation, warm shift of both as the sun drops, plus a sun disc
 * glow. dir and sunDir are unit vectors. Returns [r, g, b] in 0..~2 (HDR).
 */
export function skyColor(dir, sunDir, options = {}) {
  const turbidity = options.turbidity ?? 1;
  const sunI = Math.max(0, sunDir[1]); // sun height factor
  const dl = daylightFactor(Math.asin(Math.max(-1, Math.min(1, sunDir[1]))) * R2D);
  const viewEl = Math.max(0, dir[1]);
  const grad = Math.pow(1 - viewEl, 1.6);
  // Day zenith (0.25,0.45,0.9) -> sunset zenith (0.10,0.12,0.30);
  // day horizon (0.75,0.82,0.95) -> sunset horizon (0.98,0.45,0.22).
  const warm = 1 - Math.min(1, Math.max(0, sunI * 2.2));
  const zenith = [
    0.25 + (0.10 - 0.25) * warm,
    0.45 + (0.12 - 0.45) * warm,
    0.90 + (0.30 - 0.90) * warm,
  ];
  const horizon = [
    0.75 + (0.98 - 0.75) * warm,
    0.82 + (0.45 - 0.82) * warm,
    0.95 + (0.22 - 0.95) * warm,
  ];
  let r = horizon[0] + (zenith[0] - horizon[0]) * (1 - grad);
  let g = horizon[1] + (zenith[1] - horizon[1]) * (1 - grad);
  let b = horizon[2] + (zenith[2] - horizon[2]) * (1 - grad);
  const cosang = Math.max(0, dir[0] * sunDir[0] + dir[1] * sunDir[1] + dir[2] * sunDir[2]);
  const glow = Math.pow(cosang, 220) * 1.6 + Math.pow(cosang, 8) * 0.16 * turbidity;
  r += glow * (1.0 + 0.4 * warm);
  g += glow * (0.92 - 0.25 * warm);
  b += glow * (0.80 - 0.55 * warm);
  // Twilight/night fade.
  const night = 1 - dl;
  const fade = 0.03 + 0.97 * dl;
  return [r * fade + 0.012 * night, g * fade + 0.016 * night, b * fade + 0.035 * night];
}
