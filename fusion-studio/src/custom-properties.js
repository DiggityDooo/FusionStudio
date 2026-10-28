'use strict';
// Custom properties / metadata (A26 "Metadata/custom properties"):
// schema-typed key-value sets attachable to scene objects. Types are
// validated on write (never silently coerced past recognition), floats
// can clamp or reject out-of-range values, enums check membership, and
// sets support layering (instance values over schema defaults) plus
// diffing for change tracking and serialization.

export const PROPERTY_TYPES = ['float', 'int', 'string', 'bool', 'color', 'vec3', 'enum'];

function isVec3(v) {
  return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
}
function isColor(v) {
  return Array.isArray(v) && (v.length === 3 || v.length === 4)
    && v.every((n) => typeof n === 'number' && n >= 0 && n <= 1);
}

function validateValue(def, value) {
  switch (def.type) {
    case 'float':
      if (typeof value !== 'number' || !Number.isFinite(value)) return `expected a finite number`;
      break;
    case 'int':
      if (!Number.isInteger(value)) return `expected an integer`;
      break;
    case 'string':
      if (typeof value !== 'string') return `expected a string`;
      break;
    case 'bool':
      if (typeof value !== 'boolean') return `expected a boolean`;
      break;
    case 'color':
      if (!isColor(value)) return `expected [r,g,b] or [r,g,b,a] with components in 0..1`;
      break;
    case 'vec3':
      if (!isVec3(value)) return `expected [x,y,z] of finite numbers`;
      break;
    case 'enum':
      if (!def.options || !def.options.includes(value)) return `expected one of ${(def.options || []).join(', ')}`;
      break;
    default:
      return `unknown type '${def.type}'`;
  }
  if ((def.type === 'float' || def.type === 'int')) {
    if (def.min !== undefined && value < def.min) return `below min ${def.min}`;
    if (def.max !== undefined && value > def.max) return `above max ${def.max}`;
  }
  return null;
}

function cloneValue(v) {
  return Array.isArray(v) ? [...v] : v;
}

/**
 * Create a property schema. defs: [{name, type, default, min?, max?,
 * options? (enum), clamp? (clamp instead of reject out-of-range)}].
 * Schema defaults are validated at construction.
 */
export function createPropertySchema(defs) {
  const byName = new Map();
  for (const def of defs || []) {
    if (!def || typeof def.name !== 'string' || !def.name) throw new Error('custom-properties: def needs a name');
    if (!PROPERTY_TYPES.includes(def.type)) throw new Error(`custom-properties: '${def.name}' has unknown type '${def.type}'`);
    if (byName.has(def.name)) throw new Error(`custom-properties: duplicate property '${def.name}'`);
    if (def.type === 'enum' && (!Array.isArray(def.options) || def.options.length === 0)) {
      throw new Error(`custom-properties: enum '${def.name}' needs options`);
    }
    if (def.default !== undefined) {
      const problem = validateValue(def, def.default);
      if (problem) throw new Error(`custom-properties: default for '${def.name}': ${problem}`);
    }
    byName.set(def.name, { ...def });
  }
  return {
    defs: byName,
    has: (name) => byName.has(name),
    names: () => [...byName.keys()],
  };
}

/** A property set bound to a schema. Values layer over defaults. */
export function createPropertySet(schema, initial = {}) {
  const values = new Map();
  const api = {
    schema,
    set(name, value) {
      const def = schema.defs.get(name);
      if (!def) throw new Error(`custom-properties: unknown property '${name}'`);
      let v = value;
      if ((def.type === 'float' || def.type === 'int') && def.clamp) {
        if (typeof v === 'number') {
          if (def.min !== undefined) v = Math.max(def.min, v);
          if (def.max !== undefined) v = Math.min(def.max, v);
        }
      }
      const problem = validateValue(def, v);
      if (problem) throw new Error(`custom-properties: '${name}': ${problem}`);
      values.set(name, cloneValue(v));
      return api;
    },
    get(name) {
      const def = schema.defs.get(name);
      if (!def) throw new Error(`custom-properties: unknown property '${name}'`);
      return cloneValue(values.has(name) ? values.get(name) : def.default);
    },
    /** True when an explicit value overrides the schema default. */
    isSet(name) { return values.has(name); },
    unset(name) { values.delete(name); },
    /** Effective values (explicit + defaults) as a plain object. */
    effective() {
      const out = {};
      for (const name of schema.names()) out[name] = api.get(name);
      return out;
    },
    /** Only the explicitly set values -- the serializable layer. */
    toJSON() {
      const out = {};
      for (const [name, v] of values) out[name] = cloneValue(v);
      return out;
    },
  };
  for (const [name, value] of Object.entries(initial)) api.set(name, value);
  return api;
}

export function propertySetFromJSON(schema, json) {
  return createPropertySet(schema, json || {});
}

/** Names whose effective values differ between two sets of one schema. */
export function diffPropertySets(a, b) {
  const diffs = [];
  for (const name of a.schema.names()) {
    const va = a.get(name), vb = b.get(name);
    const same = Array.isArray(va) && Array.isArray(vb)
      ? va.length === vb.length && va.every((v, i) => v === vb[i])
      : va === vb;
    if (!same) diffs.push({ name, from: va, to: vb });
  }
  return diffs;
}
