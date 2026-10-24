# #517 bounded default-appearance trial (Jevica and Sable)

Task `default-appearance-517-20261024`, owner `claude:river-oaks-32 (00f3c2bb)`.
Branch `feat/default-appearance-517-20261024` in `../river-oaks-default-appearance-517`,
from `origin/main` f33c914b. Contract: #517 "Approved bounded continuation —
2026-10-24", under Val's #638 handoff. This trial does not close #517's wider
AAA or device criteria.

## Objective

Give the named defaults (owner Jevica, guest Sable on the `jevica` rig) selected
realism material components while keeping their face, body, hair silhouette,
outfit and palette, and the canonical asset bytes and pins. Morgan/Imani tiers stay
unchanged. Cornea shells, iris recolor and the wholesale preset are out of scope.

Candidate components, in #517's wording "skin roughness/pore response and hair
coverage": regional skin roughness map, pore normals, and hair/brow/lash alpha
coverage. Strand recolor is judged separately because it changes Sable's hair map.
Skin-wrap scatter and sheen are outside the approved list. Captures of them are
evidence only and do not ship in the named-default path.

## Files owned

- `preview/src/character-realism.js`, `preview/src/character-fidelity-runtime.js`,
  `preview/src/character-hero.js`, `preview/src/character-portrait.js` (`samples` option)
- new `preview/src/default-appearance-realism.js` (policy and rollback switch)
- `preview/src/avatars.js` gate lines only, and the five rebaked garment receipts
  (only the `avatars.js` input digest changes; morph outputs byte-identical)
- `preview/tests/character-realism.test.js`, `character-fidelity-runtime.test.js`,
  `character-hero.test.js`, `character-portrait.test.js`, new `default-appearance-realism.test.js`
- `preview/e2e/fixtures/character-fidelity.js` (lighting, components, regions, MSAA, duration)
- new `preview/e2e/default-appearance-tiers.js`, registered in `preview/e2e/shared-runner.js`
- `scripts/character-fidelity-baseline.mjs` (`--seconds`, server-side isolation), new
  `server/tests/isolated-fixture.js` and its test, the `browser-fixture.js` plugin line, new
  `scripts/default-appearance-trial.mjs`, `scripts/lib/appearance-regions.mjs` and its test
- `docs/character-fidelity.md`, new `docs/acceptance/default-appearance-517.md`, this ledger

Not owned: `player-avatar.js`, `remote-players.js` and `locomotion-handoff.js`,
which belong to the onfoot #637/#640 session (river-oaks-e9). The realism gate in
`avatars.js` is a garment-bake input (`scripts/lib/bake-provenance.mjs`). Message e9
and run all five `node scripts/bake-*.mjs --check` before and after any edit there.

## Baseline facts (origin/main f33c914b)

- `avatars.js:173` applies realism only to realistic rigs or an explicit `realism`.
  `character-hero.js:20` defaults non-realistic rigs to `off`.
- Every `REALISM_TIERS` entry sets `cornea`, `coverage` and `hairColor`. `low` has
  no pores, scatter or sheen.
- `jevica.glb` sha256 `722b96e2…`, 5,779,116 bytes. Material `young_asian_female`
  matches `SKIN`; `long01` (BLEND) matches `HAIR`. Meshes `eyebrow001`,
  `eyelashes01`, `high-poly` and `long01` match the brow, lash, eye and hair selectors.
- Sable's romance look (`romance-look.js:51-53`) replaces `long01`'s map with a
  256² DataTexture whose alpha is 255 everywhere (base rgb 194,160,133 plus glints).
  Jevica keeps the source hair map. To be checked in pixels: Sable's hair cards
  draw without strand alpha.

## Increments

| # | Increment | Status |
| --- | --- | --- |
| 1 | Baseline capture and inspection, no source change | done (captures complete; exit 1 on HMR console errors only) |
| 2 | Component-selective layer and tests | done; focused 54/54 |
| 3 | Per-component trial and verdicts | run-1 done; verdicts below; run-2 (final policy, hair region) queued |
| 4 | Cost, lifecycle and identity | queued in verify snapshot |
| 5 | Hero and Studio decision, golden candidate | not started |

## Commands and results

(appended as runs complete; each entry has revision, command, exit, counts, load)

- 2026-10-24 19:20Z, working tree on f33c914b: all five `node scripts/bake-*.mjs --check`
  failed on the `avatars.js` input digest only after the gate edit; `--write` changed
  that one line per receipt; all five `--check` then exit 0.
- 19:45–19:51Z, intermediate tree on f33c914b (before the journey and fixture duration
  edits): `PATH=<python3.12>:$PATH pnpm run verify` exit 0. Tooling 240/240; preview 4021
  pass / 1 skip; server 888 pass / 223 skip (Redis and browser cases); desktop 115 pass
  / 3 skip; build, ruff, format, pytest 156, demo, demo-verify, secrets passed. Load 26–43. Rerun required on the final tree.
- 19:52Z, focused: `node --test` over character-realism, character-fidelity-runtime,
  default-appearance-realism, character-hero, character-portrait, appearance-regions and
  character-fidelity-evidence: 47/47.
- Trial snapshot `<scratchpad>/trial-snapshot`: f33c914b plus working patch sha256
  `ed35a2e8…` and the seven new files (task `default-appearance-517-trial-20261024`).
  Queued: `node scripts/default-appearance-trial.mjs --out .runtime/default-appearance-trial/run-1`,
  then `node scripts/character-fidelity-baseline.mjs --appearances jevica,sable-human
  --realism off,high,standard --crowd 1,8,24 --repeats 3 --seconds 30 --out .runtime/character-fidelity/timing-1`.
- 19:54Z, f33c914b baseline (`--appearances jevica,sable-human --realism
  off,low,standard,high --repeats 0`, nice 10): exit 1. All 16 native 4K PNGs, census
  and lifecycle completed with zero residue; the failure is 40 console errors from
  Vite's HMR WebSocket (`ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`). The script
  fulfils the fixture document through `context.route` to add COOP/COEP, so the page
  is outside loopback's address space (as `preview/e2e/multiplayer-lifecycle.js`
  notes). Fix in this branch: `server/tests/isolated-fixture.js` serves the headers
  for `?isolate=1`, and the baseline script navigates there. The trial snapshot's
  chained timing run was blocked with a placeholder file at its `--out` path (it
  would have failed the same way) and requeued from a second snapshot.
- Verify snapshot `<scratchpad>/verify-snapshot`: f33c914b plus working patch sha256
  `2c0cd82e…` and nine new files (task `default-appearance-517-verify-20261024`).
  Queued in order: timing (`--realism off,high,standard --crowd 1,8,24 --repeats 3
  --seconds 30`), `experience-runner.js character-fidelity character-studio`, then
  `shared-runner.js required` for character-studio-shared, character-studio-tiers
  and default-appearance-tiers.
- 20:21Z: the verify snapshot was reset to the final tree (patch sha256 `6fb6cf0e…`,
  policy roughness + pores, hair region fixed) and requeued with trial run-2 first.
- 20:23–20:28Z, final tree: `PATH=<python3.12>:$PATH pnpm run verify` exit 0. Tooling
  240/240; preview 4021 / 1 skip; server 890 / 223 skip; desktop 115 / 3 skip; build,
  ruff, format, pytest 156, demo, demo-verify, secrets passed. Load 17–19 at start.
  Only docs changed during the run.
- 20:31–20:34Z: after the reviewer's pores verdict, the queued chain and the first
  `verify full` (still in core) were stopped. Policy set to roughness only; the
  existing hero test that expected pore normals now asserts the roughness map.
  Focused 54/54; all five bake checks exit 0. Verify snapshot reset (patch sha256
  `3e7ff114…`) and requeued: trial run-3, timing (`--realism off,high`; the three
  tiers apply the same material now), the two experience and three shared journeys.
  `verify full` restarted with `REDIS_URL` on a disposable local `redis-server`
  (no persistence, data in the scratchpad).

## Verdicts (trial run-1, 20:17Z)

Ranges over daylight/dusk/interior and full/close-up views, each vs realism off.

| Component | Jevica | Sable | Verdict |
| --- | --- | --- | --- |
| roughness | skin ΔE 0.04–0.08, overlap 1.000; gloss on lips and nose tip only | skin ΔE 0.05–0.18 | accept |
| pores | skin ΔE ≤0.05; specks 3–5 px apart at ~5.1 px/mm (0.6–1 mm); uniform, so pebbled lips, rough eyelids, stucco neck at high | same | revise, not shipped |
| coverage | brows+lashes area ×1.73–2.6, IoU 0.40–0.54; no MSAA ×1.82–2.89 | same, brow ΔE up to 12.3 | reject: thicker, reshaped brows |
| hairColor | no change (keeps source map) | hair turns cream with mint streaks; hairline seam | reject |

Policy: roughness only for both. The independent reviewer (subagent given the
captures and contract, not these verdicts) agreed on roughness, coverage and
hairColor, and judged pores "revise": mask the lips, weaken on eyelids, neck and
body, cap near standard. A mask is new data, so pores is not shipped (20:35Z).
`full-high` (evidence) moves skin ΔE to 8.8–9.5 under dusk, confirming
scatter/sheen stay out. Run-1's hair region was empty (selector matched mesh
names; hair is matched by material `long01`), fixed for run-2.

## Gaps

- No physical device. Captures come from this host's Chromium only.
- Hero goldens were recorded on an M3 Max; this host is an M5 Max.
- The reviewed `sable-human` hero golden is captured through `createCharacterHero`
  with no realism argument. With the trial on, that path takes Sable's trial
  components, so the pinned check is expected to fail until Val promotes a candidate
  or pins the golden to `off`. The reference is not changed here.
- Jevica and Sable have no frame-time or census ceilings. Cost is judged against
  realism off at the same revision (at most +10% frame and CPU p95, median of three
  warmed 30 s samples); no budget is added.

## Next action

Run the realism-off/low/standard/high baseline for jevica and sable-human, inspect
the PNGs, and record what they show.
