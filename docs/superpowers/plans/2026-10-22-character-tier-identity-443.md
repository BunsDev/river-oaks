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

## Delivery of increment 1
#573 merged as `3bae89fb` (reviewed head `959bb6c5`, tree `b90f40b7`), carrying
the `opentelemetry-api` 1.45.1 audit fix. #545 (#517 realistic tiers) merged as
`1f4aa36d` (reviewed head `e26739cf`, tree `18d8b0ac`) at Val's direction.

## Increment 2: realistic tiers, fault recovery, WebKit, census
Task `realistic-tier-identity-443-20261022`, branch
`feat/realistic-tier-identity-443-20261022`, base `1f4aa36d`.

Changes:
- `remote-players.js` stats gain `realism` (the avatar's `realismReport`);
  `player-avatar.js` gains a `realism` getter and `__riverMultiplayer()` exposes
  `selfRealism`. Read-only diagnostics.
- `character-studio-tiers.js`: Alice wears realistic Morgan, Bob realistic Imani
  (authored colors; realistic looks have no color choices). Each viewer applies
  its own tier to the other's exact revision (Sharpest `high`, Smoothest
  `standard`); re-tiering the peer sends nothing and changes no selection. Peer
  transport faults (missing, stale-catalog, corrupt-asset, foreign-owner) on
  Morgan fall back to the authored base (revision 0) at the peer's `standard`
  tier with skin/cornea/hair upgraded, and recover the exact revision on the same
  connection. The fallback is visually identical to the published look because
  these looks cannot be customized; the checks prove fail-closed validation.
- `shared-runner.js`: `RIVER_OAKS_SHARED_BROWSER=webkit` runs in Playwright
  WebKit; the report records `browser`.

Results (all on `1f4aa36d` + this diff, Apple M5 Max, shared host):
- Chromium `character-studio-tiers`: 64 checks passed
  (`data/reports/character-studio-tiers-realistic-443.json`).
- Chromium `pnpm run test:shared required`: 12/12 journeys, character-studio-shared 81,
  character-studio-tiers 64 (`data/reports/shared-required-realistic-443.json`).
- WebKit (`RIVER_OAKS_SHARED_BROWSER=webkit`, Apple GPU) `character-studio-tiers`:
  64 checks passed (`data/reports/webkit-character-studio-tiers-443.json`).
- WebKit `character-studio-shared`: 81 checks passed (`data/reports/webkit-character-studio-shared-443.json`).
- #517 census (`node scripts/character-fidelity-baseline.mjs --appearances
  morgan-human,imani-human --realism off,low,standard,high --expressions
  --quality-cycles --repeats 0`): all 8 appearance/tier pairs exactly equal to
  `character-fidelity-resource-budgets-517.json` in triangles, draw calls and
  texture bytes, zero GPU residue (`data/reports/character-fidelity-census-443.json`).
- Core gate: every task passed when run individually (agent 177, server 988 with
  Redis zero skips, desktop 115 + 3 Windows-only skips, build, ruff lint/format,
  pytest, demo, demo-verify at its expected exit 2, secrets). `pnpm test` passed
  3752/3754 + 1 skip; the one failure is the office-penthouse "short idle slices"
  timing test under load average ~45, which passed 3/3 in isolation after.
- Screenshots inspected: realistic standard-peer, high-owner and corrupt-asset
  fallback frames (local `output/playwright/`, not committed).

## Gaps
- Frame-time and crowd budgets: #517 records none for desktop and says a shared
  host cannot establish one. Measuring them needs an idle Mac (no other sessions)
  or the paired physical iPhone 16 Pro Max / iOS 27.0.1 Safari per
  `docs/acceptance/character-fidelity-517.md`; Val must run or schedule that.
- `low` tier is reached only by Auto under sustained load; covered by #517 unit
  tests, not by this journey.
- Hosted WorkOS, physical iOS/macOS device touch/VoiceOver, five novice sessions
  and human accessibility review need Val (see register `character-studio-persistence-20261015`).

## Next step
See handoff in the task register `nextAction`.
