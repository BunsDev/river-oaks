#!/usr/bin/env python3
"""Archive a worktree's local files without following links or printing contents."""

import argparse
import hashlib
import json
import os
import shutil
import stat
import tarfile
import tempfile
from pathlib import Path


def digest(path):
    sha = hashlib.sha256()
    with open(path, "rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            sha.update(chunk)
    return sha.hexdigest()


def inventory(root, include_hashes):
    entries = {}
    latest = root.lstat().st_mtime_ns
    for directory, dirs, files in os.walk(root, followlinks=False):
        relative_dir = Path(directory).relative_to(root)
        if relative_dir == Path("."):
            dirs[:] = [name for name in dirs if name != ".git"]
            files = [name for name in files if name != ".git"]
        for name in sorted(dirs + files):
            path = Path(directory) / name
            rel = str(path.relative_to(root))
            info = path.lstat()
            latest = max(latest, info.st_mtime_ns)
            record = {"mode": stat.S_IMODE(info.st_mode), "mtimeNs": info.st_mtime_ns}
            if stat.S_ISLNK(info.st_mode):
                record.update(type="link", target=os.readlink(path))
                if name in dirs:
                    dirs.remove(name)
            elif stat.S_ISDIR(info.st_mode):
                record["type"] = "directory"
            elif stat.S_ISREG(info.st_mode):
                record.update(type="file", size=info.st_size)
                if include_hashes:
                    record["sha256"] = digest(path)
            else:
                raise RuntimeError(f"Special filesystem entry needs review: {rel}")
            entries[rel] = record
    return entries, latest


def comparable(entries):
    return {
        name: {key: value for key, value in item.items() if key != "mtimeNs"}
        for name, item in entries.items()
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["scan", "archive", "verify-source", "verify-prefix"])
    parser.add_argument("--root", required=True)
    parser.add_argument("--directory")
    parser.add_argument("--manifest")
    parser.add_argument("--prefix")
    args = parser.parse_args()
    root = Path(args.root).resolve(strict=True)
    if args.mode == "scan":
        entries, latest = inventory(root, False)
        print(json.dumps({"entries": len(entries), "latestMtimeMs": latest // 1000000}))
        return
    if args.mode == "verify-source":
        expected = json.loads(Path(args.manifest).read_text())["entries"]
        actual, _ = inventory(root, True)
        if actual != expected:
            raise RuntimeError("Worktree files changed since the archive snapshot")
        print(json.dumps({"verified": len(actual)}))
        return
    if args.mode == "verify-prefix":
        prefix = args.prefix
        if not prefix or Path(prefix).is_absolute() or ".." in Path(prefix).parts:
            raise RuntimeError("Invalid prefix")
        expected = json.loads(Path(args.manifest).read_text())["entries"]
        actual, _ = inventory(root, True)
        expected = {
            name: item
            for name, item in expected.items()
            if name == prefix or name.startswith(prefix + "/")
        }
        actual = {
            name: item
            for name, item in actual.items()
            if name == prefix or name.startswith(prefix + "/")
        }
        if any(name not in expected for name in actual):
            raise RuntimeError("New ignored files appeared after the archive snapshot")
        expected_remaining = {name: expected[name] for name in actual}
        if comparable(actual) != comparable(expected_remaining):
            raise RuntimeError("Remaining ignored files changed since the archive snapshot")
        print(json.dumps({"verified": len(actual)}))
        return
    directory = Path(args.directory).resolve(strict=True)
    entries, _ = inventory(root, True)
    archive = directory / "worktree.tar"
    manifest = directory / "worktree-files.json"
    with tarfile.open(archive, "w", dereference=False) as output:
        for name in sorted(entries):
            output.add(root / name, arcname=name, recursive=False)
    os.chmod(archive, 0o600)
    if inventory(root, True)[0] != entries:
        raise RuntimeError("Worktree files changed while archiving")
    restored = Path(tempfile.mkdtemp(prefix="restore-files-", dir=directory))
    try:
        with tarfile.open(archive, "r") as source:
            members = source.getmembers()

            def safe_member(item, _destination):
                name = Path(item.name)
                target = Path(item.linkname) if item.islnk() else None
                if (
                    name.is_absolute()
                    or ".." in name.parts
                    or (target and (target.is_absolute() or ".." in target.parts))
                ):
                    raise RuntimeError("Unexpected archive path or hard link target")
                return item

            source.extractall(
                restored, members=(item for item in members if not item.issym()), filter=safe_member
            )
            # A dependency link can point outside the checkout. Recreate links
            # only after regular files are restored; inventory never follows them.
            for item in members:
                if item.issym():
                    link = restored / item.name
                    link.parent.mkdir(parents=True, exist_ok=True)
                    os.symlink(item.linkname, link)
        actual, _ = inventory(restored, True)
        if comparable(actual) != comparable(entries):
            raise RuntimeError("Restored worktree files do not match source")
    finally:
        shutil.rmtree(restored)
    record = {
        "source": str(root),
        "archive": str(archive),
        "sha256": digest(archive),
        "entries": entries,
        "restore": f"tar -xf '{archive}' -C <new-recovery-directory>",
    }
    manifest.write_text(json.dumps(record, indent=2) + "\n")
    os.chmod(manifest, 0o600)
    print(
        json.dumps(
            {
                "archive": str(archive),
                "manifest": str(manifest),
                "sha256": record["sha256"],
                "entries": len(entries),
            }
        )
    )


if __name__ == "__main__":
    main()
