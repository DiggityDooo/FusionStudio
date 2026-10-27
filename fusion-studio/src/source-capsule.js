// M1: source capsules and the format-adapter registry.
// A capsule is the immutable recovery authority for an original file: its bytes
// are hashed (SHA-256) and dependency completeness is explicit. Preservation is
// NOT editability — adapters declare both separately, and unsupported formats
// are attachable as opaque originals only. See plan.md sections 3-5.

export const CAPSULE_SCHEMA = 1;

// kind: 'preserved-native' | 'direct-import' | 'exchange' | 'preservation-only'
// editable: what Fusion can genuinely edit today, not what the suffix suggests.
export const FORMAT_ADAPTERS = [
  {id: 'blend', version: 1, extensions: ['.blend'], kind: 'preserved-native', editable: 'working-copy', label: 'Blender scene (preserved; edits on a converted working copy)'},
  {id: 'dson', version: 1, extensions: ['.duf', '.dsf'], kind: 'direct-import', editable: 'subset', label: 'DAZ DSON (direct importer; unsupported fields preserved and reported)'},
  {id: 'gltf', version: 1, extensions: ['.glb', '.gltf'], kind: 'exchange', editable: 'subset', label: 'glTF (validated exchange; not a native preservation store)'},
  {id: 'mesh-exchange', version: 1, extensions: ['.obj', '.fbx', '.stl', '.ply'], kind: 'exchange', editable: 'mesh', label: 'Mesh exchange via the Blender worker (feature subset per format)'},
  {id: 'usd', version: 1, extensions: ['.usd', '.usda', '.usdc', '.usdz'], kind: 'exchange', editable: 'unverified', label: 'USD (route present; layer fidelity unverified)'},
  {id: 'alembic', version: 1, extensions: ['.abc'], kind: 'exchange', editable: 'unverified', label: 'Alembic cache (route present; fidelity unverified)'},
  {id: 'zbrush', version: 1, extensions: ['.zpr', '.ztl'], kind: 'preservation-only', editable: 'none', label: 'ZBrush project/tool — preservation only: no verified host/SDK on this machine'},
  {id: 'marvelous', version: 1, extensions: ['.zprj', '.zpac'], kind: 'preservation-only', editable: 'none', label: 'Marvelous Designer project — preserved original; Fusion patterns are an independent model'},
  {id: 'native-project', version: 1, extensions: ['.max', '.ma', '.mb', '.c4d', '.hip', '.lxo'], kind: 'preservation-only', editable: 'none', label: 'Native application project — preservation only until a verified bridge exists'},
];

export function adapterForName(name = '') {
  const lower = String(name).toLowerCase();
  return FORMAT_ADAPTERS.find(a => a.extensions.some(ext => lower.endsWith(ext))) || null;
}

// Identify by content first; the suffix alone is never trusted (plan 3.3 step 1).
export function probeFormat(bytes, name = '') {
  const byName = adapterForName(name);
  if (!bytes || bytes.length < 4) return {adapter: byName, detected: null, confidence: 'name-only'};
  const head = bytes.subarray(0, 16);
  const text = String.fromCharCode(...head);
  let detected = null;
  if (text.startsWith('BLENDER')) detected = 'blend';
  else if (text.startsWith('glTF')) detected = 'gltf';
  else if (head[0] === 0x1f && head[1] === 0x8b) detected = 'gzip'; // compressed DSON or other gzip data
  else if (head[0] === 0x50 && head[1] === 0x4b) detected = 'zip'; // USDZ/ZPAC/other archives: inventory required
  else if (text.trimStart().startsWith('{')) detected = 'json'; // plain DSON candidate
  const adapter = detected === 'blend' ? FORMAT_ADAPTERS[0]
    : detected === 'gltf' ? FORMAT_ADAPTERS[2]
    : byName;
  return {adapter, detected, confidence: detected ? 'header' : 'name-only'};
}

export async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// dependencies: [{id, originalLocator, role, status, sha256?, byteLength?, private?}]
export async function createCapsule({name, bytes, dependencies = [], producer} = {}) {
  if (!name || !bytes) throw Error('A source capsule needs an original name and its bytes.');
  const {adapter, detected} = probeFormat(bytes, name);
  const deps = dependencies.map(d => ({
    id: d.id, originalLocator: d.originalLocator, role: d.role || 'dependency',
    status: d.status, ...(d.sha256 ? {sha256: d.sha256} : {}),
    ...(Number.isFinite(d.byteLength) ? {byteLength: d.byteLength} : {}),
    private: !!d.private,
  }));
  const completeness = deps.some(d => d.status === 'missing' || d.status === 'unreadable') ? 'missing-dependencies'
    : adapter ? 'complete' : 'opaque';
  return {
    schema: CAPSULE_SCHEMA,
    sourceId: `src-${await sha256Hex(bytes).then(h => h.slice(0, 16))}`,
    originalName: name,
    formatId: adapter?.id || 'unknown',
    detectedFormat: detected,
    adapterId: adapter?.id,
    adapterKind: adapter?.kind || 'preservation-only',
    editable: adapter?.editable || 'none',
    sha256: await sha256Hex(bytes),
    byteLength: bytes.length,
    ...(producer ? {producer} : {}),
    dependencies: deps,
    completeness,
  };
}

export async function verifyCapsule(capsule, bytes) {
  if (!capsule || !bytes) return false;
  return bytes.length === capsule.byteLength && (await sha256Hex(bytes)) === capsule.sha256;
}

export function capsuleSummary(capsule) {
  if (!capsule) return 'No source capsule.';
  const preservation = capsule.completeness === 'complete' ? 'Original captured and hash-verified'
    : capsule.completeness === 'missing-dependencies' ? 'Original captured; dependencies missing — not fully preserved'
    : 'Opaque original preserved (contents not understood)';
  const edit = capsule.editable === 'none' ? 'Not editable in Fusion — preservation only'
    : capsule.editable === 'unverified' ? 'Editability unverified'
    : `Editable: ${capsule.editable}`;
  const adapter = FORMAT_ADAPTERS.find(a => a.id === capsule.adapterId);
  const via = adapter ? ` Adapter: ${adapter.id} v${adapter.version} (built-in).` : '';
  return `${preservation}. ${edit}.${via}`;
}
