# Dependabot Python audit correction

Objective: resolve errors in Dependabot #553/#554 and merge both to main.
Owner: codex:dependabot-20261022, task dependabot-553-554-20261022.
Owned paths: uv.lock and this ledger. Checkout: river-oaks-dependabot-553,
branch dependabot/uv/python-minor-and-patch-85f7fb1a01.

Both fresh hosted Verify runs failed the Python dependency audit with
opentelemetry-api 1.45.0 / CVE-2026-114603. GitHub advisory
GHSA-xcq7-p3pf-p88h identifies unbounded tracestate parsing and patched 1.45.1.
Updated that transitive package with `uv lock --upgrade-package
opentelemetry-api==1.45.1`, then regenerated with CI-pinned uv 0.11.3 to retain
lockfile revision 3. Its additional Python-version markers preserve the existing
conditional resolution; no other package versions changed in this correction.

Verification on the #553 candidate:
- Frozen pnpm install and agent:doctor passed.
- `uvx --from uv==0.11.3 uv sync --locked` passed.
- `uv run --locked ruff check .` and `ruff format --check .` passed (476 files).
- `uv run --locked pytest -q`: 145 passed, 66 warnings, 92.39 seconds.
- CI-equivalent frozen all-extras requirements export followed by
  `uvx pip-audit==2.10.1 --no-deps --disable-pip -r <export>` passed with no known
  vulnerabilities. No advisory was suppressed.
- `git diff --check` passed.

Publish signed correction to #553, apply and verify the same correction for
#554, and inspect fresh hosted matrices. Local Python 3.13 evidence does not
substitute for hosted Python 3.11. The integration full run remains separately
tracked in 2026-10-22-dependabot-553-554.md. Both merges remain blocked until all
gates pass and the required external merge guard is available; no merge claim.
