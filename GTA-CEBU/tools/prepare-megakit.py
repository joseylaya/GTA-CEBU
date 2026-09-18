"""Copy a small, web-sized selection of the CC0 Downtown City MegaKit.

Requires ffmpeg. The original kit remains in 3d-assets/.
"""
import json
import pathlib
import shutil
import subprocess

root = pathlib.Path(__file__).resolve().parents[1]
source = root / '3d-assets/Downtown City MegaKit[Standard]/Exports/glTF (Godot)'
target = root / 'public/models/megakit'
selected = [
    'Prop_Planter_Single', 'Prop_Bollard', 'Prop_ManholeCover', 'Prop_ACUnit',
]
target.mkdir(parents=True, exist_ok=True)
images = set()
for name in selected:
    gltf = source / f'{name}.gltf'
    data = json.loads(gltf.read_text())
    shutil.copy2(gltf, target / gltf.name)
    for buffer in data.get('buffers', []):
        shutil.copy2(source / buffer['uri'], target / buffer['uri'])
    images.update(image['uri'] for image in data.get('images', []))
for name in sorted(images):
    subprocess.run([
        'ffmpeg', '-v', 'error', '-y', '-i', str(source / name),
        '-vf', 'scale=min(1024\\,iw):min(1024\\,ih)',
        '-compression_level', '9', str(target / name),
    ], check=True)
print(f'Prepared {len(selected)} models and {len(images)} shared textures in {target}')
