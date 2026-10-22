# #443 viewer-local graphics tiers keep one replicated identity

Task: `character-tier-identity-443-20261022` · branch
`feat/character-tier-identity-443-20261022` · worktree
`../river-oaks-character-tiers-443` · base `origin/main` a35214f3.

## Objective
#443's ultra-realistic acceptance asks for a "two-player different-tier view of
the same identity" and "malicious asset rejection". The realistic material tiers
live in #517's draft PR #545 (unmerged, conflicting with main, owned by
`codex:character-fidelity-517-20261018`; not taken over here). Its tiers are
viewer-local and driven by the existing graphics governor, so the contract #443
must guarantee is already testable on main: graphics tier is presentation, never
identity. This increment proves that on main's real two-account transport.

## Reconciliation (2026-10-22)
- #464 (persistence, publication, peer rendering, deletion) merged 2026-10-18.
- `character-studio-persistence-20261015` remains blocked on physical-device and
  novice/human acceptance (Val selected iOS and macOS only).
- #545 / `character-fidelity-517-20261018`: draft, `CONFLICTING`, lease expired
  2026-10-19; awaiting maintainer review. Not modified.
- Server contract read: `validateCharacterDefinition` requires exact canonical
  equality; `characterSelectionOperation` requires exactly `{type,revision}`;
  snapshots replicate the full stored definition (`server/world.js` publicPlayer).

## Files owned
- `preview/e2e/character-studio-tiers.js` (new shared journey)
- `preview/e2e/shared-runner.js` (register journey; fresh server before it)
- `docs/character-studio.md` (tier contract section)
- `data/reports/character-studio-tiers-443.json` (journey evidence)
- this ledger

No product source changed: main already satisfies the contract; this adds the
behavioral regression that keeps it true when #545's tiers land.

## Checks and results
- Baseline `RIVER_OAKS_SHARED_JOURNEY=character-studio-shared pnpm run test:shared required`
  passed before changes.
- `RIVER_OAKS_SHARED_REPORT=character-studio-tiers-443.json RIVER_OAKS_SHARED_JOURNEY=character-studio-tiers pnpm run test:shared required`:
  passed, 35 checks, ANGLE Metal (Apple M5 Max), full rendering. Measured: owner
  Sharpest renderScale 1 / AO on; peer Smoothest renderScale 0.75 / AO off. Six
  tampered drafts → 400 each, untampered control → 200 and version +1. Socket
  `quality` field → `invalid_character_selection`, unknown revision →
  `character_revision_missing`, untampered control → ok.
- Screenshots inspected: `output/playwright/character-studio-tiers-smooth-peer.png`
  (peer sees owner in rose), `output/playwright/character-studio-tiers-sharp-owner.png`
  (owner sees peer in midnight). Local only, not committed.
## Results
- `PATH=.venv/bin:$PATH REDIS_URL=redis://127.0.0.1:6491 pnpm run verify` (isolated
  Redis, project Python 3.13; `/usr/bin/python3` 3.9 fails `agent-tests` on
  `tarfile.extractall(filter=)` independent of this change): core passed 11/11,
  2026-10-22T18:26:43Z–18:31:03Z on a35214f3 + this diff. Agent 168/168, preview
  3699 + 1 existing skip, server 986 zero skips, desktop 115 + 3 Windows-only skips,
  Python 145, gitleaks no leaks.
- `RIVER_OAKS_SHARED_REPORT=shared-required-tiers-443.json pnpm run test:shared required`:
  all 12 journeys passed, including character-studio-shared (81 checks) and
  character-studio-tiers (35 checks). Report: `data/reports/shared-required-tiers-443.json`.

## Gaps
- #517 realistic material tiers are not on main; once #545 lands, run this
  journey with a realistic appearance at `low` vs `high` to close the realistic
  half of the criterion.
- Desktop Chromium only; no WebKit, physical device, hosted WorkOS or human
  acceptance.
- Remaining #443 acceptance outside this slice: realistic LOD streaming,
  crowd/device performance, human accessibility and novice usability.

## Next step
See handoff in the task register `nextAction`.
