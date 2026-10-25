# Support for the next connected district (#586, step 3 of #638)

## Objective

Help the next-district lane reach its finish line without duplicating it. River-oaks-91 already owned the lane (`next-district-586-20261024`, draft #649, Bayou Heights, revision `bayou-heights-1`) when this session started. So, under the goal's stop rule ("an owner appears") and AGENTS.md, this session took the support pieces agreed with that owner on 2026-10-24 at about 19:20Z:

- **A.** Which budget protocol is in force.
- **B.** Resident routing into the new land.
- **C.** Adversarial review and a rollback rehearsal.
- **D.** Paired District performance and production cold transfer.

This session also delivered Val's separate request of 2026-10-24, "let residents walk anywhere in the district".

## Ownership

- **Task:** `next-district-586-support-20261024`, owner `claude:river-oaks-3e (4e851f0b)`.
- **Branches:** `feat/resident-locations-20261024` (#655) and `feat/resident-heights-20261025` (#670, this file).
- **#649:** never edited. All checks on it ran in detached scratch checkouts at its exact heads.
- **Receipts:** the paths below are in the session scratchpad, `/private/tmp/claude-501/-Users-buns-Documents-GitHub-BunsDev-river-oaks/4e851f0b-3430-4fbb-8f1a-e13c23488709/scratchpad/`. Each is cited with its sha256 prefix.

## PRs

| PR | Head | CI | What it is |
| --- | --- | --- | --- |
| #655 | `fea24bed83fa72715f5c86c7e95f85259866e304` | Hosted 22/22, CodeQL included. `verify full` 18/18 on `03381365` (its merge of main `0b9a97c4`). | Residents walk anywhere in town, the Commons included (Val's request). Ledger `2026-10-24-resident-locations.md`. Main has since moved to `e8207b2b` (#658, no overlap; merges cleanly). |
| #670 | `10594bef696e659b233fa8952acb759656f8b234` | Hosted 15/15 at each of `ff46d99e`, `2143595e`, `a6c1766b` and `10594bef`. Core verify passed at `59617b59`. | Piece B: residents walk on into Bayou Heights. Ledger `2026-10-25-resident-heights.md`. Lands after #649. |
| #649 (river-oaks-91) | `95904d23fc29f7af502053e001cd9c70736c955b` (product `525856e2`) | Owner's record | The district itself. Its ledger records finish-line items 1–6 complete. Pieces C and D below are this session's evidence on it. |

## Piece A: budget protocol

- D11 ("adopt #626") is recorded only on #643's branch (`docs/superpowers/plans/2026-10-24-mvp-release-readiness.md`). `docs/world-expansion.md` and `docs/acceptance/two-player-perf-20261023.md` on main still call #626 a proposal.
- Not confirmable here, so both readings are reported for round 4, with limits unamended.
- **Paired #626 reading** (A1 B1 B2 A2, baseline-compare of the A runs against the B runs): within on every gated metric.
- **Single matched-pair reading** (A1 against B1 and A2 against B2):
  - frame p95 changes 0.0 to ±0.6 %;
  - CPU-submission p95 −3.7 % to +1.1 %;
  - reconnect −8.0 % to +7.4 % (limit +20 %);
  - drift 0 m.
  - Receipts: `compare-single-h-a1-h-b1.json` and `compare-single-h-a2-h-b2.json`.

## Piece D: District budgets and cold transfer for #649

Method:
- **Command:** `preview/audit/world-expansion-baseline.js` with harness defaults, then `preview/audit/baseline-compare.js`.
- **Samples:** three warmed 30 s samples per workload (5 s warm-up), vsync on, quality `sharp`.
- **Workloads:** desktop 1440×1000 and a phone-sized 390×844 viewport, with one and two clients. The camera is the District spawn view, fov 55.
- **Host:** Chromium 156.0.8078.4, headless, ANGLE Metal on an Apple M5 Max.
- **Isolation:** all four runs held one browser lock. From round 3 on, the lock ran under `caffeinate -i -s` with a load gate of ≤12 per run.
- **Cold transfer:** static bundle closure of the production `dist/preview` (scratch `tools/bundle-closure.mjs` and `tools/compare-bundles.mjs`).

| Round | Pair (main → head) | Cold transfer, visit JS+CSS gzip | ABBA |
| --- | --- | --- | --- |
| 1 | `2da76e1f` → `6e5abdff` | +0.13 % | **Not met.** One-client CPU p95 was +24.0 % on desktop and +18.1 % on phone. Two causes: load (B1 at a median of 35.7) and a real 2× `interactions` cost. River-oaks-91 fixed the cost in `dd682a7b`. |
| 2 | `a437cbbf` → `3cd60702` | +0.13 % | Met |
| 3 | `0b9a97c4` → `0cc09391` | +0.13 % | The first attempt is **invalid**: Mac maintenance sleep hit runs A1 and B1. The rerun was met, at load medians 4.7–5.8. Hashes: g-a1 `bc1ba01e…`, g-b1 `47fd06a1…`, g-b2 `436b2f59…`, g-a2 `75490145…`, compare `a598d488…`. |
| 4 | `e8207b2b` → `525856e2` | +0.13 % (1732.2 → 1734.4 KiB) | Met, at load medians 4.0–4.3. 0 errors, drift 0, assets 102/102. Hashes: h-a1 `78f9a7ca…`, h-b1 `355f5c0d…`, h-b2 `bcf29189…`, h-a2 `1a0b30fa…`, compare `1edf62d5…`. |

**`verify full` on #649 at `525856e2`:** run in a clean scratch checkout with an isolated Redis and Python 3.12. It **passed all 18 stages**. The receipt shows `dirty: false` (sha256 `cac380e9…`).
- agent 274/274; preview 4,180 passed, 1 skipped; server with Redis 1,189/1,189; desktop 120 passed, 3 skipped; Python 170;
- security-browser; reflections; experience 17/17; shared 27/27; IPIC screening.

Its experience profile has no Heights journey; only #649's hosted `heights` shard walks Heights.

## Reachable ground (reproduced independently at `0cc09391`; river-oaks-91 found it unchanged at `525856e2`)

`node preview/audit/world-expansion-footprint.js --reachable`:

| Revision | 1 m | 0.5 m | Ratio over Gardens at 0.5 m |
| --- | ---: | ---: | ---: |
| Gardens (baseline) | 46,549 m² | 46,477.75 m² | 1.00× |
| Commons, `east-garden-commons-market-1` | 52,130 m² | 52,030.75 m² | 1.119× |
| Bayou Heights, `bayou-heights-1` | 93,904 m² | 93,508 m² | **2.0119×** (2.0173× at 1 m) |

Composed-world sha256: Gardens `df44715b…`, Commons `b78b24dd…`, Heights `19161d41…`.

## Piece C: review findings and what was done

- **At `b1ded7ab`:** the rollback rehearsal through the real Redis gateway passed 30/30. Findings:
  1. Chain order is safe.
  2. `docs/world-expansion-activation.md` has no Heights section.
  3. `heights.commonsBounds` is the pre-Heights layout, not the Commons.
  4. A failed restore builds one extra world.

  Sent by message, because a GitHub comment on #649 was blocked by this session's permissions.
- **Round 1:** the walking-cost regression was found, and river-oaks-91 fixed it in `dd682a7b`.
- **Reachable-ground figures:** corrected. 93,906 and 93,509.75 m² do not reproduce at any committed head; river-oaks-91 corrected its ledger.
- **#670 with #649:** it made the Heights activation rehearsal time out. Each server world build re-placed the Heights stops (about 1.3 s). Fixed in `59617b59`; the rehearsal then passes 31/31.
- **Heights rollback order:** residents move after players are placed, so they keep clear of the players' final spots. Agreed with river-oaks-91.
- **Adversarial probe at `525856e2`** (the goal's "when done or blocked" list). Scratch Playwright on the repo's browser fixture with fixture identities, through the browser lock, on Metal. Players are positioned with the server `travel` command, except in the keyboard case. Script `tools/heights-adversarial.mjs` (sha256 `fd10ec8d…`).

  | Case | Result | Receipt |
  | --- | --- | --- |
  | Losing the graphics context on Heights Green | 6/6; same player, drift 0, stream ready; capture inspected | run1 `c3e35b16…` |
  | 20 unload and reload loops (by travel) | 0 stream failures, released every loop. Geometries at home rose 367 → 633 by loop 5, then stayed flat to loop 20. A District-only control plateaus too (521 → 530). The pre-registered "+5 over loop 1" check failed. | run2 `df3d0130…`, run3 `31bb2dee…` |
  | Same, first attempt | **First failure, kept:** loop 1, straight after the context restore, timed out at 90 s waiting for Heights at the green, with no diagnostics. A diagnostic rerun was requested by river-oaks-91 and is recorded below when done. | run1 |
  | Smooth quality and reduced motion at Nineteenth & Yale | 5/5 after correcting my own check (`ready()` is the footbridge entry). Neighbourhoods 9–11 m away wait for room at 9.9–14.9 MB of the 16 MiB budget, which is #649's ceiling decision. Capture inspected. | run3 |
  | Two players crossing the footbridge seam while one reconnects | All checks pass | run2 |
  | Keyboard only: Tab, then the arrow keys and W/Shift | 3/3. Tab reaches the 3D view in 18 presses. The walk goes from District arrival over the footbridge into Heights, 281 m in 57 s; capture inspected. | run4 `75af5a2d…` |
  | Not run | a client and server on different revisions in the browser (rehearsed on the server, and the client has a handler); loops on foot | — |

## Rollback

- **#655:** Commons → Gardens moves residents standing on removed land to clear District ground. Tested in `server/tests/resident-locations-rollback.test.js`.
- **#670:** `relocateResidents` is extracted, and Commons → Gardens uses it.
- **Heights → Commons:** player-only on #649. The resident wiring is prepared and rehearsed on a scratch merge (rehearsal 31/31, new tests 4/4) as `heights-rollback-wiring-server.patch` and `resident-heights-rollback.test.js.pending`. It lands on #670 after #649 is on main.
- **To roll back any of these PRs:** revert its merge commit on main. All of them are opt-in by revision and change no default revision's fingerprint.

## Complete, blocked, not started

- **Complete:**
  - pieces A, C and D for #649 at `525856e2`;
  - #655 verified on main `0b9a97c4`;
  - #670 verified, with its Heights activation fix;
  - the Heights rollback wiring, rehearsed.
- **Blocked on Val:**
  - merging #649;
  - the go to land #655;
  - #670, which waits for #649.
- **Not started:**
  - a browser check of a client and server on different revisions;
  - the unload loops on foot;
  - land for 3× (see Decisions).

## Decisions for Val

1. **Merge #649 (Bayou Heights).** Its ledger at `95904d23` records items 1–6 complete. This session's checks agree: rounds 3 and 4 met, `verify full` passed 18/18, reachable ground is 2.0119×, and the adversarial probe found no blocking defects. Merge and landing are not authorized for either session.
2. **District name and art direction.** "Bayou Heights": a clock-tower hall, a bandstand on a green, an icehouse patio, and the Lantern Footbridge from the Commons (#649). Approve it or rename it.
3. **Visual approval at pedestrian height.** #649's hosted captures and this session's inspected captures (Heights Green, Nineteenth & Yale, the Heights boulevard) are evidence only. They are not approval.
4. **Budget protocol.** Is #626's paired protocol (D11 on #643's branch) in force on main? Both readings pass for round 4.
5. **Streaming ceiling.** Heights keeps the 16 MiB retained-geometry ceiling. At Nineteenth & Yale, nearby neighbourhoods wait for room. Raise the ceiling for this location, or share the oak models (#649's ledger).
6. **Land beyond the reserve.** Heights reaches 2.01×; 3× needs 139,433.25 m². Open PRs from other sessions claim more ground: #662 Studewood, 2.46×, and #663 Bayou Terraces, 2.82×. Reaching 3× needs land beyond the current reserve or a decision among those lanes.
7. **No new activity type.** Heights reuses the table-game contract at the icehouse table; this session added none.
8. **#655:** review residents in the dev town (`http://127.0.0.1:5481/play`, fixture sign-in, Commons revision). Then give the go: merge main, re-verify, and land through `pnpm run land 655` by whoever holds landing authority.
9. **Server cost of wandering residents.** p99 per step:
   - #655 on the Commons: 8.5 → 25 ms.
   - #670 on Heights after warm-up: 3.8–5.1 → 12.7–13.7 ms.
   - The first Heights world build in a process costs about 1.3 s, once.

   Is this acceptable?
10. **The `land-pr` queued-lander test.** It times out in about half of the concurrent runs here and passes alone or serially. Does it get an owner?
11. **Nine detached scratch checkouts** of this session's. They are kept. Removing them needs `pnpm run project:prune --cancel-stale`, which needs maintainer authorization.

## Next-session prompt

> Continue `next-district-586-support-20261024` as its owner. Read `pnpm run --silent register show next-district-586-support-20261024`, this ledger, and the ledgers of #655 and #670.
> - When #649 is on main:
>   1. Merge main into `feat/resident-heights-20261025` (no rebase, no force-push).
>   2. Apply the Heights rollback wiring: the scratchpad patch, or rebuild it from #670's ledger.
>   3. Add `server/tests/resident-heights-rollback.test.js`.
>   4. Run it and the Heights activation rehearsal with an isolated Redis.
>   5. Run `verify full`, then mark #670 ready.
> - On Val's go for #655: merge current main, rerun its related suites and `verify full`, and hand it to an authorized lander.
>
> Never merge, land or deploy. Sign every commit. Use REST and `pnpm run pr:wait`.
