import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allowedOptions, configurationPrice, enumerateConfigurations,
  resolveConfiguration, validateConfiguration,
} from '../src/configurator.js';

// Car catalog: red paint excludes leather; sport wheels require leather.
const CAR = {
  basePrice: 20000,
  groups: [
    { id: 'color', options: [{ id: 'red', price: 0 }, { id: 'blue', price: 200 }] },
    { id: 'wheels', options: [{ id: 'std', price: 0 }, { id: 'sport', price: 500 }] },
    { id: 'interior', options: [{ id: 'cloth', price: 0 }, { id: 'leather', price: 800 }] },
  ],
  rules: [
    { type: 'excludes', a: { group: 'color', option: 'red' }, b: { group: 'interior', option: 'leather' } },
    { type: 'requires', when: { group: 'wheels', option: 'sport' }, need: { group: 'interior', option: 'leather' } },
  ],
};

test('enumeration matches the hand-counted valid set exactly', () => {
  // 8 combos - {red+leather (2)} - {sport+cloth (2)} = 4 valid.
  const all = enumerateConfigurations(CAR);
  assert.deepEqual(all, [
    { color: 'red', wheels: 'std', interior: 'cloth' },
    { color: 'blue', wheels: 'std', interior: 'cloth' },
    { color: 'blue', wheels: 'std', interior: 'leather' },
    { color: 'blue', wheels: 'sport', interior: 'leather' },
  ]);
  for (const sel of all) assert.deepEqual(validateConfiguration(CAR, sel), []);
  // The excluded combination validates with exactly one violation.
  const bad = validateConfiguration(CAR, { color: 'red', wheels: 'std', interior: 'leather' });
  assert.equal(bad.length, 1);
  assert.match(bad[0], /excludes/);
  const unmet = validateConfiguration(CAR, { color: 'blue', wheels: 'sport', interior: 'cloth' });
  assert.equal(unmet.length, 1);
  assert.match(unmet[0], /requires/);
  assert.match(validateConfiguration(CAR, { color: 'blue' })[0], /missing selection/);
});

test('resolution forces required options and reports impossibility as null', () => {
  assert.deepEqual(resolveConfiguration(CAR, { wheels: 'sport' }),
    { color: 'blue', wheels: 'sport', interior: 'leather' },
    'sport forces leather, which forces blue (first valid in declared order)');
  assert.deepEqual(resolveConfiguration(CAR, {}),
    { color: 'red', wheels: 'std', interior: 'cloth' }, 'empty partial resolves to the first catalog order combo');
  assert.equal(resolveConfiguration(CAR, { color: 'red', wheels: 'sport' }), null,
    'red + sport is impossible (sport needs leather, red excludes it)');
  assert.equal(resolveConfiguration(CAR, { color: 'red', interior: 'leather' }), null);
  // Allowed options are existential: red survives only with std wheels.
  assert.deepEqual(allowedOptions(CAR, { wheels: 'sport' }, 'color'), ['blue']);
  assert.deepEqual(allowedOptions(CAR, {}, 'color'), ['red', 'blue']);
  assert.deepEqual(allowedOptions(CAR, { color: 'red' }, 'interior'), ['cloth']);
  assert.deepEqual(allowedOptions(CAR, { color: 'red', wheels: 'sport' }, 'interior'), []);
});

test('pricing sums base and option prices; invalid selections are rejected', () => {
  assert.equal(configurationPrice(CAR, { color: 'blue', wheels: 'sport', interior: 'leather' }), 21500);
  assert.equal(configurationPrice(CAR, { color: 'red', wheels: 'std', interior: 'cloth' }), 20000);
  assert.throws(() => configurationPrice(CAR, { color: 'red', wheels: 'sport', interior: 'leather' }), /invalid configuration/);
  assert.throws(() => configurationPrice(CAR, { color: 'blue', wheels: 'std' }), /invalid configuration/);
  assert.throws(() => allowedOptions(CAR, {}, 'nope'), /unknown group/);
  assert.throws(() => enumerateConfigurations({ groups: [{ id: 'g', options: [] }] }), /needs options/);
  assert.throws(() => validateConfiguration({
    groups: CAR.groups,
    rules: [{ type: 'requires', when: { group: 'color', option: 'green' }, need: { group: 'wheels', option: 'std' } }],
  }, {}), /unknown option/);
});

test('a second catalog: chained requires propagate through resolution', () => {
  // PC: GPU pro requires PSU 850W; PSU 850W requires case XL.
  const PC = {
    groups: [
      { id: 'gpu', options: [{ id: 'basic' }, { id: 'pro' }] },
      { id: 'psu', options: [{ id: 'w550' }, { id: 'w850' }] },
      { id: 'case', options: [{ id: 'mid' }, { id: 'xl' }] },
    ],
    rules: [
      { type: 'requires', when: { group: 'gpu', option: 'pro' }, need: { group: 'psu', option: 'w850' } },
      { type: 'requires', when: { group: 'psu', option: 'w850' }, need: { group: 'case', option: 'xl' } },
    ],
  };
  assert.deepEqual(resolveConfiguration(PC, { gpu: 'pro' }), { gpu: 'pro', psu: 'w850', case: 'xl' },
    'requires chains resolve transitively');
  // Valid: basic with (w550|w850+xl) = 3, plus pro/w850/xl = 4.
  assert.equal(enumerateConfigurations(PC).length, 4);
  assert.deepEqual(allowedOptions(PC, { gpu: 'pro' }, 'case'), ['xl']);
});
