#!/usr/bin/env python3
"""Fail closed on staged secrets, credential filenames, or unavailable scanners."""

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

CONFIG = Path(__file__).resolve().parents[1] / ".gitleaks.toml"


def git(*args):
    return subprocess.check_output(["git", *args])


def credential_file(name):
    path = Path(name)
    return (
        ((path.name == ".env" or path.name.startswith(".env.")) and path.name != ".env.example")
        or path.suffix.lower() in {".pem", ".key", ".p12", ".pfx", ".jks", ".keystore"}
        or path.name in {"id_rsa", "id_ed25519", "credentials.json", "service-account.json"}
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--staged", action="store_true")
    modes.add_argument(
        "--all", action="store_true", help="Scan tracked and unignored worktree files"
    )
    args = parser.parse_args()
    try:
        raw = (
            git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z")
            if args.staged
            else git("ls-files", "--cached", "--others", "--exclude-standard", "-z")
        )
        names = sorted(set(raw.decode().strip("\0").split("\0")) - {""})
        blocked = [name for name in names if credential_file(name)]
        if blocked:
            print("Blocked credential file(s): " + ", ".join(blocked), file=sys.stderr)
            return 1
        executable = shutil.which("gitleaks")
        if not executable:
            print("Install gitleaks before committing; secret checks fail closed.", file=sys.stderr)
            return 1
        flags = [
            "--redact",
            "--no-banner",
            "--no-color",
            "--ignore-gitleaks-allow",
            "--config",
            str(CONFIG),
        ]
        if args.staged:
            return subprocess.run(
                [executable, "git", "--pre-commit", "--staged", *flags], check=False
            ).returncode
        # Isolate the scan to Git-visible files; never traverse caches or local .env files.
        with tempfile.TemporaryDirectory(prefix="river-oaks-secret-scan-") as directory:
            for name in names:
                source = Path(name)
                if not source.is_file() or source.is_symlink():
                    continue
                target = Path(directory) / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, target)
            return subprocess.run([executable, "dir", directory, *flags], check=False).returncode
    except (OSError, subprocess.CalledProcessError) as exc:
        print(f"Secret scan could not complete: {type(exc).__name__}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
