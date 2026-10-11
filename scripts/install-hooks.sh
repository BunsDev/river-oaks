#!/bin/sh
set -eu
cd "$(git rev-parse --show-toplevel)"
command -v gitleaks >/dev/null || { echo "Install gitleaks first (brew install gitleaks)." >&2; exit 1; }
exec node scripts/install-project-hooks.mjs
