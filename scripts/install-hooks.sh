#!/bin/sh
set -eu
cd "$(git rev-parse --show-toplevel)"
existing=$(git config --get core.hooksPath || true)
if [ -n "$existing" ] && [ "$existing" != ".githooks" ]; then
  echo "Existing core.hooksPath=$existing; integrate the secret guard there before replacing it." >&2
  exit 1
fi
command -v gitleaks >/dev/null || { echo "Install gitleaks first (brew install gitleaks)." >&2; exit 1; }
chmod +x .githooks/pre-commit
git config --local core.hooksPath .githooks
echo "Installed fail-closed staged secret guard in .githooks/pre-commit"
