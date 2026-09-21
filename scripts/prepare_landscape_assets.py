"""Build bounded tree LODs and pack PBR landscape assets for the browser."""
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/landscape'
OUTPUT = ROOT / 'preview/public/assets/landscape'
CLI = ['npx', '--yes', '@gltf-transform/cli@4.3.0']


def run(*arguments):
    subprocess.run([*CLI, *map(str, arguments)], cwd=ROOT, check=True)


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    welded = RAW / 'tree-welded.glb'
    run('weld', RAW / 'tree_small_02/tree_small_02.gltf', welded)
    models = []
    for level, ratio, error in [('high', 0.05, 0.004), ('mid', 0.012, 0.012), ('low', 0.003, 0.03)]:
        name = f'shade-tree-{level}'
        temporary = RAW / f'{name}.glb'
        run('simplify', welded, temporary, '--ratio', ratio, '--error', error)
        run('webp', temporary, OUTPUT / f'{name}.glb', '--quality', 88)
        models.append((name, 'tree_small_02'))
    for name, source in [('boxwood-source', 'shrub_02'), ('fountain-grass-source', 'grass_medium_02')]:
        run('webp', RAW / source / f'{source}.gltf', OUTPUT / f'{name}.glb', '--quality', 88)
        models.append((name, source))
    receipts = json.loads((RAW / 'sources.json').read_text())
    result = {'license': 'CC0-1.0', 'sources': receipts, 'processing': 'glTF Transform 4.3.0; mesh LODs; 2k PBR maps; WebP quality 88',
              'derivatives': [{'path': f'/assets/landscape/{name}.glb', 'source_asset': source,
                               'sha256': hashlib.sha256((OUTPUT / f'{name}.glb').read_bytes()).hexdigest(),
                               'bytes': (OUTPUT / f'{name}.glb').stat().st_size}
                              for name, source in models]}
    (OUTPUT / 'manifest.json').write_text(json.dumps(result, indent=2) + '\n')


if __name__ == '__main__':
    main()
