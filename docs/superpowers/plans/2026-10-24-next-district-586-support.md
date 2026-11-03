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
| #655 | `462928015e58b2aaf37da311767ec18d02613dee`, a merge of main `cb403ba2` | Hosted 22/22 at `46292801` on the first attempt; `verify full` there did not pass in six attempts (see "Complete, blocked, not started"). Hosted 22/22 at `2ac33123` after one rerun. `preview experience (campus)` attempt 1 failed a keyboard walk in `garden-campus-suite`, "could not walk to stranger to the T1 lift"; it passed on attempt 2, and the log and artifact are kept. Core verify passed on the first attempt at `f3f8085c`, related suites 196/196. `verify full` 18/18 was on `03381365`, before the review fixes. | Residents walk anywhere in town, the Commons included (Val's request). `f3f8085c` merges #674, river-oaks-71's fixes for an independent review. Ledger `2026-10-24-resident-locations.md`. Main `cb83c7cd` merges cleanly. |
| #670 | `cc76bca5`, a merge of main `74f12d76` (with #655, #649, #662 and #663) | Hosted 25/25 at `cc76bca5`. Core verify passed on the first attempt on each main merge (`3df540ee`, `52c43c7a`, `74f12d76`). `verify full` with an isolated Redis passed on the first attempt at `cc76bca5` (19 stages; server with Redis 1,277/1,277). Earlier: hosted 15/15 at `e5481b0f` and `760d8eda`; see #670's ledger. | Residents in Bayou Heights: Heights stops on open ground, `relocateResidents` shared by the Commons and Heights rollbacks, and the Heights → Commons resident wiring. |
| #649 (river-oaks-91) | `1c51fa3921388c1dfc074812cb8476894a33f247`; round 5 measured `ba942859708cfec355c134c90b713adb9b3ef9e0`, a merge of main `cb83c7cd` (tree `85794d04`), and the product patch is unchanged since, per its owner | Owner's record: at `1c51fa39`, 25 checks passed and 5 installer or signing jobs were skipped | The district itself. After round 5, its owner's register records item 5 (District budgets) as **not met** on `ba942859`; see Piece D. |
| #674 (river-oaks-71) | `d5666034`, merged into #655's branch as `f3f8085c` | Hosted, all green | Fixes for the independent review of #655: rollback re-plans residents walking toward removed land, crossings step past placed objects, lantern home stops come back. |

## Piece A: budget protocol

- D11 ("adopt #626") is recorded only on #643's branch (`docs/superpowers/plans/2026-10-24-mvp-release-readiness.md`). `docs/world-expansion.md` and `docs/acceptance/two-player-perf-20261023.md` on main still call #626 a proposal.
- Not confirmable here, so both readings are reported for round 4, with limits unamended.
- **Reconnect is decided on main since #672** (`cb83c7cd`): reconnect is the median of five rejoins per profile, each waiting out the client's random 500–1,000 ms retry delay (`--reconnects=5`, backoff `keep`). `docs/world-expansion.md` records that Val adopted it on 2026-10-25. Round 5 is read under it.
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
| 5 | `cb83c7cd` → `d03bb8d6`, a scratch merge of `df794f95` with `cb83c7cd`. Its tree, `85794d04`, is the same as #649's `ba942859`. | +0.13 % (1732.2 → 1734.5 KiB), receipt `compare-bundles-d03bb8d6.txt` `29fea616…` | **Not met.** Phone reconnect was +25.9 % (825.8 → 1,039.9 ms) against a +20 % limit. Every frame and CPU row was within (−3.2 % to 0.0 %); desktop reconnect −9.5 %; drift 0. Settings `keep×5` on both arms; arms started at load 8.9, 6.7, 7.5 and 6.6 with no wait (08:42–09:14Z). Hashes: r5-a1 `f8904c6c…`, r5-b1 `83c0a408…`, r5-b2 `e34a201c…`, r5-a2 `234c44b6…`, compare `3eb02f7c…`. River-oaks-91 checked it independently and agrees. |

**Round 5's phone reconnect, diagnosed (not a gate).**
- **Per-arm phone medians:** A1 762.9 and A2 888.7 ms, B1 982.3 and B2 1,097.5 ms. The two A arms are the same revision yet differ by 16 %.
- **Pooled over 10 samples a side:** phone +17.0 % (Mann-Whitney z = 2.19); desktop −9.5 % (z = −0.76).
- **Same pair, same order, skipping the random retry delay** (`--reconnect-backoff=skip --reconnects=9`, 1 × 5 s samples, 09:46–09:53Z): the rejoin itself did not change.
  - Rows: phone 239.6 → 235.3 ms (−1.8 %); desktop 310.0 → 314.6 ms (+1.5 %).
  - Pooled over 18 samples a side: phone −2.3 % (z = −1.01); desktop +1.6 % (z = −0.13).
  - Hashes: d5-a1 `68f10fcf…`, d5-b1 `19083f80…`, d5-b2 `4a570327…`, d5-a2 `d7c0b174…`, compare `c458eb5a…`.
- **Reading:** a rejoin takes about 235 ms on phone, and `keep` adds a uniform 500–1,000 ms delay, so about 70 % of each gated sample is random. River-oaks-91 found no #649 change on the rejoin path. No gated rerun was made hoping for a pass; see Decisions for Val.
- **Main then moved to `cb403ba2`** (#676: `preview/e2e/route-clearance.js`, `preview/e2e/world-streaming.js` and a new unit test; no product code). The product delta keeps patch-id `523d1862`, so round 5 and its diagnostic still describe the same product against the same main product code. On river-oaks-91's request, no new gated round runs unless Val asks.

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
  | Same, first attempt | **First failure, kept, and explained as a probe defect.** Loop 1 timed out at 90 s. The fixture town keeps a player's position between pages, and run 1's B read "home" from a page opened after A had left the player on Heights Green, so "travel home" went nowhere. River-oaks-91's diagnostic rerun, A then 5 B loops three times, reproduced exactly that in rounds 2 and 3 of its first version (`bdac3e46caab1bbc…`). For 240 s, Heights stayed `inside` and `ready` with 0 unloads, 0 failures, graphics `ok` and 60 fps. With "home" fixed to the District arrival (`805a4ac5d835eb54…`, script `6b9661d7976efc8b…`), all three rounds pass: after each context restore, every loop releases Heights at home and is ready at the green in about 1 s, with 0 failures and loads of 24–76 ms. | run1, diag |
  | Geometry plateau | District content near the arrival loading on first visits, not a leak. Pages that start on the green read 188 geometries at home after loop 1 and 570 after loop 5, identical in two rounds. After Commons visits, the Lantern Walk scene (111 meshes) stays resident at home; after Heights visits it does not. | diag |
  | Smooth quality and reduced motion at Nineteenth & Yale | 5/5 after correcting my own check (`ready()` is the footbridge entry). Neighbourhoods 9–11 m away wait for room at 9.9–14.9 MB of the 16 MiB budget, which is #649's ceiling decision. Capture inspected. | run3 |
  | Two players crossing the footbridge seam while one reconnects | All checks pass | run2 |
  | Keyboard only: Tab, then the arrow keys and W/Shift | 3/3. Tab reaches the 3D view in 18 presses. The walk goes from District arrival over the footbridge into Heights, 281 m in 57 s; capture inspected. | run4 `75af5a2d…` |
  | The server changes revision under an open page (2026-10-26, at #649 `9432e090`; script `tools/heights-revision-walk.mjs`) | Commons → Heights → Commons, restarting the loopback town on the same web port, from fresh fixture state each time. **R**, 9/9: the page reloads once into each revision and stays for 20 s; Heights Green is ready after the switch; after the rollback no Heights geometry is resident and the player is west of the footbridge; no page errors. R's reloads came from Vite's dev-server restart (the fence's key stayed null). **V**, 12/12: with Vite's dev client stubbed (env import kept, styles applied, hot updates ignored), `districtChanged` itself reloads exactly once into each revision, its key naming `bayou-heights-1` then `east-garden-commons-market-1`, in 5.3 s and 14.1 s; captures inspected. | R+F `8a602fb4…`, V `da998341…` |
  | Five District ↔ Heights loops on foot (keyboard: Market Street, the footbridge, the Heights Green entrance) | 5/5. Legs 59–66 s; Heights ready 25–31 ms after each arrival and released 14–41 ms after reaching home; 0 stream failures; geometries at home 689 after loop 1, then 693 four times; no reloads or page errors. | R+F `8a602fb4…` |
  | A page behind the town (2026-10-26, at #649 `1c51fa39`; the same script with cases O and U, `57a13be9…`) | The town stays at Heights, and every page load's `/api/world-data` answer is rewritten to an older revision. **O**, 7/7, answer `east-garden-commons-market-1`: the fence reloads exactly once; the next load's town socket closes 4000 "District revision changed"; the key names `bayou-heights-1`; the terminal "River Oaks has been improved" notice shows after 11.5 s; for 30 s after it there is no reload and no new town socket; its Refresh button loads once and closes 4000 again, with no loop; with the real answer the page joins Heights in 3.5 s with graphics `ok`; no page errors. **U**, 4/4, answer `bayou-heights-2`, as a client build from before the next revision would see: "Preview unavailable: This district revision is not supported by this client" in the loading panel, no reload in 30 s, no town socket after the error, no page errors. Observed, not asserted: that page still joined the town (`connected: true`, one socket) with chat enabled. The check and the fence's `loadedDistrict !== undefined` guard date from #507, so this is not new in #649 (Decision 13). Captures inspected. | `52fbc3d0…` |

## Rollback

- **#655:** Commons → Gardens moves residents standing on removed land to clear District ground. Tested in `server/tests/resident-locations-rollback.test.js`.
- **#655 after #674:** residents still on District ground re-plan where they stand when their route enters removed land or they head for a Commons lantern; a lantern home stop gives way to the resident's home stop.
- **#670:** `relocateResidents` is extracted, and Commons → Gardens uses it. It carries #674's fixes. Its caller names the dropped stops (`gone`), and only corridors the target lacks count as dropped land.
- **Heights → Commons:** player-only on main since #649. #670 adds the resident wiring (the patch `465a209a…` and its tests `d6681aa3…`, applied in `01db203c`). The Studewood and Terraces rollbacks to the Commons chain through it.
  - Rehearsed again on scratch `ae7d3150`, which is #649 `ba942859` + #670 `760d8eda` + the patch: 12/12 (`heights-wiring-ae7d3150.log`, `a21f9d81…`).
  - That run covered the Heights activation rehearsal, the 5 Heights rollback tests and the 6 Commons rollback tests.
  - The new Heights case re-plans a walk to the bandstand, leaves a walk into the Commons alone, and restores a Heights Hall home stop. It fails if the Heights rollback doesn't name its stops.
- **To roll back any of these PRs:** revert its merge commit on main. All of them are opt-in by revision and change no default revision's fingerprint.

## Complete, blocked, not started

- **Complete:**
  - pieces A and C for #649; piece D rounds 1–5, with round 5's reconnect diagnostic;
  - #655 verified on main `0b9a97c4`, with #674's review fixes verified at `f3f8085c` (core, related suites, hosted);
  - #655 delivered: on main as `2d63637f`; #649 on main as `3df540ee`;
  - #670 verified at `cc76bca5` (main `74f12d76` merged): core, hosted 25/25 and `verify full` with an isolated Redis, with the Heights rollback wiring and open-ground stops;
  - the Heights rollback wiring, rehearsed against #649's current head;
  - #649's revision checks: a revision switch under an open page (R, V), five loops on foot (F), and a page behind the town (O, U).
- **Handed over:** on 2026-10-26 at about 20:20Z, river-oaks-71 relayed through river-oaks-a3 that Val gave #655 its go and chose to rerun the gated ABBA for #649 (Decision 12). This session hasn't confirmed either with Val. river-oaks-71 lands #655 with its lander, then merges main into #649 and runs round 6 with this ledger's round-5 protocol. This session stopped its checks on #655 and doesn't push its branch.
- **#655 `verify full` at `46292801`** (main `cb403ba2` merged; hosted 22/22) did not pass in six attempts. None of the failures point at #655:
  - Attempts 1, 2 and 6: the experience stage was SIGKILLed at its 1,200 s limit while load rose. Every journey that finished passed, the first 16 at +12–27 % over the quiet run. Attempt 6 reached the last step of `east-garden-commons`, after all 15 earlier stages passed.
  - Attempts 3–5: `agent-tests` 273/274, the `land-pr` wake test (Decision 10). The file alone passes 29/29, and the suite run serially passes 274/274.
  - A quiet pass needs about 1,082 of the 1,200 s.
  - Logs, receipts and journey reports are in the scratchpad, as `verify-full-655-46292801-attempt{1..6}`.
- **Blocked:**
  - #670 waits for review and Val's merge decision. If main moves first, it needs another merge, core verify and hosted checks.
- **Not started:**
  - land for 3× (see Decisions).

## Decisions for Val

1. **Merge #649 (Bayou Heights).** *Answered on 2026-10-25 at about 18:50Z: Val will review and merge #649 personally.* Since then, round 5 on main `cb83c7cd` is not met on phone reconnect; see Decision 12. Its ledger at `95904d23` records items 1–6 complete. This session's checks agree: rounds 3 and 4 met, `verify full` passed 18/18, reachable ground is 2.0119×, and the adversarial probe found no blocking defects. Merge and landing are not authorized for either session.
2. **District name and art direction.** "Bayou Heights": a clock-tower hall, a bandstand on a green, an icehouse patio, and the Lantern Footbridge from the Commons (#649). Approve it or rename it.
3. **Visual approval at pedestrian height.** #649's hosted captures and this session's inspected captures (Heights Green, Nineteenth & Yale, the Heights boulevard) are evidence only. They are not approval.
4. **Budget protocol.** Is #626's paired protocol (D11 on #643's branch) in force on main? Both readings pass for round 4.
5. **Streaming ceiling.** Heights keeps the 16 MiB retained-geometry ceiling. At Nineteenth & Yale, nearby neighbourhoods wait for room. Raise the ceiling for this location, or share the oak models (#649's ledger).
6. **Land beyond the reserve.** Heights reaches 2.01×; 3× needs 139,433.25 m². Open PRs from other sessions claim more ground: #662 Studewood, 2.46×, and #663 Bayou Terraces, 2.82×. Reaching 3× needs land beyond the current reserve or a decision among those lanes.
7. **No new activity type.** Heights reuses the table-game contract at the icehouse table; this session added none.
8. **#655:** review residents in the dev town (`http://127.0.0.1:5481/play`, fixture sign-in, Commons revision). #674's review fixes are merged in, and the dev town has served them since 08:13Z on 2026-10-26. Then give the go: merge main, rerun `verify full` (it last ran before the review fixes), and land through `pnpm run land 655` by whoever holds landing authority.
9. **Server cost of wandering residents.** p99 per step:
   - #655 on the Commons: 8.5 → 25 ms.
   - #670 on Heights after warm-up: 3.8–5.1 → 12.7–13.7 ms.
   - The first Heights world build in a process costs about 1.3 s, once.

   Is this acceptable?
10. **The `land-pr` queued-lander test.** It times out in about half of the concurrent runs here and passes alone or serially. Does it get an owner?
11. **Nine detached scratch checkouts** of this session's. They are kept. Removing them needs `pnpm run project:prune --cancel-stale`, which needs maintainer authorization.

12. **Round 5's phone reconnect.** Under the adopted `keep×5` reading, phone reconnect is +25.9 % against +20 %. The skip-delay diagnostic shows the rejoin itself unchanged (−1.8 % phone, +1.5 % desktop). Choose one:
    - accept #649's budgets on the diagnostic;
    - rerun round 5 under the same protocol;
    - change how reconnect is gated, for example to skip mode or more rejoins per arm.
    Neither session has rerun it. *Relayed on 2026-10-26 by river-oaks-71: Val chose a rerun, round 6, on the main #649 lands on. river-oaks-71 runs it.*

13. **A page that can't draw its district still joins the town.** When `/api/world-data` names a revision the client doesn't know (case U), the page shows "Preview unavailable" but connects as a player, with chat enabled. The fence's check is skipped because no revision was loaded. This dates from #507, so #649 doesn't make it worse. It would matter if a stale client build ever loaded against a newer server. Should it be followed up, for example by not opening the town socket until the world has loaded?

## Next-session prompt

> Continue `next-district-586-support-20261024` as its owner. Read `pnpm run --silent register show next-district-586-support-20261024`, this ledger, and #670's ledger (`2026-10-25-resident-heights.md`).
> - #655 and #649 are on main. #670 is verified at `cc76bca5` and is ready for review.
> - If main moves before #670 lands, merge main into `feat/resident-heights-20261025` (no rebase, no force-push). Each new district so far adds its checkpoint recovery ahead of Heights' in `server/redis-room.js`, so keep the Heights record's `movedResidents`. Then rerun the resident, Heights and Redis-room suites with an isolated Redis, core verify, push, and wait for hosted checks.
>
> Never merge, land or deploy. Sign every commit. Use REST and `pnpm run pr:wait`.
