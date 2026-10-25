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
| 3 | Per-component trial and verdicts | done: run-1 and run-3, independent visual review; roughness accept, pores revise (not shipped), coverage and hairColor reject |
| 4 | Cost, lifecycle and identity | lifecycle done; identity done (local and hosted journeys, rollback journey); cost not established: timing-5 within the bar, timing-6 (deciding run, rule set beforehand) +10.2% CPU at Jevica ×8, timing-3 +10.5% at Jevica ×1; Sable shows no cost; Jevica ×8 pooled paired CPU +8.5% (Decision 3) |
| 5 | Hero and Studio decision, golden candidate | hero uses the same policy; `--check` exit 2 (incompatible: osRelease, osVersion, gpu); candidate recorded and inspected (`e5597125…`); it also carries bodice tiles, which the trial doesn't cause (from `main`'s code or the M5 GPU); a second independent review says don't promote it; golden left for Val (Decision 1) |
| 6 | Costume order fix (independent code review) | done: `b0cdeeeb`, mutation-checked regression |
| 7 | Delivery | draft PR #656 (final head and hosted checks recorded in the PR); landing waits for Val's acceptance |

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
- 20:39Z, first `verify full` (patch 3e7ff114 on f33c914b): every non-browser stage passed:
  - dependency audit: no known vulnerabilities;
  - tooling 240/240; preview 4021 / 1 skip; server with Redis 1155/1155 (0 skips); desktop 115 / 3 skip;
  - build, ruff, format, pytest 156, demo, demo-verify;
  - secret scan and gitleaks history scan (1253 commits): no leaks.

  Stopped while waiting for the browser lock, so that the run would cover the merged head instead.
- 20:41Z: signed commit `99478d8a` (good SSH signature); its pre-commit gitleaks found no leaks.
  Signed merge of origin/main `1fd53fb9` produced `03aa6eef`:
  - no changed file overlaps the branch's files or the bake inputs;
  - lockfile unchanged;
  - all five bake `--check` exit 0; focused 54/54.

  `verify full` restarted on clean `03aa6eef` with the disposable Redis.
- 20:47Z: pushed; draft PR #656 created via REST at `03aa6eef`.
- 21:08Z: hosted CI on `03aa6eef` all green: 22 check runs including the aggregate `preview`.
  Workflow runs 40131416886 and 40131414845 (CodeQL).
  - Job 120983733821, `preview shared (required)`:
    - `character-studio-shared` passed (20:57–21:00Z);
    - `character-studio-tiers` passed (21:00–21:02Z);
    - `default-appearance-tiers` passed (21:02:19–21:03:27Z).
- 22:08Z trial run-3 passed (final policy, patch 3e7ff114, inputs 9fb7504e).
  - All tiers render byte-identical to roughness alone.
  - Skin ΔE ≤0.18; hair and brow IoU ≥0.996.
  - Lifecycle residue zero across all 20 variants.
- 22:34Z timing-3 passed (3×30 s, isolated, host not quiet, load 5–14).
  - Sable within +1.1% at every crowd.
  - Jevica over the bar:
    - x1: frame p95 +10.4%, CPU p95 +10.5%;
    - x8: frame p95 +78% (bimodal 16/33 ms), CPU p95 +7.5%;
    - x24: −7%.
  - GPU unchanged throughout.
  - Load-gated Jevica rerun (timing-4, `--quiet load=10,browsers=0`) queued.
- The character-fidelity and character-studio experience journeys passed on the snapshot.
- 23:4xZ independent code review (subagent given the diff and contract) found a bug.
  - In the world, realism ran before the Jevica costume.
  - Re-tier dispose restored pre-costume materials: hair and brow shaders lost, alphaTest reset.
  - Her skin drew map × 0.58.
  - Other findings: hero golden (Decision), rollback broke the journey (fixed), the Node test always ran in fallback (fixed), `components:null` (fixed), and fixtures default appearanceId to the rig (accepted: representative of the player).
  - Stopped the stale `verify full` on 03aa6eef. Everything through reflections had passed; experience was killed after 16/17 had passed. Receipt kept as full-03aa6eef-stopped.json.
  - Also stopped the chain's remaining shared journeys.
- 00:11Z signed fix b0cdeeeb:
  - `underneath()` in the fidelity runtime, `beneathRealism` on the avatar, the costume wrapped in it;
  - receipts rebaked (digest only), and all five checks pass;
  - focused 56/56 and costume/avatar/studio 71/71;
  - mutation check: without the wrapper the regression fails (skin roughness 0.58 ≠ 1);
  - core verify passed (tooling 277, preview 4099 / 1 skip, server 891 / 225 Redis skips, desktop 115 / 3 skips, build, pytest 170, secrets) at load 41–45.
- Signed merge of main 26d63a06 → 2065b5ef, pushed.
- 00:17Z `verify full` on 2065b5ef (disposable Redis): all non-browser stages passed.
  - dependency audit clean;
  - tooling 277/277; preview 4099 / 1 skip; server with Redis 1158/1158; desktop 115 / 3 skips;
  - build, ruff, format, pytest 170, demo, demo-verify;
  - secrets and history scans: no leaks.
  - Browser stages queued.
- 00:31Z hosted CI on 2065b5ef: all 22 check runs green, including the aggregate `preview` (run 40145724259).
  - `preview shared (required)` job 121026515790 passed:
    - character-studio-shared (00:20–00:23Z);
    - character-studio-tiers (00:23–00:25Z);
    - default-appearance-tiers (00:25:41–00:26:46Z).
- 01:55Z: the quality-transition fixture (`qualityCycles`) accepted only realistic rigs, so the
  named defaults had no tier-cycle receipt. Patch (sha256 `138f73a9…`): the guard also admits an
  appearance with a trial policy, and the baseline script passes 10 cycles (sharp→smooth→auto,
  30 transitions, plus the rendered-transition check at high and standard against a fresh rig).
  Queued (15th) from a snapshot at 2065b5ef + that patch: `node scripts/character-fidelity-baseline.mjs
  --appearances jevica,sable-human --realism off --quality-cycles --repeats 0 --out .runtime/character-fidelity/quality-517`.
- 02:28Z timing-4 passed (exit 0, Jevica only, same inputs `9fb7504e…` as timing-3, isolated, timer 0.005 ms,
  23:36–02:28Z). The `--quiet load=10,browsers=0` gate never held: 0/36 samples quiet; every sample waited its
  300 s and ran anyway, load 5.4–23.8. Holding the lock idle blocked the queue, so river-oaks-71 asked about it;
  the run finished at 18/18 rather than restarting. Median of three, trial vs off:
  x1 frame p95 +3.6%, CPU p95 +3.9%; x8 −13.6% / −8.1%; x24 +8.2% / +9.0%; GPU p50 −1 to +8%.
  Run-to-run noise: the same code and tier measured in timing-3 and timing-4 moves by up to ±12%
  (and −46% for the bimodal x8 frame p95), i.e. more than the 10% bar. Cost is therefore met in timing-4
  and not in timing-3; it is not established on this host (Decision for Val).
- 02:44Z recapture on clean 2065b5ef (inputs `7771b2af…`, `--variants off,trial-high --cycles 3`, three lights)
  passed: all 24 PNGs byte-identical to run-3; zero lifecycle residue. The costume fix doesn't change the
  captured look (the fixture already ran costume before realism).
- 03:21Z quality-tier cycles passed (2065b5ef + patch `138f73a9…`, inputs `b43d139e…`): for each of Jevica
  and Sable, 10 cycles of sharp→smooth→auto with no geometry/texture/program growth, and the rendered
  re-tier at high and standard equal to a fresh rig (max channel 0).
- 03:23–03:30Z on the clean snapshot: experience character-fidelity 9/9 and character-studio 43/43; rollback
  journey (`enabled: false`) 4/4; a separate default-appearance-tiers 18/18. A separate character-studio-tiers
  run failed its first page-ready wait across the host sleep (911 s). The third separate journey was stopped
  as redundant with verify full's shared stage. The ipic-screening runner and a character-studio-tiers rerun
  were queued under `caffeinate -i` at 06:18Z.
- 06:16Z `verify full` on clean 2065b5ef (disposable Redis): every stage passed except the last.
  - dependency audit, tooling, preview, server with Redis, desktop, build, ruff, format, pytest,
    demo, demo-verify, secrets and history scan, security-browser, reflections;
  - experience: 17/17 journeys, 393 checks (player-lifecycle 19, multiplayer-lifecycle 17);
  - shared: 28/28 required journeys, 597 checks (default-appearance-tiers 18,
    character-studio-tiers 64, character-studio-shared 81).
  - `ipic-screening` failed with ETIMEDOUT after 926 s without running: it was still waiting for the
    browser lock. The host had gone into idle sleep at 05:03Z, and the lock holder (this session's
    separate shared run) stalled across the sleep.
  Receipt kept as `.runtime/default-appearance-517/full-2065b5ef.json`; generated
  `data/reports/experience.json` and `shared-experience.json` restored with `git checkout`.
- The disposable Redis was stopped after verify full.
- Hosted CI on `82b51d89` (merge of origin/main `0b9a97c4`): all 22 checks passed, run 40179234053.
  On the clean tree: core verify passed, all five bake `--check` runs passed, focused 88/88.
- 09:53Z on the clean 2065b5ef snapshot, with the host awake:
  `node preview/e2e/ipic-screening-runner.mjs` passed 19/19. This is the stage verify full could not reach.
- 11:37Z on the same snapshot: the character-studio-tiers rerun passed 64/64 checks and 9 measurements.
- 13:24Z timing-5 on the clean PR head `82b51d89` (inputs `956cf7d8…`, `caffeinate -i`, load 2.9–17.2,
  36 samples, all ≤20): every frame and CPU p95 is within +10% for both looks at ×1, ×8 and ×24. The worst
  case is Jevica ×1 at +8.5% frame and +9.1% CPU. Receipt `data/reports/default-appearance-timing-5-517.json`.
- 13:25Z hero `--check` on 82b51d89 exited 2: "Reference environment mismatch: osRelease, osVersion, gpu".
- 13:44Z hero `--record .runtime/character-studio/hero-candidate-517-82b51d89` passed: 3 identical captures,
  `sable-human.png` `e5597125…`. Inspected against the reference: identity, eyes, brows, hair and palette match;
  skin carries the roughness highlights. The bodice shows rectangular shading tiles. The same tiles appear in
  timing-5's off capture, so the trial doesn't cause them. They come from `main`'s outfit changes since
  `d9dca2e5` or from the M5 GPU; every older capture is on the M3 Max, so this host can't tell which.
- 14:14Z timing-6 queued on `7757f387`, with the same code and command as timing-5. The rule was set before
  its result: cost counts as met on the head only if timing-6 also keeps every frame and CPU p95 within +10%;
  otherwise cost is reported as not established.
- 14:20Z second independent review (subagent given the head's off and trial captures, the face grids and the
  hero images, without verdicts):
  - roughness: accept. Skin pixels only, at most 17/255; eyes, irises, hair and outfit byte-identical; no
    seams; tone within 2/255.
  - Nails can't be judged at the captured scale. The shoulder sheen comes close to satiny.
  - Hero candidate: don't promote it as it stands.
- 14:46Z timing-6 finished on 7757f387 (inputs `956cf7d8…`, load 3.4–11.9, all 36 samples ≤20). Jevica ×8 is
  over the bar: frame p95 +10.5%, CPU p95 +10.2%. All three trial samples were slower than all three off
  samples, at lower load. Every other case is within the bar (Jevica ×1 −4.7% CPU, Sable at most +5.1%).
  Under the rule, cost is not established. Pooled over the nine paired samples of timing-3, timing-5 and
  timing-6, CPU medians are Jevica +2.4% / +8.5% / −2.0% (×1 / ×8 / ×24) and Sable 0.0% / +0.2% / +2.0%.
  The census matches off at every crowd size (plus one shared 1.4 MB texture), and the costume edit runs once
  at load, so nothing structural explains a CPU cost. Receipt `data/reports/default-appearance-timing-6-517.json`.
- 14:48–14:56Z core verify on this docs-and-receipt change failed twice in its first stage. One tooling test,
  `land-pr.test.js:122` ("a queued lander wakes on release…"), timed out at 30 s waiting for a file-watch
  wake, at load 3–7.
  - It passes on its own (29/29).
  - It fails the same way in the whole tooling suite on the clean `2065b5ef` snapshot, which passed that
    suite in verify full.
  - The same suite passed on `7757f387` at 13:52Z.

  So the host's file notifications caused it, not this change, and core stopped there. The other core stages
  were then run one by one on the same tree, 14:57–15:01Z, and all passed:
  - preview 4166 / 1 skip, server 917 / 225 Redis skips, desktop 120 / 3 skips;
  - build, ruff check and format, pytest 170, demo, demo-verify (exit 2, as expected) and secrets.

  Logs: `.runtime/default-appearance-517/core-evidence-3*.log` and `core-rest-3.log`.

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
  or pins the golden to `off`. The reference is not changed here. It also predates
  `main`'s outfit changes. The candidate recorded here carries bodice tiles, from
  that code or from the M5 GPU, so promoting it as it stands would make those tiles
  part of the reference.
- Jevica and Sable have no frame-time or census ceilings. Cost is judged against
  realism off at the same revision (at most +10% frame and CPU p95, median of three
  warmed 30 s samples); no budget is added. The host was never quiet (other agents'
  browsers and GPU work). The measurement runs (load ≤20) disagree near the bar:
  - timing-5 on the PR head: worst +9.1%;
  - timing-6 on the PR head: Jevica ×8 +10.5% frame, +10.2% CPU;
  - timing-3 on the pre-merge tree: Jevica ×1 +10.4/+10.5%.

  Cost is not established. Jevica ×8 CPU (pooled paired +8.5%) may be a real cost. It needs a quiet host or a
  physical device, and profiling (Decision for Val).
- Pores need a lip/eyelid/neck mask before they can ship (Decision 2).
- Fixtures that load a rig without an explicit appearance (carriage, vehicles, motion,
  foot-support cost) now take Jevica's roughness map, as the player does.
- Handoff: the parked `river-oaks-human-studio-504` worktree has uncommitted edits to
  `avatars.js` and `character-hero.js`; e9 branches also touch `shared-runner.js`.
  Whoever lands second rebakes the five garment receipts if `avatars.js` changes.

## Next action

Val reviews the per-component table and the five-minute checklist on #656 and answers
the Decisions there: the hero golden (including the bodice tiles), a pore mask
follow-up, and cost, which is not established here: whether to profile Jevica ×8 and run on a quiet host or a
device before landing, or limit the trial to Sable, which shows no cost. Landing is
not this session's to do. The lander (river-oaks-71) lands only after that, with hosted
checks green on the final head. Nothing is left running in this session's queue.
