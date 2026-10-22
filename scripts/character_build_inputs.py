"""Hash cached build inputs, following consumed MakeHuman asset references."""

import hashlib
from pathlib import Path

REFERENCES = {
    ".mhclo": {"material", "obj_file", "vertexboneweights_file"},
    ".mhmat": {"diffuseTexture", "normalmapTexture"},
}


def collect_inputs(source: Path, paths):
    source = source.resolve()
    result = {}

    def visit(path):
        path = path.resolve()
        if not path.is_relative_to(source):
            raise ValueError(f"Build input escapes source root: {path.name}")
        key = path.relative_to(source).as_posix()
        if key in result:
            return
        data = path.read_bytes()
        result[key] = hashlib.sha256(data).hexdigest()
        if path.suffix in REFERENCES:
            for line in data.decode().splitlines():
                fields = line.split(maxsplit=1)
                if len(fields) == 2 and fields[0] in REFERENCES[path.suffix]:
                    visit(path.parent / fields[1])

    for path in paths:
        visit(path)
    return result
