import test from 'node:test';
import assert from 'node:assert/strict';
import {
  kernelPoly6, kernelSpikyGradient, kernelViscosityLaplacian,
  calibrateMass, createSPHSystem, computeSPHState, computeSPHAccelerations, stepSPH,
} from '../src/sph.js';

function lattice(nx, ny, nz, spacing, origin = [0, 0, 0]) {
  const pts = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
    pts.push([origin[0] + i * spacing, origin[1] + j * spacing, origin[2] + k * spacing]);
  }
  return pts;
}

test('kernel functions match their analytic forms', () => {
  const h = 1.4;
  assert.ok(Math.abs(kernelPoly6(0, h) - 315 / (64 * Math.PI * h ** 3)) < 1e-12);
  assert.equal(kernelPoly6(h, h), 0);
  assert.equal(kernelPoly6(2 * h, h), 0);
  assert.ok(kernelPoly6(0.3, h) > kernelPoly6(0.9, h), 'monotone decreasing');
  const g = kernelSpikyGradient(0.5, 0, 0, h);
  const expected = -45 / Math.PI / (h ** 6) * (h - 0.5) ** 2;
  assert.ok(Math.abs(g[0] - expected) < 1e-9, `spiky ${g[0]} vs ${expected}`);
  assert.ok(Math.abs(g[1]) < 1e-15 && Math.abs(g[2]) < 1e-15, 'gradient aligned with offset');
  assert.ok(Math.abs(kernelViscosityLaplacian(0.5, h) - 45 / Math.PI / (h ** 6) * (h - 0.5)) < 1e-9);
});

test('hash neighbor densities match brute force exactly', () => {
  const pts = lattice(4, 4, 4, 1.0);
  // Deterministic jitter so the config is not perfectly regular.
  pts.forEach((p, i) => { p[0] += ((i * 37) % 10) * 0.01; p[1] += ((i * 53) % 10) * 0.01; });
  const sys = createSPHSystem({ positions: pts, h: 1.4, mass: 0.5, restDensity: 1 });
  computeSPHState(sys);
  for (let i = 0; i < sys.count; i++) {
    let rho = 0.5 * kernelPoly6(0, 1.4);
    for (let j = 0; j < sys.count; j++) {
      if (j === i) continue;
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1], pts[i][2] - pts[j][2]);
      rho += 0.5 * kernelPoly6(d, 1.4);
    }
    assert.ok(Math.abs(rho - sys.densities[i]) < 1e-10, `particle ${i}: ${rho} vs ${sys.densities[i]}`);
  }
});

test('calibrated lattice sits at rest density with zero net force inside', () => {
  const spacing = 1, h = 1.4, rho0 = 1000;
  const mass = calibrateMass(spacing, h, rho0);
  const pts = lattice(5, 5, 5, spacing);
  const sys = createSPHSystem({
    positions: pts, h, mass, restDensity: rho0, gasConstant: 50, gravity: [0, 0, 0],
  });
  const lists = computeSPHState(sys);
  const center = 62; // (2,2,2) in row-major x-major lattice
  assert.ok(Math.abs(sys.densities[center] - rho0) / rho0 < 0.01, `density ${sys.densities[center]}`);
  assert.ok(Math.abs(sys.pressures[center]) < 50 * rho0 * 0.01, 'near-zero pressure');
  computeSPHAccelerations(sys, lists);
  const f = Math.hypot(sys.accelerations[center * 3], sys.accelerations[center * 3 + 1], sys.accelerations[center * 3 + 2]);
  assert.ok(f < 1e-6, `interior acceleration cancels by symmetry: ${f}`);
});

test('isolated system conserves momentum and moves its COM uniformly', () => {
  const pts = lattice(3, 3, 3, 1.0);
  const sys = createSPHSystem({
    positions: pts, h: 1.4, mass: calibrateMass(1, 1.4, 1), restDensity: 1,
    // Pressure-only: the symmetric pressure term conserves momentum exactly.
    // (Muller's viscosity term does not when densities differ.)
    gasConstant: 30, viscosity: 0, gravity: [0, 0, 0],
  });
  for (let i = 0; i < sys.count; i++) {
    sys.velocities[i * 3] = 0.3 + (i % 5) * 0.02;
    sys.velocities[i * 3 + 1] = -0.1 + (i % 3) * 0.05;
  }
  const momentum = () => {
    let px = 0, py = 0, pz = 0;
    for (let i = 0; i < sys.count; i++) {
      px += sys.velocities[i * 3]; py += sys.velocities[i * 3 + 1]; pz += sys.velocities[i * 3 + 2];
    }
    return [px * sys.mass, py * sys.mass, pz * sys.mass];
  };
  const com = () => {
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < sys.count; i++) {
      x += sys.positions[i * 3]; y += sys.positions[i * 3 + 1]; z += sys.positions[i * 3 + 2];
    }
    return [x / sys.count, y / sys.count, z / sys.count];
  };
  const p0 = momentum(), c0 = com();
  for (let s = 0; s < 100; s++) stepSPH(sys, 0.002);
  const p1 = momentum(), c1 = com();
  for (let a = 0; a < 3; a++) assert.ok(Math.abs(p1[a] - p0[a]) < 1e-9, `momentum axis ${a}`);
  const expectedCom = c0.map((c, a) => c + (p0[a] / (sys.mass * sys.count)) * 0.2);
  for (let a = 0; a < 3; a++) assert.ok(Math.abs(c1[a] - expectedCom[a]) < 1e-6, `COM axis ${a}`);
});

test('over-compressed lattice expands under its own pressure', () => {
  const spacing = 1, h = 1.4;
  const mass = calibrateMass(spacing, h, 1);
  // Compressed: same mass at 0.75 spacing -> density ~ (1/0.75)^3 x rest.
  const pts = lattice(4, 4, 4, spacing * 0.75);
  const sys = createSPHSystem({
    positions: pts, h, mass, restDensity: 1, gasConstant: 30, viscosity: 0.05, gravity: [0, 0, 0],
  });
  computeSPHState(sys);
  assert.ok(sys.densities[21] > 1.5, `compressed density ${sys.densities[21]}`);
  const extent = () => {
    let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (let i = 0; i < sys.count; i++) for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], sys.positions[i * 3 + a]);
      hi[a] = Math.max(hi[a], sys.positions[i * 3 + a]);
    }
    return (hi[0] - lo[0]) + (hi[1] - lo[1]) + (hi[2] - lo[2]);
  };
  const before = extent();
  for (let s = 0; s < 200; s++) stepSPH(sys, 0.002);
  assert.ok(extent() > before * 1.05, `expands: ${before} -> ${extent()}`);
});

test('pool collapses, dissipates, and stays contained (no explosion)', () => {
  // Note: without boundary particles, weakly-compressible SPH settles into
  // a floor layer rather than a deep stacked pool -- a known limitation of
  // the plain formulation. The oracles here are the safety/energy claims:
  // containment, bounded density, energy dissipation, collapse.
  const h = 1.4;
  const mass = calibrateMass(1, h, 1);
  const damPts = lattice(4, 3, 4, 1.0, [0.5, 0.5, 0.5]);
  const dam = createSPHSystem({
    positions: damPts, h, mass, restDensity: 1, gasConstant: 60, viscosity: 0.3,
    bounds: { min: [0, 0, 0], max: [6, 8, 6] },
  });
  let runningMaxRho = 0, peakKE = 0;
  const meanKE = () => {
    let ke = 0;
    for (let i = 0; i < dam.count; i++) {
      ke += dam.velocities[i * 3] ** 2 + dam.velocities[i * 3 + 1] ** 2 + dam.velocities[i * 3 + 2] ** 2;
    }
    return ke / dam.count;
  };
  for (let s = 0; s < 2000; s++) {
    stepSPH(dam, 0.002);
    for (let i = 0; i < dam.count; i++) runningMaxRho = Math.max(runningMaxRho, dam.densities[i]);
    if (s % 50 === 0) peakKE = Math.max(peakKE, meanKE());
  }
  let maxSpeed = 0, centroidY = 0;
  for (let i = 0; i < dam.count; i++) {
    const v = Math.hypot(dam.velocities[i * 3], dam.velocities[i * 3 + 1], dam.velocities[i * 3 + 2]);
    maxSpeed = Math.max(maxSpeed, v);
    centroidY += dam.positions[i * 3 + 1] / dam.count;
    assert.ok(Number.isFinite(dam.positions[i * 3 + 1]), 'finite');
    assert.ok(dam.positions[i * 3 + 1] >= 0 && dam.positions[i * 3 + 1] <= 8, 'contained');
  }
  assert.ok(runningMaxRho < 2.0, `bounded compression: ${runningMaxRho}`);
  assert.ok(centroidY < 0.6, `collapsed from 1.5 to ${centroidY}`);
  assert.ok(meanKE() < peakKE * 0.05 && meanKE() < 0.3, `dissipated: peak ${peakKE} -> ${meanKE()}`);
  assert.ok(maxSpeed < 1.5, `calming: max speed ${maxSpeed}`);
});
