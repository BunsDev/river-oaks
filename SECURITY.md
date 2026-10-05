# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub's
[private vulnerability reporting](https://github.com/BunsDev/river-oaks/security/advisories/new)
rather than in a public issue or pull request. Include what you found, how to
reproduce it, and its impact. You should hear back within a week.

In scope: the hosted game at `sim.jev.works`, the server code in this repository
(`server/`, `api/`, `middleware.js`), the desktop app (`desktop/`), and the local
voice and decision bridge (`src/river_oaks/`).

Please don't access other players' accounts or data, degrade the service, or run
automated scans against `sim.jev.works` while testing. Test against a local
server instead (see `docs/multiplayer.md`).

## How secrets are kept out of the repository

- A pre-commit hook (`.githooks/pre-commit`, enabled by `npm install`) runs
  `scripts/check_secrets.py`, which blocks credential files and scans staged
  changes with gitleaks using `.gitleaks.toml`. It fails closed when gitleaks is
  missing.
- `.gitleaks.toml` adds rules for this project's secret types (TypeSafe/Jev,
  ElevenLabs, WorkOS cookie password, Redis URLs with passwords, Vercel KV tokens)
  on top of gitleaks' defaults.
- CI scans the worktree and the full history on every push and pull request.
- GitHub secret scanning and push protection are enabled.

Real credentials belong in local `.env` files (ignored by Git) or the hosting
provider's environment settings, never in commits.
