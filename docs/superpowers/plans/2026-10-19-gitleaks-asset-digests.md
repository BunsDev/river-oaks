# History secret scan: allow SHA-256 digests in character source manifests

## Objective

Every PR's `verify (3.11)` and `verify (3.13)` job started failing at 2026-10-19 00:30Z, in
the history scan `gitleaks git --log-opts=--all --redact --no-banner --ignore-gitleaks-allow`
(`.github/workflows/verify.yml`).

The checkout uses `fetch-depth: 0`, so the scan reads every remote branch. Commit `00a74a7c`
on `feat/character-fidelity-517-20261018` (#517, draft #545) added
`preview/public/assets/characters/realistic-humans.sources.json`. Five of its entries, at lines
1629, 1630, 2314, 2347 and 2362, trip the default `generic-api-key` rule.

They are false positives:
- Each key is an upstream MakeHuman source path naming "keys", such as
  `entities/material/mhmatkeys.py` or `ui/operations/faceops/operators/loadfaceshapekeys.py`.
- Each value is that file's 64-character lowercase-hex SHA-256 digest.
- Shapes were checked with values masked; no value was printed.

A PR's scan reads `.gitleaks.toml` from its merge with main, so the fix has to reach main.
A rerun, or a fix confined to the #517 branch, does not unblock other PRs.

## Change

- **`.gitleaks.toml`:** one global `[[allowlists]]` entry, all conditions together (`AND`):
  - rule: `generic-api-key` only;
  - path: `(?:^|/)preview/public/assets/characters/[^/]+\.sources\.json$`. It is unanchored so
    `check_secrets.py --all`, which scans a temporary copy of the worktree, matches too once
    the manifest lands;
  - secret: exactly `^[0-9a-f]{64}$`.
- **`tests/test_secrets.py`:** four cases, with values assembled from fragments:
  - a digest in a manifest passes the staged scan and the worktree scan;
  - a non-hex value in a manifest is still blocked;
  - the same digest beside a "keys" path outside the manifests is still blocked;
  - the history scan admits a committed manifest digest.

## Evidence (local, gitleaks 8.30.1, the CI version)

- `gitleaks git --log-opts="--remotes=origin" --ignore-gitleaks-allow`: 5 findings, all in
  `00a74a7c`, with main's config. With this config: no leaks found.
- `uv run --no-project --isolated --with pytest python -m pytest tests/test_secrets.py`: 19/19.
- Without the allowlist, the two "digest passes" cases fail, which shows the fixture really
  trips `generic-api-key`. The two narrowness cases pass either way.

## Not changed

- No rule is disabled, `--ignore-gitleaks-allow` stays, and #517's branch is untouched.
- A real 64-hex secret placed in a character sources manifest would no longer be reported.
  That is acceptable for public asset provenance files.

## Next action

Signed commit, push, PR. The landing order belongs to river-oaks-b5, river-oaks-d8 and Val. It
should land before #537 and #528, and once it is on main, rerunning a PR's failed verify picks
it up.
