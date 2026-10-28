'use strict';
// Asset dependency + path kernel for pipeline work: lexical path
// normalization (forward-slash canonical form), relative/absolute
// resolution, a dependency graph with topological load order, cycle and
// missing-dependency detection, change impact (reverse reachability),
// packaging closures, and missing-file relinking by basename index.
// All lexical -- no filesystem access, so results are identical anywhere.

/** Canonicalize a path: forward slashes, no //, . or resolvable .. parts. */
export function normalizeAssetPath(path) {
  if (typeof path !== 'string' || path.length === 0) throw new TypeError('path required');
  let p = path.replace(/\\/g, '/');
  let prefix = '';
  const drive = p.match(/^[A-Za-z]:/);
  if (drive) { prefix = drive[0]; p = p.slice(2); }
  const absolute = p.startsWith('/');
  const parts = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length && parts[parts.length - 1] !== '..') parts.pop();
      else if (!absolute) parts.push('..');
    } else parts.push(seg);
  }
  const body = parts.join('/');
  if (prefix) return body ? `${prefix}/${body}` : `${prefix}/`;
  return absolute ? `/${body}` : (body || '.');
}

export function isAbsoluteAssetPath(path) {
  const p = path.replace(/\\/g, '/');
  return p.startsWith('/') || /^[A-Za-z]:\//.test(p);
}

/** Directory portion of a normalized path ('/a/b/c.png' -> '/a/b'). */
export function assetDirname(path) {
  const p = normalizeAssetPath(path);
  const i = p.lastIndexOf('/');
  if (i < 0) return '.';
  if (i === 0) return '/';
  if (/^[A-Za-z]:$/.test(p.slice(0, i))) return `${p.slice(0, i)}/`;
  return p.slice(0, i);
}

/** Resolve a (possibly relative) reference against a base directory. */
export function resolveAssetPath(baseDir, ref) {
  if (isAbsoluteAssetPath(ref)) return normalizeAssetPath(ref);
  return normalizeAssetPath(`${normalizeAssetPath(baseDir)}/${ref}`);
}

/** Path of `toPath` relative to directory `fromDir` (both absolute). */
export function relativeAssetPath(fromDir, toPath) {
  const from = normalizeAssetPath(fromDir).split('/').filter((s) => s.length);
  const to = normalizeAssetPath(toPath).split('/').filter((s) => s.length);
  // Different roots (drive letters / leading slash) cannot relativize.
  const rootOf = (p) => {
    const n = normalizeAssetPath(p);
    const d = n.match(/^[A-Za-z]:/);
    return d ? d[0] : (n.startsWith('/') ? '/' : '.');
  };
  if (rootOf(fromDir) !== rootOf(toPath)) return normalizeAssetPath(toPath);
  let common = 0;
  while (common < from.length && common < to.length && from[common] === to[common]) common++;
  const ups = from.length - common;
  const parts = [...Array(ups).fill('..'), ...to.slice(common)];
  return parts.length ? parts.join('/') : '.';
}

/**
 * Dependency graph from {asset: [dependency, ...]}. Dependencies load
 * before their dependents.
 */
export function createDependencyGraph(edges = {}) {
  const deps = new Map();
  const dependents = new Map();
  const ensure = (name) => {
    if (!deps.has(name)) deps.set(name, new Set());
    if (!dependents.has(name)) dependents.set(name, new Set());
  };
  for (const [asset, list] of Object.entries(edges)) {
    ensure(asset);
    for (const dep of list) {
      ensure(dep);
      deps.get(asset).add(dep);
      dependents.get(dep).add(asset);
    }
  }
  const sorted = (set) => [...set].sort();
  return {
    assets: () => sorted(deps.keys()),
    dependenciesOf: (asset) => sorted(deps.get(asset) ?? []),
    dependentsOf: (asset) => sorted(dependents.get(asset) ?? []),
    /** Assets referenced as dependencies but never declared with their own
     * edge list -- external leaf inputs (textures, referenced scenes). */
    leafDependencies() {
      return sorted([...deps.keys()].filter(
        (name) => !Object.prototype.hasOwnProperty.call(edges, name)));
    },
    /** Referenced assets absent from the caller's available-assets list. */
    missingDependencies(availableAssets) {
      const available = new Set(availableAssets);
      return sorted([...deps.keys()].filter((name) => !available.has(name)));
    },
    /** One cycle as a path [a, b, ..., a], or null when acyclic. */
    findCycle() {
      const WHITE = 0, GRAY = 1, BLACK = 2;
      const color = new Map([...deps.keys()].map((k) => [k, WHITE]));
      const stack = [];
      let cycle = null;
      const visit = (node) => {
        if (cycle) return;
        color.set(node, GRAY);
        stack.push(node);
        for (const dep of deps.get(node)) {
          if (cycle) return;
          if (color.get(dep) === GRAY) {
            cycle = [...stack.slice(stack.indexOf(dep)), dep];
            return;
          }
          if (color.get(dep) === WHITE) visit(dep);
        }
        stack.pop();
        color.set(node, BLACK);
      };
      for (const name of deps.keys()) {
        if (cycle) break;
        if (color.get(name) === WHITE) visit(name);
      }
      return cycle;
    },
    /** Topological order (dependencies first). Throws on cycles. */
    loadOrder() {
      const cycle = this.findCycle();
      if (cycle) throw new Error(`dependency cycle: ${cycle.join(' -> ')}`);
      const indegree = new Map([...deps.keys()].map((k) => [k, deps.get(k).size]));
      const ready = [...deps.keys()].filter((k) => indegree.get(k) === 0).sort();
      const order = [];
      while (ready.length) {
        const node = ready.shift();
        order.push(node);
        for (const dependent of sorted(dependents.get(node))) {
          indegree.set(dependent, indegree.get(dependent) - 1);
          if (indegree.get(dependent) === 0) {
            // Keep the ready list sorted for deterministic output.
            const at = ready.findIndex((r) => r > dependent);
            if (at < 0) ready.push(dependent); else ready.splice(at, 0, dependent);
          }
        }
      }
      return order;
    },
    /** Everything that (transitively) depends on any of the changed assets. */
    affectedBy(changed) {
      const seen = new Set();
      const queue = [...changed];
      while (queue.length) {
        const node = queue.shift();
        for (const dependent of dependents.get(node) ?? []) {
          if (!seen.has(dependent)) { seen.add(dependent); queue.push(dependent); }
        }
      }
      return sorted(seen);
    },
    /** Transitive dependency closure of a root (excluding the root). */
    closureOf(root) {
      const seen = new Set();
      const queue = [root];
      while (queue.length) {
        const node = queue.shift();
        for (const dep of deps.get(node) ?? []) {
          if (!seen.has(dep)) { seen.add(dep); queue.push(dep); }
        }
      }
      return sorted(seen);
    },
  };
}

/** Package manifest: root + its closure in load order. */
export function packageAssets(graph, root) {
  const closure = new Set([root, ...graph.closureOf(root)]);
  const files = graph.loadOrder().filter((name) => closure.has(name));
  return { root, files, count: files.length };
}

/**
 * Relink missing paths against an index of available files, matching by
 * basename (case-insensitive). Ambiguity is reported, never guessed.
 */
export function relinkAssets(missingPaths, availablePaths) {
  const byBasename = new Map();
  for (const available of availablePaths) {
    const base = normalizeAssetPath(available).split('/').pop().toLowerCase();
    if (!byBasename.has(base)) byBasename.set(base, []);
    byBasename.get(base).push(normalizeAssetPath(available));
  }
  return missingPaths.map((missing) => {
    const normalized = normalizeAssetPath(missing);
    const base = normalized.split('/').pop().toLowerCase();
    const candidates = byBasename.get(base) ?? [];
    if (candidates.length === 1) return { missing: normalized, status: 'relinked', path: candidates[0] };
    if (candidates.length > 1) return { missing: normalized, status: 'ambiguous', candidates: [...candidates].sort() };
    return { missing: normalized, status: 'missing' };
  });
}
