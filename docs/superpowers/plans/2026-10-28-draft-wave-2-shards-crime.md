# Second draft wave, shard fix, Quaternius delivery and Crime Feel increment 5 (goal 2026-10-28)

Owner: `claude:river-oaks-ae (68138fda)`, the successor of `claude:river-oaks-ae (6f600af1)` in the same terminal after Val's `/clear`. Task `draft-wave-2-shards-crime-20261028`. Branch `docs/draft-wave-2-shards-crime-20261028` in `../river-oaks-draft-wave-2-20261028`, from `origin/main` `18222a6d`.

Goal prompt: scratchpad `2026-10-28-draft-wave-2-shards-crime-goal.md` (Val: "run the goal discussed above", 07:40Z, Authority block unedited: landing line active; the yes/no answers for #681, #692, #685, #695/#707 and the #292 stack were not ticked here. Val then asked for the dev server to stay live to show progress).

## Objective

1. `main` healthy and keeping its shards: a shard-content fix for `preview experience (heights)` with a before/after duration table, no timeout lengthened.
2. Draft-wave dispositions. **Owned at 07:40Z by `green-wave-lander-20261028` (river-oaks-ac, lease 20:00Z) with Val's ticks (#681 #692 #685 #691 #720 #717 #711 #714 #718, then #694→#719, #713→#715→#716).** Not touched by this task; message sent 07:48Z.
3. Register reconciliation. **Owned by `register-reconcile-20261028` (river-oaks 393f6bb8, lease 10:30Z).** Not touched by this task beyond its own entries.
4. The Quaternius clip import as a draft PR.
5. Crime Feel increment 5 to first playable in source (after d1's lease, 13:00Z, if d1 is not live).
6. The coordinator idle-tick finding attributed.
7. Decisions for Val.

## Files owned

- `docs/superpowers/plans/2026-10-28-draft-wave-2-shards-crime.md` (this ledger).
- Shard fix (own branch, named below once created): `.github/workflows/verify.yml` experience matrix; `preview/e2e/bayou-heights*.js`.

## Baseline (2026-10-28 07:40Z)

- `origin/main` `18222a6d`; hosted Verify green (run 40598226159, 26/26).
- Register: active 45, blocked 49, queued 40, delivered 21, retired 378. Open PRs 24 (22 drafts, #692 ready, #681 Dependabot). Land queue empty. Host load 10.
- Dev server: Vite on `127.0.0.1:5173` from the primary checkout (PID 6839, started 10-27 14:01 local, not this session's). Val asked for it to stay live to show progress; `main` is fast-forwarded in the primary after each landing that touches the client, and nothing else in the primary is edited.
- Other stewards live at 07:40Z: river-oaks-ac (green wave + #292 stack), river-oaks 393f6bb8 (register reconcile), river-oaks-7c (release 0.2.2 handoff), river-oaks-32 (#692 #685 #691 #694 #719, transcript 07:34Z), river-oaks-487 (#718). Not live by the liveness checks: d1 (last write 10-27 18:26Z, lease 13:00Z), 91 (no write since 10-27 19:52Z, lease 18:00Z), 3e (10-27 16:59Z), phase2 (expired).

## Round 1: main health and the shard fix

Per-shard durations, last 16 `main` push runs (10-27 05:44Z to 22:53Z), job started→completed, from the Actions REST API:

| Hosted job | runs | median min | max min (sha) | timeout | not success |
| --- | --- | --- | --- | --- | --- |
| preview experience (heights) | 16 | 16.2 | 20.3 (94479146) | 20 | cancelled ×3: 94479146, f4dd959a, f3b01149 |
| preview experience (commons) | 16 | 12.4 | 20.3 (7b8bca53) | 20 | cancelled ×1: 7b8bca53 |
| preview shared (worlds-and-creator) | 16 | 10.3 | 18.6 (a4bf5588) | 20 | — |
| preview shared (required) | 16 | 14.0 | 16.1 (f4dd959a) | 20 | — |
| preview experience (woodland) | 16 | 6.0 | 13.3 (d458c927) | 20 | failure ×1 (94479146, real) |
| preview experience (places) | 16 | 11.9 | 13.2 | 30 | — |
| preview unit | 16 | 7.0 | 12.0 | 20 | — |
| preview checks | 16 | 10.4 | 11.8 | 20 | failure ×1 (d70f4d87, real) |
| preview experience (streets) | 16 | 6.3 | 11.2 | 20 | — |
| preview experience (campus) | 16 | 9.3 | 10.8 | 20 | — |
| preview experience (terraces) | 16 | 5.5 | 10.6 | 20 | — |
| preview shared (development) | 16 | 7.5 | 9.1 | 20 | — |
| preview experience (studewood) | 16 | 6.4 | 8.2 | 20 | — |
| preview experience (access) | 16 | 1.6 | 7.5 | 20 | — |
| preview experience (campus-traversal) | 16 | 4.7 | 5.3 | 20 | — |

Step breakdown of the heights job: setup (install, Playwright caches) is under 1 min on every post-#704 run; the journey step itself was 14.2, 16.0, 16, 18, 19 and 19.5 min (the last two cancelled at the 20-min job timeout on f4dd959a and f3b01149, both after #704). The 94479146 and 7b8bca53 cancellations predate #704's apt cache (setup then took ~11 min). So the remaining cause is the `bayou-heights` journey's own length: one journey, two CPU-rendered clients, about 1 km of walking with the home leg walked one client at a time.


**Fix (07:52Z):** `preview/e2e/heights-walk.js` (shared setup and the walk in, not a journey), `bayou-heights.js` (outbound: icehouse game, reconnect, Nineteenth & Yale), `bayou-heights-return.js` (walk in, then home one client at a time, release check), a `heights-return` shard in `verify.yml`, the runner's revision map and the docs line. Every check of the old journey is still made once per hosted run. Branch `ci/heights-shard-split-20261028`, worktree `../river-oaks-heights-shard-split`, task `heights-shard-split-20261028`, signed `44c2af36`, **draft #721** (07:55Z). Per-leg timings on 18222a6d (hosted log, job 122519478838): start→Nineteenth 9.3 min; alice home 6.2 min (walking west, the heavy view, while the owner stands in Heights); owner home 3.2 min. Expected: outbound ≈ 9.5 min, return ≈ 4.5 min in + ≈ 6.5 min home from the footbridge landing.

**Local run (07:51Z to 08:03Z, Chromium on Metal, load 15–24, lock held by the runner):** `bayou-heights` passed, 12 checks, 4.6 min; `bayou-heights-return` passed, 12 checks, 3.8 min; all legs reached, no page errors, Heights resident 12,540,150 bytes under the ceiling in both. Report `data/reports/heights-split-local.json` (untracked). Core verify on `44c2af36` (08:04–08:10Z): passed, node 289/289, preview 4,290/4,291 (1 skip), server 1,048/1,326 (278 skips), desktop 127/132 (5 skips), pytest 170, secrets clean.

**Hosted (run 40653234010 on `44c2af36`, every job green):** `preview experience (heights)` **7.7 min** (was 14–19.5), `(heights-return)` **10.6 min**; the longest preview job is now `preview shared (required)` at 14.8 min (its 16-run max on `main` was 16.1, so 3.9 min of headroom: a follow-up candidate, split its modes, not this PR). `places` 13 of 30. #721 marked ready 08:33Z; `pnpm run land 721` queued 08:36Z behind ac's #681 (river-oaks-ac told, 08:33Z).

## Round 4a: the Quaternius clip import

- Owner `codex:quaternius-phase2-20261027`: lease expired 10-28 00:54Z; the two live `codex` processes run in coven-threads and coven-cave, none in a river-oaks checkout; no Codex transcript for it since 10-27. Taken over 07:56Z under the goal's released-claim rule, recorded in the register.
- All 19 files in `.runtime/quaternius-phase2/49-handoff-manifest.json` matched their SHA-256 and byte counts (0 mismatches). Committed unchanged as signed `2765bc32` on `3df540ee`, rebased onto `main` `18222a6d` as signed `3a3956c3`, pushed, **draft #722** (07:57Z). Phase 1 excluded (#694 open). Core on this head: after the browser lock frees.

## Round 4b: Crime Feel increment 5 (read-only survey, 07:58Z)

- d1's worktree `../river-oaks-onfoot-640-inc5` (branch at `b7df2c6a` = #710's head, no upstream) holds the increment nearly complete: `server/crime-workload.js` with its main-vs-branch table already in `docs/crime.md` (step p95 ≤ 1.4 ms at every tier, snapshot +1.5 KB per tier on the branch, checkpoint unchanged); `preview/tests/combat-timing.test.js` with the 30/60/120 Hz × RTT 0/100/200 ms input-to-pose and contact-alignment table in `docs/crime.md`; `preview/e2e/crime-night.js` (two browsers, south service lane at the latest authored hour 19:00, the visitor strikes with T and evades with U) wired into `shared-runner.js` as an on-demand journey; `pnpm run audit:crime`. The docs section "Two-browser capture in the south service lane" stops mid-sentence: the journey run and capture are what remain, then `verify full` from a snapshot, commit and PR stacked on #710. The combat motion set is procedural (`combat-motion.js`, increment 4), so section 5's clip assets are a later integration of #722's packs, not this increment.
- d1: last transcript write 10-27 18:26Z, files last touched 18:25Z, lease to 13:00Z. Waiting for the lease; nothing touched.

## Round 5: coordinator idle tick

- 07:57Z: one diagnostic subagent started with the brief (two detached snapshots `18222a6d` and `4557e70d`, own Redis, the Codex `crime-redis-audit.js` copied read-only, serialize/commit/publish split, same-world control run with `river-oaks-gardens-3`).

## Results

- 07:45Z: worktree created from `main` `18222a6d`; task claimed; ledger written.
- 07:58Z: lane split agreed with river-oaks-ac (green wave: it lands #720 and #717 under Val's ticks; I start no lander for them) and river-oaks-bd (register reconcile: owner-null rows only; it leaves quaternius-clip-import and crime-release-599 to me).
- 07:51Z: local run `node preview/e2e/experience-runner.js bayou-heights bayou-heights-return` started from `../river-oaks-heights-shard-split` under the browser lock, `caffeinate -s`, load 15, report `data/reports/heights-split-local.json` (untracked, not committed).

## Gaps

## Decisions for Val
