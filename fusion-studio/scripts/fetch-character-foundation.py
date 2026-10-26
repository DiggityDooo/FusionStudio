"""Fetch pinned CC0 data only. Does not install or execute MPFB application code."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import urllib.request

REV = '3af0cd5a2ffba072e93a34e5f6f494fdc4813ddf'
REPO = 'makehumancommunity/mpfb2'
ROOT = Path(__file__).resolve().parents[1] / 'assets' / 'character-sources' / 'makehuman'
PREFIX = 'src/mpfb/data/'

def read(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Fusion-Character-Asset-Acquisition'}), timeout=60) as response:
        data = response.read(16 * 1024 * 1024 + 1)
    if len(data) > 16 * 1024 * 1024:
        raise ValueError('Asset exceeds download limit')
    return data

def wanted(p):
    if p in ('LICENSE.md', 'LICENSE.ASSETS.md'):
        return True
    if not p.startswith(PREFIX):
        return False
    name = p[len(PREFIX):]
    if name in ('3dobjs/base.obj', 'mesh_metadata/basemesh_vertex_groups.json',
                'mesh_metadata/hm08.mirror', 'mesh_metadata/hm08_config.json',
                'rigs/standard/rig.game_engine.json', 'rigs/standard/weights.game_engine.json'):
        return True
    # Retain adult macro bases and detailed shape targets. No juvenile bases.
    if name.startswith('targets/') and name.endswith('.target.gz'):
        if any(t in name for t in ('-baby', '-child', '/caucasian', '/african', '/asian')):
            return name.split('/')[-1] in [f'{ancestry}-{sex}-young.target.gz' for ancestry in ('caucasian', 'african', 'asian') for sex in ('female', 'male')]
        return not name.startswith('targets/macrodetails/') or '-young-' in name
    return False

def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    tree = json.loads(read(f'https://api.github.com/repos/{REPO}/git/trees/{REV}?recursive=1'))
    selected = [v for v in tree['tree'] if v['type'] == 'blob' and wanted(v['path'])]
    if not selected or len(selected) > 2000 or sum(v['size'] for v in selected) > 80 * 1024 * 1024:
        raise ValueError('Unexpected asset inventory')
    def fetch(entry):
        upstream = entry['path']
        relative = upstream[len(PREFIX):] if upstream.startswith(PREFIX) else upstream
        dest = ROOT / relative
        data = dest.read_bytes() if dest.exists() else read(f'https://raw.githubusercontent.com/{REPO}/{REV}/{upstream}')
        # Git blob identity binds cached and downloaded bytes to the pinned tree.
        git_hash = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        if len(data) != entry['size'] or git_hash != entry['sha']:
            raise ValueError(f'Asset hash mismatch: {relative}')
        if not dest.exists():
            dest.parent.mkdir(parents=True, exist_ok=True)
            with dest.open('xb') as out:
                out.write(data)
        return {'path': relative, 'upstream': upstream, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'gitBlob': git_hash, 'license': 'CC0-1.0' if upstream.startswith(PREFIX) else 'license-text'}
    records = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        for record in executor.map(fetch, selected):
            records.append(record)
    manifest = {'schema': 1, 'repository': f'https://github.com/{REPO}', 'revision': REV, 'licenseSource': f'https://github.com/{REPO}/blob/{REV}/LICENSE.md', 'files': sorted(records, key=lambda v: v['path'])}
    (ROOT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'files': len(records), 'bytes': sum(v['bytes'] for v in records), 'manifest': str(ROOT / 'manifest.json')}))

if __name__ == '__main__':
    main()
