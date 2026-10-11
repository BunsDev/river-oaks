# Workplace #221: adversarial suite and operations write-up

**Status:** implemented on `test/workplace-221-adversarial`, which is stacked on `feat/workplace-slice-20261011` (PR #227) until that PR merges.
**Owner:** Claude session `river-oaks-c2` (task `workplace-221-adversarial`).
**Scope:** #221 subtask 2 (adversarial cases across real API and socket boundaries) and the kill-switch, rollback and retention part of subtask 6. Everything else in #221 belongs to `workplace-slice` or to Val. The split was agreed with `river-oaks-55` on 2026-10-11.

## Files

- `server/tests/adversarial-workplace.test.js`: new.
- `docs/workplace-operations.md`: new.
- `.env.example`: both flags, off.
- `docs/project-management/tasks.json`: register entry.

## Cases and their boundary

| #221 case | Test | Boundary |
| --- | --- | --- |
| Cross-owner reads | another account cannot read, steer or settle … | HTTP (`createGameServer`), every owner-scoped action |
| Malicious world text | hostile world text never becomes a venue … | HTTP, with hostile place ids and names (bidi, control, oversized, `javascript:`, path, markup) |
| Edited approvals | an edited approval cannot widen, extend or forge a grant … | HTTP |
| Grant revocation during work | revoking during work stops it at once … | HTTP |
| Duplicate callbacks | duplicate callbacks land once … | HTTP, concurrent requests |
| Effect completed before acknowledgment | an effect that completed before its acknowledgment … | HTTP, lost-response retry |
| Worker and gateway loss | two live gateways racing one task …; the existing gateway-replacement test in `workplace-api.test.js` | Redis, two live gateways with real timers |
| Kill switch | same Redis test | Redis, flag off then on |
| Access loss during work | a ban or an ended waitlist approval mid-task … | Redis, `security.ban` and waitlist |

## Checks

- Mutation check: I mutated the code each case guards and confirmed the case fails:
  - Gateway access check removed: the ban case fails.
  - Request-id dedupe removed: the edited-approval, duplicate and effect-before-ack cases fail.
  - Place filtering removed: the hostile-text case fails.
  - Artifact owner scoping removed: the cross-owner case fails.
- Two mutations survived, because no API path can reach those checks:
  - The step's grant-revision check: `revoke` already cancels active work in the same write.
  - Notice de-duplication: compare-and-set already stops a step from landing twice.
  - Both are defense in depth, covered at the store level by `revoking while running … a stale writer cannot commit` in `server/tests/workplace.test.js`.
- Results at the final head are in the PR.

## Measurements (#221 subtask 3)

I took these on 2026-10-11 from `test/workplace-221-adversarial`, on an Apple M3 Max running headless Chromium through ANGLE Metal, against a local isolated Redis. Other sessions had seven headless Chromium processes running at the same time. The scripts and raw JSON are in [`2026-10-11-workplace-221-measurements/`](2026-10-11-workplace-221-measurements/). Run them from the repo root:

- `node <dir>/room.mjs`, and for the long run `ENTRIES=20,100,200,500,500,500,500 node <dir>/room.mjs`
- `REDIS_URL=… node <dir>/service.mjs`, and for the outage past the lease `OUTAGE_MS=12000 TRIALS=3 REDIS_URL=… node <dir>/service.mjs`
- `node <dir>/payload.mjs <build-off> <build-on>`, after two `vite build --outDir` runs with `VITE_WORKPLACE=false` and then `true`

| Measure | Result | Limits |
| --- | --- | --- |
| Client payload | `VITE_WORKPLACE=true` adds 10,951 B raw and 3,715 B gzip, all in `main.js`, which is +0.7% of 522 KB gzip. The off build contains none of the panel's strings or `/api/workplace` references: the flag removes the panel code entirely. | When on, the panel is in the main bundle, not a lazy chunk. |
| Frame time, graybox at CAM-01 with the companion seated and working, 1280×800, vsync off | Three runs of 180 frames: p50 0.1 ms, p95 0.2–0.6 ms, 38 draw calls, 3,142 triangles | Each frame is one `render` plus `gl.finish()` on the fixture site alone, and the companion is a capsule stand-in. The p50 sits at the browser timer's 0.1 ms floor. This is not a district frame or a device budget. There is no A/B against `main`, because the room doesn't exist there. |
| Memory after repeated entry | Geometry stays at 21 through 2,320 rebuilds. JS heap after forced GC: 8.44 MB at 0 entries, 8.93 MB at 320, then 9.02 MB at 2,320, so it levels off (warm-up, not a leak). DOM nodes stay at 18 and listeners at 21. | Fixture page only. GPU memory is not measured. |
| Task completion, real service timer (`stepMs` 1500) | 5 trials: 6,032–6,069 ms (p50 6,039) from submit to completed, with no reads | Fixture adapter. |
| Recovery after gateway loss | Outage of 3 s, inside the lease: 5 of 5 completed about 3.1 s after the replacement, `attempts` 0. Outage of 12 s, past the 10 s lease: 3 of 3 completed about 3.1 s after the replacement, `attempts` 1. Every trial ended with exactly 1 draft and 1 notice. | The script reads `state` every 250 ms on the replacement gateway, so these times measure recovery **with the owner polling**. Without owner reads there is no unattended recovery: no gateway looks for unfinished tasks on startup. Single local Redis. |
| Response size | `state` 1,510 B; `artifact` 2,088 B; `occupancy` 120 B | UTF-8 bytes; one completed task and one draft. |
| Storage per owner | Owner key 6,474 B (`MEMORY USAGE`), of which the document is 5,631 B. TTL 30 days. Stations key 428 B. | One task and one draft. The cap is 3 drafts × 256 KiB. |

**Not measured:** daytime and evening routes. The fixture has one fixed light rig, and the room isn't placed in the district until Val picks a site. Mobile and lower-tier devices, GPU memory, and hosted latency weren't measured either.

## Independent evidence review

On 2026-10-11 a separate reviewer agent audited the claims against the code, the tests and the raw measurements. It ran the workplace server suites on memory and Redis, ran probe scripts, and tested the suite against code changes made in a scratch copy. **Verdict: the decision follows, with corrections.** It found no critical authority or privacy defect and no cross-account exposure.

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | A ban or waitlist removal didn't stop a paused or orphaned task or an idle grant, and they resumed after unban, because the check ran only on the timer. | **Fixed** (`54a8737`): both servers' ban route and waitlist-revoke hook call `workplace.suspend`. Regressions on memory and on the Redis gateway; each fails without its fix. |
| 2 | Expired drafts and briefs stay in storage up to about 2× retention, because every write resets the key's expiry. | **Documented** in `docs/workplace-operations.md` and **left to Val's retention decision**. Bounding it would expire the companion and grant early. |
| 3 | Recovery after gateway loss needs the owner to read; the measured 3.1 s polled every 250 ms. | **Reworded** in the table and the operations doc. Gap: no startup sweep. |
| 4 | No test pinned occupancy to `{id, occupied, mine}`; a leaked holder hash passed the suite. | **Fixed**: an exact-keys test. |
| 5 | The panel never passes a stale health value, so "Working on your plan" can stay up through a disconnect. | **Gap** for the panel owner. The claim is reworded to "derived from the last state the panel received". |
| 6 | The door header (2.4 m) is lower than the two 2.45 m `forest-aristocrat` looks. The seated radius 0.45 is assumed, not measured. Routes ignore body depth. | **Gap**: the envelope claim is limited to plan widths and turning circles at sockets. Height and seated bounds are needed before art. |
| 7 | "Accessible journey 5/5": one report on disk, mostly mouse clicks, one focus assertion, no automated accessibility audit. | **Reworded** to "functional journey passed, keyboard used for the brief and opening the draft". Human screen-reader and touch review remain open. |
| 8 | Operations-doc citations overstated the kill-switch tests. Rolling deploy and the TTL running while off weren't stated, and some limits are untested. | **Fixed** in the doc: *(code)* markers, rolling-deploy note, TTL note. Mid-flight kill switch recorded as untested. |
| 9 | The slice ledger says either flag is a kill switch; only the server flag is. | Sent to `river-oaks-55`, which owns that file. |
| 10 | Owners can't delete cancelled or failed briefs. After a draft is deleted, replaying its request id creates a new task, and the panel makes a new id per submit anyway. | **Gaps**, recorded in the operations doc. The retry test's premise is client id reuse. |
| 11 | No test asserted a 429, and the body-cap test passed through validation alone. | **Fixed**: write and read budget tests, and a whitespace-padded valid body over 4 KiB. |
| 12 | Two measurement variants couldn't be reproduced by the committed scripts. Timer floor, capsule stand-in, string-length sizes. | **Fixed**: `ENTRIES`, `TRIALS` and `OUTAGE_MS` settings, UTF-8 byte sizes, and the limits stated in the table. |
| 13 | Notes: stations shared across worlds; `sha256(userId)` key names are only pseudonymous; a revision restarts at 0 after a Redis key expires. Confirmed sound: the Lua compare-and-set (removing it fails 2 tests) and the exact-match Vercel allowlist. | Recorded. |

## Gaps

- No live WorkOS, hosted Redis, or multi-region run.
- The WebSocket path is not exercised: the workplace exposes no socket actions, and occupancy is read over HTTP.
- No single erase-everything action per owner (recorded in the operations doc).

## Next step

Open the PR against `feat/workplace-slice-20261011`. Once #227 merges, rebase onto `main`, retarget, pass hosted CI and deliver.
