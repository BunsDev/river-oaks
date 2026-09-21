"""Fetch CC0 vegetation source models with content receipts for local processing."""
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ('tree_small_02', 'shrub_02', 'grass_medium_02')
RAW = ROOT / 'data/raw/landscape'
MAX_BYTES = 128 * 1024 * 1024


def fetch(url):
    with urlopen(Request(url, headers={'User-Agent': 'RiverOaks-preview/0.1'}), timeout=90) as response:
        data = response.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError('Vegetation source exceeds file budget')
    return data


def main():
    receipts = []
    for asset in ASSETS:
        metadata = json.loads(fetch(f'https://api.polyhaven.com/files/{asset}'))
        entry = metadata['gltf']['2k']['gltf']
        files = {f'{asset}.gltf': entry, **entry['include']}
        for filename, item in files.items():
            path = RAW / asset / filename
            if not path.resolve().is_relative_to(RAW.resolve()):
                raise ValueError('Invalid asset path')
            data = path.read_bytes() if path.exists() else fetch(item['url'])
            if hashlib.md5(data).hexdigest() != item['md5']:
                raise ValueError(f'Vegetation source checksum mismatch: {filename}')
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            receipts.append({'asset': asset, 'file': filename, 'source': item['url'],
                             'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data),
                             'license': 'CC0-1.0', 'asset_page': f'https://polyhaven.com/a/{asset}'})
        print(f'{asset}: acquired', flush=True)
    RAW.mkdir(parents=True, exist_ok=True)
    (RAW / 'sources.json').write_text(json.dumps(receipts, indent=2) + '\n')


if __name__ == '__main__':
    main()
