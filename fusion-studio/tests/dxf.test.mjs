import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDxf, polylinesToDxf, writeDxf } from '../src/dxf.js';

const ENTITIES = [
  { type: 'line', layer: 'CUT', from: [0, 0], to: [10.5, 0] },
  { type: 'polyline', layer: 'CUT', points: [[0, 0], [10.5, 0], [10.5, 8.25], [0, 8.25]], closed: true },
  { type: 'circle', layer: 'DRILL', center: [5.25, 4.125], radius: 1.6 },
  { type: 'arc', layer: 'CUT', center: [5.25, 4.125], radius: 3, startAngle: 15, endAngle: 200 },
  { type: 'point', layer: 'MARK', at: [1, 1] },
];

function assertEntitiesClose(actual, expected, eps = 1e-6) {
  assert.equal(actual.length, expected.length, 'entity count');
  actual.forEach((entity, i) => {
    const want = expected[i];
    assert.equal(entity.type, want.type, `entity ${i} type`);
    assert.equal(entity.layer, want.layer || '0', `entity ${i} layer`);
    const numbers = (e) => JSON.stringify(e, (k, v) => (typeof v === 'number' ? Math.round(v / eps) : v));
    assert.equal(numbers(entity), numbers(want), `entity ${i} geometry`);
  });
}

test('DXF write -> parse round-trips every entity exactly', () => {
  const text = writeDxf(ENTITIES);
  assert.match(text, /SECTION/);
  assert.match(text, /ENTITIES/);
  assert.match(text, /\nEOF\n$/);
  assert.match(text, /\$ACADVER/);
  // Layer table carries every used layer plus the default.
  for (const layer of ['0', 'CUT', 'DRILL', 'MARK']) {
    assert.ok(text.includes(`\n${layer}\n`), `layer ${layer} in the table`);
  }
  // Group codes come in code/value line pairs (even line count).
  assert.equal(text.trimEnd().split('\n').length % 2, 0, 'group-code pairs');
  assertEntitiesClose(parseDxf(text), ENTITIES);
  // Non-representable decimals survive to the 6-decimal format.
  const third = writeDxf([{ type: 'point', at: [1 / 3, 2 / 3] }]);
  const [parsed] = parseDxf(third);
  assert.ok(Math.abs(parsed.at[0] - 1 / 3) < 1e-6 && Math.abs(parsed.at[1] - 2 / 3) < 1e-6, '6-decimal coordinate format');
});

test('parser skips unknown entities and foreign sections gracefully', () => {
  const foreign = [
    '0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1015', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
    '0', 'SPLINE', '8', '0', '70', '8',
    '0', 'LINE', '8', 'A', '10', '1', '20', '2', '11', '3', '21', '4',
    '0', 'ENDSEC', '0', 'EOF', '',
  ].join('\n');
  const parsed = parseDxf(foreign);
  assert.equal(parsed.length, 1, 'only the LINE survives');
  assert.deepEqual(parsed[0], { type: 'line', layer: 'A', from: [1, 2], to: [3, 4] });
  // Legacy POLYLINE header (without vertex records) parses as an
  // empty polyline rather than crashing.
  assert.deepEqual(parseDxf('0\nSECTION\n2\nENTITIES\n0\nPOLYLINE\n8\n0\n0\nENDSEC\n0\nEOF\n'),
    [{ type: 'polyline', layer: '0', points: [], closed: false }]);
  assert.throws(() => writeDxf([{ type: 'spline', points: [] }]), /unsupported entity/);
  assert.throws(() => writeDxf([{ type: 'circle', center: [0, 0], radius: 0 }]), /radius/);
  assert.throws(() => writeDxf([{ type: 'polyline', points: [[0, 0]] }]), />= 2 points/);
});

test('section contours become a laser-ready DXF through the bridge', () => {
  // A square section contour and an inner drill circle, as a
  // laser job: cut outline + drill points.
  const contour = [[0, 0], [20, 0], [20, 20], [0, 20]];
  const entities = [
    ...polylinesToDxf([contour], { layer: 'CUT' }),
    { type: 'circle', layer: 'DRILL', center: [10, 10], radius: 2 },
  ];
  const roundTripped = parseDxf(writeDxf(entities));
  assertEntitiesClose(roundTripped, entities);
  const cut = roundTripped.find((e) => e.layer === 'CUT');
  assert.equal(cut.closed, true, 'contour exported closed for cutting');
  assert.equal(cut.points.length, 4);
});
