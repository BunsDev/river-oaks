# Main checkout reconciliation

## Objective and ownership

Resolve the uncommitted patch restored onto main at `9551ae9`, verify it, and
deliver it through a reviewed pull request and squash merge. Working branch:
`chore/reconcile-native-diagnostics` in the canonical River Oaks checkout.

Owned files: the nine `.agents/skills/` level-design skills and their metadata,
README level-design entry, `docs/level-design-skills.md`, the historical causeway
review, native diagnostics docs/plan, `docs/unreal.md`, and the seven changed native
diagnostics/pawn/test files. Other linked worktrees and the pre-existing stash
are outside this task and remain preserved.

## Reconciliation decisions

- Preserve both photo-mode and level-design sections from the README stash conflict.
- Retain the repository's npm workflow and original `package-lock.json`; its
  direct dependencies match `package.json`. The standalone pnpm lockfile swap
  would break `npm ci` in the existing CI workflow. Original files and index/worktree
  patches were copied to a temporary recovery directory before editing.
- Replace the obsolete single-player startup instruction in the new level-design
  guide with the current shared-town setup. Preserve historical reports as dated
  evidence, including their unverified scope.
- Independent review found that F8 conflicts with PIE possess/eject and the camera
  guide ignored the effective viewport projection. Use F7 to toggle and F6 to
  select (F9 is Unreal's screenshot shortcut); derive the guide from the local
  player's projection matrix, origin and rotation. Add real-input selection/miss
  checks and 16:9/4:3 MaintainYFOV projection regressions.
- Native Editor startup generated local config, including a scanner finding in
  `DefaultEngine.ini`. Preserve those generated files privately, restore the
  original tracked config and exclude generated `DefaultInput.ini` from delivery.

## Checks and delivery

- [x] `npm ci` passed (0 vulnerabilities); `npm run agent:doctor` and `agent:list` passed.
- [x] `npm run verify` passed all 11 core tasks; Redis cases remain skipped in core.
- [x] `npm run verify -- full` passed all 16 tasks on the reconciled patch over
  `9551ae9`, with a disposable loopback Redis service and all 18 shared journeys.
- [x] Build Unreal Editor/Game Development and Game Shipping; run
  `RiverOaks.Contracts` on the resulting Editor build (25 passed, no skips).
- [x] Independent review rechecked both fixes and found no remaining important issues.
- [x] Whitespace, local documentation links, skill metadata and staged secrets passed;
  README conflict markers are resolved and the source patch was reviewed.
- [ ] Push a pull request, wait for the hosted gates, squash merge, and synchronize main.

Native rendered/human edge-play acceptance, frame-cost profiling, native multiplayer
causality, cooked packaging, live authentication, production deployment and human
accessibility are not established by these automated checks.

## Native regression evidence

UE 5.8.2 (changelist 56702186), macOS. Initial 24 Contracts passed. The new input
regression failed against the original F8/F9 implementation; the camera regression
failed before its projection observer was implemented. After fixes, Editor
Development compiled and all **25 Contracts passed, 0 failed, 0 not run**.
Reports: `/tmp/river-oaks-reconcile-input-red/index.json`,
`/tmp/river-oaks-reconcile-camera-red/index.json`, and
`/tmp/river-oaks-reconcile-contracts-final/index.json`. Unreal's process returned
zero even for failed automation; the JSON test results are authoritative.

Editor, Game Development and Game Shipping commands all ended `Result: Succeeded`:

```sh
UE_ROOT='/Users/Shared/Epic Games/UE_5.8'
"$UE_ROOT/Engine/Build/BatchFiles/Mac/Build.sh" RiverOaksEditor Mac Development -Project="$PWD/unreal/RiverOaks.uproject" -WaitMutex -NoUBA -NoUBALocal -MaxParallelActions=4
"$UE_ROOT/Engine/Build/BatchFiles/Mac/Build.sh" RiverOaks Mac Development -Project="$PWD/unreal/RiverOaks.uproject" -WaitMutex -NoUBA -NoUBALocal -MaxParallelActions=4
"$UE_ROOT/Engine/Build/BatchFiles/Mac/Build.sh" RiverOaks Mac Shipping -Project="$PWD/unreal/RiverOaks.uproject" -WaitMutex -NoUBA -NoUBALocal -MaxParallelActions=4
"$UE_ROOT/Engine/Binaries/Mac/UnrealEditor-Cmd" "$PWD/unreal/RiverOaks.uproject" -unattended -NullRHI -ExecCmds="Automation RunTests RiverOaks.Contracts" -TestExit="Automation Test Queue Empty" -ReportExportPath=/tmp/river-oaks-reconcile-contracts-final -stdout
```

Logs: `/tmp/river-oaks-reconcile-{editor,game,shipping}-build.log` and
`/tmp/river-oaks-reconcile-contracts-final.log`. Shipping binary inspection found
none of the overlay header, penetration diagnosis or timeline header in UTF-8 or
UTF-16. Test configuration and current F7/F6 rendered PIE acceptance were not run.

## Core and full evidence

`npm run verify` passed: 10 agent tests, 650 preview tests, 267 server tests
(101 Redis cases skipped), 9 desktop tests, 139 Python tests, build, lint/format,
offline pipeline and secret scan. The initial attempt's only failure was the
Unreal-generated local config finding; the complete rerun passed after restoring
the original config. Logs: `/tmp/river-oaks-reconcile-core-final.log`.

`npm run verify -- full` passed with **379 server tests and no skips**, 2 security
browser tests, WebGL reflection startup/reload and **18 shared-town journeys**,
plus the other core checks, npm audit (0 vulnerabilities) and full-history secret
scan. The owned Redis process was stopped after the gate. Logs:
`/tmp/river-oaks-reconcile-full.log`; receipts: `.runtime/agent/core.json`,
`.runtime/agent/full.json`, `.runtime/reconcile-shared-experience.json`.
These are local artifacts, not repository assets.

Main advanced to `2161866` through PR #173 during this run. Its seven facade/data
files do not overlap this patch. Integration completed without conflicts and
`npm run verify` passed all 11 tasks again on the combined tree. Log:
`/tmp/river-oaks-reconcile-integrated-core.log`. Native source is unchanged from
the verified Editor/Game builds and 25-contract run. The full local browser run
above predates PR #173's facade/data changes; the hosted preview job must verify
the combined revision before merge.

Next step: push the reviewed, verified integration and wait for hosted checks
(`preview`, `verify (3.11)`, `verify (3.13)` and remaining checks), then squash merge
and synchronize main. PR status provides the subsequent delivery receipt.
