import test from 'node:test';
import assert from 'node:assert/strict';
import {
  solarDeclination, equationOfTime, sunPosition, solarTimeFromClock,
  sunriseSunset, sunDirection, daylightFactor, skyColor,
} from '../src/solar.js';

test('declination hits the solstice extremes and crosses zero at equinoxes', () => {
  assert.ok(Math.abs(solarDeclination(172) - 23.44) < 0.3, `summer ${solarDeclination(172)}`);
  assert.ok(Math.abs(solarDeclination(355) + 23.44) < 0.3, `winter ${solarDeclination(355)}`);
  assert.ok(Math.abs(solarDeclination(80)) < 1.2, 'near spring equinox');
  assert.ok(Math.abs(solarDeclination(266)) < 1.2, 'near autumn equinox');
});

test('noon elevation follows 90 - |lat - declination|', () => {
  // Equator at equinox: sun directly overhead at solar noon.
  const eq = sunPosition({ latitude: 0, dayOfYear: 80, solarTime: 12 });
  assert.ok(Math.abs(eq.elevation - 90) < 1.5, `equator noon ${eq.elevation}`);
  // 40N at summer solstice: 90 - |40 - 23.44| = 73.44.
  const summer = sunPosition({ latitude: 40, dayOfYear: 172, solarTime: 12 });
  assert.ok(Math.abs(summer.elevation - 73.44) < 0.6, `40N solstice noon ${summer.elevation}`);
  // Midnight sun check: at solar midnight the sun is below horizon at 40N.
  const night = sunPosition({ latitude: 40, dayOfYear: 172, solarTime: 0 });
  assert.ok(night.elevation < 0, 'below horizon at midnight');
});

test('sunrise/sunset satisfy the sunrise equation and bracket noon', () => {
  const { sunrise, sunset } = sunriseSunset({ latitude: 40, dayOfYear: 172 });
  // Long summer day at 40N: roughly 04:35-19:25 solar time.
  assert.ok(sunrise > 4 && sunrise < 5.2, `sunrise ${sunrise}`);
  assert.ok(sunset > 18.8 && sunset < 19.8, `sunset ${sunset}`);
  assert.ok(Math.abs((sunrise + sunset) / 2 - 12) < 1e-9, 'symmetric about noon');
  // Elevation is ~0 at the computed sunrise.
  const atRise = sunPosition({ latitude: 40, dayOfYear: 172, solarTime: sunrise });
  assert.ok(Math.abs(atRise.elevation) < 0.6, `rise elevation ${atRise.elevation}`);
  // Polar day/night reported honestly.
  assert.equal(sunriseSunset({ latitude: 80, dayOfYear: 172 }).polar, 'day');
  assert.equal(sunriseSunset({ latitude: 80, dayOfYear: 355 }).polar, 'night');
  // Day length shrinks in winter.
  const winter = sunriseSunset({ latitude: 40, dayOfYear: 355 });
  assert.ok((winter.sunset - winter.sunrise) < (sunset - sunrise) - 3, 'shorter winter day');
});

test('azimuth runs east -> south -> west (northern hemisphere)', () => {
  const morning = sunPosition({ latitude: 40, dayOfYear: 80, solarTime: 8 });
  const noon = sunPosition({ latitude: 40, dayOfYear: 80, solarTime: 12 });
  const evening = sunPosition({ latitude: 40, dayOfYear: 80, solarTime: 18 });
  assert.ok(morning.azimuth > 60 && morning.azimuth < 140, `morning az ${morning.azimuth}`);
  assert.ok(Math.abs(noon.azimuth - 180) < 8, `noon az ${noon.azimuth} (due south)`);
  assert.ok(evening.azimuth > 230 && evening.azimuth < 300, `evening az ${evening.azimuth}`);
});

test('sun direction vector is unit and consistent with elevation', () => {
  const p = sunPosition({ latitude: 51.5, dayOfYear: 100, solarTime: 10 });
  const d = sunDirection(p.elevation, p.azimuth);
  assert.ok(Math.abs(Math.hypot(...d) - 1) < 1e-12);
  assert.ok(Math.abs(d[1] - Math.sin(p.elevation * Math.PI / 180)) < 1e-9, 'y = sin(elevation)');
  const noon = sunDirection(90, 180);
  assert.ok(Math.abs(noon[1] - 1) < 1e-12, 'zenith sun points straight down-light');
});

test('clock-to-solar conversion respects longitude and equation of time', () => {
  // On the timezone meridian, solar time differs from clock only by EoT.
  const day = 100;
  const solar = solarTimeFromClock({ dayOfYear: day, clockHour: 12, longitude: 0, timezoneMeridian: 0 });
  assert.ok(Math.abs(solar - (12 + equationOfTime(day) / 60)) < 1e-9);
  // 15 degrees east of the meridian: solar time is an hour ahead.
  const east = solarTimeFromClock({ dayOfYear: day, clockHour: 12, longitude: 15, timezoneMeridian: 0 });
  assert.ok(Math.abs(east - solar - 1) < 1e-9);
  assert.ok(Math.abs(equationOfTime(100)) < 17, 'EoT within its known +-17 min band');
});

test('sky color: zenith darker than horizon, sunset warms, night fades', () => {
  const noonSun = sunDirection(60, 180);
  const zenith = skyColor([0, 1, 0], noonSun);
  const horizon = skyColor([0, 0.02, -1], noonSun);
  assert.ok(zenith[2] > zenith[0], 'day zenith is blue-dominant');
  assert.ok(horizon[0] > zenith[0] && horizon[1] > zenith[1], 'horizon brighter than zenith');
  const lowSun = sunDirection(2, 270);
  const sunsetHorizon = skyColor([0, 0.02, 1], lowSun);
  assert.ok(sunsetHorizon[0] / sunsetHorizon[2] > horizon[0] / horizon[2] * 1.5,
    'sunset horizon is much warmer (higher R/B)');
  const nightSun = sunDirection(-20, 0);
  const night = skyColor([0, 1, 0], nightSun);
  assert.ok(night[0] < 0.03 && night[1] < 0.04 && night[2] < 0.06, 'night sky is dark');
  assert.equal(daylightFactor(-20), 0);
  assert.equal(daylightFactor(20), 1);
  assert.ok(daylightFactor(0) > 0.4 && daylightFactor(0) < 0.6, 'twilight midpoint');
});
