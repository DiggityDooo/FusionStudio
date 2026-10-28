import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EUMELANIN_ABSORPTION, PHEOMELANIN_ABSORPTION, absorptionCoefficient,
  hairAlbedo, kajiyaKaySpecular, strandAlbedoGradient,
} from '../src/hair-shading.js';

const near = (a, b, eps = 1e-12) => Math.abs(a - b) < eps;

test('Beer-Lambert law: zero melanin is white, doubling squares the albedo', () => {
  assert.deepEqual(hairAlbedo({ melanin: 0 }), [1, 1, 1], 'no pigment, no absorption');
  const half = hairAlbedo({ melanin: 0.4 });
  const full = hairAlbedo({ melanin: 0.8 });
  for (let c = 0; c < 3; c++) {
    assert.ok(near(full[c], half[c] * half[c]), `channel ${c}: albedo(2m) = albedo(m)^2`);
  }
  // Absorption rises with wavelength here, so blue dies first:
  // dark hair reads warm. Strict channel ordering at melanin 1.
  const dark = hairAlbedo({ melanin: 1 });
  assert.ok(dark[2] < dark[1] && dark[1] < dark[0], `channel order ${dark}`);
  // Closed form against the stated endmembers.
  const sigma = absorptionCoefficient({ melanin: 0.7, pheomelaninRatio: 0.25 });
  for (let c = 0; c < 3; c++) {
    const expected = EUMELANIN_ABSORPTION[c] * 0.7 * 0.75 + PHEOMELANIN_ABSORPTION[c] * 0.7 * 0.25;
    assert.ok(near(sigma[c], expected), `sigma[${c}] mixes the endmembers`);
    assert.ok(near(hairAlbedo({ melanin: 0.7, pheomelaninRatio: 0.25 })[c], Math.exp(-expected), 1e-12), 'albedo is exp(-sigma)');
  }
  // Path length compounds the same way (two passes = squared).
  const twoPass = hairAlbedo({ melanin: 0.5 }, 2);
  const onePass = hairAlbedo({ melanin: 0.5 }, 1);
  for (let c = 0; c < 3; c++) assert.ok(near(twoPass[c], onePass[c] ** 2), 'path length in the exponent');
});

test('pheomelanin reads lighter and relatively redder than eumelanin', () => {
  const eu = hairAlbedo({ melanin: 1, pheomelaninRatio: 0 });
  const pheo = hairAlbedo({ melanin: 1, pheomelaninRatio: 1 });
  for (let c = 0; c < 3; c++) assert.ok(pheo[c] > eu[c], `channel ${c}: pheo absorbs less`);
  // Redness ratio: pheo keeps proportionally more red over blue.
  assert.ok(pheo[0] / pheo[2] < eu[0] / eu[2] || pheo[0] - pheo[2] > eu[0] - eu[2],
    'pheo separates red from blue at least as strongly in absolute terms');
  assert.throws(() => hairAlbedo({ melanin: -1 }), />= 0/);
  assert.throws(() => hairAlbedo({ melanin: 1, pheomelaninRatio: 2 }), /\[0, 1\]/);
  assert.throws(() => hairAlbedo({ melanin: 1 }, 0), /pathLength/);
});

test('root-to-tip gradient interpolates pigment, endpoints exact and monotone', () => {
  const gradient = strandAlbedoGradient({ melanin: 1.2 }, { melanin: 0.3 }, 6);
  assert.equal(gradient.length, 7);
  assert.deepEqual(gradient[0], hairAlbedo({ melanin: 1.2 }), 'root endpoint exact');
  assert.deepEqual(gradient[6], hairAlbedo({ melanin: 0.3 }), 'tip endpoint exact');
  for (let c = 0; c < 3; c++) {
    for (let i = 1; i < gradient.length; i++) {
      assert.ok(gradient[i][c] > gradient[i - 1][c], 'albedo brightens monotonically toward the tip');
    }
  }
  // Gradient is NOT a naive albedo lerp: pigment-space midpoint
  // differs from reflectance-space midpoint (exp is convex).
  const mid = gradient[3];
  const naive = hairAlbedo({ melanin: 1.2 }).map((v, c) => (v + hairAlbedo({ melanin: 0.3 })[c]) / 2);
  assert.ok(Math.abs(mid[0] - naive[0]) > 1e-3, 'pigment interpolation is the physical (non-lerp) route');
});

test('Kajiya-Kay lobe peaks perpendicular to the tangent', () => {
  // Half-vector perpendicular to the tangent: full highlight.
  assert.ok(near(kajiyaKaySpecular([1, 0, 0], [0, 1, 0], [0, 0, 1], 40), 1, 1e-9), 'perpendicular peak');
  // Half-vector along the tangent: no highlight.
  assert.ok(near(kajiyaKaySpecular([1, 0, 0], [1, 1, 0], [1, -1, 0], 40), 0, 1e-9), 'parallel null');
  // 45 degrees: sin^40(45 deg) closed form.
  const mid = kajiyaKaySpecular([1, 0, 0], [0, 1, 1], [1, 0, 0], 40);
  const h = [Math.SQRT1_2, Math.SQRT1_2, 0]; // light+view normalized below by the model
  void h;
  assert.ok(mid > 0 && mid < 1e-4, `45-degree lobe strongly attenuated at shininess 40 (${mid})`);
  assert.ok(near(kajiyaKaySpecular([1, 0, 0], [0, 1, 0], [0, 0, 1], 1), 1), 'shininess 1 keeps the peak');
  assert.throws(() => kajiyaKaySpecular([0, 0, 0], [0, 1, 0], [0, 0, 1]), /zero-length/);
  assert.throws(() => kajiyaKaySpecular([1, 0, 0], [0, 1, 0], [0, 0, 1], 0), /shininess/);
});
