'use strict';
// Sub-asset packaging path relinking (A26 "Sub-asset packaging and
// texture path relinking"). Pure path math -- no filesystem access:
// normalize, relativize, and rewrite asset paths through prefix rules
// when a project moves machines or directory layouts. Collisions (two
// sources mapping to one target) and unresolved paths are reported,
// never silently overwritten.

/** Normalize to forward slashes, collapsing '.' and '..' segments. */
export function normalizePath(path) {
  const text = String(path);
  const isAbsolute = /^[A-Za-z]:[\\/]/.test(text) || text.startsWith('/') || text.startsWith('\\');
  const drive = /^[A-Za-z]:/.test(text) ? text.slice(0, 2) : '';
  const rest = drive ? text.slice(2) : text;
  const parts = [];
  for (const seg of rest.replace(/\\/g, '/').split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length > 0 && parts[parts.length - 1] !== '..') parts.pop();
      else if (!isAbsolute) parts.push('..');
      continue;
    }
    parts.push(seg);
  }
  const joined = parts.join('/');
  if (drive) return joined ? `${drive}/${joined}` : `${drive}/`;
  return isAbsolute ? `/${joined}` : joined || '.';
}

function segments(path) {
  return normalizePath(path).split('/').filter((s) => s && s !== '.');
}

/** Relative path from a directory to a target (both normalized first). */
export function makeRelative(fromDir, target) {
  const from = segments(fromDir);
  const to = segments(target);
  // Different drives cannot be relativized; keep the absolute target.
  if (/^[A-Za-z]:$/.test(from[0] || '') && from[0] !== to[0]) return normalizePath(target);
  let common = 0;
  while (common < from.length && common < to.length && from[common] === to[common]) common++;
  const ups = from.length - common;
  const rel = [...Array(ups).fill('..'), ...to.slice(common)].join('/');
  return rel || '.';
}

// Drive letters compare case-insensitively; the rest of the path does not.
function compareKey(path) {
  return /^[A-Za-z]:/.test(path) ? path.slice(0, 2).toLowerCase() + path.slice(2) : path;
}

/**
 * Rewrite paths through prefix rules [{from, to}]. The longest
 * matching `from` prefix wins and matches on whole segments only.
 * Returns { results: [{source, target, rule}], unresolved: [paths],
 * collisions: [{target, sources}] }.
 */
export function relinkPaths(paths, rules) {
  const normalizedRules = (rules || [])
    .map((r) => ({ from: normalizePath(r.from), to: normalizePath(r.to) }))
    .sort((a, b) => b.from.length - a.from.length);

  const results = [];
  const unresolved = [];
  const byTarget = new Map();
  for (const raw of paths) {
    const source = normalizePath(raw);
    const sourceKey = compareKey(source);
    const rule = normalizedRules.find((r) => {
      const fromKey = compareKey(r.from);
      return sourceKey === fromKey || sourceKey.startsWith(fromKey + '/');
    });
    if (!rule) {
      unresolved.push(source);
      continue;
    }
    const suffix = source.slice(rule.from.length).replace(/^\//, '');
    const target = suffix ? `${rule.to}/${suffix}` : rule.to;
    results.push({ source, target, rule: rule.from });
    if (!byTarget.has(target)) byTarget.set(target, []);
    byTarget.get(target).push(source);
  }
  const collisions = [...byTarget.entries()]
    .filter(([, sources]) => sources.length > 1)
    .map(([target, sources]) => ({ target, sources }));
  return { results, unresolved, collisions };
}

/**
 * Package plan: rewrite every path under oldRoot to newRoot, then
 * relativize each target against the scene file's directory so the
 * packaged project is portable. Unresolved paths and target
 * collisions are reported alongside.
 */
export function planPackage(paths, { oldRoot, newRoot, sceneDir }) {
  const { results, unresolved, collisions } = relinkPaths(paths, [{ from: oldRoot, to: newRoot }]);
  return {
    results: results.map((r) => ({ ...r, relative: makeRelative(sceneDir, r.target) })),
    unresolved,
    collisions,
  };
}
