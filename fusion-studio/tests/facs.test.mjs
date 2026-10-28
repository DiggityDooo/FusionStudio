import test from 'node:test';
import assert from 'node:assert/strict';
import { composeExpressions, evaluateCorrectives, toBlendshapeWeights, evaluateFace, EXPRESSIONS } from '../src/facs.js';

test('presets compose additively with clamping and layer weights', () => {
  const happy = composeExpressions([{ expression: 'happiness' }]);
  assert.deepEqual(happy.AU12, { left: 1, right: 1 });
  assert.deepEqual(happy.AU6, { left: 0.7, right: 0.7 });
  // Doubling happiness clamps at 1 instead of exceeding it.
  const doubled = composeExpressions([{ expression: 'happiness' }, { expression: 'happiness' }]);
  assert.equal(doubled.AU12.left, 1);
  assert.equal(doubled.AU6.left, 1, '0.7 + 0.7 clamps to 1');
  // Half-weight sadness.
  const sad = composeExpressions([{ expression: 'sadness', weight: 0.5 }]);
  assert.ok(Math.abs(sad.AU1.left - 0.425) < 1e-12);
  assert.ok(Math.abs(sad.AU15.left - 0.4) < 1e-12);
  // Neutral composes to nothing.
  assert.deepEqual(composeExpressions([{ expression: 'neutral' }]), {});
  assert.deepEqual(composeExpressions([]), {});
});

test('asymmetric contempt keeps left/right separate through the pipeline', () => {
  const face = evaluateFace([{ expression: 'contempt' }], {
    mapping: { AU12: { shape: 'smirk', splitSides: true } },
  });
  assert.deepEqual(face.aus.AU12, { left: 0.85, right: 0.1 });
  assert.ok(Math.abs(face.shapes.smirk_L - 0.85) < 1e-12);
  assert.ok(Math.abs(face.shapes.smirk_R - 0.1) < 1e-12);
  // Non-split mapping takes the stronger side.
  const flat = toBlendshapeWeights(face.aus, { AU12: 'smirk' });
  assert.ok(Math.abs(flat.smirk - 0.85) < 1e-12);
});

test('correctives fire on AU combinations at the weakest trigger', () => {
  const rules = [
    { name: 'cheekRaiseFix', when: { AU12: 0.5, AU6: 0.5 } },
    { name: 'neverFires', when: { AU12: 0.5, AU45: 0.5 } },
  ];
  const happy = composeExpressions([{ expression: 'happiness' }]);
  const out = evaluateCorrectives(happy, rules);
  // min(AU12 1.0/0.5, AU6 0.7/0.5) capped: min(2, 1.4) -> 1... scale via weakest/required:
  assert.ok(Math.abs(out.cheekRaiseFix - 1) < 1e-12, 'both triggers well above threshold');
  assert.equal(out.neverFires, undefined, 'missing AU45 means no corrective');

  const mildSmile = composeExpressions([{ aus: { AU12: 0.6, AU6: 0.3 } }]);
  const mild = evaluateCorrectives(mildSmile, rules);
  assert.ok(Math.abs(mild.cheekRaiseFix - 0.6) < 1e-12, 'weakest trigger AU6: 0.3/0.5 = 0.6');

  // Side-specific trigger reads only that side.
  const sideRule = [{ name: 'leftSmirkFix', when: { 'AU12.left': 0.5 }, scale: 0.8 }];
  const contempt = composeExpressions([{ expression: 'contempt' }]);
  const sideOut = evaluateCorrectives(contempt, sideRule);
  assert.ok(Math.abs(sideOut.leftSmirkFix - 1) < 1e-9, 'left 0.85/0.5 = 1.7, * 0.8 scale = 1.36, clamped to 1');
  const weakLeft = evaluateCorrectives(composeExpressions([{ aus: { AU12: { left: 0.3, right: 0 } } }]), sideRule);
  assert.ok(Math.abs(weakLeft.leftSmirkFix - 0.48) < 1e-9, 'sub-threshold: 0.3/0.5 * 0.8 = 0.48');
});

test('blendshape mapping scales, splits, and skips absent AUs', () => {
  const aus = composeExpressions([{ expression: 'surprise' }]);
  const shapes = toBlendshapeWeights(aus, {
    AU26: { shape: 'jawOpen', scale: 0.8 },
    AU1: 'browInnerUp',
    AU45: 'blink',
  });
  assert.ok(Math.abs(shapes.jawOpen - 0.52) < 1e-9, '0.65 * 0.8');
  assert.ok(Math.abs(shapes.browInnerUp - 0.7) < 1e-9);
  assert.equal(shapes.blink, undefined, 'AU45 not in surprise');
});

test('validation errors are explicit', () => {
  assert.throws(() => composeExpressions([{ expression: 'ecstasy' }]), /unknown expression/);
  assert.throws(() => composeExpressions([{ aus: { AU99: 1 } }]), /unknown action unit 'AU99'/);
  assert.throws(() => composeExpressions([{ weight: 0.5 }]), /needs an expression name or aus/);
  assert.throws(() => composeExpressions([{ expression: 'happiness', weight: -1 }]), /weight must be >= 0/);
  assert.throws(() => evaluateCorrectives({}, [{ name: 'x', when: { AU99: 1 } }]), /unknown action unit/);
  assert.ok(Object.keys(EXPRESSIONS).length >= 7, 'preset library present');
  // Every shipped preset must compose without error (guards AU typos).
  for (const name of Object.keys(EXPRESSIONS)) {
    const aus = composeExpressions([{ expression: name }]);
    for (const [au, v] of Object.entries(aus)) {
      assert.ok(v.left >= 0 && v.left <= 1 && v.right >= 0 && v.right <= 1, `${name}/${au} in range`);
    }
  }
});
