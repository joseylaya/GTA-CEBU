"""Copy only the Pirate Kit character glTFs used by the browser game."""
import json
import pathlib
import shutil

root = pathlib.Path(__file__).resolve().parents[1]
source = root / '3d-assets/Pirate Kit - Nov 2023/glTF'
target = root / 'public/models/pirates'
names = ['Henry', 'Anne', 'Mako', 'Captain_Barbarossa', 'Sharky']
target.mkdir(parents=True, exist_ok=True)
for name in names:
    path = source / f'Characters_{name}.gltf'
    data = json.loads(path.read_text())
    shutil.copy2(path, target / path.name)
    for item in data.get('buffers', []) + data.get('images', []):
        uri = item.get('uri', '')
        if uri and not uri.startswith('data:'):
            shutil.copy2(source / uri, target / uri)
print(f'Prepared {len(names)} animated characters in {target}')
