"""Inventory locked crate declarations and copy their shipped notices for packaging."""
from pathlib import Path
import hashlib, json, shutil, tomllib
root=Path(__file__).resolve().parent.parent
registry=root/'toolchains/cargo/registry/src/index.crates.io-1949cf8c6b5b557f'
output=root/'docs/native-dependencies'
output.mkdir(parents=True,exist_ok=True)
packages=[]
for item in tomllib.loads((root/'native/Cargo.lock').read_text())['package']:
    if 'source' not in item: continue
    key=f"{item['name']}-{item['version']}"
    source=registry/key
    meta=tomllib.loads((source/'Cargo.toml').read_text(encoding='utf-8'))['package']
    notices=[]
    for path in source.iterdir():
        if path.is_file() and path.name.upper().startswith(('LICENSE','COPYING','NOTICE','COPYRIGHT')):
            dest=output/key/path.name
            dest.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(path,dest)
            notices.append({'file':f'{key}/{path.name}','sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    packages.append({'name':item['name'],'version':item['version'],'checksum':item['checksum'],'license':meta.get('license'), 'repository':meta.get('repository'),'notices':notices})
(output/'inventory.json').write_text(json.dumps({'scope':'All locked Rust crates, including build dependencies; not a complete compiler-runtime legal clearance','packages':packages},indent=2),encoding='utf-8')
print(f'Inventoried {len(packages)} locked crates; {sum(not p["notices"] for p in packages)} without root notice files.')
