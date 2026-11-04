# Handover v1 — the whole River Oaks checkout

Purpose: this is the repository-wide handover for any new agent instance on this
machine. It covers **every** current checkout, branch, register task and open item
— not just the CT Club feature. The feature-detailed handover for the club is
[`2026-11-04-ct-club-handover-v1.md`](2026-11-04-ct-club-handover-v1.md), and its
ledger is [`2026-11-04-ct-club.md`](2026-11-04-ct-club.md).

## 1. What this session changed

- **Only the CT Club work was added, and none of it is committed.** `git status
  --short` shows exactly these 8 untracked files, and no tracked-file
  modifications:
  - `preview/src/ct-club-plan.js`, `preview/src/ct-club-interior.js`
  - `preview/tests/ct-club.test.js`
  - `preview/e2e/fixtures/ct-club.html`, `preview/e2e/fixtures/ct-club.js`
  - `docs/ct-club.md`, `docs/superpowers/plans/2026-11-04-ct-club.md` (ledger),
    `docs/superpowers/plans/2026-11-04-ct-club-handover-v1.md` (feature handover),
    and `docs/superpowers/plans/2026-11-04-repo-handover-v1.md` (this document)
- **Live register:** task `ct-club` (active, owner `claude:river-oaks (ct-club)`),
  now owns the branch `feat/ribbonwing-viewer-upstream-20261104`. A stale
  `subterranean-club` entry created earlier in the session was removed under the
  register lock. The register was NOT snapshot-committed (feature PRs must not
  touch `docs/project-management/tasks.json`).

## 2. Checkout layout (read from git, 2026-11-04)

| worktree / branch | HEAD | remote delta | register mapping | flags |
| --- | --- | --- | --- | --- |
| primary `c:\projects\for vals car\river-oaks` on `feat/ribbonwing-viewer-upstream-20261104` | `af24fbbb` (feat(ribbonwing): near detail pass + shut lines, fixtures, D3 evidence) | `origin/...`: ahead +1, behind −6 | task `ct-club` (active) | dirty (8 untracked club files), ignored-data, lease-expired — the next instance must renew the `ct-club` lease |
| `main` | `1a65a1b3` (Add ribbonwing viewer HTML/JS; update session JSONs) | in-sync with `origin/main` | task `primary-reconciliation` (delivered) | blocked: protected-branch + session-release-missing-or-stale + activity-unknown + exact-merged-pr-required, zero-commit |
| `tmp/upstream-check` | `8ac0af80` | ahead +5 of `upstream/main` (BunsDev/river-oaks) | none | orphan-no-task — likely a scratch branch for the upstream reconciliation; inspect before touching |
| detached `wakeful-brow` at `C:\Users\i\.local\share\kilo\worktree-pool\river-oaks-b63ec7cd3a6c\wakeful-brow` | `1a65a1b3` (= main) | — | none | zero-commit, orphan-no-task, clean |

`pnpm run --silent project:inventory` reprints this classification.

## 3. Branch and ownership traps

- The **current feature branch carries two things**: committed ribbonwing work
  (`af24fbbb`) and the uncommitted CT Club work. It is **ahead 1 / behind 6** of
  its remote — update from `origin` before opening/landing any PR (PRs must be up
  to date with `main`; the hosted `preview` check is the merge gate).
- **`main` is protected** and locked to the delivered `primary-reconciliation`
  task; never commit or push to it directly. Land through `pnpm run land <pr>`.
- **Other sessions are actively working on this machine right now** (see the
  ACTIVE list in the appendix). Do not claim, edit, or discard their branches or
  worktrees. Some active entries are snapshots/merge-scratch bookkeeping
  (`cap-*`, `m707-merge-scratch`, `tick-ab-*`, ...) by the depth/tick sessions.
- **Expired leases are not discard permission.** The `ct-club` lease expired; the
  next instance should renew it with `register patch` (see §7 for the quoting
  trap) before continuing.

## 4. CT Club feature state (summary — detail in the ct-club handover)

| Aspect | State |
| --- | --- |
| Room | 40 m × 16 m × 6 m underground techno club; entry, edge-glow/back-glow bar + chai urn, edge-glow couches/chairs/tables, 13×17 m edge-lit LED dancefloor tiles, center disco ball with occasional RGB lasers, 4 rare corner strobes, 4 RGB corner spots, DJ booth + big speaker wall |
| Position | **NOT placed** — `planCtClub({ east, north, yaw })` default `(0,0,0)` is the pending position; await Val's decision; then wire into venue plumbing + a below-grade stair throat (see handover §3) |
| Tests | `node --test preview/tests/ct-club.test.js` → 8/8 pass |
| Build | `pnpm run build` → passed (`✓ built in 1.02s`) |
| Visual | fixture at `/e2e/fixtures/ct-club.html` under `pnpm run dev` (tour keys ←/→ or J/K, `window.clubFixture.sample()`) — the next instance should do the visual pass |

## 5. Test / build state on this checkout

- **Preview suite:** `node --test --test-concurrency=4 preview/tests/*.test.js` →
  5285 tests, 5241 pass, **13 fail, all pre-existing** on this checkout:
  receipt/provenance-pinned tests (`approved-space` digests, `coat-tails`,
  Lyra/Vesper/Silvan/seated skin-correctives, `screening-media` films,
  `fixture-receipt` eyes, published contract/manifest, `studio-garden-office`,
  `space-scene` finish classics, `vegetation` canopy) plus `vite-env-dir`
  (Windows path separators). These read pins over `data/`, `dist/` and generated
  receipts; the session touched zero tracked files, so they fail identically on
  the pristine tree. A run showing MORE than 13, or a failure in
  `ct-club.test.js`, IS a regression.
- **Build:** passes. **Server/desktop/agent suites:** not re-run this session
  (unchanged seams; see `pnpm run verify` for the aggregates).
- `git status --short`, `git worktree list`, `pnpm run --silent project:status
  --github` are the three read-only state commands to run first.

## 6. Live register landscape

- **660 tasks** in `.git/river-oaks-tasks.json`: 471 retired, 102 queued, 50
  active, 21 blocked, 16 delivered. The full ACTIVE/BLOCKED/QUEUED/DELIVERED
  snapshot is generated in §9 below.
- Reading: `pnpm run --silent register show [<id>]` (or `node
  scripts/task-register.mjs show`).
- **Patching has a Windows quoting trap:** the pnpm wrapper strips the double
  quotes of `--json '{...}'`. Reliable pattern:
  ```powershell
  $body = @{ nextAction='…' } | ConvertTo-Json -Compress
  $env:CT_JSON = $body
  node -e "const {spawnSync}=require('node:child_process');const r=spawnSync(process.execPath,['scripts/task-register.mjs','patch','<id>','--json',process.env.CT_JSON],{stdio:'inherit'});process.exit(r.status??1);"
  ```
  (`--create` adds a new task; a task cannot be deleted through the CLI — remove a
  stale entry only under the register lock, e.g. with `withRegisterLock`, and only
  when you created it moments before and it has no PR/evidence.)
- `docs/project-management/tasks.json` is a committed snapshot, refreshed only by
  register sweeps — feature PRs must not change it.

## 7. Agent-workflow essentials (the short version)

Read the full rules: root `AGENTS.md`, `docs/agent-workflow.md`, and
`docs/project-management/workflow.md`.

- Claim your task in the live register before editing; work in your own sibling
  worktree when ownership overlaps; renew your lease during sustained work; an
  expired lease never authorizes discarding another session's work.
- Keep authority on the server; plain JS ESM + Python; no framework migrations
  for local problems. Preserve existing `.env`/`.runtime`/credentials; never read
  or print credential values.
- Verify before committing: focused tests first, then `pnpm run verify` (core);
  `pnpm run verify full` needs an isolated Redis and browser prerequisites. Read
  console counts and `.runtime/agent/<profile>.json`; a skip is not evidence.
- Publish verified increments as drafts when authorized; mark ready and run
  `pnpm run land <pr> --owner <session>` as soon as required local checks and
  review pass and merge authorization exists. Never commit without verification;
  never merge/publish/deploy unless authorized.
- Retirement: `pnpm run project:inventory` / `project:prune --branch <branch>
  --expected-head <full-sha>` (dry-run first). Do not remove a worktree containing
  undelivered edits.
- Do not run competing heavy browser/lock jobs while other sessions are landing;
  respect the local heavy-command/browser queue.

## 8. First steps for the next instance (checklist)

- [ ] `git status --short`, `git worktree list`, `pnpm run --silent project:status --github` — reconcile state, don't assume this doc is current (it is a recorded point-in-time handover)
- [ ] Renew the `ct-club` register lease (owner session id, bounded lease)
- [ ] Do the CT Club visual pass in the fixture and tune if needed (design step, per the ct-club handover)
- [ ] Await Val's position decision → wire CT Club into venue plumbing + stair throat
- [ ] Update the current feature branch from `origin` before any PR (ahead 1 / behind 6)
- [ ] Run `pnpm run verify` (core) before any commit; keep the 13 pre-existing preview-suite failures in mind (they are not yours)
- [ ] Follow the delivery cadence: draft → ready → `pnpm run land <pr> --owner <session>` when authorization exists

---

## 9. Appendix: live register snapshot

> Snapshot generated from `.git/river-oaks-tasks.json` on 2026-11-04 before handoff. The register is volatile (parallel sessions write it), so re-read it before acting: `node scripts/task-register.mjs show`. Counts: 660 tasks — 471 retired, 102 queued, 50 active, 21 blocked, 16 delivered.

### ACTIVE (50) — owned by live sessions, do not disturb

| task | branch | owner |
| --- | --- | --- |
| crime-release-599 | test/crime-release-599-20261024 | claude:river-oaks-3d (c317fd0a) |
| ios-draw-budget-289 | perf/ios-draw-budget-289-20261024 | claude:ios-draw-budget-289 (4c25a886) |
| phase2-review-20261026 | review/phase2-20261026 | claude:river-oaks-75 (97b0b7a7) |
| stack-activation-ready-20261027 | feat/stack-activation-ready-20261027 | claude:river-oaks-91 (a3bcb4) |
| live-dev-5173-20261027 | - | codex:live-dev-5173-20261027 |
| ios-host-prep-286-20261027 | feat/ios-host-prep-286-20261027 | claude:river-oaks-f7 (f4b76c) |
| stack-activation-snapshot-697c4a0d | - | claude:river-oaks-91 (a3bcb4) |
| computer-embed-33-20261027 | - | claude:river-oaks-487 (3cc3bd93) |
| character-wardrobe-20261027 | feat/character-wardrobe-20261027 | claude:river-oaks-32 (4c25a886) |
| land-activate-crime-snapshot-ws-703 | - | claude:river-oaks-ae (6f600af1) |
| land-activate-crime-snapshot-main-18222a6d | - | claude:river-oaks-ae (6f600af1) |
| land-activate-crime-snapshot-abba-18222a6d | - | claude:river-oaks-ae (6f600af1) |
| draft-wave-2-shards-crime-20261028 | docs/draft-wave-2-shards-crime-20261028 | claude:river-oaks-ae (68138fda) |
| draft-wave-2-snapshot-inc5-b7df2c6a | - | claude:river-oaks-ae (68138fda) |
| cultural-promenade-20261028 | feat/cultural-promenade-20261028 | claude:river-oaks-d7 (983b24) |
| pink-jet-age-r2-district-optin | feat/pink-jet-age-r2-district-optin-20261029 | claude:river-oaks-01 (483949) |
| pink-jet-age-r8-hud-skin | feat/pink-jet-age-r8-hud-skin-20261029 | claude:river-oaks-01 (483949) |
| ci-reliability-20261029 | fix/ci-input-frames-20261029 | claude-session-1a8107da |
| snap-722-core-20261030 | - | claude:river-oaks-bb (97524b7a) |
| snap-695-core-20261030 | - | claude:river-oaks-bb (97524b7a) |
| lane-cover-concealment-599-20261030 | feat/lane-cover-concealment-599-20261030 | claude:river-oaks-3d (c317fd0a) |
| render-audit-converge-778-20261030 | fix/render-audit-converge-778-20261030 | claude:render-audit-778 |
| m695-merge-scratch-20261030 | - | claude:river-oaks-bb (4a824f53) |
| tick-ab-a 4557e70d before #655-20261030 | - | claude:river-oaks-bb (4a824f53) |
| tick-ab-b 986977ef current main-20261030 | - | claude:river-oaks-bb (4a824f53) |
| m707-merge-scratch-20261030 | - | claude:river-oaks-bb (4a824f53) |
| d707-parent-scratch-20261030 | - | claude:river-oaks-bb (4a824f53) |
| d707-fixed-scratch-20261030 | - | claude:river-oaks-bb (4a824f53) |
| depth-burndown-venues-20261030 | fix/depth-burndown-venues-20261030 | claude:river-oaks-bb (4a824f53) |
| pink-jet-age-r6-ipic-lounge | feat/pink-jet-age-r6-ipic-lounge-20261030 | claude:river-oaks-01 (483949) |
| depth-tick-ledger-20261030 | docs/depth-and-tick-ledger-20261030 | claude:river-oaks-bb (4a824f53) |
| depth-clone-callbacks-20261030 | fix/depth-clone-shader-callbacks-20261030 | claude:river-oaks-bb (4a824f53) |
| cap-main-snapshot-20261030 | - | claude:river-oaks-bb (4a824f53) |
| cap-fix-snapshot-20261030 | - | claude:river-oaks-bb (4a824f53) |
| cap-pre-snapshot-20261030 | - | claude:river-oaks-bb (4a824f53) |
| depth-burndown-ipic-20261030 | fix/depth-burndown-ipic-20261030 | claude:river-oaks-bb (4a824f53) |
| ribbonwing-autoland-20261030 | fix/ribbonwing-autoland-20261030 | claude:river-oaks-ribbonwing (9b98c1a1) |
| jevica-look-20261030 | feat/jevica-look-20261030 | claude:river-oaks-ribbonwing (9b98c1a1) |
| jevica-blazer-20261030 | feat/jevica-blazer-20261030 | claude:river-oaks-ribbonwing (9b98c1a1) |
| jevica-makeup-20261030 | feat/jevica-makeup-20261030 | claude:river-oaks-ribbonwing (9b98c1a1) |
| jevica-bangs-20261030 | feat/jevica-bangs-20261030 | claude:river-oaks-ribbonwing (9b98c1a1) |
| jevica-lapels-20261030 | feat/jevica-lapels-20261030 | claude:river-oaks-ribbonwing (9b98c1a1) |
| phase3-tree-overlaps-20261030 | fix/phase3-tree-overlaps-20261030 | claude:river-oaks-86 (2421a3) |
| mobile-gamepad-controls-20261030 | feat/mobile-gamepad-controls-20261030 | nova:coven-cave (mobile-gamepad) |
| computer-origin-activation-486-20261030 | - | claude:river-oaks-5c (32a30e) |
| jevica-face-20261030 | feat/jevica-face-20261030 | claude:river-oaks-ribbonwing (9b98c1a1) |
| audit-asar-glob-minimatch-20261031 | fix/audit-asar-glob-minimatch-20261031 | claude:river-oaks-86 (2421a3) |
| docs-plans-review-20261031 | docs/register-sweep-20261031 | claude:river-oaks-48 (198acf2d) |
| docs-review-text-20261031 | docs/docs-review-20261031 | claude:river-oaks-48 (198acf2d) |
| ct-club | feat/ribbonwing-viewer-upstream-20261104 | claude:river-oaks (ct-club) |

### BLOCKED (21) — preserved with owner and blocker; do not discard (age/lease/upstream missing never authorize removal)

| task | branch | owner |
| --- | --- | --- |
| character-studio-441-integration | feat/studio-realistic-441-guide-20261030 | claude:river-oaks-d0 (d13c5d) |
| character-fidelity-517-review | docs/character-fidelity-517-review-20261018 | codex-517-review-20261018 |
| gardens-main-dev-server-20261019 | - | - |
| branch-worktree-consolidation-20261022 | - | codex:branch-worktree-consolidation-20261022 |
| delivery-throughput-20261024 | ops/delivery-throughput-20261024, test/idle-slices-deflake-20261024, ops/sign-branch-20261024, ops/gh-conditional-polling-20261024 | - |
| desktop-diag-runs-370-371-20261024 | diag/desktop-macos-e2e-371-20261024, diag/desktop-macos-e2e-371-b-20261024, diag/desktop-macos-e2e-371-c-20261024, diag/desktop-linux-crash-370-20261024, diag/desktop-linux-crash-370-e2e-20261024, diag/desktop-e2e-settings-drop-371-head-20261026, diag/desktop-e2e-settings-drop-371-forced-b-20261026, diag/desktop-e2e-settings-drop-371-forced-c-20261026 | - |
| landing-steward-20261024 | docs/landing-steward-20261024 | claude:river-oaks-e9 (15dd41cd) |
| garden-campus-510-verify-20261025 | - | - |
| dependabot-sweep-20261026 | dependabot/docker/node-de170b3, dependabot/github_actions/actions-26ac73e11f, dependabot/npm_and_yarn/pnpm-minor-and-patch-1c36ff8eeb, dependabot/uv/python-minor-and-patch-92c512e453, dependabot/npm_and_yarn/electron-45.0.0 | - |
| three-x-on-main-20261026 | docs/three-x-on-main-20261026 | claude:river-oaks-e9 (15dd41cd) |
| three-x-acceptance-snapshots-20261027 | - | claude:river-oaks-e9 (15dd41cd) |
| river-oaks-3e-scratch-wt2 | - | claude:river-oaks-3e (4e851f0b) |
| ipic-screening-webkit-mp4-502-20261028 | fix/screening-webkit-mp4-502-20261028 | - |
| ipic-screening-packets-497-20261028 | docs/ipic-screening-packets-20261028 | - |
| pr716-merge-scratch-20261029 | - | claude:river-oaks-bb (97524b7a) |
| tick-remeasure-snapshot-20261029 | - | claude:river-oaks-bb (97524b7a) |
| ribbonwing-flicker-20261030 | fix/ribbonwing-camera-flicker-20261030 | codex:ribbonwing-flicker |
| depth-review-hardening-20261027 | fix/depth-review-hardening-20261027 | claude:river-oaks-bb (4a824f53) |
| studio-realistic-441-ui-20261030 | feat/studio-realistic-441-ui-20261030 | claude:river-oaks-d0 (d13c5d) |
| studio-realistic-441-captures-20261030 | feat/studio-realistic-441-captures-20261030 | claude:river-oaks-d0 (d13c5d) |
| jevica-knee-20261030 | fix/jevica-knee-20261030 | claude:river-oaks-ribbonwing (9b98c1a1) |

### QUEUED (102) — future work; the first concrete step is recorded in each entry nextAction

`jevica-psyche`, `sdk-phase1`, `world-studio`, `dior-promenade`, `procedural-gallery-vertical-route`, `rider-performance-contact`, `shared-voice-acceptance`, `cancelled-feat-hud-rail-luxe`, `cancelled-hardening-pre-stack`, `cancelled-diag-email-join-20261013`, `cancelled-diag-intro-race-20261013`, `procedural-gallery-ao-sampling`, `shared-dominoes-sheet`, `procedural-gpu-acceptance`, `procedural-interior-human-acceptance`, `penthouse-dev-preview`, `screening-seek-lead`, `studio-acceptance-417-refresh-20261015`, `ipic-final-evidence-20261018`, `novice-trial-441-20261018`, `gitleaks-mpfb-scratch-20261018`, `dev-server-5180-main-20261019`, `email-account-transition`, `world-expansion-gate-587`, `continuous-walk-582`, `world-streaming-582-583`, `neighborhood-584-586`, `unowned-recovery-refs-20261022`, `detached-world-base-build-20261022`, `campus-evidence-507-20261023`, `detached-probe-merge-20261023`, `baseline-inherited-stash-20261023`, `phase2-review-582-583`, `studio-417-closeout-presign-backup-20261023`, `crime-police-598`, `local-preview-refresh-20261024`, `expansion-goal-evidence-20261024`, `road-bricks-20261024`, `proactive-retirement-police-20261024`, `unclaimed-recovery-refs-20261024`, `detached-fidelity-timing-517-20261024`, `detached-streaming-f1-review-20261024`, `detached-two-player-perf-base-20261024`, `campus-flight-511-20261024`, `outdoor-residents-admin-controls-20261024`, `default-appearance-517-base-20261024`, `default-appearance-517-trial-20261024`, `default-appearance-517-verify-20261024`, `walking-obstacle-buckets-20261025`, `convergence-3x-evidence-rc-0b9a97c4`, `convergence-3x-evidence-bisect-15334aad`, `convergence-3x-evidence-heights-8f3c94fd`, `convergence-3x-evidence-studewood-snap`, `convergence-3x-evidence-terraces-snap`, `convergence-3x-evidence-terraces-b5016d29`, `convergence-3x-evidence-diag-0b9a97c4`, `convergence-3x-evidence-ws-rc-0b9a97c4`, `convergence-3x-evidence-ws-main-e8207b2b`, `convergence-3x-evidence-rc-cb83c7cd`, `convergence-3x-evidence-ws2-cb83c7cd`, `convergence-3x-evidence-ws-route-cb83c7cd`, `convergence-3x-evidence-ws-route2-cb83c7cd`, `convergence-3x-evidence-vf-655`, `convergence-3x-evidence-vf2-655`, `readme-screenshots-20261026`, `convergence-3x-evidence-crime-old`, `convergence-3x-evidence-crime-new`, `phase2-review-snapshot-snapshot-20261026`, `phase2-review-snapshot-snapshot-fix-20261026`, `phase2-review-snapshot-snapshot-fix-b-20261026`, `river-oaks-3e-scratch-base-0b9a97c4`, `river-oaks-3e-scratch-base-2da76e1f`, `river-oaks-3e-scratch-base-67203a6a`, `river-oaks-3e-scratch-base-a437cbbf`, `river-oaks-3e-scratch-head-0cc09391`, `river-oaks-3e-scratch-head-3cd60702`, `river-oaks-3e-scratch-head-6e5abdff`, `river-oaks-3e-scratch-main-3df540ee`, `river-oaks-3e-scratch-merge-655-0b9a97c4`, `river-oaks-3e-scratch-review-649`, `phase2-review-snapshot-merged-20261026`, `convergence-3x-evidence-commons-route-f403dc33`, `convergence-3x-evidence-redis-a5857cf4`, `ios-host-decision-286-20261027`, `draft-wave-lander-20261027`, `release-0-2-2`, `release-0-2-2-handoff`, `goal-register-reconcile-20261028`, `register-reconcile-20261028`, `green-wave-lander-20261028`, `orphan-accept-final-15dd41cd`, `orphan-accept-pre-15dd41cd`, `orphan-accept-ws-15dd41cd`, `orphan-main-full-19c1efcc`, `orphan-pr647-19c1efcc`, `orphan-baseline-288-613f8aea`, `orphan-baseline-637-728d6f06`, `orphan-inc2-tree-728d6f06`, `orphan-ws-facing-5ffc40b8-9c88b6de`, `local-expansion-flight-5174-20261028`, `cancelled-feat-onfoot-encounter-640-inc5-20261027`, `character-uniqueness-20261030`

### DELIVERED (16) — merged proof required before any status change

`cartier-pilot`, `primary-reconciliation`, `cafe-publication-pilot-420`, `integrated-expansion-mvp-20261023`, `next-district-586-support-20261024`, `account-safety-292-20261024`, `depth-shader-audit-20261026`, `quaternius-clip-import`, `pr-sweep-lander-20261028`, `landowner-hovercraft-20261028`, `wave-3-steward-20261029`, `shared-required-split-20261029`, `pink-jet-age-r3-architecture`, `land-queue-lock-starvation-20261030`, `default-world-data`, `studio-417-closeout-f0d01729-20261030`

### RETIRED (471) — historical; see the committed snapshot docs/project-management/tasks.json