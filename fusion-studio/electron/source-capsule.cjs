'use strict';
// M1 (main-process twin of src/source-capsule.js): hash original import bytes
// and classify them by content. Keep the two registries in sync.
const fs = require('node:fs');
const crypto = require('node:crypto');

const ADAPTERS = [
  {id: 'blend', version: 1, extensions: ['.blend'], kind: 'preserved-native', editable: 'working-copy'},
  {id: 'dson', version: 1, extensions: ['.duf', '.dsf'], kind: 'direct-import', editable: 'subset'},
  {id: 'gltf', version: 1, extensions: ['.glb', '.gltf'], kind: 'exchange', editable: 'subset'},
  {id: 'mesh-exchange', version: 1, extensions: ['.obj', '.fbx', '.stl', '.ply'], kind: 'exchange', editable: 'mesh'},
  {id: 'usd', version: 1, extensions: ['.usd', '.usda', '.usdc', '.usdz'], kind: 'exchange', editable: 'unverified'},
  {id: 'alembic', version: 1, extensions: ['.abc'], kind: 'exchange', editable: 'unverified'},
  {id: 'zbrush', version: 1, extensions: ['.zpr', '.ztl'], kind: 'preservation-only', editable: 'none'},
  {id: 'marvelous', version: 1, extensions: ['.zprj', '.zpac'], kind: 'preservation-only', editable: 'none'},
  {id: 'native-project', version: 1, extensions: ['.max', '.ma', '.mb', '.c4d', '.hip', '.lxo'], kind: 'preservation-only', editable: 'none'},
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

// External dependency inventory for text .gltf: buffers and textures referenced
// by URI. Embedded (data:) payloads and binary .glb files have none to resolve.
async function gltfDependencies(file) {
  let doc;
  try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
  if (!doc || typeof doc !== 'object' || !doc.asset) return null;
  const path = require('node:path');
  const dir = path.dirname(file);
  const uris = new Map();
  for (const b of doc.buffers || []) if (b.uri && !String(b.uri).startsWith('data:')) uris.set(String(b.uri), 'buffer');
  for (const im of doc.images || []) if (im.uri && !String(im.uri).startsWith('data:')) uris.set(String(im.uri), 'texture');
  const deps = [];
  for (const [uri, role] of uris) {
    let rel = uri;
    try { rel = decodeURIComponent(uri); } catch { /* keep the raw locator */ }
    const entry = {id: uri, originalLocator: uri, role, status: 'missing'};
    try {
      const resolved = path.resolve(dir, rel);
      entry.sha256 = await sha256File(resolved);
      entry.byteLength = fs.statSync(resolved).size;
      entry.status = 'found';
    } catch { /* stays 'missing': reported, never silently dropped */ }
    deps.push(entry);
  }
  return deps;
}

async function objDependencies(file) {
  const path=require('node:path'),deps=[],seen=new Set();
  const tokens=s=>{const matches=[...s.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)],comment=matches.findIndex(m=>m[3]?.startsWith('#'));return (comment<0?matches:matches.slice(0,comment)).map(m=>m[1]??m[2]??m[3]);};
  const dependency=async(locator,base,role)=>{const resolved=path.resolve(base,locator),key=role+':'+resolved;if(seen.has(key))return;seen.add(key);const item={id:key,originalLocator:locator,role,status:'missing'};try{const stat=fs.statSync(resolved);if(!stat.isFile())throw Error('Not a file');item.sha256=await sha256File(resolved);item.byteLength=stat.size;item.status='found';}catch{}deps.push(item);return item.status==='found'?resolved:null;};
  if(fs.statSync(file).size>64*1024*1024)return [{id:'obj-inventory-limit',originalLocator:file,role:'inventory',status:'unverified'}];
  for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){
    const match=line.match(/^\s*mtllib\s+(.+?)\s*$/i);if(!match)continue;
    const raw=match[1],names=fs.existsSync(path.resolve(path.dirname(file),raw))?[raw]:tokens(raw);
    for(const name of names){const material=await dependency(name,path.dirname(file),'material-library');if(!material||fs.statSync(material).size>8*1024*1024)continue;
      for(const entry of fs.readFileSync(material,'utf8').split(/\r?\n/)){
        const texture=entry.match(/^\s*(?:map_\w+|bump|norm|disp|decal)\s+(.+?)\s*$/i);if(!texture)continue;const values=tokens(texture[1]);let i=0;
        while(values[i]?.startsWith('-')){const option=values[i++];if(['-s','-o','-t'].includes(option)){for(let n=0;n<3&&i<values.length&&Number.isFinite(Number(values[i]));n++)i++;}else i+=option==='-mm'?2:1;}
        const locator=values.slice(i).join(' ');if(locator)await dependency(locator,path.dirname(material),'texture');
      }
    }
  }
  return deps;
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
  const capsule = {
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
  if (adapter?.id === 'gltf') {
    const deps = await gltfDependencies(file);
    if (deps) {
      capsule.dependencies = deps;
      if (deps.some(d => d.status === 'missing')) capsule.completeness = 'missing-dependencies';
    }
  }
  if(require('node:path').extname(file).toLowerCase()==='.obj'){
    capsule.dependencies=await objDependencies(file);
    if(capsule.dependencies.some(d=>d.status==='missing'))capsule.completeness='missing-dependencies';
    else if(capsule.dependencies.some(d=>d.status==='unverified'))capsule.completeness='partial-dependencies';
  }
  return capsule;
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
    role: String(d.kind || 'dependency'), status: d.status === 'missing' ? 'missing' : 'found',
    ...(d.sha256 ? {sha256: d.sha256} : {}), ...(Number.isFinite(d.bytes) ? {byteLength: d.bytes} : {}),
  }));
  if (Array.isArray(dson.unsupported_fields) && dson.unsupported_fields.length)
    capsule.unsupportedFields = dson.unsupported_fields.map(String);
  if(capsule.dependencies.some(d=>d.status==='missing'))capsule.completeness='missing-dependencies';
  return capsule;
}

module.exports = {ADAPTERS, adapterForName, capsuleForFile, sha256File, copyOriginal, withDsonInventory, gltfDependencies, objDependencies};
