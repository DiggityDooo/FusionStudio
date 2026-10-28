'use strict';
// Plugin registry (A27 "Plugin/add-on ecosystems"): manifest
// validation, host API compatibility, dependency ordering, and
// permission bookkeeping. This kernel deliberately does NOT load or
// execute plugin code -- per the project rule, external plugin
// execution waits for a permission model; this is that model's
// registry half: manifests declare permissions, the host grants or
// denies them, and nothing runs here.

export const KNOWN_PERMISSIONS = [
  'scene:read', 'scene:write', 'mesh:edit', 'render:submit',
  'files:read', 'files:write', 'network:fetch', 'ui:panels',
];

function parseSemver(v) {
  const m = typeof v === 'string' && v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function compareSemver(a, b) {
  const pa = parseSemver(a), pb = parseSemver(b);
  if (!pa || !pb) throw new Error(`plugins: bad semver '${!pa ? a : b}'`);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  return 0;
}

/** Minimal range check: '*', exact, ^, ~, >=, <=, >, < (single clause). */
export function satisfiesRange(version, range) {
  const v = parseSemver(version);
  if (!v) throw new Error(`plugins: bad semver '${version}'`);
  const r = String(range).trim();
  if (r === '*' || r === '') return true;
  const m = r.match(/^(\^|~|>=|<=|>|<)?\s*(\d+)\.(\d+)\.(\d+)$/);
  if (!m) throw new Error(`plugins: unsupported range '${range}'`);
  const op = m[1] || '=';
  const target = [Number(m[2]), Number(m[3]), Number(m[4])];
  const cmp = (() => {
    for (let i = 0; i < 3; i++) if (v[i] !== target[i]) return v[i] < target[i] ? -1 : 1;
    return 0;
  })();
  switch (op) {
    case '=': return cmp === 0;
    case '>': return cmp > 0;
    case '<': return cmp < 0;
    case '>=': return cmp >= 0;
    case '<=': return cmp <= 0;
    case '^': return v[0] === target[0] && cmp >= 0;
    case '~': return v[0] === target[0] && v[1] === target[1] && cmp >= 0;
    default: return false;
  }
}

/**
 * Validate a plugin manifest. Returns { ok, errors } -- never throws on
 * bad manifests, so a UI can list every problem at once.
 * Manifest: { id, name, version, api: {min, max?}, permissions?,
 * dependsOn?: {pluginId: range}, tools?: [names] }
 */
export function validateManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') return { ok: false, errors: ['manifest must be an object'] };
  if (typeof manifest.id !== 'string' || !/^[a-z0-9][a-z0-9.-]*$/.test(manifest.id)) {
    errors.push('id must be lowercase dotted identifier, e.g. com.example.tool');
  }
  if (typeof manifest.name !== 'string' || !manifest.name) errors.push('name is required');
  if (!parseSemver(manifest.version)) errors.push(`version '${manifest.version}' is not semver x.y.z`);
  if (!manifest.api || !parseSemver(manifest.api.min)) errors.push('api.min (semver) is required');
  if (manifest.api && manifest.api.max !== undefined && !parseSemver(manifest.api.max)) {
    errors.push('api.max must be semver when present');
  }
  for (const perm of manifest.permissions || []) {
    if (!KNOWN_PERMISSIONS.includes(perm)) errors.push(`unknown permission '${perm}'`);
  }
  for (const [dep, range] of Object.entries(manifest.dependsOn || {})) {
    try { satisfiesRange('0.0.0', range === '*' ? '*' : range); } catch { errors.push(`dependsOn '${dep}' has unsupported range '${range}'`); }
    if (dep === manifest.id) errors.push('plugin cannot depend on itself');
  }
  if (manifest.tools !== undefined && (!Array.isArray(manifest.tools) || manifest.tools.some((t) => typeof t !== 'string'))) {
    errors.push('tools must be an array of names');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Registry for one host. Enforces API compatibility and dependency
 * order; tracks enable state and granted permissions. Grant policy:
 * 'deny' by default -- register() takes { permissions: 'all' |
 * 'declared-safe' | [list] }; network/files permissions are never in
 * 'declared-safe'.
 */
export function createPluginRegistry({ hostApiVersion } = {}) {
  if (!parseSemver(hostApiVersion)) throw new Error('plugins: hostApiVersion must be semver');
  const plugins = new Map();
  const SAFE = KNOWN_PERMISSIONS.filter((p) => !p.startsWith('network:') && !p.startsWith('files:'));

  function register(manifest, { permissions = 'deny' } = {}) {
    const { ok, errors } = validateManifest(manifest);
    if (!ok) return { ok: false, errors };
    if (plugins.has(manifest.id)) return { ok: false, errors: [`duplicate plugin id '${manifest.id}'`] };
    if (compareSemver(manifest.api.min, hostApiVersion) > 0) {
      return { ok: false, errors: [`requires API >= ${manifest.api.min}, host is ${hostApiVersion}`] };
    }
    if (manifest.api.max && compareSemver(manifest.api.max, hostApiVersion) < 0) {
      return { ok: false, errors: [`requires API <= ${manifest.api.max}, host is ${hostApiVersion}`] };
    }
    const declared = manifest.permissions || [];
    let granted;
    if (permissions === 'all') granted = [...declared];
    else if (permissions === 'declared-safe') granted = declared.filter((p) => SAFE.includes(p));
    else if (Array.isArray(permissions)) granted = declared.filter((p) => permissions.includes(p));
    else granted = [];
    plugins.set(manifest.id, { manifest, enabled: false, granted });
    return { ok: true, errors: [], granted };
  }

  function get(id) {
    const entry = plugins.get(id);
    if (!entry) throw new Error(`plugins: no plugin '${id}'`);
    return entry;
  }

  /** Topological enable order (dependencies first). Throws on cycles/missing deps. */
  function enableOrder() {
    const order = [];
    const state = new Map();
    function visit(id, trail) {
      const s = state.get(id);
      if (s === 'done') return;
      if (s === 'visiting') throw new Error(`plugins: dependency cycle: ${[...trail, id].join(' -> ')}`);
      const entry = plugins.get(id);
      if (!entry) throw new Error(`plugins: missing dependency '${id}'`);
      state.set(id, 'visiting');
      for (const dep of Object.keys(entry.manifest.dependsOn || {})) visit(dep, [...trail, id]);
      state.set(id, 'done');
      order.push(id);
    }
    for (const id of plugins.keys()) visit(id, []);
    return order;
  }

  function setEnabled(id, enabled) {
    const entry = get(id);
    if (enabled) {
      for (const [dep, range] of Object.entries(entry.manifest.dependsOn || {})) {
        const depEntry = plugins.get(dep);
        if (!depEntry) throw new Error(`plugins: '${id}' depends on unregistered '${dep}'`);
        if (!satisfiesRange(depEntry.manifest.version, range)) {
          throw new Error(`plugins: '${id}' needs ${dep} ${range}, have ${depEntry.manifest.version}`);
        }
        if (!depEntry.enabled) throw new Error(`plugins: '${id}' needs '${dep}' enabled first`);
      }
    } else {
      for (const other of plugins.values()) {
        if (other.enabled && Object.keys(other.manifest.dependsOn || {}).includes(id)) {
          throw new Error(`plugins: '${other.manifest.id}' depends on '${id}' and is enabled`);
        }
      }
    }
    entry.enabled = enabled;
    return entry;
  }

  function hasPermission(id, permission) {
    return get(id).granted.includes(permission);
  }

  function list() {
    return [...plugins.values()].map((e) => ({
      id: e.manifest.id, version: e.manifest.version, enabled: e.enabled, granted: [...e.granted],
    }));
  }

  return { register, get, enableOrder, setEnabled, hasPermission, list };
}
