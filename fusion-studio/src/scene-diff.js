'use strict';
// Scene diff/patch (A26 "Version control integration", A28
// "Project/workspace management"): structural diff between two
// scene documents (plain JSON-shaped data) producing a
// JSON-serializable, invertible patch. Arrays of objects with
// unique string `id`s are matched by id (patch paths address
// elements as { id } segments); other arrays are compared
// element-wise when equal-length and replaced wholesale when
// not. Every op records `previous`, so patches can be inverted
// and audited. Applying a patch never mutates its input.

const clone = (v) => (v === undefined ? undefined : structuredClone(v));

export function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  const keysA = Object.keys(a), keysB = Object.keys(b);
  return keysA.length === keysB.length
    && keysA.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

const isIdArray = (arr) => arr.length > 0
  && arr.every((el) => el && typeof el === 'object' && !Array.isArray(el) && typeof el.id === 'string')
  && new Set(arr.map((el) => el.id)).size === arr.length;

function diffInto(a, b, path, ops) {
  if (deepEqual(a, b)) return;
  const bothObjects = a && b && typeof a === 'object' && typeof b === 'object';
  if (!bothObjects || Array.isArray(a) !== Array.isArray(b)) {
    ops.push({ op: 'set', path, value: clone(b), previous: clone(a) });
    return;
  }
  if (Array.isArray(a)) {
    if (isIdArray(a) && isIdArray(b)) {
      const byIdA = new Map(a.map((el) => [el.id, el]));
      const byIdB = new Map(b.map((el) => [el.id, el]));
      const commonA = a.filter((el) => byIdB.has(el.id)).map((el) => el.id);
      const commonB = b.filter((el) => byIdA.has(el.id)).map((el) => el.id);
      if (commonA.join('') !== commonB.join('')) {
        // Reordered shared elements: replace wholesale (order is
        // meaningful for hierarchy/children lists).
        ops.push({ op: 'set', path, value: clone(b), previous: clone(a) });
        return;
      }
      for (const id of [...byIdA.keys()].sort()) {
        if (!byIdB.has(id)) {
          ops.push({
            op: 'remove', path: [...path, { id }], previous: clone(byIdA.get(id)),
            index: a.findIndex((el) => el.id === id),
          });
        }
      }
      for (const id of [...byIdB.keys()].sort()) {
        if (!byIdA.has(id)) {
          ops.push({
            op: 'set', path: [...path, { id }], value: clone(byIdB.get(id)), previous: undefined,
            index: b.findIndex((el) => el.id === id),
          });
        } else diffInto(byIdA.get(id), byIdB.get(id), [...path, { id }], ops);
      }
      return;
    }
    if (a.length === b.length) {
      for (let i = 0; i < a.length; i++) diffInto(a[i], b[i], [...path, i], ops);
      return;
    }
    ops.push({ op: 'set', path, value: clone(b), previous: clone(a) });
    return;
  }
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const key of keys) {
    if (!(key in b)) ops.push({ op: 'remove', path: [...path, key], previous: clone(a[key]) });
    else if (!(key in a)) ops.push({ op: 'set', path: [...path, key], value: clone(b[key]), previous: undefined });
    else diffInto(a[key], b[key], [...path, key], ops);
  }
}

/** Structural diff: applyPatch(a, diffScenes(a, b)) deep-equals b. */
export function diffScenes(a, b) {
  const ops = [];
  diffInto(a, b, [], ops);
  return ops;
}

function resolveParent(root, path) {
  let node = root;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i];
    if (seg && typeof seg === 'object') {
      node = node.find((el) => el.id === seg.id);
    } else {
      node = node[seg];
    }
    if (node === undefined || node === null) throw new Error(`patch: path not found at ${JSON.stringify(path.slice(0, i + 1))}`);
  }
  return node;
}

/** Apply a patch, returning a new document (input untouched). */
export function applyPatch(doc, ops) {
  const root = clone(doc);
  for (const op of ops) {
    if (op.path.length === 0) {
      if (op.op !== 'set') throw new Error('patch: only set can replace the root');
      return clone(op.value);
    }
    const parent = resolveParent(root, op.path);
    const last = op.path[op.path.length - 1];
    if (last && typeof last === 'object') {
      const index = parent.findIndex((el) => el.id === last.id);
      if (op.op === 'set') {
        if (index >= 0) parent[index] = clone(op.value);
        else if (Number.isInteger(op.index)) parent.splice(Math.min(op.index, parent.length), 0, clone(op.value));
        else parent.push(clone(op.value));
      } else if (op.op === 'remove') {
        if (index < 0) throw new Error(`patch: no element with id ${last.id} to remove`);
        parent.splice(index, 1);
      }
    } else if (op.op === 'set') {
      parent[last] = clone(op.value);
    } else if (op.op === 'remove') {
      if (Array.isArray(parent)) parent.splice(last, 1);
      else delete parent[last];
    } else {
      throw new Error(`patch: unknown op ${op.op}`);
    }
  }
  return root;
}

/** Reverse a patch (ops reversed, set/remove swapped via previous). */
export function invertPatch(ops) {
  const out = [];
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i];
    if (op.op === 'set') {
      if (op.previous === undefined) out.push({ op: 'remove', path: op.path, previous: clone(op.value), index: op.index });
      else out.push({ op: 'set', path: op.path, value: clone(op.previous), previous: clone(op.value), index: op.index });
    } else if (op.op === 'remove') {
      out.push({ op: 'set', path: op.path, value: clone(op.previous), previous: undefined, index: op.index });
    } else {
      throw new Error(`patch: unknown op ${op.op}`);
    }
  }
  return out;
}

/** Op counts by kind, for changelogs. */
export function diffSummary(ops) {
  const summary = { set: 0, remove: 0, total: ops.length };
  for (const op of ops) summary[op.op] = (summary[op.op] || 0) + 1;
  return summary;
}
