# Unique player fallback names

Objective: never use Resident as a player name. Val selected automatic unique
fallbacks, preserving ordinary GitHub handles and the existing Jevica admin rule.

Branch/worktree: feat/unique-player-names in river-oaks-unique-names-20261009.
The hardware warning is being delivered through its separate worktree and PR.

Owned: shared resident-names module/tests; memory/Redis auth adapters and auth
regressions; name-guard tests; existing resident-names shared browser journey;
multiplayer naming documentation; this ledger.

Design: use a stable `Visitor #<account ID>` fallback. Account IDs already appear
in public world/profile/contact payloads. Keep the full ID (encoded for display),
not a truncated hash, so distinct accounts cannot share a fallback. The reserved
fallback namespace contains punctuation forbidden in GitHub handles. Rebuild
stored fallback names from their owner ID to repair truncated or copied values.
Treat Resident case/spacing/lookalike variants as invalid display names. No new
name picker, storage, auth bypass, role or permission changes.

Checks:
- [x] Focused red/green regression for banned/empty/unknown and distinct identities.
- [x] Memory and Redis auth, email/GitHub sign-ins, legacy public name guards.
- [x] Existing shared naming browser journey plus core verification.
- [x] Record receipts, skips, limits and next delivery step.

Verification (2026-10-09, base e059ee0 with this patch):
- New unit regressions first failed: Resident was retained and four accounts
  shared one fallback. Both pass with the new rule.
- `npm ci --ignore-scripts --no-audit --no-fund`, `uv sync --locked`,
  `npm run agent:doctor`: passed; `npm run agent:list`: read.
- `REDIS_URL=/tmp/river-oaks-unique-names-20261009.sock node --test preview/tests/resident-names.test.js server/tests/auth.test.js server/tests/redis-auth.test.js server/tests/magic-auth.test.js server/tests/name-guards.test.js`:
  114 passed, zero failures or skips. Redis was an owned ephemeral Unix-socket
  service (no production data or ports), shut down after this run.
- `npm run verify`: core passed, receipt `.runtime/agent/core.json`.
  Agent 17 passed; preview 2510 passed / 1 skipped (existing Vince glass approach
  obstruction); server 277 passed / 103 Redis skips; desktop 9 passed;
  Python 141 passed. Build, lint/format, synthetic pipeline and secret guard
  passed. Synthetic verification's exit 2 is the expected domain result.
  Existing build chunk warning and two Python deprecation warnings remain.
- `RIVER_OAKS_SHARED_JOURNEY=resident-names npm run test:shared -- required`:
  first run failed when the existing helper dereferenced a null snapshot during
  a disconnected interval. The helper now waits for the snapshot. Initial failure
  receipt kept at `output/playwright/unique-names-first-run.json`. Rerun passed;
  receipt `output/playwright/unique-names-shared.json`. Verified cross-client
  roster/nameplates, chat, profiles, contacts, admin protection, distinct fallback
  accounts, Resident replacement, and stability after reload. Only this named
  journey ran. The tracked historical report was restored after saving receipts.
- `git diff --check`: passed. Production patch is the shared name rule plus
  account IDs passed by both auth adapters; remaining changes are tests/docs.

Unverified: live WorkOS/hosted auth, packaged desktop/native, full Redis suite,
all browser journeys, human accessibility. No production migration or writes.
Implementation and scoped verification complete. Val authorized commit, push
and merge on 2026-10-09. Delivery: refresh against current main, review, commit,
push and merge through a checked PR. Pre-commit focused suite: 64 passed / 22
Redis skips (the separate 114-test Redis run above passed without skips).
