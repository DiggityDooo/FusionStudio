import test from 'node:test';
import assert from 'node:assert/strict';
import { profileKernel, scatteringProfile, scatteringProfileRGB, translucency, wrapDiffuse } from '../src/sss.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('the diffusion profile integrates to exactly one (energy conserving)', () => {
  // Independent check: Simpson integration of R(r) * 2 pi r on a
  // fine grid out to 30 scatter distances (tail is negligible).
  for (const d of [0.5, 1, 2.5]) {
    const N = 20000, maxR = 30 * d;
    let integral = 0;
    for (let i = 0; i <= N; i++) {
      const r = (i / N) * maxR;
      const y = scatteringProfile(Math.max(r, 1e-9), d) * 2 * Math.PI * Math.max(r, 1e-9);
      const w = i === 0 || i === N ? 1 : i % 2 ? 4 : 2;
      integral += (w * y * maxR) / N / 3;
    }
    assert.ok(Math.abs(integral - 1) < 0.01, `d=${d}: profile integral ${integral.toFixed(4)}`);
  }
  // Closed-form spot value: at r = d, (e^-1 + e^(-1/3)) / (8 pi d^2).
  const expected = (Math.exp(-1) + Math.exp(-1 / 3)) / (8 * Math.PI);
  assert.ok(near(scatteringProfile(1, 1), expected, 1e-12), 'closed-form value at r = d');
  // Wider scatter distance: lower peak, longer tail.
  assert.ok(scatteringProfile(0.01, 2) < scatteringProfile(0.01, 0.5), 'wider d lowers the peak');
  assert.ok(scatteringProfile(5, 2) > scatteringProfile(5, 0.5), 'wider d fattens the tail');
});

test('channel scales make red travel farthest (skin-like ordering at range)', () => {
  const atRange = scatteringProfileRGB(3, { radius: 1 });
  assert.ok(atRange[0] > atRange[1] && atRange[1] > atRange[2], `range order ${atRange}`);
  const near0 = scatteringProfileRGB(0.05, { radius: 1 });
  assert.ok(near0[2] > near0[0], 'near the source the narrow channels pile up (1/r core)');
  const kernel = profileKernel({ radius: 1, texelSize: 0.25, taps: 6 });
  assert.equal(kernel.weights.length, 13);
  for (let c = 0; c < 3; c++) {
    const sum = kernel.weights.reduce((s, w) => s + w[c], 0);
    assert.ok(near(sum, 1, 1e-9), `kernel channel ${c} normalized`);
  }
  const center = kernel.weights[6];
  assert.ok(center.every((w) => w > 0 && w < 1), 'center tap dominant but not total');
  // Kernel tails heavier in red: compare outermost taps.
  assert.ok(kernel.weights[0][0] > kernel.weights[0][2], 'red tail outweighs blue tail');
  assert.throws(() => profileKernel({ texelSize: 0 }), /texelSize/);
  assert.throws(() => scatteringProfile(-1, 1), />= 0/);
});

test('wrap diffuse and translucency follow their closed forms', () => {
  assert.ok(near(wrapDiffuse(0, 0.5), 1 / 3, 1e-12), 'terminator lifts to 1/3 at wrap 0.5');
  assert.ok(near(wrapDiffuse(1, 0.5), 1), 'fully lit stays 1');
  assert.equal(wrapDiffuse(-1, 0.5), 0, 'back side clamps to 0');
  assert.ok(near(wrapDiffuse(0.25, 0), 0.25), 'wrap 0 is plain Lambert');
  assert.equal(wrapDiffuse(-0.25, 0), 0);
  // Light directly behind, viewer facing it through the surface:
  // facing = 1, thickness d -> e^-1.
  const through = translucency([0, 0, 1], [0, 0, 1], 1, { power: 4, scatterDistance: 1 });
  assert.ok(near(through, Math.exp(-1), 1e-12), `translucency ${through}`);
  assert.equal(translucency([0, 0, 1], [0, 0, -1], 1), 0, 'light in front gives no through-light');
  assert.ok(near(translucency([0, 0, 1], [0, 0, 1], 0), 1), 'zero thickness passes fully');
  assert.throws(() => translucency([0, 0, 1], [0, 0, 1], -1), />= 0/);
});
