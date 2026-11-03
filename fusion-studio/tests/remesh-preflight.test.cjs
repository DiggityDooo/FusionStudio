const test = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BLENDER = 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe';
const WORKER = path.join(__dirname, '../scripts/blender_worker.py');
const hashFile = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function cubeGlb(file, size = 2) {
  const h = size / 2;
  const positions = new Float32Array([-h, -h, -h, h, -h, -h, h, h, -h, -h, h, -h, -h, -h, h, h, -h, h, h, h, h, -h, h, h]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0]);
  const bin = Buffer.concat([Buffer.from(positions.buffer), Buffer.from(indices.buffer)]);
  const json = {
    asset: {version: '2.0'}, scene: 0, scenes: [{nodes: [0]}], nodes: [{mesh: 0, name: 'Cube'}],
    meshes: [{primitives: [{attributes: {POSITION: 0}, indices: 1}]}],
    accessors: [
      {bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: [-h, -h, -h], max: [h, h, h]},
      {bufferView: 1, componentType: 5123, count: indices.length, type: 'SCALAR'},
    ],
    bufferViews: [
      {buffer: 0, byteOffset: 0, byteLength: positions.byteLength},
      {buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength},
    ],
    buffers: [{byteLength: bin.length}],
  };
  const jsonBuf = Buffer.from(JSON.stringify(json));
  const pad = (buf, fill) => Buffer.concat([buf, Buffer.alloc((4 - (buf.length % 4)) % 4, fill)]);
  const jsonChunk = pad(jsonBuf, 0x20), binChunk = pad(bin, 0);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
  const jsonHead = Buffer.alloc(8); jsonHead.writeUInt32LE(jsonChunk.length, 0); jsonHead.writeUInt32LE(0x4e4f534a, 4);
  const binHead = Buffer.alloc(8); binHead.writeUInt32LE(binChunk.length, 0); binHead.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(file, Buffer.concat([header, jsonHead, jsonChunk, binHead, binChunk]));
}

function runWorker(work, input, voxel) {
  const spec = {directory: work, output: path.join(work, 'out.glb'), action: 'stack', input, params: {stack: [{id: 'r1', action: 'remesh', enabled: true, params: {voxel}}]}};
  const specFile = path.join(work, 'job.json');
  fs.writeFileSync(specFile, JSON.stringify(spec));
  return spawnSync(BLENDER, ['-b', '--factory-startup', '--disable-autoexec', '--python-exit-code', '1', '-P', WORKER, '--', specFile], {encoding: 'utf8', timeout: 240000, env: require('../electron/core.cjs').isolatedEnv(work), windowsHide: true});
}

test('voxel remesh reports a grid estimate and refuses over-budget grids before running', {skip: !fs.existsSync(BLENDER) && 'Blender 5.2 not installed'}, () => {
  const temp = path.join(__dirname, '../test-output/tmp'); fs.mkdirSync(temp, {recursive: true}); const root = fs.mkdtempSync(path.join(temp, 'fusion-remesh-'));
  const input = path.join(root, 'cube.glb');
  cubeGlb(input);
  const inputHash = hashFile(input);

  const okWork = path.join(root, 'ok'); fs.mkdirSync(okWork);
  const ok = runWorker(okWork, input, 0.5);
  assert.equal(ok.status, 0, (ok.stdout || '').slice(-1500) + (ok.stderr || '').slice(-1000));
  const report = JSON.parse(fs.readFileSync(path.join(okWork, 'result.json'), 'utf8'));
  assert.equal(report.stack[0].estimate.voxelSize, 0.2, 'voxel size clamps to the 0.2 m maximum');
  assert.equal(report.stack[0].estimate.gridCells, 1000, 'a 2 m cube at 0.2 m voxels is a 10x10x10 grid');
  assert.ok(report.polygons > 0 && fs.existsSync(report.output), 'in-budget remesh produces geometry');

  const bigWork = path.join(root, 'big'); fs.mkdirSync(bigWork);
  const big = runWorker(bigWork, input, 0.005);
  const combined = (big.stdout || '') + (big.stderr || '');
  assert.notEqual(big.status, 0, 'over-budget remesh must fail');
  assert.match(combined, /Voxel remesh estimate: 64,000,000 grid cells/);
  assert.ok(!fs.existsSync(path.join(bigWork, 'out.glb')), 'refused remesh writes no output');
  assert.equal(hashFile(input), inputHash, 'the source mesh file is never written');
});
