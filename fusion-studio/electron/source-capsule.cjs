'use strict';
// M1 (main-process twin of src/source-capsule.js): hash original import bytes
// and classify them by content. Keep the two registries in sync.
const fs = require('node:fs');
const crypto = require('node:crypto');

const ADAPTERS = [
  {id: 'blend', extensions: ['.blend'], kind: 'preserved-native', editable: 'working-copy'},
  {id: 'dson', extensions: ['.duf', '.dsf'], kind: 'direct-import', editable: 'subset'},
  {id: 'gltf', extensions: ['.glb', '.gltf'], kind: 'exchange', editable: 'subset'},
  {id: 'mesh-exchange', extensions: ['.obj', '.fbx', '.stl', '.ply'], kind: 'exchange', editable: 'mesh'},
  {id: 'usd', extensions: ['.usd', '.usda', '.usdc', '.usdz'], kind: 'exchange', editable: 'unverified'},
  {id: 'alembic', extensions: ['.abc'], kind: 'exchange', editable: 'unverified'},
  {id: 'zbrush', extensions: ['.zpr', '.ztl'], kind: 'preservation-only', editable: 'none'},
  {id: 'marvelous', extensions: ['.zprj', '.zpac'], kind: 'preservation-only', editable: 'none'},
  {id: 'native-project', extensions: ['.max', '.ma', '.mb', '.c4d', '.hip', '.lxo'], kind: 'preservation-only', editable: 'none'},
];

function adapterForName(name = '') {
  const lower = String(name).toLowerCase();
  return ADAPTERS.find(a => a.extensions.some(ext => lower.endsWith(ext))) || null;
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', chunk => hash.update(chunk)).on('end', () => resolve(hash.digest('hex'))).on('error', reject);
  });
}

async function capsuleForFile(file) {
  const stat = fs.statSync(file);
  const fd = fs.openSync(file, 'r');
  const head = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 16, 0);
  fs.closeSync(fd);
  const text = head.toString('latin1');
  let detected = null;
  if (text.startsWith('BLENDER')) detected = 'blend';
  else if (text.startsWith('glTF')) detected = 'gltf';
  else if (head[0] === 0x1f && head[1] === 0x8b) detected = 'gzip';
  else if (head[0] === 0x50 && head[1] === 0x4b) detected = 'zip';
  else if (text.trimStart().startsWith('{')) detected = 'json';
  const byName = adapterForName(file);
  const adapter = detected === 'blend' ? ADAPTERS[0] : detected === 'gltf' ? ADAPTERS[2] : byName;
  const sha256 = await sha256File(file);
  return {
    schema: 1,
    sourceId: 'src-' + sha256.slice(0, 16),
    originalName: require('node:path').basename(file),
    formatId: adapter?.id || 'unknown',
    detectedFormat: detected,
    adapterId: adapter?.id,
    adapterKind: adapter?.kind || 'preservation-only',
    editable: adapter?.editable || 'none',
    sha256,
    byteLength: stat.size,
    dependencies: [],
    completeness: adapter ? 'complete' : 'opaque',
  };
}

// Export Original: byte-exact copy to a NEW file (never in place), verified by hash.
async function copyOriginal(source, destination) {
  if (!source || !destination || require('node:path').resolve(source) === require('node:path').resolve(destination))
    throw Error('Export Original needs a different destination file.');
  const before = await sha256File(source);
  await fs.promises.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
  const after = await sha256File(destination);
  if (after !== before) { await fs.promises.unlink(destination).catch(() => {}); throw Error('Exported original failed hash verification and was removed.'); }
  return {destination, sha256: after, byteLength: fs.statSync(destination).size};
}

// Attach a DSON import report's dependency inventory + unsupported fields to a capsule.
function withDsonInventory(capsule, dson) {
  if (!capsule || !dson) return capsule;
  const deps = Array.isArray(dson.dependencies) ? dson.dependencies : [];
  if (deps.length) capsule.dependencies = deps.map((d, i) => ({
    id: String(d.path || 'dependency-' + i), originalLocator: String(d.path || ''),
    role: String(d.kind || 'dependency'), status: 'found',
    ...(d.sha256 ? {sha256: d.sha256} : {}), ...(Number.isFinite(d.bytes) ? {byteLength: d.bytes} : {}),
  }));
  if (Array.isArray(dson.unsupported_fields) && dson.unsupported_fields.length)
    capsule.unsupportedFields = dson.unsupported_fields.map(String);
  return capsule;
}

module.exports = {ADAPTERS, adapterForName, capsuleForFile, sha256File, copyOriginal, withDsonInventory};
