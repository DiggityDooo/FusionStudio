"""Convert licensed mesh/target/rig data to Fusion's own bounded data format."""
import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/character-sources/makehuman'
OUTPUT = ROOT / 'public/characters'

def main():
    manifest = json.loads((SOURCE / 'manifest.json').read_text(encoding='utf-8'))
    for record in manifest['files']:
        if hashlib.sha256((SOURCE / record['path']).read_bytes()).hexdigest() != record['sha256']:
            raise ValueError('Changed source asset: ' + record['path'])
    positions, uv, groups = [], [], {}
    group = 'none'
    for line in (SOURCE / '3dobjs/base.obj').read_text(encoding='utf-8').splitlines():
        row = line.split()
        if not row:
            continue
        if row[0] == 'v':
            positions.extend(round(float(v) * .1, 7) for v in row[1:4])
        elif row[0] == 'vt':
            uv.extend(float(v) for v in row[1:3])
        elif row[0] == 'g':
            group = row[1]
        elif row[0] == 'f':
            groups.setdefault(group, []).append([[int(v) - 1 for v in corner.split('/')[:2]] for corner in row[1:]])
    polygons = groups['body']
    triangles, corner_uv, corner_source = [], [], []
    for face in polygons:
        for i in range(1, len(face)-1):
            for vertex, tex in (face[0], face[i], face[i+1]):
                triangles.append(vertex)
                corner_uv.extend(uv[tex*2:tex*2+2])
                corner_source.append(vertex)
    target_dir = SOURCE / 'targets'
    files = {f.relative_to(target_dir).as_posix().removesuffix('.target.gz'): f for f in target_dir.rglob('*.target.gz')}
    controls = []
    # Pairs are data, not application logic. Symmetric and left/right controls
    # remain separately identified rather than guessing name equivalence later.
    used = set()
    for negative, positive in [('decr','incr'),('down','up'),('in','out'),('backward','forward')]:
        for name in sorted(files):
            if not name.endswith('-'+positive) or name[:-len(positive)]+negative not in files:
                continue
            key = name[:-len(positive)-1]
            if key in used or any(t in key for t in ('female-', 'male-', 'macrodetails/')):
                continue
            used.add(key)
            controls.append({'id': key, 'label': key.split('/')[-1].replace('-', ' ').title(), 'category': 'Face' if key.split('/')[0] in ('head','cheek','chin','ears','eyebrows','eyes','forehead','mouth','nose') else 'Body', 'min': -1, 'max': 1, 'default': 0, 'negative': name[:-len(positive)]+negative, 'positive': name})
    macros = [n for n in files if n.startswith('macrodetails/') and n.count('/') == 1 and ('-young.' in n+'.' or '-young-' in n)]
    selected = sorted(set(macros + [c[k] for c in controls for k in ('negative','positive')]))
    targets = {}
    for name in selected:
        values = []
        for line in gzip.decompress(files[name].read_bytes()).decode('utf-8-sig').splitlines():
            row = line.split()
            if not row or row[0].startswith('#'):
                continue
            vertex = int(row[0])
            if vertex < 0 or vertex >= len(positions)//3:
                raise ValueError('Target index outside source mesh')
            values.extend([vertex] + [round(float(v)*.1, 8) for v in row[1:4]])
        targets[name] = values
    rig = json.loads((SOURCE / 'rigs/standard/rig.game_engine.json').read_text())
    bones = []
    for name, record in rig.items():
        cube = record['head']['cube_name']
        indices = sorted({corner[0] for face in groups[cube] for corner in face})
        bones.append({'name': name, 'parent': record['parent'], 'landmarks': indices})
    weights = json.loads((SOURCE / 'rigs/standard/weights.game_engine.json').read_text())['weights']
    by_vertex = [[] for _ in range(len(positions)//3)]
    names = [b['name'] for b in bones]
    for name, values in weights.items():
        for vertex, weight in values:
            if weight > 0:
                by_vertex[vertex].append([names.index(name), weight])
    indices, skin_weights, discarded = [], [], 0
    for values in by_vertex:
        values.sort(key=lambda v: -v[1]);discarded += max(0,len(values)-4)
        top = values[:4] or [[names.index('Root'), 1]]
        total = sum(v[1] for v in top)
        indices.extend([v[0] for v in top] + [0]*(4-len(top)))
        skin_weights.extend([round(v[1]/total, 8) for v in top] + [0]*(4-len(top)))
    mirror = list(range(len(positions)//3))
    for line in (SOURCE / 'mesh_metadata/hm08.mirror').read_text().splitlines():
        row = line.split()
        if row and row[0].isdigit():
            mirror[int(row[0])] = int(row[1])
    landmarks = {name: sorted({corner[0] for face in groups[name] for corner in face}) for name in ('joint-l-eye','joint-r-eye','joint-head','helper-upper-teeth','helper-lower-teeth')}
    source = {'positions': positions, 'triangles': triangles, 'cornerUV': corner_uv, 'cornerSource': corner_source, 'bones': bones, 'skinIndex': indices, 'skinWeight': skin_weights, 'mirror': mirror, 'targets': targets, 'landmarks': landmarks}
    hair = SOURCE.parent / 'hair-guides.json'
    if hair.exists():
        source['hair'] = json.loads(hair.read_text(encoding='utf-8'))
    identity = hashlib.sha256(json.dumps(source, separators=(',',':')).encode()).hexdigest()
    document = {'schema':1, 'family':'makehuman-hm08', 'id':'fusion.makehuman.adult.v1', 'identity':identity, 'license':'CC0-1.0', 'revision':manifest['revision'], 'provenance':manifest, 'controls':controls, 'source':source, 'diagnostics':{'discardedWeightInfluences':discarded,'skinning':'four influences per vertex, renormalized; not exact unlimited-weight parity'}}
    encoded = json.dumps(document, separators=(',',':')).encode()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    versions=OUTPUT/'versions'
    versions.mkdir(exist_ok=True)
    # Keep prior bundled foundations available for recipes saved by those builds.
    for prior in (OUTPUT/'makehuman-v1.json.gz',ROOT/'dist/characters/makehuman-v1.json.gz'):
        if prior.exists():
            raw=prior.read_bytes()
            ident=json.loads(gzip.decompress(raw))['identity']
            saved=versions/(ident+'.json.gz')
            if not saved.exists():saved.write_bytes(raw)
    (OUTPUT / 'makehuman-v1.json.gz').write_bytes(gzip.compress(encoded, compresslevel=9, mtime=0))
    current=versions/(identity+'.json.gz')
    if not current.exists():current.write_bytes((OUTPUT/'makehuman-v1.json.gz').read_bytes())
    (OUTPUT/'foundations.json').write_text(json.dumps({'schema':1,'current':identity,'assets':[{'identity':f.name.removesuffix('.json.gz'),'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in sorted(versions.glob('*.json.gz'))]},indent=2)+'\n',encoding='utf-8')
    (OUTPUT / 'LICENSE.makehuman.CC0.txt').write_bytes((SOURCE / 'LICENSE.ASSETS.md').read_bytes())
    (OUTPUT / 'makehuman-provenance.json').write_text(json.dumps({'schema':1,'identity':identity,'compressedSHA256':hashlib.sha256((OUTPUT/'makehuman-v1.json.gz').read_bytes()).hexdigest(),'manifest':manifest},indent=2)+'\n')
    print(json.dumps({'controls':len(controls),'targets':len(targets),'sourceVertices':len(positions)//3,'bodyTriangles':len(triangles)//3,'jsonBytes':len(encoded),'compressedBytes':(OUTPUT/'makehuman-v1.json.gz').stat().st_size,'identity':identity}))

if __name__ == '__main__':
    main()
