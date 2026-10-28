'use strict';
// DXF vector export (A24 "Laser-cutting/vector export"): a
// minimal but structurally valid ASCII DXF (R2000 group-code
// format) writer and parser for 2D cutting entities — LINE,
// LWPOLYLINE, CIRCLE, ARC, POINT — with layers. The writer emits
// HEADER, a LAYER table for the used layers, ENTITIES, and EOF;
// the parser reads entities back (unknown entities are skipped),
// so files round-trip and hand-written DXF can be imported.

const fmt = (v) => {
  const s = Number(v.toFixed(6));
  return Object.is(s, -0) ? '0' : String(s);
};

function entityToCodes(entity) {
  const layer = entity.layer || '0';
  switch (entity.type) {
    case 'line':
      return [0, 'LINE', 8, layer, 10, fmt(entity.from[0]), 20, fmt(entity.from[1]), 30, '0', 11, fmt(entity.to[0]), 21, fmt(entity.to[1]), 31, '0'];
    case 'polyline': {
      const codes = [0, 'LWPOLYLINE', 8, layer, 90, String(entity.points.length), 70, entity.closed ? '1' : '0'];
      for (const [x, y] of entity.points) codes.push(10, fmt(x), 20, fmt(y));
      return codes;
    }
    case 'circle':
      return [0, 'CIRCLE', 8, layer, 10, fmt(entity.center[0]), 20, fmt(entity.center[1]), 30, '0', 40, fmt(entity.radius)];
    case 'arc':
      return [0, 'ARC', 8, layer, 10, fmt(entity.center[0]), 20, fmt(entity.center[1]), 30, '0', 40, fmt(entity.radius), 50, fmt(entity.startAngle), 51, fmt(entity.endAngle)];
    case 'point':
      return [0, 'POINT', 8, layer, 10, fmt(entity.at[0]), 20, fmt(entity.at[1]), 30, '0'];
    default:
      throw new Error(`dxf: unsupported entity type ${entity.type}`);
  }
}

function validateEntities(entities) {
  for (const e of entities) {
    if (e.type === 'polyline' && (!e.points || e.points.length < 2)) throw new Error('dxf: polyline needs >= 2 points');
    if ((e.type === 'circle' || e.type === 'arc') && !(e.radius > 0)) throw new Error('dxf: radius must be positive');
    if (e.type === 'arc' && !(Number.isFinite(e.startAngle) && Number.isFinite(e.endAngle))) throw new Error('dxf: arc angles required (degrees)');
  }
}

/** Serialize entities to an ASCII DXF string. */
export function writeDxf(entities, { version = 'AC1015' } = {}) {
  validateEntities(entities);
  const layers = [...new Set(['0', ...entities.map((e) => e.layer || '0')])];
  const lines = [];
  const pair = (code, value) => lines.push(String(code), String(value));
  pair(0, 'SECTION'); pair(2, 'HEADER');
  pair(9, '$ACADVER'); pair(1, version);
  pair(0, 'ENDSEC');
  pair(0, 'SECTION'); pair(2, 'TABLES');
  pair(0, 'TABLE'); pair(2, 'LAYER'); pair(70, layers.length);
  for (const layer of layers) {
    pair(0, 'LAYER'); pair(2, layer); pair(70, '0'); pair(62, '7'); pair(6, 'Continuous');
  }
  pair(0, 'ENDTAB'); pair(0, 'ENDSEC');
  pair(0, 'SECTION'); pair(2, 'ENTITIES');
  for (const entity of entities) {
    const codes = entityToCodes(entity);
    for (let i = 0; i < codes.length; i += 2) pair(codes[i], codes[i + 1]);
  }
  pair(0, 'ENDSEC');
  pair(0, 'EOF');
  return lines.join('\n') + '\n';
}

/** Parse the ENTITIES section of an ASCII DXF string. */
export function parseDxf(text) {
  const raw = String(text).split(/\r?\n/);
  const pairs = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    pairs.push([raw[i].trim(), raw[i + 1]]);
  }
  const entities = [];
  let inEntities = false;
  let current = null;
  const flush = () => {
    if (!current) return;
    const { type, codes } = current;
    const get = (code) => {
      const hit = codes.find(([c]) => c === code);
      return hit ? hit[1] : undefined;
    };
    const getAll = (code) => codes.filter(([c]) => c === code).map(([, v]) => v);
    const layer = get('8') || '0';
    if (type === 'LINE') {
      entities.push({ type: 'line', layer, from: [parseFloat(get('10')), parseFloat(get('20'))], to: [parseFloat(get('11')), parseFloat(get('21'))] });
    } else if (type === 'LWPOLYLINE' || type === 'POLYLINE') {
      const xs = getAll('10').map(Number), ys = getAll('20').map(Number);
      entities.push({
        type: 'polyline', layer,
        points: xs.map((x, i) => [x, ys[i]]),
        closed: (parseInt(get('70') || '0', 10) & 1) === 1,
      });
    } else if (type === 'CIRCLE') {
      entities.push({ type: 'circle', layer, center: [parseFloat(get('10')), parseFloat(get('20'))], radius: parseFloat(get('40')) });
    } else if (type === 'ARC') {
      entities.push({
        type: 'arc', layer,
        center: [parseFloat(get('10')), parseFloat(get('20'))], radius: parseFloat(get('40')),
        startAngle: parseFloat(get('50')), endAngle: parseFloat(get('51')),
      });
    } else if (type === 'POINT') {
      entities.push({ type: 'point', layer, at: [parseFloat(get('10')), parseFloat(get('20'))] });
    }
    current = null;
  };
  for (const [code, value] of pairs) {
    if (code === '0' && value === 'SECTION') { current = null; continue; }
    if (code === '2' && value === 'ENTITIES') { inEntities = true; continue; }
    if (code === '0' && value === 'ENDSEC') { flush(); inEntities = false; continue; }
    if (!inEntities) continue;
    if (code === '0') {
      flush();
      current = { type: value, codes: [] };
    } else if (current) {
      current.codes.push([code, value]);
    }
  }
  flush();
  return entities;
}

/** Convenience: closed/open 2D polylines -> DXF entities on one layer. */
export function polylinesToDxf(polylines, { layer = 'CUT', closed = true } = {}) {
  return polylines.map((points) => ({ type: 'polyline', layer, points, closed }));
}
