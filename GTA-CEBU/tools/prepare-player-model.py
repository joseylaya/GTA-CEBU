"""Make a browser-sized GLB from the supplied static Meshy character.

Requires ffmpeg. Keeps the source file untouched and writes public/models/player.glb.
"""
import json
import pathlib
import struct
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parents[1]
source = root / '3d-assets/Meshy_AI_Chibi_Figure_0918011739_texture.glb'
target = root / 'public/models/player.glb'
raw = source.read_bytes()
json_size, json_type = struct.unpack_from('<II', raw, 12)
assert json_type == 0x4E4F534A
document = json.loads(raw[20:20 + json_size])
binary_start = 20 + json_size + 8
geometry_end = min(document['bufferViews'][image['bufferView']].get('byteOffset', 0) for image in document['images'])
binary = bytearray(raw[binary_start:binary_start + geometry_end])

with tempfile.TemporaryDirectory() as directory:
    temporary = pathlib.Path(directory)
    for index, image in enumerate(document['images']):
        view = document['bufferViews'][image['bufferView']]
        start = binary_start + view.get('byteOffset', 0)
        original = temporary / f'{index}.source'
        original.write_bytes(raw[start:start + view['byteLength']])
        compressed = temporary / f'{index}.jpg'
        width = 2048 if index == 2 else 1024
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(original), '-vf', f'scale={width}:-2', '-q:v', '3', str(compressed)], check=True)
        image_bytes = compressed.read_bytes()
        view['byteOffset'] = len(binary)
        view['byteLength'] = len(image_bytes)
        binary.extend(image_bytes)
        binary.extend(b'\0' * (-len(binary) % 4))
        image['mimeType'] = 'image/jpeg'

document['buffers'][0]['byteLength'] = len(binary)
json_bytes = json.dumps(document, separators=(',', ':')).encode()
json_bytes += b' ' * (-len(json_bytes) % 4)
target.parent.mkdir(parents=True, exist_ok=True)
target.write_bytes(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(json_bytes) + 8 + len(binary))
                   + struct.pack('<II', len(json_bytes), 0x4E4F534A) + json_bytes
                   + struct.pack('<II', len(binary), 0x004E4942) + binary)
print(f'{source.stat().st_size / 1048576:.1f} MiB → {target.stat().st_size / 1048576:.1f} MiB: {target}')
